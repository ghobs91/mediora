declare module 'react-native-config' {
  export interface NativeConfig {
    JELLYFIN_URL?: string;
    SONARR_URL?: string;
    SONARR_API_KEY?: string;
    RADARR_URL?: string;
    RADARR_API_KEY?: string;
  }

  export const Config: NativeConfig;
  export default Config;
}
