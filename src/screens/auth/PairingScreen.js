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
      const upperCode = code.trim().toUpperCase();

      // Web Admin saves code inside families/{parentId}/children/{childId}
      // Search all families for matching pairingCode
      const familiesSnap = await firestore().collection('families').get();
      
      let foundParentId = null;
      let foundChildId = null;
      let foundChildData = null;

      for (const familyDoc of familiesSnap.docs) {
        const childrenSnap = await firestore()
          .collection('families')
          .doc(familyDoc.id)
          .collection('children')
          .where('pairingCode', '==', upperCode)
          .where('paired', '==', false)
          .get();
        
        if (!childrenSnap.empty) {
          foundParentId = familyDoc.id;
          foundChildId = childrenSnap.docs[0].id;
          foundChildData = childrenSnap.docs[0].data();
          break;
        }
      }

      if (!foundParentId) {
        Alert.alert('Error', 'Invalid code. Please check and try again.');
        return;
      }

      // Update child device linked
      await firestore()
        .collection('families')
        .doc(foundParentId)
        .collection('children')
        .doc(foundChildId)
        .update({
          paired: true,
          deviceUid: user.uid,
          linkedAt: firestore.FieldValue.serverTimestamp(),
        });

      // Update user profile with parentId
      await firestore().collection('users').doc(user.uid).set({
        parentId: foundParentId,
        childId: foundChildId,
        childName: foundChildData.name || 'Child',
        role: 'child',
        linkedAt: firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      Alert.alert('Success!', `Linked to parent account!`, [
        { text: 'OK', onPress: () => navigation.replace('ChildApp') }
      ]);
    } catch (e) {
      console.error('Pairing error:', e);
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
        <Text style={styles.stepText}>1. Open KidShield Admin on browser</Text>
        <Text style={styles.stepText}>2. Click "Add Child Device"</Text>
        <Text style={styles.stepText}>3. Enter child name and generate code</Text>
        <Text style={styles.stepText}>4. Enter the 6-digit code here</Text>
      </View>
    </View>
  );
}

export default function PairingScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <ChildPairingView navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  pageSubtitle: { fontSize: 14, color: '#8899aa', marginBottom: 28, lineHeight: 20 },
  codeInputCard: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a',
  },
  codeLabel: { fontSize: 12, color: '#8899aa', letterSpacing: 2, marginBottom: 8 },
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
  stepText: { color: '#8899aa', fontSize: 13, marginBottom: 8 },
});