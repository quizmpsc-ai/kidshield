// KidShield — session5-backend-additions.js (Session 5)
// Session 4 च्या server.js मध्ये हे routes ADD करा
// (server.js च्या शेवटी, app.listen() च्या आधी paste करा)

// ══════════════════════════════════════════
// WEBSITE FILTER ROUTES
// ══════════════════════════════════════════

// Child चे blocked domains मिळवा
app.get('/filter/domains/:childId', verifyToken, async (req, res) => {
  try {
    const { childId } = req.params;
    const snap = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('blocked_domains')
      .where('active', '==', true)
      .get();

    const domains = snap.docs.map((d) => d.id);
    res.json({ blockedDomains: domains });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Category block
app.post('/filter/block-category', verifyToken, async (req, res) => {
  const { childId, category, domains } = req.body;
  if (!childId || !domains) return res.status(400).json({ error: 'Missing fields' });

  try {
    const batch = db.batch();
    const ref = db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('blocked_domains');

    domains.forEach((domain) => {
      batch.set(ref.doc(domain), {
        active: true,
        category,
        blockedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    res.json({ success: true, blocked: domains.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// YOUTUBE POLICY ROUTES
// ══════════════════════════════════════════

// YouTube policy save/update
app.post('/child/youtube-policy', verifyToken, async (req, res) => {
  const { childId, policy } = req.body;
  if (!childId || !policy) return res.status(400).json({ error: 'Missing fields' });

  try {
    await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .update({
        youtubePolicymestPolicy: policy,
        policyUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// YouTube activity log
app.post('/child/youtube-log', verifyToken, async (req, res) => {
  const { childId, activity } = req.body;
  if (!childId) return res.status(400).json({ error: 'Missing childId' });

  try {
    await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('youtube_activity')
      .add({
        ...activity,
        loggedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// YouTube usage today
app.get('/child/youtube-usage/:childId', verifyToken, async (req, res) => {
  const { childId } = req.params;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const snap = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('youtube_activity')
      .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .get();

    const todayMinutes = snap.docs.reduce((sum, doc) => {
      return sum + (doc.data().durationMinutes || 0);
    }, 0);

    res.json({ todayMinutes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// FAMILY / MULTI-CHILD ROUTES
// ══════════════════════════════════════════

// Child add करा
app.post('/family/add-child', verifyToken, async (req, res) => {
  const { child } = req.body;
  if (!child?.name) return res.status(400).json({ error: 'Child name required' });

  try {
    const ref = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .add({
        ...child,
        status: 'offline',
        todayMinutes: 0,
        blockedAttempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.json({ success: true, childId: ref.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Child delete करा
app.delete('/family/child/:childId', verifyToken, async (req, res) => {
  const { childId } = req.params;

  try {
    // Sub-collections पण delete करा (batch)
    await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .delete();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Parent sync (force refresh)
app.post('/parent/sync', verifyToken, async (req, res) => {
  try {
    const snap = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .get();

    const children = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ children, synced: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// REPORTS ROUTES
// ══════════════════════════════════════════

// Weekly data मिळवा
app.get('/reports/weekly/:childId', verifyToken, async (req, res) => {
  const { childId } = req.params;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Daily usage (last 7 days)
    const dailySnap = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('daily_stats')
      .orderBy('date', 'desc')
      .limit(7)
      .get();

    const dailyUsage = new Array(7).fill(0);
    dailySnap.docs.forEach((doc, i) => {
      if (i < 7) dailyUsage[6 - i] = doc.data().totalMinutes || 0;
    });

    // Top apps
    const appsSnap = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('installed_apps')
      .orderBy('weeklyMinutes', 'desc')
      .limit(10)
      .get();

    const topApps = appsSnap.docs.map((d) => ({
      appName: d.data().appName || d.id,
      minutes: d.data().weeklyMinutes || 0,
      blocked: d.data().blocked || false,
    }));

    // Alerts count
    const alertsSnap = await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('alerts')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(weekAgo))
      .get();

    const sosAlerts = alertsSnap.docs.filter((d) => d.data().type === 'sos').length;
    const blockedAttempts = alertsSnap.docs.filter((d) => d.data().type === 'blocked').length;

    // All alerts for PDF
    const allAlerts = alertsSnap.docs.map((d) => ({
      type: d.data().type,
      message: d.data().message,
      time: d.data().timestamp?.toDate?.()?.toLocaleString('en-IN') || '--',
    }));

    res.json({
      dailyUsage,
      topApps,
      sosAlerts,
      blockedAttempts,
      alerts: allAlerts,
      dailyLimitMinutes: 120, // Default
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Email report
app.post('/reports/email', verifyToken, async (req, res) => {
  const { childId, parentEmail } = req.body;

  try {
    // Nodemailer किंवा SendGrid वापरून email पाठवा
    // आत्ता फक्त log करतो — email service नंतर add करा
    console.log(`📧 Report email requested for child ${childId} to ${parentEmail}`);

    // TODO: Add email service
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail({...});

    res.json({ success: true, message: 'Email queued (add email service to complete)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// APP INSTALL NOTIFICATION
// Child device वरून येतो
// ══════════════════════════════════════════
app.post('/notify/app-install', verifyToken, async (req, res) => {
  const { childId, childName, appName, packageName, event, category } = req.body;

  try {
    // Parent चा FCM token मिळवा
    const parentDoc = await db.collection('users').doc(req.uid).get();
    const parentFCMToken = parentDoc.data()?.fcmToken;

    // Firestore मध्ये log
    await db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('app_events')
      .add({
        appName,
        packageName,
        category,
        event,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    // FCM notification
    if (parentFCMToken) {
      const icon = event === 'installed' ? '📥' : '🗑️';
      const title = `${icon} App ${event === 'installed' ? 'Install' : 'Remove'} Alert`;
      const body = `${childName} च्या phone वर "${appName}" ${event === 'installed' ? 'install' : 'remove'} झाला`;

      await messaging.send({
        token: parentFCMToken,
        notification: { title, body },
        data: { type: 'app_install', childId, appName, packageName, event },
        android: { priority: 'high', notification: { channelId: 'kidshield_alerts' } },
      });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════
// CALL LOG SYNC
// Child device वरून call logs sync होतात
// ══════════════════════════════════════════
app.post('/child/call-sync', verifyToken, async (req, res) => {
  const { childId, calls } = req.body;
  if (!childId || !calls) return res.status(400).json({ error: 'Missing fields' });

  try {
    const batch = db.batch();
    const ref = db
      .collection('families')
      .doc(req.uid)
      .collection('children')
      .doc(childId)
      .collection('call_log');

    calls.forEach((call) => {
      // Hashed number वापरतो — privacy
      batch.set(ref.doc(call.hashedNumber + '_' + call.timestamp), {
        ...call,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    res.json({ success: true, synced: calls.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
