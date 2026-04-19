import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export default function MultiChildDashboard({ navigation }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const uid = auth().currentUser?.uid;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const snap = await firestore().collection('users')
        .where('parentId', '==', uid).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChildren(list);
      if (list.length > 0 && !selectedChild) setSelectedChild(list[0]);

      const alertSnap = await firestore().collection('alerts')
        .where('parentId', '==', uid)
        .where('read', '==', false)
        .orderBy('timestamp', 'desc')
        .limit(5).get();
      setAlerts(alertSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const sendCommand = async (command) => {
    if (!selectedChild) return;
    try {
      await firestore().collection('commands').add({
        childId: selectedChild.id,
        command,
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert('Done!', `${command} command sent to ${selectedChild.name}`);
    } catch (e) {
      Alert.alert('Error', 'Command failed');
    }
  };

  const markAlertRead = async (alertId) => {
    await firestore().collection('alerts').doc(alertId).update({ read: true });
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d4ff" />}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>KidShield Dashboard</Text>
        <TouchableOpacity style={styles.addBtn}
          onPress={() => navigation.navigate('Pairing')}>
          <Text style={{ color: '#00d4ff', fontSize: 22, fontWeight: '700' }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* No children */}
      {children.length === 0 && (
        <TouchableOpacity style={styles.emptyCard}
          onPress={() => navigation.navigate('Pairing')}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>📱</Text>
          <Text style={styles.emptyTitle}>Add Child Device</Text>
          <Text style={styles.emptyText}>Tap here to link your child's phone</Text>
        </TouchableOpacity>
      )}

      {/* Child selector */}
      {children.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {children.map(child => (
            <TouchableOpacity key={child.id}
              style={[styles.childChip, selectedChild?.id === child.id && styles.childChipActive]}
              onPress={() => setSelectedChild(child)}>
              <Text style={{ fontSize: 20 }}>👦</Text>
              <Text style={[styles.chipName, selectedChild?.id === child.id && { color: '#00d4ff' }]}>
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addChip}
            onPress={() => navigation.navigate('Pairing')}>
            <Text style={{ color: '#00d4ff', fontSize: 20 }}>+</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Selected child info */}
      {selectedChild && (
        <>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>⏱️</Text>
              <Text style={styles.statValue}>{selectedChild.screenTime || '0'}m</Text>
              <Text style={styles.statLabel}>Screen Time</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>📱</Text>
              <Text style={[styles.statValue, { color: '#00cc88' }]}>
                {selectedChild.appsUsed || '0'}
              </Text>
              <Text style={styles.statLabel}>Apps Used</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🔋</Text>
              <Text style={[styles.statValue, { color: '#ff9900' }]}>
                {selectedChild.battery || '--'}%
              </Text>
              <Text style={styles.statLabel}>Battery</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statIcon}>🚫</Text>
              <Text style={[styles.statValue, { color: '#ff4444' }]}>
                {selectedChild.blockedAttempts || '0'}
              </Text>
              <Text style={styles.statLabel}>Blocked</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => sendCommand('LOCK_DEVICE')}>
              <Text style={styles.actionIcon}>🔒</Text>
              <Text style={styles.actionLabel}>Lock Phone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('Location')}>
              <Text style={styles.actionIcon}>📍</Text>
              <Text style={styles.actionLabel}>Location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('Apps')}>
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={styles.actionLabel}>App Control</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => sendCommand('BEDTIME_MODE')}>
              <Text style={styles.actionIcon}>🌙</Text>
              <Text style={styles.actionLabel}>Bedtime</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('Reports')}>
              <Text style={styles.actionIcon}>📊</Text>
              <Text style={styles.actionLabel}>Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}
              onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={styles.actionLabel}>Settings</Text>
            </TouchableOpacity>
          </View>

          {/* Location */}
          <View style={styles.locationCard}>
            <Text style={styles.locationTitle}>📍 Last Known Location</Text>
            <Text style={styles.locationText}>
              {selectedChild.lastLocation?.address || 'Waiting for location update...'}
            </Text>
          </View>
        </>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>⚠️ Alerts ({alerts.length})</Text>
          {alerts.map(alert => (
            <TouchableOpacity key={alert.id} style={styles.alertCard}
              onPress={() => markAlertRead(alert.id)}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>
                {alert.type === 'SOS' ? '🆘' : '⚠️'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertBody}>{alert.body}</Text>
              </View>
              <Text style={{ color: '#8899aa' }}>✓</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn}
        onPress={() => auth().signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#ffffff' },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1, borderColor: '#1e2d4a',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 40,
    alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a',
    borderStyle: 'dashed', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#8899aa' },
  childChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#111d35', borderRadius: 50,
    paddingVertical: 10, paddingHorizontal: 16,
    marginRight: 10, borderWidth: 1, borderColor: '#1e2d4a',
  },
  childChipActive: { borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)' },
  chipName: { color: '#8899aa', fontSize: 14, fontWeight: '600' },
  addChip: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1, borderColor: '#00d4ff',
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: '#111d35', borderRadius: 12,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a',
  },
  statIcon: { fontSize: 20, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#00d4ff' },
  statLabel: { fontSize: 10, color: '#8899aa', textAlign: 'center', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  actionBtn: {
    width: '30%', backgroundColor: '#111d35', borderRadius: 12,
    padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a',
  },
  actionIcon: { fontSize: 26, marginBottom: 6 },
  actionLabel: { fontSize: 11, color: '#8899aa', textAlign: 'center' },
  locationCard: {
    backgroundColor: 'rgba(0,229,160,0.05)', borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: 'rgba(0,229,160,0.15)', marginBottom: 20,
  },
  locationTitle: { fontSize: 14, fontWeight: '700', color: '#00cc88', marginBottom: 6 },
  locationText: { fontSize: 13, color: '#8899aa' },
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,165,0,0.05)', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,165,0,0.2)', marginBottom: 10,
  },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#ff9900', marginBottom: 2 },
  alertBody: { fontSize: 12, color: '#8899aa' },
  signOutBtn: {
    marginTop: 20, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#1e2d4a', alignItems: 'center',
  },
  signOutText: { color: '#ff4444', fontSize: 14, fontWeight: '600' },
});