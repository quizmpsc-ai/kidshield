// KidShield — NotificationManager.js (Session 6)
// Android 8+ Notification Channels + Critical SOS + Grouped Notifications

import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  TriggerType,
  EventType,
} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';

// ══════════════════════════════════════════
// NOTIFICATION CHANNEL IDs
// ══════════════════════════════════════════

export const CHANNELS = {
  SOS: 'kidshield_sos',
  ALERTS: 'kidshield_alerts',
  LOCATION: 'kidshield_location',
  USAGE: 'kidshield_usage',
  SYSTEM: 'kidshield_system',
};

// ══════════════════════════════════════════
// CREATE ALL NOTIFICATION CHANNELS
// App startup वर एकदाच call करा
// ══════════════════════════════════════════

export const createNotificationChannels = async () => {
  // 🆘 SOS Channel — Do Not Disturb bypass करतो
  await notifee.createChannel({
    id: CHANNELS.SOS,
    name: 'SOS Emergency Alerts',
    description: 'Critical emergency alerts from child device — cannot be disabled',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    sound: 'sos_alert',     // android/app/src/main/res/raw/sos_alert.mp3
    vibration: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500], // SOS pattern
    lights: true,
    lightColor: '#FF0000',
    bypassDnd: true,        // Do Not Disturb bypass ✅
  });

  // 🔔 Alerts Channel — App block, geofence, new app install
  await notifee.createChannel({
    id: CHANNELS.ALERTS,
    name: 'KidShield Alerts',
    description: 'App blocks, geofence violations, security alerts',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PRIVATE,
    sound: 'alert_sound',
    vibration: true,
    vibrationPattern: [0, 300, 200, 300],
  });

  // 📍 Location Channel — Geofence enter/exit
  await notifee.createChannel({
    id: CHANNELS.LOCATION,
    name: 'Location Updates',
    description: 'Child location and geofence notifications',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PRIVATE,
  });

  // 📊 Usage Channel — Daily/weekly reports
  await notifee.createChannel({
    id: CHANNELS.USAGE,
    name: 'Usage Reports',
    description: 'Daily screen time and app usage reports',
    importance: AndroidImportance.LOW,
    visibility: AndroidVisibility.PRIVATE,
  });

  // ⚙️ System Channel — App updates, sync status
  await notifee.createChannel({
    id: CHANNELS.SYSTEM,
    name: 'System',
    description: 'KidShield system notifications',
    importance: AndroidImportance.MIN,
    visibility: AndroidVisibility.SECRET,
  });

  console.log('[NotificationManager] All channels created ✅');
};

// ══════════════════════════════════════════
// SOS ALERT — Critical, bypasses DND
// ══════════════════════════════════════════

export const sendSOSAlert = async (childName, location) => {
  await notifee.displayNotification({
    id: 'sos_alert',
    title: `🆘 SOS — ${childName} needs help!`,
    body: location
      ? `Location: ${location.address || `${location.lat}, ${location.lng}`}`
      : 'Tap to see location',
    android: {
      channelId: CHANNELS.SOS,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      fullScreenAction: {
        id: 'sos_fullscreen',
        mainComponent: 'KidShield', // Full screen alert activity
      },
      actions: [
        {
          title: '📍 View Location',
          pressAction: { id: 'view_location' },
        },
        {
          title: '📞 Call Child',
          pressAction: { id: 'call_child' },
        },
      ],
      color: '#FF0000',
      largeIcon: 'ic_sos',
      ongoing: true,       // Cannot be dismissed by swipe
      autoCancel: false,
      sound: 'sos_alert',
    },
    data: {
      type: 'SOS',
      childName,
      lat: location?.lat?.toString(),
      lng: location?.lng?.toString(),
    },
  });
};

// ══════════════════════════════════════════
// GROUPED NOTIFICATIONS
// Multiple alerts एकत्र दाखवतो
// ══════════════════════════════════════════

const alertGroup = {
  key: 'kidshield_alerts_group',
  notifications: [],
};

export const sendGroupedAlert = async (alert) => {
  const notifId = `alert_${Date.now()}`;

  alertGroup.notifications.push({
    id: notifId,
    title: alert.title,
    body: alert.body,
  });

  // Individual notification
  await notifee.displayNotification({
    id: notifId,
    title: alert.title,
    body: alert.body,
    android: {
      channelId: CHANNELS.ALERTS,
      groupId: alertGroup.key,
      sound: alert.sound || 'alert_sound',
      smallIcon: 'ic_notification',
      color: '#4A90E2',
      actions: alert.actions || [],
    },
    data: alert.data || {},
  });

  // Summary notification (2+ alerts असल्यास)
  if (alertGroup.notifications.length >= 2) {
    await notifee.displayNotification({
      id: 'alerts_summary',
      title: 'KidShield',
      body: `${alertGroup.notifications.length} new alerts`,
      android: {
        channelId: CHANNELS.ALERTS,
        groupId: alertGroup.key,
        groupSummary: true,
        style: {
          type: 'inbox',
          lines: alertGroup.notifications.slice(-5).map(
            (n) => `• ${n.title}: ${n.body}`
          ),
          title: `${alertGroup.notifications.length} KidShield Alerts`,
          summary: `${alertGroup.notifications.length} unread`,
        },
        smallIcon: 'ic_notification',
        color: '#4A90E2',
      },
    });
  }
};

// ══════════════════════════════════════════
// SPECIFIC ALERT TYPES
// ══════════════════════════════════════════

export const sendGeofenceAlert = async (childName, type, zoneName) => {
  await sendGroupedAlert({
    title: `📍 ${childName} ${type === 'exit' ? 'left' : 'entered'} ${zoneName}`,
    body: `Tap to view current location`,
    data: { type: 'GEOFENCE', childName, zoneType: type, zoneName },
    actions: [
      { title: '📍 View Map', pressAction: { id: 'view_map' } },
    ],
  });
};

export const sendAppInstallAlert = async (childName, appName, packageName) => {
  await sendGroupedAlert({
    title: `📥 New App: ${appName}`,
    body: `${childName} installed ${appName}. Tap to allow or block.`,
    data: { type: 'APP_INSTALL', childName, appName, packageName },
    actions: [
      { title: '✅ Allow', pressAction: { id: 'allow_app' } },
      { title: '🚫 Block', pressAction: { id: 'block_app' } },
    ],
  });
};

export const sendUsageReportNotification = async (childName, screenTime) => {
  const hours = Math.floor(screenTime / 60);
  const mins = screenTime % 60;

  await notifee.displayNotification({
    id: `usage_report_${Date.now()}`,
    title: `📊 ${childName}'s Daily Report`,
    body: `Screen time: ${hours}h ${mins}m today`,
    android: {
      channelId: CHANNELS.USAGE,
      smallIcon: 'ic_notification',
      color: '#4CAF50',
    },
    data: { type: 'USAGE_REPORT', childName },
  });
};

export const sendRootDetectionAlert = async (childName, deviceModel) => {
  await notifee.displayNotification({
    id: 'root_alert',
    title: `⚠️ Security Alert — ${childName}'s Device`,
    body: `Device (${deviceModel}) may have been modified. KidShield controls may not work.`,
    android: {
      channelId: CHANNELS.ALERTS,
      importance: AndroidImportance.HIGH,
      color: '#FF5722',
      smallIcon: 'ic_security_alert',
      ongoing: false,
      actions: [
        { title: 'View Details', pressAction: { id: 'view_security' } },
      ],
    },
    data: { type: 'ROOT_DETECTED', childName, deviceModel },
  });
};

// ══════════════════════════════════════════
// SCHEDULED NOTIFICATIONS
// Bedtime reminder, daily report
// ══════════════════════════════════════════

export const scheduleBedtimeReminder = async (childName, bedtimeHour, bedtimeMinute) => {
  const trigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: getNextOccurrence(bedtimeHour, bedtimeMinute - 15), // 15 min आधी
    repeatFrequency: 1, // Daily
  };

  await notifee.createTriggerNotification(
    {
      id: `bedtime_${childName}`,
      title: `🌙 Bedtime Reminder — ${childName}`,
      body: `Screen time ends in 15 minutes`,
      android: {
        channelId: CHANNELS.ALERTS,
        smallIcon: 'ic_notification',
        color: '#673AB7',
      },
    },
    trigger
  );
};

export const scheduleDailyReport = async (reportHour = 20) => {
  const trigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: getNextOccurrence(reportHour, 0),
    repeatFrequency: 1, // Daily
  };

  await notifee.createTriggerNotification(
    {
      id: 'daily_report_trigger',
      title: 'KidShield Daily Report Ready',
      body: 'Tap to view your child\'s activity for today',
      android: {
        channelId: CHANNELS.USAGE,
        smallIcon: 'ic_notification',
      },
    },
    trigger
  );
};

// Helper: पुढची वेळ calculate करा
const getNextOccurrence = (hour, minute) => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
};

// ══════════════════════════════════════════
// NOTIFICATION EVENT HANDLER
// ══════════════════════════════════════════

export const setupNotificationHandlers = (navigation) => {
  // App foreground event
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      handleNotificationAction(detail.pressAction?.id, detail.notification?.data, navigation);
    }
    if (type === EventType.DISMISSED) {
      // Alert group मधून remove करा
      const index = alertGroup.notifications.findIndex(
        (n) => n.id === detail.notification?.id
      );
      if (index > -1) alertGroup.notifications.splice(index, 1);
    }
  });

  // App background event
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      handleNotificationAction(detail.pressAction?.id, detail.notification?.data, null);
    }
  });

  // FCM background messages
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const { type, ...data } = remoteMessage.data || {};
    if (type === 'SOS') {
      await sendSOSAlert(data.childName, {
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
      });
    }
  });
};

const handleNotificationAction = (actionId, data, navigation) => {
  switch (actionId) {
    case 'view_location':
    case 'view_map':
      navigation?.navigate('LocationTracker', { childId: data?.childId });
      break;
    case 'block_app':
      // Backend API call to block app
      break;
    case 'allow_app':
      // Backend API call to allow app
      break;
    case 'view_security':
      navigation?.navigate('Settings', { tab: 'security' });
      break;
    default:
      navigation?.navigate('Dashboard');
  }
};

// ══════════════════════════════════════════
// CLEAR NOTIFICATIONS
// ══════════════════════════════════════════

export const clearAllAlerts = async () => {
  await notifee.cancelAllNotifications();
  alertGroup.notifications = [];
};

export default {
  createNotificationChannels,
  sendSOSAlert,
  sendGroupedAlert,
  sendGeofenceAlert,
  sendAppInstallAlert,
  sendUsageReportNotification,
  sendRootDetectionAlert,
  scheduleBedtimeReminder,
  scheduleDailyReport,
  setupNotificationHandlers,
  clearAllAlerts,
  CHANNELS,
};
