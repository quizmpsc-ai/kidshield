import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, PermissionsAndroid, Linking, ActivityIndicator,
} from 'react-native';
import { NativeModules } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { KidShieldModule, ScreenMirror } = NativeModules;

export default function SetupWizard({ navigation }) {
  const [permissions, setPermissions] = useState({
    location: false,
    camera: false,
    microphone: false,
    usageStats: false,
    accessibility: false,
    deviceAdmin: false,
    screenCapture: false,
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState('');

  useEffect(() => {
    checkAllPermissions();
  }, []);

  const checkAllPermissions = async () => {
    setLoading(true);
    const location = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    const microphone = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    const deviceAdmin = KidShieldModule ? await KidShieldModule.isDeviceAdminEnabled() : false;

    setPermissions({
      location,
      camera,
      microphone,
      usageStats: false, // checked via AppOps, assume pending
      accessibility: false, // need to open settings to check
      deviceAdmin,
      screenCapture: false,
    });
    setLoading(false);
  };

  const requestPermission = async (type) => {
    setChecking(type);
    try {
      switch (type) {
        case 'location':
          const locResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location Permission',
              message: 'KidShield à¤²à¤¾ à¤¤à¥à¤®à¤šà¥‡ location track à¤•à¤°à¤¾à¤¯à¤²à¤¾ permission à¤¹à¤µà¥€.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            }
          );
          const locGranted = locResult === PermissionsAndroid.RESULTS.GRANTED;
          // Also request background location
          if (locGranted) {
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
              {
                title: 'Background Location',
                message: 'App background à¤®à¤§à¥à¤¯à¥‡ à¤…à¤¸à¤¤à¤¾à¤¨à¤¾ à¤ªà¤£ location track à¤•à¤°à¤¾à¤¯à¤²à¤¾.',
                buttonPositive: 'Allow Always',
              }
            );
          }
          setPermissions(p => ({ ...p, location: locGranted }));
          break;

        case 'camera':
          const camResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CAMERA,
            {
              title: 'Camera Permission',
              message: 'Parent à¤²à¤¾ remote camera access à¤•à¤°à¤¾à¤¯à¤²à¤¾ permission à¤¹à¤µà¥€.',
              buttonPositive: 'Allow',
            }
          );
          setPermissions(p => ({ ...p, camera: camResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;

        case 'microphone':
          const micResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: 'Microphone Permission',
              message: 'Parent à¤²à¤¾ ambient audio monitor à¤•à¤°à¤¾à¤¯à¤²à¤¾ permission à¤¹à¤µà¥€.',
              buttonPositive: 'Allow',
            }
          );
          setPermissions(p => ({ ...p, microphone: micResult === PermissionsAndroid.RESULTS.GRANTED }));
          break;

        case 'usageStats':
          Alert.alert(
            'Usage Access',
            'Settings à¤‰à¤˜à¤¡à¥‡à¤². "KidShield" à¤¶à¥‹à¤§à¤¾ à¤†à¤£à¤¿ enable à¤•à¤°à¤¾.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.sendIntent('android.settings.USAGE_ACCESS_SETTINGS');
                  setTimeout(() => setPermissions(p => ({ ...p, usageStats: true })), 3000);
                }
              }
            ]
          );
          break;

        case 'accessibility':
          Alert.alert(
            'Accessibility Service',
            'Settings à¤‰à¤˜à¤¡à¥‡à¤². "Installed Apps" â†’ "KidShield" â†’ Enable à¤•à¤°à¤¾.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: async () => {
                  if (KidShieldModule) await KidShieldModule.openAccessibilitySettings();
                  else Linking.openSettings();
                  setTimeout(() => setPermissions(p => ({ ...p, accessibility: true })), 3000);
                }
              }
            ]
          );
          break;

        case 'deviceAdmin':
          Alert.alert(
            'Device Admin',
            'KidShield à¤²à¤¾ uninstall à¤¹à¥‹à¤£à¥à¤¯à¤¾à¤ªà¤¾à¤¸à¥‚à¤¨ à¤°à¥‹à¤–à¤¾à¤¯à¤²à¤¾ Device Admin enable à¤•à¤°à¤¾.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Enable',
                onPress: async () => {
                  if (KidShieldModule) {
                    await KidShieldModule.requestDeviceAdmin();
                    setTimeout(async () => {
                      const enabled = await KidShieldModule.isDeviceAdminEnabled();
                      setPermissions(p => ({ ...p, deviceAdmin: enabled }));
                    }, 2000);
                  }
                }
              }
            ]
          );
          break;

        case 'screenCapture':
          Alert.alert(
            'Screen Capture',
            'Parent screen monitor à¤•à¤°à¥‚ à¤¶à¤•à¥‡à¤². Allow à¤•à¤°à¤¾à¤¯à¤šà¥‡ à¤•à¤¾?',
            [
              { text: 'Deny', style: 'cancel' },
              {
                text: 'Allow',
                onPress: async () => {
                  if (ScreenMirror) {
                    try {
                      await ScreenMirror.requestPermission();
                      setPermissions(p => ({ ...p, screenCapture: true }));
                    } catch (e) {
                      Alert.alert('Denied', 'Screen capture permission denied.');
                    }
                  }
                }
              }
            ]
          );
          break;
      }
    } catch (e) {
      console.error('Permission error:', type, e);
    }
    setChecking('');
  };

  const completeSetup = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (uid) {
        await firestore().collection('users').doc(uid).update({
          setupDone: true,
          permissions: permissions,
          setupAt: firestore.FieldValue.serverTimestamp(),
        });
      }
      navigation?.replace('ChildApp');
    } catch (e) {
      navigation?.replace('ChildApp');
    }
  };

  const allRequired = permissions.location && permissions.camera && permissions.microphone;
  const grantedCount = Object.values(permissions).filter(Boolean).length;
  const totalCount = Object.values(permissions).length;

  const permList = [
    { key: 'location', icon: 'ðŸ“', title: 'Location', desc: 'GPS tracking - Required', required: true },
    { key: 'camera', icon: 'ðŸ“·', title: 'Camera', desc: 'Remote camera access - Required', required: true },
    { key: 'microphone', icon: 'ðŸŽ¤', title: 'Microphone', desc: 'Ambient audio monitoring - Required', required: true },
    { key: 'usageStats', icon: 'ðŸ“Š', title: 'Usage Stats', desc: 'App usage tracking - Recommended', required: false },
    { key: 'accessibility', icon: 'â™¿', title: 'Accessibility', desc: 'App blocking - Recommended', required: false },
    { key: 'deviceAdmin', icon: 'ðŸ›¡ï¸', title: 'Device Admin', desc: 'Prevent uninstall - Recommended', required: false },
    { key: 'screenCapture', icon: 'ðŸ“±', title: 'Screen Monitor', desc: 'Screen live view - Optional', required: false },
  ];

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4ff" />
        <Text style={s.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>ðŸ›¡ï¸ KidShield Setup</Text>
      <Text style={s.subtitle}>Permissions à¤¦à¥à¤¯à¤¾ à¤œà¥‡à¤£à¥‡à¤•à¤°à¥‚à¤¨ monitoring à¤•à¤¾à¤® à¤•à¤°à¥‡à¤²</Text>

      {/* Progress */}
      <View style={s.progressCard}>
        <Text style={s.progressLabel}>{grantedCount}/{totalCount} Permissions Granted</Text>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${(grantedCount / totalCount) * 100}%` }]} />
        </View>
      </View>

      {/* Permission Cards */}
      {permList.map(p => (
        <View key={p.key} style={[s.card, permissions[p.key] && s.cardGranted]}>
          <View style={s.cardRow}>
            <Text style={s.permIcon}>{p.icon}</Text>
            <View style={s.permInfo}>
              <Text style={s.permTitle}>
                {p.title}
                {p.required && <Text style={s.required}> *</Text>}
              </Text>
              <Text style={s.permDesc}>{p.desc}</Text>
            </View>
            {permissions[p.key] ? (
              <Text style={s.granted}>âœ…</Text>
            ) : (
              <TouchableOpacity
                style={s.allowBtn}
                onPress={() => requestPermission(p.key)}
                disabled={checking === p.key}>
                {checking === p.key
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={s.allowBtnText}>Allow</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* Complete Button */}
      <TouchableOpacity
        style={[s.doneBtn, !allRequired && s.doneBtnDisabled]}
        onPress={completeSetup}>
        <Text style={s.doneBtnText}>
          {allRequired ? 'âœ… Setup Complete - Start!' : 'âš ï¸ Required permissions pending'}
        </Text>
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
  loadingText: { color: '#8899aa', marginTop: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#8899aa', textAlign: 'center', marginBottom: 24 },
  progressCard: { backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a' },
  progressLabel: { color: '#fff', fontWeight: '700', marginBottom: 8 },
  progressBar: { height: 8, backgroundColor: '#1e2d4a', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#00d4ff', borderRadius: 4 },
  card: { backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e2d4a' },
  cardGranted: { borderColor: '#00cc88', backgroundColor: '#0a1a12' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  permIcon: { fontSize: 28 },
  permInfo: { flex: 1 },
  permTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  required: { color: '#ff4444' },
  permDesc: { fontSize: 11, color: '#8899aa', marginTop: 2 },
  granted: { fontSize: 20 },
  allowBtn: { backgroundColor: '#00d4ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, minWidth: 60, alignItems: 'center' },
  allowBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  doneBtn: { backgroundColor: '#00d4ff', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 16 },
  doneBtnDisabled: { backgroundColor: '#1e2d4a' },
  doneBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  skipBtn: { alignItems: 'center', padding: 12, marginTop: 8 },
  skipText: { color: '#8899aa', fontSize: 13 },
});