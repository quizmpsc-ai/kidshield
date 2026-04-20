// src/services/RemoteCommandHandler.js — FIXED VERSION
//
// BUGS FIXED:
// 1. childId field: data.childId → user.uid (Firestore doc मध्ये childId field नसतो)
// 2. Socket reconnection logic added
// 3. NativeEventEmitter — module specify केला (warning fix)
// 4. LOCK_DEVICE garbled string fixed
// 5. ScreenMirror requestPermission — UI thread वर run करणे गरजेचे

import { NativeModules, NativeEventEmitter } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import io from 'socket.io-client';

const { RemoteCamera, AmbientAudio, ScreenMirror } = NativeModules;
const SOCKET_SERVER_URL = 'https://kidshield-0757.onrender.com';

class RemoteCommandHandler {
  constructor() {
    this.isInitialized = false;
    this.unsubscribe = null;
    this.childId = null;
    this.parentId = null;
    this.socket = null;
    this.screenListener = null;
    this.cameraListener = null;
    this.audioListener = null;
    this.processingCommands = new Set(); // duplicate execution prevent
  }

  async init() {
    try {
      const user = auth().currentUser;
      if (!user) { console.log('RemoteCommand: No user'); return; }

      const doc = await firestore().collection('users').doc(user.uid).get();
      if (!doc.exists) { console.log('RemoteCommand: User doc missing'); return; }

      const data = doc.data();

      // ── BUG FIX #5: childId correctly set ──
      // Problem: data.childId (Firestore field) नेहमी असत नाही
      // Fix: user.uid हाच childId आहे
      this.childId = user.uid;
      this.parentId = data?.parentId || null;

      console.log(`RemoteCommand: childId=${this.childId}, parentId=${this.parentId}`);

      if (!this.parentId) {
        console.log('RemoteCommand: No parent linked yet — skipping');
        return;
      }

      // ── SOCKET CONNECT ──
      this._connectSocket();

      // ── NATIVE EVENT LISTENERS ──
      this._attachNativeListeners();

      // ── SET NATIVE INFO ──
      if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId).catch(() => {});

      // ── FIRESTORE COMMAND LISTENER ──
      this._attachCommandListener();

      this.isInitialized = true;
      console.log('✅ RemoteCommandHandler Ready!');

    } catch (err) {
      console.log('❌ RemoteCommand Init Error:', err);
    }
  }

  _connectSocket() {
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });

    this.socket.on('connect', () => {
      console.log('✅ Child Socket Connected:', this.socket.id);
      this.socket.emit('join_room', { parentId: this.parentId });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.log('Socket error:', err.message);
    });
  }

  _attachNativeListeners() {
    // ── BUG FIX: NativeEventEmitter ला module pass करा ──
    // Problem: NativeEventEmitter() without module → Yellow warning
    const screenEmitter = ScreenMirror ? new NativeEventEmitter(ScreenMirror) : null;
    const cameraEmitter = RemoteCamera ? new NativeEventEmitter(RemoteCamera) : null;
    const audioEmitter  = AmbientAudio ? new NativeEventEmitter(AmbientAudio)  : null;

    // Screen frames
    if (this.screenListener) this.screenListener.remove();
    if (screenEmitter) {
      this.screenListener = screenEmitter.addListener('onScreenFrame', (base64Frame) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_frame', {
            parentId: this.parentId,
            childId: this.childId,
            frameBase64: base64Frame,
            type: 'screen',
          });
        }
      });
    }

    // Camera frames
    if (this.cameraListener) this.cameraListener.remove();
    if (cameraEmitter) {
      this.cameraListener = cameraEmitter.addListener('onCameraFrame', (event) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_frame', {
            parentId: this.parentId,
            childId: this.childId,
            frameBase64: event.frame,
            type: event.type, // 'camera_back' or 'camera_front'
          });
        }
      });
    }

    // Audio frames
    if (this.audioListener) this.audioListener.remove();
    if (audioEmitter) {
      this.audioListener = audioEmitter.addListener('onAudioFrame', (base64Audio) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_audio', {
            parentId: this.parentId,
            childId: this.childId,
            audioBase64: base64Audio,
          });
        }
      });
    }
  }

  _attachCommandListener() {
    if (this.unsubscribe) this.unsubscribe();

    console.log('Attaching command listener for childId:', this.childId);

    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(
        snap => {
          console.log(`Commands received: ${snap.docs.length}`);
          snap.docs.forEach(doc => {
            const cmdId = doc.id;
            // ── Duplicate execution prevent ──
            if (this.processingCommands.has(cmdId)) return;
            this.processingCommands.add(cmdId);
            this.handleCommand(cmdId, doc.data());
          });
        },
        error => {
          console.log('Command listener error:', error.code, error.message);
        }
      );
  }

  async handleCommand(commandId, commandData) {
    const { command, data = {} } = commandData;
    console.log('Executing command:', command, data);

    try {
      // Status → processing
      await firestore().collection('commands').doc(commandId).update({ status: 'processing' });

      switch (command) {

        case 'START_LIVE_CAMERA':
          if (RemoteCamera) {
            await RemoteCamera.startLiveCamera(
              data.useFront === true,
              data.intervalSeconds || 1
            );
          }
          break;

        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          break;

        case 'START_AUDIO_CAPTURE':
          if (AmbientAudio) {
            await AmbientAudio.startAmbientCapture(data.requestId || 'audio_live');
          }
          break;

        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.stopAmbientCapture();
          break;

        case 'START_LIVE_VIEW':
          // ── BUG FIX: Screen Mirror permission UI thread वर ──
          if (ScreenMirror) {
            try {
              await ScreenMirror.requestPermission();
              await ScreenMirror.startLiveView(data.intervalSeconds || 1);
            } catch (e) {
              console.log('ScreenMirror error:', e.message);
              // Permission denied → status failed
              await firestore().collection('commands').doc(commandId).update({
                status: 'failed',
                error: 'Screen permission denied: ' + e.message,
              });
              this.processingCommands.delete(commandId);
              return;
            }
          }
          break;

        case 'STOP_LIVE_VIEW':
          if (ScreenMirror) await ScreenMirror.stopLiveView();
          break;

        case 'LOCK_DEVICE':
          // ── BUG FIX: Garbled string fixed ──
          const { Alert } = require('react-native');
          Alert.alert(
            '🔒 Phone Locked',
            'Parent has locked this device.',
            [{ text: 'OK' }],
            { cancelable: false }
          );
          break;

        case 'UPDATE_RULES':
          // App rules reload trigger
          const { ChildMonitorService } = require('./ChildMonitorService');
          if (ChildMonitorService?.loadAppRules) {
            await ChildMonitorService.loadAppRules();
          }
          break;

        default:
          console.log('Unknown command:', command);
      }

      // Status → executed
      await firestore().collection('commands').doc(commandId).update({
        status: 'executed',
        executedAt: firestore.FieldValue.serverTimestamp(),
      });

    } catch (error) {
      console.log('Command error:', command, error.message);
      await firestore().collection('commands').doc(commandId).update({
        status: 'failed',
        error: error.message,
      }).catch(() => {});
    } finally {
      // Processing set मधून काढा
      setTimeout(() => this.processingCommands.delete(commandId), 5000);
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.screenListener) this.screenListener.remove();
    if (this.cameraListener) this.cameraListener.remove();
    if (this.audioListener) this.audioListener.remove();
    if (this.socket) this.socket.disconnect();
    if (RemoteCamera) RemoteCamera.stopLiveCamera().catch(() => {});
    if (ScreenMirror) ScreenMirror.stopLiveView().catch(() => {});
    if (AmbientAudio) AmbientAudio.stopAmbientCapture().catch(() => {});
    this.isInitialized = false;
    this.processingCommands.clear();
    console.log('RemoteCommandHandler destroyed');
  }
}

export default new RemoteCommandHandler();
