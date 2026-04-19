import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export default function Reports() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [usageLogs, setUsageLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const uid = auth().currentUser?.uid;

  useEffect(() => { fetchChildren(); }, []);
  useEffect(() => { if (selectedChild) fetchUsage(); }, [selectedChild]);

  const fetchChildren = async () => {
    try {
      const snap = await firestore().collection('users').where('parentId', '==', uid).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0]);
    } catch (e) {} finally { setLoading(false); }
  };

  const fetchUsage = async () => {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const snap = await firestore().collection('usageLogs')
        .where('childId', '==', selectedChild.id)
        .orderBy('date', 'desc').limit(50).get();
      setUsageLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {}
  };

  const formatDuration = (ms) => {
    if (!ms) return '0m';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins/60)}h ${mins%60}m`;
  };

  const topApps = usageLogs.reduce((acc, log) => {
    const key = log.appName || log.packageName;
    if (!acc[key]) acc[key] = { name: key, total: 0 };
    acc[key].total += log.durationMs || 0;
    return acc;
  }, {});
  const sortedApps = Object.values(topApps).sort((a, b) => b.total - a.total).slice(0, 8);
  const totalMs = Object.values(topApps).reduce((sum, a) => sum + a.total, 0);

  if (loading) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color="#00d4ff" />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📊 Usage Reports</Text>

      {children.length === 0 ? (
        <View style={styles.emptyCard}><Text style={styles.emptyText}>No children linked yet</Text></View>
      ) : (
        <>
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

          {/* Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>This Week's Summary</Text>
            <Text style={styles.summaryValue}>{formatDuration(totalMs)}</Text>
            <Text style={styles.summaryLabel}>Total Screen Time</Text>
          </View>

          {/* Top Apps */}
          <Text style={styles.sectionTitle}>Top Apps Used</Text>
          {sortedApps.length === 0 ? (
            <View style={styles.noDataCard}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
              <Text style={styles.noDataText}>No usage data yet</Text>
              <Text style={styles.noDataSub}>Data appears when child uses apps</Text>
            </View>
          ) : (
            sortedApps.map((app, i) => {
              const pct = totalMs > 0 ? (app.total / totalMs) * 100 : 0;
              return (
                <View key={i} style={styles.appRow}>
                  <View style={styles.appRank}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={styles.appName}>{app.name}</Text>
                      <Text style={styles.appTime}>{formatDuration(app.total)}</Text>
                    </View>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.pctText}>{pct.toFixed(1)}% of total</Text>
                  </View>
                </View>
              );
            })
          )}
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
  summaryCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a' },
  summaryTitle: { fontSize: 13, color: '#8899aa', marginBottom: 8 },
  summaryValue: { fontSize: 48, fontWeight: '700', color: '#00d4ff', marginBottom: 4 },
  summaryLabel: { fontSize: 13, color: '#8899aa' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 12 },
  noDataCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a' },
  noDataText: { color: '#ffffff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  noDataSub: { color: '#8899aa', fontSize: 12 },
  appRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111d35', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1e2d4a' },
  appRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,212,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  rankText: { color: '#00d4ff', fontWeight: '700', fontSize: 13 },
  appName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  appTime: { color: '#00d4ff', fontSize: 13, fontWeight: '700' },
  progressBg: { height: 6, backgroundColor: '#1e2d4a', borderRadius: 3, marginBottom: 4 },
  progressFill: { height: 6, backgroundColor: '#00d4ff', borderRadius: 3 },
  pctText: { color: '#8899aa', fontSize: 11 },
});