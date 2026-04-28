// src/services/ErrorHandler.js

import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

class ErrorHandler {
  /**
   * ॲपमधील कोणताही एरर थेट Firebase वर पाठवण्यासाठी
   * @param {string} featureName - उदा. 'Remote Camera', 'Location Sync', 'App Blocker'
   * @param {Error|string} error - कॅच केलेला एक्झॅक्ट एरर
   * @param {string} childDocId - (Optional) मुलाचा डॉक्युमेंट आयडी (child_XXXXX)
   */
  static async reportError(featureName, error, childDocId = null) {
    try {
      const errorMessage = error?.message || String(error);
      const exactErrorString = `[${featureName} Failed]: ${errorMessage}`;

      // १. लोकल कन्सोलमध्ये एरर दाखवा (Android Studio मध्ये डीबगिंगसाठी)
      console.error(`❌ KidShield System Error:`, exactErrorString);

      const user = auth().currentUser;
      if (!user) return; // युजर लॉग इन नसेल तर रिटर्न करा

      // २. Parent ID मिळवा
      const userDoc = await firestore().collection('users').doc(user.uid).get();
      const parentId = userDoc.data()?.parentId;
      if (!parentId) return;

      // ३. Child Doc ID नसेल तर शोधा
      let finalChildDocId = childDocId;
      if (!finalChildDocId) {
        const childDoc = await firestore().collection('users').doc(user.uid).get();
        finalChildDocId = childDoc.data()?.childDocId; 
      }

      if (!finalChildDocId) return;

      // ४. वेब ॲडमिनला 'System Errors' मध्ये अलर्ट पाठवा
      await firestore()
        .collection('families').doc(parentId)
        .collection('children').doc(finalChildDocId)
        .collection('alerts')
        .add({
          type: 'system_error',
          message: exactErrorString,
          timestamp: firestore.FieldValue.serverTimestamp(),
          isRead: false
        });

      console.log(`✅ Error reported to Web Admin Dashboard!`);
      
    } catch (e) {
      console.log('❌ Failed to report error to Firebase:', e.message);
    }
  }
}

export default ErrorHandler;