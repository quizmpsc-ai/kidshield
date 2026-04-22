import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, PermissionsAndroid, Linking, ActivityIndicator,
} from 'react-native';
import { NativeModules } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { KidShieldModule, ScreenMirror, AppBlocker } = NativeModules;

export default function SetupWizard({ navigation }) {
  const [permissions, setPermissions] = useState({
    location: false, camera: false, microphone: false,
    usageStats: false, accessibility: false, deviceAdmin: false,
    screenCapture: false, overlay: false,
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState('');

  useEffect(() => { checkAllPermissions(); }, []);

  const checkAllPermissions = async () => {
    setLoading(true);
    const location = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    const microphone = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const deviceAdmin = KidShieldModule ? await KidShieldModule.isDeviceAdminEnabled() : false;
    const overlay = AppBlocker ? await AppBlocker.isOverlayPermissionGranted() : false;

    setPermissions({ location, camera, microphone, usageStats: false, accessibility: false, deviceAdmin, screenCapture: false, overlay });
    setLoading(false);
  };

  const requestPermission = async (type) => {
    setChecking(type);
    try {
      switch (type) {
        case 'overlay':
          Alert.alert(
            'Background Execution',
            'KidShield needs permission to run in the background.\n\nSteps:\n1. Tap "Open Settings".\n2. Find KidShield and enable "Allow display over other apps".',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: async () => {
                  if (AppBlocker) await AppBlocker.requestOverlayPermission();
                  setTimeout(async () => {
                    const granted = await AppBlocker.isOverlayPermissionGranted();
                    setPermissions(p => ({ ...p, overlay: granted }));
                  }, 3000);
                }
              }
            ]
          );
          break;
        case 'location':
          const locResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (locResult === PermissionsAndroid.RESULTS.GRANTED) {
            await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
          }
          setPermissions(p => ({ ...p, location: locResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;
        case 'camera':
          const camResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          setPermissions(p => ({ ...p, camera: camResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;
        case 'microphone':
          const micResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          setPermissions(p => ({ ...p, microphone: micResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;
        case 'usageStats':
          Alert.alert('Usage Access', 'Settings will open. Enable Usage Access for KidShield.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => {
                  Linking.sendIntent('android.settings.USAGE_ACCESS_SETTINGS');
                  setTimeout(() => setPermissions(p => ({ ...p, usageStats: true })), 3000);
                }
              }
            ]);
          break;
        case 'accessibility':
          Alert.alert('Accessibility Service', 'Settings will open. Enable Accessibility for KidShield.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: async () => {
                  if (KidShieldModule) await KidShieldModule.openAccessibilitySettings();
                  setTimeout(() => setPermissions(p => ({ ...p, accessibility: true })), 3000);
                }
              }
            ]);
          break;
        case 'deviceAdmin':
          if (KidShieldModule) {
            await KidShieldModule.requestDeviceAdmin();
            setTimeout(async () => {
              const enabled = await KidShieldModule.isDeviceAdminEnabled();
              setPermissions(p => ({ ...p, deviceAdmin: enabled }));
            }, 2000);
          }
          break;
        case 'screenCapture':
          if (ScreenMirror) {
             await ScreenMirror.requestPermission().catch(()=>{});
             setPermissions(p => ({ ...p, screenCapture: true }));
          }
          break;
      }
    } catch (e) {}
    setChecking('');
  };

  const completeSetup = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (uid) {
        await firestore().collection('users').doc(uid).update({ setupDone: true, permissions, setupAt: firestore.FieldValue.serverTimestamp() });
      }
      navigation?.replace('ChildApp');
    } catch (e) { navigation?.replace('ChildApp'); }
  };

  const allRequired = permissions.location && permissions.camera && permissions.microphone && permissions.overlay;
  const grantedCount = Object.values(permissions).filter(Boolean).length;
  const totalCount = Object.values(permissions).length;

  const permList = [
    { key: 'overlay', icon: '🚀', title: 'Background Execution', desc: 'Display over other apps - Required', required: true },
    { key: 'location', icon: '📍', title: 'Location', desc: 'GPS tracking - Required', required: true },
    { key: 'camera', icon: '📸', title: 'Camera', desc: 'Remote camera access - Required', required: true },
    { key: 'microphone', icon: '🎤', title: 'Microphone', desc: 'Ambient audio monitoring - Required', required: true },
    { key: 'usageStats', icon: '📊', title: 'Usage Stats', desc: 'App usage tracking - Recommended', required: false },
    { key: 'accessibility', icon: '⚙️', title: 'Accessibility', desc: 'App blocking - Recommended', required: false },
    { key: 'deviceAdmin', icon: '🛡️', title: 'Device Admin', desc: 'Prevent uninstall - Recommended', required: false },
    { key: 'screenCapture', icon: '📱', title: 'Screen Monitor', desc: 'Screen live view - Optional', required: false },
  ];

  if (loading) return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#00d4ff" /></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>🛡️ KidShield Setup</Text>
      <Text style={s.subtitle}>Grant permissions to enable monitoring</Text>
      
      <View style={s.progressCard}>
        <Text style={s.progressLabel}>{grantedCount}/{totalCount} Permissions Granted</Text>
        <View style={s.progressBar}><View style={[s.progressFill, { width: `${(grantedCount / totalCount) * 100}%` }]} /></View>
      </View>

      {permList.map(p => (
        <View key={p.key} style={[s.card, permissions[p.key] && s.cardGranted]}>
          <View style={s.cardRow}>
            <Text style={s.permIcon}>{p.icon}</Text>
            <View style={s.permInfo}>
              <Text style={s.permTitle}>{p.title}{p.required && <Text style={s.required}> *</Text>}</Text>
              <Text style={s.permDesc}>{p.desc}</Text>
            </View>
            {permissions[p.key] ? ( <Text style={s.granted}>✅</Text> ) : (
              <TouchableOpacity style={s.allowBtn} onPress={() => requestPermission(p.key)} disabled={checking === p.key}>
                {checking === p.key ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.allowBtnText}>Allow</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      <TouchableOpacity style={[s.doneBtn, !allRequired && s.doneBtnDisabled]} onPress={completeSetup}>
        <Text style={s.doneBtnText}>{allRequired ? '✅ Setup Complete - Start!' : '⚠️ Required permissions pending'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.skipBtn} onPress={() => navigation?.replace('ChildApp')}>
        <Text style={s.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060b14' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#8899aa', textAlign: 'center', marginBottom: 24 },
  progressCard: { backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a' },
  progressLabel: { color: '#fff', fontWeight: '700', marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#1e2d4a', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#00d4ff', borderRadius: 4 },
  card: { backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e2d4a' },
  cardGranted: { borderColor: '#00cc88', backgroundColor: '#0a1a12' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  permIcon: { fontSize: 28 }, permInfo: { flex: 1 },
  permTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  required: { color: '#ff4444' }, permDesc: { fontSize: 11, color: '#8899aa', marginTop: 2 },
  granted: { fontSize: 20 },
  allowBtn: { backgroundColor: '#00d4ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  allowBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  doneBtn: { backgroundColor: '#00d4ff', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 16 },
  doneBtnDisabled: { backgroundColor: '#1e2d4a' },
  doneBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  skipBtn: { alignItems: 'center', padding: 12, marginTop: 8 },
  skipText: { color: '#8899aa', fontSize: 13 },
});