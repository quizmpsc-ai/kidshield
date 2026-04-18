// src/screens/parent/Settings.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Switch, Alert, TextInput, Modal
} from 'react-native';

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', border: '#1e2d4a',
  danger: '#ff4444',
};

export default function Settings({ navigation }) {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState({
    locationAlerts: true,
    appLimit: true,
    newApp: true,
    bedtime: true,
    dailyReport: false,
  });
  const [bedtime, setBedtime] = useState({ enabled: false, start: '22:00', end: '07:00' });
  const [editProfile, setEditProfile] = useState(false);
  const [newName, setNewName] = useState('');
  const [showBedtime, setShowBedtime] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUser();
    loadSettings();
  }, []);

  const fetchUser = async () => {
    const auth = (await import('@react-native-firebase/auth')).default();
    const currentUser = auth.currentUser;
    setUser(currentUser);
    setNewName(currentUser?.displayName || '');
  };

  const loadSettings = async () => {
    try {
      const auth = (await import('@react-native-firebase/auth')).default();
      const uid = auth.currentUser?.uid;
      const firestore = (await import('@react-native-firebase/firestore')).default();
      const doc = await firestore.collection('settings').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        if (data.notifications) setNotifications(data.notifications);
        if (data.bedtime) setBedtime(data.bedtime);
      }
    } catch (e) {}
  };

  const saveSettings = async (key, value) => {
    try {
      const auth = (await import('@react-native-firebase/auth')).default();
      const uid = auth.currentUser?.uid;
      const firestore = (await import('@react-native-firebase/firestore')).default();
      await firestore.collection('settings').doc(uid).set({ [key]: value }, { merge: true });
    } catch (e) {}
  };

  const updateNotification = (key, val) => {
    const updated = { ...notifications, [key]: val };
    setNotifications(updated);
    saveSettings('notifications', updated);
  };

  const updateBedtime = (updates) => {
    const updated = { ...bedtime, ...updates };
    setBedtime(updated);
    saveSettings('bedtime', updated);
  };

  const saveProfile = async () => {
    if (!newName.trim()) { Alert.alert('Error', 'नाव रिकामे ठेवू नका'); return; }
    setLoading(true);
    try {
      const auth = (await import('@react-native-firebase/auth')).default();
      await auth.currentUser.updateProfile({ displayName: newName.trim() });
      const firestore = (await import('@react-native-firebase/firestore')).default();
      await firestore.collection('users').doc(auth.currentUser.uid).update({ name: newName.trim() });
      setUser({ ...user, displayName: newName.trim() });
      setEditProfile(false);
      Alert.alert('✅', 'Profile update झाली!');
    } catch (e) {
      Alert.alert('Error', 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'नक्की logout करायचे का?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          const auth = (await import('@react-native-firebase/auth')).default();
          await auth.signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      }
    ]);
  };

  const SettingRow = ({ icon, title, subtitle, right, onPress, danger }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: COLORS.danger }]}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 40 }}>
      <Text style={styles.pageTitle}>⚙️ Settings</Text>

      {/* Profile Section */}
      <Text style={styles.sectionTitle}>Profile</Text>
      <View style={styles.card}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={{ fontSize: 32 }}>👨</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.displayName || 'Parent'}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditProfile(true)}>
            <Text style={{ color: COLORS.accent, fontSize: 13, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notifications */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        {[
          { key: 'locationAlerts', icon: '📍', title: 'Location Alerts', subtitle: 'Geofence सोडल्यावर' },
          { key: 'appLimit', icon: '⏱', title: 'App Limit Alerts', subtitle: 'Time limit संपल्यावर' },
          { key: 'newApp', icon: '📦', title: 'New App Installed', subtitle: 'नवीन app install झाल्यावर' },
          { key: 'bedtime', icon: '🌙', title: 'Bedtime Alerts', subtitle: 'Bedtime नंतर phone वापरल्यावर' },
          { key: 'dailyReport', icon: '📊', title: 'Daily Report', subtitle: 'रोज रात्री usage summary' },
        ].map((item, i) => (
          <React.Fragment key={item.key}>
            <SettingRow
              icon={item.icon}
              title={item.title}
              subtitle={item.subtitle}
              right={
                <Switch
                  value={notifications[item.key]}
                  onValueChange={val => updateNotification(item.key, val)}
                  trackColor={{ false: '#1e2d4a', true: '#00d4ff44' }}
                  thumbColor={notifications[item.key] ? '#00d4ff' : '#8899aa'}
                />
              }
            />
            {i < 4 && <View style={styles.divider} />}
          </React.Fragment>
        ))}
      </View>

      {/* Bedtime Schedule */}
      <Text style={styles.sectionTitle}>Bedtime Schedule</Text>
      <View style={styles.card}>
        <SettingRow
          icon="🌙"
          title="Bedtime Mode"
          subtitle={bedtime.enabled ? `${bedtime.start} - ${bedtime.end}` : 'बंद आहे'}
          right={
            <Switch
              value={bedtime.enabled}
              onValueChange={val => updateBedtime({ enabled: val })}
              trackColor={{ false: '#1e2d4a', true: '#00d4ff44' }}
              thumbColor={bedtime.enabled ? '#00d4ff' : '#8899aa'}
            />
          }
        />
        {bedtime.enabled && (
          <>
            <View style={styles.divider} />
            <SettingRow
              icon="🕙"
              title="Bedtime सुरू होतो"
              subtitle={bedtime.start}
              onPress={() => setShowBedtime(true)}
              right={<Text style={styles.chevron}>›</Text>}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="🌅"
              title="Bedtime संपतो"
              subtitle={bedtime.end}
              onPress={() => setShowBedtime(true)}
              right={<Text style={styles.chevron}>›</Text>}
            />
          </>
        )}
      </View>

      {/* Danger Zone */}
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <SettingRow
          icon="🔒"
          title="Password बदला"
          onPress={() => Alert.alert('Info', 'Password reset email पाठवायचे का?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'पाठवा',
              onPress: async () => {
                const auth = (await import('@react-native-firebase/auth')).default();
                await auth.sendPasswordResetEmail(user?.email);
                Alert.alert('✅', 'Password reset email पाठवले!');
              }
            }
          ])}
          right={<Text style={styles.chevron}>›</Text>}
        />
        <View style={styles.divider} />
        <SettingRow
          icon="🚪"
          title="Logout"
          danger
          onPress={handleLogout}
          right={<Text style={[styles.chevron, { color: COLORS.danger }]}>›</Text>}
        />
      </View>

      {/* Version */}
      <Text style={styles.version}>KidShield v1.0.0 · Made with ❤️</Text>

      {/* Edit Profile Modal */}
      <Modal visible={editProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Profile Edit करा</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="तुमचे नाव"
              placeholderTextColor={COLORS.subtext}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditProfile(false)}>
                <Text style={{ color: COLORS.subtext }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveProfile}>
                <Text style={{ color: '#000', fontWeight: '700' }}>{loading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bedtime Time Picker Modal */}
      <Modal visible={showBedtime} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>🌙 Bedtime Time Set करा</Text>
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.timeLabel}>Starts (रात्री)</Text>
                <TextInput
                  style={styles.timeInput}
                  value={bedtime.start}
                  onChangeText={t => updateBedtime({ start: t })}
                  placeholder="22:00"
                  placeholderTextColor={COLORS.subtext}
                  textAlign="center"
                />
              </View>
              <Text style={{ color: COLORS.subtext, fontSize: 24, marginHorizontal: 12 }}>→</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.timeLabel}>Ends (सकाळी)</Text>
                <TextInput
                  style={styles.timeInput}
                  value={bedtime.end}
                  onChangeText={t => updateBedtime({ end: t })}
                  placeholder="07:00"
                  placeholderTextColor={COLORS.subtext}
                  textAlign="center"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={() => setShowBedtime(false)}>
              <Text style={{ color: '#000', fontWeight: '700' }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 24 },
  sectionTitle: { color: '#8899aa', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 4 },

  card: {
    backgroundColor: '#111d35', borderRadius: 16,
    marginBottom: 20, borderWidth: 1, borderColor: '#1e2d4a', overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  rowIcon: { fontSize: 20, marginRight: 14 },
  rowTitle: { color: '#ffffff', fontWeight: '600', fontSize: 15 },
  rowSubtitle: { color: '#8899aa', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1e2d4a', marginLeft: 50 },
  chevron: { color: '#8899aa', fontSize: 24 },

  profileHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#1e2d4a',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  profileName: { color: '#ffffff', fontWeight: '700', fontSize: 17 },
  profileEmail: { color: '#8899aa', fontSize: 13, marginTop: 2 },
  editBtn: { backgroundColor: '#00d4ff22', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },

  version: { color: '#8899aa', fontSize: 12, textAlign: 'center', marginTop: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#111d35', borderRadius: 20, padding: 24 },
  modalTitle: { color: '#ffffff', fontWeight: '700', fontSize: 18, marginBottom: 16 },
  modalInput: {
    backgroundColor: '#060b14', borderRadius: 10, padding: 14,
    color: '#ffffff', borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#1e2d4a', alignItems: 'center' },
  modalSaveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#00d4ff', alignItems: 'center' },

  timeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  timeLabel: { color: '#8899aa', fontSize: 12, marginBottom: 6, textAlign: 'center' },
  timeInput: {
    backgroundColor: '#060b14', borderRadius: 10, padding: 14,
    color: '#00d4ff', borderWidth: 1, borderColor: '#1e2d4a', fontSize: 20, fontWeight: '700',
  },
});
