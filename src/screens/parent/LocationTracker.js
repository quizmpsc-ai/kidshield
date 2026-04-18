// src/screens/parent/LocationTracker.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, TextInput, Modal
} from 'react-native';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';

const COLORS = {
  bg: '#060b14', accent: '#00d4ff', card: '#111d35',
  text: '#ffffff', subtext: '#8899aa', border: '#1e2d4a',
  danger: '#ff4444', success: '#00cc88', warning: '#ff9900',
};

export default function LocationTracker({ route }) {
  const childId = route?.params?.childId;
  const mapRef = useRef(null);

  const [childLocation, setChildLocation] = useState(null);
  const [childName, setChildName] = useState('');
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSeen, setLastSeen] = useState(null);
  const [showAddFence, setShowAddFence] = useState(false);
  const [newFenceName, setNewFenceName] = useState('');
  const [newFenceRadius, setNewFenceRadius] = useState('200');
  const [mapPressed, setMapPressed] = useState(null);
  const [isInsideFences, setIsInsideFences] = useState(true);

  useEffect(() => {
    if (!childId) return;
    fetchChildData();
    const interval = setInterval(fetchChildLocation, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [childId]);

  const fetchChildData = async () => {
    setLoading(true);
    try {
      const firestore = (await import('@react-native-firebase/firestore')).default();

      // Child info
      const childDoc = await firestore.collection('users').doc(childId).get();
      setChildName(childDoc.data()?.name || 'Child');

      // Current location
      await fetchChildLocation();

      // Geofences
      const fenceSnap = await firestore.collection('geofences')
        .where('childId', '==', childId).get();
      const fences = fenceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGeofences(fences);
    } catch (e) {
      Alert.alert('Error', 'Location data load होऊ शकला नाही');
    } finally {
      setLoading(false);
    }
  };

  const fetchChildLocation = async () => {
    try {
      const firestore = (await import('@react-native-firebase/firestore')).default();
      const locDoc = await firestore.collection('locations').doc(childId).get();
      if (locDoc.exists) {
        const data = locDoc.data();
        setChildLocation({ latitude: data.lat, longitude: data.lng });
        setLastSeen(data.updatedAt?.toDate());
        checkGeofences({ latitude: data.lat, longitude: data.lng });
      }
    } catch (e) {}
  };

  const checkGeofences = (location) => {
    if (geofences.length === 0) return;
    const inside = geofences.some(fence => {
      const distance = getDistance(location, { latitude: fence.lat, longitude: fence.lng });
      return distance <= fence.radius;
    });
    setIsInsideFences(inside);
  };

  const getDistance = (point1, point2) => {
    const R = 6371000; // metres
    const lat1 = point1.latitude * Math.PI / 180;
    const lat2 = point2.latitude * Math.PI / 180;
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLng = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const addGeofence = async () => {
    if (!mapPressed) { Alert.alert('Info', 'Map वर long press करा location निवडण्यासाठी'); return; }
    if (!newFenceName.trim()) { Alert.alert('Error', 'जागेचे नाव द्या (e.g. School, Home)'); return; }

    try {
      const firestore = (await import('@react-native-firebase/firestore')).default();
      const ref = await firestore.collection('geofences').add({
        childId,
        name: newFenceName.trim(),
        lat: mapPressed.latitude,
        lng: mapPressed.longitude,
        radius: parseInt(newFenceRadius) || 200,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      setGeofences(prev => [...prev, {
        id: ref.id, name: newFenceName, childId,
        lat: mapPressed.latitude, lng: mapPressed.longitude,
        radius: parseInt(newFenceRadius),
      }]);

      setNewFenceName('');
      setNewFenceRadius('200');
      setMapPressed(null);
      setShowAddFence(false);
      Alert.alert('✅', `"${newFenceName}" geofence जोडले!`);
    } catch (e) {
      Alert.alert('Error', 'Geofence जोडता आला नाही');
    }
  };

  const removeGeofence = async (fenceId) => {
    Alert.alert('Geofence काढा', 'हे geofence delete करायचे का?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const firestore = (await import('@react-native-firebase/firestore')).default();
          await firestore.collection('geofences').doc(fenceId).delete();
          setGeofences(prev => prev.filter(f => f.id !== fenceId));
        }
      }
    ]);
  };

  const formatTime = (date) => {
    if (!date) return 'Unknown';
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    return date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={{ color: COLORS.subtext, marginTop: 12 }}>Location load होत आहे...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={childLocation ? {
          latitude: childLocation.latitude,
          longitude: childLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : { latitude: 19.9975, longitude: 73.7898, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        onLongPress={(e) => setMapPressed(e.nativeEvent.coordinate)}
        mapType="standard"
        showsUserLocation
      >
        {/* Child Marker */}
        {childLocation && (
          <Marker coordinate={childLocation} title={childName}>
            <View style={styles.childMarker}>
              <Text style={{ fontSize: 24 }}>👦</Text>
            </View>
            <Callout>
              <View style={{ padding: 8 }}>
                <Text style={{ fontWeight: '700' }}>{childName}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Last seen: {formatTime(lastSeen)}</Text>
              </View>
            </Callout>
          </Marker>
        )}

        {/* Geofence Circles */}
        {geofences.map(fence => (
          <React.Fragment key={fence.id}>
            <Circle
              center={{ latitude: fence.lat, longitude: fence.lng }}
              radius={fence.radius}
              fillColor="rgba(0,212,255,0.1)"
              strokeColor="rgba(0,212,255,0.5)"
              strokeWidth={2}
            />
            <Marker
              coordinate={{ latitude: fence.lat, longitude: fence.lng }}
              title={fence.name}
              description={`Radius: ${fence.radius}m`}
              pinColor={COLORS.accent}
            />
          </React.Fragment>
        ))}

        {/* New fence preview */}
        {mapPressed && (
          <Marker coordinate={mapPressed} pinColor="orange" title="New Geofence" />
        )}
      </MapView>

      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: isInsideFences ? '#00cc8822' : '#ff444422' }]}>
        <Text style={[styles.statusText, { color: isInsideFences ? COLORS.success : COLORS.danger }]}>
          {isInsideFences ? '✅ Safe Zone मध्ये आहे' : '⚠️ Safe Zone बाहेर गेला!'}
        </Text>
        <Text style={styles.lastSeenText}>Last seen: {formatTime(lastSeen)}</Text>
      </View>

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={fetchChildLocation}>
            <Text style={styles.actionBtnText}>🔄 Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.accent }]}
            onPress={() => setShowAddFence(true)}
          >
            <Text style={[styles.actionBtnText, { color: '#000' }]}>+ Safe Zone जोडा</Text>
          </TouchableOpacity>
          {childLocation && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => mapRef.current?.animateToRegion({
                ...childLocation, latitudeDelta: 0.01, longitudeDelta: 0.01
              })}
            >
              <Text style={styles.actionBtnText}>📍 Find</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Geofence List */}
        {geofences.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            {geofences.map(fence => (
              <TouchableOpacity
                key={fence.id}
                style={styles.fenceChip}
                onLongPress={() => removeGeofence(fence.id)}
              >
                <Text style={styles.fenceChipText}>📍 {fence.name} ({fence.radius}m)</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {geofences.length === 0 && (
          <Text style={styles.noFenceText}>Map वर long press करा → Safe Zone जोडा</Text>
        )}
      </View>

      {/* Add Fence Modal */}
      <Modal visible={showAddFence} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>📍 Safe Zone जोडा</Text>
            {!mapPressed ? (
              <Text style={styles.modalHint}>⬅️ आधी map वर long press करा location निवडायला</Text>
            ) : (
              <Text style={styles.modalHint}>
                ✅ Location निवडले: {mapPressed.latitude.toFixed(4)}, {mapPressed.longitude.toFixed(4)}
              </Text>
            )}
            <TextInput
              style={styles.modalInput}
              placeholder="जागेचे नाव (e.g. School, Home)"
              placeholderTextColor={COLORS.subtext}
              value={newFenceName}
              onChangeText={setNewFenceName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Radius (metres) - default 200"
              placeholderTextColor={COLORS.subtext}
              value={newFenceRadius}
              onChangeText={setNewFenceRadius}
              keyboardType="numeric"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddFence(false)}>
                <Text style={{ color: COLORS.subtext }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={addGeofence}>
                <Text style={{ color: '#000', fontWeight: '700' }}>जोडा</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  map: { flex: 1 },
  childMarker: {
    backgroundColor: '#00d4ff22', borderRadius: 20,
    padding: 4, borderWidth: 2, borderColor: '#00d4ff',
  },
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, paddingHorizontal: 16,
  },
  statusText: { fontWeight: '700', fontSize: 14 },
  lastSeenText: { color: '#8899aa', fontSize: 12 },
  bottomPanel: {
    backgroundColor: '#111d35', padding: 16,
    borderTopWidth: 1, borderTopColor: '#1e2d4a',
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, backgroundColor: '#1e2d4a', borderRadius: 10,
    padding: 10, alignItems: 'center',
  },
  actionBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
  fenceChip: {
    backgroundColor: '#00d4ff22', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#00d4ff44', marginRight: 8,
  },
  fenceChipText: { color: '#00d4ff', fontSize: 12, fontWeight: '600' },
  noFenceText: { color: '#8899aa', fontSize: 12, textAlign: 'center', marginTop: 8 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#111d35', borderRadius: 20, padding: 24,
    borderTopWidth: 1, borderTopColor: '#1e2d4a',
  },
  modalTitle: { color: '#ffffff', fontWeight: '700', fontSize: 18, marginBottom: 8 },
  modalHint: { color: '#8899aa', fontSize: 13, marginBottom: 16 },
  modalInput: {
    backgroundColor: '#060b14', borderRadius: 10, padding: 14,
    color: '#ffffff', borderWidth: 1, borderColor: '#1e2d4a', marginBottom: 12,
  },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: '#1e2d4a', alignItems: 'center',
  },
  modalSaveBtn: {
    flex: 1, padding: 14, borderRadius: 10,
    backgroundColor: '#00d4ff', alignItems: 'center',
  },
});
