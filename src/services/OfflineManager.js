// KidShield — OfflineManager.js (Session 6)
// Firestore Offline Persistence + Offline Blocklist Cache + Sync Manager

import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// ══════════════════════════════════════════
// FIRESTORE OFFLINE PERSISTENCE
// ══════════════════════════════════════════

export const enableOfflinePersistence = async () => {
  try {
    firestore().settings({
      persistence: true,        // Offline data cache enable
      cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED, // Unlimited cache
    });
    console.log('[OfflineManager] Firestore offline persistence enabled ✅');
  } catch (err) {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open — only one can enable persistence
      console.warn('[OfflineManager] Persistence already enabled in another tab');
    } else if (err.code === 'unimplemented') {
      console.warn('[OfflineManager] Persistence not supported in this browser');
    }
  }
};

// ══════════════════════════════════════════
// OFFLINE BLOCKLIST CACHE
// Internet नसताना पण app blocking चालू राहतो
// ══════════════════════════════════════════

const BLOCKLIST_CACHE_KEY = 'kidshield_blocklist_v2';
const BLOCKLIST_TIMESTAMP_KEY = 'kidshield_blocklist_ts';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const cacheBlocklist = async (childId, blockedApps, blockedDomains) => {
  try {
    const cacheData = {
      childId,
      blockedApps: blockedApps || [],
      blockedDomains: blockedDomains || [],
      timestamp: Date.now(),
    };

    await AsyncStorage.setItem(
      `${BLOCKLIST_CACHE_KEY}_${childId}`,
      JSON.stringify(cacheData)
    );

    console.log(`[OfflineManager] Blocklist cached: ${blockedApps.length} apps, ${blockedDomains.length} domains`);
  } catch (err) {
    console.error('[OfflineManager] Failed to cache blocklist:', err);
  }
};

export const getCachedBlocklist = async (childId) => {
  try {
    const cached = await AsyncStorage.getItem(`${BLOCKLIST_CACHE_KEY}_${childId}`);
    if (!cached) return null;

    const data = JSON.parse(cached);

    // Cache expiry check
    const age = Date.now() - data.timestamp;
    if (age > CACHE_EXPIRY_MS) {
      console.warn('[OfflineManager] Blocklist cache expired');
      return { ...data, isExpired: true };
    }

    return { ...data, isExpired: false };
  } catch (err) {
    console.error('[OfflineManager] Failed to get cached blocklist:', err);
    return null;
  }
};

export const isAppBlocked = async (packageName, childId) => {
  try {
    // Online असल्यास Firestore directly query करा
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      const doc = await firestore()
        .collection('children')
        .doc(childId)
        .collection('blockedApps')
        .doc(packageName)
        .get();
      return doc.exists && doc.data()?.blocked === true;
    }

    // Offline — cache वापरा
    const cached = await getCachedBlocklist(childId);
    if (!cached) return false; // Cache नाही — safe side ला allow करा

    return cached.blockedApps.includes(packageName);
  } catch (err) {
    console.error('[OfflineManager] isAppBlocked check failed:', err);
    return false;
  }
};

export const isDomainBlocked = async (domain, childId) => {
  try {
    const netState = await NetInfo.fetch();

    // Cached check (both online and offline for speed)
    const cached = await getCachedBlocklist(childId);
    if (cached && !cached.isExpired) {
      // Exact match
      if (cached.blockedDomains.includes(domain)) return true;
      // Subdomain match (e.g., m.youtube.com → youtube.com)
      const parentDomain = domain.split('.').slice(-2).join('.');
      if (cached.blockedDomains.includes(parentDomain)) return true;
    }

    // Online असल्यास Firestore check करा
    if (netState.isConnected && (!cached || cached.isExpired)) {
      const doc = await firestore()
        .collection('children')
        .doc(childId)
        .collection('blockedDomains')
        .doc(domain.replace(/\./g, '_'))
        .get();
      return doc.exists;
    }

    return false;
  } catch (err) {
    console.error('[OfflineManager] isDomainBlocked check failed:', err);
    return false;
  }
};

// ══════════════════════════════════════════
// REAL-TIME BLOCKLIST SYNC
// Online झाल्यावर automatically sync होतो
// ══════════════════════════════════════════

let blocklistUnsubscribe = null;

export const startBlocklistSync = (childId, onUpdate) => {
  // Previous listener cleanup
  if (blocklistUnsubscribe) {
    blocklistUnsubscribe();
  }

  // Real-time listener — online/offline दोन्हीत Firestore cache वापरतो
  blocklistUnsubscribe = firestore()
    .collection('children')
    .doc(childId)
    .onSnapshot(
      { includeMetadataChanges: true },
      async (doc) => {
        if (doc.exists) {
          const data = doc.data();
          const fromCache = doc.metadata.fromCache;

          console.log(
            `[OfflineManager] Blocklist updated (${fromCache ? 'from cache' : 'from server'})`
          );

          // Local cache update करा
          await cacheBlocklist(
            childId,
            data.blockedApps || [],
            data.blockedDomains || []
          );

          if (onUpdate) {
            onUpdate(data, { fromCache });
          }
        }
      },
      (err) => {
        console.error('[OfflineManager] Blocklist sync error:', err);
      }
    );

  return () => {
    if (blocklistUnsubscribe) {
      blocklistUnsubscribe();
      blocklistUnsubscribe = null;
    }
  };
};

// ══════════════════════════════════════════
// OFFLINE USAGE TRACKING QUEUE
// Offline असताना events queue करतो, online झाल्यावर sync
// ══════════════════════════════════════════

const USAGE_QUEUE_KEY = 'kidshield_usage_queue';

export const queueUsageEvent = async (event) => {
  try {
    const existing = await AsyncStorage.getItem(USAGE_QUEUE_KEY);
    const queue = existing ? JSON.parse(existing) : [];

    queue.push({
      ...event,
      timestamp: Date.now(),
      synced: false,
    });

    // Max 500 events queue करा (memory साठी)
    const trimmed = queue.slice(-500);
    await AsyncStorage.setItem(USAGE_QUEUE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('[OfflineManager] Failed to queue usage event:', err);
  }
};

export const flushUsageQueue = async (childId) => {
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return 0;

    const existing = await AsyncStorage.getItem(USAGE_QUEUE_KEY);
    if (!existing) return 0;

    const queue = JSON.parse(existing);
    const unsynced = queue.filter((e) => !e.synced);

    if (unsynced.length === 0) return 0;

    // Batch write to Firestore
    const batch = firestore().batch();
    const usageRef = firestore()
      .collection('children')
      .doc(childId)
      .collection('usageEvents');

    unsynced.forEach((event) => {
      const docRef = usageRef.doc();
      batch.set(docRef, event);
    });

    await batch.commit();

    // Mark as synced
    const updated = queue.map((e) => ({ ...e, synced: true }));
    await AsyncStorage.setItem(USAGE_QUEUE_KEY, JSON.stringify(updated));

    console.log(`[OfflineManager] Flushed ${unsynced.length} usage events ✅`);
    return unsynced.length;
  } catch (err) {
    console.error('[OfflineManager] Failed to flush usage queue:', err);
    return 0;
  }
};

// ══════════════════════════════════════════
// NETWORK STATE MONITOR
// ══════════════════════════════════════════

export const setupNetworkMonitor = (childId) => {
  const unsubscribe = NetInfo.addEventListener(async (state) => {
    if (state.isConnected && state.isInternetReachable) {
      console.log('[OfflineManager] Online! Syncing queued data...');
      const synced = await flushUsageQueue(childId);
      if (synced > 0) {
        console.log(`[OfflineManager] Synced ${synced} offline events`);
      }
    }
  });

  return unsubscribe;
};

export default {
  enableOfflinePersistence,
  cacheBlocklist,
  getCachedBlocklist,
  isAppBlocked,
  isDomainBlocked,
  startBlocklistSync,
  queueUsageEvent,
  flushUsageQueue,
  setupNetworkMonitor,
};
