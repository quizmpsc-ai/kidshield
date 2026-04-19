import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export default function LocationTracker() {
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const uid = auth().currentUser?.uid;

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    const unsub = firestore().collection('locations').doc(selectedChild.id)
      .onSnapshot(doc => {
        if (doc.exists) {
          setLocation(doc.data());
          setLastUpdated(new Date().toLocaleTimeString());
        }
      });
    return unsub;
  }, [selectedChild]);

  const fetchChildren = async () => {
    try {
      const snap = await firestore().collection('users')
        .where('parentId', '==', uid).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const requestLocationUpdate = async () => {
    if (!selectedChild) return;
    try {
      await firestore().collection('commands').add({
        childId: selectedChild.id,
        command: 'GET_LOCATION',
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert('Sent', 'Location update requested');
    } catch (e) {
      Alert.alert('Error', 'Could not send request');
    }
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
      <Text style={styles.title}>📍 Location Tracker</Text>

      {children.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No children linked yet.</Text>
          <Text style={styles.emptySubText}>Go to Dashboard → Add Child</Text>
        </View>
      )}

      {/* Child selector */}
      {children.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {children.map(child => (
            <TouchableOpacity key={child.id}
              style={[styles.chip, selectedChild?.id === child.id && styles.chipActive]}
              onPress={() => setSelectedChild(child)}>
              <Text style={{ fontSize: 16 }}>👦</Text>
              <Text style={[styles.chipText, selectedChild?.id === child.id && { color: '#00d4ff' }]}>
                {child.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Location info */}
      {selectedChild && (
        <>
          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <Text style={styles.locationTitle}>Current Location</Text>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            {location ? (
              <>
                <View style={styles.coordRow}>
                  <View style={styles.coordBox}>
                    <Text style={styles.coordLabel}>Latitude</Text>
                    <Text style={styles.coordValue}>
                      {(location.lat || location.latitude || 0).toFixed(6)}
                    </Text>
                  </View>
                  <View style={styles.coordBox}>
                    <Text style={styles.coordLabel}>Longitude</Text>
                    <Text style={styles.coordValue}>
                      {(location.lng || location.longitude || 0).toFixed(6)}
                    </Text>
                  </View>
                </View>
                {location.accuracy && (
                  <Text style={styles.accuracyText}>
                    Accuracy: ±{Math.round(location.accuracy)}m
                  </Text>
                )}
                <Text style={styles.updatedText}>
                  Last updated: {lastUpdated || 'Unknown'}
                </Text>
              </>
            ) : (
              <View style={styles.noLocationBox}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📡</Text>
                <Text style={styles.noLocationText}>Waiting for location...</Text>
                <Text style={styles.noLocationSub}>
                  Make sure child's app is running with location permission
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.refreshBtn} onPress={requestLocationUpdate}>
              <Text style={styles.refreshText}>Request Location Update</Text>
            </TouchableOpacity>
          </View>

          {/* Map placeholder */}
          <View style={styles.mapPlaceholder}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🗺️</Text>
            <Text style={{ color: '#8899aa', textAlign: 'center' }}>
              {location
                ? `Location: ${(location.lat || location.latitude || 0).toFixed(4)}, ${(location.lng || location.longitude || 0).toFixed(4)}`
                : 'Map will show when location is available'}
            </Text>
          </View>

          {/* Safety status */}
          <View style={styles.safeCard}>
            <Text style={styles.safeIcon}>✅</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.safeTitle}>{selectedChild.name} is Safe</Text>
              <Text style={styles.safeText}>Location tracking is active</Text>
            </View>
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
  emptyText: { color: '#ffffff', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptySubText: { color: '#8899aa', fontSize: 13 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#111d35', borderRadius: 50,
    paddingVertical: 8, paddingHorizontal: 14,
    marginRight: 8, borderWidth: 1, borderColor: '#1e2d4a',
  },
  chipActive: { borderColor: '#00d4ff' },
  chipText: { color: '#8899aa', fontSize: 14, fontWeight: '600' },
  locationCard: {
    backgroundColor: '#111d35', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 16,
  },
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  locationTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,204,136,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00cc88' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#00cc88' },
  coordRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  coordBox: { flex: 1, backgroundColor: '#0a1628', borderRadius: 10, padding: 12 },
  coordLabel: { fontSize: 11, color: '#8899aa', marginBottom: 4 },
  coordValue: { fontSize: 14, fontWeight: '700', color: '#00d4ff' },
  accuracyText: { fontSize: 12, color: '#8899aa', marginBottom: 4 },
  updatedText: { fontSize: 12, color: '#8899aa', marginBottom: 16 },
  noLocationBox: { alignItems: 'center', paddingVertical: 24, marginBottom: 16 },
  noLocationText: { color: '#ffffff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  noLocationSub: { color: '#8899aa', fontSize: 12, textAlign: 'center' },
  refreshBtn: { backgroundColor: 'rgba(0,212,255,0.1)', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#00d4ff' },
  refreshText: { color: '#00d4ff', fontWeight: '600' },
  mapPlaceholder: {
    backgroundColor: '#111d35', borderRadius: 16, height: 180,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 16,
  },
  safeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,204,136,0.05)', borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: 'rgba(0,204,136,0.15)',
  },
  safeIcon: { fontSize: 28 },
  safeTitle: { fontSize: 15, fontWeight: '700', color: '#00cc88' },
  safeText: { fontSize: 12, color: '#8899aa', marginTop: 2 },
});