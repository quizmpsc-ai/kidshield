// KidShield â€” MultiChildDashboard.js (Session 5)
// Multiple Children Support â€” Parent Dashboard
// à¤ªà¥à¤°à¤¤à¥à¤¯à¥‡à¤• à¤®à¥à¤²à¤¾à¤šà¥‡ individual stats + controls

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
import api from '../../services/api';

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHILD CARD COMPONENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
          <Text style={styles.avatarEmoji}>{child.emoji || 'ðŸ‘¦'}</Text>
        )}
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>

      {/* Info */}
      <Text style={styles.childName} numberOfLines={1}>
        {child.name}
      </Text>
      <Text style={styles.childAge}>{child.age ? `${child.age} à¤µà¤°à¥à¤·à¥‡` : ''}</Text>

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
      <Text style={styles.usageText}>{child.todayMinutes || 0}m à¤†à¤œ</Text>
    </TouchableOpacity>
  );
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CHILD STATS PANEL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const ChildStatsPanel = ({ child, onNavigate }) => {
  if (!child) return null;

  const stats = [
    {
      icon: 'ðŸ“±',
      label: 'Screen Time',
      value: `${Math.floor((child.todayMinutes || 0) / 60)}h ${(child.todayMinutes || 0) % 60}m`,
      color: COLORS.accent,
    },
    {
      icon: 'ðŸš«',
      label: 'Blocked Attempts',
      value: child.blockedAttempts || 0,
      color: COLORS.danger,
    },
    {
      icon: 'ðŸ“',
      label: 'Location',
      value: child.locationName || 'Unknown',
      color: COLORS.success,
    },
    {
      icon: 'ðŸ”‹',
      label: 'Battery',
      value: `${child.battery || '--'}%`,
      color: child.battery < 20 ? COLORS.danger : COLORS.warning,
    },
  ];

  const quickActions = [
    { icon: 'ðŸ“', label: 'Location', screen: 'LocationTracker', params: { childId: child.id } },
    { icon: 'ðŸš«', label: 'Apps', screen: 'AppControl', params: { childId: child.id } },
    { icon: 'ðŸ“Š', label: 'Reports', screen: 'Reports', params: { childId: child.id } },
    { icon: 'âš™ï¸', label: 'Settings', screen: 'ChildSettings', params: { childId: child.id } },
  ];

  return (
    <View style={styles.statsPanel}>
      {/* Child Header */}
      <View style={styles.statsPanelHeader}>
        <Text style={styles.statsPanelName}>{child.name} à¤šà¥‡ Stats</Text>
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
            {child.status === 'online' ? 'ðŸŸ¢ Online' : 'ðŸ”´ Offline'}
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
                {alert.type === 'sos' ? 'ðŸ†˜' : alert.type === 'geofence' ? 'ðŸ“' : 'âš ï¸'}
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ADD CHILD MODAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const AddChildModal = ({ visible, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [emoji, setEmoji] = useState('ðŸ‘¦');
  const [loading, setLoading] = useState(false);

  const emojis = ['ðŸ‘¦', 'ðŸ‘§', 'ðŸ§’', 'ðŸ‘¶', 'ðŸ§‘'];

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'à¤®à¥à¤²à¤¾à¤šà¥‡ à¤¨à¤¾à¤µ à¤Ÿà¤¾à¤•à¤¾');
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
          <Text style={styles.modalTitle}>à¤¨à¤µà¥€à¤¨ à¤®à¥à¤²à¤¾à¤šà¥‡ Account</Text>

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
            placeholder="à¤®à¥à¤²à¤¾à¤šà¥‡ à¤¨à¤¾à¤µ"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="à¤µà¤¯ (optional)"
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
                <Text style={styles.confirmBtnText}>Add à¤•à¤°à¤¾</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN SCREEN
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      Alert.alert('Error', 'Child add à¤•à¤°à¤¤à¤¾à¤¨à¤¾ error à¤†à¤²à¤¾');
    }
  };

  const removeChild = (child) => {
    Alert.alert(
      `${child.name} à¤šà¥‡ Account Delete à¤•à¤°à¤¾à¤¯à¤šà¥‡?`,
      'à¤¸à¤—à¤³à¤¾ data permanently delete à¤¹à¥‹à¤ˆà¤².',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/family/child/${child.id}`);
            } catch (e) {
              Alert.alert('Error', 'Delete à¤•à¤°à¤¤à¤¾à¤¨à¤¾ error à¤†à¤²à¤¾');
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
        <Text style={styles.headerTitle}>ðŸ›¡ï¸ KidShield</Text>
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
          <Text style={styles.emptyIcon}>ðŸ‘¨â€ðŸ‘§â€ðŸ‘¦</Text>
          <Text style={styles.emptyTitle}>à¤•à¥‹à¤£à¤¤à¥‡à¤¹à¥€ à¤®à¥‚à¤² à¤¨à¤¾à¤¹à¥€</Text>
          <Text style={styles.emptySubtitle}>
            "+ Child" button à¤¦à¤¾à¤¬à¥‚à¤¨ à¤®à¥à¤²à¤¾à¤šà¥‡ account à¤¬à¤¨à¤µà¤¾
          </Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.emptyAddBtnText}>à¤ªà¤¹à¤¿à¤²à¥‡ à¤®à¥‚à¤² Add à¤•à¤°à¤¾</Text>
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STYLES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
