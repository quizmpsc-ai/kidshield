// src/screens/parent/Dashboard.js
// Parent Dashboard - Main control center

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

export default function ParentDashboard({ navigation }) {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [stats, setStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState([]);

  const uid = auth().currentUser?.uid;

  useEffect(() => {
    fetchChildren();
    fetchAlerts();
  }, []);

  useEffect(() => {
    if (selectedChild) fetchStats(selectedChild.id);
  }, [selectedChild]);

  const fetchChildren = async () => {
    try {
      const snap = await firestore()
        .collection('users')
        .where('parentId', '==', uid)
        .get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0]);
    } catch (e) { console.error(e); }
  };

  const fetchStats = async (childId) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const snap = await firestore()
        .collection('usageStats')
        .doc(`${childId}_${today}`)
        .get();
      if (snap.exists) setStats(snap.data());
    } catch (e) { console.error(e); }
  };

  const fetchAlerts = async () => {
    try {
      const snap = await firestore()
        .collection('alerts')
        .where('parentId', '==', uid)
        .where('read', '==', false)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChildren();
    await fetchAlerts();
    setRefreshing(false);
  };

  const markAlertRead = async (alertId) => {
    await firestore().collection('alerts').doc(alertId).update({ read: true });
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const lockChildPhone = async () => {
    if (!selectedChild) return;
    Alert.alert('Phone Lock', `${selectedChild.name} à¤šà¤¾ phone lock à¤•à¤°à¤¾à¤¯à¤šà¤¾ à¤•à¤¾?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lock à¤•à¤°à¤¾',
        style: 'destructive',
        onPress: async () => {
          await firestore().collection('commands').add({
            childId: selectedChild.id,
            command: 'LOCK_DEVICE',
            status: 'pending',
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
          Alert.alert('Done!', 'Lock command à¤ªà¤¾à¤ à¤µà¤²à¤¾.');
        },
      },
    ]);
  };

  const formatTime = (minutes) => {
    if (!minutes) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>à¤¨à¤®à¤¸à¥à¤•à¤¾à¤°! ðŸ‘‹</Text>
          <Text style={styles.headerTitle}>KidShield Dashboard</Text>
        </View>
        <TouchableOpacity
          style={styles.addChildBtn}
          onPress={() => navigation.navigate('Pairing')}>
          <Text style={{ color: COLORS.accent, fontSize: 20 }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Children Selector */}
      {children.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childSelector}>
          {children.map(child => (
            <TouchableOpacity
              key={child.id}
              style={[styles.childChip, selectedChild?.id === child.id && styles.childChipActive]}
              onPress={() => setSelectedChild(child)}>
              <Text style={{ fontSize: 20 }}>{child.avatar || 'ðŸ‘¦'}</Text>
              <Text style={[styles.childChipName, selectedChild?.id === child.id && { color: COLORS.accent }]}>
                {child.name}
              </Text>
              <View style={[styles.onlineDot, { backgroundColor: child.isOnline ? COLORS.green : COLORS.muted }]} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* No children */}
      {children.length === 0 && (
        <TouchableOpacity style={styles.emptyCard} onPress={() => navigation.navigate('Pairing')}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>ðŸ“±</Text>
          <Text style={styles.emptyTitle}>Child Device Add à¤•à¤°à¤¾</Text>
          <Text style={styles.emptyText}>à¤ªà¤¹à¤¿à¤²à¥à¤¯à¤¾à¤‚à¤¦à¤¾ à¤®à¥à¤²à¤¾à¤šà¤¾ phone pair à¤•à¤°à¤¾</Text>
        </TouchableOpacity>
      )}

      {/* Stats Cards */}
      {selectedChild && (
        <>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderColor: 'rgba(0,212,255,0.2)' }]}>
              <Text style={styles.statIcon}>â±ï¸</Text>
              <Text style={styles.statNum}>{formatTime(stats?.totalMinutes)}</Text>
              <Text style={styles.statLabel}>Screen Time Today</Text>
            </View>
            <View style={[styles.statCard, { borderColor: 'rgba(0,229,160,0.2)' }]}>
              <Text style={styles.statIcon}>ðŸ“±</Text>
              <Text style={[styles.statNum, { color: COLORS.green }]}>{stats?.appsUsed || 0}</Text>
              <Text style={styles.statLabel}>Apps Used</Text>
            </View>
            <View style={[styles.statCard, { borderColor: 'rgba(255,95,95,0.2)' }]}>
              <Text style={styles.statIcon}>ðŸš«</Text>
              <Text style={[styles.statNum, { color: COLORS.red }]}>{stats?.blockedAttempts || 0}</Text>
              <Text style={styles.statLabel}>Blocked</Text>
            </View>
            <View style={[styles.statCard, { borderColor: 'rgba(255,165,0,0.2)' }]}>
              <Text style={styles.statIcon}>ðŸ”‹</Text>
              <Text style={[styles.statNum, { color: COLORS.orange }]}>{selectedChild.battery || '--'}%</Text>
              <Text style={styles.statLabel}>Battery</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={lockChildPhone}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>ðŸ”’</Text>
              <Text style={styles.actionLabel}>Phone Lock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('Location')}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>ðŸ“</Text>
              <Text style={styles.actionLabel}>Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('AppControl')}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>âš™ï¸</Text>
              <Text style={styles.actionLabel}>App Control</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={async () => {
                await firestore().collection('commands').add({
                  childId: selectedChild.id,
                  command: 'BEDTIME_MODE',
                  status: 'pending',
                  createdAt: firestore.FieldValue.serverTimestamp(),
                });
                Alert.alert('Done!', 'Bedtime mode activate à¤•à¥‡à¤²à¤¾.');
              }}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>ðŸŒ™</Text>
              <Text style={styles.actionLabel}>Bedtime</Text>
            </TouchableOpacity>
          </View>

          {/* Location Status */}
          <View style={styles.locationCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 20 }}>ðŸ“</Text>
              <Text style={styles.locationTitle}>Current Location</Text>
              <View style={[styles.onlineDot, { backgroundColor: COLORS.green, marginLeft: 'auto' }]} />
            </View>
            <Text style={{ color: COLORS.text, fontSize: 14, fontFamily: FONTS.medium }}>
              {selectedChild.lastLocation?.address || 'Location update à¤¹à¥‹à¤¤ à¤†à¤¹à¥‡...'}
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>
              {selectedChild.lastLocation?.updatedAt ? `Updated: ${selectedChild.lastLocation.updatedAt}` : ''}
            </Text>
          </View>
        </>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>âš ï¸ Alerts ({alerts.length})</Text>
          {alerts.map(alert => (
            <TouchableOpacity
              key={alert.id}
              style={styles.alertCard}
              onPress={() => markAlertRead(alert.id)}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>{alert.icon || 'âš ï¸'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertBody}>{alert.body}</Text>
              </View>
              <Text style={{ color: COLORS.muted, fontSize: 11 }}>âœ•</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingTop: 60, paddingBottom: 100 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xl },
  greeting: { fontSize: 13, color: COLORS.muted, fontFamily: FONTS.regular },
  headerTitle: { fontSize: 24, fontFamily: FONTS.displayBlack, color: COLORS.text, letterSpacing: -0.5 },
  addChildBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  childSelector: { marginBottom: SPACING.xl },
  childChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.full,
    paddingVertical: 10, paddingHorizontal: 16,
    marginRight: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  childChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,212,255,0.08)' },
  childChipName: { color: COLORS.muted, fontFamily: FONTS.medium, fontSize: 14 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },

  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xl,
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.muted },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: SPACING.xl },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statNum: { fontSize: 22, fontFamily: FONTS.displayBlack, color: COLORS.accent, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2, textAlign: 'center' },

  sectionTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: SPACING.md },

  quickActions: { flexDirection: 'row', gap: 10, marginBottom: SPACING.xl },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionLabel: { fontSize: 11, color: COLORS.muted, fontFamily: FONTS.medium, textAlign: 'center' },

  locationCard: {
    backgroundColor: 'rgba(0,229,160,0.05)',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.15)',
    marginBottom: SPACING.xl,
  },
  locationTitle: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.green },

  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,165,0,0.05)',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255,165,0,0.2)',
    marginBottom: 10,
  },
  alertTitle: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.orange, marginBottom: 2 },
  alertBody: { fontSize: 12, color: COLORS.muted },
});
