import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { AppSettings } from '../types';
import { iCloudService } from '../services/icloud';

const SETTINGS_STORAGE_KEY = '@mediora/settings';

const DEFAULT_SETTINGS: AppSettings = {
  jellyfin: null,
  tmdb: null,
  sonarr: null,
  radarr: null,
};

interface SettingsContextType {
  settings: AppSettings;
  isLoading: boolean;
  updateJellyfinSettings: (
    settings: AppSettings['jellyfin'],
  ) => Promise<void>;
  updateTMDBSettings: (settings: AppSettings['tmdb']) => Promise<void>;
  updateSonarrSettings: (settings: AppSettings['sonarr']) => Promise<void>;
  updateRadarrSettings: (settings: AppSettings['radarr']) => Promise<void>;
  clearAllSettings: () => Promise<void>;
  clearJellyfinSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      let loadedSettings = DEFAULT_SETTINGS;
      
      if (stored) {
        loadedSettings = JSON.parse(stored);
      }

      // On tvOS, try to load settings from iCloud if local settings are empty
      if (Platform.isTV && !loadedSettings.jellyfin) {
        console.log('[Settings] tvOS detected, checking iCloud for synced settings...');
        
        const iCloudJellyfin = await iCloudService.getJellyfinSettings();
        const iCloudSonarr = await iCloudService.getSonarrSettings();
        const iCloudRadarr = await iCloudService.getRadarrSettings();

        if (iCloudJellyfin) {
          loadedSettings.jellyfin = iCloudJellyfin;
          console.log('[Settings] Loaded Jellyfin settings from iCloud');
        }
        if (iCloudSonarr) {
          loadedSettings.sonarr = iCloudSonarr;
          console.log('[Settings] Loaded Sonarr settings from iCloud');
        }
        if (iCloudRadarr) {
          loadedSettings.radarr = iCloudRadarr;
          console.log('[Settings] Loaded Radarr settings from iCloud');
        }

        // Save the loaded iCloud settings to local storage for next time
        if (iCloudJellyfin || iCloudSonarr || iCloudRadarr) {
          await AsyncStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(loadedSettings)
          );
        }
      }

      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(newSettings),
      );
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  };

  const updateJellyfinSettings = useCallback(
    async (jellyfinSettings: AppSettings['jellyfin']) => {
      const newSettings = { ...settings, jellyfin: jellyfinSettings };
      await saveSettings(newSettings);
      
      // Sync to iCloud on iOS/macOS (not tvOS)
      if (!Platform.isTV && jellyfinSettings) {
        await iCloudService.saveJellyfinSettings(jellyfinSettings);
      }
    },
    [settings],
  );

  const updateTMDBSettings = useCallback(
    async (tmdbSettings: AppSettings['tmdb']) => {
      const newSettings = { ...settings, tmdb: tmdbSettings };
      await saveSettings(newSettings);
    },
    [settings],
  );

  const updateSonarrSettings = useCallback(
    async (sonarrSettings: AppSettings['sonarr']) => {
      const newSettings = { ...settings, sonarr: sonarrSettings };
      await saveSettings(newSettings);
      
      // Sync to iCloud on iOS/macOS (not tvOS)
      if (!Platform.isTV && sonarrSettings) {
        await iCloudService.saveSonarrSettings(sonarrSettings);
      }
    },
    [settings],
  );

  const updateRadarrSettings = useCallback(
    async (radarrSettings: AppSettings['radarr']) => {
      const newSettings = { ...settings, radarr: radarrSettings };
      await saveSettings(newSettings);
      
      // Sync to iCloud on iOS/macOS (not tvOS)
      if (!Platform.isTV && radarrSettings) {
        await iCloudService.saveRadarrSettings(radarrSettings);
      }
    },
    [settings],
  );

  const clearAllSettings = useCallback(async () => {
    await saveSettings(DEFAULT_SETTINGS);
  }, []);

  const clearJellyfinSettings = useCallback(async () => {
    const newSettings = { ...settings, jellyfin: null };
    await saveSettings(newSettings);
    
    // Clear from iCloud if on iOS/macOS
    if (!Platform.isTV) {
      await iCloudService.clearJellyfinSettings();
    }
  }, [settings]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        updateJellyfinSettings,
        updateTMDBSettings,
        updateSonarrSettings,
        updateRadarrSettings,
        clearAllSettings,
        clearJellyfinSettings,
      }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
