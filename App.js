// KidShield — App.js (Session 6 — Final)
// All sessions integrated: Security + Offline + Notifications + Crashlytics + Performance

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import auth from '@react-native-firebase/auth';
import { AppState, Alert } from 'react-native';

// ── Session 1 ──
import LoginScreen from './src/screens/auth/LoginScreen';
import Dashboard from './src/screens/parent/Dashboard';
import AppControl from './src/screens/parent/AppControl';

// ── Session 2 ──
import RegisterScreen from './src/screens/auth/RegisterScreen';
import PairingScreen from './src/screens/auth/PairingScreen';
import LocationTracker from './src/screens/parent/LocationTracker';
import Reports from './src/screens/parent/Reports';
import Settings from './src/screens/parent/Settings';
import ChildHome from './src/screens/child/ChildHome';

// ── Session 5 ──
import MultiChildDashboard from './src/screens/parent/MultiChildDashboard';
import WeeklyReport from './src/screens/parent/WeeklyReport';

// ── Session 6 Services ──
import SecurityManager from './src/services/SecurityManager';
import OfflineManager from './src/services/OfflineManager';
import NotificationManager from './src/services/NotificationManager';
import {
  initializeCrashlytics,
  setupGlobalErrorHandlers,
  ErrorBoundary,
} from './src/services/ErrorHandler';
import PerformanceManager from './src/services/PerformanceManager';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ══════════════════════════════════════════
// PARENT BOTTOM TABS
// ══════════════════════════════════════════

function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4A90E2',
        tabBarInactiveTintColor: '#9E9E9E',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          paddingBottom: 8,
          height: 60,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={MultiChildDashboard}
        options={{ tabBarLabel: 'Dashboard', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Location"
        component={LocationTracker}
        options={{ tabBarLabel: 'Location', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Apps"
        component={AppControl}
        options={{ tabBarLabel: 'Apps', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Reports"
        component={Reports}
        options={{ tabBarLabel: 'Reports', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{ tabBarLabel: 'Settings', tabBarIcon: () => null }}
      />
    </Tab.Navigator>
  );
}

// ══════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════

export default function App() {
  const navigationRef = useRef(null);
  const subscriptions = PerformanceManager.createSubscriptionManager();

  useEffect(() => {
    initializeApp();
    return () => subscriptions.cleanup();
  }, []);

  const initializeApp = async () => {
    try {
      // 1. Global error handlers (सर्वात आधी!)
      setupGlobalErrorHandlers();

      // 2. Firestore offline persistence
      await OfflineManager.enableOfflinePersistence();

      // 3. Notification channels create करा
      await NotificationManager.createNotificationChannels();

      // 4. Notification handlers setup
      NotificationManager.setupNotificationHandlers(navigationRef.current);

      // 5. Auth state observe करा
      const authUnsub = auth().onAuthStateChanged(async (user) => {
        if (user) {
          // Crashlytics user set करा
          await initializeCrashlytics({
            uid: user.uid,
            role: user.displayName?.includes('parent') ? 'parent' : 'child',
          });

          // Security initialize करा (deferred — UI settle होईपर्यंत wait)
          PerformanceManager.runAfterInteractions(async () => {
            const userRole = user.displayName?.includes('parent') ? 'parent' : 'child';
            const securityResult = await SecurityManager.initializeSecurity(userRole);

            if (securityResult.rootDetection?.isRooted) {
              Alert.alert(
                'Security Warning',
                'Your device security has been compromised. Your parents have been notified.',
                [{ text: 'OK' }]
              );
            }
          });

          // Offline sync setup (child device)
          const networkUnsub = OfflineManager.setupNetworkMonitor(user.uid);
          subscriptions.add(networkUnsub);
        }
      });

      subscriptions.add(authUnsub);
      console.log('[App] Initialization complete ✅');
    } catch (err) {
      console.error('[App] Initialization failed:', err);
    }
  };

  return (
    <ErrorBoundary screenName="App">
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          {/* Auth Screens */}
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="Pairing" component={PairingScreen} />

          {/* Parent App */}
          <Stack.Screen name="ParentApp" component={ParentTabs} />
          <Stack.Screen name="WeeklyReport" component={WeeklyReport} />

          {/* Child App */}
          <Stack.Screen name="ChildApp" component={ChildHome} />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
