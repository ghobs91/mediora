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
import { AppState, Platform } from 'react-native';
import { AppSettings } from '../types';
import { iCloudService } from '../services/icloud';

const SETTINGS_STORAGE_KEY = '@mediora/settings';

// Conflict resolution: each service carries an `updatedAt` (ms since epoch,
// stamped on write). Whichever side — local or iCloud — was written last wins.
type Timestamped = { updatedAt?: number };

const isNewer = (a?: number, b?: number) => (a ?? 0) > (b ?? 0);

const pickNewer = <T extends Timestamped>(
  local: T | null,
  remote: T | null,
): T | null => {
  if (!remote) return local;
  if (!local) return remote;
  return isNewer(remote.updatedAt, local.updatedAt) ? remote : local;
};

const stampNow = <T extends Timestamped>(service: T): T => ({
  ...service,
  updatedAt: Date.now(),
});

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
  applyInviteSettings: (settings: {
    jellyfin: NonNullable<AppSettings['jellyfin']>;
    backendMode?: AppSettings['backendMode'];
    mediarrServer?: AppSettings['mediarrServer'];
    sonarr?: AppSettings['sonarr'];
    radarr?: AppSettings['radarr'];
  }) => Promise<void>;
  updateBackendMode: (mode: AppSettings['backendMode']) => Promise<void>;
  updateMediarrServer: (
    config: AppSettings['mediarrServer'],
  ) => Promise<void>;
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

  // --- iCloud helpers ------------------------------------------------------
  //    iCloud acts as the sync transport between Apple platforms. Conflicts
  //    are resolved by `updatedAt` (newer write wins). If iCloud is
  //    unavailable we still have AsyncStorage.

  // Merge local settings with iCloud, taking the newer write per service.
  const mergeWithICloud = useCallback(async (
    local: AppSettings,
  ): Promise<AppSettings> => {
    if (!Platform.isTV || !iCloudService.isAvailable()) {
      return local;
    }

    console.log('[Settings] tvOS detected, checking iCloud for newer settings...');
    const [iCloudJellyfin, iCloudSonarr, iCloudRadarr] = await Promise.all([
      iCloudService.getJellyfinSettings(),
      iCloudService.getSonarrSettings(),
      iCloudService.getRadarrSettings(),
    ]);

    return {
      ...local,
      jellyfin: pickNewer(local.jellyfin, iCloudJellyfin),
      sonarr: pickNewer(local.sonarr, iCloudSonarr),
      radarr: pickNewer(local.radarr, iCloudRadarr),
    };
  }, []);

  // Heartbeat: push any service where the local write is newer than what
  // iCloud has (or where iCloud is empty). Ensures a failed initial save is
  // retried on a later launch without clobbering newer remote data.
  const syncToICloudIfNeeded = useCallback(async (currentSettings: AppSettings) => {
    if (!Platform.isTV) return;

    try {
      if (currentSettings.jellyfin) {
        const remote = await iCloudService.getJellyfinSettings();
        if (!remote || isNewer(currentSettings.jellyfin.updatedAt, remote.updatedAt)) {
          await iCloudService.saveJellyfinSettings(currentSettings.jellyfin);
        }
      }
      if (currentSettings.sonarr) {
        const remote = await iCloudService.getSonarrSettings();
        if (!remote || isNewer(currentSettings.sonarr.updatedAt, remote.updatedAt)) {
          await iCloudService.saveSonarrSettings(currentSettings.sonarr);
        }
      }
      if (currentSettings.radarr) {
        const remote = await iCloudService.getRadarrSettings();
        if (!remote || isNewer(currentSettings.radarr.updatedAt, remote.updatedAt)) {
          await iCloudService.saveRadarrSettings(currentSettings.radarr);
        }
      }
    } catch (err) {
      console.error('[Settings] iCloud heartbeat sync failed:', err);
    }
  }, []);

  // On tvOS, re-reconcile with iCloud whenever the app returns to the
  // foreground so changes saved on another device are picked up without a
  // cold launch.
  useEffect(() => {
    if (!Platform.isTV) return;

    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;

      (async () => {
        try {
          const merged = await mergeWithICloud(settingsRef.current);
          if (JSON.stringify(merged) !== JSON.stringify(settingsRef.current)) {
            console.log('[Settings] Applying newer iCloud settings after foreground');
            settingsRef.current = merged;
            setSettings(merged);
            await AsyncStorage.setItem(
              SETTINGS_STORAGE_KEY,
              JSON.stringify(merged),
            );
          }
        } catch (err) {
          console.error('[Settings] Foreground iCloud sync failed:', err);
        }
      })();
    });

    return () => subscription.remove();
  }, [mergeWithICloud]);

  const loadSettings = async () => {
    try {
      // ── 1. Load from AsyncStorage ──────────────────────────────
      const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      let loadedSettings: AppSettings = DEFAULT_SETTINGS;

      if (stored) {
        try {
          loadedSettings = JSON.parse(stored);
        } catch (parseError) {
          console.error('[Settings] Failed to parse stored settings:', parseError);
          // Don't throw — we still want to try iCloud restore below.
        }
      }

      // ── 2. On tvOS, reconcile with iCloud (newer write wins) ────
      //    AsyncStorage can be purged by the OS when the Apple TV is
      //    low on storage, so iCloud acts as the authoritative backup.
      const beforeMerge = JSON.stringify(loadedSettings);
      loadedSettings = await mergeWithICloud(loadedSettings);

      if (JSON.stringify(loadedSettings) !== beforeMerge) {
        console.log('[Settings] Settings changed after iCloud merge, persisting locally');
        await AsyncStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(loadedSettings),
        );
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
      const stamped = jellyfinSettings ? stampNow(jellyfinSettings) : null;
      const newSettings = { ...currentSettings, jellyfin: stamped };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms so tvOS can recover
      // credentials if AsyncStorage is purged by the OS
      if (stamped) {
        await iCloudService.saveJellyfinSettings(stamped);
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
      const stamped = sonarrSettings ? stampNow(sonarrSettings) : null;
      const newSettings = { ...currentSettings, sonarr: stamped };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms
      if (stamped) {
        await iCloudService.saveSonarrSettings(stamped);
      }
    },
    [saveSettings],
  );

  const updateRadarrSettings = useCallback(
    async (radarrSettings: AppSettings['radarr']) => {
      const currentSettings = settingsRef.current;
      const stamped = radarrSettings ? stampNow(radarrSettings) : null;
      const newSettings = { ...currentSettings, radarr: stamped };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms
      if (stamped) {
        await iCloudService.saveRadarrSettings(stamped);
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

  // Backend mode is local-only (never synced to iCloud): it only describes
  // how to reach the TV/movies backend, not remote credentials.
  const updateBackendMode = useCallback(
    async (backendMode: AppSettings['backendMode']) => {
      const currentSettings = settingsRef.current;
      const newSettings = { ...currentSettings, backendMode };
      await saveSettings(newSettings);
    },
    [saveSettings],
  );

  // The mediora-server (Bobarr) URL + API key are local-only config.
  const updateMediarrServer = useCallback(
    async (mediarrServer: AppSettings['mediarrServer']) => {
      const currentSettings = settingsRef.current;
      const newSettings = {
        ...currentSettings,
        mediarrServer: mediarrServer ? { ...mediarrServer } : null,
      };
      await saveSettings(newSettings);
    },
    [saveSettings],
  );

  // Apply a full invite in a single state update so onboarding doesn't
  // unmount mid-redemption (three sequential updates would each trigger a
  // re-render and the first one would swap onboarding out for the main app).
  const applyInviteSettings = useCallback(
    async (inviteSettings: {
      jellyfin: NonNullable<AppSettings['jellyfin']>;
      backendMode?: AppSettings['backendMode'];
      mediarrServer?: AppSettings['mediarrServer'];
      sonarr?: AppSettings['sonarr'];
      radarr?: AppSettings['radarr'];
    }) => {
      const currentSettings = settingsRef.current;
      const stampedJellyfin = stampNow(inviteSettings.jellyfin);
      const newSettings: AppSettings = {
        ...currentSettings,
        // Invites set the backend mode; unset means fall back to legacy.
        backendMode: inviteSettings.backendMode ?? 'mediarr',
        mediarrServer: inviteSettings.mediarrServer
          ? { ...inviteSettings.mediarrServer }
          : currentSettings.mediarrServer,
        // Invites without arr settings leave any existing ones untouched.
        sonarr: inviteSettings.sonarr
          ? stampNow(inviteSettings.sonarr)
          : currentSettings.sonarr,
        radarr: inviteSettings.radarr
          ? stampNow(inviteSettings.radarr)
          : currentSettings.radarr,
      };
      await saveSettings(newSettings);

      // Sync to iCloud on all Apple platforms so tvOS can recover these
      // credentials if AsyncStorage is purged.
      await iCloudService.saveJellyfinSettings(stampedJellyfin);
      if (newSettings.sonarr) {
        await iCloudService.saveSonarrSettings(newSettings.sonarr);
      }
      if (newSettings.radarr) {
        await iCloudService.saveRadarrSettings(newSettings.radarr);
      }
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
        updateBackendMode,
        updateMediarrServer,
        applyInviteSettings,
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
