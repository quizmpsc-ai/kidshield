import axios from 'axios';
import auth from '@react-native-firebase/auth';

const BASE_URL = 'https://kidshield-0757.onrender.com';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const user = auth().currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response) throw new Error(error.response.data?.message || 'Server error');
    else if (error.request) throw new Error('Network error - check internet');
    throw error;
  }
);

export const generateCode = async () => api.post('/api/pair/generate');
export const validateCode = async (code) => api.post('/api/pair/validate', { code });
export const sendNotification = async (parentId, title, body, data = {}) => api.post('/api/notify', { parentId, title, body, data });
export const updateLocation = async (lat, lng, accuracy) => api.post('/api/location/update', { lat, lng, accuracy });
export const getChildLocation = async (childId) => api.get(`/api/location/${childId}`);
export default api;