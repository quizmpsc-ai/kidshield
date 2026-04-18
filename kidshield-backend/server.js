const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Init - Environment Variables वापरून
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    }),
  });
}

const db = admin.firestore();

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'KidShield API running' });
});

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role, name } = req.body;
    const user = await admin.auth().createUser({ email, password, displayName: name });
    await db.collection('users').doc(user.uid).set({
      uid: user.uid, email, name, role, createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, uid: user.uid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Pairing Code Generate
app.post('/api/pairing/generate', async (req, res) => {
  try {
    const { parentId } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('pairingCodes').doc(code).set({
      parentId, code, createdAt: admin.firestore.FieldValue.serverTimestamp(), used: false
    });
    res.json({ success: true, code });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Pairing Code Use
app.post('/api/pairing/use', async (req, res) => {
  try {
    const { code, childId } = req.body;
    const doc = await db.collection('pairingCodes').doc(code).get();
    if (!doc.exists || doc.data().used) return res.status(400).json({ error: 'Invalid code' });
    const { parentId } = doc.data();
    await db.collection('pairingCodes').doc(code).update({ used: true, childId });
    await db.collection('users').doc(parentId).collection('children').doc(childId).set({
      childId, pairedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(childId).update({ parentId });
    res.json({ success: true, parentId });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Location Update
app.post('/api/location/update', async (req, res) => {
  try {
    const { childId, latitude, longitude, timestamp } = req.body;
    await db.collection('locations').doc(childId).set({
      childId, latitude, longitude, timestamp, updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get Location
app.get('/api/location/:childId', async (req, res) => {
  try {
    const doc = await db.collection('locations').doc(req.params.childId).get();
    res.json(doc.exists ? doc.data() : {});
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Usage Stats
app.post('/api/usage/update', async (req, res) => {
  try {
    const { childId, stats, date } = req.body;
    await db.collection('usageStats').doc(`${childId}_${date}`).set({
      childId, stats, date, updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// App Rules Set
app.post('/api/rules/set', async (req, res) => {
  try {
    const { childId, rules } = req.body;
    await db.collection('appRules').doc(childId).set({
      childId, rules, updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Send Command
app.post('/api/command/send', async (req, res) => {
  try {
    const { childId, command, params } = req.body;
    await db.collection('commands').add({
      childId, command, params, executed: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Send Alert
app.post('/api/alert/send', async (req, res) => {
  try {
    const { childId, title, body, type } = req.body;
    await db.collection('alerts').add({
      childId, title, body, type, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KidShield API running on port ${PORT}`));
