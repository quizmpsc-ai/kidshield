// KidShield — MultiChildDashboard.js (Session 5)
// Multiple Children Support — Parent Dashboard
// प्रत्येक मुलाचे individual stats + controls

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import api from '../services/api';

// Theme
const COLORS = {
  bg: '#060b14',
  card: '#111d35',
  accent: '#00d4ff',
  accent2: '#7c3aed',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  text: '#ffffff',
  textMuted: '#8899aa',
  border: '#1e3a5f',
};

// ══════════════════════════════════════════
// CHILD CARD COMPONENT
// ══════════════════════════════════════════
const ChildCard = ({ child, isActive, onPress, onLongPress }) => {
  const statusColor =
    child.status === 'online'
      ? COLORS.success
      : child.status === 'alert'
      ? COLORS.danger
      : COLORS.textMuted;

  const usagePercent = Math.min(
    ((child.todayMinutes || 0) / (child.dailyLimitMinutes || 120)) * 100,
    100
  );

  return (
    <TouchableOpacity
      style={[styles.childCard, isActive && styles.childCardActive]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
    >
      {/* Avatar */}
      <View style={[styles.avatarContainer, { borderColor: statusColor }]}>
        {child.photoURL ? (
          <Image source={{ uri: child.photoURL }} style={styles.avatar} />
        ) : (
          <Text style={styles.avatarEmoji}>{child.emoji || '👦'}</Text>
        )}
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>

      {/* Info */}
      <Text style={styles.childName} numberOfLines={1}>
        {child.name}
      </Text>
      <Text style={styles.childAge}>{child.age ? `${child.age} वर्षे` : ''}</Text>

      {/* Usage bar */}
      <View style={styles.usageBar}>
        <View
          style={[
            styles.usageFill,
            {
              width: `${usagePercent}%`,
              backgroundColor:
                usagePercent > 90
                  ? COLORS.danger
                  : usagePercent > 70
                  ? COLORS.warning
                  : COLORS.success,
            },
          ]}
        />
      </View>
      <Text style={styles.usageText}>{child.todayMinutes || 0}m आज</Text>
    </TouchableOpacity>
  );
};

// ══════════════════════════════════════════
// CHILD STATS PANEL
// ══════════════════════════════════════════
const ChildStatsPanel = ({ child, onNavigate }) => {
  if (!child) return null;

  const stats = [
    {
      icon: '📱',
      label: 'Screen Time',
      value: `${Math.floor((child.todayMinutes || 0) / 60)}h ${(child.todayMinutes || 0) % 60}m`,
      color: COLORS.accent,
    },
    {
      icon: '🚫',
      label: 'Blocked Attempts',
      value: child.blockedAttempts || 0,
      color: COLORS.danger,
    },
    {
      icon: '📍',
      label: 'Location',
      value: child.locationName || 'Unknown',
      color: COLORS.success,
    },
    {
      icon: '🔋',
      label: 'Battery',
      value: `${child.battery || '--'}%`,
      color: child.battery < 20 ? COLORS.danger : COLORS.warning,
    },
  ];

  const quickActions = [
    { icon: '📍', label: 'Location', screen: 'LocationTracker', params: { childId: child.id } },
    { icon: '🚫', label: 'Apps', screen: 'AppControl', params: { childId: child.id } },
    { icon: '📊', label: 'Reports', screen: 'Reports', params: { childId: child.id } },
    { icon: '⚙️', label: 'Settings', screen: 'ChildSettings', params: { childId: child.id } },
  ];

  return (
    <View style={styles.statsPanel}>
      {/* Child Header */}
      <View style={styles.statsPanelHeader}>
        <Text style={styles.statsPanelName}>{child.name} चे Stats</Text>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                child.status === 'online' ? '#16532a' : '#4a1515',
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: child.status === 'online' ? COLORS.success : COLORS.danger },
            ]}
          >
            {child.status === 'online' ? '🟢 Online' : '🔴 Offline'}
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {stats.map((stat, i) => (
          <View key={i} style={styles.statItem}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={[styles.statValue, { color: stat.color }]}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.quickActions}>
        {quickActions.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={styles.actionBtn}
            onPress={() => onNavigate(action.screen, action.params)}
          >
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Alerts */}
      {child.recentAlerts && child.recentAlerts.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Recent Alerts</Text>
          {child.recentAlerts.slice(0, 3).map((alert, i) => (
            <View key={i} style={styles.alertRow}>
              <Text style={styles.alertIcon}>
                {alert.type === 'sos' ? '🆘' : alert.type === 'geofence' ? '📍' : '⚠️'}
              </Text>
              <Text style={styles.alertText}>{alert.message}</Text>
              <Text style={styles.alertTime}>{alert.time}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
};

// ══════════════════════════════════════════
// ADD CHILD MODAL
// ══════════════════════════════════════════
const AddChildModal = ({ visible, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [emoji, setEmoji] = useState('👦');
  const [loading, setLoading] = useState(false);

  const emojis = ['👦', '👧', '🧒', '👶', '🧑'];

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'मुलाचे नाव टाका');
      return;
    }
    setLoading(true);
    await onAdd({ name: name.trim(), age: parseInt(age) || 0, emoji });
    setLoading(false);
    setName('');
    setAge('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>नवीन मुलाचे Account</Text>

          {/* Emoji Picker */}
          <View style={styles.emojiRow}>
            {emojis.map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                onPress={() => setEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="मुलाचे नाव"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="वय (optional)"
            placeholderTextColor={COLORS.textMuted}
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleAdd}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Add करा</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ══════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════
export default function MultiChildDashboard({ navigation }) {
  const [children, setChildren] = useState([]);
  const [activeChildId, setActiveChildId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const parentId = auth().currentUser?.uid;

  // Firestore real-time listener
  useFocusEffect(
    useCallback(() => {
      if (!parentId) return;

      const unsubscribe = firestore()
        .collection('families')
        .doc(parentId)
        .collection('children')
        .onSnapshot(
          (snapshot) => {
            const kids = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
            setChildren(kids);
            if (kids.length > 0 && !activeChildId) {
              setActiveChildId(kids[0].id);
            }
            setLoading(false);
          },
          (err) => {
            console.error('Firestore error:', err);
            setLoading(false);
          }
        );

      return () => unsubscribe();
    }, [parentId])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    // Trigger a manual sync
    try {
      await api.post('/parent/sync', { parentId });
    } catch (e) {}
    setRefreshing(false);
  };

  const addChild = async (childData) => {
    try {
      await api.post('/family/add-child', {
        parentId,
        child: childData,
      });
    } catch (e) {
      Alert.alert('Error', 'Child add करताना error आला');
    }
  };

  const removeChild = (child) => {
    Alert.alert(
      `${child.name} चे Account Delete करायचे?`,
      'सगळा data permanently delete होईल.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/family/child/${child.id}`);
            } catch (e) {
              Alert.alert('Error', 'Delete करताना error आला');
            }
          },
        },
      ]
    );
  };

  const activeChild = children.find((c) => c.id === activeChildId);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading children...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛡️ KidShield</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addBtnText}>+ Child</Text>
        </TouchableOpacity>
      </View>

      {/* No children state */}
      {children.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👨‍👧‍👦</Text>
          <Text style={styles.emptyTitle}>कोणतेही मूल नाही</Text>
          <Text style={styles.emptySubtitle}>
            "+ Child" button दाबून मुलाचे account बनवा
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.emptyAddBtnText}>पहिले मूल Add करा</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.accent}
            />
          }
        >
          {/* Children Horizontal Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.childScroll}
            contentContainerStyle={styles.childScrollContent}
          >
            {children.map((child) => (
              <ChildCard
                key={child.id}
                child={child}
                isActive={child.id === activeChildId}
                onPress={() => setActiveChildId(child.id)}
                onLongPress={() => removeChild(child)}
              />
            ))}
          </ScrollView>

          {/* Active Child Stats */}
          <ChildStatsPanel
            child={activeChild}
            onNavigate={(screen, params) => navigation.navigate(screen, params)}
          />
        </ScrollView>
      )}

      {/* Add Child Modal */}
      <AddChildModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addChild}
      />
    </View>
  );
}

// ══════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  addBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 14 },

  childScroll: { paddingVertical: 8 },
  childScrollContent: { paddingHorizontal: 16, gap: 12 },

  childCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    width: 110,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  childCardActive: { borderColor: COLORS.accent },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarEmoji: { fontSize: 28 },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  childName: { color: COLORS.text, fontWeight: '700', fontSize: 13, textAlign: 'center' },
  childAge: { color: COLORS.textMuted, fontSize: 11, marginBottom: 8 },
  usageBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#1e3a5f',
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  usageFill: { height: '100%', borderRadius: 2 },
  usageText: { color: COLORS.textMuted, fontSize: 10 },

  statsPanel: {
    margin: 16,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
  },
  statsPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statsPanelName: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0d1a2d',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  statLabel: { color: COLORS.textMuted, fontSize: 11 },

  sectionLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 10, letterSpacing: 1 },

  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  actionBtn: {
    flex: 1,
    backgroundColor: '#0d1a2d',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  actionIcon: { fontSize: 20, marginBottom: 4 },
  actionLabel: { color: COLORS.textMuted, fontSize: 11 },

  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d1a2d',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  alertIcon: { fontSize: 18 },
  alertText: { flex: 1, color: COLORS.text, fontSize: 13 },
  alertTime: { color: COLORS.textMuted, fontSize: 11 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, marginTop: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySubtitle: { color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyAddBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  emptyAddBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  emojiRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  emojiBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#0d1a2d', justifyContent: 'center', alignItems: 'center' },
  emojiBtnActive: { borderWidth: 2, borderColor: COLORS.accent },
  emojiText: { fontSize: 26 },
  input: {
    backgroundColor: '#0d1a2d',
    borderRadius: 12,
    padding: 14,
    color: COLORS.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#0d1a2d', alignItems: 'center' },
  cancelBtnText: { color: COLORS.textMuted, fontWeight: '600' },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center' },
  confirmBtnText: { color: COLORS.bg, fontWeight: '700' },
});
