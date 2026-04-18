// src/services/ChildMonitorService.js
// Background service running on child device

import { NativeModules, Alert, AppState } from 'react-native';
import BackgroundFetch from 'react-native-background-fetch';
import Geolocation from '@react-native-community/geolocation';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import axios from 'axios';

const { UsageStats } = NativeModules;
const API_URL = 'https://your-backend-url.railway.app'; // Railway URL टाका

class ChildMonitorService {
  constructor() {
    this.childId = null;
    this.appRules = {};
    this.locationInterval = null;
    this.commandPollInterval = null;
  }

  // ── Initialize service ──
  async init() {
    this.childId = auth().currentUser?.uid;
    if (!this.childId) return;

    await this.loadAppRules();
    this.listenForRules();
    this.listenForCommands();
    this.startLocationTracking();
    this.startUsageReporting();
    this.setupBackgroundFetch();

    console.log('🛡️ KidShield monitoring started');
  }

  // ── Load app rules from Firestore ──
  async loadAppRules() {
    const snap = await firestore()
      .collection('appRules')
      .where('childId', '==', this.childId)
      .get();

    this.appRules = {};
    snap.docs.forEach(d => {
      this.appRules[d.data().packageName] = d.data();
    });
  }

  // ── Listen for rule changes in real-time ──
  listenForRules() {
    firestore()
      .collection('appRules')
      .where('childId', '==', this.childId)
      .onSnapshot(snap => {
        this.appRules = {};
        snap.docs.forEach(d => {
          this.appRules[d.data().packageName] = d.data();
        });
        console.log('Rules updated:', Object.keys(this.appRules).length);
      });
  }

  // ── Listen for commands from parent ──
  listenForCommands() {
    firestore()
      .collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(d => {
          this.executeCommand(d.id, d.data());
        });
      });
  }

  // ── Execute parent commands ──
  async executeCommand(commandId, commandData) {
    const { command } = commandData;
    console.log('Executing command:', command);

    switch (command) {
      case 'LOCK_DEVICE':
        // Show full-screen lock overlay
        Alert.alert(
          '🔒 Phone Locked',
          'Parent ने phone lock केला आहे.',
          [], { cancelable: false }
        );
        break;

      case 'BEDTIME_MODE':
        Alert.alert('🌙 Bedtime Mode', 'झोपायची वेळ झाली! Good night!', [], { cancelable: false });
        break;

      case 'SCAN_APPS':
        await this.scanAndReportApps();
        break;

      case 'UPDATE_RULES':
        await this.loadAppRules();
        break;

      case 'BLOCK_ALL':
        // Implement full block
        break;

      case 'LOCATION_PING':
        await this.reportLocation();
        break;
    }

    // Mark command as executed
    await firestore().collection('commands').doc(commandId).update({ status: 'executed' });
  }

  // ── Location Tracking ──
  startLocationTracking() {
    // Report location every 5 minutes
    this.locationInterval = setInterval(() => {
      this.reportLocation();
    }, 5 * 60 * 1000);

    // Also report immediately
    this.reportLocation();
  }

  async reportLocation() {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          try {
            const token = await auth().currentUser?.getIdToken();
            await axios.post(`${API_URL}/api/location/update`, {
              latitude, longitude, accuracy,
            }, { headers: { Authorization: `Bearer ${token}` } });
          } catch (e) {
            console.error('Location report failed:', e.message);
          }
          resolve();
        },
        (error) => {
          console.error('Location error:', error);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // ── Usage Reporting ──
  startUsageReporting() {
    // Report usage every 15 minutes
    setInterval(async () => {
      await this.reportUsage();
    }, 15 * 60 * 1000);
  }

  async reportUsage() {
    try {
      const hasPermission = await UsageStats.hasUsagePermission();
      if (!hasPermission) {
        console.log('No usage stats permission');
        return;
      }

      const usageData = await UsageStats.getTodayUsage();
      const token = await auth().currentUser?.getIdToken();

      await axios.post(`${API_URL}/api/usage/report`, {
        date: usageData.date,
        apps: usageData.apps,
        totalMinutes: usageData.totalMinutes,
      }, { headers: { Authorization: `Bearer ${token}` } });

      // Check local rules
      this.enforceLocalRules(usageData.apps);

    } catch (e) {
      console.error('Usage report failed:', e.message);
    }
  }

  // ── Enforce app time limits locally ──
  enforceLocalRules(apps) {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const app of apps) {
      const rule = this.appRules[app.packageName];
      if (!rule) continue;

      // Check if blocked
      if (rule.isBlocked) {
        this.showBlockOverlay(app.appName, 'इस app को parent ने block केला आहे.');
        continue;
      }

      // Check time schedule
      if (rule.blockFrom && rule.blockUntil) {
        if (this.isTimeInRange(currentTime, rule.blockFrom, rule.blockUntil)) {
          this.showBlockOverlay(app.appName, `हा app ${rule.blockFrom} - ${rule.blockUntil} या वेळात बंद आहे.`);
        }
      }

      // Check daily limit
      if (rule.dailyLimitMinutes && app.minutesUsed >= rule.dailyLimitMinutes) {
        this.showBlockOverlay(app.appName, `${rule.dailyLimitMinutes} minutes चा daily limit संपला.`);
      }
    }
  }

  isTimeInRange(current, start, end) {
    if (start <= end) return current >= start && current <= end;
    return current >= start || current <= end; // Overnight range
  }

  showBlockOverlay(appName, reason) {
    Alert.alert(`🚫 ${appName} Blocked`, reason, [{ text: 'OK' }]);
  }

  // ── Scan installed apps ──
  async scanAndReportApps() {
    try {
      const apps = await UsageStats.getInstalledApps();
      const token = await auth().currentUser?.getIdToken();
      await axios.post(`${API_URL}/api/apps/installed`, { apps }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.error('App scan failed:', e.message);
    }
  }

  // ── Background Fetch ──
  setupBackgroundFetch() {
    BackgroundFetch.configure({
      minimumFetchInterval: 15, // minutes
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
    }, async (taskId) => {
      await this.reportUsage();
      await this.reportLocation();
      BackgroundFetch.finish(taskId);
    });
  }

  // ── Stop service ──
  stop() {
    if (this.locationInterval) clearInterval(this.locationInterval);
    if (this.commandPollInterval) clearInterval(this.commandPollInterval);
    BackgroundFetch.stop();
  }
}

export default new ChildMonitorService();
