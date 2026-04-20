import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import io from 'socket.io-client';

const API_URL = 'https://kidshield-0757.onrender.com';

export default function RemoteMonitor({ route }) {
  const { child } = route?.params || { child: { id: '', name: 'Child' } };
  const [loading, setLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const [liveFrame, setLiveFrame] = useState(null);
  const [liveType, setLiveType] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!child?.id) return;

    const parentId = auth().currentUser?.uid;

    // Connect to WebSockets
    socketRef.current = io(API_URL);
    
    socketRef.current.on('connect', () => {
        console.log('✅ Parent Socket Connected:', socketRef.current.id);
        socketRef.current.emit('join_room', { parentId });
    });

    socketRef.current.on('receive_frame', (data) => {
        // Ensure we only show frames from the currently selected child
        if (data.childId === child.id) {
            setLiveFrame(data.frameBase64);
            setLiveType(data.type);
        }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      stopAll();
    };
  }, [child?.id]);

  const sendCommand = async (command, data = {}) => {
    try {
      await firestore().collection('commands').add({
        childId: child.id,
        command,
        data,
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
        console.error(e);
    }
  };

  const startScreenLive = async () => {
    setLoading(true);
    setActiveFeature('screen');
    await sendCommand('REQUEST_SCREEN_PERMISSION');
    setTimeout(async () => {
      await sendCommand('START_LIVE_VIEW', { intervalSeconds: 1 });
      setLoading(false);
    }, 2000);
  };

  const stopScreenLive = async () => {
    await sendCommand('STOP_LIVE_VIEW');
    setActiveFeature(null);
    setLiveFrame(null);
  };

  const startCameraLive = async (useFront = false) => {
    setLoading(true);
    setActiveFeature(useFront ? 'camera_front' : 'camera_back');
    await sendCommand('START_LIVE_CAMERA', { useFront, intervalSeconds: 1 });
    setLoading(false);
  };

  const stopCamera = async () => {
    await sendCommand('STOP_LIVE_CAMERA');
    setActiveFeature(null);
    setLiveFrame(null);
  };

  const stopAll = async () => {
    await sendCommand('STOP_LIVE_VIEW');
    await sendCommand('STOP_LIVE_CAMERA');
    setActiveFeature(null);
    setLiveFrame(null);
  };

  const isLiveCameraActive = activeFeature === 'camera_front' || activeFeature === 'camera_back';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.childAvatar}>👦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.childName}>{child?.name || 'Child'}</Text>
          <Text style={styles.statusText}>Live Streaming Enabled (Socket.io)</Text>
        </View>
        {activeFeature && (
          <TouchableOpacity style={styles.stopAllBtn} onPress={stopAll}>
            <Text style={styles.stopAllText}>⏹ Stop All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live Video Display */}
      {liveFrame && (
        <View style={styles.liveContainer}>
          <View style={styles.liveHeader}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.liveTypeText}>
              {liveType === 'screen' ? '📱 Screen' : liveType === 'camera_front' ? '🤳 Front Camera' : '📷 Back Camera'}
            </Text>
          </View>
          <Image
            source={{ uri: `data:image/jpeg;base64,${liveFrame}` }}
            style={styles.liveImage}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Screen Monitor Controls */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>📱</Text>
          <Text style={styles.featureTitle}>Screen Monitor</Text>
        </View>
        {activeFeature !== 'screen' ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={startScreenLive} disabled={loading}>
            <Text style={styles.btnPrimaryText}>▶ Start Screen Live</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btnDanger} onPress={stopScreenLive}>
            <Text style={styles.btnDangerText}>⏹ Stop Screen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Camera Controls */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>📷</Text>
          <Text style={styles.featureTitle}>Remote Camera</Text>
        </View>
        <View style={styles.btnRow}>
          {!isLiveCameraActive ? (
            <>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => startCameraLive(false)} disabled={loading}>
                <Text style={styles.btnPrimaryText}>📷 Back Live</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => startCameraLive(true)} disabled={loading}>
                <Text style={styles.btnSecText}>🤳 Front Live</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={stopCamera}>
              <Text style={styles.btnDangerText}>⏹ Stop Camera</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  childAvatar: { fontSize: 36 },
  childName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statusText: { fontSize: 12, color: '#00cc88' },
  stopAllBtn: { backgroundColor: '#ff4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stopAllText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  liveContainer: { backgroundColor: '#0a0a1a', borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 2, borderColor: '#ff4444' },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: 'rgba(255,68,68,0.1)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ff4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  liveTypeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  liveImage: { width: '100%', height: 250, backgroundColor: '#000' },
  featureCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  featureIcon: { fontSize: 28 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnPrimary: { flex: 1, backgroundColor: '#00d4ff', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#000', fontWeight: '700', fontSize: 13 },
  btnDanger: { flex: 1, backgroundColor: 'rgba(255,68,68,0.15)', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.4)' },
  btnDangerText: { color: '#ff4444', fontWeight: '700', fontSize: 13 },
  btnSecondary: { flex: 1, backgroundColor: '#0d1826', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a' },
  btnSecText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});