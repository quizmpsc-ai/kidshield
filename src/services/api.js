// src/services/api.js
// Backend API calls using Axios

import axios from 'axios';
import auth from '@react-native-firebase/auth';

// Base URL from environment
const BASE_URL = process.env.API_URL || 'https://kidshield-0757.onrender.com';

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ==================== AUTH INTERCEPTOR ====================
// Automatically add Firebase token to every request

api.interceptors.request.use(async (config) => {
  const user = auth().currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Response interceptor - handle errors globally
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) {
      const msg = error.response.data?.message || 'Server error';
      throw new Error(msg);
    } else if (error.request) {
      throw new Error('Network error - internet connection check à¤•à¤°à¤¾');
    }
    throw error;
  }
);

// ==================== AUTH APIs ====================

export const verifyToken = async () => {
  return await api.get('/api/auth/verify');
};

// ==================== USAGE STATS APIs ====================

export const syncUsageStats = async (stats) => {
  return await api.post('/api/usage/sync', { stats });
};

export const getUsageReport = async (childId, period = 'week') => {
  return await api.get(`/api/usage/report/${childId}?period=${period}`);
};

export const getTopApps = async (childId, days = 7) => {
  return await api.get(`/api/usage/top-apps/${childId}?days=${days}`);
};

// ==================== APP CONTROL APIs ====================

export const getBlockedApps = async (parentId) => {
  return await api.get(`/api/apps/blocked/${parentId}`);
};

export const blockApp = async (packageName, appName, childId) => {
  return await api.post('/api/apps/block', { packageName, appName, childId });
};

export const unblockApp = async (packageName, childId) => {
  return await api.post('/api/apps/unblock', { packageName, childId });
};

export const setAppTimeLimit = async (packageName, limitMinutes, childId) => {
  return await api.post('/api/apps/time-limit', { packageName, limitMinutes, childId });
};

// ==================== LOCATION APIs ====================

export const updateLocation = async (lat, lng, accuracy) => {
  return await api.post('/api/location/update', { lat, lng, accuracy });
};

export const getChildLocation = async (childId) => {
  return await api.get(`/api/location/${childId}`);
};

export const getLocationHistory = async (childId, hours = 24) => {
  return await api.get(`/api/location/history/${childId}?hours=${hours}`);
};

// ==================== GEOFENCE APIs ====================

export const getGeofences = async (childId) => {
  return await api.get(`/api/geofences/${childId}`);
};

export const createGeofence = async (childId, name, lat, lng, radius) => {
  return await api.post('/api/geofences', { childId, name, lat, lng, radius });
};

export const deleteGeofence = async (fenceId) => {
  return await api.delete(`/api/geofences/${fenceId}`);
};

// ==================== NOTIFICATION APIs ====================

export const sendNotification = async (parentId, title, body, data = {}) => {
  return await api.post('/api/notify', { parentId, title, body, data });
};

export const sendSOS = async (childId, location) => {
  return await api.post('/api/notify/sos', { childId, location });
};

export const updateFCMToken = async (token) => {
  return await api.post('/api/auth/fcm-token', { token });
};

// ==================== CHILD DEVICE APIs ====================

export const registerChildDevice = async (deviceInfo) => {
  return await api.post('/api/device/register', deviceInfo);
};

export const syncDeviceStatus = async (status) => {
  return await api.post('/api/device/sync', status);
};

// ==================== PAIRING APIs ====================

export const generateCode = async () => {
  return await api.post('/api/pair/generate');
};

export const validateCode = async (code) => {
  return await api.post('/api/pair/validate', { code });
};

// ==================== ALERTS APIs ====================

export const getAlerts = async (limit = 20) => {
  return await api.get(`/api/alerts?limit=${limit}`);
};

export const markAlertRead = async (alertId) => {
  return await api.put(`/api/alerts/${alertId}/read`);
};

export const createAlert = async (childId, type, message) => {
  return await api.post('/api/alerts', { childId, type, message });
};

// ==================== SETTINGS APIs ====================

export const getParentSettings = async () => {
  return await api.get('/api/settings');
};

export const saveParentSettings = async (settings) => {
  return await api.put('/api/settings', settings);
};

export const setScreenTimeLimit = async (childId, limitMinutes) => {
  return await api.post('/api/settings/screen-time', { childId, limitMinutes });
};

export const setBedtimeSchedule = async (childId, enabled, startTime, endTime) => {
  return await api.post('/api/settings/bedtime', { childId, enabled, startTime, endTime });
};

// ==================== CHILDREN APIs ====================

export const getChildrenList = async () => {
  return await api.get('/api/children');
};

export const getChildDetails = async (childId) => {
  return await api.get(`/api/children/${childId}`);
};

export const removeChild = async (childId) => {
  return await api.delete(`/api/children/${childId}`);
};

// ==================== WEBSOCKET (Real-time) ====================
// Use this for real-time location updates

// Real-time via Firebase Firestore (no socket.io needed)
export const connectSocket = async (parentId) => {
  console.log('Real-time via Firebase Firestore');
  return null;
};
export const disconnectSocket = () => {};
export const onLocationUpdate = (callback) => {};
export const onAlertReceived = (callback) => {};

export default api;

