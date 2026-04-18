// src/screens/auth/PairingScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', border: '#1e2d4a',
};

// Parent Device वर — Pairing Code Generate करा
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
      const firestore = (await import('@react-native-firebase/firestore')).default();

      await firestore.collection('pairingCodes').doc(code).set({
        parentId: user.uid,
        parentName: user.displayName,
        createdAt: firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        used: false,
      });

      setPairingCode(code);
    } catch (e) {
      Alert.alert('Error', 'Pairing code बनवता आला नाही');
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedChildren = async () => {
    try {
      const firestore = (await import('@react-native-firebase/firestore')).default();
      const snap = await firestore.collection('users')
        .where('parentId', '==', user?.uid)
        .get();

      setLinkedChildren(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {}
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
      <Text style={styles.pageTitle}>📱 Child Device जोडा</Text>
      <Text style={styles.pageSubtitle}>
        हा code मुलाच्या phone वर KidShield app मध्ये enter करा किंवा QR scan करा
      </Text>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : (
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>PAIRING CODE</Text>
          <Text style={styles.codeText}>{pairingCode}</Text>
          <Text style={styles.codeExpiry}>⏱ 10 मिनिटांत expire होतो</Text>

          <View style={styles.qrContainer}>
            <QRCode
              value={`kidshield://pair/${pairingCode}`}
              size={180}
              color="#ffffff"
              backgroundColor={COLORS.card}
            />
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={generatePairingCode}>
            <Text style={styles.refreshBtnText}>🔄 नवीन Code बनवा</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Steps */}
      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>📋 Steps:</Text>
        {[
          'मुलाच्या phone वर KidShield install करा',
          'App उघडा → "Child Account" निवडा',
          'Register करा आणि वरील code enter करा',
          'Done! Device linked होईल',
        ].map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.stepNum}><Text style={{ color: '#000', fontWeight: '700' }}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Linked Children */}
      {linkedChildren.length > 0 && (
        <View style={styles.linkedCard}>
          <Text style={styles.linkedTitle}>✅ Linked Devices ({linkedChildren.length})</Text>
          {linkedChildren.map(child => (
            <View key={child.id} style={styles.childRow}>
              <Text style={styles.childIcon}>👦</Text>
              <View>
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childEmail}>{child.email}</Text>
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

// Child Device वर — Pairing Code Enter करा
function ChildPairingView({ user, navigation }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Error', '6 character चा code enter करा');
      return;
    }

    setLoading(true);
    try {
      const firestore = (await import('@react-native-firebase/firestore')).default();
      const codeDoc = await firestore.collection('pairingCodes').doc(code.toUpperCase()).get();

      if (!codeDoc.exists) {
        Alert.alert('Error', 'Invalid code. पुन्हा check करा.');
        return;
      }

      const codeData = codeDoc.data();
      if (codeData.used) {
        Alert.alert('Error', 'हा code आधीच वापरला गेला आहे');
        return;
      }
      if (new Date(codeData.expiresAt.toDate()) < new Date()) {
        Alert.alert('Error', 'Code expire झाला. Parent ला नवीन code बनवायला सांगा.');
        return;
      }

      // Child ला parent शी link करा
      await firestore.collection('users').doc(user.uid).update({
        parentId: codeData.parentId,
        linkedAt: firestore.FieldValue.serverTimestamp(),
      });

      // Parent च्या children array मध्ये add करा
      await firestore.collection('users').doc(codeData.parentId).update({
        children: firestore.FieldValue.arrayUnion(user.uid),
      });

      // Code mark as used
      await firestore.collection('pairingCodes').doc(code.toUpperCase()).update({ used: true });

      Alert.alert('🎉 Done!', `${codeData.parentName} च्या account शी link झाले!`, [
        { text: 'OK', onPress: () => navigation.replace('ChildHome') }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Pairing failed. पुन्हा try करा.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { padding: 24, paddingTop: 60 }]}>
      <Text style={styles.pageTitle}>🔗 Parent Device शी जोडा</Text>
      <Text style={styles.pageSubtitle}>
        Parent च्या phone वरील KidShield app मधून 6-digit pairing code घ्या
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
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.pairBtnText}>Device जोडा</Text>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>📋 Code कुठे मिळेल:</Text>
        <Text style={styles.stepText2}>1. Parent च्या phone वर KidShield उघडा</Text>
        <Text style={styles.stepText2}>2. Dashboard → "Child Device जोडा" वर tap करा</Text>
        <Text style={styles.stepText2}>3. दिसणारा 6-digit code इथे enter करा</Text>
      </View>
    </View>
  );
}

export default function PairingScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      const auth = (await import('@react-native-firebase/auth')).default();
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      setUser(currentUser);

      const firestore = (await import('@react-native-firebase/firestore')).default();
      const doc = await firestore.collection('users').doc(currentUser.uid).get();
      setUserRole(doc.data()?.role);
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
    alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: '#1e2d4a',
  },
  codeLabel: { fontSize: 12, color: '#8899aa', letterSpacing: 2, marginBottom: 8 },
  codeText: {
    fontSize: 40, fontWeight: '900', color: '#00d4ff',
    letterSpacing: 8, marginBottom: 6,
  },
  codeExpiry: { color: '#ff9900', fontSize: 12, marginBottom: 20 },
  qrContainer: {
    padding: 16, backgroundColor: '#111d35', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 20,
  },
  refreshBtn: {
    backgroundColor: '#1e2d4a', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
  },
  refreshBtnText: { color: '#00d4ff', fontWeight: '600' },

  codeInputCard: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a',
  },
  codeInput: {
    backgroundColor: '#060b14', borderRadius: 12, padding: 16,
    color: '#00d4ff', fontSize: 32, fontWeight: '900',
    letterSpacing: 8, width: '100%', borderWidth: 2, borderColor: '#1e2d4a',
    marginBottom: 20,
  },
  pairBtn: {
    backgroundColor: '#00d4ff', borderRadius: 12, padding: 16,
    width: '100%', alignItems: 'center',
  },
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
  stepText: { color: '#8899aa', fontSize: 13, flex: 1 },
  stepText2: { color: '#8899aa', fontSize: 13, marginBottom: 8 },

  linkedCard: {
    backgroundColor: '#0a1628', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#00cc8833',
  },
  linkedTitle: { color: '#00cc88', fontWeight: '700', marginBottom: 12 },
  childRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  childIcon: { fontSize: 24, marginRight: 12 },
  childName: { color: '#ffffff', fontWeight: '600' },
  childEmail: { color: '#8899aa', fontSize: 12 },
  activeBadge: {
    marginLeft: 'auto', backgroundColor: '#00cc8822',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: '#00cc8844',
  },
});
