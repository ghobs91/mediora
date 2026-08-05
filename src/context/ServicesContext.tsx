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
  }, [settings.sonarr]);

  const radarr = useMemo(() => {
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
  }, [settings.radarr]);

  const localMedia = useMemo(() => {
    if (!settings.localFiles?.directories || settings.localFiles.directories.length === 0) {
      return null;
    }
    console.log('[ServicesContext] Creating LocalMediaService with', settings.localFiles.directories.length, 'directories');
    return new LocalMediaService(settings.localFiles.directories);
  }, [settings.localFiles?.directories]);

  return (
    <ServicesContext.Provider
      value={{
        jellyfin,
        tmdb,
        sonarr,
        radarr,
        localMedia,
        isJellyfinConnected: !!jellyfin,
        isTMDBConnected: !!tmdb,
        isSonarrConnected: !!sonarr,
        isRadarrConnected: !!radarr,
        isLocalFilesEnabled: !!localMedia,
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
