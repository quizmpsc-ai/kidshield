// src/screens/child/ChildHome.js
import React, { useState, useEffect, useRef } from 'react';
const API_URL = 'https://kidshield-0757.onrender.com';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Vibration, Animated, AppState
} from 'react-native';

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', danger: '#ff4444',
  success: '#00cc88',
};

export default function ChildHome() {
  const [rules, setRules] = useState([]);
  const [blockedApps, setBlockedApps] = useState([]);
  const [screenTimeToday, setScreenTimeToday] = useState(0);
  const [screenTimeLimit, setScreenTimeLimit] = useState(120);
  const [childName, setChildName] = useState('');
  const [sosPressed, setSosPressed] = useState(false);
  const [sosTimer, setSosTimer] = useState(null);
  const [bedtimeActive, setBedtimeActive] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchChildData();
    updateLocation();
    const locationInterval = setInterval(updateLocation, 60000);
    return () => clearInterval(locationInterval);
  }, []);

  // SOS pulse animation
  useEffect(() => {
    if (sosPressed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [sosPressed]);

  const fetchChildData = async () => {
    try {
      const auth = (await import('@react-native-firebase/auth')).default();
      const uid = auth.currentUser?.uid;
      const firestore = (await import('@react-native-firebase/firestore')).default();

      // Child info
      const userDoc = await firestore.collection('users').doc(uid).get();
      const userData = userDoc.data();
      setChildName(userData?.name || 'Child');

      if (userData?.parentId) {
        // Rules
        const rulesSnap = await firestore.collection('rules')
          .where('parentId', '==', userData.parentId)
          .where('childId', '==', uid)
          .get();
        setRules(rulesSnap.docs.map(d => d.data()));

        // Blocked apps
        const appsSnap = await firestore.collection('appControls')
          .where('parentId', '==', userData.parentId)
          .where('blocked', '==', true)
          .get();
        setBlockedApps(appsSnap.docs.map(d => d.data().appName));

        // Today's screen time
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usageSnap = await firestore.collection('usageLogs')
          .where('childId', '==', uid)
          .where('date', '>=', today)
          .get();

        const totalMins = usageSnap.docs.reduce((sum, doc) => {
          return sum + Math.round(doc.data().durationMs / 60000);
        }, 0);
        setScreenTimeToday(totalMins);

        // Settings
        const settingsDoc = await firestore.collection('settings').doc(userData.parentId).get();
        if (settingsDoc.exists) {
          const settings = settingsDoc.data();
          if (settings.screenTimeLimit) setScreenTimeLimit(settings.screenTimeLimit);
          if (settings.bedtime?.enabled) checkBedtime(settings.bedtime);
        }
      }
    } catch (e) {
      // Load with defaults
      setChildName('Child');
      setRules([
        { text: 'School time à¤®à¤§à¥à¤¯à¥‡ à¤«à¤•à¥à¤¤ educational apps à¤µà¤¾à¤ªà¤°à¤¾' },
        { text: 'YouTube à¤°à¥‹à¤œ à¤œà¤¾à¤¸à¥à¤¤à¥€à¤¤ à¤œà¤¾à¤¸à¥à¤¤ 1 à¤¤à¤¾à¤¸' },
        { text: 'à¤°à¤¾à¤¤à¥à¤°à¥€ 10 à¤¨à¤‚à¤¤à¤° phone à¤¬à¤‚à¤¦ à¤•à¤°à¤¾' },
      ]);
      setScreenTimeToday(45);
      setScreenTimeLimit(120);
    }
  };

  const checkBedtime = (bedtimeSettings) => {
    const now = new Date();
    const [startH, startM] = bedtimeSettings.start.split(':').map(Number);
    const [endH, endM] = bedtimeSettings.end.split(':').map(Number);
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;

    const isActive = startMins > endMins
      ? currentMins >= startMins || currentMins < endMins
      : currentMins >= startMins && currentMins < endMins;

    setBedtimeActive(isActive);
  };

  const updateLocation = async () => {
    try {
      const Geolocation = (await import('@react-native-community/geolocation')).default;
      const auth = (await import('@react-native-firebase/auth')).default;
      const uid = auth().currentUser?.uid;
      if (!uid) return;

      Geolocation.getCurrentPosition(async (pos) => {
        const firestore = (await import('@react-native-firebase/firestore')).default();
        await firestore.collection('locations').doc(uid).set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (e) {}
  };

  const handleSOSPress = () => {
    Vibration.vibrate([0, 100, 100, 100]);
    setSosPressed(true);

    // 3 second hold to send SOS
    const timer = setTimeout(async () => {
      try {
        const auth = (await import('@react-native-firebase/auth')).default;
        const uid = auth().currentUser?.uid;
        const firestore = (await import('@react-native-firebase/firestore')).default();
        const userDoc = await firestore.collection('users').doc(uid).get();
        const parentId = userDoc.data()?.parentId;

        if (parentId) {
          await firestore.collection('alerts').add({
            childId: uid,
            type: 'sos',
            message: `ðŸ†˜ ${childName} à¤¨à¥‡ SOS à¤ªà¤¾à¤ à¤µà¤²à¥‡! à¤¤à¥à¤¯à¤¾à¤‚à¤¨à¤¾ à¤®à¤¦à¤¤ à¤¹à¤µà¥€ à¤†à¤¹à¥‡.`,
            createdAt: firestore.FieldValue.serverTimestamp(),
            read: false,
          });

          // FCM notification to parent
          await fetch(`${API_URL}/api/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              parentId,
              title: 'ðŸ†˜ SOS Alert!',
              body: `${childName} à¤²à¤¾ à¤®à¤¦à¤¤ à¤¹à¤µà¥€ à¤†à¤¹à¥‡! à¤¤à¥à¤¯à¤¾à¤‚à¤šà¥‡ location check à¤•à¤°à¤¾.`,
            }),
          });
        }

        Alert.alert('ðŸ†˜ SOS à¤ªà¤¾à¤ à¤µà¤²à¥‡!', 'Parent à¤²à¤¾ alert à¤—à¥‡à¤²à¤¾. à¤¤à¥‡ à¤²à¤µà¤•à¤°à¤š à¤¯à¥‡à¤¤à¥€à¤².', [{ text: 'OK' }]);
      } catch (e) {
        Alert.alert('SOS à¤ªà¤¾à¤ à¤µà¤²à¥‡', 'Alert send à¤•à¥‡à¤²à¤¾!');
      }
    }, 3000);

    setSosTimer(timer);
  };

  const handleSOSRelease = () => {
    setSosPressed(false);
    if (sosTimer) {
      clearTimeout(sosTimer);
      setSosTimer(null);
    }
  };

  const usagePercent = Math.min((screenTimeToday / screenTimeLimit) * 100, 100);
  const usageColor = usagePercent > 80 ? '#ff4444' : usagePercent > 60 ? '#ff9900' : '#00cc88';

  const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} à¤¤à¤¾à¤¸ ${m} à¤®à¤¿à¤¨à¤¿à¤Ÿà¥‡` : `${m} à¤®à¤¿à¤¨à¤¿à¤Ÿà¥‡`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>à¤¨à¤®à¤¸à¥à¤•à¤¾à¤°, {childName}! ðŸ‘‹</Text>
          <Text style={styles.date}>{new Date().toLocaleDateString('mr-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <Text style={{ fontSize: 36 }}>ðŸ›¡ï¸</Text>
      </View>

      {/* Bedtime Warning */}
      {bedtimeActive && (
        <View style={styles.bedtimeWarning}>
          <Text style={styles.bedtimeIcon}>ðŸŒ™</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.bedtimeTitle}>Bedtime à¤µà¥‡à¤³ à¤à¤¾à¤²à¤¾!</Text>
            <Text style={styles.bedtimeText}>Phone à¤ à¥‡à¤µà¤¾ à¤†à¤£à¤¿ à¤à¥‹à¤ªà¤¾. à¤‰à¤¦à¥à¤¯à¤¾ à¤¸à¤•à¤¾à¤³à¥€ use à¤•à¤°à¤¾.</Text>
          </View>
        </View>
      )}

      {/* Screen Time */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ðŸ“± à¤†à¤œà¤šà¤¾ Screen Time</Text>
        <View style={styles.timeDisplay}>
          <Text style={[styles.timeValue, { color: usageColor }]}>{formatTime(screenTimeToday)}</Text>
          <Text style={styles.timeLimit}>/ {formatTime(screenTimeLimit)} limit</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${usagePercent}%`, backgroundColor: usageColor }]} />
        </View>
        <Text style={[styles.progressText, { color: usageColor }]}>
          {usagePercent >= 100
            ? 'âš ï¸ Screen time limit à¤¸à¤‚à¤ªà¤²à¥€!'
            : `${Math.round(100 - usagePercent)}% à¤µà¥‡à¤³ à¤¶à¤¿à¤²à¥à¤²à¤• à¤†à¤¹à¥‡`}
        </Text>
      </View>

      {/* Rules */}
      {rules.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ðŸ“‹ à¤®à¤¾à¤à¥‡ Rules</Text>
          {rules.map((rule, i) => (
            <View key={i} style={styles.ruleRow}>
              <Text style={styles.ruleDot}>â€¢</Text>
              <Text style={styles.ruleText}>{rule.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Blocked Apps */}
      {blockedApps.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ðŸš« Blocked Apps</Text>
          <View style={styles.blockedList}>
            {blockedApps.map((app, i) => (
              <View key={i} style={styles.blockedChip}>
                <Text style={styles.blockedText}>{app}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* SOS Button */}
      <View style={styles.sosSection}>
        <Text style={styles.sosLabel}>Emergency à¤®à¤§à¥à¤¯à¥‡ Parent à¤²à¤¾ alert à¤•à¤°à¤¾:</Text>
        <Animated.View style={[{ transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity
            style={[styles.sosBtn, sosPressed && styles.sosBtnActive]}
            onPressIn={handleSOSPress}
            onPressOut={handleSOSRelease}
            activeOpacity={0.8}
          >
            <Text style={styles.sosBtnIcon}>ðŸ†˜</Text>
            <Text style={styles.sosBtnText}>SOS</Text>
            <Text style={styles.sosBtnHint}>{sosPressed ? '3 seconds hold à¤•à¤°à¤¾...' : '3 seconds hold à¤•à¤°à¤¾'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  date: { color: '#8899aa', fontSize: 13, marginTop: 4 },

  bedtimeWarning: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e0a00',
    borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#ff990044',
  },
  bedtimeIcon: { fontSize: 24, marginRight: 12 },
  bedtimeTitle: { color: '#ff9900', fontWeight: '700', marginBottom: 2 },
  bedtimeText: { color: '#8899aa', fontSize: 12 },

  card: {
    backgroundColor: '#111d35', borderRadius: 16, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a',
  },
  cardTitle: { color: '#ffffff', fontWeight: '700', fontSize: 15, marginBottom: 12 },

  timeDisplay: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  timeValue: { fontSize: 28, fontWeight: '800', marginRight: 8 },
  timeLimit: { color: '#8899aa', fontSize: 14 },

  progressBar: { height: 8, backgroundColor: '#1e2d4a', borderRadius: 4, marginBottom: 6 },
  progressFill: { height: 8, borderRadius: 4 },
  progressText: { fontSize: 12, fontWeight: '600' },

  ruleRow: { flexDirection: 'row', marginBottom: 8 },
  ruleDot: { color: '#00d4ff', marginRight: 8, fontSize: 16 },
  ruleText: { color: '#8899aa', flex: 1, lineHeight: 20 },

  blockedList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  blockedChip: {
    backgroundColor: '#ff444422', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#ff444444',
  },
  blockedText: { color: '#ff4444', fontSize: 12, fontWeight: '600' },

  sosSection: { alignItems: 'center', marginTop: 8 },
  sosLabel: { color: '#8899aa', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  sosBtn: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: '#1e0a00',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#ff4444',
    shadowColor: '#ff4444', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20,
  },
  sosBtnActive: { backgroundColor: '#ff444444', borderColor: '#ff6666' },
  sosBtnIcon: { fontSize: 36, marginBottom: 4 },
  sosBtnText: { color: '#ff4444', fontWeight: '900', fontSize: 20 },
  sosBtnHint: { color: '#ff666688', fontSize: 10, marginTop: 4, textAlign: 'center' },
});
