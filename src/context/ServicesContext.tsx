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
} from '../services';

interface ServicesContextType {
  jellyfin: JellyfinService | null;
  tmdb: TMDBService | null;
  sonarr: SonarrService | null;
  radarr: RadarrService | null;
  isJellyfinConnected: boolean;
  isTMDBConnected: boolean;
  isSonarrConnected: boolean;
  isRadarrConnected: boolean;
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
    );
    return service;
  }, [settings.jellyfin]);

  const tmdb = useMemo(() => {
    // TMDB is always available with hardcoded API key
    return new TMDBService();
  }, []);

  const sonarr = useMemo(() => {
    if (!settings.sonarr) return null;
    return new SonarrService(
      settings.sonarr.serverUrl,
      settings.sonarr.apiKey,
    );
  }, [settings.sonarr]);

  const radarr = useMemo(() => {
    if (!settings.radarr) return null;
    return new RadarrService(
      settings.radarr.serverUrl,
      settings.radarr.apiKey,
    );
  }, [settings.radarr]);

  return (
    <ServicesContext.Provider
      value={{
        jellyfin,
        tmdb,
        sonarr,
        radarr,
        isJellyfinConnected: !!jellyfin,
        isTMDBConnected: !!tmdb,
        isSonarrConnected: !!sonarr,
        isRadarrConnected: !!radarr,
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
