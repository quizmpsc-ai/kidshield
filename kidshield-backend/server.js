// KidShield Backend - Node.js + Express + Firebase Admin
// server.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const admin = require('firebase-admin');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// ── Firebase Admin Init ──
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const messaging = admin.messaging();

// ── Express Setup ──
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Middleware: Verify Firebase Token ──
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════

// ── Health Check ──
app.get('/health', (req, res) => res.json({ status: 'KidShield API running ✓', time: new Date() }));

// ────────────────────────────────
// AUTH ROUTES
// ────────────────────────────────

// Register user (parent or child)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { uid, role, name, email, paringCode } = req.body;
    const userData = {
      uid, role, name, email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isActive: true,
    };
    if (role === 'child' && paringCode) {
      // Find parent by pairing code
      const parentSnap = await db.collection('pairingCodes').doc(paringCode).get();
      if (!parentSnap.exists) return res.status(404).json({ error: 'Invalid pairing code' });
      userData.parentId = parentSnap.data().parentId;
      await db.collection('pairingCodes').doc(paringCode).delete();
    }
    await db.collection('users').doc(uid).set(userData);
    res.json({ success: true, user: userData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Generate pairing code (parent generates, child scans)
app.post('/api/auth/pairing-code', verifyToken, async (req, res) => {
  try {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('pairingCodes').doc(code).set({
      parentId: req.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
    });
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────
// USAGE STATS ROUTES
// ────────────────────────────────

// Child app reports usage stats
app.post('/api/usage/report', verifyToken, async (req, res) => {
  try {
    const { date, apps, totalMinutes } = req.body;
    const childId = req.uid;

    // Get parent ID
    const userDoc = await db.collection('users').doc(childId).get();
    const parentId = userDoc.data()?.parentId;
    if (!parentId) return res.status(400).json({ error: 'No parent linked' });

    const docId = `${childId}_${date}`;
    await db.collection('usageStats').doc(docId).set({
      childId, parentId, date,
      apps, // array of { packageName, appName, minutesUsed }
      totalMinutes,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Check limits & send alerts
    await checkAppLimits(childId, parentId, apps);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get usage history
app.get('/api/usage/:childId', verifyToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const snap = await db.collection('usageStats')
      .where('childId', '==', childId)
      .where('parentId', '==', req.uid)
      .orderBy('date', 'desc')
      .limit(parseInt(days))
      .get();

    const stats = snap.docs.map(d => d.data());
    res.json({ stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────
// LOCATION ROUTES
// ────────────────────────────────

// Child reports location
app.post('/api/location/update', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, address } = req.body;
    const childId = req.uid;

    const userDoc = await db.collection('users').doc(childId).get();
    const parentId = userDoc.data()?.parentId;

    const locationData = {
      childId, parentId,
      latitude, longitude, accuracy,
      address: address || '',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save to locations collection
    await db.collection('locations').add(locationData);

    // Update user's last known location
    await db.collection('users').doc(childId).update({
      lastLocation: { latitude, longitude, address, updatedAt: new Date().toISOString() }
    });

    // Check geo-fences
    await checkGeoFences(childId, parentId, latitude, longitude);

    // Broadcast to parent via Socket.io
    io.to(`parent_${parentId}`).emit('locationUpdate', { childId, latitude, longitude, address });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get location history
app.get('/api/location/:childId/history', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('locations')
      .where('childId', '==', req.params.childId)
      .where('parentId', '==', req.uid)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    res.json({ locations: snap.docs.map(d => d.data()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────
// APP RULES ROUTES
// ────────────────────────────────

// Set app rule (parent)
app.post('/api/rules/app', verifyToken, async (req, res) => {
  try {
    const { childId, packageName, appName, dailyLimitMinutes, isBlocked, blockFrom, blockUntil, category } = req.body;
    const ruleId = `${childId}_${packageName}`;

    await db.collection('appRules').doc(ruleId).set({
      parentId: req.uid, childId, packageName, appName,
      dailyLimitMinutes: dailyLimitMinutes || 0,
      isBlocked: isBlocked || false,
      blockFrom: blockFrom || null,
      blockUntil: blockUntil || null,
      category: category || 'other',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Notify child device to update rules
    await sendCommandToChild(childId, 'UPDATE_RULES', {});

    res.json({ success: true, ruleId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all rules for a child
app.get('/api/rules/:childId', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('appRules')
      .where('childId', '==', req.params.childId)
      .where('parentId', '==', req.uid)
      .get();
    res.json({ rules: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────
// COMMANDS ROUTES
// ────────────────────────────────

// Send command to child device
app.post('/api/commands/send', verifyToken, async (req, res) => {
  try {
    const { childId, command, data } = req.body;
    // Verify parent-child relationship
    const childDoc = await db.collection('users').doc(childId).get();
    if (childDoc.data()?.parentId !== req.uid) return res.status(403).json({ error: 'Unauthorized' });

    await sendCommandToChild(childId, command, data);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Child polls for pending commands
app.get('/api/commands/pending', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('commands')
      .where('childId', '==', req.uid)
      .where('status', '==', 'pending')
      .get();

    const commands = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Mark as delivered
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { status: 'delivered' }));
    await batch.commit();

    res.json({ commands });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────
// GEOFENCE ROUTES
// ────────────────────────────────

app.post('/api/geofence', verifyToken, async (req, res) => {
  try {
    const { childId, name, latitude, longitude, radius, isActive } = req.body;
    await db.collection('geofences').add({
      parentId: req.uid, childId, name,
      latitude, longitude,
      radius: radius || 200, // meters
      isActive: isActive !== false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────
// SOS ROUTE
// ────────────────────────────────

app.post('/api/sos', verifyToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const childId = req.uid;

    const userDoc = await db.collection('users').doc(childId).get();
    const { parentId, name } = userDoc.data();

    // Save SOS event
    await db.collection('sosEvents').add({
      childId, parentId, latitude, longitude,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send urgent push notification to parent
    const parentDoc = await db.collection('users').doc(parentId).get();
    const parentFCMToken = parentDoc.data()?.fcmToken;

    if (parentFCMToken) {
      await messaging.send({
        token: parentFCMToken,
        notification: {
          title: '🆘 SOS Alert!',
          body: `${name} ने SOS दाबला! ताबडतोब बघा.`,
        },
        data: { type: 'SOS', childId, latitude: String(latitude), longitude: String(longitude) },
        android: { priority: 'high', notification: { channelId: 'sos_channel' } },
      });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════

async function sendCommandToChild(childId, command, data) {
  await db.collection('commands').add({
    childId, command, data: data || {},
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Also try FCM if child has token
  const childDoc = await db.collection('users').doc(childId).get();
  const fcmToken = childDoc.data()?.fcmToken;
  if (fcmToken) {
    try {
      await messaging.send({
        token: fcmToken,
        data: { type: 'COMMAND', command, payload: JSON.stringify(data || {}) },
        android: { priority: 'high' },
      });
    } catch (e) { console.log('FCM send failed:', e.message); }
  }
}

async function checkAppLimits(childId, parentId, apps) {
  const rulesSnap = await db.collection('appRules')
    .where('childId', '==', childId).get();
  const rules = {};
  rulesSnap.docs.forEach(d => { rules[d.data().packageName] = d.data(); });

  for (const app of apps) {
    const rule = rules[app.packageName];
    if (rule?.dailyLimitMinutes && app.minutesUsed >= rule.dailyLimitMinutes) {
      await sendAlertToParent(parentId, childId, {
        title: '⏱️ Time Limit Reached',
        body: `${app.appName} साठी ${rule.dailyLimitMinutes} min limit संपली.`,
        icon: '⏱️',
        type: 'TIME_LIMIT',
      });
    }
  }
}

async function checkGeoFences(childId, parentId, lat, lng) {
  const fencesSnap = await db.collection('geofences')
    .where('childId', '==', childId)
    .where('isActive', '==', true).get();

  for (const fence of fencesSnap.docs) {
    const { latitude, longitude, radius, name } = fence.data();
    const distance = getDistance(lat, lng, latitude, longitude);
    if (distance > radius) {
      await sendAlertToParent(parentId, childId, {
        title: '📍 Geo-fence Alert',
        body: `${name} area बाहेर गेला/गेली.`,
        icon: '📍', type: 'GEOFENCE',
      });
    }
  }
}

async function sendAlertToParent(parentId, childId, alert) {
  await db.collection('alerts').add({
    parentId, childId, ...alert,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const parentDoc = await db.collection('users').doc(parentId).get();
  const fcmToken = parentDoc.data()?.fcmToken;
  if (fcmToken) {
    try {
      await messaging.send({
        token: fcmToken,
        notification: { title: alert.title, body: alert.body },
        data: { type: alert.type, childId },
        android: { priority: 'high', notification: { channelId: 'alerts_channel' } },
      });
    } catch (e) { console.log('Alert FCM failed:', e.message); }
  }
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Socket.io ──
io.on('connection', (socket) => {
  socket.on('joinRoom', ({ userId, role }) => {
    socket.join(`${role}_${userId}`);
  });
});

// ── Start Server ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🛡️ KidShield API running on port ${PORT}`);
});
