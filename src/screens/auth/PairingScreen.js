import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', border: '#1e2d4a',
  green: '#00cc88', orange: '#ff9900',
};

function ParentPairingView() {
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
      const user = auth().currentUser;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await firestore().collection('pairingCodes').doc(code).set({
        parentId: user.uid,
        parentName: user.displayName || 'Parent',
        createdAt: firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });
      setPairingCode(code);
    } catch (e) {
      Alert.alert('Error', 'Could not generate pairing code');
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedChildren = async () => {
    try {
      const uid = auth().currentUser?.uid;
      const snap = await firestore().collection('users')
        .where('parentId', '==', uid)
        .get();
      setLinkedChildren(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {}
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={styles.pageTitle}>Add Child Device</Text>
      <Text style={styles.pageSubtitle}>
        Enter this code on your child's KidShield app to link devices
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>PAIRING CODE</Text>
          <Text style={styles.codeText}>{pairingCode}</Text>
          <Text style={styles.codeExpiry}>Expires in 10 minutes</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={generatePairingCode}>
            <Text style={styles.refreshBtnText}>Generate New Code</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>Steps:</Text>
        {[
          'Install KidShield on child phone',
          'Open app and select "Child" role',
          'Register with a different email',
          'Enter the code shown above',
          'Done! Devices linked.',
        ].map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={{ color: '#000', fontWeight: '700', fontSize: 12 }}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {linkedChildren.length > 0 && (
        <View style={styles.linkedCard}>
          <Text style={styles.linkedTitle}>Linked Devices ({linkedChildren.length})</Text>
          {linkedChildren.map(child => (
            <View key={child.id} style={styles.childRow}>
              <Text style={{ fontSize: 24, marginRight: 12 }}>👦</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childEmail}>{child.email}</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={{ color: COLORS.green, fontSize: 11, fontWeight: '700' }}>ACTIVE</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ChildPairingView({ navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Error', 'Please enter a 6-character code');
      return;
    }
    setLoading(true);
    try {
      const user = auth().currentUser;
      const codeDoc = await firestore().collection('pairingCodes')
        .doc(code.toUpperCase()).get();

      if (!codeDoc.exists) {
        Alert.alert('Error', 'Invalid code. Please check and try again.');
        return;
      }

      const codeData = codeDoc.data();
      if (codeData.used) {
        Alert.alert('Error', 'This code has already been used.');
        return;
      }
      if (new Date(codeData.expiresAt.toDate()) < new Date()) {
        Alert.alert('Error', 'Code expired. Ask parent to generate a new one.');
        return;
      }

      await firestore().collection('users').doc(user.uid).update({
        parentId: codeData.parentId,
        linkedAt: firestore.FieldValue.serverTimestamp(),
      });

      await firestore().collection('users').doc(codeData.parentId).update({
        children: firestore.FieldValue.arrayUnion(user.uid),
      });

      await firestore().collection('pairingCodes').doc(code.toUpperCase())
        .update({ used: true });

      Alert.alert('Success!', `Linked to ${codeData.parentName}'s account!`, [
        { text: 'OK', onPress: () => navigation.replace('ChildApp') }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Pairing failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { padding: 24, paddingTop: 60 }]}>
      <Text style={styles.pageTitle}>Link to Parent</Text>
      <Text style={styles.pageSubtitle}>
        Get the 6-digit code from parent's KidShield app
      </Text>

      <View style={styles.codeInputCard}>
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
          disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.pairBtnText}>Link Device</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>How to get the code:</Text>
        <Text style={styles.stepText}>1. Open KidShield on parent's phone</Text>
        <Text style={styles.stepText}>2. Go to Dashboard and tap "Add Child"</Text>
        <Text style={styles.stepText}>3. Enter the 6-digit code shown there</Text>
      </View>
    </View>
  );
}

export default function PairingScreen({ navigation }) {
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      try {
        const user = auth().currentUser;
        if (!user) return;
        const doc = await firestore().collection('users').doc(user.uid).get();
        setUserRole(doc.data()?.role || 'child');
      } catch (e) {
        setUserRole('child');
      } finally {
        setLoading(false);
      }
    };
    fetchRole();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {userRole === 'parent'
        ? <ParentPairingView />
        : <ChildPairingView navigation={navigation} />}
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
  codeText: { fontSize: 42, fontWeight: '900', color: '#00d4ff', letterSpacing: 8, marginBottom: 6 },
  codeExpiry: { color: '#ff9900', fontSize: 12, marginBottom: 20 },
  refreshBtn: { backgroundColor: '#1e2d4a', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  refreshBtnText: { color: '#00d4ff', fontWeight: '600' },
  codeInputCard: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a',
  },
  codeInput: {
    backgroundColor: '#060b14', borderRadius: 12, padding: 16,
    color: '#00d4ff', fontSize: 32, fontWeight: '900',
    letterSpacing: 8, width: '100%', borderWidth: 2, borderColor: '#1e2d4a', marginBottom: 20,
  },
  pairBtn: { backgroundColor: '#00d4ff', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center' },
  pairBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  stepsCard: {
    backgroundColor: '#111d35', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 20,
  },
  stepsTitle: { color: '#ffffff', fontWeight: '700', marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#00d4ff',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  stepText: { color: '#8899aa', fontSize: 13, flex: 1, marginBottom: 8 },
  linkedCard: {
    backgroundColor: '#0a1628', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#00cc8833',
  },
  linkedTitle: { color: '#00cc88', fontWeight: '700', marginBottom: 12 },
  childRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  childName: { color: '#ffffff', fontWeight: '600' },
  childEmail: { color: '#8899aa', fontSize: 12 },
  activeBadge: {
    backgroundColor: '#00cc8822', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: '#00cc8844',
  },
});