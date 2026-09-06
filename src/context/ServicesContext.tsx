import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useSettings } from './SettingsContext';
import {
  JellyfinService,
  TMDBService,
  SonarrService,
  RadarrService,
  LocalMediaService,
} from '../services';
import { DEV_CONFIG } from '../config/dev';

export type ConnectionStatus = 'unknown' | 'reachable' | 'unreachable';

interface ServicesContextType {
  jellyfin: JellyfinService | null;
  tmdb: TMDBService | null;
  sonarr: SonarrService | null;
  radarr: RadarrService | null;
  localMedia: LocalMediaService | null;
  isJellyfinConnected: boolean;
  isTMDBConnected: boolean;
  isSonarrConnected: boolean;
  isRadarrConnected: boolean;
  isLocalFilesEnabled: boolean;
  /** Last verified reachability per service ('unknown' before first check). */
  connectionStatus: {
    jellyfin: ConnectionStatus;
    sonarr: ConnectionStatus;
    radarr: ConnectionStatus;
  };
  /** Re-run reachability checks (e.g. from a "Retry" button). */
  refreshConnections: () => void;
}

const ServicesContext = createContext<ServicesContextType | undefined>(
  undefined,
);

export function ServicesProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  const jellyfin = useMemo(() => {
    if (!settings.jellyfin) return null;
    const service = new JellyfinService(
      settings.jellyfin.serverUrl,
      settings.jellyfin.accessToken,
      settings.jellyfin.userId,
      settings.jellyfin.deviceId,
    );
    return service;
  }, [settings.jellyfin]);

  const tmdb = useMemo(() => {
    // TMDB is always available with hardcoded API key
    return new TMDBService();
  }, []);

  const sonarr = useMemo(() => {
    // Mediora-server mode: a single mediora-server instance speaks both the Sonarr v3
    // and Radarr v3 APIs, so both services point at the same URL + API key.
    if (settings.backendMode === 'mediarr-server' && settings.mediarrServer) {
      console.log('[ServicesContext] Using mediora-server backend for Sonarr');
      return new SonarrService(
        settings.mediarrServer.serverUrl,
        settings.mediarrServer.apiKey,
      );
    }
    // In dev mode, use env config if available and no user settings
    if (__DEV__ && !settings.sonarr && DEV_CONFIG.sonarr.url && DEV_CONFIG.sonarr.apiKey) {
      console.log('[ServicesContext] Using dev config for Sonarr');
      return new SonarrService(
        DEV_CONFIG.sonarr.url,
        DEV_CONFIG.sonarr.apiKey,
      );
    }
    if (!settings.sonarr) return null;
    return new SonarrService(
      settings.sonarr.serverUrl,
      settings.sonarr.apiKey,
    );
  }, [settings.backendMode, settings.mediarrServer, settings.sonarr]);

  const radarr = useMemo(() => {
    // Mediora-server mode: a single mediora-server instance speaks both the Sonarr v3
    // and Radarr v3 APIs, so both services point at the same URL + API key.
    if (settings.backendMode === 'mediarr-server' && settings.mediarrServer) {
      console.log('[ServicesContext] Using mediora-server backend for Radarr');
      return new RadarrService(
        settings.mediarrServer.serverUrl,
        settings.mediarrServer.apiKey,
      );
    }
    // In dev mode, use env config if available and no user settings
    if (__DEV__ && !settings.radarr && DEV_CONFIG.radarr.url && DEV_CONFIG.radarr.apiKey) {
      console.log('[ServicesContext] Using dev config for Radarr');
      return new RadarrService(
        DEV_CONFIG.radarr.url,
        DEV_CONFIG.radarr.apiKey,
      );
    }
    if (!settings.radarr) return null;
    return new RadarrService(
      settings.radarr.serverUrl,
      settings.radarr.apiKey,
    );
  }, [settings.backendMode, settings.mediarrServer, settings.radarr]);

  const localMedia = useMemo(() => {
    if (!settings.localFiles?.directories || settings.localFiles.directories.length === 0) {
      return null;
    }
    console.log('[ServicesContext] Creating LocalMediaService with', settings.localFiles.directories.length, 'directories');
    return new LocalMediaService(settings.localFiles.directories);
  }, [settings.localFiles?.directories]);

  // Verified reachability, not just settings presence. Starts 'unknown' so
  // first paint isn't blocked; flips to reachable/unreachable after a real
  // request. 401 / network failure => 'unreachable' so screens show
  // "reconnect" instead of spamming failing polls.
  const [connectionStatus, setConnectionStatus] = useState<{
    jellyfin: ConnectionStatus;
    sonarr: ConnectionStatus;
    radarr: ConnectionStatus;
  }>({ jellyfin: 'unknown', sonarr: 'unknown', radarr: 'unknown' });
  const [statusEpoch, setStatusEpoch] = useState(0);

  const refreshConnections = useCallback(() => {
    setConnectionStatus({ jellyfin: 'unknown', sonarr: 'unknown', radarr: 'unknown' });
    setStatusEpoch(epoch => epoch + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Reset to unknown whenever the underlying service instance changes.
    setConnectionStatus({ jellyfin: 'unknown', sonarr: 'unknown', radarr: 'unknown' });

    const check = async () => {
      const [jellyfinResult, sonarrResult, radarrResult] = await Promise.all([
        (async (): Promise<ConnectionStatus> => {
          if (!jellyfin) return 'unknown';
          try {
            await jellyfin.getCurrentUser();
            return 'reachable';
          } catch {
            return 'unreachable';
          }
        })(),
        (async (): Promise<ConnectionStatus> => {
          if (!sonarr) return 'unknown';
          try {
            return (await sonarr.testConnection()) ? 'reachable' : 'unreachable';
          } catch {
            return 'unreachable';
          }
        })(),
        (async (): Promise<ConnectionStatus> => {
          if (!radarr) return 'unknown';
          try {
            return (await radarr.testConnection()) ? 'reachable' : 'unreachable';
          } catch {
            return 'unreachable';
          }
        })(),
      ]);

      if (!cancelled) {
        setConnectionStatus({
          jellyfin: jellyfinResult,
          sonarr: sonarrResult,
          radarr: radarrResult,
        });
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
    // statusEpoch allows manual refresh; service identities trigger re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jellyfin, sonarr, radarr, statusEpoch]);

  return (
    <ServicesContext.Provider
      value={{
        jellyfin,
        tmdb,
        sonarr,
        radarr,
        localMedia,
        isJellyfinConnected: !!jellyfin && connectionStatus.jellyfin !== 'unreachable',
        isTMDBConnected: !!tmdb,
        isSonarrConnected: !!sonarr && connectionStatus.sonarr !== 'unreachable',
        isRadarrConnected: !!radarr && connectionStatus.radarr !== 'unreachable',
        isLocalFilesEnabled: !!localMedia,
        connectionStatus,
        refreshConnections,
      }}>
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices() {
  const context = useContext(ServicesContext);
  if (context === undefined) {
    throw new Error('useServices must be used within a ServicesProvider');
  }
  return context;
}
