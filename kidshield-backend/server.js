const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

if (!admin.apps.length) {
  const privateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDiJp0rs5+1BDHK\naaJtD5j+iBH2EvRPA42FHGqi/RWpk8HwpQ8kenzKyo16tsKGlpkgLVhYNGVbI7l+\n7K7ajlkOFJkorJAJxg1RsratQXshgjPINAq9ZZKNMSv+vrjyhyEGpVkUuHJ/gHke\nKZ9Ie8u8Ovb+P9+yiv335uhMG7ojFK7sTmKOSs0PHQLwsyT6pLAfIGzCxqHvNO9e\n+Be6GiMdLNY3mnGX3OSWh9EdAnVvIeOfEgwAc7zMSw+6TOMcdlo9ttOrfW87VRM4\nBeli6HO6MxJg8Gc0MFIih4OgDIop05jFJLB0ox0t49hzB3obFtv0jqP24sIHio4J\n0nTW0myJAgMBAAECggEAZ9IPTH1BX+Ilk4WMNiI3e/5utHe+Jbn9UbMad2nVdIyr\nN7Um7vm2aYi0i7X0NsJTWNTIXnHrZ/xOD6lLmnVIB/FH4Mbbt0jvW2a+e2p4wwjZ\nidruZUWIkn4U8vWOxXRoonrtGtiUY9lQgRrdj3KZtPei5VTgdsBdWF3uneYKvUhI\nCOcRVLw1EjA3S0e23Psqkdg4gaCBHNzawrigeZimaYBcoGgDjkFJQoDN2sFL9g+L\nw7G0eGzcXuf9WX9IkTEgc5DgbUVPxboxc34kKGbfqYEnRbjM4Kjz8ZD+E2VEzwrA\nh1Rgu9MVA1WOvx5dKWnqZcfHNdw05jJNftKXPY0RuwKBgQD21lPPrq892wOBjlT2\nRNk5ZKnVSqwPwMCirc56+79ieKEWj62j1uBhkffxuhgHaOUvZifgGZIANE7zDqTP\nW7kKsdxOf2K2FVO904jwDQwuw0hoXM/t5pn8Cw71g53EIInIr1diCQorZAABGP5j\ng/elgt4jd0rq9/dFbhcXu8EPGwKBgQDqi7SnqYIlL0xYe4P9drtHlL3Dyd1gwUYf\nC8LNk/MoZdRXI9ztN5RA2u2K/cmRJDJQ9OVJOfI1C9ZqdC6rNsfJwJadpHAkiI8F\nRJEOxd/O+nDc0JExfTiQbp5bxzkAH4rmebIyXovn+F5kjKqKUxxFLf8HnNsIKE3v\nbkgKBTXZKwKBgGfkTeJb4+ZlCFS/U4NT9xnxBIqBo2n99xaBkSayTxtjKmoUj0Em\nb8qhZXqYmQSFYfFRTfdEy+7KFXC3+SZNtNSLh+6CL0n0MAr1ve1LkJUeHJvQdLPt\nG2K6RNGRVBX4nAWbx2u74kvhCx9rJac9JD7FljnXO/Ep7SmL7KxQmjGBAoGBAJw7\n2WfBkw6/9eQOyrogx9mDq/BqXAuiUtpFVErqXZOwWQR+wCBH4HpfGtJ2ATmsWdPx\nfXYMollRfE9G+vtTrzumDO4PZh//0v0YUmP7zPyreFiumbjUh8Q120iZaU+6sySZ\nNek1b45itEXYKZWgjPlMDVB93K0PY/K0jEoYdGknAoGAXuT2AyKjkKGClhh17cy6\nhSSKrC2BojjxvYcsKraqiEq8XaZ2aIsIj4cC3heb9ZDzpTucV7GF9IYnKN2zmrQu\nFmS/zYnCvMUleMNY9pah2asGQK+tW+9ig/z8Bdn1xfiCEa+5VdLMf4fu/ma7UGoJ\nbV2FP3CxfU5gD5G7oFYG0D0=\n-----END PRIVATE KEY-----\n";

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "kidshield-8744e",
      clientEmail: "firebase-adminsdk-fbsvc@kidshield-8744e.iam.gserviceaccount.com",
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

app.get('/health', (req, res) => res.json({ status: 'KidShield API running' }));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, role, name } = req.body;
    const user = await admin.auth().createUser({ email, password, displayName: name });
    await db.collection('users').doc(user.uid).set({ uid: user.uid, email, name, role, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, uid: user.uid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/pairing/generate', async (req, res) => {
  try {
    const { parentId } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('pairingCodes').doc(code).set({ parentId, code, createdAt: admin.firestore.FieldValue.serverTimestamp(), used: false });
    res.json({ success: true, code });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/pairing/use', async (req, res) => {
  try {
    const { code, childId } = req.body;
    const doc = await db.collection('pairingCodes').doc(code).get();
    if (!doc.exists || doc.data().used) return res.status(400).json({ error: 'Invalid code' });
    const { parentId } = doc.data();
    await db.collection('pairingCodes').doc(code).update({ used: true, childId });
    await db.collection('users').doc(parentId).collection('children').doc(childId).set({ childId, pairedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(childId).update({ parentId });
    res.json({ success: true, parentId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/location/update', async (req, res) => {
  try {
    const { childId, latitude, longitude, timestamp } = req.body;
    await db.collection('locations').doc(childId).set({ childId, latitude, longitude, timestamp, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
    const { childId, stats, date } = req.body;
    await db.collection('usageStats').doc(`${childId}_${date}`).set({ childId, stats, date, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
    const { childId, title, body, type } = req.body;
    await db.collection('alerts').add({ childId, title, body, type, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KidShield API running on port ${PORT}`));
