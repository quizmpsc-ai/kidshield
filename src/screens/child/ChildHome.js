import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, AppState, PermissionsAndroid,
  ScrollView, Alert, Animated, Vibration, NativeModules,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import Geolocation from '@react-native-community/geolocation';
import ChildMonitorService from '../../services/ChildMonitorService';

const API_URL = 'https://kidshield-0757.onrender.com';
const { BatteryModule, KidShieldModule, AppBlocker } = NativeModules;

export default function ChildHome({ navigation }) {
  const [childName, setChildName] = useState('Child');
  const [parentId, setParentId] = useState(null);
  const [childDocId, setChildDocId] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [location, setLocation] = useState(null);
  const [battery, setBattery] = useState(null);
  const [adminEnabled, setAdminEnabled] = useState(false);
  
  const [permsState, setPermsState] = useState({
    location: false, camera: false, microphone: false, deviceAdmin: false, overlay: false
  });

  const sosAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadChildData();
    startLocationTracking();
    startBatteryTracking();
    checkPermissionsStatus();
    ChildMonitorService.init(); 

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        checkPermissionsStatus();
      }
    });
    return () => subscription.remove();
  }, []);

  const checkPermissionsStatus = async () => {
    const loc = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const cam = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    const mic = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const admin = KidShieldModule ? await KidShieldModule.isDeviceAdminEnabled() : false;
    const overlay = AppBlocker ? await AppBlocker.isOverlayPermissionGranted() : false;
    
    setPermsState({ location: loc, camera: cam, microphone: mic, deviceAdmin: admin, overlay });
    setAdminEnabled(admin);
  };

  const requestSpecificPermission = async (type) => {
    try {
      if (type === 'location') {
        Alert.alert(
          "Location Tracking Setup",
          "To track location accurately, we need background access.\n\nSteps:\n1. Tap 'Continue' below.\n2. When prompted, select 'While using the app'.\n3. If asked again, select 'Allow all the time'.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Continue", onPress: async () => {
                await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                setTimeout(checkPermissionsStatus, 1500);
            }}
          ]
        );
      } else if (type === 'camera') {
        Alert.alert(
          "Remote Camera Setup",
          "To enable remote photo capture, the app needs camera access.\n\nSteps:\n1. Tap 'Continue' below.\n2. When prompted, tap 'While using the app' or 'Allow'.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Continue", onPress: async () => {
                await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
                setTimeout(checkPermissionsStatus, 1500);
            }}
          ]
        );
      } else if (type === 'microphone') {
        Alert.alert(
          "Remote Audio Setup",
          "To enable ambient audio listening, the app needs microphone access.\n\nSteps:\n1. Tap 'Continue' below.\n2. When prompted, tap 'While using the app' or 'Allow'.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Continue", onPress: async () => {
                await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
                setTimeout(checkPermissionsStatus, 1500);
            }}
          ]
        );
      } else if (type === 'deviceAdmin') {
        Alert.alert(
          "Uninstall Protection",
          "Enable Device Admin to prevent your child from deleting KidShield.\n\nSteps:\n1. Tap 'Open Settings' below.\n2. A security screen will appear.\n3. Scroll down and tap 'Activate this device admin app'.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: async () => {
                if (KidShieldModule) await KidShieldModule.requestDeviceAdmin();
                setTimeout(checkPermissionsStatus, 3000); 
            }}
          ]
        );
      } else if (type === 'overlay') {
        Alert.alert(
          "Background Execution",
          "Allow KidShield to wake up and perform background tasks.\n\nSteps:\n1. Tap 'Open Settings'.\n2. Find 'KidShield' in the list.\n3. Turn ON 'Allow display over other apps'.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: async () => {
                if (AppBlocker) await AppBlocker.requestOverlayPermission();
                setTimeout(checkPermissionsStatus, 3000); 
            }}
          ]
        );
      }
    } catch (e) { console.error(e); }
  };

  const handleHideApp = async () => {
    Alert.alert(
      "Hide Application",
      "This will remove KidShield from the app drawer. You must dial *#1234# in the phone dialer to open it again.\n\nDo you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Hide Now", 
          style: "destructive",
          onPress: async () => {
            try {
              if (KidShieldModule) await KidShieldModule.hideAppIcon();
              Alert.alert("Success", "App is now hidden.");
            } catch (error) {
              console.log("Error hiding app:", error);
            }
          }
        }
      ]
    );
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
        let correctId = data.childId;
        if (data.parentId) {
            try {
                const snap = await firestore().collection('families').doc(data.parentId).collection('children').limit(1).get();
                if (!snap.empty) correctId = snap.docs[0].id;
            } catch(e){}
        }
        setChildDocId(correctId || null);
      }
    } catch (e) {}
  };

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
    await updateBattery();
    setInterval(updateBattery, 5 * 60 * 1000);
  };

  const startLocationTracking = () => {
    Geolocation.requestAuthorization();
    Geolocation.getCurrentPosition(
      (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => console.log(err),
      { enableHighAccuracy: false, timeout: 15000 }
    );
  };

  const handleSOSPress = () => {
    Vibration.vibrate([0, 200, 100, 200]);
    Animated.sequence([
      Animated.timing(sosAnim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
      Animated.timing(sosAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    Alert.alert('SOS Alert', 'Send an emergency alert to your parent?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: sendSOS },
    ]);
  };

  const sendSOS = async () => {
    try {
      setSosActive(true);
      const uid = auth().currentUser?.uid;
      await firestore().collection('alerts').add({
        childId: uid, childName, parentId,
        title: 'SOS Alert!', body: `${childName} needs help!`, type: 'SOS', severity: 'high',
        read: false, timestamp: firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert('SOS Sent', 'Your parent has been notified immediately!');
    } catch (e) {} finally { setSosActive(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#060b14' }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {childName}!</Text>
          <Text style={styles.date}>{new Date().toDateString()}</Text>
        </View>

        {!parentId && (
          <TouchableOpacity style={styles.linkBanner} onPress={() => navigation.navigate('Pairing')}>
            <Text style={styles.linkBannerIcon}>🔗</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkBannerTitle}>Link to Parent</Text>
              <Text style={styles.linkBannerText}>Tap here to enter the pairing code</Text>
            </View>
            <Text style={{ color: '#00d4ff', fontSize: 20 }}>→</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Monitoring Permissions</Text>
          <View style={styles.permList}>
            <PermRow icon="🚀" title="Background Execution" state={permsState.overlay} onAllow={() => requestSpecificPermission('overlay')} />
            <PermRow icon="📍" title="Location Tracking" state={permsState.location} onAllow={() => requestSpecificPermission('location')} />
            <PermRow icon="📸" title="Remote Camera" state={permsState.camera} onAllow={() => requestSpecificPermission('camera')} />
            <PermRow icon="🎤" title="Remote Audio" state={permsState.microphone} onAllow={() => requestSpecificPermission('microphone')} />
            <PermRow icon="🛡️" title="Uninstall Protection" state={permsState.deviceAdmin} onAllow={() => requestSpecificPermission('deviceAdmin')} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Device Status</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>🔋</Text>
              <Text style={styles.statusText}>{battery !== null ? `${battery}%` : '...'}</Text>
              <Text style={styles.statusLabel}>Battery</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>📌</Text>
              <Text style={styles.statusText}>{location ? 'Active' : 'Pending'}</Text>
              <Text style={styles.statusLabel}>Location</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusIcon}>{adminEnabled ? '🔒' : '🔓'}</Text>
              <Text style={styles.statusText}>{adminEnabled ? 'Secured' : 'Basic'}</Text>
              <Text style={styles.statusLabel}>Security</Text>
            </View>
          </View>
        </View>

        <View style={styles.sosContainer}>
          <Text style={styles.sosLabel}>Emergency:</Text>
          <Animated.View style={{ transform: [{ scale: sosAnim }] }}>
            <TouchableOpacity style={[styles.sosBtn, sosActive && { opacity: 0.6 }]} onPress={handleSOSPress} disabled={sosActive} activeOpacity={0.8}>
              <Text style={styles.sosIcon}>🆘</Text>
              <Text style={styles.sosBtnText}>SOS</Text>
              <Text style={styles.sosSubText}>Tap to alert parent</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <TouchableOpacity style={styles.hideAppBtn} onPress={handleHideApp}>
          <Text style={styles.hideAppIcon}>👻</Text>
          <Text style={styles.hideAppText}>Hide KidShield App</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const PermRow = ({ icon, title, state, onAllow }) => (
  <View style={styles.permRow}>
    <Text style={styles.permRowIcon}>{icon}</Text>
    <Text style={styles.permRowTitle}>{title}</Text>
    {state ? (
      <Text style={styles.permGranted}>✅ Active</Text>
    ) : (
      <TouchableOpacity style={styles.permAllowBtn} onPress={onAllow}>
        <Text style={styles.permAllowText}>Allow</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 16 },
  greeting: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  date: { fontSize: 13, color: '#8899aa' },
  linkBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: '#00d4ff' },
  linkBannerIcon: { fontSize: 24 },
  linkBannerTitle: { fontSize: 15, fontWeight: '700', color: '#00d4ff', marginBottom: 2 },
  linkBannerText: { fontSize: 12, color: '#8899aa' },
  card: { backgroundColor: '#111d35', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  cardLabel: { fontSize: 13, color: '#8899aa', marginBottom: 15, fontWeight: '600' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 },
  statusItem: { alignItems: 'center' },
  statusIcon: { fontSize: 24, marginBottom: 4 },
  statusText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
  statusLabel: { fontSize: 11, color: '#8899aa', marginTop: 2 },
  sosContainer: { alignItems: 'center', marginVertical: 20 },
  sosLabel: { fontSize: 13, color: '#8899aa', marginBottom: 16 },
  sosBtn: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#1a0000', borderWidth: 3, borderColor: '#ff0000', alignItems: 'center', justifyContent: 'center', elevation: 8 },
  sosIcon: { fontSize: 36, marginBottom: 4 },
  sosBtnText: { fontSize: 22, fontWeight: '700', color: '#ff0000' },
  sosSubText: { fontSize: 10, color: '#ff6666', marginTop: 2 },
  permList: { gap: 12 },
  permRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1220', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1e2d4a' },
  permRowIcon: { fontSize: 20, marginRight: 10 },
  permRowTitle: { flex: 1, color: '#ffffff', fontSize: 14, fontWeight: '500' },
  permGranted: { color: '#00cc88', fontSize: 13, fontWeight: '700' },
  permAllowBtn: { backgroundColor: '#00d4ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  permAllowText: { color: '#000', fontSize: 12, fontWeight: '700' },
  hideAppBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e2d4a', padding: 15, borderRadius: 12, marginTop: 10 },
  hideAppIcon: { fontSize: 20, marginRight: 10 },
  hideAppText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});