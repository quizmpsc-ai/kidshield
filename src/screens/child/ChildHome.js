import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Animated, Vibration, NativeModules,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';

const API_URL = 'https://kidshield-0757.onrender.com';
const { BatteryModule, AppHider, UsageStats } = NativeModules;

export default function ChildHome({ navigation }) {
  const [screenTime, setScreenTime] = useState(0);
  const [limit, setLimit] = useState(120);
  const [childName, setChildName] = useState('Child');
  const [parentId, setParentId] = useState(null);
  const [childDocId, setChildDocId] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [location, setLocation] = useState(null);
  const [battery, setBattery] = useState(null);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const sosAnim = useRef(new Animated.Value(1)).current;
  const screenTimeRef = useRef(0);
  const blockedRef = useRef(0);

  useEffect(() => {
    loadChildData();
    startLocationTracking();
    startBatteryTracking();
    startScreenTimeTracking();
  }, []);

  // â”€â”€ Child data load à¤•à¤°à¤¾ â”€â”€
  const loadChildData = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const doc = await firestore().collection('users').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
                setChildName(data.name || 'Child');
        setParentId(data.parentId || null);
        let correctId = data.childId;
        if (data.parentId) {
            try {
                const snap = await firestore().collection('families').doc(data.parentId).collection('children').limit(1).get();
                if (!snap.empty) correctId = snap.docs[0].id;
            } catch(e){}
        }
        setChildDocId(correctId || null);
        setLimit(data.screenTimeLimit || 120);
        screenTimeRef.current = data.screenTime || 0;
        setScreenTime(data.screenTime || 0);

        // Admin check
        if (AppHider) {
          const isAdmin = await AppHider.isDeviceAdminActive();
          setAdminEnabled(isAdmin);
        }
      }
    } catch (e) { console.error('Load error:', e); }
  };

  // â”€â”€ Battery tracking â”€â”€
  const startBatteryTracking = async () => {
    const updateBattery = async () => {
      try {
        if (BatteryModule) {
          const level = await BatteryModule.getBatteryLevel();
          setBattery(level);
          return level;
        }
      } catch (e) {}
      return null;
    };

    // Immediately fetch
    const level = await updateBattery();

    // à¤¹à¤° 5 minutes update à¤•à¤°à¤¾
    setInterval(updateBattery, 5 * 60 * 1000);
    return level;
  };

  // â”€â”€ Screen time tracking â”€â”€
  const startScreenTimeTracking = () => {
    const interval = setInterval(async () => {
      screenTimeRef.current += 1;
      setScreenTime(screenTimeRef.current);

      // à¤¹à¤° 5 minutes Firebase à¤²à¤¾ push à¤•à¤°à¤¾
      if (screenTimeRef.current % 5 === 0) {
        await pushDataToFirebase();
      }
    }, 60000); // 1 minute

    // à¤ªà¤¹à¤¿à¤²à¥à¤¯à¤¾à¤‚à¤¦à¤¾ 30 seconds à¤¨à¤‚à¤¤à¤° push à¤•à¤°à¤¾
    setTimeout(() => pushDataToFirebase(), 30000);

    return () => clearInterval(interval);
  };

  // â”€â”€ à¤¸à¤—à¤³à¤¾ data Firebase families collection à¤®à¤§à¥à¤¯à¥‡ push à¤•à¤°à¤¾ â”€â”€
  const pushDataToFirebase = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid || !parentId) return;

      // Battery get à¤•à¤°à¤¾
      let batteryLevel = battery;
      if (BatteryModule && batteryLevel === null) {
        batteryLevel = await BatteryModule.getBatteryLevel();
        setBattery(batteryLevel);
      }

      // Usage stats (if available)
      let usageApps = [];
      try {
        if (UsageStats) {
          const hasPerms = await UsageStats.hasUsagePermission();
          if (hasPerms) {
            const usage = await UsageStats.getTodayUsage();
            usageApps = usage.apps || [];
          }
        }
      } catch (e) {}

      const now = new Date();
      const updateData = {
        // Screen time
        screenTime: screenTimeRef.current,
        screenTimeMinutes: screenTimeRef.current,

        // Battery â€” real device data
        battery: batteryLevel !== null ? batteryLevel : null,
        batteryLevel: batteryLevel !== null ? batteryLevel : null,

        // Blocked attempts
        blockedAttempts: blockedRef.current,

        // Status
        isOnline: true,
        lastSeen: firestore.FieldValue.serverTimestamp(),
        lastUpdated: firestore.FieldValue.serverTimestamp(),

        // App usage
        appsUsed: usageApps.length,
        topApps: usageApps.slice(0, 5),
      };

      // 1. families/{parentId}/children/{childDocId} update à¤•à¤°à¤¾ (Web Admin à¤¸à¤¾à¤ à¥€)
      if (childDocId) {
        await firestore()
          .collection('families')
          .doc(parentId)
          .collection('children')
          .doc(childDocId)
          .set(updateData, { merge: true });
      }

      // 2. users/{uid} à¤ªà¤£ update à¤•à¤°à¤¾ (Android app à¤¸à¤¾à¤ à¥€)
      await firestore().collection('users').doc(uid).update({
        screenTime: screenTimeRef.current,
        battery: batteryLevel,
        isOnline: true,
        lastActive: firestore.FieldValue.serverTimestamp(),
      });

      console.log('Data pushed:', { screenTime: screenTimeRef.current, battery: batteryLevel });

    } catch (e) {
      console.error('Push error:', e);
    }
  };

  // â”€â”€ Location tracking â”€â”€
  const startLocationTracking = () => {
    Geolocation.requestAuthorization();
    Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocation({ latitude, longitude, accuracy });
        sendLocationToFirebase(latitude, longitude, accuracy);
      },
      (err) => console.log('GPS error:', err),
      { enableHighAccuracy: false, distanceFilter: 50, interval: 120000 }
    );

    // Initial position
    Geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocation({ latitude, longitude, accuracy });
        sendLocationToFirebase(latitude, longitude, accuracy);
      },
      (err) => console.log('Initial GPS error:', err),
      { enableHighAccuracy: false, timeout: 15000 }
    );
  };

  const sendLocationToFirebase = async (lat, lng, accuracy) => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid || !parentId) return;

      // Reverse geocoding (simple)
      let locationName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'User-Agent': 'KidShield/1.0' } }
        );
        const data = await resp.json();
        if (data?.display_name) {
          const parts = data.display_name.split(',');
          locationName = parts.slice(0, 3).join(',').trim();
        }
      } catch (e) {}

      const locationData = {
        location: { lat, lng, accuracy },
        locationName,
        locationUpdatedAt: firestore.FieldValue.serverTimestamp(),
        lat, lng, // backward compat
      };

      // 1. families collection update (Web Admin)
      if (childDocId) {
        await firestore()
          .collection('families').doc(parentId)
          .collection('children').doc(childDocId)
          .set(locationData, { merge: true });
      }

      // 2. locations collection (separate real-time tracking)
      await firestore().collection('locations').doc(uid).set({
        lat, lng, accuracy, childId: uid, parentId,
        locationName,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

    } catch (e) { console.error('Location error:', e); }
  };

  // â”€â”€ SOS â”€â”€
  const handleSOSPress = () => {
    Vibration.vibrate([0, 200, 100, 200]);
    Animated.sequence([
      Animated.timing(sosAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
      Animated.timing(sosAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    Alert.alert('SOS Alert', 'Send emergency alert to parent?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: sendSOS },
    ]);
  };

  const sendSOS = async () => {
    try {
      setSosActive(true);
      const uid = auth().currentUser?.uid;

      // Location à¤ªà¤£ include à¤•à¤°à¤¾
      if (location) {
        await sendLocationToFirebase(location.latitude, location.longitude, location.accuracy);
      }

      // Alert firestore à¤®à¤§à¥à¤¯à¥‡
      await firestore().collection('alerts').add({
        childId: uid,
        childName,
        parentId,
        title: 'SOS Alert!',
        body: `${childName} needs help!`,
        message: `${childName} needs help!`,
        type: 'SOS',
        severity: 'high',
        read: false,
        timestamp: firestore.FieldValue.serverTimestamp(),
        createdAt: firestore.FieldValue.serverTimestamp(),
        location: location ? { lat: location.latitude, lng: location.longitude } : null,
      });

      // families à¤®à¤§à¥à¤¯à¥‡ recent activity add à¤•à¤°à¤¾
      if (childDocId && parentId) {
        await firestore()
          .collection('families').doc(parentId)
          .collection('children').doc(childDocId)
          .collection('activity').add({
            type: 'SOS',
            description: 'SOS button pressed',
            timestamp: firestore.FieldValue.serverTimestamp(),
          });
      }

      // Backend notify à¤•à¤°à¤¾
      try {
        await fetch(`${API_URL}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId,
            title: 'SOS Alert!',
            body: `${childName} needs help immediately!`,
            data: { type: 'SOS', childId: uid }
          }),
        });
      } catch (e) {}

      Alert.alert('SOS Sent', 'Your parent has been notified!');
    } catch (e) {
      Alert.alert('Error', 'Could not send SOS. Check internet.');
    } finally { setSosActive(false); }
  };

  const percentage = Math.min((screenTime / limit) * 100, 100);
  const timeLeft = Math.max(limit - screenTime, 0);
  const isNearLimit = percentage >= 80;

  return (
    <View style={{ flex: 1, backgroundColor: '#060b14' }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {childName}!</Text>
          <Text style={styles.date}>{new Date().toDateString()}</Text>
        </View>

        {!parentId && (
          <TouchableOpacity style={styles.linkBanner}
            onPress={() => navigation.navigate('Pairing')}>
            <Text style={styles.linkBannerIcon}>ðŸ”—</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkBannerTitle}>Link to Parent</Text>
              <Text style={styles.linkBannerText}>Tap to enter pairing code</Text>
            </View>
            <Text style={{ color: '#00d4ff', fontSize: 20 }}>â†’</Text>
          </TouchableOpacity>
        )}

        {/* Screen Time Card */}
        <View style={[styles.card, isNearLimit && styles.cardWarning]}>
          <Text style={styles.cardLabel}>Today Screen Time</Text>
          <Text style={styles.timeValue}>
            {Math.floor(screenTime / 60)}h {screenTime % 60}m
            <Text style={styles.timeLimit}> / {Math.floor(limit / 60)}h {limit % 60}m</Text>
          </Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill,
              { width: `${percentage}%` },
              isNearLimit && { backgroundColor: '#ff4444' }
            ]} />
          </View>
          <Text style={[styles.timeLeftText, isNearLimit && { color: '#ff4444' }]}>
            {isNearLimit ? `Warning: Only ${timeLeft} min left!` : `${timeLeft} min remaining`}
          </Text>
        </View>

        {/* Status Row */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Status</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>ðŸ”‹</Text>
              <Text style={styles.statusText}>{battery !== null ? `${battery}%` : '...'}</Text>
              <Text style={styles.statusLabel}>Battery</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>ðŸ“</Text>
              <Text style={styles.statusText}>{location ? 'Active' : 'Pending'}</Text>
              <Text style={styles.statusLabel}>Location</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>{adminEnabled ? 'ðŸ”’' : 'ðŸ›¡ï¸'}</Text>
              <Text style={styles.statusText}>{adminEnabled ? 'Protected' : 'Basic'}</Text>
              <Text style={styles.statusLabel}>Security</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>{parentId ? 'âœ…' : 'âŒ'}</Text>
              <Text style={styles.statusText}>{parentId ? 'Linked' : 'Not Linked'}</Text>
              <Text style={styles.statusLabel}>Parent</Text>
            </View>
          </View>
        </View>

        {/* SOS Button */}
        <View style={styles.sosContainer}>
          <Text style={styles.sosLabel}>Emergency:</Text>
          <Animated.View style={{ transform: [{ scale: sosAnim }] }}>
            <TouchableOpacity
              style={[styles.sosBtn, sosActive && { opacity: 0.6 }]}
              onPress={handleSOSPress} disabled={sosActive} activeOpacity={0.8}>
              <Text style={styles.sosIcon}>ðŸ†˜</Text>
              <Text style={styles.sosBtnText}>SOS</Text>
              <Text style={styles.sosSubText}>Press to alert parent</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>â„¹ï¸ KidShield Active</Text>
          <Text style={styles.infoText}>â€¢ Location shared with parent</Text>
          <Text style={styles.infoText}>â€¢ Screen time: {screenTime} minutes today</Text>
          <Text style={styles.infoText}>â€¢ Battery: {battery !== null ? `${battery}%` : 'reading...'}</Text>
          <Text style={styles.infoText}>â€¢ To open hidden app: dial *#1234#</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 16 },
  greeting: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  date: { fontSize: 13, color: '#8899aa' },
  linkBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1.5, borderColor: '#00d4ff',
  },
  linkBannerIcon: { fontSize: 24 },
  linkBannerTitle: { fontSize: 15, fontWeight: '700', color: '#00d4ff', marginBottom: 2 },
  linkBannerText: { fontSize: 12, color: '#8899aa' },
  card: {
    backgroundColor: '#111d35', borderRadius: 16, padding: 20,
    marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a',
  },
  cardWarning: { borderColor: '#ff4444' },
  cardLabel: { fontSize: 13, color: '#8899aa', marginBottom: 10, fontWeight: '600' },
  timeValue: { fontSize: 36, fontWeight: '700', color: '#00d4ff', marginBottom: 12 },
  timeLimit: { fontSize: 18, color: '#8899aa' },
  progressBg: { height: 8, backgroundColor: '#1e2d4a', borderRadius: 4, marginBottom: 8 },
  progressFill: { height: 8, backgroundColor: '#00d4ff', borderRadius: 4 },
  timeLeftText: { fontSize: 13, color: '#00d4ff' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  statusItem: { alignItems: 'center' },
  statusIcon: { fontSize: 24, marginBottom: 4 },
  statusText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
  statusLabel: { fontSize: 11, color: '#8899aa', marginTop: 2 },
  sosContainer: { alignItems: 'center', marginVertical: 20 },
  sosLabel: { fontSize: 13, color: '#8899aa', marginBottom: 16 },
  sosBtn: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#1a0000', borderWidth: 3, borderColor: '#ff0000',
    alignItems: 'center', justifyContent: 'center', elevation: 8,
  },
  sosIcon: { fontSize: 36, marginBottom: 4 },
  sosBtnText: { fontSize: 22, fontWeight: '700', color: '#ff0000' },
  sosSubText: { fontSize: 10, color: '#ff6666', marginTop: 2 },
  infoCard: {
    backgroundColor: '#0a1628', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1e2d4a',
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
  infoText: { fontSize: 13, color: '#8899aa', marginBottom: 6 },
});