import { fetchWithRetry } from '../utils/http';

/** A single recommendation as returned by mediora-server's GraphQL API. */
export interface MedioraRecommendation {
  id: number;
  tmdbId: number;
  title: string;
  voteAverage: number;
  overview: string;
  runtime?: number | null;
  posterPath?: string | null;
  releaseDate?: string | null;
}

export interface MedioraRecommendations {
  movies: MedioraRecommendation[];
  tvShows: MedioraRecommendation[];
}

const GET_RECOMMENDED_QUERY = `
  query getRecommended {
    tvShows: getRecommendedTVShows {
      id
      tmdbId
      title
      releaseDate
      posterPath
      overview
      runtime
      voteAverage
    }
    movies: getRecommendedMovies {
      id
      tmdbId
      title
      releaseDate
      posterPath
      overview
      runtime
      voteAverage
    }
  }
`;

/**
 * Minimal GraphQL client for mediora-server.
 *
 * mediora-server's GraphQL endpoint authenticates with either the web UI JWT
 * or the Sonarr/Radarr-compatible API key. The native app only stores the
 * API key, so it is sent as `X-Api-Key` (the same header used for the
 * Sonarr/Radarr-compatible REST endpoints).
 */
export class MedioraServerService {
  private serverUrl: string;
  private apiKey: string;

  constructor(serverUrl: string, apiKey: string) {
    this.serverUrl = serverUrl.trim().replace(/\/$/, '');
    this.apiKey = apiKey.trim();
  }

  async getRecommended(): Promise<MedioraRecommendations> {
    const response = await fetchWithRetry(`${this.serverUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify({ query: GET_RECOMMENDED_QUERY }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch recommendations: ${response.status}`,
      );
    }

    const data = await response.json();
    if (data.errors?.length) {
      throw new Error(`Failed to fetch recommendations: ${data.errors[0].message}`);
    }

    return {
      movies: Array.isArray(data?.data?.movies) ? data.data.movies : [],
      tvShows: Array.isArray(data?.data?.tvShows) ? data.data.tvShows : [],
    };
  }
}
