// KidShield — SecurityManager.js (Session 6)
// Certificate Pinning + Root Detection + Anti-Tamper + Firebase App Check

import { NativeModules, Platform, Alert } from 'react-native';
import RNSslPinning from 'react-native-ssl-pinning';
import firebase from '@react-native-firebase/app';
import appCheck from '@react-native-firebase/app-check';

// ══════════════════════════════════════════
// CERTIFICATE PINNING
// SSL pinning — man-in-the-middle attacks रोखतो
// ══════════════════════════════════════════

const PINNED_CERTS = {
  // Railway backend certificate SHA-256 fingerprints
  // openssl s_client -connect your-backend.railway.app:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
  backend: [
    'sha256/REPLACE_WITH_YOUR_RAILWAY_CERT_HASH_1=',
    'sha256/REPLACE_WITH_YOUR_RAILWAY_CERT_HASH_2=', // backup pin
  ],
  firebase: [
    'sha256/s/xOsNnNOy3kKMBxeVlSh0q8GzrUiqJQtHFVE2IPKXA=',
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // backup
  ],
};

export const pinnedFetch = async (url, options = {}) => {
  try {
    const response = await RNSslPinning.fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body,
      sslPinning: {
        certs: ['cert1', 'cert2'], // assets/certs/ मध्ये .cer files ठेवा
      },
      timeoutInterval: 10000,
    });
    return response;
  } catch (err) {
    if (err.message?.includes('SSL')) {
      console.error('[SecurityManager] SSL Pinning failed — possible MITM attack!');
      Alert.alert(
        'Security Alert',
        'Secure connection could not be established. Please check your network.',
        [{ text: 'OK' }]
      );
      throw new Error('SSL_PINNING_FAILED');
    }
    throw err;
  }
};

// ══════════════════════════════════════════
// ROOT DETECTION
// ══════════════════════════════════════════

const ROOT_INDICATORS = [
  '/system/app/Superuser.apk',
  '/sbin/su',
  '/system/bin/su',
  '/system/xbin/su',
  '/data/local/xbin/su',
  '/data/local/bin/su',
  '/system/sd/xbin/su',
  '/system/bin/failsafe/su',
  '/data/local/su',
  '/su/bin/su',
];

const ROOTING_APPS = [
  'com.noshufou.android.su',
  'com.noshufou.android.su.elite',
  'eu.chainfire.supersu',
  'com.koushikdutta.superuser',
  'com.thirdparty.superuser',
  'com.yellowes.su',
  'com.topjohnwu.magisk',
  'io.github.huskydg.magisk',
  'com.kingroot.kinguser',
  'com.kingo.android.root',
];

export const checkRootStatus = async () => {
  try {
    const { KidShieldSecurity } = NativeModules;
    if (!KidShieldSecurity) {
      console.warn('[SecurityManager] Native security module not found');
      return { isRooted: false, reason: 'module_unavailable' };
    }

    const result = await KidShieldSecurity.checkRootStatus();
    return result;
  } catch (err) {
    console.error('[SecurityManager] Root check error:', err);
    return { isRooted: false, reason: 'check_failed' };
  }
};

export const handleRootDetected = async (parentFCMToken) => {
  // Parent ला immediate alert पाठवा
  try {
    const response = await pinnedFetch(
      `${process.env.BACKEND_URL}/api/security/root-alert`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await firebase.auth().currentUser?.getIdToken()}`,
        },
        body: JSON.stringify({
          childId: firebase.auth().currentUser?.uid,
          timestamp: new Date().toISOString(),
          alertType: 'ROOT_DETECTED',
        }),
      }
    );

    Alert.alert(
      '⚠️ Security Issue',
      'Your device has been modified. Your parents have been notified.',
      [{ text: 'OK' }]
    );
  } catch (err) {
    console.error('[SecurityManager] Failed to send root alert:', err);
  }
};

// ══════════════════════════════════════════
// ANTI-TAMPER — App Uninstall Detection
// ══════════════════════════════════════════

export const setupUninstallProtection = async (childId) => {
  try {
    const { KidShieldSecurity } = NativeModules;
    if (!KidShieldSecurity) return;

    // Device Admin rights activate केले तर uninstall lock होतो
    const isDeviceAdmin = await KidShieldSecurity.isDeviceAdminActive();
    if (!isDeviceAdmin) {
      // Parent app ने approve केले असेल तरच
      await KidShieldSecurity.requestDeviceAdmin();
    }

    // Accessibility service चालू आहे का check करा
    const isAccessibilityOn = await KidShieldSecurity.isAccessibilityServiceEnabled();
    if (!isAccessibilityOn) {
      Alert.alert(
        'Setup Required',
        'Please enable KidShield in Accessibility Settings to continue.',
        [
          {
            text: 'Open Settings',
            onPress: () => KidShieldSecurity.openAccessibilitySettings(),
          },
        ]
      );
    }
  } catch (err) {
    console.error('[SecurityManager] Uninstall protection setup failed:', err);
  }
};

// ══════════════════════════════════════════
// FIREBASE APP CHECK
// Unauthorized API calls रोखतो
// ══════════════════════════════════════════

export const initializeAppCheck = async () => {
  try {
    const appCheckInstance = appCheck();

    if (__DEV__) {
      // Development मध्ये debug token वापरा
      await appCheckInstance.initializeAppCheck({
        provider: new appCheckInstance.ReactNativeFirebaseAppCheckProviderOptions(
          {
            debugToken: process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN,
          }
        ),
        isTokenAutoRefreshEnabled: true,
      });
    } else {
      // Production — Play Integrity API (Android) वापरतो
      await appCheckInstance.initializeAppCheck({
        provider: new appCheckInstance.PlayIntegrityProvider(),
        isTokenAutoRefreshEnabled: true,
      });
    }

    console.log('[SecurityManager] Firebase App Check initialized ✅');
  } catch (err) {
    console.error('[SecurityManager] App Check init failed:', err);
  }
};

// ══════════════════════════════════════════
// COMPLETE SECURITY INITIALIZATION
// App startup वर call करा
// ══════════════════════════════════════════

export const initializeSecurity = async (userRole = 'parent') => {
  const results = {
    appCheck: false,
    rootDetection: null,
    uninstallProtection: false,
  };

  // 1. Firebase App Check
  await initializeAppCheck();
  results.appCheck = true;

  // 2. Root Detection (child device वरच करायचे)
  if (userRole === 'child') {
    const rootStatus = await checkRootStatus();
    results.rootDetection = rootStatus;

    if (rootStatus.isRooted) {
      console.warn('[SecurityManager] 🚨 ROOT DETECTED:', rootStatus.reason);
      await handleRootDetected();
    }

    // 3. Uninstall Protection (child device)
    await setupUninstallProtection(firebase.auth().currentUser?.uid);
    results.uninstallProtection = true;
  }

  return results;
};

export default {
  pinnedFetch,
  checkRootStatus,
  handleRootDetected,
  setupUninstallProtection,
  initializeAppCheck,
  initializeSecurity,
};
