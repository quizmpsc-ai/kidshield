import { NativeModules, NativeEventEmitter, Alert } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import io from 'socket.io-client';

const { RemoteCamera, AmbientAudio, ScreenMirror } = NativeModules;
const KidShieldModule = NativeModules.KidShieldModule || null;
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
    this.processingCommands = new Set();
  }

  async init() {
    try {
      const user = auth().currentUser;
      if (!user) return;

      const doc = await firestore().collection('users').doc(user.uid).get();
      if (!doc.exists) return;

      const userData = doc.data();
      this.parentId = userData?.parentId || null;
      let correctChildId = userData?.childId || user.uid;
      
      if (this.parentId) {
          try {
              const childSnap = await firestore().collection('families').doc(this.parentId).collection('children').limit(1).get();
              if (!childSnap.empty) {
                  correctChildId = childSnap.docs[0].id;
                  await firestore().collection('users').doc(user.uid).set({ childId: correctChildId }, { merge: true }).catch(()=>{});
              }
          } catch(e) {}
      }
      this.childId = correctChildId;

      if (!this.parentId) return;

      this._connectSocket();
      this._attachNativeListeners();

      if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId).catch(() => {});
      if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId).catch(() => {});

      this._attachCommandListener();
      this.isInitialized = true;
      console.log("RemoteCommandHandler Ready! ID: " + this.childId);
    } catch (err) {
      console.log("RemoteCommand Init Error: " + err);
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
      this.socket.emit('join_room', { parentId: this.parentId });
    });
  }

  _attachNativeListeners() {
    const screenEmitter = ScreenMirror ? new NativeEventEmitter(ScreenMirror) : null;
    const cameraEmitter = RemoteCamera ? new NativeEventEmitter(RemoteCamera) : null;
    const audioEmitter  = AmbientAudio ? new NativeEventEmitter(AmbientAudio)  : null;

    if (this.screenListener) this.screenListener.remove();
    if (screenEmitter) {
      this.screenListener = screenEmitter.addListener('onScreenFrame', (base64Frame) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_frame', {
            parentId: this.parentId, childId: this.childId, frameBase64: base64Frame, type: 'screen'
          });
        }
      });
    }

    if (this.cameraListener) this.cameraListener.remove();
    if (cameraEmitter) {
      this.cameraListener = cameraEmitter.addListener('onCameraFrame', (event) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_frame', {
            parentId: this.parentId, childId: this.childId, frameBase64: event.frame, type: event.type
          });
        }
      });
    }

    if (this.audioListener) this.audioListener.remove();
    if (audioEmitter) {
      this.audioListener = audioEmitter.addListener('onAudioFrame', (base64Audio) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_audio', {
            parentId: this.parentId, childId: this.childId, audioBase64: base64Audio
          });
        }
      });
    }
  }

  _attachCommandListener() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = firestore().collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(
        snap => {
          snap.docs.forEach(doc => {
            const cmdId = doc.id;
            if (this.processingCommands.has(cmdId)) return;
            this.processingCommands.add(cmdId);
            this.handleCommand(cmdId, doc.data());
          });
        }
      );
  }

  async handleCommand(commandId, commandData) {
    const command = commandData.command;
    const data = commandData.data || {};
    try {
      await firestore().collection('commands').doc(commandId).update({ status: 'processing' }).catch(()=>{});

      switch (command) {
        case 'START_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.startLiveCamera(data.useFront === true, data.intervalSeconds || 1);
          break;
        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          break;
        case 'START_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.startAmbientCapture(data.requestId || 'audio_live');
          break;
        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.stopAmbientCapture();
          break;
        case 'START_LIVE_VIEW':
          if (ScreenMirror) {
            try {
              await ScreenMirror.requestPermission();
              await ScreenMirror.startLiveView(data.intervalSeconds || 1);
            } catch (e) {
              await firestore().collection('commands').doc(commandId).update({ status: 'failed', error: e.message }).catch(()=>{});
              this.processingCommands.delete(commandId);
              return;
            }
          }
          break;
        case 'STOP_LIVE_VIEW':
          if (ScreenMirror) await ScreenMirror.stopLiveView();
          break;
        case 'LOCK_DEVICE':
          Alert.alert('Phone Locked', 'Parent has locked this device.', [{ text: 'OK' }], { cancelable: false });
          break;
        case 'UPDATE_RULES':
          const CMS = require('./ChildMonitorService').default;
          if (CMS && typeof CMS.loadAppRules === "function") await CMS.loadAppRules();
          break;
      }

      await firestore().collection('commands').doc(commandId).update({
        status: 'executed', executedAt: firestore.FieldValue.serverTimestamp()
      }).catch(()=>{});

    } catch (error) {
      await firestore().collection('commands').doc(commandId).update({
        status: 'failed', error: error.message
      }).catch(()=>{});
    } finally {
      setTimeout(() => this.processingCommands.delete(commandId), 5000);
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.screenListener) this.screenListener.remove();
    if (this.cameraListener) this.cameraListener.remove();
    if (this.audioListener) this.audioListener.remove();
    if (this.socket) this.socket.disconnect();
    if (RemoteCamera) RemoteCamera.stopLiveCamera().catch(()=>{});
    if (ScreenMirror) ScreenMirror.stopLiveView().catch(()=>{});
    if (AmbientAudio) AmbientAudio.stopAmbientCapture().catch(()=>{});
    this.isInitialized = false;
    this.processingCommands.clear();
  }
}

export default new RemoteCommandHandler();