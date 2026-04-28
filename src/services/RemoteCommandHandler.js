// src/services/RemoteCommandHandler.js
// ✅ ALL BUGS FIXED - Complete Working Version

import { NativeModules, NativeEventEmitter, AppState } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import io from 'socket.io-client';

const { RemoteCamera, AmbientAudio, ScreenMirror, KidShieldModule } = NativeModules;
const SOCKET_SERVER_URL = 'https://kidshield-0757.onrender.com';

class RemoteCommandHandler {
  constructor() {
    this.isInitialized = false;
    this.unsubscribe = null;
    this.childId = null;    // "child_XXXXX" format - commands collection match karil
    this.parentId = null;
    this.socket = null;
    this.screenListener = null;
    this.cameraListener = null;
    this.audioListener = null;
    this.processingCommands = new Set();
    this.pingInterval = null;
  }

  async init() {
    if (this.isInitialized) return;

    try {
      const user = auth().currentUser;
      if (!user) { console.log('RemoteCommand: No user logged in'); return; }

      const doc = await firestore().collection('users').doc(user.uid).get();
      if (!doc.exists) { console.log('RemoteCommand: User doc missing'); return; }

      const data = doc.data();
      this.parentId = data?.parentId || null;

      // ✅ BUG FIX (CRITICAL): childId correct set kara
      //
      // PROBLEM (Old code):
      //   this.childId = user.uid  → "bekAhk98wIMAeBZ9Os6wdnEa42D3" (actual Firebase UID)
      //   pan commands collection madhe childId = "child_1776675070755" (child_XXXXX format)
      //   MISMATCH! Commands kabhi receive hot navhate!
      //
      // SOLUTION:
      //   Firestore users/{uid} document madhe "childId" field aahe → "child_XXXXX"
      //   Hach value commands collection madhe pathavli jaate
      //   So: this.childId = data.childId (child_XXXXX) ← CORRECT MATCH!
      this.childId = data?.childId || user.uid;

      console.log(`✅ RemoteCommand: childId=${this.childId}, parentId=${this.parentId}`);

      if (!this.parentId) {
        console.log('RemoteCommand: No parent linked yet - skipping');
        return;
      }

      // Socket connect kara
      this._connectSocket();

      // Native event listeners attach kara
      this._attachNativeListeners();

      // Native modules la childId set kara (SharedPreferences sathi)
      try { if (RemoteCamera?.setChildInfo) await RemoteCamera.setChildInfo(this.childId, this.parentId); } catch(e){}
      try { if (AmbientAudio?.setChildInfo) await AmbientAudio.setChildInfo(this.childId, this.parentId); } catch(e){}
      try { if (ScreenMirror?.setChildInfo) await ScreenMirror.setChildInfo(this.childId, this.parentId); } catch(e){}

      // Firestore command listener
      this._attachCommandListener();

      // App state change listener (foreground yeta socket reconnect kara)
      AppState.addEventListener('change', this._handleAppStateChange.bind(this));

      this.isInitialized = true;
      console.log('✅ RemoteCommandHandler Ready! childId:', this.childId);

    } catch (err) {
      console.log('❌ RemoteCommand Init Error:', err.message);
    }
  }

  _handleAppStateChange(nextAppState) {
    if (nextAppState === 'active') {
      if (!this.socket?.connected) {
        console.log('App active - reconnecting socket...');
        this._connectSocket();
      }
    }
  }

  _connectSocket() {
    if (this.socket?.connected) return;

    console.log('Connecting to socket server...');
    this.socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'], // polling fallback add kela
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket Connected:', this.socket.id);
      this.socket.emit('join_room', { parentId: this.parentId });

      // Keep-alive ping
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.socket?.connected) {
          this.socket.emit('ping', { childId: this.childId });
        }
      }, 20000);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('⚠️ Socket Disconnected:', reason);
      // Parent disconnected tar sagle streams band kara
      this._forceStopAllFeatures();
      if (this.pingInterval) clearInterval(this.pingInterval);
    });

    this.socket.on('force_stop_streams', () => {
      console.log('Server: force_stop received');
      this._forceStopAllFeatures();
    });

    this.socket.on('connect_error', (err) => {
      console.log('Socket connect error:', err.message);
    });
  }

  _forceStopAllFeatures() {
    try { if (RemoteCamera) RemoteCamera.stopLiveCamera(); } catch(e) {}
    try { if (ScreenMirror) ScreenMirror.stopLiveView(); } catch(e) {}
    try { if (AmbientAudio) AmbientAudio.stopAmbientCapture(); } catch(e) {}
  }

  _attachNativeListeners() {
    // Screen frames
    const screenEmitter = ScreenMirror ? new NativeEventEmitter(ScreenMirror) : null;
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
    const cameraEmitter = RemoteCamera ? new NativeEventEmitter(RemoteCamera) : null;
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
    const audioEmitter = AmbientAudio ? new NativeEventEmitter(AmbientAudio) : null;
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

    // ✅ this.childId = "child_XXXXX" format → commands collection match karil!
    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', this.childId) // ← CORRECT: "child_XXXXX"
      .where('status', '==', 'pending')
      .onSnapshot(
        snap => {
          console.log(`Commands received: ${snap.docs.length}`);
          snap.docs.forEach(doc => {
            const cmdId = doc.id;
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
    const { command, data = {}, createdAt } = commandData;
    console.log('Executing command:', command);

    // ✅ Auto-expire: 60 seconds juna command ignore kara
    if (createdAt) {
      const cmdTime = createdAt.toDate?.().getTime() || 0;
      if (Date.now() - cmdTime > 60000) {
        console.log(`Command ${command} too old - expiring`);
        await firestore().collection('commands').doc(commandId)
          .update({ status: 'expired' }).catch(() => {});
        this.processingCommands.delete(commandId);
        return;
      }
    }

    try {
      await firestore().collection('commands').doc(commandId)
        .update({ status: 'processing' });

      // ✅ Screen/Audio commands sathi app wake kara
      if (['START_LIVE_VIEW', 'START_AUDIO_CAPTURE'].includes(command)) {
        if (KidShieldModule?.wakeApp) {
          await KidShieldModule.wakeApp().catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      switch (command) {

        case 'START_LIVE_CAMERA':
          if (RemoteCamera) {
            await RemoteCamera.startLiveCamera(
              data.useFront === true,
              data.intervalSeconds || 1
            );
          }
          // Camera sathe audio paN start kara
          if (AmbientAudio?.startAmbientCapture) {
            await AmbientAudio.startAmbientCapture('camera_audio').catch(() => {});
          }
          break;

        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          if (AmbientAudio?.stopAmbientCapture) {
            await AmbientAudio.stopAmbientCapture().catch(() => {});
          }
          break;

        case 'START_AUDIO_CAPTURE':
          if (AmbientAudio?.startAmbientCapture) {
            await AmbientAudio.startAmbientCapture(data.requestId || 'audio_live');
          }
          break;

        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio?.stopAmbientCapture) {
            await AmbientAudio.stopAmbientCapture();
          }
          break;

        case 'START_LIVE_VIEW':
          if (ScreenMirror) {
            try {
              await ScreenMirror.requestPermission();
              await ScreenMirror.startLiveView(data.intervalSeconds || 1);
              if (AmbientAudio?.startAmbientCapture) {
                await AmbientAudio.startAmbientCapture('screen_audio').catch(() => {});
              }
            } catch (e) {
              console.log('ScreenMirror error:', e.message);
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
          if (AmbientAudio?.stopAmbientCapture) {
            await AmbientAudio.stopAmbientCapture().catch(() => {});
          }
          break;

        case 'LOCK_DEVICE':
          const { Alert } = require('react-native');
          Alert.alert(
            '🔒 Phone Locked',
            'Parent has locked this device.',
            [{ text: 'OK' }],
            { cancelable: false }
          );
          break;

        case 'UPDATE_RULES':
          try {
            const CMS = require('./ChildMonitorService').default;
            if (CMS?.loadAppRules) await CMS.loadAppRules();
          } catch(e) {}
          break;

        default:
          console.log('Unknown command:', command);
      }

      // ✅ Status executed set kara
      await firestore().collection('commands').doc(commandId).update({
        status: 'executed',
        executedAt: firestore.FieldValue.serverTimestamp(),
      });

    } catch (error) {
      console.log('Command execution error:', command, error.message);
      await firestore().collection('commands').doc(commandId).update({
        status: 'failed',
        error: error.message,
      }).catch(() => {});
    } finally {
      setTimeout(() => this.processingCommands.delete(commandId), 5000);
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.screenListener) this.screenListener.remove();
    if (this.cameraListener) this.cameraListener.remove();
    if (this.audioListener) this.audioListener.remove();
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.socket) this.socket.disconnect();
    try { if (RemoteCamera) RemoteCamera.stopLiveCamera(); } catch(e) {}
    try { if (ScreenMirror) ScreenMirror.stopLiveView(); } catch(e) {}
    try { if (AmbientAudio) AmbientAudio.stopAmbientCapture(); } catch(e) {}
    this.isInitialized = false;
    this.processingCommands.clear();
    console.log('RemoteCommandHandler destroyed');
  }
}

export default new RemoteCommandHandler();
