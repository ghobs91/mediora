import {
  SonarrSeries,
  SonarrRootFolder,
  SonarrQualityProfile,
} from '../types';

export class SonarrService {
  private serverUrl: string;
  private apiKey: string;

  constructor(serverUrl: string, apiKey: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
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
      const response = await fetch(`${this.serverUrl}/api/v3/system/status`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
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
    const response = await fetch(
      `${this.serverUrl}/api/v3/series/lookup?${params}`,
      {
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to lookup series by TVDB ID: ${response.status}`);
    }

    return response.json();
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
