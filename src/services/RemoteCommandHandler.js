// src/services/RemoteCommandHandler.js
import { NativeModules, Alert, PermissionsAndroid } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const { RemoteCamera, AmbientAudio, ScreenMirror } = NativeModules;

class RemoteCommandHandler {
  constructor() {
    this.isInitialized = false;
    this.unsubscribe = null;
    this.childId = null;
    this.parentId = null;
  }

  async init() {
    const user = auth().currentUser;
    if (!user) return;
    this.childId = user.uid;

    // Get parentId from Firestore
    const doc = await firestore().collection('users').doc(user.uid).get();
    this.parentId = doc.data()?.parentId || null;

    // Set child/parent info in native modules
    if (RemoteCamera) await RemoteCamera.setChildInfo(this.childId, this.parentId || '');
    if (AmbientAudio) await AmbientAudio.setChildInfo(this.childId, this.parentId || '');
    if (ScreenMirror) await ScreenMirror.setChildInfo(this.childId, this.parentId || '');

    // Listen for commands
    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', this.childId)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(doc => this.handleCommand(doc.id, doc.data()));
      });

    this.isInitialized = true;
    console.log('ðŸŽ¯ RemoteCommandHandler ready, parentId:', this.parentId);
  }

  async handleCommand(commandId, commandData) {
    const { command, data = {} } = commandData;

    await firestore().collection('commands').doc(commandId).update({ status: 'processing' });

    try {
      switch (command) {

        // â”€â”€ Camera: single snapshot â”€â”€
        case 'TAKE_SNAPSHOT':
          if (!RemoteCamera) throw new Error('Camera module not available');
          if (data.camera === 'front') {
            await RemoteCamera.takeFrontSnapshot(data.requestId || `snap_${Date.now()}`);
          } else {
            await RemoteCamera.takeSnapshot(data.requestId || `snap_${Date.now()}`);
          }
          break;

        // â”€â”€ Camera: start live stream â”€â”€
        case 'START_LIVE_CAMERA':
          if (!RemoteCamera) throw new Error('Camera module not available');
          await RemoteCamera.startLiveCamera(data.useFront || false, data.intervalSeconds || 3);
          break;

        // â”€â”€ Camera: stop live stream â”€â”€
        case 'STOP_LIVE_CAMERA':
          if (RemoteCamera) await RemoteCamera.stopLiveCamera();
          break;

        // â”€â”€ Screen: request permission â”€â”€
        case 'REQUEST_SCREEN_PERMISSION':
          if (ScreenMirror) {
            await ScreenMirror.requestPermission();
          }
          break;

        // â”€â”€ Screen: single screenshot â”€â”€
        case 'TAKE_SCREENSHOT':
          if (!ScreenMirror) throw new Error('ScreenMirror module not available');
          await ScreenMirror.takeScreenshot(data.requestId || `ss_${Date.now()}`);
          break;

        // â”€â”€ Screen: start live view â”€â”€
        case 'START_LIVE_VIEW':
          if (!ScreenMirror) throw new Error('ScreenMirror module not available');
          await ScreenMirror.startLiveView(data.intervalSeconds || 3);
          break;

        // â”€â”€ Screen: stop live view â”€â”€
        case 'STOP_LIVE_VIEW':
          if (ScreenMirror) await ScreenMirror.stopLiveView();
          break;

        // â”€â”€ Audio: start capture â”€â”€
        case 'START_AUDIO_CAPTURE':
          if (!AmbientAudio) throw new Error('AmbientAudio module not available');
          await AmbientAudio.startAmbientCapture(data.requestId || `audio_${Date.now()}`);
          break;

        // â”€â”€ Audio: stop capture â”€â”€
        case 'STOP_AUDIO_CAPTURE':
          if (AmbientAudio) await AmbientAudio.stopAmbientCapture();
          break;

        // â”€â”€ Audio: mute â”€â”€
        case 'MUTE_AUDIO':
          if (AmbientAudio) await AmbientAudio.setMuted(true);
          break;

        // â”€â”€ Audio: unmute â”€â”€
        case 'UNMUTE_AUDIO':
          if (AmbientAudio) await AmbientAudio.setMuted(false);
          break;

        // â”€â”€ Device control â”€â”€
        case 'LOCK_DEVICE':
          Alert.alert('ðŸ”’ Phone Locked', 'Parent à¤¨à¥‡ phone lock à¤•à¥‡à¤²à¤¾.', [], { cancelable: false });
          break;

        case 'BEDTIME_MODE':
          Alert.alert('ðŸŒ™ Bedtime', 'à¤à¥‹à¤ªà¤¾à¤¯à¤šà¥€ à¤µà¥‡à¤³ à¤à¤¾à¤²à¥€! Phone à¤ à¥‡à¤µ.', [], { cancelable: false });
          break;

        case 'GET_LOCATION':
          // ChildHome à¤®à¤§à¥à¤¯à¥‡ location track à¤¹à¥‹à¤¤à¥‹à¤š, Firestore à¤®à¤§à¥à¤¯à¥‡ à¤†à¤¹à¥‡
          break;

        default:
          console.log('Unknown command:', command);
      }

      await firestore().collection('commands').doc(commandId).update({
        status: 'executed',
        executedAt: firestore.FieldValue.serverTimestamp(),
      });

    } catch (error) {
      console.error('Command failed:', command, error);
      await firestore().collection('commands').doc(commandId).update({
        status: 'failed',
        error: error.message,
      });
    }
  }

  async requestAllPermissions() {
    // Camera
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    // Microphone
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    // Location
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    // Screen capture - MediaProjection permission (system popup)
    if (ScreenMirror) {
      try { await ScreenMirror.requestPermission(); } catch (e) {}
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (RemoteCamera) RemoteCamera.stopLiveCamera();
    if (AmbientAudio) AmbientAudio.stopAmbientCapture();
    if (ScreenMirror) ScreenMirror.stopLiveView();
  }
}

export default new RemoteCommandHandler();