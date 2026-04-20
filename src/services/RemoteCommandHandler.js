// src/services/RemoteCommandHandler.js Ã¢â‚¬â€ FIXED VERSION
//
// BUGS FIXED:
// 1. childId field: data.childId Ã¢â€ â€™ user.uid (Firestore doc Ã Â¤Â®Ã Â¤Â§Ã Â¥ÂÃ Â¤Â¯Ã Â¥â€¡ childId field Ã Â¤Â¨Ã Â¤Â¸Ã Â¤Â¤Ã Â¥â€¹)
// 2. Socket reconnection logic added
// 3. NativeEventEmitter Ã¢â‚¬â€ module specify Ã Â¤â€¢Ã Â¥â€¡Ã Â¤Â²Ã Â¤Â¾ (warning fix)
// 4. LOCK_DEVICE garbled string fixed
// 5. ScreenMirror requestPermission Ã¢â‚¬â€ UI thread Ã Â¤ÂµÃ Â¤Â° run Ã Â¤â€¢Ã Â¤Â°Ã Â¤Â£Ã Â¥â€¡ Ã Â¤â€”Ã Â¤Â°Ã Â¤Å“Ã Â¥â€¡Ã Â¤Å¡Ã Â¥â€¡

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

      // Ã¢â€â‚¬Ã¢â€â‚¬ BUG FIX #5: childId correctly set Ã¢â€â‚¬Ã¢â€â‚¬
      // Problem: data.childId (Firestore field) Ã Â¤Â¨Ã Â¥â€¡Ã Â¤Â¹Ã Â¤Â®Ã Â¥â‚¬ Ã Â¤â€¦Ã Â¤Â¸Ã Â¤Â¤ Ã Â¤Â¨Ã Â¤Â¾Ã Â¤Â¹Ã Â¥â‚¬
      // Fix: user.uid Ã Â¤Â¹Ã Â¤Â¾Ã Â¤Å¡ childId Ã Â¤â€ Ã Â¤Â¹Ã Â¥â€¡
            const data = doc.data();
      this.parentId = data?.parentId || null;
      let correctChildId = data?.childId || user.uid;
      
      if (this.parentId) {
          try {
              const childSnap = await firestore().collection('families').doc(this.parentId).collection('children').limit(1).get();
              if (!childSnap.empty) {
                  correctChildId = childSnap.docs[0].id;
                  await firestore().collection('users').doc(user.uid).update({ childId: correctChildId }).catch(()=>{});
              }
          } catch(e) { console.log("AutoHeal Error:", e); }
      }
      this.childId = correctChildId;

      console.log(`RemoteCommand: childId=${this.childId}, parentId=${this.parentId}`);

      if (!this.parentId) {
        console.log('RemoteCommand: No parent linked yet Ã¢â‚¬â€ skipping');
        return;
      }

      // Ã¢â€â‚¬Ã¢â€â‚¬ SOCKET CONNECT Ã¢â€â‚¬Ã¢â€â‚¬
      this._connectSocket();

      // Ã¢â€â‚¬Ã¢â€â‚¬ NATIVE EVENT LISTENERS Ã¢â€â‚¬Ã¢â€â‚¬
      this._attachNativeListeners();

      // Ã¢â€â‚¬Ã¢â€â‚¬ SET NATIVE INFO Ã¢â€â‚¬Ã¢â€â‚¬
      if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId).catch(() => {});

      // Ã¢â€â‚¬Ã¢â€â‚¬ FIRESTORE COMMAND LISTENER Ã¢â€â‚¬Ã¢â€â‚¬
      this._attachCommandListener();

      this.isInitialized = true;
      console.log('Ã¢Å“â€¦ RemoteCommandHandler Ready!');

    } catch (err) {
      console.log('Ã¢ÂÅ’ RemoteCommand Init Error:', err);
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
      console.log('Ã¢Å“â€¦ Child Socket Connected:', this.socket.id);
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
    // Ã¢â€â‚¬Ã¢â€â‚¬ BUG FIX: NativeEventEmitter Ã Â¤Â²Ã Â¤Â¾ module pass Ã Â¤â€¢Ã Â¤Â°Ã Â¤Â¾ Ã¢â€â‚¬Ã¢â€â‚¬
    // Problem: NativeEventEmitter() without module Ã¢â€ â€™ Yellow warning
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
            // Ã¢â€â‚¬Ã¢â€â‚¬ Duplicate execution prevent Ã¢â€â‚¬Ã¢â€â‚¬
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
      // Status Ã¢â€ â€™ processing
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
          // Ã¢â€â‚¬Ã¢â€â‚¬ BUG FIX: Screen Mirror permission UI thread Ã Â¤ÂµÃ Â¤Â° Ã¢â€â‚¬Ã¢â€â‚¬
          if (ScreenMirror) {
            try {
              await ScreenMirror.requestPermission();
              await ScreenMirror.startLiveView(data.intervalSeconds || 1);
            } catch (e) {
              console.log('ScreenMirror error:', e.message);
              // Permission denied Ã¢â€ â€™ status failed
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
          // Ã¢â€â‚¬Ã¢â€â‚¬ BUG FIX: Garbled string fixed Ã¢â€â‚¬Ã¢â€â‚¬
          const { Alert } = require('react-native');
          Alert.alert(
            'Ã°Å¸â€â€™ Phone Locked',
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

      // Status Ã¢â€ â€™ executed
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
      // Processing set Ã Â¤Â®Ã Â¤Â§Ã Â¥â€šÃ Â¤Â¨ Ã Â¤â€¢Ã Â¤Â¾Ã Â¤Â¢Ã Â¤Â¾
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
