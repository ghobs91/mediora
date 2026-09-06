import { EPGChannel, EPGProgram } from '../types';
import { getCountryEPGUrl } from './iptv';
import pako from 'pako';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration
const EPG_CACHE_KEY = 'epg_cache_v4_';
const EPG_HTTP_META_KEY = 'epg_http_meta_';
const EPG_CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours before forced re-fetch
const EPG_STALE_THRESHOLD = 3 * 60 * 60 * 1000; // 3 hours before background revalidation
const HOURS_AHEAD_TO_KEEP = 48; // Parse 48 hours of programs for longer cache life
const HOURS_BEHIND_TO_KEEP = 2; // Keep recently ended programs (accounts for minor clock drift)
const MAX_DECODED_XML_BYTES = 80 * 1024 * 1024; // Refuse to decode beyond this (OOM guard)

/** Yield to the RN event loop so multi-MB gunzip/parse doesn't freeze tvOS UI. */
function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Decode UTF-8 bytes to string
 * React Native doesn't have TextDecoder, so we implement our own.
 * Chunked with periodic yields for large buffers.
 */
function decodeUtf8Sync(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;

  while (i < bytes.length) {
    const byte1 = bytes[i++];

    if (byte1 < 0x80) {
      // Single-byte character (ASCII)
      parts.push(String.fromCharCode(byte1));
    } else if (byte1 < 0xE0) {
      // Two-byte character
      const byte2 = bytes[i++];
      // eslint-disable-next-line no-bitwise
      parts.push(String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F)));
    } else if (byte1 < 0xF0) {
      // Three-byte character
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      // eslint-disable-next-line no-bitwise
      parts.push(String.fromCharCode(((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F)));
    } else {
      // Four-byte character (surrogate pair for characters outside BMP)
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      const byte4 = bytes[i++];
      // eslint-disable-next-line no-bitwise
      const codePoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
      // Convert to surrogate pair
      const highSurrogate = Math.floor((codePoint - 0x10000) / 0x400) + 0xD800;
      const lowSurrogate = ((codePoint - 0x10000) % 0x400) + 0xDC00;
      parts.push(String.fromCharCode(highSurrogate, lowSurrogate));
    }
  }

  return parts.join('');
}

async function decodeUtf8(bytes: Uint8Array): Promise<string> {
  // Small payloads stay synchronous; large ones decode in slices with yields.
  const SLICE_BYTES = 2 * 1024 * 1024;
  if (bytes.length <= SLICE_BYTES) {
    return decodeUtf8Sync(bytes);
  }
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += SLICE_BYTES) {
    parts.push(decodeUtf8Sync(bytes.subarray(offset, offset + SLICE_BYTES)));
    await yieldToEventLoop();
  }
  return parts.join('');
}

// Simple XML parser for XMLTV format EPG data
// Only keeps programs within the time window to reduce memory usage
// Uses indexOf-based parsing for performance on large files.
// Async with periodic event-loop yields so multi-MB files don't jank tvOS.
async function parseXMLTV(
  xmlString: string,
  onProgress?: (message: string) => void,
): Promise<EPGChannel[]> {
  const channels: Map<string, EPGChannel> = new Map();
  
  // Calculate time window - keep programs from recent past to 48 hours ahead
  const now = new Date();
  const pastCutoff = new Date(now.getTime() - HOURS_BEHIND_TO_KEEP * 60 * 60 * 1000);
  const cutoffTime = new Date(now.getTime() + HOURS_AHEAD_TO_KEEP * 60 * 60 * 1000);
  
  // Debug: Check XML structure
  const xmlPreview = xmlString.substring(0, 1000);
  console.log(`[EPG Parser] XML preview (first 1000 chars): ${xmlPreview.substring(0, 500)}...`);
  
  // Check if this looks like valid XMLTV
  if (!xmlString.includes('<tv') && !xmlString.includes('<?xml')) {
    console.error('[EPG Parser] XML does not appear to be valid XMLTV format');
    return [];
  }
  
  try {
    // Parse channels using indexOf (much faster than regex on large strings)
    let channelCount = 0;
    let pos = 0;
    const channelStart = '<channel ';
    const channelEnd = '</channel>';
    
    console.log(`[EPG Parser] Parsing channels...`);
    
    while (true) {
      const startIdx = xmlString.indexOf(channelStart, pos);
      if (startIdx === -1) break;
      
      const endIdx = xmlString.indexOf(channelEnd, startIdx);
      if (endIdx === -1) break;
      
      const channelBlock = xmlString.substring(startIdx, endIdx + channelEnd.length);
      pos = endIdx + channelEnd.length;
      
      // Extract channel id
      const idMatch = channelBlock.match(/id="([^"]+)"/);
      if (!idMatch) continue;
      
      const channelId = idMatch[1];
      
      // Extract display name
      const nameStart = channelBlock.indexOf('<display-name');
      let displayName = channelId;
      if (nameStart !== -1) {
        const nameContentStart = channelBlock.indexOf('>', nameStart) + 1;
        const nameEnd = channelBlock.indexOf('</display-name>', nameContentStart);
        if (nameEnd !== -1) {
          displayName = channelBlock.substring(nameContentStart, nameEnd).trim();
        }
      }
      
      // Extract icon
      const iconMatch = channelBlock.match(/icon\s+src="([^"]+)"/);
      
      channels.set(channelId.toLowerCase(), {
        id: channelId,
        displayName,
        icon: iconMatch ? iconMatch[1] : undefined,
        programs: [],
      });
      
      channelCount++;
      if (channelCount <= 3) {
        console.log(`[EPG Parser] Sample channel: id="${channelId}", name="${displayName}"`);
      }

      // Progress every 1000 channels
      if (channelCount % 1000 === 0) {
        console.log(`[EPG Parser] Parsed ${channelCount} channels...`);
      }
      if (channelCount % 250 === 0) {
        await yieldToEventLoop();
      }
    }
    
    console.log(`[EPG Parser] Found ${channels.size} channels`);
    
    // Parse programmes using indexOf
    console.log(`[EPG Parser] Parsing programs (this may take a moment for large EPG files)...`);
    console.log(`[EPG Parser] Time window: ${pastCutoff.toISOString()} to ${cutoffTime.toISOString()} (now: ${now.toISOString()})`);
    let programCount = 0;
    let skippedCount = 0;
    let timeFilteredCount = 0;
    let sampleStartDate: Date | null = null;
    pos = 0;
    const progStart = '<programme ';
    const progEnd = '</programme>';
    let lastProgressTime = Date.now();
    
    while (true) {
      const startIdx = xmlString.indexOf(progStart, pos);
      if (startIdx === -1) break;
      
      const endIdx = xmlString.indexOf(progEnd, startIdx);
      if (endIdx === -1) break;
      
      const programBlock = xmlString.substring(startIdx, endIdx + progEnd.length);
      pos = endIdx + progEnd.length;
      
      // Extract attributes from the opening tag
      const attrEnd = programBlock.indexOf('>');
      const attrStr = programBlock.substring(0, attrEnd);
      
      const startMatch = attrStr.match(/start="([^"]+)"/);
      const stopMatch = attrStr.match(/stop="([^"]+)"/);
      const channelMatch = attrStr.match(/channel="([^"]+)"/);
      
      if (!startMatch || !stopMatch || !channelMatch) {
        skippedCount++;
        continue;
      }
      
      const start = parseXMLTVDate(startMatch[1]);
      const stop = parseXMLTVDate(stopMatch[1]);
      
      if (!start || !stop) {
        skippedCount++;
        continue;
      }
      
      // Track date range for diagnostics (first program)
      if (!sampleStartDate) {
        sampleStartDate = start;
        console.log(`[EPG Parser] First program dates: start=${start.toISOString()}, stop=${stop.toISOString()}, raw start="${startMatch[1]}", raw stop="${stopMatch[1]}"`);
      }
      
      // Time window filtering: skip programs that ended before past cutoff or start too far in the future
      if (stop < pastCutoff || start > cutoffTime) {
        timeFilteredCount++;
        continue;
      }
      
      const channelId = channelMatch[1].toLowerCase();
      const channel = channels.get(channelId);
      if (!channel) {
        skippedCount++;
        continue;
      }
      
      // Extract title
      let title = 'Unknown Program';
      const titleStart = programBlock.indexOf('<title');
      if (titleStart !== -1) {
        const titleContentStart = programBlock.indexOf('>', titleStart) + 1;
        const titleEnd = programBlock.indexOf('</title>', titleContentStart);
        if (titleEnd !== -1) {
          title = decodeXMLEntities(programBlock.substring(titleContentStart, titleEnd));
        }
      }
      
      // Extract description (optional)
      let description: string | undefined;
      const descStart = programBlock.indexOf('<desc');
      if (descStart !== -1) {
        const descContentStart = programBlock.indexOf('>', descStart) + 1;
        const descEnd = programBlock.indexOf('</desc>', descContentStart);
        if (descEnd !== -1) {
          description = decodeXMLEntities(programBlock.substring(descContentStart, descEnd));
        }
      }
      
      // Extract category (optional)
      const categoryMatch = programBlock.match(/<category[^>]*>([^<]+)<\/category>/i);
      const iconMatch = programBlock.match(/<icon\s+src="([^"]+)"/i);
      
      channel.programs.push({
        channelId: channelMatch[1],
        title,
        description,
        start,
        stop,
        category: categoryMatch ? categoryMatch[1] : undefined,
        icon: iconMatch ? iconMatch[1] : undefined,
      });
      
      programCount++;

      if (programCount % 2000 === 0) {
        await yieldToEventLoop();
      }

      // Progress logging every 2 seconds
      if (Date.now() - lastProgressTime > 2000) {
        console.log(`[EPG Parser] Parsed ${programCount} programs, ${timeFilteredCount} time-filtered...`);
        onProgress?.(`Parsing EPG... ${programCount} programs`);
        lastProgressTime = Date.now();
      }
    }
    
    console.log(`[EPG Parser] Parsed ${programCount} programs (skipped ${skippedCount}, time-filtered ${timeFilteredCount})`);

    // Sort programs by start time for each channel (batched with yields)
    let sorted = 0;
    for (const channel of channels.values()) {
      channel.programs.sort((a, b) => a.start.getTime() - b.start.getTime());
      if (++sorted % 250 === 0) {
        await yieldToEventLoop();
      }
    }
    
    console.log(`[EPG] Parsed ${channels.size} channels with programs for next ${HOURS_AHEAD_TO_KEEP} hours`);
    return Array.from(channels.values());
  } catch (error) {
    console.error('[EPG] Failed to parse XMLTV:', error);
    return [];
  }
}

// Decode common XML entities
function decodeXMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// Parse XMLTV date format: 20231231120000 +0000 or 20231231120000
function parseXMLTVDate(dateStr: string): Date | null {
  try {
    const trimmed = dateStr.trim();
    const parts = trimmed.split(/\s+/);
    const cleaned = parts[0];
    if (cleaned.length < 14) return null;
    
    const year = parseInt(cleaned.substring(0, 4), 10);
    const month = parseInt(cleaned.substring(4, 6), 10) - 1;
    const day = parseInt(cleaned.substring(6, 8), 10);
    const hour = parseInt(cleaned.substring(8, 10), 10);
    const minute = parseInt(cleaned.substring(10, 12), 10);
    const second = parseInt(cleaned.substring(12, 14), 10);
    
    let utcMs = Date.UTC(year, month, day, hour, minute, second);
    
    // Parse timezone offset if present (e.g., +0000, -0500, +0530)
    const tzStr = parts.length > 1 ? parts[1] : null;
    if (tzStr && tzStr.length >= 5 && (tzStr[0] === '+' || tzStr[0] === '-')) {
      const sign = tzStr[0] === '+' ? 1 : -1;
      const tzHours = parseInt(tzStr.substring(1, 3), 10);
      const tzMinutes = parseInt(tzStr.substring(3, 5), 10);
      if (!isNaN(tzHours) && !isNaN(tzMinutes)) {
        // Subtract offset to convert local time to UTC
        // e.g., 19:00 -0500 means 19:00 local = 00:00 UTC, so subtract -5h = add 5h
        const offsetMs = sign * (tzHours * 60 + tzMinutes) * 60 * 1000;
        utcMs -= offsetMs;
      }
    }
    
    return new Date(utcMs);
  } catch {
    return null;
  }
}

// Return empty EPG data - no fake sample data
// This prevents showing wrong program information for IPTV channels
// Real EPG data should be loaded from iptv-org sources
function generateSampleEPG(channels: any[]): EPGChannel[] {
  // Return channels with empty programs - UI will show "No guide data"
  return channels.map(channel => ({
    id: channel.id,
    displayName: channel.name,
    icon: channel.logo,
    programs: [],
  }));
}

export class EPGService {
  private cachedData: EPGChannel[] = [];
  private cachedDataMap: Map<string, EPGChannel> = new Map(); // O(1) lookup index
  private rawEpgData: EPGChannel[] = []; // Raw EPG data before channel matching
  private lastFetchTime: number = 0;
  private isLoading: boolean = false;
  private loadingPromise: Promise<EPGChannel[]> | null = null;
  private lastChannelCount: number = 0; // Track if channels changed
  private backgroundRefreshInProgress: boolean = false;

  // Rebuild the O(1) lookup map whenever cachedData changes
  private rebuildCachedDataMap(): void {
    this.cachedDataMap = new Map();
    for (const ch of this.cachedData) {
      this.cachedDataMap.set(ch.id, ch);
    }
  }

  // Prune expired programs from channel list (programs whose stop time has passed)
  private pruneExpiredPrograms(channels: EPGChannel[]): EPGChannel[] {
    const now = new Date();
    let pruned = 0;
    const result = channels.map(ch => {
      const validPrograms = ch.programs.filter(p => {
        const stopTime = p.stop instanceof Date ? p.stop : new Date(p.stop);
        if (stopTime < now) {
          pruned++;
          return false;
        }
        return true;
      });
      return { ...ch, programs: validPrograms };
    });
    if (pruned > 0) {
      console.log(`[EPG] Pruned ${pruned} expired programs`);
    }
    return result;
  }

  // Try to load cached EPG from AsyncStorage
  private async loadFromStorage(countryCodes: string[]): Promise<{ channels: EPGChannel[]; timestamp: number } | null> {
    try {
      const cacheKey = EPG_CACHE_KEY + countryCodes.sort().join('_');
      const cached = await AsyncStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const parsed = JSON.parse(cached);
      const cacheAge = Date.now() - parsed.timestamp;
      
      // Hard expiry - cache is truly too old
      if (cacheAge > EPG_CACHE_DURATION) {
        console.log(`[EPG] Cache hard-expired (${(cacheAge / 3600000).toFixed(1)}h old)`);
        return null;
      }
      
      // Reconstruct Date objects and prune expired programs
      const channels: EPGChannel[] = parsed.data.map((ch: any) => ({
        ...ch,
        programs: ch.programs.map((p: any) => ({
          ...p,
          start: new Date(p.start),
          stop: new Date(p.stop),
        })),
      }));
      
      const prunedChannels = this.pruneExpiredPrograms(channels);
      const totalPrograms = prunedChannels.reduce((sum, ch) => sum + ch.programs.length, 0);
      console.log(`[EPG] Loaded ${prunedChannels.length} channels (${totalPrograms} active programs) from storage cache (${(cacheAge / 3600000).toFixed(1)}h old)`);

      // If all programs expired but the cache itself is fresh, still treat it
      // as valid (e.g. overnight gap with no broadcasts). The caller triggers
      // background revalidation for stale caches; returning null here would
      // force a full multi-MB refetch storm on every prime-time expiry.
      if (totalPrograms === 0) {
        if (cacheAge < EPG_STALE_THRESHOLD) {
          console.log('[EPG] Cached programs all expired but cache is fresh — using as-is');
          return { channels: prunedChannels, timestamp: parsed.timestamp };
        }
        console.log('[EPG] All cached programs have expired, cache is stale');
        return null;
      }
      
      return { channels: prunedChannels, timestamp: parsed.timestamp };
    } catch (err) {
      console.error('[EPG] Failed to load from storage:', err);
      return null;
    }
  }

  // Save EPG to AsyncStorage
  private async saveToStorage(countryCodes: string[], data: EPGChannel[]): Promise<void> {
    try {
      const cacheKey = EPG_CACHE_KEY + countryCodes.sort().join('_');
      const toStore = {
        timestamp: Date.now(),
        data: data,
      };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(toStore));
      console.log(`[EPG] Saved ${data.length} channels to storage cache`);
    } catch (err) {
      console.error('[EPG] Failed to save to storage:', err);
    }
  }

  // Load HTTP metadata (ETag, Last-Modified) for conditional requests
  private async loadHttpMeta(countryCode: string): Promise<{ etag?: string; lastModified?: string } | null> {
    try {
      const key = EPG_HTTP_META_KEY + countryCode;
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  // Save HTTP metadata for conditional requests
  private async saveHttpMeta(countryCode: string, etag?: string, lastModified?: string): Promise<void> {
    try {
      const key = EPG_HTTP_META_KEY + countryCode;
      await AsyncStorage.setItem(key, JSON.stringify({ etag, lastModified }));
    } catch {
      // Ignore meta save failures
    }
  }

  async fetchEPGData(
    channels?: any[], 
    countryCodes?: string[],
    onProgress?: (message: string) => void
  ): Promise<EPGChannel[]> {
    const channelCount = channels?.length || 0;
    const now = Date.now();
    
    // Prune expired programs from in-memory cache
    if (this.rawEpgData.length > 0) {
      this.rawEpgData = this.pruneExpiredPrograms(this.rawEpgData);
      // Check if raw data still has any programs after pruning
      const rawProgramCount = this.rawEpgData.reduce((sum, ch) => sum + ch.programs.length, 0);
      if (rawProgramCount === 0) {
        console.log('[EPG] All in-memory programs expired, clearing stale data');
        this.rawEpgData = [];
        this.cachedData = [];
        this.cachedDataMap = new Map();
        this.lastFetchTime = 0;
      }
    }
    
    // If we have raw EPG data and channels changed, re-match without re-fetching
    if (this.rawEpgData.length > 0 && 
        now - this.lastFetchTime < EPG_CACHE_DURATION &&
        channelCount !== this.lastChannelCount) {
      console.log(`[EPG] Re-matching EPG data with ${channelCount} channels (was ${this.lastChannelCount})`);
      this.cachedData = this.matchChannelsToEPG(channels || [], this.rawEpgData);
      this.rebuildCachedDataMap();
      this.lastChannelCount = channelCount;
      const matchedWithPrograms = this.cachedData.filter(ch => ch.programs.length > 0).length;
      console.log(`[EPG] Matched ${matchedWithPrograms} channels with program data`);
      return this.cachedData;
    }
    
    // Return cached data if still valid and channels haven't changed
    if (this.cachedData.length > 0 && 
        now - this.lastFetchTime < EPG_CACHE_DURATION &&
        channelCount === this.lastChannelCount) {
      console.log('[EPG] Using in-memory cached data');
      
      // Trigger background revalidation if cache is getting stale
      if (now - this.lastFetchTime > EPG_STALE_THRESHOLD && !this.backgroundRefreshInProgress) {
        console.log('[EPG] Cache is stale, triggering background revalidation...');
        this._backgroundRevalidate(channels, countryCodes);
      }
      
      return this.cachedData;
    }

    // Prevent multiple simultaneous fetches
    if (this.isLoading && this.loadingPromise) {
      console.log('[EPG] Already loading, waiting for existing fetch...');
      return this.loadingPromise;
    }

    this.isLoading = true;
    this.loadingPromise = this._fetchEPGDataInternal(channels, countryCodes, onProgress);
    
    try {
      const result = await this.loadingPromise;
      this.lastChannelCount = channelCount;
      return result;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  // Background revalidation - refreshes cache without blocking the UI
  private async _backgroundRevalidate(channels?: any[], countryCodes?: string[]): Promise<void> {
    if (this.backgroundRefreshInProgress) return;
    this.backgroundRefreshInProgress = true;
    
    try {
      console.log('[EPG] Background revalidation starting...');
      await this._fetchEPGDataInternal(channels, countryCodes, undefined, true);
      this.lastChannelCount = channels?.length || 0;
      console.log('[EPG] Background revalidation complete');
    } catch (err) {
      console.warn('[EPG] Background revalidation failed:', err);
    } finally {
      this.backgroundRefreshInProgress = false;
    }
  }

  private async _fetchEPGDataInternal(
    channels?: any[], 
    countryCodes?: string[],
    onProgress?: (message: string) => void,
    isBackgroundRevalidation: boolean = false
  ): Promise<EPGChannel[]> {
    // Try to load from persistent storage first
    if (countryCodes && countryCodes.length > 0 && !isBackgroundRevalidation) {
      onProgress?.('Checking cached EPG data...');
      const stored = await this.loadFromStorage(countryCodes);
      if (stored) {
        const { channels: storedData, timestamp } = stored;
        const cacheAge = Date.now() - timestamp;
        console.log(`[EPG] Loaded ${storedData.length} channels from storage, matching with ${channels?.length || 0} IPTV channels`);
        this.rawEpgData = storedData;
        this.cachedData = this.matchChannelsToEPG(channels || [], storedData);
        this.rebuildCachedDataMap();
        this.lastFetchTime = timestamp; // Use original timestamp for stale checks
        const matchedWithPrograms = this.cachedData.filter(ch => ch.programs.length > 0).length;
        console.log(`[EPG] Matched ${matchedWithPrograms} channels with program data`);
        
        // If cache is stale, schedule background revalidation
        if (cacheAge > EPG_STALE_THRESHOLD) {
          console.log(`[EPG] Persistent cache is stale (${(cacheAge / 3600000).toFixed(1)}h), will revalidate in background`);
          this._backgroundRevalidate(channels, countryCodes);
        }
        
        return this.cachedData;
      }
    }

    // Build EPG sources from selected countries
    const epgSources: string[] = [];
    if (countryCodes && countryCodes.length > 0) {
      for (const countryCode of countryCodes) {
        const epgUrl = getCountryEPGUrl(countryCode);
        if (epgUrl) {
          // Only try .gz compressed files now
          epgSources.push(epgUrl + '.gz');
        }
      }
      console.log(`[EPG] Will fetch EPG from ${epgSources.length} compressed sources`);
    }

    // Fetch EPG data from all sources
    const allEpgChannels: EPGChannel[] = [];
    
    for (let i = 0; i < epgSources.length; i++) {
      const source = epgSources[i];
      const countryCode = countryCodes?.[i] || 'unknown';
      onProgress?.(`Loading EPG for ${countryCode.toUpperCase()}...`);
      
      try {
        console.log(`[EPG] Fetching from ${source}...`);
        
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for large files
        
        // Build headers with conditional request support (delta loading)
        const headers: Record<string, string> = {
          'Accept': 'application/gzip, application/xml, text/xml, */*',
        };
        
        // Add If-Modified-Since / If-None-Match for delta loading
        if (isBackgroundRevalidation) {
          const httpMeta = await this.loadHttpMeta(countryCode);
          if (httpMeta?.etag) {
            headers['If-None-Match'] = httpMeta.etag;
            console.log(`[EPG] Sending If-None-Match: ${httpMeta.etag}`);
          }
          if (httpMeta?.lastModified) {
            headers['If-Modified-Since'] = httpMeta.lastModified;
            console.log(`[EPG] Sending If-Modified-Since: ${httpMeta.lastModified}`);
          }
        }
        
        const response = await fetch(source, {
          headers,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Handle 304 Not Modified - existing cache is still valid
        if (response.status === 304) {
          console.log(`[EPG] 304 Not Modified for ${countryCode.toUpperCase()} - cache is still valid`);
          // Extend cache timestamp since server confirmed data hasn't changed
          if (countryCodes && countryCodes.length > 0) {
            const cacheKey = EPG_CACHE_KEY + countryCodes.sort().join('_');
            const cached = await AsyncStorage.getItem(cacheKey);
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.timestamp = Date.now();
              await AsyncStorage.setItem(cacheKey, JSON.stringify(parsed));
              this.lastFetchTime = Date.now();
              console.log(`[EPG] Extended cache timestamp for ${countryCode.toUpperCase()}`);
            }
          }
          // Use existing raw data for this country
          if (this.rawEpgData.length > 0) {
            allEpgChannels.push(...this.rawEpgData);
          }
          continue;
        }
        
        if (response.ok) {
          console.log(`[EPG] Response OK, reading body...`);
          
          // Save HTTP metadata for future conditional requests
          const etag = response.headers.get('etag') || undefined;
          const lastModified = response.headers.get('last-modified') || undefined;
          if (etag || lastModified) {
            await this.saveHttpMeta(countryCode, etag, lastModified);
            console.log(`[EPG] Saved HTTP meta - ETag: ${etag}, Last-Modified: ${lastModified}`);
          }
          
          // Log response headers to debug auto-decompression
          const contentEncoding = response.headers.get('content-encoding');
          const contentType = response.headers.get('content-type');
          console.log(`[EPG] Response headers - Content-Encoding: ${contentEncoding}, Content-Type: ${contentType}`);
          
          onProgress?.(`Downloading EPG for ${countryCode.toUpperCase()}...`);
          
          let xmlText: string;
          
          // Handle gzipped content
          const arrayBuffer = await response.arrayBuffer();
          const rawBytes = new Uint8Array(arrayBuffer);
          console.log(`[EPG] Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB from ${source}`);
          
          // Check first bytes - could be gzip magic (0x1f 0x8b) OR XML (0x3c = '<')
          const isGzipped = rawBytes.length > 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b;
          const isXml = rawBytes.length > 0 && (rawBytes[0] === 0x3c || rawBytes[0] === 0xef); // '<' or BOM
          console.log(`[EPG] First bytes: 0x${rawBytes[0]?.toString(16)} 0x${rawBytes[1]?.toString(16)} - isGzipped: ${isGzipped}, isXml: ${isXml}`);
          
          onProgress?.(`Decompressing EPG for ${countryCode.toUpperCase()}...`);
          
          try {
            let textBytes: Uint8Array;
            
            // If data starts with '<' (0x3c) or BOM (0xef), it's already XML - skip decompression
            if (isXml) {
              console.log(`[EPG] Data starts with XML marker, skipping decompression (fetch may have auto-decompressed)`);
              textBytes = rawBytes;
            } else if (isGzipped) {
              // The file may be multi-gzipped (server gzip + file gzip)
              // Keep decompressing until we get non-gzip data
              console.log(`[EPG] Detected gzip, will decompress (possibly multiple layers)...`);
              
              textBytes = rawBytes;
              let layer = 0;
              const maxLayers = 5; // Safety limit
              
              while (layer < maxLayers) {
                // Check if current data is gzipped
                if (textBytes.length > 2 && textBytes[0] === 0x1f && textBytes[1] === 0x8b) {
                  layer++;
                  console.log(`[EPG] Decompressing layer ${layer}...`);
                  console.log(`[EPG] Input size: ${(textBytes.length / 1024 / 1024).toFixed(2)}MB`);
                  
                  try {
                    const decompressed = pako.ungzip(textBytes);
                    console.log(`[EPG] Layer ${layer} output size: ${(decompressed.length / 1024 / 1024).toFixed(2)}MB`);
                    console.log(`[EPG] Layer ${layer} first 10 bytes: ${Array.from(decompressed.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
                    textBytes = decompressed;
                    // Let the UI breathe between (potentially large) layers.
                    await yieldToEventLoop();
                  } catch (err: any) {
                    console.log(`[EPG] Layer ${layer} decompression failed: ${err.message}`);
                    break;
                  }
                } else {
                  // Not gzip anymore, we're done
                  console.log(`[EPG] Found non-gzip data after ${layer} layer(s), first byte: 0x${textBytes[0]?.toString(16)}`);
                  break;
                }
              }
              
              if (layer >= maxLayers) {
                console.log(`[EPG] WARNING: Hit max decompression layers (${maxLayers})`);
              }
            } else {
              // Unknown format - try as raw bytes
              console.log(`[EPG] Unknown format, treating as raw data`);
              textBytes = rawBytes;
            }
            
            // Decode UTF-8 bytes to string (chunked with event-loop yields)
            if (textBytes.length > MAX_DECODED_XML_BYTES) {
              console.warn(`[EPG] Skipping ${(textBytes.length / 1024 / 1024).toFixed(1)}MB payload from ${source} (exceeds ${(MAX_DECODED_XML_BYTES / 1024 / 1024).toFixed(0)}MB guard)`);
              continue;
            }
            xmlText = await decodeUtf8(textBytes);
            console.log(`[EPG] Decoded to ${(xmlText.length / 1024 / 1024).toFixed(2)}MB of text`);
            console.log(`[EPG] First 200 chars: ${xmlText.substring(0, 200)}`);
          } catch (decompressError) {
            console.warn(`[EPG] Failed to process ${source}:`, decompressError);
            continue;
          }
          
          if (xmlText.length < 100) {
            console.warn(`[EPG] XML content too small, likely an error page`);
            continue;
          }
          
          onProgress?.(`Parsing EPG for ${countryCode.toUpperCase()}...`);
          const epgChannels = await parseXMLTV(xmlText, onProgress);
          if (epgChannels.length > 0) {
            console.log(`[EPG] Parsed ${epgChannels.length} channels with ${epgChannels.reduce((sum, c) => sum + c.programs.length, 0)} programs from ${source}`);
            allEpgChannels.push(...epgChannels);
          } else {
            console.warn(`[EPG] No channels parsed from ${source}`);
          }
        } else {
          console.warn(`[EPG] HTTP ${response.status} from ${source}`);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn(`[EPG] Timeout fetching from ${source}`);
        } else {
          console.warn(`[EPG] Failed to fetch from ${source}:`, error?.message || error);
        }
      }
    }

    if (allEpgChannels.length > 0) {
      // Save raw EPG data for re-matching later
      this.rawEpgData = allEpgChannels;
      
      // Save to storage for future use
      if (countryCodes && countryCodes.length > 0) {
        onProgress?.('Caching EPG data...');
        await this.saveToStorage(countryCodes, allEpgChannels);
      }
      
      // Match EPG channels to our channel list
      onProgress?.('Matching channels...');
      console.log(`[EPG] Matching ${allEpgChannels.length} EPG channels with ${channels?.length || 0} IPTV channels`);
      this.cachedData = this.matchChannelsToEPG(channels || [], allEpgChannels);
      this.rebuildCachedDataMap();
      this.lastFetchTime = Date.now();
      const matchedWithPrograms = this.cachedData.filter(ch => ch.programs.length > 0).length;
      console.log(`[EPG] Matched ${matchedWithPrograms} channels with program data`);
      return this.cachedData;
    }

    // Fallback to empty EPG data
    console.log('[EPG] No EPG data available, using empty data...');
    if (channels && channels.length > 0) {
      this.cachedData = generateSampleEPG(channels);
      this.rebuildCachedDataMap();
      this.lastFetchTime = Date.now();
      console.log(`[EPG] Generated empty EPG for ${this.cachedData.length} channels`);
      return this.cachedData;
    }

    return [];
  }

  // Normalize channel name for matching
  private normalizeChannelName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s*(hd|sd|fhd|uhd|4k|720p|1080p|1080i)\s*/gi, '') // Remove quality indicators
      .replace(/\s*\([^)]*\)\s*/g, '') // Remove parenthetical content
      .replace(/\s*\[[^\]]*\]\s*/g, '') // Remove bracketed content
      .replace(/[^a-z0-9]/g, '') // Keep only alphanumeric
      .trim();
  }

  // Match our channel list with EPG channels using improved fuzzy matching
  private matchChannelsToEPG(ourChannels: any[], epgChannels: EPGChannel[]): EPGChannel[] {
    const matched: EPGChannel[] = [];
    let matchedCount = 0;
    let tvgIdMatches = 0;
    let nameMatches = 0;
    
    // Debug: Check first few channels for tvgId
    const channelsWithTvgId = ourChannels.filter(ch => ch.tvgId).length;
    console.log(`[EPG Match] ${ourChannels.length} channels, ${channelsWithTvgId} have tvgId`);
    if (ourChannels.length > 0 && ourChannels[0].tvgId) {
      console.log(`[EPG Match] Sample tvgId: "${ourChannels[0].tvgId}"`);
    }
    if (epgChannels.length > 0) {
      console.log(`[EPG Match] Sample EPG id: "${epgChannels[0].id}"`);
    }
    
    // Create normalized lookup map for faster matching
    const epgMap = new Map<string, EPGChannel>();
    const epgNormalizedMap = new Map<string, EPGChannel>();
    // Prefix index: maps each normalized prefix (3+ chars) to an EPGChannel for strategy 5
    const epgPrefixMap = new Map<string, EPGChannel>();
    // First-word index: maps first significant word to EPGChannel for strategy 6
    const epgFirstWordMap = new Map<string, EPGChannel>();
    
    for (const epg of epgChannels) {
      epgMap.set(epg.id.toLowerCase(), epg);
      epgMap.set(epg.displayName.toLowerCase(), epg);
      const normalizedDisplay = this.normalizeChannelName(epg.displayName);
      const normalizedId = this.normalizeChannelName(epg.id);
      epgNormalizedMap.set(normalizedDisplay, epg);
      epgNormalizedMap.set(normalizedId, epg);
      // Build prefix index (store by normalized name as a prefix key)
      if (normalizedDisplay.length > 2) {
        epgPrefixMap.set(normalizedDisplay, epg);
      }
      // Build first-word index
      const words = epg.displayName.toLowerCase().split(/[\s\-_]+/).filter((w: string) => w.length > 2);
      if (words.length > 0 && !epgFirstWordMap.has(words[0])) {
        epgFirstWordMap.set(words[0], epg);
      }
    }
    
    for (const channel of ourChannels) {
      const channelName = channel.name || '';
      const channelId = channel.id || '';
      const tvgId = channel.tvgId || ''; // tvg-id from M3U for EPG linking
      const normalizedName = this.normalizeChannelName(channelName);
      
      // Try multiple matching strategies
      let epgMatch: EPGChannel | undefined;
      let matchType = '';
      
      // 1. Exact tvg-id match (most reliable for EPG linking)
      if (tvgId) {
        epgMatch = epgMap.get(tvgId.toLowerCase());
        if (epgMatch) matchType = 'tvgId';
      }
      
      // 2. Exact ID match
      if (!epgMatch) {
        epgMatch = epgMap.get(channelId.toLowerCase());
        if (epgMatch) matchType = 'id';
      }
      
      // 3. Exact name match
      if (!epgMatch) {
        epgMatch = epgMap.get(channelName.toLowerCase());
        if (epgMatch) matchType = 'name';
      }
      
      // 4. Normalized name match
      if (!epgMatch && normalizedName.length > 2) {
        epgMatch = epgNormalizedMap.get(normalizedName);
        if (epgMatch) matchType = 'normalized';
      }
      
      // 5. Prefix match - use indexed prefix lookup instead of O(N) scan
      if (!epgMatch && normalizedName.length > 2) {
        // Check if any EPG normalized name starts with our name (or vice versa)
        for (const [epgNorm, epg] of epgPrefixMap) {
          if (normalizedName.startsWith(epgNorm) || epgNorm.startsWith(normalizedName)) {
            epgMatch = epg;
            matchType = 'partial';
            break;
          }
        }
      }
      
      // 6. Word-based matching - first significant word matches (O(1) lookup)
      if (!epgMatch) {
        const channelWords = channelName.toLowerCase().split(/[\s\-_]+/).filter((w: string) => w.length > 2);
        if (channelWords.length > 0) {
          epgMatch = epgFirstWordMap.get(channelWords[0]);
          if (epgMatch) matchType = 'word';
        }
      }
      
      if (epgMatch) {
        matchedCount++;
        if (matchType === 'tvgId') tvgIdMatches++;
        else nameMatches++;
        // Use the matched EPG data but with our channel ID
        matched.push({
          id: channel.id,
          displayName: channel.name,
          icon: channel.logo || epgMatch.icon,
          programs: epgMatch.programs.map(p => ({ ...p, channelId: channel.id })),
        });
      } else {
        // No EPG match - create empty entry (will show no guide data)
        matched.push({
          id: channel.id,
          displayName: channel.name,
          icon: channel.logo,
          programs: [],
        });
      }
    }
    
    console.log(`[EPG] Matched ${matchedCount} of ${ourChannels.length} channels with EPG data (${tvgIdMatches} via tvgId, ${nameMatches} via name)`);
    return matched;
  }

  // Get current and upcoming programs for a channel
  getCurrentProgram(channelId: string): EPGProgram | null {
    const channel = this.cachedDataMap.get(channelId);
    if (!channel) return null;

    const now = new Date();
    return channel.programs.find(p => p.start <= now && p.stop > now) || null;
  }

  getUpcomingPrograms(channelId: string, limit: number = 5): EPGProgram[] {
    const channel = this.cachedDataMap.get(channelId);
    if (!channel) return [];

    const now = new Date();
    return channel.programs
      .filter(p => p.start > now)
      .slice(0, limit);
  }

  // Get all programs for a channel within a time range
  getProgramsForChannel(channelId: string, startTime: Date, endTime: Date): EPGProgram[] {
    const channel = this.cachedDataMap.get(channelId);
    if (!channel) return [];

    return channel.programs.filter(p => 
      (p.start >= startTime && p.start < endTime) ||
      (p.stop > startTime && p.stop <= endTime) ||
      (p.start <= startTime && p.stop >= endTime)
    );
  }

  // Match channel by name/ID (fuzzy matching)
  findChannelGuide(channelName: string): EPGChannel | null {
    const normalized = channelName.toLowerCase().trim();
    
    // Try exact match via map first
    let match = this.cachedDataMap.get(normalized);
    if (match) return match;
    
    // Try by display name / id
    match = this.cachedData.find(c => 
      c.id.toLowerCase() === normalized || 
      c.displayName.toLowerCase() === normalized
    );
    
    if (match) return match;
    
    // Try partial match
    match = this.cachedData.find(c => 
      c.displayName.toLowerCase().includes(normalized) ||
      normalized.includes(c.displayName.toLowerCase())
    );
    
    return match || null;
  }

  getAllChannels(): EPGChannel[] {
    return this.cachedData;
  }

  // Preload EPG data in background (called after channels load)
  async preloadEPGData(channels: any[], countryCodes: string[]): Promise<void> {
    if (this.isLoading || this.backgroundRefreshInProgress) {
      console.log('[EPG] Preload skipped - already loading');
      return;
    }
    
    const now = Date.now();
    // Skip if we already have fresh data
    if (this.cachedData.length > 0 && now - this.lastFetchTime < EPG_STALE_THRESHOLD) {
      console.log('[EPG] Preload skipped - data is fresh');
      return;
    }
    
    console.log('[EPG] Preloading EPG data in background...');
    try {
      await this.fetchEPGData(channels, countryCodes);
      console.log('[EPG] Preload complete');
    } catch (err) {
      console.warn('[EPG] Preload failed:', err);
    }
  }

  // Check if EPG data is already available with actual program content
  hasData(): boolean {
    return this.cachedData.some(ch => ch.programs.length > 0);
  }

  // Clear all cached data to force a fresh fetch
  async clearCache(): Promise<void> {
    this.cachedData = [];
    this.cachedDataMap = new Map();
    this.rawEpgData = [];
    this.lastFetchTime = 0;
    this.lastChannelCount = 0;
    
    // Clear AsyncStorage cache (both data and HTTP metadata)
    try {
      const keys = await AsyncStorage.getAllKeys();
      const epgKeys = keys.filter(k => k.startsWith(EPG_CACHE_KEY) || k.startsWith(EPG_HTTP_META_KEY));
      if (epgKeys.length > 0) {
        await AsyncStorage.multiRemove(epgKeys);
        console.log(`[EPG] Cleared ${epgKeys.length} cache entries`);
      }
    } catch (err) {
      console.error('[EPG] Failed to clear cache:', err);
    }
  }
}

export const epgService = new EPGService();
