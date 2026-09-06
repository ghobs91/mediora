import {
  RadarrMovie,
  RadarrRootFolder,
  RadarrQualityProfile,
  RadarrQueueItem,
} from '../types';
import { fetchWithRetry } from '../utils/http';

const MOVIE_LIST_TTL_MS = 60000;

export class RadarrService {
  private serverUrl: string;
  private apiKey: string;
  private movieCache: { data: RadarrMovie[]; at: number } | null = null;

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

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetchWithRetry(`${this.serverUrl}${path}`, {
      ...init,
      headers: { ...this.getHeaders(), ...init.headers },
    });
  }

  public clearCache(): void {
    this.movieCache = null;
  }

  // System
  async testConnection(): Promise<boolean> {
    try {
      console.log('[Radarr] Testing connection to:', this.serverUrl);
      const url = `${this.serverUrl}/api/v3/system/status`;
      console.log('[Radarr] Fetching:', url);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('[Radarr] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Radarr] Connected to Radarr version:', data.version);
      }
      
      return response.ok;
    } catch (error) {
      console.error('[Radarr] Connection test failed:', error);
      if (error instanceof Error && error.message.includes('Network request failed')) {
        console.error('[Radarr] Network error - server may not be reachable from simulator');
      }
      return false;
    }
  }

  // Root Folders
  async getRootFolders(): Promise<RadarrRootFolder[]> {
    const response = await this.request('/api/v3/rootFolder');

    if (!response.ok) {
      throw new Error(`Failed to get root folders: ${response.status}`);
    }

    return response.json();
  }

  // Quality Profiles
  async getQualityProfiles(): Promise<RadarrQualityProfile[]> {
    const response = await this.request('/api/v3/qualityprofile');

    if (!response.ok) {
      throw new Error(`Failed to get quality profiles: ${response.status}`);
    }

    return response.json();
  }

  // Movies
  async getAllMovies(): Promise<RadarrMovie[]> {
    if (
      this.movieCache &&
      Date.now() - this.movieCache.at < MOVIE_LIST_TTL_MS
    ) {
      return this.movieCache.data;
    }
    const response = await this.request('/api/v3/movie');

    if (!response.ok) {
      throw new Error(`Failed to get movies: ${response.status}`);
    }

    const data = await response.json();
    this.movieCache = { data, at: Date.now() };
    return data;
  }

  async getMovieById(id: number): Promise<RadarrMovie> {
    const response = await this.request(`/api/v3/movie/${id}`);

    if (!response.ok) {
      throw new Error(`Failed to get movie: ${response.status}`);
    }

    return response.json();
  }

  async lookupMovie(term: string): Promise<RadarrMovie[]> {
    const params = new URLSearchParams({ term });
    const response = await this.request(`/api/v3/movie/lookup?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to lookup movie: ${response.status}`);
    }

    return response.json();
  }

  async lookupMovieByTmdbId(tmdbId: number): Promise<RadarrMovie> {
    const params = new URLSearchParams({ tmdbId: String(tmdbId) });
    const response = await this.request(`/api/v3/movie/lookup/tmdb?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to lookup movie by TMDB ID: ${response.status}`);
    }

    return response.json();
  }

  async lookupMovieByImdbId(imdbId: string): Promise<RadarrMovie[]> {
    const params = new URLSearchParams({ term: `imdb:${imdbId}` });
    const response = await this.request(`/api/v3/movie/lookup?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to lookup movie by IMDB ID: ${response.status}`);
    }

    return response.json();
  }

  async addMovie(
    movie: RadarrMovie,
    options: {
      rootFolderPath: string;
      qualityProfileId: number;
      monitored?: boolean;
      minimumAvailability?: string;
      searchForMovie?: boolean;
    },
  ): Promise<RadarrMovie> {
    const payload = {
      ...movie,
      rootFolderPath: options.rootFolderPath,
      qualityProfileId: options.qualityProfileId,
      monitored: options.monitored ?? true,
      minimumAvailability: options.minimumAvailability ?? 'released',
      addOptions: {
        searchForMovie: options.searchForMovie ?? true,
      },
    };

    const response = await fetch(`${this.serverUrl}/api/v3/movie`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to add movie: ${response.status} - ${error}`);
    }

    this.clearCache();
    return response.json();
  }

  async deleteMovie(id: number, deleteFiles: boolean = false): Promise<void> {
    const params = new URLSearchParams({
      deleteFiles: String(deleteFiles),
    });

    const response = await fetch(
      `${this.serverUrl}/api/v3/movie/${id}?${params}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to delete movie: ${response.status}`);
    }
    this.clearCache();
  }

  // Check if movie exists by TMDB ID
  async checkMovieExists(tmdbId: number): Promise<RadarrMovie | null> {
    const allMovies = await this.getAllMovies();
    return allMovies.find(m => m.tmdbId === tmdbId) || null;
  }

  // Queue (for download progress)
  async getQueue(): Promise<{ records: RadarrQueueItem[]; totalRecords: number }> {
    try {
      const response = await this.request(
        '/api/v3/queue?includeUnknownMovieItems=false&includeMovie=true',
      );

      if (!response.ok) {
        throw new Error(`Failed to get queue: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('[Radarr] Failed to get queue:', error);
      if (error instanceof Error && error.message.includes('Network request failed')) {
        console.error('[Radarr] Network error - server may not be reachable');
        throw new Error('Cannot connect to Radarr server. Please check your network connection and server settings.');
      }
      throw error;
    }
  }

  async getQueueByMovieId(movieId: number): Promise<RadarrQueueItem[]> {
    const queueData = await this.getQueue();
    return queueData.records.filter(item => item.movieId === movieId);
  }
}
