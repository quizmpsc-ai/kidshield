import { NativeModules, AppState } from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import Geolocation from '@react-native-community/geolocation';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import axios from 'axios';

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
      this.childDocId = userDoc.data()?.childId || this.childId;
    } catch (e) {}

    await this.loadAppRules();
    this.listenForCommands();
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
        .update({ deviceOnline: online, lastSeen: firestore.FieldValue.serverTimestamp() });
    } catch (e) {}
  }

  async loadAppRules() {
    try {
      const snap = await firestore().collection('appRules')
        .where('childId', '==', this.childId).get();
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

    // Also listen on commands collection
    firestore().collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(d => this.executeCommand(d.id, d.data()));
      });
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

  async executeCommand(commandId, commandData) {
    const { command } = commandData;
    await firestore().collection('commands').doc(commandId)
      .update({ status: 'executed', executedAt: firestore.FieldValue.serverTimestamp() })
      .catch(() => {});
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
                .update({
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
    setInterval(async () => {
      try {
        const hasPermission = await UsageStats?.hasUsagePermission();
        if (!hasPermission) return;
        const usageData = await UsageStats.getTodayUsage();
        if (this.parentId && this.childDocId) {
          await firestore()
            .collection('families').doc(this.parentId)
            .collection('children').doc(this.childDocId)
            .update({
              todayMinutes: usageData.totalMinutes || 0,
              lastSync: firestore.FieldValue.serverTimestamp(),
            });
        }
      } catch (e) {}
    }, 15 * 60 * 1000);
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
