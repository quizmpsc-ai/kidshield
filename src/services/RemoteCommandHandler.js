// src/services/RemoteCommandHandler.js
import { NativeModules, NativeEventEmitter, Alert, PermissionsAndroid } from 'react-native';
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
    this.securityAlertListener = null;
    this.audioListener = null;
  }

  async init() {
    const user = auth().currentUser;
    if (!user) return;
    this.childId = user.uid;

    const doc = await firestore().collection('users').doc(user.uid).get();
    this.parentId = doc.data()?.parentId || null;

    if (!this.parentId) return;

    // Connect to WebSockets
    this.socket = io(SOCKET_SERVER_URL);
        // SYNC RULES TO NATIVE (For Accessibility Service)
    this.socket.on('receive_rules', async (rules) => {
        if (NativeModules.KidShieldModule) {
            const { KidShieldModule } = NativeModules;
            if (rules.apps) {
                rules.apps.forEach(app => KidShieldModule.syncBoolRule("block_" + app.packageName, app.blocked));
            }
            if (rules.screenTime) {
                KidShieldModule.syncIntRule("daily_limit_mins", rules.screenTime.limitMins || 0);
                KidShieldModule.syncRule("bedtime_start", rules.screenTime.start || "");
                KidShieldModule.syncRule("bedtime_end", rules.screenTime.end || "");
            }
            if (rules.webFilter) {
                KidShieldModule.syncBoolRule("filter_adult", rules.webFilter.blockAdult || false);
                KidShieldModule.syncRule("blocked_domains", rules.webFilter.domains || "");
            }
        }
    });
    this.socket.on('connect', () => {
        console.log('Child Socket Connected:', this.socket.id);
        this.socket.emit('join_room', { parentId: this.parentId });
    });

    // Listen for Native Events (Screen & Camera frames)
    const eventEmitter = new NativeEventEmitter();
    
    this.screenListener = eventEmitter.addListener('onScreenFrame', (base64Frame) => {
        if (this.socket && this.socket.connected) {
            this.socket.emit('stream_frame', {
                parentId: this.parentId,
                childId: this.childId,
                frameBase64: base64Frame,
                type: 'screen'
            });
        }
    });

    this.cameraListener = eventEmitter.addListener('onCameraFrame', (event) => {
        if (this.socket && this.socket.connected) {
            this.socket.emit('stream_frame', {
                parentId: this.parentId,
                childId: this.childId,
                frameBase64: event.frame,
                type: event.type
            });
        }
    });

    // Set child info in native
    if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId);
    if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId);
    if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId);

    // Listen for Firestore Commands
    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(doc => this.handleCommand(doc.id, doc.data()));
      });

    this.isInitialized = true;
    console.log('RemoteCommandHandler Ready (Socket.io Enabled)');
  }

  async handleCommand(commandId, commandData) {
    const { command, data = {} } = commandData;
    await firestore().collection('commands').doc(commandId).update({ status: 'processing' });

    try {
      switch (command) {
        case 'START_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.startLiveCamera(data.useFront || false, data.intervalSeconds || 1);
          break;
        case 'START_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.startAmbientCapture(data.requestId || 'audio');
          break;
        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.stopAmbientCapture();
          break;
        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          break;
                case 'START_LIVE_VIEW':
          if (ScreenMirror) {
             try {
                await ScreenMirror.requestPermission();
                await ScreenMirror.startLiveView(data.intervalSeconds || 1);
             } catch(e) { 
                if(this.reportSystemError) this.reportSystemError('Screen Mirror', e.message || 'Permission denied'); 
             }
          }
          break;
        case 'STOP_LIVE_VIEW':
          if (ScreenMirror) await ScreenMirror.stopLiveView();
          break;
        case 'LOCK_DEVICE':
          Alert.alert('Phone Locked', 'Parent locked the phone.Ã†â€™Ãƒâ€šÃ‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾.', [], { cancelable: false });
          break;
      }

      await firestore().collection('commands').doc(commandId).update({ status: 'executed', executedAt: firestore.FieldValue.serverTimestamp() });
    } catch (error) {
      await firestore().collection('commands').doc(commandId).update({ status: 'failed', error: error.message });
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.screenListener) this.screenListener.remove();
    if (this.cameraListener) this.cameraListener.remove();
    if (this.audioListener) this.audioListener.remove();
    if (this.securityAlertListener) this.securityAlertListener.remove();
    if (this.socket) this.socket.disconnect();
    if (RemoteCamera) RemoteCamera.stopLiveCamera();
    if (ScreenMirror) ScreenMirror.stopLiveView();
  }
}

export default new RemoteCommandHandler();