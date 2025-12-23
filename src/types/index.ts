// Jellyfin Types
export interface JellyfinServer {
  url: string;
  name?: string;
}

export interface JellyfinQuickConnectInitResponse {
  Authenticated: boolean;
  Secret: string;
  Code: string;
  DeviceId: string;
  DeviceName: string;
  AppName: string;
  AppVersion: string;
  DateAdded: string;
}

export interface JellyfinQuickConnectStatus {
  Authenticated: boolean;
  Secret: string;
  Code: string;
}

export interface JellyfinAuthResponse {
  User: JellyfinUser;
  SessionInfo: JellyfinSession;
  AccessToken: string;
  ServerId: string;
}

export interface JellyfinUser {
  Id: string;
  Name: string;
  ServerId: string;
  HasPassword: boolean;
  HasConfiguredPassword: boolean;
  EnableAutoLogin: boolean;
}

export interface JellyfinSession {
  Id: string;
  UserId: string;
  UserName: string;
  Client: string;
  DeviceId: string;
  DeviceName: string;
}

export interface JellyfinLibrary {
  Id: string;
  Name: string;
  CollectionType?: string;
  Type: string;
  ImageTags?: Record<string, string>;
}

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  SeriesName?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  OfficialRating?: string;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ServerId: string;
  UserData?: {
    PlaybackPositionTicks: number;
    PlayCount: number;
    IsFavorite: boolean;
    Played: boolean;
    UnplayedItemCount?: number;
  };
  MediaSources?: JellyfinMediaSource[];
}

export interface JellyfinMediaSource {
  Id: string;
  Name: string;
  Path: string;
  Container: string;
  Size: number;
  Bitrate?: number;
  MediaStreams: JellyfinMediaStream[];
}

export interface JellyfinMediaStream {
  Index: number;
  Type: 'Video' | 'Audio' | 'Subtitle';
  Codec: string;
  Language?: string;
  Title?: string;
  DisplayTitle?: string;
  IsDefault: boolean;
  IsForced: boolean;
}

export interface JellyfinPlaybackInfo {
  MediaSources: JellyfinMediaSource[];
  PlaySessionId: string;
}

// TMDB Types
export interface TMDBSearchResult {
  page: number;
  results: (TMDBMovie | TMDBTVShow)[];
  total_pages: number;
  total_results: number;
}

export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  genre_ids: number[];
  media_type?: 'movie';
}

export interface TMDBTVShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  origin_country: string[];
  media_type?: 'tv';
}

export interface TMDBMovieDetails extends TMDBMovie {
  imdb_id: string;
  runtime: number;
  status: string;
  tagline: string;
  genres: { id: number; name: string }[];
  production_companies: { id: number; name: string; logo_path: string | null }[];
  external_ids?: {
    imdb_id: string;
    tvdb_id?: number;
  };
}

export interface TMDBTVDetails extends TMDBTVShow {
  number_of_seasons: number;
  number_of_episodes: number;
  status: string;
  tagline: string;
  genres: { id: number; name: string }[];
  networks: { id: number; name: string; logo_path: string | null }[];
  external_ids?: {
    imdb_id: string;
    tvdb_id: number;
  };
}

// Sonarr Types
export interface SonarrRootFolder {
  id: number;
  path: string;
  accessible: boolean;
  freeSpace: number;
}

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

export interface SonarrSeries {
  id?: number;
  title: string;
  sortTitle: string;
  status: string;
  overview: string;
  network?: string;
  airTime?: string;
  images: { coverType: string; url: string; remoteUrl?: string }[];
  remotePoster?: string;
  seasons: SonarrSeason[];
  year: number;
  path?: string;
  qualityProfileId?: number;
  seasonFolder: boolean;
  monitored: boolean;
  useSceneNumbering: boolean;
  runtime: number;
  tvdbId: number;
  tvRageId?: number;
  tvMazeId?: number;
  imdbId?: string;
  firstAired?: string;
  seriesType: string;
  cleanTitle: string;
  titleSlug: string;
  rootFolderPath?: string;
  genres: string[];
  tags: number[];
  added?: string;
  ratings: { votes: number; value: number };
  statistics?: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

// Radarr Types
export interface RadarrRootFolder {
  id: number;
  path: string;
  accessible: boolean;
  freeSpace: number;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrMovie {
  id?: number;
  title: string;
  originalTitle: string;
  sortTitle: string;
  status: string;
  overview: string;
  inCinemas?: string;
  physicalRelease?: string;
  digitalRelease?: string;
  images: { coverType: string; url: string; remoteUrl?: string }[];
  remotePoster?: string;
  year: number;
  path?: string;
  qualityProfileId?: number;
  monitored: boolean;
  minimumAvailability: string;
  isAvailable: boolean;
  folderName?: string;
  runtime: number;
  cleanTitle: string;
  imdbId?: string;
  tmdbId: number;
  titleSlug: string;
  rootFolderPath?: string;
  studio?: string;
  genres: string[];
  tags: number[];
  added?: string;
  ratings: { votes: number; value: number };
  hasFile?: boolean;
  sizeOnDisk?: number;
}

// App Settings Types
export interface AppSettings {
  jellyfin: {
    serverUrl: string;
    accessToken: string;
    userId: string;
    serverId: string;
    deviceId: string;
  } | null;
  tmdb: {
    apiKey: string;
  } | null;
  sonarr: {
    serverUrl: string;
    apiKey: string;
    rootFolderPath: string;
    qualityProfileId: number;
  } | null;
  radarr: {
    serverUrl: string;
    apiKey: string;
    rootFolderPath: string;
    qualityProfileId: number;
  } | null;
}

// Navigation Types
export type RootStackParamList = {
  MainMenu: undefined;
  Home: undefined;
  Library: undefined;
  Search: undefined;
  Settings: undefined;
  Player: { itemId: string };
  ItemDetails: { item: JellyfinItem };
  TMDBDetails: { item: TMDBMovie | TMDBTVShow; mediaType: 'movie' | 'tv' };
};
