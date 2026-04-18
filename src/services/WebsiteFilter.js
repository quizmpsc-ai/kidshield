// KidShield — WebsiteFilter.js (Session 5)
// DNS over HTTPS + NextDNS/CleanBrowsing integration
// Parent ने blocked केलेले websites filter होतात

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import api from './api';

// ══════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════
const NEXDNS_BASE = 'https://api.nextdns.io/profiles';
const CLEANBROWSING_DOH = 'https://doh.cleanbrowsing.org/doh/family-filter/';
const CACHE_KEY = 'kidshield_blocked_domains';

// ══════════════════════════════════════════
// DOMAIN CHECK — DNS over HTTPS
// Real-time domain safety check
// ══════════════════════════════════════════
export const checkDomainSafety = async (domain) => {
  try {
    // CleanBrowsing Family Filter ने blocked असेल तर NXDOMAIN मिळतो
    const res = await fetch(
      `${CLEANBROWSING_DOH}?name=${encodeURIComponent(domain)}&type=A`,
      {
        headers: { Accept: 'application/dns-json' },
      }
    );
    const data = await res.json();

    // Status 3 = NXDOMAIN = blocked by family filter
    if (data.Status === 3) {
      return { safe: false, reason: 'adult_content', blockedBy: 'CleanBrowsing' };
    }

    return { safe: true };
  } catch (e) {
    console.warn('DNS check failed:', e);
    return { safe: true }; // fail-open (network error असल्यास block नको)
  }
};

// ══════════════════════════════════════════
// NEXDNS PROFILE MANAGEMENT
// Parent ने custom domains block/allow करायला
// ══════════════════════════════════════════
export class NextDNSManager {
  constructor(profileId, apiKey) {
    this.profileId = profileId;
    this.apiKey = apiKey;
    this.headers = {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }

  // Profile चे सगळे blocked domains मिळवा
  async getBlocklist() {
    try {
      const res = await fetch(`${NEXDNS_BASE}/${this.profileId}/denylist`, {
        headers: this.headers,
      });
      const data = await res.json();
      return data.data || [];
    } catch (e) {
      console.error('NextDNS getBlocklist error:', e);
      return [];
    }
  }

  // नवीन domain block करा
  async blockDomain(domain, active = true) {
    try {
      const res = await fetch(`${NEXDNS_BASE}/${this.profileId}/denylist`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ id: domain, active }),
      });
      return res.ok;
    } catch (e) {
      console.error('NextDNS blockDomain error:', e);
      return false;
    }
  }

  // Domain unblock करा
  async unblockDomain(domain) {
    try {
      const res = await fetch(
        `${NEXDNS_BASE}/${this.profileId}/denylist/${encodeURIComponent(domain)}`,
        {
          method: 'DELETE',
          headers: this.headers,
        }
      );
      return res.ok;
    } catch (e) {
      console.error('NextDNS unblockDomain error:', e);
      return false;
    }
  }

  // Safe Search enforce करा (Google, Bing, YouTube)
  async enableSafeSearch() {
    try {
      const res = await fetch(`${NEXDNS_BASE}/${this.profileId}/settings`, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify({
          safeSearch: true,
          youtubeRestrictedMode: true,
          blockTlds: [],
        }),
      });
      return res.ok;
    } catch (e) {
      console.error('NextDNS safeSearch error:', e);
      return false;
    }
  }

  // Activity logs मिळवा (last 24 hours)
  async getActivityLog(limit = 100) {
    try {
      const res = await fetch(
        `${NEXDNS_BASE}/${this.profileId}/logs?limit=${limit}`,
        { headers: this.headers }
      );
      const data = await res.json();
      return data.data || [];
    } catch (e) {
      return [];
    }
  }
}

// ══════════════════════════════════════════
// LOCAL BLOCK LIST — Offline support
// Firebase वरून sync होतो, local cache ठेवतो
// ══════════════════════════════════════════
export const syncBlockedDomains = async (childId) => {
  try {
    const res = await api.get(`/filter/domains/${childId}`);
    const domains = res.data.blockedDomains || [];
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(domains));
    return domains;
  } catch (e) {
    // Offline — cached version वापरा
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  }
};

export const isLocallyBlocked = async (domain) => {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return false;
    const domains = JSON.parse(cached);
    // subdomain check — "ads.example.com" → "example.com" blocked असेल तर block
    return domains.some(
      (d) => domain === d || domain.endsWith('.' + d)
    );
  } catch (e) {
    return false;
  }
};

// ══════════════════════════════════════════
// CATEGORY BLOCKLISTS
// Ready-made categories parent ला एक click वर block करायला
// ══════════════════════════════════════════
export const BLOCK_CATEGORIES = {
  adult: {
    label: '🔞 Adult Content',
    description: 'Pornography आणि adult websites',
    domains: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'redtube.com'],
    dnsFilter: 'cleanbrowsing-family',
  },
  gambling: {
    label: '🎰 Gambling',
    description: 'Betting आणि gambling sites',
    domains: ['bet365.com', 'poker.com', 'casinoking.com'],
    dnsFilter: null,
  },
  social: {
    label: '📱 Social Media',
    description: 'Facebook, Instagram, TikTok',
    domains: ['facebook.com', 'instagram.com', 'tiktok.com', 'snapchat.com', 'twitter.com'],
    dnsFilter: null,
  },
  games: {
    label: '🎮 Gaming Sites',
    description: 'Online gaming websites',
    domains: ['miniclip.com', 'friv.com', 'poki.com', 'y8.com'],
    dnsFilter: null,
  },
  violence: {
    label: '💀 Violence/Gore',
    description: 'Violent आणि disturbing content',
    domains: ['liveleak.com', 'bestgore.com'],
    dnsFilter: 'cleanbrowsing-family',
  },
};

export const blockCategory = async (childId, categoryKey) => {
  const category = BLOCK_CATEGORIES[categoryKey];
  if (!category) return false;

  try {
    await api.post('/filter/block-category', {
      childId,
      category: categoryKey,
      domains: category.domains,
    });
    return true;
  } catch (e) {
    return false;
  }
};
