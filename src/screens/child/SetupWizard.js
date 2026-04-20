import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Linking, PermissionsAndroid, Platform
} from 'react-native';
import { NativeModules } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const { KidShieldModule, ScreenMirror } = NativeModules;

const PERMISSIONS_LIST = [
  {
    key: 'location',
    title: 'Location Access',
    desc: 'Parent can track your real-time location for safety',
    icon: 'L',
    check: async () => {
      const r = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return r;
    },
    request: async () => {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Location Permission',
        message: 'KidShield needs location to keep you safe',
        buttonPositive: 'Allow',
      });
      return r === PermissionsAndroid.RESULTS.GRANTED;
    },
  },
  {
    key: 'camera',
    title: 'Camera Access',
    desc: 'Parent can check you are safe using remote camera',
    icon: 'C',
    check: async () => {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    },
    request: async () => {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
        title: 'Camera Permission',
        message: 'KidShield needs camera for safety monitoring',
        buttonPositive: 'Allow',
      });
      return r === PermissionsAndroid.RESULTS.GRANTED;
    },
  },
  {
    key: 'microphone',
    title: 'Microphone Access',
    desc: 'Parent can listen to ensure you are safe',
    icon: 'M',
    check: async () => {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    },
    request: async () => {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission',
        message: 'KidShield needs microphone for safety monitoring',
        buttonPositive: 'Allow',
      });
      return r === PermissionsAndroid.RESULTS.GRANTED;
    },
  },
  {
    key: 'usage',
    title: 'App Usage Access',
    desc: 'Track which apps you use and for how long',
    icon: 'U',
    check: async () => false,
    request: async () => {
      Linking.openSettings();
      return false;
    },
    openSettings: true,
  },
  {
    key: 'accessibility',
    title: 'Accessibility Service',
    desc: 'Allows KidShield to block restricted apps',
    icon: 'A',
    check: async () => false,
    request: async () => {
      if (KidShieldModule?.openAccessibilitySettings) {
        await KidShieldModule.openAccessibilitySettings();
      } else {
        Linking.openSettings();
      }
      return false;
    },
    openSettings: true,
  },
  {
    key: 'deviceAdmin',
    title: 'Device Administrator',
    desc: 'Prevents app from being uninstalled without parent permission',
    icon: 'D',
    check: async () => {
      if (KidShieldModule?.isDeviceAdminEnabled) {
        return await KidShieldModule.isDeviceAdminEnabled();
      }
      return false;
    },
    request: async () => {
      if (KidShieldModule?.requestDeviceAdmin) {
        await KidShieldModule.requestDeviceAdmin();
      }
      return false;
    },
  },
];

export default function SetupWizard({ navigation }) {
  const [permStatus, setPermStatus] = useState({});
  const [loading, setLoading] = useState({});

  useEffect(() => {
    checkAllPermissions();
  }, []);

  const checkAllPermissions = async () => {
    const status = {};
    for (const perm of PERMISSIONS_LIST) {
      try { status[perm.key] = await perm.check(); } catch (e) { status[perm.key] = false; }
    }
    setPermStatus(status);
  };

  const requestPermission = async (perm) => {
    setLoading(prev => ({ ...prev, [perm.key]: true }));
    try {
      const granted = await perm.request();
      setPermStatus(prev => ({ ...prev, [perm.key]: granted }));
      if (!granted && perm.openSettings) {
        Alert.alert('Settings Required', 'Please enable ' + perm.title + ' in Settings manually', [
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
          { text: 'OK' },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(prev => ({ ...prev, [perm.key]: false }));
    }
  };

  const completeSetup = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (uid) {
        await firestore().collection('users').doc(uid).update({ setupDone: true });
      }
      Alert.alert('Setup Complete!', 'KidShield is now protecting this device!', [
        { text: 'OK', onPress: () => navigation?.replace?.('ChildApp') || navigation?.goBack?.() }
      ]);
    } catch (e) {
      navigation?.goBack?.();
    }
  };

  const grantedCount = Object.values(permStatus).filter(Boolean).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.title}>KidShield Setup</Text>
        <Text style={styles.subtitle}>Enable permissions to activate protection</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(grantedCount / PERMISSIONS_LIST.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{grantedCount}/{PERMISSIONS_LIST.length} permissions granted</Text>
      </View>

      {PERMISSIONS_LIST.map((perm) => (
        <View key={perm.key} style={[styles.card, permStatus[perm.key] && styles.cardGranted]}>
          <View style={[styles.iconCircle, permStatus[perm.key] && styles.iconGranted]}>
            <Text style={styles.iconText}>{permStatus[perm.key] ? 'OK' : perm.icon}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.permTitle}>{perm.title}</Text>
            <Text style={styles.permDesc}>{perm.desc}</Text>
          </View>
          {permStatus[perm.key] ? (
            <Text style={styles.grantedText}>Granted</Text>
          ) : (
            <TouchableOpacity
              style={styles.btn}
              onPress={() => requestPermission(perm)}
              disabled={loading[perm.key]}>
              <Text style={styles.btnText}>{loading[perm.key] ? '...' : 'Allow'}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <TouchableOpacity style={styles.doneBtn} onPress={completeSetup}>
        <Text style={styles.doneBtnText}>
          {grantedCount >= 3 ? 'Complete Setup' : 'Skip & Continue'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14', padding: 20 },
  header: { alignItems: 'center', marginTop: 50, marginBottom: 30 },
  title: { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8899aa', marginBottom: 16 },
  progressBar: { width: '100%', height: 6, backgroundColor: '#1e2d4a', borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 6, backgroundColor: '#00d4ff', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#8899aa' },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111d35', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#1e2d4a',
  },
  cardGranted: { borderColor: '#00cc88', backgroundColor: 'rgba(0,204,136,0.05)' },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1e2d4a', alignItems: 'center', justifyContent: 'center',
  },
  iconGranted: { backgroundColor: 'rgba(0,204,136,0.2)' },
  iconText: { color: '#00d4ff', fontWeight: '700', fontSize: 12 },
  permTitle: { color: '#ffffff', fontWeight: '600', fontSize: 14, marginBottom: 2 },
  permDesc: { color: '#8899aa', fontSize: 12, lineHeight: 18 },
  grantedText: { color: '#00cc88', fontSize: 12, fontWeight: '700' },
  btn: { backgroundColor: '#00d4ff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  doneBtn: {
    backgroundColor: '#00d4ff', padding: 18, borderRadius: 14,
    alignItems: 'center', marginTop: 8,
  },
  doneBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
