import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, Alert, ActivityIndicator,
  Dimensions, Animated,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const API_URL = 'https://kidshield-0757.onrender.com';
const { width } = Dimensions.get('window');

export default function RemoteMonitor({ route }) {
  const { child } = route?.params || { child: { id: '', name: 'Child' } };
  const [loading, setLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const [captures, setCaptures] = useState([]);
  const [liveFrame, setLiveFrame] = useState(null);
  const [liveType, setLiveType] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [childData, setChildData] = useState(null);
  const audioAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!child?.id) return;

    // Listen to child's liveFrame in Firestore (families collection)
    const unsubChild = firestore()
      .collection('families').doc(auth().currentUser?.uid)
      .collection('children').doc(child.id)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          setChildData(data);
          if (data.liveFrame) {
            setLiveFrame(data.liveFrame);
            setLiveType(data.liveType || 'screen');
          }
          if (data.audioLevel !== undefined) {
            setAudioLevel(data.audioLevel);
            // Animate audio bar
            Animated.timing(audioAnim, {
              toValue: data.audioLevel / 100,
              duration: 100,
              useNativeDriver: false,
            }).start();
          }
          if (data.isMuted !== undefined) setIsMuted(data.isMuted);
        }
      });

    // Listen for captures history
    const unsubCaptures = firestore()
      .collection('remoteCaptures')
      .where('childId', '==', child.id)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .onSnapshot(snap => {
        setCaptures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

    return () => {
      unsubChild();
      unsubCaptures();
      stopAll();
    };
  }, [child?.id]);

  const sendCommand = async (command, data = {}) => {
    try {
      const token = await auth().currentUser?.getIdToken();
      await fetch(`${API_URL}/api/command/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ childId: child.id, command, params: data }),
      });
    } catch (e) {
      // Fallback: direct Firestore command
      await firestore().collection('commands').add({
        childId: child.id,
        command,
        data,
        status: 'pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    }
  };

  // â”€â”€ Screen Live View â”€â”€
  const startScreenLive = async () => {
    setLoading(true);
    setActiveFeature('screen');
    await sendCommand('REQUEST_SCREEN_PERMISSION');
    setTimeout(async () => {
      await sendCommand('START_LIVE_VIEW', { intervalSeconds: 3 });
      setLoading(false);
    }, 2000);
  };

  const stopScreenLive = async () => {
    await sendCommand('STOP_LIVE_VIEW');
    setActiveFeature(null);
    setLiveFrame(null);
  };

  // â”€â”€ Camera â”€â”€
  const startCameraLive = async (useFront = false) => {
    setLoading(true);
    setActiveFeature(useFront ? 'camera_front' : 'camera_back');
    await sendCommand('START_LIVE_CAMERA', { useFront, intervalSeconds: 3 });
    setLoading(false);
  };

  const stopCamera = async () => {
    await sendCommand('STOP_LIVE_CAMERA');
    setActiveFeature(null);
  };

  const takeSnapshot = async (useFront = false) => {
    setLoading(true);
    const requestId = `snap_${Date.now()}`;
    await sendCommand('TAKE_SNAPSHOT', { camera: useFront ? 'front' : 'back', requestId });
    setTimeout(() => setLoading(false), 3000);
  };

  // â”€â”€ Audio â”€â”€
  const startAudio = async () => {
    setLoading(true);
    setActiveFeature('audio');
    const requestId = `audio_${Date.now()}`;
    await sendCommand('START_AUDIO_CAPTURE', { requestId });
    setLoading(false);
  };

  const stopAudio = async () => {
    await sendCommand('STOP_AUDIO_CAPTURE');
    setActiveFeature(null);
  };

  const toggleMute = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await sendCommand(newMuted ? 'MUTE_AUDIO' : 'UNMUTE_AUDIO');
  };

  const stopAll = async () => {
    try {
      await sendCommand('STOP_LIVE_VIEW');
      await sendCommand('STOP_LIVE_CAMERA');
      await sendCommand('STOP_AUDIO_CAPTURE');
    } catch (e) {}
    setActiveFeature(null);
  };

  const isLiveCameraActive = activeFeature === 'camera_front' || activeFeature === 'camera_back';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.childAvatar}>ðŸ‘¦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.childName}>{child?.name || 'Child'}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: childData ? '#00cc88' : '#8899aa' }]} />
            <Text style={styles.statusText}>{childData ? 'Active' : 'Offline'}</Text>
          </View>
        </View>
        {activeFeature && (
          <TouchableOpacity style={styles.stopAllBtn} onPress={stopAll}>
            <Text style={styles.stopAllText}>â¹ Stop All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live Frame Display */}
      {liveFrame && (
        <View style={styles.liveContainer}>
          <View style={styles.liveHeader}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.liveTypeText}>
              {liveType === 'screen' ? 'ðŸ“± Screen' :
               liveType === 'camera_front' ? 'ðŸ¤³ Front Camera' : 'ðŸ“· Back Camera'}
            </Text>
          </View>
          <Image
            source={{ uri: `data:image/jpeg;base64,${liveFrame}` }}
            style={styles.liveImage}
            resizeMode="contain"
          />
        </View>
      )}

      {/* â”€â”€ Screen Monitor â”€â”€ */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>ðŸ“±</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Screen Monitor</Text>
            <Text style={styles.featureDesc}>Child à¤šà¥à¤¯à¤¾ screen à¤šà¥‡ live view</Text>
          </View>
          {activeFeature === 'screen' && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>LIVE</Text></View>}
        </View>
        <View style={styles.btnRow}>
          {activeFeature !== 'screen' ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={startScreenLive} disabled={loading}>
              {loading && activeFeature !== 'screen' ? <ActivityIndicator color="#000" size="small" /> :
                <Text style={styles.btnPrimaryText}>â–¶ Start Live</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={stopScreenLive}>
              <Text style={styles.btnDangerText}>â¹ Stop</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnSecondary}
            onPress={() => sendCommand('TAKE_SCREENSHOT', { requestId: `ss_${Date.now()}` })}>
            <Text style={styles.btnSecText}>ðŸ“¸ Snapshot</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* â”€â”€ Remote Camera â”€â”€ */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>ðŸ“·</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Remote Camera</Text>
            <Text style={styles.featureDesc}>Front + Back camera live stream</Text>
          </View>
          {isLiveCameraActive && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>LIVE</Text></View>}
        </View>

        {/* Latest capture */}
        {captures.find(c => c.type === 'camera_snapshot' || c.type === 'camera_front') && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${captures.find(c => c.imageBase64)?.imageBase64}` }}
            style={styles.capturePreview}
            resizeMode="cover"
          />
        )}

        <View style={styles.btnRow}>
          {!isLiveCameraActive ? (
            <>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => startCameraLive(false)} disabled={loading}>
                <Text style={styles.btnPrimaryText}>ðŸ“· Back Live</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => startCameraLive(true)} disabled={loading}>
                <Text style={styles.btnSecText}>ðŸ¤³ Front Live</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={stopCamera}>
              <Text style={styles.btnDangerText}>â¹ Stop Camera</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.btnRow, { marginTop: 8 }]}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => takeSnapshot(false)} disabled={loading}>
            <Text style={styles.btnSecText}>ðŸ“· Back Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => takeSnapshot(true)} disabled={loading}>
            <Text style={styles.btnSecText}>ðŸ¤³ Front Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* â”€â”€ Ambient Audio â”€â”€ */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>ðŸŽ¤</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Ambient Audio</Text>
            <Text style={styles.featureDesc}>Surroundings à¤à¤•à¤¾ + mute/unmute</Text>
          </View>
          {activeFeature === 'audio' && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>REC</Text></View>}
        </View>

        {/* Audio Level Meter */}
        {activeFeature === 'audio' && (
          <View style={styles.audioMeter}>
            <Text style={styles.audioMeterLabel}>
              {isMuted ? 'ðŸ”‡ Muted' : `ðŸ”Š Level: ${audioLevel}%`}
            </Text>
            <View style={styles.audioBar}>
              <Animated.View style={[
                styles.audioFill,
                {
                  width: audioAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  backgroundColor: audioLevel > 70 ? '#ff4444' : audioLevel > 40 ? '#ff9900' : '#00cc88',
                }
              ]} />
            </View>
          </View>
        )}

        <View style={styles.btnRow}>
          {activeFeature !== 'audio' ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={startAudio}>
              <Text style={styles.btnPrimaryText}>ðŸŽ¤ Start Audio</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.btnDanger} onPress={stopAudio}>
                <Text style={styles.btnDangerText}>â¹ Stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSecondary, isMuted && { borderColor: '#ff9900' }]}
                onPress={toggleMute}>
                <Text style={styles.btnSecText}>{isMuted ? 'ðŸ”Š Unmute' : 'ðŸ”‡ Mute'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Audio history */}
        {captures.filter(c => c.type === 'ambient_audio').slice(0, 3).map(cap => (
          <View key={cap.id} style={styles.audioItem}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>ðŸ”Š</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.audioTime}>{cap.timestamp?.substring(0, 19) || 'Recording'}</Text>
              <Text style={styles.audioDuration}>{cap.duration}s recording</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Captures Gallery */}
      {captures.filter(c => c.imageBase64 || c.screenshotBase64).length > 0 && (
        <>
          <Text style={styles.sectionLabel}>ðŸ—‚ï¸ Recent Captures</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {captures.filter(c => c.imageBase64 || c.screenshotBase64).map(cap => (
              <View key={cap.id} style={styles.thumbCard}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${cap.imageBase64 || cap.screenshotBase64}` }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
                <Text style={styles.thumbLabel}>
                  {cap.type === 'camera_front' ? 'ðŸ¤³' :
                   cap.type === 'camera_snapshot' ? 'ðŸ“·' : 'ðŸ“±'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060b14' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  childAvatar: { fontSize: 36 },
  childName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: '#8899aa' },
  stopAllBtn: { backgroundColor: '#ff4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  stopAllText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  liveContainer: { backgroundColor: '#0a0a1a', borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 2, borderColor: '#ff4444' },
  liveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: 'rgba(255,68,68,0.1)' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ff4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  liveTypeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  liveImage: { width: '100%', height: 220, backgroundColor: '#000' },
  featureCard: { backgroundColor: '#111d35', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e2d4a' },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  featureIcon: { fontSize: 28 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  featureDesc: { fontSize: 12, color: '#8899aa', marginTop: 2 },
  activeBadge: { backgroundColor: '#ff4444', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  capturePreview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#000', marginBottom: 12 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btnPrimary: { flex: 1, backgroundColor: '#00d4ff', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#000', fontWeight: '700', fontSize: 13 },
  btnDanger: { flex: 1, backgroundColor: 'rgba(255,68,68,0.15)', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,68,68,0.4)' },
  btnDangerText: { color: '#ff4444', fontWeight: '700', fontSize: 13 },
  btnSecondary: { flex: 1, backgroundColor: '#0d1826', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e2d4a' },
  btnSecText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  audioMeter: { backgroundColor: '#060b14', borderRadius: 10, padding: 12, marginBottom: 12 },
  audioMeterLabel: { color: '#fff', fontWeight: '600', marginBottom: 8 },
  audioBar: { height: 10, backgroundColor: '#1e2d4a', borderRadius: 5 },
  audioFill: { height: 10, borderRadius: 5 },
  audioItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d1826', borderRadius: 10, padding: 10, marginTop: 8 },
  audioTime: { fontSize: 12, color: '#fff', fontWeight: '500' },
  audioDuration: { fontSize: 11, color: '#8899aa' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: '#00d4ff', marginBottom: 12, marginTop: 4 },
  thumbCard: { marginRight: 10, position: 'relative' },
  thumb: { width: 90, height: 140, borderRadius: 10 },
  thumbLabel: { position: 'absolute', top: 4, right: 4, fontSize: 14 },
});