import {
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
} from '../types';

export class SonarrService {
  private serverUrl: string;
  private apiKey: string;

  constructor(serverUrl: string, apiKey: string) {
    this.serverUrl = serverUrl.trim().replace(/\/$/, '');
    this.apiKey = apiKey.trim();
    
    console.log('[Sonarr] Service initialized');
    console.log('[Sonarr] Server URL:', this.serverUrl);
    console.log('[Sonarr] API Key length:', this.apiKey.length);
    console.log('[Sonarr] API Key (first 8):', this.apiKey.substring(0, 8) + '...');
  }

  private getHeaders(): Record<string, string> {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  // System
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.serverUrl}/api/v3/system/status`;
      const headers = this.getHeaders();
      
      console.log('[Sonarr] Testing connection to:', this.serverUrl);
      console.log('[Sonarr] Fetching:', url);
      console.log('[Sonarr] API Key (first 8 chars):', this.apiKey.substring(0, 8) + '...');
      console.log('[Sonarr] Headers:', { ...headers, 'X-Api-Key': headers['X-Api-Key'].substring(0, 8) + '...' });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        headers: headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('[Sonarr] Response status:', response.status);
      console.log('[Sonarr] Response headers:', JSON.stringify([...response.headers.entries()]));
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Sonarr] Connected to Sonarr version:', data.version);
      } else {
        const errorText = await response.text();
        console.error('[Sonarr] Error response:', errorText);
      }
      
      return response.ok;
    } catch (error) {
      console.error('[Sonarr] Connection test failed:', error);
      if (error instanceof Error && error.message.includes('Network request failed')) {
        console.error('[Sonarr] Network error - server may not be reachable from simulator');
      }
      return false;
    }
  }

  // Root Folders
  async getRootFolders(): Promise<SonarrRootFolder[]> {
    const response = await fetch(`${this.serverUrl}/api/v3/rootFolder`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get root folders: ${response.status}`);
    }

    return response.json();
  }

  // Quality Profiles
  async getQualityProfiles(): Promise<SonarrQualityProfile[]> {
    const response = await fetch(`${this.serverUrl}/api/v3/qualityprofile`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get quality profiles: ${response.status}`);
    }

    return response.json();
  }

  // Series
  async getAllSeries(): Promise<SonarrSeries[]> {
    const response = await fetch(`${this.serverUrl}/api/v3/series`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get series: ${response.status}`);
    }

    return response.json();
  }

  async getSeriesById(id: number): Promise<SonarrSeries> {
    const response = await fetch(`${this.serverUrl}/api/v3/series/${id}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get series: ${response.status}`);
    }

    return response.json();
  }

  async lookupSeries(term: string): Promise<SonarrSeries[]> {
    const params = new URLSearchParams({ term });
    const response = await fetch(
      `${this.serverUrl}/api/v3/series/lookup?${params}`,
      {
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to lookup series: ${response.status}`);
    }

    return response.json();
  }

  async lookupSeriesByTvdbId(tvdbId: number): Promise<SonarrSeries[]> {
    const params = new URLSearchParams({ term: `tvdb:${tvdbId}` });
    const url = `${this.serverUrl}/api/v3/series/lookup?${params}`;
    const headers = this.getHeaders();
    
    console.log('[Sonarr] Looking up series with TVDB ID:', tvdbId);
    console.log('[Sonarr] Request URL:', url);
    console.log('[Sonarr] API Key (first 8 chars):', this.apiKey.substring(0, 8) + '...');
    console.log('[Sonarr] Headers:', { ...headers, 'X-Api-Key': headers['X-Api-Key'].substring(0, 8) + '...' });
    
    const response = await fetch(url, { headers });

    console.log('[Sonarr] Response status:', response.status);
    console.log('[Sonarr] Response headers:', JSON.stringify([...response.headers.entries()]));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sonarr] Lookup failed:', response.status, errorText);
      console.error('[Sonarr] Full error details:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        errorBody: errorText,
      });
      
      if (response.status === 401) {
        throw new Error('Sonarr authentication failed (401). Please verify your API key in Settings. The API key may be incorrect or the server URL may be wrong.');
      } else if (response.status === 404) {
        throw new Error('Series not found in Sonarr database.');
      }
      
      throw new Error(`Failed to lookup series by TVDB ID: ${response.status}`);
    }

    const results = await response.json();
    console.log('[Sonarr] Found', results.length, 'series');
    return results;
  }

  async addSeries(
    series: SonarrSeries,
    options: {
      rootFolderPath: string;
      qualityProfileId: number;
      monitored?: boolean;
      seasonFolder?: boolean;
      searchForMissingEpisodes?: boolean;
    },
  ): Promise<SonarrSeries> {
    const payload = {
      ...series,
      rootFolderPath: options.rootFolderPath,
      qualityProfileId: options.qualityProfileId,
      monitored: options.monitored ?? true,
      seasonFolder: options.seasonFolder ?? true,
      addOptions: {
        searchForMissingEpisodes: options.searchForMissingEpisodes ?? true,
      },
    };

    const response = await fetch(`${this.serverUrl}/api/v3/series`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add series: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async deleteSeries(id: number, deleteFiles: boolean = false): Promise<void> {
    const params = new URLSearchParams({
      deleteFiles: String(deleteFiles),
    });

    const response = await fetch(
      `${this.serverUrl}/api/v3/series/${id}?${params}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to delete series: ${response.status}`);
    }
  }

  // Check if series exists by TVDB ID
  async checkSeriesExists(tvdbId: number): Promise<SonarrSeries | null> {
    const allSeries = await this.getAllSeries();
    return allSeries.find(s => s.tvdbId === tvdbId) || null;
  }
}
