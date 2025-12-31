import { NativeModules, Platform } from 'react-native';

const { ICloudSyncModule } = NativeModules;

export interface JellyfinSettings {
  serverUrl: string;
  accessToken: string;
  userId: string;
  serverId: string;
  deviceId: string;
}

export interface SonarrSettings {
  serverUrl: string;
  apiKey: string;
  rootFolderPath: string;
  qualityProfileId: number;
}

export interface RadarrSettings {
  serverUrl: string;
  apiKey: string;
  rootFolderPath: string;
  qualityProfileId: number;
}

class ICloudService {
  private isAvailable(): boolean {
    // iCloud is only available on iOS, macOS, and tvOS
    const hasNative = ICloudSyncModule != null;
    const isApplePlatform = Platform.OS === 'ios' || Platform.OS === 'macos' || Platform.OS === 'tvos' || Platform.isTV;
    return hasNative && isApplePlatform;
  }

  // Jellyfin Methods
  async saveJellyfinSettings(settings: JellyfinSettings): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return false;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.saveJellyfinSettings) {
      console.error('[iCloud] Native module method saveJellyfinSettings not present');
      return false;
    }

    try {
      await ICloudSyncModule.saveJellyfinSettings(
        settings.serverUrl,
        settings.accessToken,
        settings.userId,
        settings.serverId,
        settings.deviceId
      );
      console.log('[iCloud] Jellyfin settings saved to iCloud');
      return true;
    } catch (error) {
      console.error('[iCloud] Failed to save Jellyfin settings:', error);
      return false;
    }
  }

  async getJellyfinSettings(): Promise<JellyfinSettings | null> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return null;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.getJellyfinSettings) {
      console.error('[iCloud] Native module method getJellyfinSettings not present');
      return null;
    }

    try {
      const settings = await ICloudSyncModule.getJellyfinSettings();
      if (settings) {
        console.log('[iCloud] Retrieved Jellyfin settings from iCloud');
        return settings;
      }
      return null;
    } catch (error) {
      console.error('[iCloud] Failed to get Jellyfin settings:', error);
      return null;
    }
  }

  async clearJellyfinSettings(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return false;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.clearJellyfinSettings) {
      console.error('[iCloud] Native module method clearJellyfinSettings not present');
      return false;
    }

    try {
      await ICloudSyncModule.clearJellyfinSettings();
      console.log('[iCloud] Jellyfin settings cleared from iCloud');
      return true;
    } catch (error) {
      console.error('[iCloud] Failed to clear Jellyfin settings:', error);
      return false;
    }
  }

  // Sonarr Methods
  async saveSonarrSettings(settings: SonarrSettings): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return false;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.saveSonarrSettings) {
      console.error('[iCloud] Native module method saveSonarrSettings not present');
      return false;
    }

    try {
      await ICloudSyncModule.saveSonarrSettings(
        settings.serverUrl,
        settings.apiKey,
        settings.rootFolderPath,
        settings.qualityProfileId
      );
      console.log('[iCloud] Sonarr settings saved to iCloud');
      return true;
    } catch (error) {
      console.error('[iCloud] Failed to save Sonarr settings:', error);
      return false;
    }
  }

  async getSonarrSettings(): Promise<SonarrSettings | null> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return null;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.getSonarrSettings) {
      console.error('[iCloud] Native module method getSonarrSettings not present');
      return null;
    }

    try {
      const settings = await ICloudSyncModule.getSonarrSettings();
      if (settings) {
        console.log('[iCloud] Retrieved Sonarr settings from iCloud');
        return settings;
      }
      return null;
    } catch (error) {
      console.error('[iCloud] Failed to get Sonarr settings:', error);
      return null;
    }
  }

  async clearSonarrSettings(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return false;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.clearSonarrSettings) {
      console.error('[iCloud] Native module method clearSonarrSettings not present');
      return false;
    }

    try {
      await ICloudSyncModule.clearSonarrSettings();
      console.log('[iCloud] Sonarr settings cleared from iCloud');
      return true;
    } catch (error) {
      console.error('[iCloud] Failed to clear Sonarr settings:', error);
      return false;
    }
  }

  // Radarr Methods
  async saveRadarrSettings(settings: RadarrSettings): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return false;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.saveRadarrSettings) {
      console.error('[iCloud] Native module method saveRadarrSettings not present');
      return false;
    }

    try {
      await ICloudSyncModule.saveRadarrSettings(
        settings.serverUrl,
        settings.apiKey,
        settings.rootFolderPath,
        settings.qualityProfileId
      );
      console.log('[iCloud] Radarr settings saved to iCloud');
      return true;
    } catch (error) {
      console.error('[iCloud] Failed to save Radarr settings:', error);
      return false;
    }
  }

  async getRadarrSettings(): Promise<RadarrSettings | null> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return null;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.getRadarrSettings) {
      console.error('[iCloud] Native module method getRadarrSettings not present');
      return null;
    }

    try {
      const settings = await ICloudSyncModule.getRadarrSettings();
      if (settings) {
        console.log('[iCloud] Retrieved Radarr settings from iCloud');
        return settings;
      }
      return null;
    } catch (error) {
      console.error('[iCloud] Failed to get Radarr settings:', error);
      return null;
    }
  }

  async clearRadarrSettings(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[iCloud] Not available on this platform or native module missing');
      return false;
    }

    if (!ICloudSyncModule || !ICloudSyncModule.clearRadarrSettings) {
      console.error('[iCloud] Native module method clearRadarrSettings not present');
      return false;
    }

    try {
      await ICloudSyncModule.clearRadarrSettings();
      console.log('[iCloud] Radarr settings cleared from iCloud');
      return true;
    } catch (error) {
      console.error('[iCloud] Failed to clear Radarr settings:', error);
      return false;
    }
  }
}

export const iCloudService = new ICloudService();
