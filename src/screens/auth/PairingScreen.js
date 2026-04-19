import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', border: '#1e2d4a',
};

function ParentPairingView({ user }) {
  const [pairingCode, setPairingCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [linkedChildren, setLinkedChildren] = useState([]);

  useEffect(() => {
    generatePairingCode();
    fetchLinkedChildren();
  }, []);

  const generatePairingCode = async () => {
    setLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const childId = 'child_' + Date.now();

      // Save in pairingCodes (app uses this)
      await firestore().collection('pairingCodes').doc(code).set({
        parentId: user.uid,
        parentName: user.displayName || 'Parent',
        childId: childId,
        createdAt: firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        used: false,
      });

      // Save in pairing_codes (web admin uses this)
      await firestore().collection('pairing_codes').doc(code).set({
        parentId: user.uid,
        childId: childId,
        createdAt: firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // Pre-create families document so child can update it
      await firestore()
        .collection('families').doc(user.uid)
        .collection('children').doc(childId)
        .set({
          name: 'Child',
          pairingCode: code,
          paired: false,
          deviceOnline: false,
          todayMinutes: 0,
          blockedAttempts: 0,
          battery: null,
          createdAt: firestore.FieldValue.serverTimestamp(),
        });

      setPairingCode(code);
    } catch (e) {
      Alert.alert('Error', 'Pairing code generate failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedChildren = async () => {
    try {
      const snap = await firestore()
        .collection('families').doc(user.uid)
        .collection('children')
        .where('paired', '==', true)
        .get();
      setLinkedChildren(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {}
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={styles.pageTitle}>&#128241; Child Device Add Kara</Text>
      <Text style={styles.pageSubtitle}>
        Ha code mulachya phone var KidShield app madhe enter kara
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>PAIRING CODE</Text>
          <Text style={styles.codeText}>{pairingCode}</Text>
          <Text style={styles.codeExpiry}>24 tasaat expire hoto</Text>

          <View style={styles.qrContainer}>
            <QRCode
              value={'kidshield://pair/' + pairingCode}
              size={180}
              color="#ffffff"
              backgroundColor={COLORS.card}
            />
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={generatePairingCode}>
            <Text style={styles.refreshBtnText}>Nava Code Banava</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>Steps:</Text>
        {[
          'Mulachya phone var KidShield install kara',
          'App ughadha - Child Account niwada',
          'Register kara ani varil code enter kara',
          'Done! Device linked hoil',
        ].map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}><Text style={{ color: '#000', fontWeight: '700' }}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {linkedChildren.length > 0 && (
        <View style={styles.linkedCard}>
          <Text style={styles.linkedTitle}>Linked Devices ({linkedChildren.length})</Text>
          {linkedChildren.map(child => (
            <View key={child.id} style={styles.childRow}>
              <Text style={styles.childIcon}>&#128102;</Text>
              <View>
                <Text style={styles.childName}>{child.name || 'Child'}</Text>
                <Text style={styles.childEmail}>{child.deviceOnline ? 'Online' : 'Offline'}</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={{ color: '#00cc88', fontSize: 11, fontWeight: '700' }}>ACTIVE</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ChildPairingView({ user, navigation }) {
  const [code, setCode] = useState('');
  const [childName, setChildName] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Error', '6 character code enter kara');
      return;
    }
    setLoading(true);
    try {
      // Check pairingCodes collection first
      let codeDoc = await firestore().collection('pairingCodes').doc(code.toUpperCase()).get();
      let collection = 'pairingCodes';

      // Also check pairing_codes (web admin collection)
      if (!codeDoc.exists) {
        codeDoc = await firestore().collection('pairing_codes').doc(code.toUpperCase()).get();
        collection = 'pairing_codes';
      }

      if (!codeDoc.exists) {
        Alert.alert('Error', 'Invalid code. Punha check kara.');
        return;
      }

      const codeData = codeDoc.data();

      if (codeData.used) {
        Alert.alert('Error', 'Ha code aadheech vaparala gela aahe');
        return;
      }

      const parentId = codeData.parentId;
      const childId = codeData.childId || user.uid;

      // 1. Update families collection (web admin bhaghato)
      await firestore()
        .collection('families').doc(parentId)
        .collection('children').doc(childId)
        .set({
          paired: true,
          deviceId: user.uid,
          childUid: user.uid,
          name: childName || user.displayName || 'Child',
          pairedAt: firestore.FieldValue.serverTimestamp(),
          deviceOnline: true,
          todayMinutes: 0,
          blockedAttempts: 0,
          battery: 100,
        }, { merge: true });

      // 2. Update users collection (app use karto)
      await firestore().collection('users').doc(user.uid).set({
        parentId: parentId,
        childId: childId,
        linkedAt: firestore.FieldValue.serverTimestamp(),
        role: 'child',
        name: childName || user.displayName || 'Child',
      }, { merge: true });

      // 3. Mark code as used in both collections
      await firestore().collection('pairingCodes')
        .doc(code.toUpperCase())
        .update({ used: true, childUid: user.uid, pairedAt: firestore.FieldValue.serverTimestamp() })
        .catch(() => {});

      await firestore().collection('pairing_codes')
        .doc(code.toUpperCase())
        .update({ used: true, childUid: user.uid, pairedAt: firestore.FieldValue.serverTimestamp() })
        .catch(() => {});

      Alert.alert('Done!', 'Parent account shee link jhale!', [
        { text: 'OK', onPress: () => navigation.replace('ChildApp') }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Pairing failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { padding: 24, paddingTop: 60 }]}>
      <Text style={styles.pageTitle}>Parent Device Shee Joda</Text>
      <Text style={styles.pageSubtitle}>
        Parent chya phone varil KidShield app madhun 6-digit pairing code ghya
      </Text>

      <View style={styles.codeInputCard}>
        <Text style={styles.codeLabel}>YOUR NAME</Text>
        <TextInput
          style={[styles.codeInput, { fontSize: 18, letterSpacing: 1, marginBottom: 16 }]}
          placeholder="Child name"
          placeholderTextColor={COLORS.subtext}
          value={childName}
          onChangeText={setChildName}
        />

        <Text style={styles.codeLabel}>PAIRING CODE</Text>
        <TextInput
          style={styles.codeInput}
          placeholder="ABC123"
          placeholderTextColor={COLORS.subtext}
          value={code}
          onChangeText={t => setCode(t.toUpperCase())}
          maxLength={6}
          autoCapitalize="characters"
          textAlign="center"
        />

        <TouchableOpacity
          style={[styles.pairBtn, loading && { opacity: 0.7 }]}
          onPress={handlePair}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.pairBtnText}>Device Joda</Text>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>Code kuthe milel&#2307;</Text>
        <Text style={styles.stepText2}>1. Parent chya phone var KidShield ughadha</Text>
        <Text style={styles.stepText2}>2. Dashboard madhe "+ Add Child" tap kara</Text>
        <Text style={styles.stepText2}>3. Disanara 6-digit code ithe enter kara</Text>
      </View>
    </View>
  );
}

export default function PairingScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = auth().currentUser;
      if (!currentUser) return;
      setUser(currentUser);
      try {
        const doc = await firestore().collection('users').doc(currentUser.uid).get();
        setUserRole(doc.data()?.role || 'child');
      } catch (e) {
        setUserRole('child');
      }
    };
    fetchUser();
  }, []);

  if (!user || !userRole) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {userRole === 'parent'
        ? <ParentPairingView user={user} />
        : <ChildPairingView user={user} navigation={navigation} />
      }
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  pageSubtitle: { fontSize: 14, color: '#8899aa', marginBottom: 28, lineHeight: 20 },
  loadingBox: { height: 200, justifyContent: 'center', alignItems: 'center' },
  codeCard: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a',
  },
  codeLabel: { fontSize: 12, color: '#8899aa', letterSpacing: 2, marginBottom: 8 },
  codeText: { fontSize: 40, fontWeight: '900', color: '#00d4ff', letterSpacing: 8, marginBottom: 6 },
  codeExpiry: { color: '#ff9900', fontSize: 12, marginBottom: 20 },
  qrContainer: { padding: 16, backgroundColor: '#111d35', borderRadius: 12, borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 20 },
  refreshBtn: { backgroundColor: '#1e2d4a', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  refreshBtnText: { color: '#00d4ff', fontWeight: '600' },
  codeInputCard: { backgroundColor: '#111d35', borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a' },
  codeInput: {
    backgroundColor: '#060b14', borderRadius: 12, padding: 16,
    color: '#00d4ff', fontSize: 32, fontWeight: '900',
    letterSpacing: 8, width: '100%', borderWidth: 2, borderColor: '#1e2d4a', marginBottom: 20,
  },
  pairBtn: { backgroundColor: '#00d4ff', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center' },
  pairBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  stepsCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 20 },
  stepsTitle: { color: '#ffffff', fontWeight: '700', marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#00d4ff', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  stepText: { color: '#8899aa', fontSize: 13, flex: 1 },
  stepText2: { color: '#8899aa', fontSize: 13, marginBottom: 8 },
  linkedCard: { backgroundColor: '#0a1628', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#00cc8833' },
  linkedTitle: { color: '#00cc88', fontWeight: '700', marginBottom: 12 },
  childRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  childIcon: { fontSize: 24, marginRight: 12 },
  childName: { color: '#ffffff', fontWeight: '600' },
  childEmail: { color: '#8899aa', fontSize: 12 },
  activeBadge: { marginLeft: 'auto', backgroundColor: '#00cc8822', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#00cc8844' },
});
