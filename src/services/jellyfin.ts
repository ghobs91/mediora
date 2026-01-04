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

  async authenticateByName(
    username: string,
    password: string,
  ): Promise<JellyfinAuthResponse> {
    try {
      console.log('[Jellyfin] Authenticating with username/password');
      console.log('[Jellyfin] Username:', username);
      console.log('[Jellyfin] Password length:', password.length);
      console.log('[Jellyfin] Server URL:', this.serverUrl);
      
      const requestBody = {
        Username: username,
        Pw: password || '',
      };
      
      console.log('[Jellyfin] Request body:', JSON.stringify(requestBody));
      
      const response = await fetch(
        `${this.serverUrl}/Users/AuthenticateByName`,
        {
          method: 'POST',
          headers: getAuthHeader(undefined, this.deviceId),
          body: JSON.stringify(requestBody),
        },
      );

      console.log('[Jellyfin] Response status:', response.status);
      
      // Get content type to check if server returned HTML instead of JSON
      const contentType = response.headers.get('content-type') || '';
      console.log('[Jellyfin] Response content-type:', contentType);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Jellyfin] Authentication error response:', errorText);
        
        // Check if server returned HTML (redirect to login page) - this happens with HTTP instead of HTTPS
        if (contentType.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
          throw new Error('Server returned an HTML page instead of JSON. This usually means:\n\n• Try using HTTPS instead of HTTP\n• Check the server URL is correct\n• The server may be redirecting to a login page');
        }
        
        let errorMessage = 'Invalid username or password';
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.Message) {
            errorMessage = errorJson.Message;
          }
        } catch {
          // If not JSON, use the text as-is
          if (errorText) {
            errorMessage = errorText.substring(0, 200); // Limit length
          }
        }
        
        throw new Error(`Failed to authenticate: ${errorMessage}`);
      }
      
      // Also check successful responses for HTML (shouldn't happen but just in case)
      if (contentType.includes('text/html')) {
        throw new Error('Server returned HTML instead of JSON. Try using HTTPS instead of HTTP for the server URL.');
      }

      const data = await response.json();
      this.accessToken = data.AccessToken;
      this.userId = data.User.Id;

      console.log('[Jellyfin] Authentication successful');
      return data;
    } catch (error) {
      console.error('[Jellyfin] Authentication error:', error);
      throw error;
    }
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
            // tvOS/iOS only supports mp4/m4v containers directly
            // MKV must be transcoded/remuxed
            DirectPlayProfiles: [
              { Container: 'mp4', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3' },
              { Container: 'm4v', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3' },
              { Container: 'mov', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3' },
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
                BreakOnNonKeyFrames: true,
                CopyTimestamps: false,
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
            // Remove strict codec restrictions that can cause issues
            CodecProfiles: [],
            SubtitleProfiles: [
              { Format: 'srt', Method: 'External' },
              { Format: 'sub', Method: 'External' },
              { Format: 'vtt', Method: 'External' },
              { Format: 'ass', Method: 'External' },
              { Format: 'ssa', Method: 'External' },
            ],
            ResponseProfiles: [
              {
                Type: 'Video',
                Container: 'ts',
                MimeType: 'video/mp2t',
              },
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
    // Direct stream with container conversion to mp4 for Apple compatibility
    // This remuxes MKV to MP4 without re-encoding the video/audio
    const queryString = buildQueryString({
      mediaSourceId: mediaSourceId,
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      playSessionId: this.playSessionId,
      // Output in mp4 container for Apple compatibility
      container: 'mp4',
      // Copy streams when possible (no transcoding, just remux)
      videoCodec: 'h264',
      audioCodec: 'aac',
      enableAutoStreamCopy: true,
      allowVideoStreamCopy: true,
      allowAudioStreamCopy: true,
    });

    return `${this.serverUrl}/Videos/${itemId}/stream.mp4?${queryString}`;
  }

  getHlsStreamUrl(itemId: string, mediaSourceId: string): string {
    // Use master.m3u8 which provides absolute URLs for segments
    const queryString = buildQueryString({
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      mediaSourceId: mediaSourceId,
      playSessionId: this.playSessionId,
      // H.264/AAC for Apple compatibility
      videoCodec: 'h264',
      audioCodec: 'aac',
      // Transcoding settings
      maxWidth: 1920,
      maxHeight: 1080,
      videoBitRate: 8000000,
      audioBitRate: 192000,
      // Segment settings
      segmentContainer: 'ts',
      minSegments: 1,
      breakOnNonKeyFrames: true,
    });

    return `${this.serverUrl}/Videos/${itemId}/master.m3u8?${queryString}`;
  }

  getTranscodedStreamUrl(itemId: string, mediaSourceId: string): string {
    // Fallback: Progressive MP4 stream with full transcoding
    const queryString = buildQueryString({
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      mediaSourceId: mediaSourceId,
      playSessionId: this.playSessionId,
      // Output container
      container: 'mp4',
      // Force H.264/AAC transcoding at lower quality
      videoCodec: 'h264',
      audioCodec: 'aac',
      maxWidth: 1280,
      maxHeight: 720,
      videoBitRate: 4000000,
      audioBitRate: 128000,
      // Force transcoding
      enableAutoStreamCopy: false,
      allowVideoStreamCopy: false,
      allowAudioStreamCopy: false,
    });

    return `${this.serverUrl}/Videos/${itemId}/stream.mp4?${queryString}`;
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

  getSubtitleUrl(itemId: string, mediaSourceId: string, streamIndex: number, format: string = 'vtt'): string {
    const queryString = buildQueryString({
      api_key: this.accessToken || '',
    });
    
    return `${this.serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${streamIndex}/Stream.${format}?${queryString}`;
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

  // Server Discovery - Static method for discovering Jellyfin servers on local network
  static async discoverServers(
    timeoutMs: number = 15000,
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{
    address: string;
    name: string;
    id: string;
  }>> {
    const discoveredServers = new Map<string, { address: string; name: string; id: string }>();
    
    // Common Jellyfin ports
    const commonPorts = [8096, 8920];
    
    // Generate IPs to check - scan common ranges
    const ipsToCheck: string[] = ['localhost'];
    
    // 192.168.1.x (most common home network)
    for (let i = 1; i <= 255; i++) {
      ipsToCheck.push(`192.168.1.${i}`);
    }
    
    // 192.168.0.x (also common)
    for (let i = 1; i <= 100; i++) {
      ipsToCheck.push(`192.168.0.${i}`);
    }
    
    // 10.0.0.x (some routers)
    for (let i = 1; i <= 20; i++) {
      ipsToCheck.push(`10.0.0.${i}`);
    }

    console.log('[Jellyfin] Starting server discovery...');
    console.log(`[Jellyfin] Scanning ${ipsToCheck.length} IPs on ports ${commonPorts.join(', ')}`);
    const startTime = Date.now();

    let checksCompleted = 0;
    const totalChecks = ipsToCheck.length * commonPorts.length;
    
    // Batch processing to avoid overwhelming the network
    const batchSize = 20; // Process 20 requests at a time
    
    for (let batchStart = 0; batchStart < ipsToCheck.length; batchStart += batchSize) {
      const batch = ipsToCheck.slice(batchStart, batchStart + batchSize);
      
      const batchChecks = batch.flatMap(ip =>
        commonPorts.map(port => (async () => {
          try {
            const serverUrl = `http://${ip}:${port}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms per check
            
            const response = await fetch(`${serverUrl}/System/Info/Public`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              const key = `${ip}:${port}`;
              
              if (!discoveredServers.has(key)) {
                console.log(`[Jellyfin] ✓ Found server: ${data.ServerName} at ${serverUrl}`);
                discoveredServers.set(key, {
                  address: serverUrl,
                  name: data.ServerName || 'Jellyfin Server',
                  id: data.Id || key,
                });
              }
            }
          } catch {
            // Log occasional samples to help debugging
            if (checksCompleted % 100 === 0) {
              console.log(`[Jellyfin] Checked ${checksCompleted}/${totalChecks}...`);
            }
          } finally {
            checksCompleted++;
            if (onProgress) {
              onProgress(checksCompleted, totalChecks);
            }
          }
        })())
      );
      
      // Process batch in parallel
      await Promise.all(batchChecks);
      
      // Stop if we found a server
      if (discoveredServers.size > 0) {
        console.log('[Jellyfin] Server found, stopping discovery early');
        break;
      }
      
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        console.log('[Jellyfin] Discovery timeout reached');
        break;
      }
    }

    const servers = Array.from(discoveredServers.values());
    console.log(`[Jellyfin] Discovery complete. Found ${servers.length} server(s) in ${Date.now() - startTime}ms`);
    
    return servers;
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

  // Live TV - Get live TV channels from Jellyfin
  async getLiveTVChannels(): Promise<JellyfinItem[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    try {
      const queryString = buildQueryString({
        userId: this.userId,
        fields: 'ChannelInfo',
      });

      const response = await fetch(
        `${this.serverUrl}/LiveTv/Channels?${queryString}`,
        {
          headers: getAuthHeader(this.accessToken, this.deviceId),
        },
      );

      if (!response.ok) {
        console.log('[Jellyfin] No Live TV channels found or Live TV not configured');
        return [];
      }

      const data = await response.json();
      return data.Items || [];
    } catch (error) {
      console.error('[Jellyfin] Failed to get Live TV channels:', error);
      return [];
    }
  }

  // Get live stream URL for a channel
  getLiveStreamUrl(channelId: string): string {
    const queryString = buildQueryString({
      api_key: this.accessToken || '',
      deviceId: this.deviceId,
      playSessionId: this.playSessionId,
    });

    return `${this.serverUrl}/LiveTv/LiveStreamFiles/${channelId}/stream.m3u8?${queryString}`;
  }

  // Get program guide/EPG data for Live TV channels
  async getLiveTVPrograms(channelIds?: string[], minStartDate?: Date, maxStartDate?: Date): Promise<any[]> {
    if (!this.userId || !this.accessToken) {
      throw new Error('Not authenticated');
    }

    try {
      const params: any = {
        userId: this.userId,
        fields: 'ChannelInfo,PrimaryImageAspectRatio',
      };

      if (channelIds && channelIds.length > 0) {
        params.channelIds = channelIds.join(',');
      }

      if (minStartDate) {
        params.minStartDate = minStartDate.toISOString();
      }

      if (maxStartDate) {
        params.maxStartDate = maxStartDate.toISOString();
      }

      const queryString = buildQueryString(params);

      const response = await fetch(
        `${this.serverUrl}/LiveTv/Programs?${queryString}`,
        {
          headers: getAuthHeader(this.accessToken, this.deviceId),
        },
      );

      if (!response.ok) {
        console.log('[Jellyfin] No program guide data available');
        return [];
      }

      const data = await response.json();
      return data.Items || [];
    } catch (error) {
      console.error('[Jellyfin] Failed to get program guide:', error);
      return [];
    }
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

// M3U Parser for IPTV playlists
export interface M3UChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
}

export async function parseM3U(url: string): Promise<M3UChannel[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch M3U playlist: ${response.status}`);
    }

    const content = await response.text();
    const channels: M3UChannel[] = [];
    const lines = content.split('\n');

    let currentChannel: Partial<M3UChannel> = {};
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        // Parse channel info
        const nameMatch = line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);
        const idMatch = line.match(/tvg-id="([^"]+)"/);
        
        currentChannel = {
          name: nameMatch ? nameMatch[1].trim() : 'Unknown Channel',
          logo: logoMatch ? logoMatch[1] : undefined,
          group: groupMatch ? groupMatch[1] : 'General',
          id: idMatch ? idMatch[1] : Math.random().toString(36).substring(7),
        };
      } else if (line && !line.startsWith('#')) {
        // This is the stream URL
        if (currentChannel.name) {
          channels.push({
            id: currentChannel.id || Math.random().toString(36).substring(7),
            name: currentChannel.name,
            url: line,
            logo: currentChannel.logo,
            group: currentChannel.group,
          });
        }
        currentChannel = {};
      }
    }

    console.log(`[M3U Parser] Parsed ${channels.length} channels from playlist`);
    return channels;
  } catch (error) {
    console.error('[M3U Parser] Failed to parse M3U playlist:', error);
    throw error;
  }
}

// Live TV Tuner Host Management
export interface TunerHost {
  Id?: string;
  Type: 'm3u' | 'hdhomerun';
  Url: string;
  EnableAllTuners?: boolean;
  Source?: string;
  TunerCount?: number;
  UserAgent?: string;
  DeviceId?: string;
  FriendlyName?: string;
  ImportFavoritesOnly?: boolean;
  AllowHWTranscoding?: boolean;
}

export interface ListingProvider {
  Id?: string;
  Type: 'xmltv' | 'schedules_direct';
  Path?: string; // For XMLTV URL
  EnableAllTuners?: boolean;
  EnabledTuners?: string[];
  ListingsId?: string;
  ZipCode?: string;
  Country?: string;
}

export async function addTunerHost(
  serverUrl: string,
  accessToken: string,
  deviceId: string,
  tuner: TunerHost,
): Promise<TunerHost> {
  const url = `${serverUrl}/LiveTv/TunerHosts`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...getAuthHeader(accessToken, deviceId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tuner),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add tuner host: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function getTunerHosts(
  serverUrl: string,
  accessToken: string,
  deviceId: string,
): Promise<TunerHost[]> {
  // Jellyfin doesn't have a direct GET /LiveTv/TunerHosts endpoint
  // We use GET /LiveTv/Info to get Live TV service information
  // which may contain tuner data, but this requires admin access
  const url = `${serverUrl}/LiveTv/Info`;
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getAuthHeader(accessToken, deviceId),
  });

  if (!response.ok) {
    // If we can't get Live TV info, return empty array
    // This may happen if user doesn't have admin access
    console.log('[Jellyfin] Cannot get Live TV info - may require admin access');
    return [];
  }

  // The LiveTv/Info endpoint doesn't directly return tuner hosts
  // We would need to access the server configuration which requires admin access
  // For now, return empty array - the app will manage IPTV locally
  return [];
}

export async function deleteTunerHost(
  serverUrl: string,
  accessToken: string,
  deviceId: string,
  tunerId: string,
): Promise<void> {
  const url = `${serverUrl}/LiveTv/TunerHosts?id=${tunerId}`;
  const response = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: getAuthHeader(accessToken, deviceId),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete tuner host: ${response.status}`);
  }
}

export async function addListingProvider(
  serverUrl: string,
  accessToken: string,
  deviceId: string,
  provider: ListingProvider,
): Promise<ListingProvider> {
  const url = `${serverUrl}/LiveTv/ListingProviders`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      ...getAuthHeader(accessToken, deviceId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(provider),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to add listing provider: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function getListingProviders(
  _serverUrl: string,
  _accessToken: string,
  _deviceId: string,
): Promise<ListingProvider[]> {
  // Jellyfin doesn't have a direct GET /LiveTv/ListingProviders endpoint
  // This requires accessing server configuration with admin access
  // For now, return empty array - the app will manage EPG locally
  console.log('[Jellyfin] Listing providers API not available - managing EPG locally');
  return [];
}

export async function deleteListingProvider(
  serverUrl: string,
  accessToken: string,
  deviceId: string,
  providerId: string,
): Promise<void> {
  const url = `${serverUrl}/LiveTv/ListingProviders?id=${providerId}`;
  const response = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: getAuthHeader(accessToken, deviceId),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete listing provider: ${response.status}`);
  }
}
