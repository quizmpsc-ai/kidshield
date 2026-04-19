import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput, ActivityIndicator } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export default function Settings() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [screenTimeLimit, setScreenTimeLimit] = useState('120');
  const [bedtimeEnabled, setBedtimeEnabled] = useState(false);
  const [bedtimeStart, setBedtimeStart] = useState('22:00');
  const [bedtimeEnd, setBedtimeEnd] = useState('07:00');
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const uid = auth().currentUser?.uid;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const snap = await firestore().collection('users').where('parentId', '==', uid).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0]);

      const settingsDoc = await firestore().collection('settings').doc(uid).get();
      if (settingsDoc.exists) {
        const s = settingsDoc.data();
        setScreenTimeLimit(String(s.screenTimeLimit || 120));
        setBedtimeEnabled(s.bedtimeEnabled || false);
        setBedtimeStart(s.bedtimeStart || '22:00');
        setBedtimeEnd(s.bedtimeEnd || '07:00');
        setNotifications(s.notifications !== false);
      }
    } catch (e) {} finally { setLoading(false); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await firestore().collection('settings').doc(uid).set({
        screenTimeLimit: parseInt(screenTimeLimit) || 120,
        bedtimeEnabled,
        bedtimeStart,
        bedtimeEnd,
        notifications,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (selectedChild) {
        await firestore().collection('users').doc(selectedChild.id).update({
          screenTimeLimit: parseInt(screenTimeLimit) || 120,
        });
        if (bedtimeEnabled) {
          await firestore().collection('commands').add({
            childId: selectedChild.id,
            command: 'SET_BEDTIME',
            params: { enabled: bedtimeEnabled, start: bedtimeStart, end: bedtimeEnd },
            status: 'pending',
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      Alert.alert('Saved!', 'Settings updated successfully');
    } catch (e) {
      Alert.alert('Error', 'Could not save settings');
    } finally { setSaving(false); }
  };

  if (loading) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color="#00d4ff" />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>⚙️ Settings</Text>

      {children.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Selected Child</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {children.map(child => (
              <TouchableOpacity key={child.id}
                style={[styles.chip, selectedChild?.id === child.id && styles.chipActive]}
                onPress={() => setSelectedChild(child)}>
                <Text>👦</Text>
                <Text style={[styles.chipText, selectedChild?.id === child.id && { color: '#00d4ff' }]}>
                  {child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Screen Time */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⏱️ Daily Screen Time Limit</Text>
        <Text style={styles.cardSub}>Maximum minutes per day for {selectedChild?.name || 'child'}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={screenTimeLimit}
            onChangeText={setScreenTimeLimit}
            keyboardType="numeric"
            maxLength={4}
          />
          <Text style={styles.inputUnit}>minutes/day</Text>
        </View>
        <View style={styles.quickLimits}>
          {['60', '90', '120', '180', '240'].map(m => (
            <TouchableOpacity key={m} style={[styles.quickBtn, screenTimeLimit === m && styles.quickBtnActive]}
              onPress={() => setScreenTimeLimit(m)}>
              <Text style={[styles.quickBtnText, screenTimeLimit === m && { color: '#000' }]}>
                {parseInt(m) >= 60 ? `${parseInt(m)/60}h` : `${m}m`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Bedtime */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>🌙 Bedtime Mode</Text>
            <Text style={styles.cardSub}>Block all apps during sleep hours</Text>
          </View>
          <Switch
            value={bedtimeEnabled}
            onValueChange={setBedtimeEnabled}
            trackColor={{ false: '#1e2d4a', true: '#00d4ff' }}
            thumbColor="#ffffff"
          />
        </View>
        {bedtimeEnabled && (
          <View style={styles.timeRow}>
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Bedtime Start</Text>
              <TextInput style={styles.timeInput} value={bedtimeStart}
                onChangeText={setBedtimeStart} placeholder="22:00"
                placeholderTextColor="#8899aa" />
            </View>
            <Text style={{ color: '#8899aa', fontSize: 20 }}>→</Text>
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Wake Up</Text>
              <TextInput style={styles.timeInput} value={bedtimeEnd}
                onChangeText={setBedtimeEnd} placeholder="07:00"
                placeholderTextColor="#8899aa" />
            </View>
          </View>
        )}
      </View>

      {/* Notifications */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>🔔 Notifications</Text>
            <Text style={styles.cardSub}>Receive alerts for SOS, app installs, etc.</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#1e2d4a', true: '#00d4ff' }}
            thumbColor="#ffffff"
          />
        </View>
      </View>

      {/* Account */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 Account</Text>
        <Text style={styles.accountEmail}>{auth().currentUser?.email}</Text>
        <TouchableOpacity style={styles.signOutBtn} onPress={() => auth().signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Save */}
      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        onPress={saveSettings} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 20 },
  sectionLabel: { fontSize: 13, color: '#8899aa', marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111d35', borderRadius: 50, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, borderWidth: 1, borderColor: '#1e2d4a' },
  chipActive: { borderColor: '#00d4ff' },
  chipText: { color: '#8899aa', fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#111d35', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  cardSub: { fontSize: 12, color: '#8899aa' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  input: { backgroundColor: '#060b14', borderRadius: 10, padding: 12, color: '#00d4ff', fontSize: 22, fontWeight: '700', borderWidth: 1, borderColor: '#1e2d4a', width: 100, textAlign: 'center' },
  inputUnit: { color: '#8899aa', fontSize: 14 },
  quickLimits: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickBtn: { flex: 1, backgroundColor: '#0a1628', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a' },
  quickBtnActive: { backgroundColor: '#00d4ff' },
  quickBtnText: { color: '#8899aa', fontSize: 12, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  timeBox: { flex: 1 },
  timeLabel: { color: '#8899aa', fontSize: 12, marginBottom: 6 },
  timeInput: { backgroundColor: '#060b14', borderRadius: 10, padding: 12, color: '#ffffff', fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: '#1e2d4a', textAlign: 'center' },
  accountEmail: { color: '#00d4ff', fontSize: 14, marginTop: 8, marginBottom: 16 },
  signOutBtn: { backgroundColor: 'rgba(255,68,68,0.1)', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)' },
  signOutText: { color: '#ff4444', fontWeight: '600' },
  saveBtn: { backgroundColor: '#00d4ff', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});