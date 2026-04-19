const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

app.get('/health', (req, res) => res.json({ status: 'KidShield API running', version: '1.2' }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await admin.auth().createUser({ email, password, displayName: name });
    await db.collection('users').doc(user.uid).set({ uid: user.uid, email, name, role, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, uid: user.uid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/pairing/generate', async (req, res) => {
  try {
    const { parentId } = req.body;
    if (!parentId) return res.status(400).json({ error: 'parentId required' });
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const childId = 'child_' + Date.now();
    await db.collection('pairingCodes').doc(code).set({ parentId, childId, code, createdAt: admin.firestore.FieldValue.serverTimestamp(), used: false });
    await db.collection('pairing_codes').doc(code).set({ parentId, childId, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 24*60*60*1000) });
    res.json({ success: true, code, childId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/pairing/use', async (req, res) => {
  try {
    const { code, deviceId } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    let doc = await db.collection('pairing_codes').doc(code).get();
    let collection = 'pairing_codes';
    if (!doc.exists) { doc = await db.collection('pairingCodes').doc(code).get(); collection = 'pairingCodes'; }
    if (!doc.exists) return res.status(400).json({ error: 'Invalid pairing code' });
    const { parentId, childId } = doc.data();
    await db.collection(collection).doc(code).update({ used: true, deviceId, pairedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('families').doc(parentId).collection('children').doc(childId).update({ paired: true, deviceId, pairedAt: admin.firestore.FieldValue.serverTimestamp(), deviceOnline: true });
    await db.collection('users').doc(parentId).collection('children').doc(childId).set({ childId, deviceId, pairedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ success: true, parentId, childId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/location/update', async (req, res) => {
  try {
    const { childId, parentId, latitude, longitude, locationName } = req.body;
    if (!childId || !latitude || !longitude) return res.status(400).json({ error: 'Missing fields' });
    await db.collection('locations').doc(childId).set({ childId, latitude, longitude, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    if (parentId) {
      await db.collection('families').doc(parentId).collection('children').doc(childId).update({ location: { lat: latitude, lng: longitude }, locationName: locationName || '', locationUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/location/:childId', async (req, res) => {
  try {
    const doc = await db.collection('locations').doc(req.params.childId).get();
    res.json(doc.exists ? doc.data() : {});
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/usage/update', async (req, res) => {
  try {
    const { childId, parentId, stats, date, todayMinutes } = req.body;
    if (!childId) return res.status(400).json({ error: 'childId required' });
    await db.collection('usageStats').doc(`${childId}_${date}`).set({ childId, stats, date, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    if (parentId && todayMinutes !== undefined) {
      await db.collection('families').doc(parentId).collection('children').doc(childId).update({ todayMinutes, lastSync: admin.firestore.FieldValue.serverTimestamp() });
    }
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/rules/set', async (req, res) => {
  try {
    const { childId, rules } = req.body;
    await db.collection('appRules').doc(childId).set({ childId, rules, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/command/send', async (req, res) => {
  try {
    const { childId, command, params } = req.body;
    await db.collection('commands').add({ childId, command, params, executed: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/alert/send', async (req, res) => {
  try {
    const { childId, parentId, title, body, type, severity } = req.body;
    const alertData = { childId, title, body, type, severity: severity || 'info', read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    await db.collection('alerts').add(alertData);
    if (parentId) { await db.collection('families').doc(parentId).collection('children').doc(childId).collection('alerts').add(alertData); }
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/device/status', async (req, res) => {
  try {
    const { childId, parentId, battery, deviceOnline } = req.body;
    if (parentId) { await db.collection('families').doc(parentId).collection('children').doc(childId).update({ battery, deviceOnline, lastSeen: admin.firestore.FieldValue.serverTimestamp() }); }
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/reports/pdf/:childId', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(401).json({ error: 'Token required' });
    await admin.auth().verifyIdToken(token);
    res.json({ message: 'PDF generation coming soon', childId: req.params.childId });
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KidShield API v1.2 running on port ${PORT}`));
