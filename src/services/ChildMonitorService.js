// src/services/ChildMonitorService.js
// ✅ ALL BUGS FIXED

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
    this.childId = null;      // actual Firebase UID (users collection document ID)
    this.parentId = null;
    this.childDocId = null;   // "child_XXXXX" (families/commands collection document ID)
    this.locationWatcher = null;
  }

  async init() {
    const user = auth().currentUser;
    if (!user) return;

    this.childId = user.uid; // actual Firebase UID

    try {
      const userDoc = await firestore().collection('users').doc(this.childId).get();
      const data = userDoc.data();

      this.parentId = data?.parentId || null;

      // ✅ BUG FIX (CRITICAL): childDocId correct set kara
      //
      // PROBLEM (Old code):
      //   families collection madhe child document "child_XXXXX" ID ne aahe
      //   pan code `families/{parentId}/children` limit(1) get karto jyacha
      //   result unreliable aahe (multiple children aslyas wrong doc milel)
      //
      // SOLUTION:
      //   users/{uid}.childId field madhe "child_XXXXX" already aahe!
      //   Tyacha sidha use kara - reliable ani exact match.
      this.childDocId = data?.childId || this.childId;

      console.log('ChildMonitor init:', {
        uid: this.childId,
        childDocId: this.childDocId,   // "child_XXXXX"
        parentId: this.parentId,
      });

      // ✅ BUG FIX: families document exist nahi (Image 4 madhye distate)
      // "This document does not exist" - families/{parentId} document navhata
      // Aapan setDoc with merge karto je document create karil jar navhata tar
      if (this.parentId && this.childDocId) {
        await this._ensureFamiliesDocExists();
      }

    } catch (e) {
      console.log('ChildMonitor init error:', e.message);
    }

    // RemoteCommandHandler init (childId set jhale nantar)
    RemoteCommandHandler.init();

    this.startLocationTracking();
    this.startUsageReporting();
    this.setupBackgroundFetch();
    this.updateOnlineStatus(true);

    console.log('✅ KidShield monitoring started');
  }

  // ✅ NEW: families document ensure kara (exist navhata tar create kara)
  async _ensureFamiliesDocExists() {
    try {
      const childRef = firestore()
        .collection('families').doc(this.parentId)
        .collection('children').doc(this.childDocId);

      const childDoc = await childRef.get();
      if (!childDoc.exists) {
        // Document navhata - create kara
        await childRef.set({
          childId: this.childDocId,
          deviceOnline: true,
          paired: true,
          createdAt: firestore.FieldValue.serverTimestamp(),
          lastSeen: firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log('✅ Families child document created:', this.childDocId);
      }
    } catch (e) {
      console.log('families doc create error:', e.message);
    }
  }

  async updateOnlineStatus(online) {
    if (!this.parentId || !this.childDocId) return;
    try {
      // ✅ set with merge: document navhata tar create hoil, asel tar update hoil
      await firestore()
        .collection('families').doc(this.parentId)
        .collection('children').doc(this.childDocId)
        .set(
          { deviceOnline: online, lastSeen: firestore.FieldValue.serverTimestamp() },
          { merge: true }  // ← CRITICAL: update fails "document does not exist" bug fix
        );
    } catch (e) {
      console.log('updateOnlineStatus error:', e.message);
    }
  }

  startLocationTracking() {
    this.reportLocation();
    if (this.locationWatcher !== null) Geolocation.clearWatch(this.locationWatcher);

    this.locationWatcher = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.saveLocationToFirebase(latitude, longitude);
      },
      (error) => {
        if (error.code === 2) this.reportLocationViaNetwork();
      },
      { enableHighAccuracy: true, distanceFilter: 10, interval: 10000, fastestInterval: 5000 }
    );
  }

  async reportLocation() {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        this.saveLocationToFirebase(latitude, longitude);
      },
      (error) => {
        if (error.code === 2) this.reportLocationViaNetwork();
      },
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
    if (!this.childId) return;
    try {
      // locations collection update (always - parentId navhata tari)
      await firestore().collection('locations').doc(this.childId).set({
        lat: latitude,
        lng: longitude,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // families collection update (jar parent linked asel tar)
      if (this.parentId && this.childDocId) {
        await firestore()
          .collection('families').doc(this.parentId)
          .collection('children').doc(this.childDocId)
          .set({
            location: { lat: latitude, lng: longitude },
            locationName: latitude.toFixed(5) + ', ' + longitude.toFixed(5),
            locationUpdatedAt: firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
      }

      // Backend API update
      await axios.post(API_URL + '/api/location/update', {
        childId: this.childId,
        parentId: this.parentId,
        latitude, longitude,
      }).catch(() => {});

    } catch (e) {
      console.log('saveLocation error:', e.message);
    }
  }

  startUsageReporting() {
    this.syncRealDeviceData();
    setInterval(() => this.syncRealDeviceData(), 60 * 1000);
  }

  async syncRealDeviceData() {
    if (!this.parentId || !this.childDocId) return;

    // 1. Screen Time sync
    try {
      const hasPermission = await UsageStats?.hasUsagePermission();
      if (hasPermission) {
        const usageData = await UsageStats.getTodayUsage();
        await firestore()
          .collection('families').doc(this.parentId)
          .collection('children').doc(this.childDocId)
          .set(
            { todayMinutes: usageData.totalMinutes || 0, lastSync: firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
      }
    } catch(e) {}

    // 2. Battery sync
    try {
      let batteryLevel = 100;
      if (BatteryModule?.getBatteryLevel) {
        batteryLevel = parseInt(await BatteryModule.getBatteryLevel()) || 100;
      }
      await firestore()
        .collection('families').doc(this.parentId)
        .collection('children').doc(this.childDocId)
        .set(
          {
            battery: batteryLevel,
            deviceOnline: true,
            lastSeen: firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
    } catch(e) {}
  }

  setupBackgroundFetch() {
    try {
      BackgroundFetch.configure(
        {
          minimumFetchInterval: 15,
          stopOnTerminate: false,
          startOnBoot: true,
          enableHeadless: true,
        },
        async (taskId) => {
          await this.reportLocation();
          BackgroundFetch.finish(taskId);
        }
      );
    } catch (e) {}
  }

  stop() {
    if (this.locationWatcher !== null) Geolocation.clearWatch(this.locationWatcher);
    this.updateOnlineStatus(false);
    try { BackgroundFetch.stop(); } catch (e) {}
  }
}

export default new ChildMonitorService();
