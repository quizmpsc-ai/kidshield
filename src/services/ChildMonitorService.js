import { NativeModules, AppState } from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import Geolocation from '@react-native-community/geolocation';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import axios from 'axios';
import RemoteCommandHandler from './RemoteCommandHandler';

const { UsageStats, BatteryModule, KidShieldModule } = NativeModules;
const API_URL = 'https://kidshield-0757.onrender.com';

class ChildMonitorService {
  constructor() {
    this.childId = null;
    this.parentId = null;
    this.childDocId = null;
    this.locationWatcher = null;
  }

  async init() {
    this.childId = auth().currentUser?.uid;
    if (!this.childId) return;

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
    } catch (e) {}

    RemoteCommandHandler.init();
    this.startLocationTracking();
    this.startUsageReporting();
    this.setupBackgroundFetch();
    this.updateOnlineStatus(true);
    console.log('KidShield monitoring started (Stable Version)');
  }

  async updateOnlineStatus(online) {
    if (!this.parentId || !this.childDocId) return;
    try {
      await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId)
        .set({ deviceOnline: online, lastSeen: firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {}
  }

  startLocationTracking() {
    this.reportLocation(); 
    if (this.locationWatcher !== null) Geolocation.clearWatch(this.locationWatcher);

    this.locationWatcher = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.saveLocationToFirebase(latitude, longitude);
      },
      (error) => { if(error.code === 2) this.reportLocationViaNetwork(); },
      { enableHighAccuracy: true, distanceFilter: 10, interval: 10000, fastestInterval: 5000 }
    );
  }

  async reportLocation() {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.saveLocationToFirebase(latitude, longitude);
      },
      (error) => { if (error.code === 2) this.reportLocationViaNetwork(); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );
  }

  async reportLocationViaNetwork() {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.saveLocationToFirebase(latitude, longitude);
      },
      (error) => console.log('Network Location Error:', error.message),
      { enableHighAccuracy: false, timeout: 15000 }
    );
  }

  async saveLocationToFirebase(latitude, longitude) {
    if (!this.parentId || !this.childDocId) return;
    try {
      await firestore().collection('locations').doc(this.childId).set({
        lat: latitude, lng: longitude, updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId).update({
          location: { lat: latitude, lng: longitude },
          locationName: latitude.toFixed(5) + ', ' + longitude.toFixed(5),
          locationUpdatedAt: firestore.FieldValue.serverTimestamp(),
      });
      await axios.post(API_URL + '/api/location/update', { childId: this.childId, parentId: this.parentId, latitude, longitude }).catch(() => {});
    } catch (e) {}
  }

  startUsageReporting() {
    this.syncRealDeviceData();
    setInterval(() => this.syncRealDeviceData(), 60 * 1000);
  }

  async syncRealDeviceData() {
    if (!this.parentId || !this.childDocId) return;
    try {
      const hasPermission = await UsageStats?.hasUsagePermission();
      if (hasPermission) {
        const usageData = await UsageStats.getTodayUsage();
        await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId)
          .update({ todayMinutes: usageData.totalMinutes || 0, lastSync: firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    } catch(e) {}

    try {
      let batteryLevel = 100;
      if (BatteryModule && BatteryModule.getBatteryLevel) {
        batteryLevel = parseInt(await BatteryModule.getBatteryLevel()) || 100;
      }
      await firestore().collection('families').doc(this.parentId).collection('children').doc(this.childDocId)
        .update({ battery: batteryLevel, deviceOnline: true, lastSeen: firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch(e) {}
  }

  setupBackgroundFetch() {
    try {
      BackgroundFetch.configure({ minimumFetchInterval: 15, stopOnTerminate: false, startOnBoot: true, enableHeadless: true }, async (taskId) => {
        await this.reportLocation();
        BackgroundFetch.finish(taskId);
      });
    } catch (e) {}
  }

  stop() {
    if (this.locationWatcher !== null) Geolocation.clearWatch(this.locationWatcher);
    this.updateOnlineStatus(false);
    try { BackgroundFetch.stop(); } catch (e) {}
  }
}

export default new ChildMonitorService();