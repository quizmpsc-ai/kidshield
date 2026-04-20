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
    try {
      const user = auth().currentUser;
      if (!user) { console.log("RemoteCommand: No user logged in"); return; }
      
      console.log("RemoteCommand: Init started for UID", user.uid);
      
      const doc = await firestore().collection('users').doc(user.uid).get();
      if (!doc.exists) { console.log("RemoteCommand: User doc not found"); return; }
      
      this.parentId = doc.data()?.parentId || null;
      this.childId = doc.data()?.childId || user.uid;
      
      console.log("RemoteCommand: Parent", this.parentId, "Child", this.childId);

      if (!this.parentId) { console.log("RemoteCommand: No parent linked yet"); return; }

      // 1. CONNECT SOCKET
      try {
        this.socket = io(SOCKET_SERVER_URL);
        this.socket.on('connect', () => {
            console.log('Child Socket Connected:', this.socket.id);
            this.socket.emit('join_room', { parentId: this.parentId });
        });
      } catch(se) { console.log("Socket error:", se); }

      // 2. NATIVE LISTENERS
      const eventEmitter = new NativeEventEmitter();
      
      if(this.screenListener) this.screenListener.remove();
      this.screenListener = eventEmitter.addListener('onScreenFrame', (base64Frame) => {
          if (this.socket && this.socket.connected) {
              this.socket.emit('stream_frame', { parentId: this.parentId, childId: this.childId, frameBase64: base64Frame, type: 'screen' });
          }
      });

      if(this.cameraListener) this.cameraListener.remove();
      this.cameraListener = eventEmitter.addListener('onCameraFrame', (event) => {
          if (this.socket && this.socket.connected) {
              this.socket.emit('stream_frame', { parentId: this.parentId, childId: this.childId, frameBase64: event.frame, type: event.type });
          }
      });

      if(this.audioListener) this.audioListener.remove();
      this.audioListener = eventEmitter.addListener('onAudioFrame', (base64Audio) => {
          if (this.socket && this.socket.connected) {
              this.socket.emit('stream_audio', { parentId: this.parentId, childId: this.childId, audioBase64: base64Audio });
          }
      });

      // 3. SET NATIVE INFO
      if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId);
      if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId);
      if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId);

      // 4. 🔥 BULLETPROOF FIRESTORE COMMAND LISTENER 🔥
      if (this.unsubscribe) this.unsubscribe();
      console.log("RemoteCommand: Attaching listener for childId", this.childId);
      
      this.unsubscribe = firestore()
        .collection('commands')
        .where('childId', '==', this.childId)
        .where('status', '==', 'pending')
        .onSnapshot(snap => {
            console.log("RemoteCommand: Received", snap.docs.length, "pending commands");
            snap.docs.forEach(doc => {
               console.log("Executing command:", doc.data().command);
               this.handleCommand(doc.id, doc.data());
            });
        }, error => {
            console.log("RemoteCommand Listener Error:", error);
        });

      this.isInitialized = true;
      console.log('✅ RemoteCommandHandler Fully Ready!');
      
    } catch(err) {
      console.log('❌ RemoteCommand Init Error:', err);
    }
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
          Alert.alert('Phone Locked', 'Parent locked the phone.ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾.', [], { cancelable: false });
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