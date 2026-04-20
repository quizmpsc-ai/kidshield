// src/services/RemoteCommandHandler.js â€” FIXED VERSION
//
// BUGS FIXED:
// 1. childId field: data.childId â†’ user.uid (Firestore doc à¤®à¤§à¥à¤¯à¥‡ childId field à¤¨à¤¸à¤¤à¥‹)
// 2. Socket reconnection logic added
// 3. NativeEventEmitter â€” module specify à¤•à¥‡à¤²à¤¾ (warning fix)
// 4. LOCK_DEVICE garbled string fixed
// 5. ScreenMirror requestPermission â€” UI thread à¤µà¤° run à¤•à¤°à¤£à¥‡ à¤—à¤°à¤œà¥‡à¤šà¥‡

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

      // â”€â”€ BUG FIX #5: childId correctly set â”€â”€
      // Problem: data.childId (Firestore field) à¤¨à¥‡à¤¹à¤®à¥€ à¤…à¤¸à¤¤ à¤¨à¤¾à¤¹à¥€
      // Fix: user.uid à¤¹à¤¾à¤š childId à¤†à¤¹à¥‡
      const data = doc.data();
      this.childId = data?.childId || user.uid;
      this.parentId = data?.parentId || null;

      console.log(`RemoteCommand: childId=${this.childId}, parentId=${this.parentId}`);

      if (!this.parentId) {
        console.log('RemoteCommand: No parent linked yet â€” skipping');
        return;
      }

      // â”€â”€ SOCKET CONNECT â”€â”€
      this._connectSocket();

      // â”€â”€ NATIVE EVENT LISTENERS â”€â”€
      this._attachNativeListeners();

      // â”€â”€ SET NATIVE INFO â”€â”€
      if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId).catch(() => {});

      // â”€â”€ FIRESTORE COMMAND LISTENER â”€â”€
      this._attachCommandListener();

      this.isInitialized = true;
      console.log('âœ… RemoteCommandHandler Ready!');

    } catch (err) {
      console.log('âŒ RemoteCommand Init Error:', err);
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
      console.log('âœ… Child Socket Connected:', this.socket.id);
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
    // â”€â”€ BUG FIX: NativeEventEmitter à¤²à¤¾ module pass à¤•à¤°à¤¾ â”€â”€
    // Problem: NativeEventEmitter() without module â†’ Yellow warning
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
            // â”€â”€ Duplicate execution prevent â”€â”€
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
      // Status â†’ processing
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
          // â”€â”€ BUG FIX: Screen Mirror permission UI thread à¤µà¤° â”€â”€
          if (ScreenMirror) {
            try {
              await ScreenMirror.requestPermission();
              await ScreenMirror.startLiveView(data.intervalSeconds || 1);
            } catch (e) {
              console.log('ScreenMirror error:', e.message);
              // Permission denied â†’ status failed
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
          // â”€â”€ BUG FIX: Garbled string fixed â”€â”€
          const { Alert } = require('react-native');
          Alert.alert(
            'ðŸ”’ Phone Locked',
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

      // Status â†’ executed
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
      // Processing set à¤®à¤§à¥‚à¤¨ à¤•à¤¾à¤¢à¤¾
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
