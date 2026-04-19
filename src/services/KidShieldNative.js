import { NativeModules, Platform } from 'react-native';

const { KidShieldModule } = NativeModules;

export const KidShieldNative = {
  hideAppIcon: async () => {
    if (Platform.OS !== 'android' || !KidShieldModule) return;
    return await KidShieldModule.hideAppIcon();
  },

  showAppIcon: async () => {
    if (Platform.OS !== 'android' || !KidShieldModule) return;
    return await KidShieldModule.showAppIcon();
  },

  setBlockedApps: async (packageNames) => {
    if (Platform.OS !== 'android' || !KidShieldModule) return;
    return await KidShieldModule.setBlockedApps(JSON.stringify(packageNames));
  },

  setChildMode: async (isChild) => {
    if (Platform.OS !== 'android' || !KidShieldModule) return;
    return await KidShieldModule.setChildMode(isChild);
  },

  isDeviceAdminEnabled: async () => {
    if (Platform.OS !== 'android' || !KidShieldModule) return false;
    return await KidShieldModule.isDeviceAdminEnabled();
  },

  requestDeviceAdmin: async () => {
    if (Platform.OS !== 'android' || !KidShieldModule) return;
    return await KidShieldModule.requestDeviceAdmin();
  },

  openAccessibilitySettings: async () => {
    if (Platform.OS !== 'android' || !KidShieldModule) return;
    return await KidShieldModule.openAccessibilitySettings();
  },
};

export default KidShieldNative;