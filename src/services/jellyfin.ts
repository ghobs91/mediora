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

function generateDeviceId(): string {
  return 'mediora-tvos-' + Math.random().toString(36).substring(2, 15);
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
function buildQueryString(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
    .join('&');
}

export class JellyfinService {
  private serverUrl: string;
  private accessToken?: string;
  private userId?: string;
  private deviceId: string;

  constructor(serverUrl: string, accessToken?: string, userId?: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.accessToken = accessToken;
    this.userId = userId;
    this.deviceId = generateDeviceId();
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

    const response = await fetch(
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
      anyProviderIdEquals: `tmdb.${tmdbId}`,
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
    return data.Items || [];
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
      anyProviderIdEquals: `tvdb.${tvdbId}`,
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
    return data.Items || [];
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

    const response = await fetch(
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

    const response = await fetch(
      `${this.serverUrl}/Items/${itemId}/PlaybackInfo?userId=${this.userId}`,
      {
        method: 'POST',
        headers: getAuthHeader(this.accessToken, this.deviceId),
        body: JSON.stringify({
          DeviceProfile: {
            MaxStreamingBitrate: 40000000,
            MaxStaticBitrate: 100000000,
            MusicStreamingTranscodingBitrate: 192000,
            DirectPlayProfiles: [
              { Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,hevc' },
              { Container: 'mkv', Type: 'Video', VideoCodec: 'h264,hevc' },
            ],
            TranscodingProfiles: [
              {
                Container: 'ts',
                Type: 'Video',
                VideoCodec: 'h264',
                AudioCodec: 'aac',
                Protocol: 'hls',
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get playback info: ${response.status}`);
    }

    return response.json();
  }

  getStreamUrl(itemId: string, mediaSourceId?: string): string {
    const queryString = buildQueryString({
      deviceId: this.deviceId,
      api_key: this.accessToken || '',
      static: 'true',
      mediaSourceId: mediaSourceId,
    });

    return `${this.serverUrl}/Videos/${itemId}/stream?${queryString}`;
  }

  getHlsStreamUrl(itemId: string, mediaSourceId?: string): string {
    const queryString = buildQueryString({
      deviceId: this.deviceId,
      api_key: this.accessToken || '',
      playSessionId: Date.now().toString(),
      videoCodec: 'h264',
      audioCodec: 'aac',
      maxAudioChannels: '6',
      transcodingMaxAudioChannels: '6',
      segmentContainer: 'ts',
      minSegments: '2',
      breakOnNonKeyFrames: 'true',
      mediaSourceId: mediaSourceId,
    });

    return `${this.serverUrl}/Videos/${itemId}/master.m3u8?${queryString}`;
  }

  getImageUrl(
    itemId: string,
    imageType: 'Primary' | 'Backdrop' | 'Thumb' = 'Primary',
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
        CanSeek: true,
        IsPaused: false,
        IsMuted: false,
        PlayMethod: 'DirectStream',
      }),
    });
  }

  async reportPlaybackProgress(
    itemId: string,
    mediaSourceId: string,
    positionTicks: number,
    isPaused: boolean = false,
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
        CanSeek: true,
        IsPaused: isPaused,
        IsMuted: false,
        PlayMethod: 'DirectStream',
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
      }),
    });
  }
}
