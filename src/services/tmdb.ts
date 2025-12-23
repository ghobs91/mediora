import {
  TMDBSearchResult,
  TMDBMovie,
  TMDBTVShow,
  TMDBMovieDetails,
  TMDBTVDetails,
  TMDBSeasonDetails,
} from '../types';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const TMDB_API_KEY = 'dd47805cca8c2c3c59955bfa74b2b368';

export class TMDBService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || TMDB_API_KEY;
  }

  private addApiKey(params: URLSearchParams): URLSearchParams {
    params.append('api_key', this.apiKey);
    return params;
  }

  // Search
  async searchMovies(
    query: string,
    page: number = 1,
  ): Promise<TMDBSearchResult> {
    const params = this.addApiKey(new URLSearchParams({
      query,
      page: String(page),
      include_adult: 'false',
    }));

    const response = await fetch(`${BASE_URL}/search/movie?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to search movies: ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      results: data.results.map((item: TMDBMovie) => ({
        ...item,
        media_type: 'movie' as const,
      })),
    };
  }

  async searchTV(query: string, page: number = 1): Promise<TMDBSearchResult> {
    const params = this.addApiKey(new URLSearchParams({
      query,
      page: String(page),
      include_adult: 'false',
    }));

    const response = await fetch(`${BASE_URL}/search/tv?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to search TV shows: ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      results: data.results.map((item: TMDBTVShow) => ({
        ...item,
        media_type: 'tv' as const,
      })),
    };
  }

  async searchMulti(
    query: string,
    page: number = 1,
  ): Promise<TMDBSearchResult> {
    const params = this.addApiKey(new URLSearchParams({
      query,
      page: String(page),
      include_adult: 'false',
    }));

    const response = await fetch(`${BASE_URL}/search/multi?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to search: ${response.status}`);
    }

    const data = await response.json();
    // Filter out people results
    return {
      ...data,
      results: data.results.filter(
        (item: { media_type: string }) =>
          item.media_type === 'movie' || item.media_type === 'tv',
      ),
    };
  }

  // Details
  async getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
    const params = this.addApiKey(new URLSearchParams({
      append_to_response: 'external_ids,credits,recommendations',
    }));

    const response = await fetch(`${BASE_URL}/movie/${movieId}?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get movie details: ${response.status}`);
    }

    return response.json();
  }

  async getTVDetails(tvId: number): Promise<TMDBTVDetails> {
    const params = this.addApiKey(new URLSearchParams({
      append_to_response: 'external_ids,credits,recommendations',
    }));

    const response = await fetch(`${BASE_URL}/tv/${tvId}?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get TV details: ${response.status}`);
    }

    return response.json();
  }

  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<TMDBSeasonDetails> {
    const params = this.addApiKey(new URLSearchParams());

    const response = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get season details: ${response.status}`);
    }

    return response.json();
  }

  // Trending
  async getTrending(
    mediaType: 'movie' | 'tv' | 'all' = 'all',
    timeWindow: 'day' | 'week' = 'week',
    page: number = 1,
  ): Promise<TMDBSearchResult> {
    const params = this.addApiKey(new URLSearchParams({
      page: String(page),
    }));

    const response = await fetch(
      `${BASE_URL}/trending/${mediaType}/${timeWindow}?${params}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to get trending: ${response.status}`);
    }

    return response.json();
  }

  // Popular
  async getPopularMovies(page: number = 1): Promise<TMDBSearchResult> {
    const params = this.addApiKey(new URLSearchParams({
      page: String(page),
    }));

    const response = await fetch(`${BASE_URL}/movie/popular?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get popular movies: ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      results: data.results.map((item: TMDBMovie) => ({
        ...item,
        media_type: 'movie' as const,
      })),
    };
  }

  async getPopularTV(page: number = 1): Promise<TMDBSearchResult> {
    const params = this.addApiKey(new URLSearchParams({
      page: String(page),
    }));

    const response = await fetch(`${BASE_URL}/tv/popular?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get popular TV: ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      results: data.results.map((item: TMDBTVShow) => ({
        ...item,
        media_type: 'tv' as const,
      })),
    };
  }

  // Image URLs
  static getPosterUrl(
    posterPath: string | null,
    size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original' = 'w500',
  ): string | null {
    if (!posterPath) return null;
    return `${IMAGE_BASE_URL}/${size}${posterPath}`;
  }

  static getBackdropUrl(
    backdropPath: string | null,
    size: 'w300' | 'w780' | 'w1280' | 'original' = 'w1280',
  ): string | null {
    if (!backdropPath) return null;
    return `${IMAGE_BASE_URL}/${size}${backdropPath}`;
  }

  static getProfileUrl(
    profilePath: string | null,
    size: 'w45' | 'w185' | 'h632' | 'original' = 'w185',
  ): string | null {
    if (!profilePath) return null;
    return `${IMAGE_BASE_URL}/${size}${profilePath}`;
  }

  static getStillUrl(
    stillPath: string | null,
    size: 'w92' | 'w185' | 'w300' | 'original' = 'w300',
  ): string | null {
    if (!stillPath) return null;
    return `${IMAGE_BASE_URL}/${size}${stillPath}`;
  }
}
