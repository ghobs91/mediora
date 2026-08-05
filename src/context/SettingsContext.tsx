import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
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
  iptv: null,
  localFiles: null,
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
  updateIPTVSettings: (settings: AppSettings['iptv']) => Promise<void>;
  updateLocalFilesSettings: (settings: AppSettings['localFiles']) => Promise<void>;
  clearAllSettings: () => Promise<void>;
  clearJellyfinSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Ref to always hold the latest settings, used by update callbacks
  // to avoid stale-closure bugs.
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    loadSettings();
  }, []);

  // --- Core save function (defined before callbacks so they can close over it).
  //    Uses settingsRef (not state) so callers always see the latest settings.
  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(newSettings),
      );
      setSettings(newSettings);
      settingsRef.current = newSettings;
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }, []);

  // --- iCloud helper: sync a single service's non-null settings to iCloud.
  //    Silently handles errors — if iCloud is unavailable, we still have
  //    AsyncStorage.  The sync-on-startup heartbeat ensures a failed initial
  //    save is retried on the next launch.
  const syncToICloudIfNeeded = useCallback(async (currentSettings: AppSettings) => {
    if (!Platform.isTV) return;

    try {
      if (currentSettings.jellyfin) {
        await iCloudService.saveJellyfinSettings(currentSettings.jellyfin);
      }
      if (currentSettings.sonarr) {
        await iCloudService.saveSonarrSettings(currentSettings.sonarr);
      }
      if (currentSettings.radarr) {
        await iCloudService.saveRadarrSettings(currentSettings.radarr);
      }
    } catch (err) {
      console.error('[Settings] iCloud heartbeat sync failed:', err);
    }
  }, []);

  const loadSettings = async () => {
    try {
      // ── 1. Load from AsyncStorage ──────────────────────────────
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      let loadedSettings = DEFAULT_SETTINGS;
      let parseFailed = false;

      if (stored) {
        try {
          loadedSettings = JSON.parse(stored);
        } catch (parseError) {
          console.error('[Settings] Failed to parse stored settings:', parseError);
          parseFailed = true;
          // Don't throw — we still want to try iCloud restore below.
        }
      }

      // ── 2. On tvOS, fall back to iCloud for any missing services ──
      //    AsyncStorage can be purged by the OS when the Apple TV is
      //    low on storage, so iCloud acts as the authoritative backup.
      if (Platform.isTV) {
        const iCloudAvailable = iCloudService.isAvailable();
        if (iCloudAvailable) {
          console.log('[Settings] tvOS detected, checking iCloud for any missing settings...');

          const [iCloudJellyfin, iCloudSonarr, iCloudRadarr] = await Promise.all([
            iCloudService.getJellyfinSettings(),
            iCloudService.getSonarrSettings(),
            iCloudService.getRadarrSettings(),
          ]);

          let needsLocalSave = false;

          if (!loadedSettings.jellyfin && iCloudJellyfin) {
            loadedSettings.jellyfin = iCloudJellyfin;
            console.log('[Settings] Restored Jellyfin settings from iCloud');
            needsLocalSave = true;
          }
          if (!loadedSettings.sonarr && iCloudSonarr) {
            loadedSettings.sonarr = iCloudSonarr;
            console.log('[Settings] Restored Sonarr settings from iCloud');
            needsLocalSave = true;
          }
          if (!loadedSettings.radarr && iCloudRadarr) {
            loadedSettings.radarr = iCloudRadarr;
            console.log('[Settings] Restored Radarr settings from iCloud');
            needsLocalSave = true;
          }

          // Persist restored settings back to local storage
          if (needsLocalSave) {
            await AsyncStorage.setItem(
              SETTINGS_STORAGE_KEY,
              JSON.stringify(loadedSettings),
            );
          }
        } else {
          console.log('[Settings] iCloud not available on this device');
          if (parseFailed || !stored) {
            console.warn(
              '[Settings] No local settings and no iCloud backup — ' +
              'connections will need to be re-configured.',
            );
          }
        }
      }

      // ── 3. Update state and trigger heartbeat sync ─────────────
      setSettings(loadedSettings);
      settingsRef.current = loadedSettings;

      // Ensure iCloud has the latest data (handles failed initial saves)
      await syncToICloudIfNeeded(loadedSettings);
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateJellyfinSettings = useCallback(
    async (jellyfinSettings: AppSettings['jellyfin']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, jellyfin: jellyfinSettings };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms so tvOS can recover
      // credentials if AsyncStorage is purged by the OS
      if (jellyfinSettings) {
        await iCloudService.saveJellyfinSettings(jellyfinSettings);
      }
    },
    [saveSettings],
  );

  const updateTMDBSettings = useCallback(
    async (tmdbSettings: AppSettings['tmdb']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, tmdb: tmdbSettings };
      await saveSettings(newSettings);
    },
    [saveSettings],
  );

  const updateSonarrSettings = useCallback(
    async (sonarrSettings: AppSettings['sonarr']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, sonarr: sonarrSettings };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms
      if (sonarrSettings) {
        await iCloudService.saveSonarrSettings(sonarrSettings);
      }
    },
    [saveSettings],
  );

  const updateRadarrSettings = useCallback(
    async (radarrSettings: AppSettings['radarr']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, radarr: radarrSettings };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms
      if (radarrSettings) {
        await iCloudService.saveRadarrSettings(radarrSettings);
      }
    },
    [saveSettings],
  );

  const updateIPTVSettings = useCallback(
    async (iptvSettings: AppSettings['iptv']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, iptv: iptvSettings };
      await saveSettings(newSettings);
    },
    [saveSettings],
  );

  const updateLocalFilesSettings = useCallback(
    async (localFilesSettings: AppSettings['localFiles']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, localFiles: localFilesSettings };
      await saveSettings(newSettings);
    },
    [saveSettings],
  );

  const clearAllSettings = useCallback(async () => {
    await saveSettings(DEFAULT_SETTINGS);
  }, [saveSettings]);

  const clearJellyfinSettings = useCallback(async () => {
    const currentSettings = settingsRef.current;
    const newSettings = { ...currentSettings, jellyfin: null };
    await saveSettings(newSettings);

    // Clear from iCloud if on iOS/macOS
    if (!Platform.isTV) {
      await iCloudService.clearJellyfinSettings();
    }
  }, [saveSettings]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        updateJellyfinSettings,
        updateTMDBSettings,
        updateSonarrSettings,
        updateRadarrSettings,
        updateIPTVSettings,
        updateLocalFilesSettings,
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
