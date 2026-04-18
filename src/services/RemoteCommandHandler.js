// src/services/RemoteCommandHandler.js
// Child device वर parent commands handle करतो

import { NativeModules, Alert } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const { RemoteCamera, AmbientAudio, ScreenMirror } = NativeModules;

class RemoteCommandHandler {

  constructor() {
    this.isInitialized = false;
    this.unsubscribe = null;
  }

  // ── Initialize: listen for parent commands ──
  async init() {
    const uid = auth().currentUser?.uid;
    if (!uid) return;

    // Real-time commands listener
    this.unsubscribe = firestore()
      .collection('commands')
      .where('childId', '==', uid)
      .where('status', '==', 'pending')
      .onSnapshot(snap => {
        snap.docs.forEach(doc => {
          this.handleCommand(doc.id, doc.data());
        });
      });

    this.isInitialized = true;
    console.log('🎯 RemoteCommandHandler ready');
  }

  // ── Handle each command ──
  async handleCommand(commandId, commandData) {
    const { command, data } = commandData;

    // Mark as processing
    await firestore().collection('commands').doc(commandId).update({
      status: 'processing'
    });

    try {
      switch (command) {

        // ── Camera commands ──
        case 'TAKE_SNAPSHOT':
          if (data.camera === 'front') {
            await RemoteCamera.takeFrontSnapshot(data.requestId);
          } else {
            await RemoteCamera.takeSnapshot(data.requestId);
          }
          break;

        // ── Screenshot commands ──
        case 'TAKE_SCREENSHOT':
          await ScreenMirror.takeScreenshot(data.requestId);
          break;

        case 'START_LIVE_VIEW':
          await ScreenMirror.startLiveView(data.intervalSeconds || 3);
          break;

        case 'STOP_LIVE_VIEW':
          await ScreenMirror.stopLiveView();
          break;

        // ── Audio commands ──
        case 'START_AUDIO_CAPTURE':
          await AmbientAudio.startAmbientCapture(data.requestId);
          break;

        case 'STOP_AUDIO_CAPTURE':
          await AmbientAudio.stopAmbientCapture();
          break;

        // ── Existing commands ──
        case 'LOCK_DEVICE':
          Alert.alert('🔒 Phone Locked', 'Parent ने phone lock केला.', [], { cancelable: false });
          break;

        case 'BEDTIME_MODE':
          Alert.alert('🌙 Bedtime', 'झोपायची वेळ झाली!', [], { cancelable: false });
          break;

        case 'UPDATE_RULES':
          // ChildMonitorService मधून rules reload करा
          break;

        default:
          console.log('Unknown command:', command);
      }

      // Mark as executed
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

  // ── Setup permissions (एकदाच setup वेळी call करा) ──
  async setupPermissions() {
    try {
      // MediaProjection permission request
      const screenPermission = await ScreenMirror.requestPermission();
      console.log('Screen permission:', screenPermission);
    } catch (e) {
      console.log('Screen permission denied:', e.message);
    }
  }

  // ── Cleanup ──
  destroy() {
    if (this.unsubscribe) this.unsubscribe();
  }
}

export default new RemoteCommandHandler();
