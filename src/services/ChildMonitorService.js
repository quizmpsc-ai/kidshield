import { NativeModules, AppState } from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import Geolocation from '@react-native-community/geolocation';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import axios from 'axios';
import RemoteCommandHandler from './RemoteCommandHandler';

const { UsageStats } = NativeModules;
const API_URL = 'https://kidshield-0757.onrender.com';

class ChildMonitorService {
  constructor() {
    this.childId = null;
    this.parentId = null;
    this.childDocId = null;
    this.appRules = {};
    this.locationInterval = null;
  }

  async init() {
    this.childId = auth().currentUser?.uid;
    if (!this.childId) return;

    // Get parentId from users collection
    try {
      const userDoc = await firestore().collection('users').doc(this.childId).get();
            this.parentId = userDoc.data()?.parentId;
      let correctChildId = userDoc.data()?.childId || this.childId;
      if (this.parentId) {
          try {
              const childSnap = await firestore().collection('families').doc(this.parentId).collection('children').limit(1).get();
              if (!childSnap.empty) correctChildId = childSnap.docs[0].id;
          } catch(e) {}
      }
      this.childDocId = correctChildId;
    console.log('ChildMonitor init: UID=', this.childId, ' DocID=', this.childDocId);
    } catch (e) {}

    await this.loadAppRules();
    this.listenForCommands();
    RemoteCommandHandler.init(); // Ã°Å¸â€Â¥ FORCED INIT Ã°Å¸â€Â¥
    this.startLocationTracking();
    this.startUsageReporting();
    this.setupBackgroundFetch();
    this.updateOnlineStatus(true);

    console.log('KidShield monitoring started');
  }

  async updateOnlineStatus(online) {
    if (!this.parentId || !this.childDocId) return;
    try {
      await firestore()
        .collection('families').doc(this.parentId)
        .collection('children').doc(this.childDocId)
        .set({ deviceOnline: online, lastSeen: firestore.FieldValue.serverTimestamp() });
    } catch (e) {}
  }

  async loadAppRules() {
    try {
      const snap = await firestore().collection('appRules')
        .where('childId', '==', (this.childDocId || this.childId)).get();
      this.appRules = {};
      snap.docs.forEach(d => { this.appRules[d.data().packageName] = d.data(); });
    } catch (e) {}
  }

  listenForCommands() {
    // Listen on families collection (web admin sends commands here)
    if (this.parentId && this.childDocId) {
      firestore()
        .collection('families').doc(this.parentId)
        .collection('children').doc(this.childDocId)
        .onSnapshot(doc => {
          const data = doc.data() || {};
          const cmd = data.liveCommand;
          if (cmd && cmd !== 'stop' && cmd !== this.lastCommand) {
            this.lastCommand = cmd;
            this.handleLiveCommand(cmd, data);
          }
        });
    }

    // (Commands listener removed to prevent race condition with RemoteCommandHandler)
  }

  async handleLiveCommand(command, data) {
    const { RemoteCamera, AmbientAudio, ScreenMirror } = require('react-native').NativeModules;
    try {
      if (command === 'screen' && ScreenMirror) {
        await ScreenMirror.takeScreenshot('live');
      } else if (command === 'camera' && RemoteCamera) {
        await RemoteCamera.takeFrontSnapshot('live');
      } else if (command === 'audio' && AmbientAudio) {
        await AmbientAudio.startAmbientCapture('live');
      }
    } catch (e) {
      console.log('Live command failed:', e.message);
    }
  }

  

  startLocationTracking() {
    this.reportLocation();
    this.locationInterval = setInterval(() => this.reportLocation(), 5 * 60 * 1000);
  }

  async reportLocation() {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Save to locations collection
            await firestore().collection('locations').doc(this.childId).set({
              lat: latitude, lng: longitude,
              updatedAt: firestore.FieldValue.serverTimestamp(),
            });

            // Save to families collection (web admin reads from here)
            if (this.parentId && this.childDocId) {
              await firestore()
                .collection('families').doc(this.parentId)
                .collection('children').doc(this.childDocId)
                .set({
                  location: { lat: latitude, lng: longitude },
                  locationName: latitude.toFixed(4) + ', ' + longitude.toFixed(4),
                  locationUpdatedAt: firestore.FieldValue.serverTimestamp(),
                });
            }

            // Also send to backend
            await axios.post(API_URL + '/api/location/update', {
              childId: this.childId,
              parentId: this.parentId,
              latitude, longitude,
            }).catch(() => {});
          } catch (e) {}
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  startUsageReporting() {
    // Run immediately on start
    this.syncRealDeviceData();
    
    // Sync every 60 seconds
    setInterval(() => {
      this.syncRealDeviceData();
    }, 60 * 1000);
  }

    async reportSystemError(errorType, message) {
    if (!this.parentId || !this.childDocId) return;
    try {
      await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId).collection('alerts').add({
        type: 'system_error',
        message: `[${errorType}] ${message}`,
        timestamp: firestore.FieldValue.serverTimestamp()
      });
    } catch(e) {}
  }

  async syncRealDeviceData() {
    if (!this.parentId || !this.childDocId) return;
    const { UsageStats, BatteryModule, KidShieldModule } = NativeModules;

    // 1. SCREEN TIME SYNC
    try {
      const hasPermission = await UsageStats?.hasUsagePermission();
      if (hasPermission) {
        const usageData = await UsageStats.getTodayUsage();
        await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId)
          .update({
            todayMinutes: usageData.totalMinutes || 0,
            lastSync: firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
      }
    } catch(e) { this.reportSystemError("Usage Stats", e.message); }

    // 2. REAL BATTERY SYNC
    try {
      let batteryLevel = 100;
      if (BatteryModule && BatteryModule.getBatteryLevel) {
        const levelStr = await BatteryModule.getBatteryLevel();
        batteryLevel = parseInt(levelStr) || 100;
      }
      await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId)
        .update({
          battery: batteryLevel,
          deviceOnline: true,
          lastSeen: firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch(e) { this.reportSystemError("Battery Sync", e.message); }

    // 3. REAL INSTALLED APPS SYNC
    try {
      if (KidShieldModule && KidShieldModule.getInstalledApps) {
        const realApps = await KidShieldModule.getInstalledApps();
        const batch = firestore().batch();
        const appsRef = firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId).collection('installed_apps');
        
        realApps.forEach(app => {
          const appData = {
            id: app.packageName,
            appName: app.appName,
            packageName: app.packageName,
            updatedAt: firestore.FieldValue.serverTimestamp()
          };
          // { merge: true } keeps existing "blocked" status intact
          batch.set(appsRef.doc(app.packageName), appData, { merge: true });
        });
        await batch.commit();
      }
    } catch(e) { this.reportSystemError("App Sync", e.message); }
  }

  setupBackgroundFetch() {
    try {
      BackgroundFetch.configure({
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
      }, async (taskId) => {
        await this.reportLocation();
        BackgroundFetch.finish(taskId);
      });
    } catch (e) {}
  }

  stop() {
    if (this.locationInterval) clearInterval(this.locationInterval);
    this.updateOnlineStatus(false);
    try { BackgroundFetch.stop(); } catch (e) {}
  }
}

export default new ChildMonitorService();
