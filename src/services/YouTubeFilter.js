// KidShield — YouTubeFilter.js (Session 5)
// YouTube Restricted Mode + Safe Content Enforcement
// YouTube app detect झाल्यावर auto-restrict करतो

import { NativeModules, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const YOUTUBE_PACKAGES = [
  'com.google.android.youtube',
  'com.google.android.youtube.tv',
  'com.google.android.apps.youtube.kids', // YouTube Kids (allow)
];
const YOUTUBE_KIDS_PACKAGE = 'com.google.android.apps.youtube.kids';
const YT_DATA_API = 'https://www.googleapis.com/youtube/v3';

// ══════════════════════════════════════════
// YOUTUBE API — Safe Content Check
// ══════════════════════════════════════════
export class YouTubeContentChecker {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  // Video safe आहे का check करा
  async isVideoSafe(videoId) {
    try {
      const res = await fetch(
        `${YT_DATA_API}/videos?part=contentDetails,status&id=${videoId}&key=${this.apiKey}`
      );
      const data = await res.json();

      if (!data.items || data.items.length === 0) {
        return { safe: false, reason: 'not_found' };
      }

      const video = data.items[0];
      const rating = video.contentDetails?.contentRating?.ytRating;
      const madeForKids = video.status?.madeForKids;

      // ytAgeRestricted असेल तर block
      if (rating === 'ytAgeRestricted') {
        return { safe: false, reason: 'age_restricted' };
      }

      return { safe: true, madeForKids };
    } catch (e) {
      console.error('YouTube API check error:', e);
      return { safe: true }; // API error → block नको
    }
  }

  // Channel safe आहे का check करा
  async isChannelSafe(channelId) {
    try {
      const res = await fetch(
        `${YT_DATA_API}/channels?part=statistics,topicDetails&id=${channelId}&key=${this.apiKey}`
      );
      const data = await res.json();

      if (!data.items || data.items.length === 0) {
        return { safe: true };
      }

      const channel = data.items[0];
      const topics = channel.topicDetails?.topicCategories || [];

      // Mature topics check
      const unsafeTopics = topics.filter(
        (t) =>
          t.includes('adult') ||
          t.includes('gambling') ||
          t.includes('explicit')
      );

      if (unsafeTopics.length > 0) {
        return { safe: false, reason: 'mature_content' };
      }

      return { safe: true };
    } catch (e) {
      return { safe: true };
    }
  }

  // Search results filter करा — safe results फक्त
  async searchSafe(query, maxResults = 20) {
    try {
      const res = await fetch(
        `${YT_DATA_API}/search?part=snippet&q=${encodeURIComponent(query)}&safeSearch=strict&maxResults=${maxResults}&type=video&key=${this.apiKey}`
      );
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      return [];
    }
  }
}

// ══════════════════════════════════════════
// YOUTUBE RESTRICTED MODE ENFORCER
// WebView intercept करून YouTube safe mode enforce करतो
// ══════════════════════════════════════════
export const YOUTUBE_RESTRICTED_HEADERS = {
  // YouTube restricted mode header
  'YouTube-Restrict': 'Strict',
  // SafeSearch enforce
  'Restrict': '1',
};

// YouTube URL मध्ये restricted mode parameter add करा
export const addRestrictedMode = (url) => {
  try {
    const urlObj = new URL(url);

    if (
      urlObj.hostname.includes('youtube.com') ||
      urlObj.hostname.includes('youtu.be')
    ) {
      urlObj.searchParams.set('restrict', '1');
      urlObj.searchParams.set('safety_mode', 'true');
      return urlObj.toString();
    }

    return url;
  } catch (e) {
    return url;
  }
};

// ══════════════════════════════════════════
// APP DETECTION + OVERLAY
// YouTube app open होताच overlay दाखवतो
// (AppBlockerService.java सोबत काम करतो)
// ══════════════════════════════════════════
export const enforceYouTubePolicy = async (childId, settings) => {
  const {
    allowYoutube = true,
    allowYoutubeKids = true,
    requireRestrictedMode = true,
    maxDailyMinutes = 60,
  } = settings;

  try {
    await api.post('/child/youtube-policy', {
      childId,
      policy: {
        allowYoutube,
        allowYoutubeKids,
        requireRestrictedMode,
        maxDailyMinutes,
        blockedPackages: allowYoutube ? [] : [YOUTUBE_PACKAGES[0]],
      },
    });
    return true;
  } catch (e) {
    return false;
  }
};

// ══════════════════════════════════════════
// YOUTUBE KIDS REDIRECT
// Regular YouTube ऐवजी YouTube Kids suggest करा
// ══════════════════════════════════════════
export const isYouTubeKidsInstalled = async () => {
  try {
    const { AppBlockerModule } = NativeModules;
    if (!AppBlockerModule) return false;
    return await AppBlockerModule.isPackageInstalled(YOUTUBE_KIDS_PACKAGE);
  } catch (e) {
    return false;
  }
};

// ══════════════════════════════════════════
// WATCH HISTORY MONITOR
// Firebase मध्ये save होतो → parent ला review करायला
// ══════════════════════════════════════════
export const logYouTubeActivity = async (childId, activity) => {
  try {
    await api.post('/child/youtube-log', {
      childId,
      activity: {
        ...activity,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e) {
    // Silent fail — logging critical नाही
  }
};

// Daily time limit check
export const checkYouTubeTimeLimit = async (childId, dailyLimitMinutes) => {
  try {
    const res = await api.get(`/child/youtube-usage/${childId}`);
    const todayMinutes = res.data.todayMinutes || 0;

    if (todayMinutes >= dailyLimitMinutes) {
      return {
        limitReached: true,
        todayMinutes,
        dailyLimitMinutes,
        message: `YouTube साठी ${dailyLimitMinutes} minutes limit संपली! आज ${todayMinutes} minutes झाले.`,
      };
    }

    return {
      limitReached: false,
      todayMinutes,
      remainingMinutes: dailyLimitMinutes - todayMinutes,
    };
  } catch (e) {
    return { limitReached: false };
  }
};
