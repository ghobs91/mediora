/**
 * IPTV Manager - Loads IPTV channels from selected countries
 * Uses iptv-org M3U playlists loaded client-side
 * Caches channel data persistently for instant loading on subsequent launches
 */

import { getCountryPlaylistUrl, getCountryStreamsUrl, getCountryByCode, getCountryEPGUrl } from './iptv';
import { LiveTVChannel } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHANNEL_CACHE_KEY = 'iptv_channels_cache_v2_';
const CHANNEL_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours before re-fetch

export interface IPTVChannel extends LiveTVChannel {
  countryCode: string;
  /** tvg-id (ChannelId@Feed) used for EPG matching */
  tvgId?: string;
  /** Alternate feed URLs for the same channel (fallback when primary fails) */
  backupUrls?: string[];
}

interface ParsedEntry {
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
}

/**
 * Parse M3U playlist content into channel entries (one per EXTINF row, so the
 * same channel may appear multiple times — once per feed).
 */
function parseM3U(content: string, countryCode: string): IPTVChannel[] {
  const lines = content.split('\n');
  const channels: IPTVChannel[] = [];
  let currentChannel: Partial<IPTVChannel> | null = null;
  let channelIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      // Parse channel info
      // Format: #EXTINF:-1 tvg-id="channel.id" tvg-logo="http://..." group-title="Group",Channel Name
      const match = line.match(/#EXTINF:[^,]*,(.+)$/);
      const name = match ? match[1].trim() : `Channel ${channelIndex + 1}`;

      // Extract attributes
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const idMatch = line.match(/tvg-id="([^"]+)"/);

      currentChannel = {
        name,
        logo: logoMatch ? logoMatch[1] : undefined,
        group: groupMatch ? groupMatch[1] : 'General',
        countryCode,
      };

      // Use tvg-id if available for linking to EPG
      if (idMatch) {
        currentChannel.tvgId = idMatch[1];
      }
    } else if (line && !line.startsWith('#') && currentChannel) {
      // This is the URL
      const url = line.trim();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const channel: IPTVChannel = {
          id: `iptv-${countryCode}-${channelIndex}`,
          name: currentChannel.name || `Channel ${channelIndex + 1}`,
          url,
          logo: currentChannel.logo,
          group: currentChannel.group || 'General',
          countryCode,
        };
        // Include tvg-id for EPG matching
        if (currentChannel.tvgId) {
          channel.tvgId = currentChannel.tvgId;
        }
        channels.push(channel);
        channelIndex++;
      }
      currentChannel = null;
    }
  }

  return channels;
}

/**
 * Load channels from persistent cache
 */
async function loadChannelsFromCache(countryCodes: string[]): Promise<IPTVChannel[] | null> {
  try {
    const cacheKey = CHANNEL_CACHE_KEY + countryCodes.sort().join('_');
    const cached = await AsyncStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > CHANNEL_CACHE_DURATION) {
      console.log('[IPTV] Channel cache expired');
      return null;
    }
    
    console.log(`[IPTV] Loaded ${parsed.data.length} channels from cache (${((Date.now() - parsed.timestamp) / 60000).toFixed(0)}min old)`);
    return parsed.data;
  } catch (err) {
    console.error('[IPTV] Failed to load channel cache:', err);
    return null;
  }
}

/**
 * Save channels to persistent cache
 */
async function saveChannelsToCache(countryCodes: string[], channels: IPTVChannel[]): Promise<void> {
  try {
    const cacheKey = CHANNEL_CACHE_KEY + countryCodes.sort().join('_');
    await AsyncStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: channels,
    }));
    console.log(`[IPTV] Cached ${channels.length} channels`);
  } catch (err) {
    console.error('[IPTV] Failed to save channel cache:', err);
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/plain, application/x-mpegurl, audio/x-mpegurl',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.log(`[IPTV] Failed to fetch ${url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Merge duplicate feed entries for the same channel into a single channel.
 * The first entry wins for name/logo/group/primary URL; all other distinct
 * URLs are kept as backupUrls for playback fallback. Entries without a tvg-id
 * are keyed by normalized name.
 */
export function mergeFeedEntries(entries: ParsedEntry[], countryCode: string): IPTVChannel[] {
  const byKey = new Map<string, IPTVChannel & { seenUrls: Set<string> }>();
  const order: string[] = [];

  const keyFor = (e: ParsedEntry) =>
    e.tvgId ?? `name:${e.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  for (const entry of entries) {
    const key = keyFor(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        id: `iptv-${countryCode}-${order.length}`,
        name: entry.name,
        url: entry.url,
        logo: entry.logo,
        group: entry.group || 'General',
        countryCode,
        tvgId: entry.tvgId,
        seenUrls: new Set([entry.url]),
      });
      order.push(key);
    } else {
      // Backfill metadata missing from the winning (first) entry — the full
      // streams playlist has no logos/groups, the curated one does.
      if (!existing.logo && entry.logo) existing.logo = entry.logo;
      if ((!existing.group || existing.group === 'General') && entry.group) {
        existing.group = entry.group;
      }
      if (!existing.tvgId && entry.tvgId) existing.tvgId = entry.tvgId;
      if (!existing.seenUrls.has(entry.url)) {
        existing.seenUrls.add(entry.url);
        existing.backupUrls = [...(existing.backupUrls ?? []), entry.url];
      }
    }
  }

  return order.map(key => {
    const merged = byKey.get(key)!;
    const channel: IPTVChannel = {
      id: merged.id,
      name: merged.name,
      url: merged.url,
      logo: merged.logo,
      group: merged.group,
      countryCode: merged.countryCode,
      tvgId: merged.tvgId,
    };
    if (merged.backupUrls) channel.backupUrls = merged.backupUrls;
    return channel;
  });
}

/**
 * Fetch and parse channels from a country's playlists.
 *
 * Combines the curated countries/*.m3u playlist (enriched metadata, but only
 * health-checked streams — can omit working channels) with the full
 * streams/*.m3u source (every submitted feed, matching
 * https://iptv-org.github.io) so the channel set stays in sync with the
 * website. Either source failing falls back to the other.
 */
export async function fetchCountryChannels(countryCode: string): Promise<IPTVChannel[]> {
  const playlistUrl = getCountryPlaylistUrl(countryCode);
  const streamsUrl = getCountryStreamsUrl(countryCode);
  const country = getCountryByCode(countryCode);

  console.log(`[IPTV] Fetching channels for ${country?.name || countryCode}`);

  const [curated, full] = await Promise.all([
    fetchText(playlistUrl),
    fetchText(streamsUrl),
  ]);

  if (!curated && !full) {
    console.error(`[IPTV] Failed to fetch channels for ${countryCode}: both sources failed`);
    return [];
  }

  // Curated entries first so they win name/logo/group/primary URL on merge.
  const entries: ParsedEntry[] = [
    ...(curated ? parseM3U(curated, countryCode) : []),
    ...(full ? parseM3U(full, countryCode) : []),
  ];
  const channels = mergeFeedEntries(entries, countryCode);

  console.log(
    `[IPTV] Found ${channels.length} channels for ${country?.name || countryCode} ` +
    `(curated: ${curated ? 'ok' : 'failed'}, full: ${full ? 'ok' : 'failed'})`
  );
  return channels;
}

/**
 * Fetch channels from multiple countries with persistent caching.
 * Returns cached data immediately if available, refreshes in background when stale.
 */
export async function fetchChannelsFromCountries(
  countryCodes: string[],
  options?: { forceRefresh?: boolean }
): Promise<IPTVChannel[]> {
  if (countryCodes.length === 0) {
    return [];
  }

  // Try loading from persistent cache first (instant)
  if (!options?.forceRefresh) {
    const cached = await loadChannelsFromCache(countryCodes);
    if (cached) {
      return cached;
    }
  }

  console.log(`[IPTV] Fetching channels from ${countryCodes.length} countries...`);

  // Fetch all countries in parallel
  const results = await Promise.allSettled(
    countryCodes.map(code => fetchCountryChannels(code))
  );

  // Combine all channels
  const allChannels: IPTVChannel[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allChannels.push(...result.value);
    }
  }

  console.log(`[IPTV] Total: ${allChannels.length} channels from ${countryCodes.length} countries`);
  
  // Cache for future launches
  if (allChannels.length > 0) {
    await saveChannelsToCache(countryCodes, allChannels);
  }
  
  return allChannels;
}

/**
 * Get EPG URLs for selected countries
 */
export function getEPGUrlsForCountries(countryCodes: string[]): string[] {
  return countryCodes
    .map(code => getCountryEPGUrl(code))
    .filter((url): url is string => url !== null);
}
