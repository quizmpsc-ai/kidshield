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
    this.childId = null;
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
      if (!user) return;
      const doc = await firestore().collection('users').doc(user.uid).get();
      if (!doc.exists) return;

      const data = doc.data();       
      this.parentId = data?.parentId || null;
      let correctChildId = data?.childId || user.uid;
      
      if (this.parentId) {
          try {
              const childSnap = await firestore().collection('families').doc(this.parentId).collection('children').limit(1).get();
              if (!childSnap.empty) correctChildId = childSnap.docs[0].id;
          } catch(e) {}
      }
      this.childId = correctChildId;
      if (!this.parentId) return;

      this._connectSocket();
      this._attachNativeListeners();

      // 🔥 CRITICAL FIX: Safe Checks Added to prevent "is not a function" error
      try { if (RemoteCamera && typeof RemoteCamera.setChildInfo === 'function') await RemoteCamera.setChildInfo(this.childId, this.parentId); } catch(e){}
      try { if (AmbientAudio && typeof AmbientAudio.setChildInfo === 'function') await AmbientAudio.setChildInfo(this.childId, this.parentId); } catch(e){}
      try { if (ScreenMirror && typeof ScreenMirror.setChildInfo === 'function') await ScreenMirror.setChildInfo(this.childId, this.parentId); } catch(e){}

      this._attachCommandListener();
      
      AppState.addEventListener('change', this._handleAppStateChange.bind(this));
      this.isInitialized = true;
      console.log('✅ RemoteCommandHandler Ready!');
    } catch (err) {
      console.log('❌ RemoteCommand Init Error:', err);
    }
  }

  _handleAppStateChange(nextAppState) {
    if (nextAppState === 'active') {
       if (!this.socket?.connected) this._connectSocket();
    }
  }

  _connectSocket() {
    if (this.socket?.connected) return;
    
    console.log("Attempting Socket Connection...");
    this.socket = io(SOCKET_SERVER_URL, { 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        pingTimeout: 60000, 
        pingInterval: 25000  
    });

    this.socket.on('connect', () => { 
        console.log("Socket Connected!", this.socket.id);
        this.socket.emit('join_room', { parentId: this.parentId }); 
        
        if(this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if(this.socket && this.socket.connected) {
                this.socket.emit('ping', { childId: this.childId });
            }
        }, 20000);
    });

    this.socket.on('disconnect', (reason) => {
        console.log("⚠️ Socket Disconnected:", reason, "- Emergency stop of all streams.");
        
        // 🔥 AUTO-STOP logic: जेव्हां पालक डॅशबोर्ड बंद करतो किंवा इंटरनेट जाते तेव्हां कॅमेरा बंद करा 
        this._forceStopAllFeatures();

        if(this.pingInterval) clearInterval(this.pingInterval);
        if (reason === 'io server disconnect' || reason === 'transport close') {
            setTimeout(() => this.socket.connect(), 2000);
        }
    });
  }

  // 🔥 नवीन फंक्शन: सर्व चालू असलेले फीचर्स सुरक्षितपणे बंद करण्यासाठी
  _forceStopAllFeatures() {
    if (RemoteCamera) RemoteCamera.stopLiveCamera();
    if (ScreenMirror) ScreenMirror.stopLiveView();
    if (AmbientAudio) AmbientAudio.stopAmbientCapture();
  }

  _attachNativeListeners() {
    const screenEmitter = ScreenMirror ? new NativeEventEmitter(ScreenMirror) : null;
    const cameraEmitter = RemoteCamera ? new NativeEventEmitter(RemoteCamera) : null;
    const audioEmitter  = AmbientAudio ? new NativeEventEmitter(AmbientAudio)  : null;

    if (this.screenListener) this.screenListener.remove();
    if (screenEmitter) {
      this.screenListener = screenEmitter.addListener('onScreenFrame', (base64Frame) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_frame', { parentId: this.parentId, childId: this.childId, frameBase64: base64Frame, type: 'screen' });
        }
      });
    }

    if (this.cameraListener) this.cameraListener.remove();
    if (cameraEmitter) {
      this.cameraListener = cameraEmitter.addListener('onCameraFrame', (event) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_frame', { parentId: this.parentId, childId: this.childId, frameBase64: event.frame, type: event.type });
        }
      });
    }

    if (this.audioListener) this.audioListener.remove();
    if (audioEmitter) {
      this.audioListener = audioEmitter.addListener('onAudioFrame', (base64Audio) => {
        if (this.socket?.connected && this.parentId) {
          this.socket.emit('stream_audio', { parentId: this.parentId, childId: this.childId, audioBase64: base64Audio });
        }
      });
    }
  }

  _attachCommandListener() {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = firestore().collection('commands')
      .where('childId', '==', this.childId).where('status', '==', 'pending')
      .onSnapshot(snap => {
          snap.docs.forEach(doc => {
            const cmdId = doc.id;
            if (this.processingCommands.has(cmdId)) return;
            this.processingCommands.add(cmdId);
            this.handleCommand(cmdId, doc.data());
          });
      });
  }

  async handleCommand(commandId, commandData) {
    // 🔥 FIX: createdAt डेटा फेच करा
    const { command, data = {}, createdAt } = commandData;
    console.log("Received Command:", command);

    // 🔥 AUTO-EXPIRE: ६० सेकंदांपेक्षा जुनी कमांड असेल तर ती रन करू नका
    if (createdAt) {
        const cmdTime = createdAt.toDate().getTime();
        const now = new Date().getTime();
        if (now - cmdTime > 60000) {
            console.log(`❌ Command ${command} is too old. Expiring it.`);
            await firestore().collection('commands').doc(commandId).update({ status: 'expired' }).catch(()=>{});
            this.processingCommands.delete(commandId);
            return; // इथूनच परत जा, कमांड रन करू नका
        }
    }

    try {
      await firestore().collection('commands').doc(commandId).update({ status: 'processing' });

      // 🔥 ॲपला वर आणण्याची खात्री करा (Wake up App)
      if (['START_LIVE_CAMERA', 'START_LIVE_VIEW', 'START_AUDIO_CAPTURE'].includes(command)) {
         if (KidShieldModule && KidShieldModule.wakeApp) {
             console.log("Waking up app over lock screen...");
             await KidShieldModule.wakeApp().catch(()=>{});
             // App समोर येण्यासाठी 3 seconds वेळ द्या
             await new Promise(resolve => setTimeout(resolve, 3000)); 
         }
      }

      switch (command) {
        case 'START_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.startLiveCamera(data.useFront === true, data.intervalSeconds || 1);
          if (AmbientAudio && typeof AmbientAudio.startAmbientCapture === 'function') {
             await AmbientAudio.startAmbientCapture('camera_audio').catch(()=>{});
          }
          break;
          
        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          if (AmbientAudio && typeof AmbientAudio.stopAmbientCapture === 'function') {
             await AmbientAudio.stopAmbientCapture().catch(()=>{});
          }
          break;
          
        case 'START_AUDIO_CAPTURE':
          if (AmbientAudio && typeof AmbientAudio.startAmbientCapture === 'function') {
             await AmbientAudio.startAmbientCapture(data.requestId || 'audio_live');
          }
          break;
          
        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio && typeof AmbientAudio.stopAmbientCapture === 'function') {
             await AmbientAudio.stopAmbientCapture();
          }
          break;
          
        case 'START_LIVE_VIEW':
          if (ScreenMirror) {
            await ScreenMirror.requestPermission();
            await ScreenMirror.startLiveView(data.intervalSeconds || 1);
            if (AmbientAudio && typeof AmbientAudio.startAmbientCapture === 'function') {
               await AmbientAudio.startAmbientCapture('screen_audio').catch(()=>{});
            }
          }
          break;
          
        case 'STOP_LIVE_VIEW':
          if (ScreenMirror) await ScreenMirror.stopLiveView();
          if (AmbientAudio && typeof AmbientAudio.stopAmbientCapture === 'function') {
             await AmbientAudio.stopAmbientCapture().catch(() => {});
          }
          break;
          
        case 'LOCK_DEVICE':
          const { Alert } = require('react-native');
          Alert.alert('🔒 Phone Locked', 'Parent has locked this device.', [{ text: 'OK' }], { cancelable: false });
          break;
      }
      
      await firestore().collection('commands').doc(commandId).update({ status: 'executed', executedAt: firestore.FieldValue.serverTimestamp() });
    } catch (error) {
      console.log("Command Execution Failed:", error.message);
      await firestore().collection('commands').doc(commandId).update({ status: 'failed', error: error.message }).catch(() => {});
    } finally {
      setTimeout(() => this.processingCommands.delete(commandId), 5000);
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
    }
    this.isInitialized = false;
  }
}
export default new RemoteCommandHandler();