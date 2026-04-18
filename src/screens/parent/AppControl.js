// src/screens/parent/AppControl.js
// Control which apps child can use and for how long

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, Modal, TextInput, Alert, FlatList,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const APP_CATEGORIES = [
  { id: 'all', label: 'All', icon: '📱' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'social', label: 'Social', icon: '💬' },
  { id: 'video', label: 'Video', icon: '📺' },
  { id: 'education', label: 'Study', icon: '📚' },
];

export default function AppControlScreen() {
  const [appRules, setAppRules] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingApp, setEditingApp] = useState(null);
  const [timeLimit, setTimeLimit] = useState('60');
  const [scheduleStart, setScheduleStart] = useState('22:00');
  const [scheduleEnd, setScheduleEnd] = useState('07:00');
  const [loading, setLoading] = useState(true);

  const uid = auth().currentUser?.uid;

  useEffect(() => {
    const unsubscribe = firestore()
      .collection('appRules')
      .where('parentId', '==', uid)
      .onSnapshot(snap => {
        setAppRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    return unsubscribe;
  }, []);

  const filteredApps = selectedCategory === 'all'
    ? appRules
    : appRules.filter(app => app.category === selectedCategory);

  const toggleApp = async (app) => {
    await firestore().collection('appRules').doc(app.id).update({
      isBlocked: !app.isBlocked,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  };

  const openEditModal = (app) => {
    setEditingApp(app);
    setTimeLimit(String(app.dailyLimitMinutes || 60));
    setScheduleStart(app.blockFrom || '22:00');
    setScheduleEnd(app.blockUntil || '07:00');
    setModalVisible(true);
  };

  const saveAppRule = async () => {
    if (!editingApp) return;
    await firestore().collection('appRules').doc(editingApp.id).update({
      dailyLimitMinutes: parseInt(timeLimit) || 60,
      blockFrom: scheduleStart,
      blockUntil: scheduleEnd,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
    setModalVisible(false);
    Alert.alert('✅ Saved!', `${editingApp.appName} साठी rules update झाले.`);
  };

  const addCustomApp = async () => {
    // This triggers a scan on child device via Firebase command
    await firestore().collection('commands').add({
      parentId: uid,
      command: 'SCAN_APPS',
      status: 'pending',
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
    Alert.alert('📱 Scanning...', 'Child device वरील apps scan होत आहेत. थोडा वेळ लागेल.');
  };

  const renderApp = ({ item: app }) => (
    <View style={styles.appCard}>
      <View style={styles.appIcon}>
        <Text style={{ fontSize: 28 }}>{app.icon || '📱'}</Text>
      </View>
      <View style={styles.appInfo}>
        <Text style={styles.appName}>{app.appName}</Text>
        <Text style={styles.appMeta}>
          {app.dailyLimitMinutes ? `${app.dailyLimitMinutes} min/day` : 'No limit'}
          {app.blockFrom ? ` • Block: ${app.blockFrom}–${app.blockUntil}` : ''}
        </Text>
        <View style={styles.appBadges}>
          <View style={[styles.badge, { backgroundColor: `${COLORS.accent}15` }]}>
            <Text style={[styles.badgeText, { color: COLORS.accent }]}>{app.category || 'Other'}</Text>
          </View>
          {app.isBlocked && (
            <View style={[styles.badge, { backgroundColor: `${COLORS.red}15` }]}>
              <Text style={[styles.badgeText, { color: COLORS.red }]}>Blocked</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.appControls}>
        <Switch
          value={!app.isBlocked}
          onValueChange={() => toggleApp(app)}
          trackColor={{ false: COLORS.surface, true: `${COLORS.green}40` }}
          thumbColor={!app.isBlocked ? COLORS.green : COLORS.muted}
        />
        <TouchableOpacity onPress={() => openEditModal(app)} style={styles.editBtn}>
          <Text style={{ fontSize: 14 }}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Control</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={addCustomApp}>
          <Text style={styles.scanBtnText}>🔍 Scan Apps</Text>
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
        {APP_CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.catChip, selectedCategory === cat.id && styles.catChipActive]}
            onPress={() => setSelectedCategory(cat.id)}>
            <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
            <Text style={[styles.catLabel, selectedCategory === cat.id && { color: COLORS.accent }]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Block All Toggle */}
      <View style={styles.blockAllCard}>
        <Text style={{ fontSize: 20, marginRight: 12 }}>🚫</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.blockAllTitle}>सगळे Apps Block करा</Text>
          <Text style={styles.blockAllSub}>Emergency - all apps immediately block</Text>
        </View>
        <Switch
          value={false}
          onValueChange={async (val) => {
            if (val) {
              Alert.alert('Block All', 'सगळे apps block करायचे का?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: async () => {
                  await firestore().collection('commands').add({
                    parentId: uid, command: 'BLOCK_ALL', status: 'pending',
                    createdAt: firestore.FieldValue.serverTimestamp(),
                  });
                }},
              ]);
            }
          }}
          trackColor={{ false: COLORS.surface, true: `${COLORS.red}40` }}
          thumbColor={COLORS.muted}
        />
      </View>

      {/* App List */}
      <FlatList
        data={filteredApps}
        keyExtractor={item => item.id}
        renderItem={renderApp}
        contentContainerStyle={{ padding: SPACING.lg, paddingTop: 0, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📱</Text>
            <Text style={styles.emptyText}>
              {loading ? 'Loading...' : 'Scan Apps करा - child device वरील apps दिसतील'}
            </Text>
          </View>
        }
      />

      {/* Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚙️ {editingApp?.appName}</Text>

            <Text style={styles.inputLabel}>Daily Time Limit (minutes)</Text>
            <TextInput
              style={styles.input}
              value={timeLimit}
              onChangeText={setTimeLimit}
              keyboardType="numeric"
              placeholder="60"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.inputLabel}>Block करायला सुरुवात (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={scheduleStart}
              onChangeText={setScheduleStart}
              placeholder="22:00"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.inputLabel}>Block संपते (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={scheduleEnd}
              onChangeText={setScheduleEnd}
              placeholder="07:00"
              placeholderTextColor={COLORS.muted}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={{ color: COLORS.muted, fontFamily: FONTS.medium }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveAppRule}>
                <Text style={{ color: COLORS.bg, fontFamily: FONTS.bold }}>Save करा</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.lg, paddingTop: 60,
  },
  headerTitle: { fontSize: 24, fontFamily: FONTS.displayBlack, color: COLORS.text, letterSpacing: -0.5 },
  scanBtn: {
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderRadius: RADIUS.full,
    paddingVertical: 8, paddingHorizontal: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  scanBtnText: { fontSize: 13, color: COLORS.accent, fontFamily: FONTS.medium },

  categoryRow: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: RADIUS.full,
    paddingVertical: 8, paddingHorizontal: 14, marginRight: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catChipActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,212,255,0.08)' },
  catLabel: { fontSize: 13, color: COLORS.muted, fontFamily: FONTS.medium },

  blockAllCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,95,95,0.05)',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255,95,95,0.15)',
    marginHorizontal: SPACING.lg, marginBottom: SPACING.md,
  },
  blockAllTitle: { fontSize: 14, fontFamily: FONTS.bold, color: COLORS.red },
  blockAllSub: { fontSize: 12, color: COLORS.muted },

  appCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  appIcon: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  appInfo: { flex: 1 },
  appName: { fontSize: 15, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 2 },
  appMeta: { fontSize: 11, color: COLORS.muted, marginBottom: 6 },
  appBadges: { flexDirection: 'row', gap: 6 },
  badge: { borderRadius: RADIUS.full, paddingVertical: 2, paddingHorizontal: 8 },
  badgeText: { fontSize: 10, fontFamily: FONTS.medium },
  appControls: { alignItems: 'center', gap: 8 },
  editBtn: { padding: 6 },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: COLORS.muted, textAlign: 'center', fontSize: 14, maxWidth: 280 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  modalTitle: { fontSize: 20, fontFamily: FONTS.displayBlack, color: COLORS.text, marginBottom: SPACING.xl, letterSpacing: -0.5 },
  inputLabel: { fontSize: 12, color: COLORS.muted, fontFamily: FONTS.medium, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.md, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
    fontSize: 15, marginBottom: SPACING.md,
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: SPACING.sm },
  cancelBtn: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  saveBtn: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent, alignItems: 'center',
  },
});
