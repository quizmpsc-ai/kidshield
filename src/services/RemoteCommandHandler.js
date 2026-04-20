import { NativeModules, Alert, PermissionsAndroid, Platform } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const { RemoteCamera, AmbientAudio, ScreenMirror } = NativeModules;

class RemoteCommandHandler {
  constructor() {
    this.isInitialized = false;
    this.unsubscribe = null;
    this.parentId = null;
    this.childDocId = null;
    this.childId = null;
  }

  async init() {
    const uid = auth().currentUser?.uid;
    if (!uid) return;
    this.childId = uid;

    // Get parent info
    try {
      const doc = await firestore().collection('users').doc(uid).get();
      this.parentId = doc.data()?.parentId;
      this.childDocId = doc.data()?.childId;
    } catch (e) {}

    // Pass child info to native modules
    if (this.parentId && this.childDocId) {
      try {
        await RemoteCamera?.setChildInfo?.(uid, this.parentId, this.childDocId);
        await AmbientAudio?.setChildInfo?.(uid, this.parentId, this.childDocId);
        await ScreenMirror?.setChildInfo?.(uid, this.parentId, this.childDocId);
      } catch (e) {}
    }

    // Listen on families collection (web admin sends liveCommand here)
    if (this.parentId && this.childDocId) {
      const familiesUnsub = firestore()
        .collection('families').doc(this.parentId)
        .collection('children').doc(this.childDocId)
        .onSnapshot(async doc => {
          const data = doc.data() || {};
          const cmd = data.liveCommand;
          if (cmd && cmd !== 'stop' && cmd !== this.lastFamiliesCommand) {
            this.lastFamiliesCommand = cmd;
            await this.handleLiveCommand(cmd);
          }
          if (cmd === 'stop' && this.lastFamiliesCommand !== 'stop') {
            this.lastFamiliesCommand = 'stop';
            await this.stopAllLive();
          }
        });
      this.unsubscribeFamilies = familiesUnsub;
    }

    // Also listen commands collection
    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', uid)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(doc => this.handleCommand(doc.id, doc.data()));
      });

    this.isInitialized = true;
  }

  async handleLiveCommand(command) {
    try {
      if (command === 'screen') {
        await this.requestScreenPermission();
        await ScreenMirror?.startLiveView?.(3);
      } else if (command === 'camera') {
        await this.requestCameraPermission();
        await RemoteCamera?.takeFrontSnapshot?.('live');
        // Keep taking snapshots every 3 seconds
        this.cameraInterval = setInterval(async () => {
          if (this.lastFamiliesCommand === 'camera') {
            await RemoteCamera?.takeFrontSnapshot?.('live').catch(() => {});
          } else {
            clearInterval(this.cameraInterval);
          }
        }, 3000);
      } else if (command === 'audio') {
        await this.requestAudioPermission();
        await AmbientAudio?.startAmbientCapture?.('live');
      } else if (command === 'keylog') {
        // Keylog handled by AccessibilityService
      }
    } catch (e) {
      console.log('Live command error:', e.message);
    }
  }

  async stopAllLive() {
    try {
      await ScreenMirror?.stopLiveView?.();
      await AmbientAudio?.stopAmbientCapture?.();
      if (this.cameraInterval) clearInterval(this.cameraInterval);
    } catch (e) {}
  }

  async requestCameraPermission() {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'KidShield Camera Access',
      message: 'Parent wants to view camera for safety monitoring',
      buttonPositive: 'Allow',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  async requestAudioPermission() {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'KidShield Microphone Access',
      message: 'Parent wants to monitor ambient audio for safety',
      buttonPositive: 'Allow',
    });
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }

  async requestScreenPermission() {
    try {
      const result = await ScreenMirror?.requestPermission?.();
      return result;
    } catch (e) {
      return false;
    }
  }

  async handleCommand(commandId, commandData) {
    const { command, data } = commandData;
    await firestore().collection('commands').doc(commandId).update({ status: 'processing' });
    try {
      switch (command) {
        case 'TAKE_SNAPSHOT':
          await this.requestCameraPermission();
          if (data?.camera === 'front') await RemoteCamera?.takeFrontSnapshot?.(data.requestId);
          else await RemoteCamera?.takeSnapshot?.(data.requestId);
          break;
        case 'TAKE_SCREENSHOT':
          await ScreenMirror?.takeScreenshot?.(data?.requestId || 'snap');
          break;
        case 'START_LIVE_VIEW':
          await ScreenMirror?.startLiveView?.(data?.intervalSeconds || 3);
          break;
        case 'STOP_LIVE_VIEW':
          await ScreenMirror?.stopLiveView?.();
          break;
        case 'START_AUDIO_CAPTURE':
          await this.requestAudioPermission();
          await AmbientAudio?.startAmbientCapture?.(data?.requestId || 'audio');
          break;
        case 'STOP_AUDIO_CAPTURE':
          await AmbientAudio?.stopAmbientCapture?.();
          break;
        case 'LOCK_DEVICE':
          Alert.alert('Phone Locked', 'Your parent has locked this phone.', [], { cancelable: false });
          break;
        case 'BEDTIME_MODE':
          Alert.alert('Bedtime', 'Time to sleep! Good night!', [], { cancelable: false });
          break;
        default:
          break;
      }
      await firestore().collection('commands').doc(commandId).update({
        status: 'executed', executedAt: firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await firestore().collection('commands').doc(commandId).update({
        status: 'failed', error: error.message,
      });
    }
  }

  destroy() {
    if (this.unsubscribe) this.unsubscribe();
    if (this.unsubscribeFamilies) this.unsubscribeFamilies();
    if (this.cameraInterval) clearInterval(this.cameraInterval);
  }
}

export default new RemoteCommandHandler();
