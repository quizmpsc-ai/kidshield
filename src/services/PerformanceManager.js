// KidShield — PerformanceManager.js (Session 6)
// Bundle Optimization + Firestore Query Optimization + Battery Management + Image Caching

import { InteractionManager, AppState, Platform } from 'react-native';
import FastImage from 'react-native-fast-image';
import firestore from '@react-native-firebase/firestore';

// ══════════════════════════════════════════
// FIRESTORE QUERY OPTIMIZER
// Indexes वापरतो, unnecessary reads कमी करतो
// ══════════════════════════════════════════

// Cache for Firestore queries (in-memory, session-level)
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const cachedQuery = async (cacheKey, queryFn, ttl = CACHE_TTL) => {
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const data = await queryFn();
  queryCache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
};

export const clearQueryCache = (prefix = null) => {
  if (prefix) {
    for (const key of queryCache.keys()) {
      if (key.startsWith(prefix)) queryCache.delete(key);
    }
  } else {
    queryCache.clear();
  }
};

// Optimized children list query (uses Firestore index)
export const getChildrenOptimized = async (parentId) => {
  return cachedQuery(`children_${parentId}`, async () => {
    const snapshot = await firestore()
      .collection('users')
      .where('parentId', '==', parentId)
      .where('role', '==', 'child')
      .orderBy('createdAt', 'desc')
      .limit(10) // Max 10 children
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  });
};

// Paginated usage history (avoid large reads)
export const getUsageHistoryPaginated = async (childId, limit = 20, lastDoc = null) => {
  let query = firestore()
    .collection('children')
    .doc(childId)
    .collection('usageHistory')
    .orderBy('date', 'desc')
    .limit(limit);

  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }

  const snapshot = await query.get();
  return {
    data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === limit,
  };
};

// Batch reads — multiple children एकत्र read करा
export const batchGetChildren = async (childIds) => {
  if (childIds.length === 0) return [];
  if (childIds.length === 1) {
    const doc = await firestore().collection('children').doc(childIds[0]).get();
    return doc.exists ? [{ id: doc.id, ...doc.data() }] : [];
  }

  // Firestore 'in' query — max 10 IDs
  const chunks = [];
  for (let i = 0; i < childIds.length; i += 10) {
    chunks.push(childIds.slice(i, i + 10));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      firestore()
        .collection('children')
        .where(firestore.FieldPath.documentId(), 'in', chunk)
        .get()
    )
  );

  return results.flatMap((snapshot) =>
    snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  );
};

// ══════════════════════════════════════════
// BATTERY OPTIMIZATION
// Background service battery drain कमी करा
// ══════════════════════════════════════════

let locationUpdateInterval = null;
let currentBatteryMode = 'normal';

export const setBatteryOptimizationMode = (mode) => {
  currentBatteryMode = mode;

  const intervals = {
    aggressive: 30 * 1000,   // 30 seconds (high battery use)
    normal: 2 * 60 * 1000,   // 2 minutes (balanced)
    power_save: 5 * 60 * 1000, // 5 minutes (low battery)
    background: 15 * 60 * 1000, // 15 minutes (background/locked)
  };

  return intervals[mode] || intervals.normal;
};

export const getAdaptiveUpdateInterval = (batteryLevel, isCharging, appState) => {
  if (isCharging) return setBatteryOptimizationMode('aggressive');
  if (appState === 'background') return setBatteryOptimizationMode('background');
  if (batteryLevel < 20) return setBatteryOptimizationMode('power_save');
  if (batteryLevel < 50) return setBatteryOptimizationMode('normal');
  return setBatteryOptimizationMode('aggressive');
};

// App state change वर interval adjust करा
export const setupAdaptiveTracking = (onIntervalChange) => {
  let batteryInfo = { level: 100, isCharging: false };

  const handleAppStateChange = (nextState) => {
    const interval = getAdaptiveUpdateInterval(
      batteryInfo.level,
      batteryInfo.isCharging,
      nextState
    );
    onIntervalChange(interval, nextState);
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription?.remove();
};

// ══════════════════════════════════════════
// IMAGE CACHING (react-native-fast-image)
// App icons, profile photos cache करतो
// ══════════════════════════════════════════

export const preloadImages = async (urls) => {
  if (!urls || urls.length === 0) return;

  const sources = urls
    .filter(Boolean)
    .map((uri) => ({ uri }));

  FastImage.preload(sources);
  console.log(`[PerformanceManager] Preloading ${sources.length} images`);
};

export const clearImageCache = async () => {
  await FastImage.clearDiskCache();
  await FastImage.clearMemoryCache();
  console.log('[PerformanceManager] Image cache cleared');
};

// App icon URL cache key
export const getAppIconUrl = (packageName) => {
  return `https://yourbackend.railway.app/api/app-icon/${packageName}`;
};

// ══════════════════════════════════════════
// DEFERRED HEAVY OPERATIONS
// Heavy tasks UI settle होईपर्यंत defer करतो
// ══════════════════════════════════════════

export const runAfterInteractions = (fn) => {
  return InteractionManager.runAfterInteractions(fn);
};

export const deferredInit = async (tasks) => {
  await new Promise((resolve) => {
    InteractionManager.runAfterInteractions(resolve);
  });

  for (const task of tasks) {
    try {
      await task();
    } catch (err) {
      console.error('[PerformanceManager] Deferred task failed:', err);
    }
  }
};

// ══════════════════════════════════════════
// MEMORY MANAGEMENT
// ══════════════════════════════════════════

export const createSubscriptionManager = () => {
  const subscriptions = [];

  return {
    add: (sub) => subscriptions.push(sub),
    cleanup: () => {
      subscriptions.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
        if (unsub?.remove) unsub.remove();
        if (unsub?.unsubscribe) unsub.unsubscribe();
      });
      subscriptions.length = 0;
    },
  };
};

// ══════════════════════════════════════════
// PERFORMANCE MONITORING
// ══════════════════════════════════════════

const performanceMarks = new Map();

export const markStart = (label) => {
  performanceMarks.set(label, Date.now());
};

export const markEnd = (label) => {
  const start = performanceMarks.get(label);
  if (!start) return;

  const duration = Date.now() - start;
  performanceMarks.delete(label);

  if (__DEV__ && duration > 100) {
    console.warn(`[Performance] ${label}: ${duration}ms (slow!)`);
  }

  return duration;
};

// React Hook for subscription management
export const useSubscriptions = () => {
  const manager = createSubscriptionManager();
  return manager;
};

export default {
  cachedQuery,
  clearQueryCache,
  getChildrenOptimized,
  getUsageHistoryPaginated,
  batchGetChildren,
  setBatteryOptimizationMode,
  getAdaptiveUpdateInterval,
  setupAdaptiveTracking,
  preloadImages,
  clearImageCache,
  getAppIconUrl,
  runAfterInteractions,
  deferredInit,
  createSubscriptionManager,
  markStart,
  markEnd,
};
