import Config from 'react-native-config';

/**
 * Development configuration for auto-filling API credentials
 * during local testing. These values are loaded from .env.local
 * and are NOT included in production builds.
 */
export const DEV_CONFIG = {
  jellyfin: {
    url: (Config?.JELLYFIN_URL || ''),
  },
  sonarr: {
    url: (Config?.SONARR_URL || ''),
    apiKey: (Config?.SONARR_API_KEY || ''),
  },
  radarr: {
    url: (Config?.RADARR_URL || ''),
    apiKey: (Config?.RADARR_API_KEY || ''),
  },
};

/**
 * Check if we should use dev config (only in __DEV__ mode and when values are present)
 */
export const shouldUseDevConfig = (service: 'jellyfin' | 'sonarr' | 'radarr'): boolean => {
  if (service === 'jellyfin') {
    return __DEV__ && !!DEV_CONFIG[service].url;
  }
  return __DEV__ && !!(DEV_CONFIG[service].url && DEV_CONFIG[service].apiKey);
};
