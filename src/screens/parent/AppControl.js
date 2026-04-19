import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Switch, ActivityIndicator, Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export default function AppControl() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [appRules, setAppRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = auth().currentUser?.uid;

  const commonApps = [
    { name: 'YouTube', package: 'com.google.android.youtube', icon: '▶️' },
    { name: 'Instagram', package: 'com.instagram.android', icon: '📷' },
    { name: 'Facebook', package: 'com.facebook.katana', icon: '👤' },
    { name: 'TikTok', package: 'com.zhiliaoapp.musically', icon: '🎵' },
    { name: 'WhatsApp', package: 'com.whatsapp', icon: '💬' },
    { name: 'Free Fire', package: 'com.dts.freefireth', icon: '🔫' },
    { name: 'PUBG', package: 'com.pubg.imobile', icon: '🎮' },
    { name: 'Chrome', package: 'com.android.chrome', icon: '🌐' },
    { name: 'Snapchat', package: 'com.snapchat.android', icon: '👻' },
    { name: 'Twitter', package: 'com.twitter.android', icon: '🐦' },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedChild) fetchAppRules();
  }, [selectedChild]);

  const fetchData = async () => {
    try {
      const snap = await firestore().collection('users')
        .where('parentId', '==', uid).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0]);
    } catch (e) {} finally { setLoading(false); }
  };

  const fetchAppRules = async () => {
    try {
      const snap = await firestore().collection('appControls')
        .where('parentId', '==', uid).get();
      setAppRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {}
  };

  const toggleApp = async (app, currentlyBlocked) => {
    if (!selectedChild) return;
    try {
      const docId = `${uid}_${app.package}`;
      await firestore().collection('appControls').doc(docId).set({
        parentId: uid,
        childId: selectedChild.id,
        appName: app.name,
        packageName: app.package,
        blocked: !currentlyBlocked,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      await fetchAppRules();
      Alert.alert(
        !currentlyBlocked ? 'App Blocked' : 'App Allowed',
        `${app.name} is now ${!currentlyBlocked ? 'blocked' : 'allowed'} for ${selectedChild.name}`
      );
    } catch (e) {
      Alert.alert('Error', 'Could not update app rule');
    }
  };

  const isBlocked = (packageName) => {
    const rule = appRules.find(r => r.packageName === packageName);
    return rule?.blocked || false;
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🚫 App Control</Text>

      {children.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No children linked yet</Text>
        </View>
      )}

      {children.length > 0 && (
        <>
          {/* Child selector */}
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

          <Text style={styles.sectionTitle}>Common Apps</Text>
          <Text style={styles.sectionSub}>Toggle to block/allow apps for {selectedChild?.name}</Text>

          {commonApps.map(app => {
            const blocked = isBlocked(app.package);
            return (
              <View key={app.package} style={styles.appRow}>
                <Text style={styles.appIcon}>{app.icon}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <Text style={styles.appPackage}>{app.package}</Text>
                </View>
                <View style={styles.switchContainer}>
                  <Text style={[styles.statusText, { color: blocked ? '#ff4444' : '#00cc88' }]}>
                    {blocked ? 'BLOCKED' : 'ALLOWED'}
                  </Text>
                  <Switch
                    value={blocked}
                    onValueChange={() => toggleApp(app, blocked)}
                    trackColor={{ false: '#00cc88', true: '#ff4444' }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>
            );
          })}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>ℹ️ How it works</Text>
            <Text style={styles.infoText}>• Blocked apps cannot be opened on child's phone</Text>
            <Text style={styles.infoText}>• Changes take effect immediately</Text>
            <Text style={styles.infoText}>• Child will see a block screen when trying to open</Text>
            <Text style={styles.infoText}>• Requires Accessibility Service enabled on child's phone</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 20 },
  emptyCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a' },
  emptyText: { color: '#8899aa', fontSize: 15 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111d35', borderRadius: 50, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, borderWidth: 1, borderColor: '#1e2d4a' },
  chipActive: { borderColor: '#00d4ff' },
  chipText: { color: '#8899aa', fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#8899aa', marginBottom: 16 },
  appRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111d35', borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#1e2d4a',
  },
  appIcon: { fontSize: 28 },
  appName: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  appPackage: { fontSize: 11, color: '#8899aa', marginTop: 2 },
  switchContainer: { alignItems: 'center', gap: 4 },
  statusText: { fontSize: 10, fontWeight: '700' },
  infoCard: { backgroundColor: '#0a1628', borderRadius: 12, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#1e2d4a' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  infoText: { fontSize: 12, color: '#8899aa', marginBottom: 6 },
});