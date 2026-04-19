import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Animated, Vibration, AppState, Modal,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';
import KidShieldNative from '../../services/KidShieldNative';

const API_URL = 'https://kidshield-0757.onrender.com';

export default function ChildHome({ navigation }) {
  const [screenTime, setScreenTime] = useState(0);
  const [limit, setLimit] = useState(120);
  const [childName, setChildName] = useState('Child');
  const [parentId, setParentId] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [location, setLocation] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const sosAnim = useRef(new Animated.Value(1)).current;
  const screenTimeRef = useRef(0);

  useEffect(() => {
    loadChildData();
    startLocationTracking();
    checkSetupStatus();
    KidShieldNative.setChildMode(true);

    const screenInterval = setInterval(() => {
      screenTimeRef.current += 1;
      setScreenTime(screenTimeRef.current);
      if (screenTimeRef.current % 5 === 0) saveScreenTime(screenTimeRef.current);
    }, 60000);

    return () => clearInterval(screenInterval);
  }, []);

  const checkSetupStatus = async () => {
    const isAdmin = await KidShieldNative.isDeviceAdminEnabled();
    setAdminEnabled(isAdmin);
  };

  const loadChildData = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const doc = await firestore().collection('users').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        setChildName(data.name || 'Child');
        setParentId(data.parentId || null);
        setLimit(data.screenTimeLimit || 120);
        screenTimeRef.current = data.screenTime || 0;
        setScreenTime(data.screenTime || 0);
        setSetupDone(data.setupDone || false);
        if (data.parentId && !data.setupDone) setShowSetup(true);
      }
    } catch (e) { console.error('Load error:', e); }
  };

  const saveScreenTime = async (minutes) => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      await firestore().collection('users').doc(uid).update({
        screenTime: minutes,
        lastActive: firestore.FieldValue.serverTimestamp(),
      });
      if ((minutes / limit) * 100 >= 80 && parentId) {
        await firestore().collection('alerts').add({
          childId: uid, childName, parentId,
          title: 'Screen Time Warning',
          body: `${childName} has used ${minutes} of ${limit} minutes today`,
          type: 'SCREEN_TIME', read: false,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {}
  };

  const startLocationTracking = () => {
    Geolocation.requestAuthorization();
    Geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocation({ latitude, longitude, accuracy });
        sendLocationToFirestore(latitude, longitude, accuracy);
      },
      (err) => console.log('GPS error:', err),
      { enableHighAccuracy: false, distanceFilter: 100, interval: 300000 }
    );
  };

  const sendLocationToFirestore = async (lat, lng, accuracy) => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      await firestore().collection('locations').doc(uid).set({
        lat, lng, accuracy, childId: uid,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {}
  };

  const completeSetup = async () => {
    try {
      await KidShieldNative.requestDeviceAdmin();
      setTimeout(async () => {
        const isAdmin = await KidShieldNative.isDeviceAdminEnabled();
        setAdminEnabled(isAdmin);
        const uid = auth().currentUser?.uid;
        await firestore().collection('users').doc(uid).update({ setupDone: true });
        setSetupDone(true);
        setShowSetup(false);
        Alert.alert('Setup Complete!', 'KidShield is now protecting this device.\n\nThe app icon will be hidden. To open again dial *#1234#', [
          { text: 'Hide App Now', onPress: () => KidShieldNative.hideAppIcon() }
        ]);
      }, 3000);
    } catch (e) {
      Alert.alert('Error', 'Setup failed. Please try again.');
    }
  };

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
      if (location) await sendLocationToFirestore(location.latitude, location.longitude, location.accuracy);
      await firestore().collection('alerts').add({
        childId: uid, childName, parentId,
        title: 'SOS Alert!', body: `${childName} needs help!`,
        type: 'SOS', read: false,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });
      if (parentId) {
        await fetch(`${API_URL}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId, title: 'SOS Alert!', body: `${childName} needs help immediately!`, data: { type: 'SOS', childId: uid } }),
        });
      }
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
      {/* Setup Wizard Modal */}
      <Modal visible={showSetup} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Setup KidShield Protection</Text>
            <Text style={styles.modalText}>To protect this device, please enable the following:</Text>

            <View style={styles.setupStep}>
              <Text style={styles.setupStepNum}>1</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupStepTitle}>Device Administrator</Text>
                <Text style={styles.setupStepDesc}>Prevents unauthorized uninstall</Text>
              </View>
              <Text style={{ color: adminEnabled ? '#00cc88' : '#ff9900' }}>
                {adminEnabled ? '✓' : '○'}
              </Text>
            </View>

            <View style={styles.setupStep}>
              <Text style={styles.setupStepNum}>2</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupStepTitle}>Accessibility Service</Text>
                <Text style={styles.setupStepDesc}>Enables app blocking feature</Text>
              </View>
              <TouchableOpacity onPress={() => KidShieldNative.openAccessibilitySettings()}>
                <Text style={{ color: '#00d4ff', fontSize: 12 }}>Enable →</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.setupBtn} onPress={completeSetup}>
              <Text style={styles.setupBtnText}>Enable Device Admin & Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowSetup(false)}>
              <Text style={{ color: '#8899aa', textAlign: 'center', marginTop: 12, fontSize: 12 }}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {childName}! 👋</Text>
          <Text style={styles.date}>{new Date().toDateString()}</Text>
        </View>

        {!parentId && (
          <TouchableOpacity style={styles.linkBanner} onPress={() => navigation.navigate('Pairing')}>
            <Text style={styles.linkBannerIcon}>🔗</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkBannerTitle}>Link to Parent</Text>
              <Text style={styles.linkBannerText}>Tap here to enter pairing code</Text>
            </View>
            <Text style={{ color: '#00d4ff', fontSize: 20 }}>→</Text>
          </TouchableOpacity>
        )}

        {parentId && !setupDone && (
          <TouchableOpacity style={styles.setupBanner} onPress={() => setShowSetup(true)}>
            <Text style={{ fontSize: 20 }}>⚙️</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.setupBannerTitle}>Complete Setup</Text>
              <Text style={styles.setupBannerText}>Enable protection features</Text>
            </View>
            <Text style={{ color: '#ff9900', fontSize: 20 }}>→</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.card, isNearLimit && styles.cardWarning]}>
          <Text style={styles.cardLabel}>Today's Screen Time</Text>
          <Text style={styles.timeValue}>
            {Math.floor(screenTime / 60)}h {screenTime % 60}m
            <Text style={styles.timeLimit}> / {Math.floor(limit / 60)}h {limit % 60}m</Text>
          </Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${percentage}%` }, isNearLimit && { backgroundColor: '#ff4444' }]} />
          </View>
          <Text style={[styles.timeLeftText, isNearLimit && { color: '#ff4444' }]}>
            {isNearLimit ? `Warning: Only ${timeLeft} minutes left!` : `${timeLeft} minutes remaining today`}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Status</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>📍</Text>
              <Text style={styles.statusText}>{location ? 'Location\nActive' : 'Location\nPending'}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>{adminEnabled ? '🔒' : '🛡️'}</Text>
              <Text style={styles.statusText}>{adminEnabled ? 'Admin\nEnabled' : 'Protected\nMode'}</Text>
            </View>
            <TouchableOpacity style={styles.statusItem} onPress={() => !parentId && navigation.navigate('Pairing')}>
              <Text style={styles.statusIcon}>👨‍👩‍👧</Text>
              <Text style={[styles.statusText, { color: parentId ? '#00cc88' : '#ff9900' }]}>
                {parentId ? 'Parent\nLinked ✓' : 'Tap to\nLink'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sosContainer}>
          <Text style={styles.sosLabel}>Emergency — Press to alert parent:</Text>
          <Animated.View style={{ transform: [{ scale: sosAnim }] }}>
            <TouchableOpacity
              style={[styles.sosBtn, sosActive && { opacity: 0.6 }]}
              onPress={handleSOSPress} disabled={sosActive} activeOpacity={0.8}>
              <Text style={styles.sosIcon}>🆘</Text>
              <Text style={styles.sosBtnText}>SOS</Text>
              <Text style={styles.sosSubText}>Press to alert parent</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ About KidShield</Text>
          <Text style={styles.infoText}>• Your parent can see your location</Text>
          <Text style={styles.infoText}>• App usage is tracked daily</Text>
          <Text style={styles.infoText}>• Some apps may be restricted</Text>
          <Text style={styles.infoText}>• Use SOS button in emergencies</Text>
          <Text style={styles.infoText}>• To show hidden app: dial *#1234#</Text>
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
  setupBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,153,0,0.08)', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1.5, borderColor: '#ff9900',
  },
  setupBannerTitle: { fontSize: 15, fontWeight: '700', color: '#ff9900', marginBottom: 2 },
  setupBannerText: { fontSize: 12, color: '#8899aa' },
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
  statusIcon: { fontSize: 28, marginBottom: 6 },
  statusText: { fontSize: 12, color: '#8899aa', textAlign: 'center' },
  sosContainer: { alignItems: 'center', marginVertical: 20 },
  sosLabel: { fontSize: 13, color: '#8899aa', marginBottom: 16, textAlign: 'center' },
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 28,
    width: '100%', borderWidth: 1, borderColor: '#1e2d4a',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 8, textAlign: 'center' },
  modalText: { fontSize: 13, color: '#8899aa', marginBottom: 24, textAlign: 'center' },
  setupStep: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0a1628', borderRadius: 12, padding: 14, marginBottom: 12,
  },
  setupStepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#00d4ff', color: '#000', fontWeight: '700',
    textAlign: 'center', lineHeight: 28, fontSize: 14,
  },
  setupStepTitle: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  setupStepDesc: { color: '#8899aa', fontSize: 12, marginTop: 2 },
  setupBtn: {
    backgroundColor: '#00d4ff', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  setupBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
});