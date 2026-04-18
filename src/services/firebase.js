// src/services/firebase.js
// Firebase configuration and helper functions

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';

// ==================== AUTH HELPERS ====================

export const getCurrentUser = () => auth().currentUser;

export const signIn = async (email, password) => {
  const credential = await auth().signInWithEmailAndPassword(email, password);
  return credential.user;
};

export const signUp = async (email, password, name, role) => {
  const credential = await auth().createUserWithEmailAndPassword(email, password);
  await credential.user.updateProfile({ displayName: name });

  await firestore().collection('users').doc(credential.user.uid).set({
    name,
    email,
    role,
    createdAt: firestore.FieldValue.serverTimestamp(),
    children: [],
    parentId: null,
    fcmToken: null,
  });

  return credential.user;
};

export const signOut = async () => {
  await auth().signOut();
};

export const onAuthChange = (callback) => {
  return auth().onAuthStateChanged(callback);
};

// ==================== USER HELPERS ====================

export const getUserData = async (uid) => {
  const doc = await firestore().collection('users').doc(uid || getCurrentUser()?.uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

export const updateUserData = async (data, uid) => {
  await firestore().collection('users').doc(uid || getCurrentUser()?.uid).update(data);
};

export const getChildren = async (parentId) => {
  const snap = await firestore().collection('users')
    .where('parentId', '==', parentId || getCurrentUser()?.uid)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ==================== APP CONTROL HELPERS ====================

export const getAppControls = async (parentId) => {
  const snap = await firestore().collection('appControls')
    .where('parentId', '==', parentId || getCurrentUser()?.uid)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const setAppControl = async (appName, packageName, blocked, timeLimit, parentId) => {
  const pid = parentId || getCurrentUser()?.uid;
  const ref = firestore().collection('appControls').doc(`${pid}_${packageName}`);
  await ref.set({
    parentId: pid,
    appName,
    packageName,
    blocked,
    timeLimit, // minutes per day, 0 = unlimited
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};

export const listenAppControls = (parentId, callback) => {
  return firestore().collection('appControls')
    .where('parentId', '==', parentId)
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
};

// ==================== LOCATION HELPERS ====================

export const updateChildLocation = async (lat, lng, accuracy) => {
  const uid = getCurrentUser()?.uid;
  if (!uid) return;

  await firestore().collection('locations').doc(uid).set({
    lat,
    lng,
    accuracy,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
};

export const getChildLocation = async (childId) => {
  const doc = await firestore().collection('locations').doc(childId).get();
  return doc.exists ? doc.data() : null;
};

export const listenChildLocation = (childId, callback) => {
  return firestore().collection('locations').doc(childId)
    .onSnapshot(doc => {
      if (doc.exists) callback(doc.data());
    });
};

// ==================== GEOFENCE HELPERS ====================

export const getGeofences = async (childId) => {
  const snap = await firestore().collection('geofences')
    .where('childId', '==', childId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const addGeofence = async (childId, name, lat, lng, radius) => {
  return await firestore().collection('geofences').add({
    childId,
    name,
    lat,
    lng,
    radius,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
};

export const deleteGeofence = async (fenceId) => {
  await firestore().collection('geofences').doc(fenceId).delete();
};

// ==================== USAGE LOG HELPERS ====================

export const logAppUsage = async (childId, appName, packageName, durationMs) => {
  await firestore().collection('usageLogs').add({
    childId,
    appName,
    packageName,
    durationMs,
    date: firestore.FieldValue.serverTimestamp(),
  });
};

export const getWeeklyUsage = async (childId) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snap = await firestore().collection('usageLogs')
    .where('childId', '==', childId)
    .where('date', '>=', weekAgo)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ==================== ALERT HELPERS ====================

export const createAlert = async (childId, type, message) => {
  const childDoc = await firestore().collection('users').doc(childId).get();
  const parentId = childDoc.data()?.parentId;

  if (!parentId) return;

  await firestore().collection('alerts').add({
    childId,
    parentId,
    type, // 'location' | 'app' | 'sos' | 'bedtime'
    message,
    createdAt: firestore.FieldValue.serverTimestamp(),
    read: false,
  });
};

export const getAlerts = async (parentId) => {
  const snap = await firestore().collection('alerts')
    .where('parentId', '==', parentId || getCurrentUser()?.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const markAlertRead = async (alertId) => {
  await firestore().collection('alerts').doc(alertId).update({ read: true });
};

export const listenAlerts = (parentId, callback) => {
  return firestore().collection('alerts')
    .where('parentId', '==', parentId)
    .where('read', '==', false)
    .onSnapshot(snap => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
};

// ==================== FCM (PUSH NOTIFICATIONS) ====================

export const initFCM = async () => {
  const uid = getCurrentUser()?.uid;
  if (!uid) return;

  // Request permission
  const authStatus = await messaging().requestPermission();
  const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED
    || authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) return null;

  // Get token
  const token = await messaging().getToken();

  // Save token to Firestore
  await firestore().collection('users').doc(uid).update({ fcmToken: token });

  // Listen for token refresh
  messaging().onTokenRefresh(async (newToken) => {
    await firestore().collection('users').doc(uid).update({ fcmToken: newToken });
  });

  return token;
};

export const onForegroundMessage = (callback) => {
  return messaging().onMessage(callback);
};

// ==================== PAIRING HELPERS ====================

export const generatePairingCode = async (parentId) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  await firestore().collection('pairingCodes').doc(code).set({
    parentId,
    parentName: getCurrentUser()?.displayName,
    createdAt: firestore.FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    used: false,
  });
  return code;
};

export const usePairingCode = async (code, childId) => {
  const codeDoc = await firestore().collection('pairingCodes').doc(code).get();

  if (!codeDoc.exists) throw new Error('INVALID_CODE');

  const data = codeDoc.data();
  if (data.used) throw new Error('CODE_USED');
  if (new Date(data.expiresAt.toDate()) < new Date()) throw new Error('CODE_EXPIRED');

  // Link child to parent
  await firestore().collection('users').doc(childId).update({
    parentId: data.parentId,
    linkedAt: firestore.FieldValue.serverTimestamp(),
  });

  await firestore().collection('users').doc(data.parentId).update({
    children: firestore.FieldValue.arrayUnion(childId),
  });

  await firestore().collection('pairingCodes').doc(code).update({ used: true });

  return data;
};

// ==================== SETTINGS HELPERS ====================

export const getSettings = async (uid) => {
  const doc = await firestore().collection('settings').doc(uid || getCurrentUser()?.uid).get();
  return doc.exists ? doc.data() : {};
};

export const saveSettings = async (settings, uid) => {
  await firestore().collection('settings').doc(uid || getCurrentUser()?.uid)
    .set(settings, { merge: true });
};

export default {
  getCurrentUser, signIn, signUp, signOut, onAuthChange,
  getUserData, updateUserData, getChildren,
  getAppControls, setAppControl, listenAppControls,
  updateChildLocation, getChildLocation, listenChildLocation,
  getGeofences, addGeofence, deleteGeofence,
  logAppUsage, getWeeklyUsage,
  createAlert, getAlerts, markAlertRead, listenAlerts,
  initFCM, onForegroundMessage,
  generatePairingCode, usePairingCode,
  getSettings, saveSettings,
};
