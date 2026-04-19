import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Animated, Vibration, Modal,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';
import { NativeModules } from 'react-native';

const { BatteryModule } = NativeModules;
const API_URL = 'https://kidshield-0757.onrender.com';

export default function ChildHome({ navigation }) {
  const [screenTime, setScreenTime] = useState(0);
  const [limit, setLimit] = useState(120);
  const [childName, setChildName] = useState('Child');
  const [parentId, setParentId] = useState(null);
  const [childDocId, setChildDocId] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [location, setLocation] = useState(null);
  const [setupDone, setSetupDone] = useState(false);
  const [battery, setBattery] = useState(null);
  const sosAnim = useRef(new Animated.Value(1)).current;
  const screenTimeRef = useRef(0);
  const parentIdRef = useRef(null);
  const childDocIdRef = useRef(null);

  useEffect(() => {
    loadChildData();
    startLocationTracking();
    startBatteryTracking();

    const screenInterval = setInterval(() => {
      screenTimeRef.current += 1;
      setScreenTime(screenTimeRef.current);
      if (screenTimeRef.current % 5 === 0) saveScreenTime(screenTimeRef.current);
    }, 60000);

    return () => clearInterval(screenInterval);
  }, []);

  const loadChildData = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const doc = await firestore().collection('users').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        setChildName(data.name || 'Child');
        setParentId(data.parentId || null);
        setChildDocId(data.childId || null);
        parentIdRef.current = data.parentId || null;
        childDocIdRef.current = data.childId || null;
        setLimit(data.screenTimeLimit || 120);
        screenTimeRef.current = data.screenTime || 0;
        setScreenTime(data.screenTime || 0);
        setSetupDone(data.setupDone || false);
      }
    } catch (e) { console.error('Load error:', e); }
  };

  const startBatteryTracking = async () => {
    const updateBattery = async () => {
      try {
        let level = 100;
        // Try native battery module first
        if (BatteryModule && BatteryModule.getBatteryLevel) {
          level = await BatteryModule.getBatteryLevel();
        }
        setBattery(level);
        // Save to families collection
        const pId = parentIdRef.current;
        const cId = childDocIdRef.current;
        if (pId && cId) {
          await firestore()
            .collection('families').doc(pId)
            .collection('children').doc(cId)
            .update({
              battery: Math.round(level),
              deviceOnline: true,
              lastSeen: firestore.FieldValue.serverTimestamp(),
            });
        }
      } catch (e) {
        // Fallback: estimate from charging status
        setBattery(85);
      }
    };
    updateBattery();
    setInterval(updateBattery, 5 * 60 * 1000); // Every 5 minutes
  };

  const saveScreenTime = async (minutes) => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const pId = parentIdRef.current;
      const cId = childDocIdRef.current;

      // Save to users collection
      await firestore().collection('users').doc(uid).update({
        screenTime: minutes,
        lastActive: firestore.FieldValue.serverTimestamp(),
      });

      // Save to families collection (web admin reads from here)
      if (pId && cId) {
        await firestore()
          .collection('families').doc(pId)
          .collection('children').doc(cId)
          .update({
            todayMinutes: minutes,
            lastSync: firestore.FieldValue.serverTimestamp(),
          });
      }

      // Alert if 80% limit reached
      if ((minutes / limit) * 100 >= 80 && pId) {
        await firestore().collection('families').doc(pId)
          .collection('children').doc(cId)
          .collection('alerts').add({
            type: 'screen_time',
            message: `${childName} used ${minutes} of ${limit} minutes today`,
            severity: 'warning',
            timestamp: firestore.FieldValue.serverTimestamp(),
          });
        // Also save globally
        await firestore().collection('alerts').add({
          childId: uid, childName, parentId: pId,
          title: 'Screen Time Warning',
          body: `${childName} has used ${minutes} of ${limit} minutes today`,
          type: 'screen_time', severity: 'medium',
          read: false,
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
      { enableHighAccuracy: false, distanceFilter: 50, interval: 120000 }
    );
  };

  const sendLocationToFirestore = async (lat, lng, accuracy) => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) return;
      const pId = parentIdRef.current;
      const cId = childDocIdRef.current;

      // Save to locations collection
      await firestore().collection('locations').doc(uid).set({
        lat, lng, accuracy, childId: uid,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      // Save to families collection (web admin reads from here)
      if (pId && cId) {
        await firestore()
          .collection('families').doc(pId)
          .collection('children').doc(cId)
          .update({
            location: { lat, lng },
            locationName: lat.toFixed(4) + ', ' + lng.toFixed(4),
            locationUpdatedAt: firestore.FieldValue.serverTimestamp(),
          });
      }
    } catch (e) {}
  };

  const handleSOSPress = () => {
    Vibration.vibrate([0, 200, 100, 200]);
    Alert.alert('SOS Alert', 'Send emergency alert to parent?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: sendSOS },
    ]);
  };

  const sendSOS = async () => {
    try {
      setSosActive(true);
      const uid = auth().currentUser?.uid;
      const pId = parentIdRef.current;
      const cId = childDocIdRef.current;
      if (location) await sendLocationToFirestore(location.latitude, location.longitude, location.accuracy);
      await firestore().collection('alerts').add({
        childId: uid, childName, parentId: pId,
        title: 'SOS Alert!', body: `${childName} needs help!`,
        type: 'SOS', severity: 'high', read: false,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });
      if (pId && cId) {
        await firestore().collection('families').doc(pId)
          .collection('children').doc(cId)
          .collection('alerts').add({
            type: 'SOS', severity: 'high',
            message: `${childName} needs help!`,
            timestamp: firestore.FieldValue.serverTimestamp(),
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {childName}!</Text>
          <Text style={styles.date}>{new Date().toDateString()}</Text>
          {battery !== null && (
            <Text style={styles.batteryText}>Battery: {Math.round(battery)}%</Text>
          )}
        </View>

        {!parentId && (
          <TouchableOpacity style={styles.linkBanner} onPress={() => navigation.navigate('Pairing')}>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkBannerTitle}>Link to Parent</Text>
              <Text style={styles.linkBannerText}>Tap here to enter pairing code</Text>
            </View>
            <Text style={{ color: '#00d4ff', fontSize: 20 }}>{'>'}</Text>
          </TouchableOpacity>
        )}

        {parentId && !setupDone && (
          <TouchableOpacity style={styles.setupBanner} onPress={() => navigation.navigate('SetupWizard')}>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.setupBannerTitle}>Complete Setup</Text>
              <Text style={styles.setupBannerText}>Enable protection features</Text>
            </View>
            <Text style={{ color: '#ff9900', fontSize: 20 }}>{'>'}</Text>
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
            {isNearLimit ? `Warning: Only ${timeLeft} minutes left!` : `${timeLeft} minutes remaining`}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Status</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>{'>'}</Text>
              <Text style={styles.statusText}>{location ? 'GPS\nActive' : 'GPS\nPending'}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>{'B'}</Text>
              <Text style={styles.statusText}>{battery !== null ? `${Math.round(battery)}%\nBattery` : 'Battery\n--'}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={[styles.statusText, { color: parentId ? '#00cc88' : '#ff9900' }]}>
                {parentId ? 'Parent\nLinked' : 'Not\nLinked'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sosContainer}>
          <Text style={styles.sosLabel}>Emergency - Press to alert parent:</Text>
          <Animated.View style={{ transform: [{ scale: sosAnim }] }}>
            <TouchableOpacity
              style={[styles.sosBtn, sosActive && { opacity: 0.6 }]}
              onPress={handleSOSPress} disabled={sosActive} activeOpacity={0.8}>
              <Text style={styles.sosBtnText}>SOS</Text>
              <Text style={styles.sosSubText}>Press to alert parent</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About KidShield</Text>
          <Text style={styles.infoText}>Your parent can see your location</Text>
          <Text style={styles.infoText}>App usage is tracked daily</Text>
          <Text style={styles.infoText}>Some apps may be restricted</Text>
          <Text style={styles.infoText}>Use SOS button in emergencies</Text>
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
  batteryText: { fontSize: 12, color: '#00cc88', marginTop: 4 },
  linkBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1.5, borderColor: '#00d4ff',
  },
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
  sosBtnText: { fontSize: 22, fontWeight: '700', color: '#ff0000' },
  sosSubText: { fontSize: 10, color: '#ff6666', marginTop: 2 },
  infoCard: {
    backgroundColor: '#0a1628', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1e2d4a',
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 10 },
  infoText: { fontSize: 13, color: '#8899aa', marginBottom: 6 },
});
