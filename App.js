import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { ActivityIndicator, View } from 'react-native';

import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import PairingScreen from './src/screens/auth/PairingScreen';
import AppControl from './src/screens/parent/AppControl';
import LocationTracker from './src/screens/parent/LocationTracker';
import Reports from './src/screens/parent/Reports';
import Settings from './src/screens/parent/Settings';
import MultiChildDashboard from './src/screens/parent/MultiChildDashboard';
import WeeklyReport from './src/screens/parent/WeeklyReport';
import RemoteMonitor from './src/screens/parent/RemoteMonitor';
import ChildHome from './src/screens/child/ChildHome';
import { ErrorBoundary } from './src/services/ErrorHandler';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ParentTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#00d4ff',
      tabBarInactiveTintColor: '#8899aa',
      tabBarStyle: { backgroundColor: '#111d35', borderTopColor: '#1e2d4a' }
    }}>
      <Tab.Screen name="Dashboard" component={MultiChildDashboard} options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Location" component={LocationTracker} options={{ tabBarLabel: 'Location' }} />
      <Tab.Screen name="Apps" component={AppControl} options={{ tabBarLabel: 'Apps' }} />
      <Tab.Screen name="Reports" component={Reports} options={{ tabBarLabel: 'Reports' }} />
      <Tab.Screen name="Settings" component={Settings} options={{ tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  );
}

function ChildStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ChildApp" component={ChildHome} />
      <Stack.Screen name="Pairing" component={PairingScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const navigationRef = useRef(null);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const doc = await firestore().collection('users').doc(firebaseUser.uid).get();
          if (doc.exists) {
            setUserRole(doc.data()?.role || 'child');
          } else {
            setUserRole('child');
          }
        } catch (e) {
          console.error('Role fetch error:', e);
          setUserRole('child');
        }
        setUser(firebaseUser);
      } else {
        setUser(null);
        setUserRole(null);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060b14' }}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {!user ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="Pairing" component={PairingScreen} />
            </>
          ) : userRole === 'parent' ? (
            <>
              <Stack.Screen name="ParentApp" component={ParentTabs} />
              <Stack.Screen name="WeeklyReport" component={WeeklyReport} />
              <Stack.Screen name="RemoteMonitor" component={RemoteMonitor} />
              <Stack.Screen name="Pairing" component={PairingScreen} />
            </>
          ) : (
            <Stack.Screen name="ChildStack" component={ChildStack} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}