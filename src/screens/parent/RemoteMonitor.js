// src/screens/parent/RemoteMonitor.js
// AirDroid-style Remote Monitoring Dashboard

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, Alert, ActivityIndicator,
  Dimensions,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import axios from 'axios';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const API_URL = process.env.API_URL;
const { width } = Dimensions.get('window');

export default function RemoteMonitor({ route }) {
  const { child } = route.params; // selected child
  const [loading, setLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState(null);
  const [captures, setCaptures] = useState([]);
  const [liveScreenshot, setLiveScreenshot] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const liveInterval = useRef(null);

  useEffect(() => {
    // Listen for new captures from child device
    const unsubscribe = firestore()
      .collection('remoteCaptures')
      .where('childId', '==', child.id)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .onSnapshot(snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCaptures(items);

        // Update live screenshot
        const latest = items.find(i => i.type === 'screenshot');
        if (latest) setLiveScreenshot(latest.screenshotBase64);
      });

    return () => {
      unsubscribe();
      stopLiveView();
    };
  }, []);

  // ── Send command to child device ──
  const sendCommand = async (command, data = {}) => {
    const token = await auth().currentUser.getIdToken();
    await axios.post(`${API_URL}/api/commands/send`, {
      childId: child.id,
      command,
      data,
    }, { headers: { Authorization: `Bearer ${token}` } });
  };

  // ── Remote Camera Snapshot ──
  const takeSnapshot = async (camera = 'back') => {
    setLoading(true);
    setActiveFeature('camera');
    try {
      const requestId = `snap_${Date.now()}`;
      await sendCommand('TAKE_SNAPSHOT', { camera, requestId });

      // Wait for child to respond (max 15 sec)
      let attempts = 0;
      const checkInterval = setInterval(async () => {
        attempts++;
        const snap = await firestore()
          .collection('remoteCaptures')
          .where('requestId', '==', requestId)
          .limit(1)
          .get();

        if (!snap.empty || attempts > 15) {
          clearInterval(checkInterval);
          setLoading(false);
          if (snap.empty) Alert.alert('Timeout', 'Phone respond नाही केला.');
        }
      }, 1000);
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', e.message);
    }
  };

  // ── Screen Live View ──
  const startLiveView = async () => {
    setActiveFeature('screen');
    await sendCommand('START_LIVE_VIEW', { intervalSeconds: 3 });

    // Auto-refresh UI every 3 seconds
    liveInterval.current = setInterval(() => {
      // Firestore listener already updates liveScreenshot
    }, 3000);
  };

  const stopLiveView = async () => {
    if (liveInterval.current) clearInterval(liveInterval.current);
    setActiveFeature(null);
    try {
      await sendCommand('STOP_LIVE_VIEW');
    } catch (e) {}
  };

  // ── Ambient Audio ──
  const startAudioCapture = async () => {
    setLoading(true);
    setActiveFeature('audio');
    const requestId = `audio_${Date.now()}`;
    await sendCommand('START_AUDIO_CAPTURE', { requestId });
    setLoading(false);
    Alert.alert(
      '🎤 Recording',
      'Child च्या phone वर 30 second audio record होत आहे...',
      [{ text: 'OK' }]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.childInfo}>
          <Text style={styles.childAvatar}>{child.avatar || '👦'}</Text>
          <View>
            <Text style={styles.childName}>{child.name}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot,
                { backgroundColor: child.isOnline ? COLORS.green : COLORS.muted }]} />
              <Text style={styles.statusText}>
                {child.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.headerTitle}>Remote Monitor</Text>
      </View>

      {/* Feature Cards */}
      <Text style={styles.sectionLabel}>📡 Remote Controls</Text>

      {/* Screen Mirror Card */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>📱</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Screen View</Text>
            <Text style={styles.featureDesc}>Child च्या screen चे live screenshots</Text>
          </View>
          {activeFeature === 'screen' && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Live Screenshot Display */}
        {liveScreenshot && activeFeature === 'screen' && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${liveScreenshot}` }}
            style={styles.screenPreview}
            resizeMode="contain"
          />
        )}

        <View style={styles.featureBtns}>
          {activeFeature !== 'screen' ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={startLiveView}>
              <Text style={styles.btnText}>▶ Live View Start</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnDanger} onPress={stopLiveView}>
              <Text style={[styles.btnText, { color: COLORS.red }]}>⏹ Stop</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={async () => {
              const reqId = `ss_${Date.now()}`;
              await sendCommand('TAKE_SCREENSHOT', { requestId: reqId });
            }}>
            <Text style={styles.btnSecText}>📸 Snapshot</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera Card */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>📷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Remote Camera</Text>
            <Text style={styles.featureDesc}>Phone च्या camera ने photo काढा</Text>
          </View>
          {loading && activeFeature === 'camera' && (
            <ActivityIndicator color={COLORS.accent} />
          )}
        </View>

        {/* Latest camera capture */}
        {captures.filter(c => c.type === 'camera_snapshot').slice(0, 1).map(cap => (
          <Image
            key={cap.id}
            source={{ uri: `data:image/jpeg;base64,${cap.imageBase64}` }}
            style={styles.cameraPreview}
            resizeMode="cover"
          />
        ))}

        <View style={styles.featureBtns}>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => takeSnapshot('back')}
            disabled={loading}>
            <Text style={styles.btnText}>📷 Back Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={() => takeSnapshot('front')}
            disabled={loading}>
            <Text style={styles.btnSecText}>🤳 Front Camera</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Audio Card */}
      <View style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <Text style={styles.featureIcon}>🎤</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Ambient Audio</Text>
            <Text style={styles.featureDesc}>30 second आजूबाजूचा आवाज ऐका</Text>
          </View>
          {activeFeature === 'audio' && loading && (
            <ActivityIndicator color={COLORS.accent} />
          )}
        </View>

        {/* Audio captures list */}
        {captures.filter(c => c.type === 'ambient_audio').slice(0, 3).map(cap => (
          <TouchableOpacity
            key={cap.id}
            style={styles.audioItem}
            onPress={() => {
              // Play audio (base64 WAV)
              Alert.alert('🎵 Audio', `Recorded: ${cap.timestamp}`);
              // Implement audio playback with react-native-sound
            }}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>🔊</Text>
            <View>
              <Text style={styles.audioTime}>{cap.timestamp}</Text>
              <Text style={styles.audioDuration}>{cap.duration} seconds</Text>
            </View>
            <Text style={styles.playBtn}>▶</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={startAudioCapture}
          disabled={loading && activeFeature === 'audio'}>
          <Text style={styles.btnText}>🎤 30s Audio Capture</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Captures */}
      {captures.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>🗂️ Recent Captures</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {captures.filter(c => c.type !== 'ambient_audio').map(cap => (
              <View key={cap.id} style={styles.thumbnailCard}>
                {cap.imageBase64 || cap.screenshotBase64 ? (
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${cap.imageBase64 || cap.screenshotBase64}`
                    }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={styles.thumbnailBadge}>
                  <Text style={styles.thumbnailType}>
                    {cap.type === 'screenshot' ? '📱' : '📷'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingTop: 60, paddingBottom: 100 },

  header: { marginBottom: SPACING.xl },
  childInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  childAvatar: { fontSize: 36 },
  childName: { fontSize: 18, fontFamily: FONTS.bold, color: COLORS.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: COLORS.muted },
  headerTitle: { fontSize: 24, fontFamily: FONTS.displayBlack, color: COLORS.text, letterSpacing: -0.5 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2,
    textTransform: 'uppercase', color: COLORS.accent,
    marginBottom: SPACING.md, marginTop: SPACING.sm,
  },

  featureCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  featureHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: SPACING.md },
  featureIcon: { fontSize: 28 },
  featureTitle: { fontSize: 16, fontFamily: FONTS.bold, color: COLORS.text },
  featureDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },

  liveBadge: {
    backgroundColor: COLORS.red,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveBadgeText: { fontSize: 10, fontFamily: FONTS.bold, color: COLORS.white },

  screenPreview: {
    width: '100%', height: 200,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },
  cameraPreview: {
    width: '100%', height: 220,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },

  featureBtns: { flexDirection: 'row', gap: 10 },
  btnPrimary: {
    flex: 1, backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md, padding: 12, alignItems: 'center',
  },
  btnDanger: {
    flex: 1, backgroundColor: 'rgba(255,95,95,0.1)',
    borderRadius: RADIUS.md, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,95,95,0.3)',
  },
  btnSecondary: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  btnText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.bg },
  btnSecText: { fontSize: 13, fontFamily: FONTS.bold, color: COLORS.text },

  audioItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: 8,
  },
  audioTime: { fontSize: 13, fontFamily: FONTS.medium, color: COLORS.text },
  audioDuration: { fontSize: 11, color: COLORS.muted },
  playBtn: { marginLeft: 'auto', color: COLORS.accent, fontSize: 20 },

  thumbnailCard: { position: 'relative', marginRight: 10 },
  thumbnail: { width: 100, height: 160, borderRadius: RADIUS.md },
  thumbnailBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: RADIUS.full, padding: 4,
  },
  thumbnailType: { fontSize: 12 },
});
