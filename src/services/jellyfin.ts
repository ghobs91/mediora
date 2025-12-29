import {
  JellyfinQuickConnectInitResponse,
  JellyfinQuickConnectStatus,
  JellyfinAuthResponse,
  JellyfinLibrary,
  JellyfinItem,
  JellyfinPlaybackInfo,
} from '../types';

const APP_NAME = 'Mediora';
const APP_VERSION = '1.0.0';
const DEFAULT_TIMEOUT = 30000; // 30 seconds for most requests
const PLAYBACK_TIMEOUT = 60000; // 60 seconds for playback info (server may need to analyze media)

function generateDeviceId(): string {
  return 'mediora-tvos-' + Math.random().toString(36).substring(2, 15);
}

// Helper function to add timeout to fetch requests
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout / 1000} seconds. Please check your network connection and server.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getAuthHeader(
  accessToken?: string,
  deviceId?: string,
): Record<string, string> {
  const device = deviceId || generateDeviceId();
  const authValue = `MediaBrowser Client="${APP_NAME}", Device="Apple TV", DeviceId="${device}", Version="${APP_VERSION}"${accessToken ? `, Token="${accessToken}"` : ''}`;

  return {
    'X-Emby-Authorization': authValue,
    'Content-Type': 'application/json',
  };
}

// Helper to build URL params since URLSearchParams.set() may not be available in RN
// Handles both string and number values
function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

export class JellyfinService {
  private serverUrl: string;
  private accessToken?: string;
  private userId?: string;
  private deviceId: string;
  private playSessionId: string;

  constructor(serverUrl: string, accessToken?: string, userId?: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.accessToken = accessToken;
    this.userId = userId;
    this.deviceId = generateDeviceId();
    this.playSessionId = this.generatePlaySessionId();
  }

  private generatePlaySessionId(): string {
    return Date.now().toString() + Math.random().toString(36).substring(2, 9);
  }

  // Generate a new play session ID (call before starting new playback)
  newPlaySession(): string {
    this.playSessionId = this.generatePlaySessionId();
    return this.playSessionId;
  }

  getPlaySessionId(): string {
    return this.playSessionId;
  }

  setCredentials(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  // Quick Connect Authentication
  async initiateQuickConnect(): Promise<JellyfinQuickConnectInitResponse> {
    try {
      console.log('[Jellyfin] Initiating Quick Connect to:', this.serverUrl);
      const url = `${this.serverUrl}/QuickConnect/Initiate`;
      console.log('[Jellyfin] Request URL:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeader(undefined, this.deviceId),
      });

      console.log('[Jellyfin] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Jellyfin] Error response:', errorText);
        throw new Error(`Failed to initiate Quick Connect: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[Jellyfin] Quick Connect initiated successfully');
      return data;
    } catch (error) {
      console.error('[Jellyfin] Quick Connect initiation error:', error);
      if (error instanceof TypeError && error.message.includes('Network request failed')) {
        throw new Error(`Network error: Cannot connect to ${this.serverUrl}. Please check:\n1. Server URL is correct (e.g., http://192.168.1.100:8096)\n2. Server is running and accessible\n3. You're on the same network`);
      }
      throw error;
    }
  }

  async checkQuickConnectStatus(
    secret: string,
  ): Promise<JellyfinQuickConnectStatus> {
    const response = await fetch(
      `${this.serverUrl}/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`,
      {
        method: 'GET',
        headers: getAuthHeader(undefined, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to check Quick Connect status: ${response.status}`);
    }

    return response.json();
  }

  async authenticateWithQuickConnect(
    secret: string,
  ): Promise<JellyfinAuthResponse> {
    const response = await fetch(
      `${this.serverUrl}/Users/AuthenticateWithQuickConnect`,
      {
        method: 'POST',
        headers: getAuthHeader(undefined, this.deviceId),
        body: JSON.stringify({ Secret: secret }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to authenticate with Quick Connect: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.AccessToken;
    this.userId = data.User.Id;

    return data;
  }

  // Library browsing
  async getLibraries(): Promise<JellyfinLibrary[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/Views`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get libraries: ${response.status}`);
    }

    const data = await response.json();
    return data.Items;
  }

  async getLibraryItems(
    libraryId: string,
    options?: {
      startIndex?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'Ascending' | 'Descending';
      includeItemTypes?: string[];
      filters?: string[];
    },
  ): Promise<{ Items: JellyfinItem[]; TotalRecordCount: number }> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      parentId: libraryId,
      startIndex: String(options?.startIndex || 0),
      limit: String(options?.limit || 50),
      sortBy: options?.sortBy || 'SortName',
      sortOrder: options?.sortOrder || 'Ascending',
      recursive: 'true',
      fields: 'Overview,MediaSources,UserData',
      includeItemTypes: options?.includeItemTypes?.join(','),
      filters: options?.filters?.join(','),
    });

    const response = await fetch(`${this.serverUrl}/Items?${queryString}`, {
      headers: getAuthHeader(this.accessToken, this.deviceId),
    });

    if (!response.ok) {
      throw new Error(`Failed to get library items: ${response.status}`);
    }

    return response.json();
  }

  async getItem(itemId: string): Promise<JellyfinItem> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetchWithTimeout(
      `${this.serverUrl}/Users/${this.userId}/Items/${itemId}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get item: ${response.status}`);
    }

    return response.json();
  }

  async getLatestMedia(
    libraryId?: string,
    limit: number = 20,
  ): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      limit: String(limit),
      fields: 'Overview,MediaSources,UserData',
      includeItemTypes: 'Movie,Episode',
      parentId: libraryId,
    });

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/Items/Latest?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get latest media: ${response.status}`);
    }

    return response.json();
  }

  async getResumeItems(limit: number = 10): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      limit: String(limit),
      fields: 'Overview,MediaSources,UserData',
      mediaTypes: 'Video',
    });

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/Items/Resume?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get resume items: ${response.status}`);
    }

    const data = await response.json();
    return data.Items;
  }

  async getNextUp(limit: number = 10): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      limit: String(limit),
      fields: 'Overview,MediaSources,UserData',
    });

    const response = await fetch(`${this.serverUrl}/Shows/NextUp?${queryString}`, {
      headers: getAuthHeader(this.accessToken, this.deviceId),
    });

    if (!response.ok) {
      throw new Error(`Failed to get next up: ${response.status}`);
    }

    const data = await response.json();
    return data.Items;
  }

  // Search
  async search(
    query: string,
    options?: {
      limit?: number;
      includeItemTypes?: string[];
    },
  ): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      searchTerm: query,
      limit: String(options?.limit || 20),
      fields: 'Overview,MediaSources,UserData',
      recursive: 'true',
      includeItemTypes: options?.includeItemTypes?.join(','),
    });

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/Items?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to search: ${response.status}`);
    }

    const data = await response.json();
    return data.Items;
  }

  async searchByTmdbId(tmdbId: string, itemType: 'Movie' | 'Series' = 'Movie'): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      recursive: 'true',
      fields: 'Overview,MediaSources,UserData,ProviderIds',
      includeItemTypes: itemType,
      AnyProviderIdEquals: `tmdb.${tmdbId}`,
    });

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/Items?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to search by TMDB ID: ${response.status}`);
    }

    const data = await response.json();
    const items = data.Items || [];

    // Client-side verification to avoid false positives
    return items.filter((item: JellyfinItem) =>
      item.ProviderIds?.Tmdb === tmdbId
    );
  }

  async searchByTvdbId(tvdbId: string): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      recursive: 'true',
      fields: 'Overview,MediaSources,UserData,ProviderIds',
      includeItemTypes: 'Series',
      AnyProviderIdEquals: `tvdb.${tvdbId}`,
    });

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/Items?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to search by TVDB ID: ${response.status}`);
    }

    const data = await response.json();
    const items = data.Items || [];

    // Client-side verification to avoid false positives
    return items.filter((item: JellyfinItem) =>
      item.ProviderIds?.Tvdb === tvdbId
    );
  }

  // TV Series - Seasons and Episodes
  async getSeasons(seriesId: string): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      fields: 'Overview,UserData',
    });

    const response = await fetch(
      `${this.serverUrl}/Shows/${seriesId}/Seasons?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get seasons: ${response.status}`);
    }

    const data = await response.json();
    return data.Items || [];
  }

  async getEpisodes(seriesId: string, seasonId?: string): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const queryString = buildQueryString({
      userId: this.userId,
      seasonId: seasonId,
      fields: 'Overview,MediaSources,UserData',
    });

    const response = await fetchWithTimeout(
      `${this.serverUrl}/Shows/${seriesId}/Episodes?${queryString}`,
      {
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get episodes: ${response.status}`);
    }

    const data = await response.json();
    return data.Items || [];
  }

  // Playback
  async getPlaybackInfo(itemId: string): Promise<JellyfinPlaybackInfo> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetchWithTimeout(
      `${this.serverUrl}/Items/${itemId}/PlaybackInfo?userId=${this.userId}`,
      {
        method: 'POST',
        headers: getAuthHeader(this.accessToken, this.deviceId),
        body: JSON.stringify({
          DeviceProfile: {
            MaxStreamingBitrate: 120000000,
            MaxStaticBitrate: 100000000,
            MusicStreamingTranscodingBitrate: 192000,
            DirectPlayProfiles: [
              { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,hevc,mpeg4', AudioCodec: 'aac,mp3,ac3,eac3' },
              { Container: 'mkv', Type: 'Video', VideoCodec: 'h264,hevc,mpeg4', AudioCodec: 'aac,mp3,ac3,eac3' },
              { Container: 'm4v', Type: 'Video', VideoCodec: 'h264,hevc,mpeg4', AudioCodec: 'aac,mp3,ac3,eac3' },
            ],
            TranscodingProfiles: [
              {
                Container: 'ts',
                Type: 'Video',
                VideoCodec: 'h264',
                AudioCodec: 'aac',
                Protocol: 'hls',
                Context: 'Streaming',
                MaxAudioChannels: '6',
              },
              {
                Container: 'mp4',
                Type: 'Video',
                VideoCodec: 'h264',
                AudioCodec: 'aac',
                Protocol: 'http',
                Context: 'Streaming',
              },
            ],
            CodecProfiles: [
              {
                Type: 'Video',
                Codec: 'h264',
                Conditions: [
                  { Condition: 'LessThanEqual', Property: 'Width', Value: '1920' },
                  { Condition: 'LessThanEqual', Property: 'Height', Value: '1080' },
                  { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8' },
                ],
              },
            ],
            SubtitleProfiles: [
              { Format: 'srt', Method: 'External' },
              { Format: 'sub', Method: 'External' },
              { Format: 'vtt', Method: 'External' },
            ],
          },
        }),
      },
      PLAYBACK_TIMEOUT,
    );

    if (!response.ok) {
      throw new Error(`Failed to get playback info: ${response.status}`);
    }

    return response.json();
  }

  getStreamUrl(itemId: string, mediaSourceId?: string): string {
    // Use basic stream endpoint - let Jellyfin handle container/codec decisions
    const queryString = buildQueryString({
      mediaSourceId: mediaSourceId,
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      playSessionId: this.playSessionId,
      // Let Jellyfin auto-detect and remux/transcode as needed
      enableAutoStreamCopy: true,
      allowVideoStreamCopy: true,
      allowAudioStreamCopy: true,
    });

    return `${this.serverUrl}/Videos/${itemId}/stream?${queryString}`;
  }

  getHlsStreamUrl(itemId: string, mediaSourceId: string): string {
    // Primary HLS stream using main.m3u8 - most compatible
    // API docs: segmentLength, minSegments, videoBitRate, etc. are integers
    const queryString = buildQueryString({
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      mediaSourceId: mediaSourceId,
      playSessionId: this.playSessionId,
      // HLS segment configuration - integers per API spec
      segmentContainer: 'ts',
      segmentLength: 6,
      minSegments: 2,
      // Request H.264/AAC for tvOS compatibility
      videoCodec: 'h264',
      audioCodec: 'aac',
      // Allow stream copy when possible for better quality/performance
      enableAutoStreamCopy: true,
      allowVideoStreamCopy: true,
      allowAudioStreamCopy: true,
      // Set reasonable limits - integers per API spec
      maxWidth: 1920,
      maxHeight: 1080,
      videoBitRate: 20000000,
      audioBitRate: 192000,
      maxAudioChannels: 6,
      // Streaming context
      context: 'Streaming',
      // Don't break on non-keyframes
      breakOnNonKeyFrames: false,
    });

    return `${this.serverUrl}/Videos/${itemId}/main.m3u8?${queryString}`;
  }

  getTranscodedStreamUrl(itemId: string, mediaSourceId: string): string {
    // Fallback: Force full transcoding with lower bitrate
    // API docs: all numeric params should be integers
    const queryString = buildQueryString({
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      mediaSourceId: mediaSourceId,
      playSessionId: this.playSessionId,
      // HLS segment configuration
      segmentContainer: 'ts',
      segmentLength: 6,
      minSegments: 2,
      // Force transcoding - no stream copy
      videoCodec: 'h264',
      audioCodec: 'aac',
      videoBitRate: 4000000,
      audioBitRate: 128000,
      maxWidth: 1280,
      maxHeight: 720,
      maxAudioChannels: 2,
      transcodingMaxAudioChannels: 2,
      profile: 'main',
      level: '4.0',
      enableAutoStreamCopy: false,
      allowVideoStreamCopy: false,
      allowAudioStreamCopy: false,
      breakOnNonKeyFrames: false,
      context: 'Streaming',
      // Deinterlace if needed
      deInterlace: true,
    });

    return `${this.serverUrl}/Videos/${itemId}/main.m3u8?${queryString}`;
  }

  getImageUrl(
    itemId: string,
    imageType: 'Primary' | 'Backdrop' | 'Thumb' | 'Logo' = 'Primary',
    options?: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
    },
  ): string {
    const queryString = buildQueryString({
      maxWidth: options?.maxWidth?.toString(),
      maxHeight: options?.maxHeight?.toString(),
      quality: options?.quality?.toString(),
    });

    return `${this.serverUrl}/Items/${itemId}/Images/${imageType}?${queryString}`;
  }

  // Playback reporting
  async reportPlaybackStart(
    itemId: string,
    mediaSourceId: string,
    positionTicks: number = 0,
    playMethod: 'Transcode' | 'DirectStream' | 'DirectPlay' = 'Transcode',
  ): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    await fetch(`${this.serverUrl}/Sessions/Playing`, {
      method: 'POST',
      headers: getAuthHeader(this.accessToken, this.deviceId),
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PositionTicks: positionTicks,
        PlaySessionId: this.playSessionId,
        CanSeek: true,
        IsPaused: false,
        IsMuted: false,
        PlayMethod: playMethod,
      }),
    });
  }

  async reportPlaybackProgress(
    itemId: string,
    mediaSourceId: string,
    positionTicks: number,
    isPaused: boolean = false,
    playMethod: 'Transcode' | 'DirectStream' | 'DirectPlay' = 'Transcode',
  ): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    await fetch(`${this.serverUrl}/Sessions/Playing/Progress`, {
      method: 'POST',
      headers: getAuthHeader(this.accessToken, this.deviceId),
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PositionTicks: positionTicks,
        PlaySessionId: this.playSessionId,
        CanSeek: true,
        IsPaused: isPaused,
        IsMuted: false,
        PlayMethod: playMethod,
      }),
    });
  }

  async reportPlaybackStopped(
    itemId: string,
    mediaSourceId: string,
    positionTicks: number,
  ): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    await fetch(`${this.serverUrl}/Sessions/Playing/Stopped`, {
      method: 'POST',
      headers: getAuthHeader(this.accessToken, this.deviceId),
      body: JSON.stringify({
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PositionTicks: positionTicks,
        PlaySessionId: this.playSessionId,
      }),
    });
  }

  // User Data - Played Status
  async markPlayed(itemId: string): Promise<boolean> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/PlayedItems/${itemId}`,
      {
        method: 'POST',
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      console.error(`Failed to mark played: ${response.status}`);
      return false;
    }
    return true;
  }

  async markUnplayed(itemId: string): Promise<boolean> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/PlayedItems/${itemId}`,
      {
        method: 'DELETE',
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      console.error(`Failed to mark unplayed: ${response.status}`);
      return false;
    }
    return true;
  }

  async removeFromContinueWatching(itemId: string): Promise<boolean> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    // The proper way to remove from continue watching is to mark it as played
    // This will remove it from the "Resume" list
    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/PlayedItems/${itemId}`,
      {
        method: 'POST',
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      console.error(`Failed to remove from continue watching: ${response.status}`);
      return false;
    }
    return true;
  }

  async toggleFavorite(itemId: string, isFavorite: boolean): Promise<boolean> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    const method = isFavorite ? 'POST' : 'DELETE';
    const response = await fetch(
      `${this.serverUrl}/Users/${this.userId}/FavoriteItems/${itemId}`,
      {
        method,
        headers: getAuthHeader(this.accessToken, this.deviceId),
      },
    );

    if (!response.ok) {
      console.error(`Failed to toggle favorite: ${response.status}`);
      return false;
    }
    return true;
  }


  // Stop active encoding session (important for HLS transcoding)
  async stopEncodingSession(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    try {
      await fetch(
        `${this.serverUrl}/Videos/ActiveEncodings?deviceId=${encodeURIComponent(this.deviceId)}&playSessionId=${encodeURIComponent(this.playSessionId)}`,
        {
          method: 'DELETE',
          headers: getAuthHeader(this.accessToken, this.deviceId),
        },
      );
    } catch (error) {
      // Ignore errors when stopping encoding - the session may already be stopped
      console.log('[Jellyfin] Stop encoding session (may already be stopped):', error);
    }
  }
}
