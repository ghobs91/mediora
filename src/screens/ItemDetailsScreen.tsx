import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, Text, Image, useWindowDimensions, TouchableOpacity, FlatList, Alert, ImageBackground, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useRoute, useNavigation, RouteProp, useIsFocused } from '@react-navigation/native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import { useServices, useSettings } from '../context';
import { FocusableButton, LoadingScreen, CastList } from '../components';
import { RootStackParamList, JellyfinItem, TMDBTVDetails, TMDBEpisode, TMDBCast, TMDBMovieDetails, SonarrEpisode, SonarrQueueItem } from '../types';
import { TMDBService } from '../services/tmdb';

type ItemDetailsRouteProp = RouteProp<RootStackParamList, 'ItemDetails'>;

interface EnrichedEpisode extends TMDBEpisode {
  jellyfinItem?: JellyfinItem;
  isAvailable: boolean;
  sonarrEpisode?: SonarrEpisode;
  hasFile?: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
}

interface EnrichedSeason {
  seasonNumber: number;
  name: string;
  posterPath: string | null;
  episodeCount: number;
  episodes: EnrichedEpisode[];
  isFullyAvailable: boolean;
  hasInLibrary: boolean;
}

export function ItemDetailsScreen() {
  const route = useRoute<ItemDetailsRouteProp>();
  const navigation = useNavigation();
  const { jellyfin, tmdb, sonarr, isSonarrConnected } = useServices();
  const { settings } = useSettings();
  const { item: initialItem } = route.params;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Responsive values
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;
  const backdropHeight = isMobile ? windowHeight * 0.5 : windowHeight * 0.7;
  const logoWidth = isMobile ? Math.min(windowWidth * 0.7, 300) : 400;
  const episodeWidth = Math.max(windowWidth * 0.25, 240);
  const episodeHeight = (episodeWidth * 9) / 16;
  
  // Responsive text sizes
  const metaTextSize = isMobile ? 14 : (isTablet ? 18 : 22);
  const overviewTextSize = isMobile ? 14 : (isTablet ? 16 : 18);
  const overviewLineHeight = isMobile ? 20 : (isTablet ? 24 : 26);
  const overviewMargin = isMobile ? 20 : 30;

  // State
  const [seriesItem, setSeriesItem] = useState<JellyfinItem | null>(initialItem.Type === 'Series' ? initialItem : null);
  const [tmdbDetails, setTmdbDetails] = useState<TMDBTVDetails | null>(null);
  const [movieDetails, setMovieDetails] = useState<TMDBMovieDetails | null>(null);
  const [enrichedSeasons, setEnrichedSeasons] = useState<EnrichedSeason[]>([]);

  // Selection State
  const [selectedSeason, setSelectedSeason] = useState<EnrichedSeason | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<EnrichedEpisode | null>(null);

  // Data State
  const [jellyfinEpisodes, setJellyfinEpisodes] = useState<JellyfinItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [cast, setCast] = useState<TMDBCast[]>([]);
  const [tvLogoUrl, setTvLogoUrl] = useState<string | null>(null);
  
  // Sonarr State
  const [sonarrEpisodes, setSonarrEpisodes] = useState<SonarrEpisode[]>([]);
  const [sonarrSeriesId, setSonarrSeriesId] = useState<number | null>(null);
  const [sonarrQueue, setSonarrQueue] = useState<SonarrQueueItem[]>([]);
  const currentSeasonRef = useRef<number | null>(null);
  const lastSonarrUpdateRef = useRef<string>(''); // Track last Sonarr data version to prevent infinite loops
  const isFocused = useIsFocused(); // Track if screen is focused to pause polling when navigated away

  const isMovie = initialItem.Type === 'Movie';
  const isSeriesOrEpisode = initialItem.Type === 'Series' || initialItem.Type === 'Episode';

  // Derived
  const backdropUrl = jellyfin?.getImageUrl?.(initialItem.Id, 'Backdrop', { maxWidth: 1920 }) ?? null;
  const spacing = Platform.isTV ? 48 : 24;

  // Initialize
  useEffect(() => {
    init();
  }, [initialItem]);

  const init = async () => {
    setIsLoading(true);
    try {
      if (isMovie) {
        // Handle Movie
        if (tmdb && initialItem.ProviderIds?.Tmdb) {
          const details = await tmdb.getMovieDetails(parseInt(initialItem.ProviderIds.Tmdb));
          setMovieDetails(details);
          if (details.credits?.cast) {
            setCast(details.credits.cast);
          }
        }
      } else if (isSeriesOrEpisode) {
        // Handle Series/Episode
        let currentSeries = seriesItem;

        // If passed item is an Episode, fetch Series first
        if (initialItem.Type === 'Episode') {
          if (initialItem.SeriesId && jellyfin) {
            currentSeries = await jellyfin.getItem(initialItem.SeriesId);
            setSeriesItem(currentSeries);
          }
        }

        if (currentSeries && tmdb) {
          let tmdbId = currentSeries.ProviderIds?.Tmdb ? parseInt(currentSeries.ProviderIds.Tmdb) : undefined;

          // If no TMDB ID but we have TVDB ID, try to find it
          if (!tmdbId && currentSeries.ProviderIds?.Tvdb) {
            try {
              const found = await tmdb.findByExternalId(currentSeries.ProviderIds.Tvdb, 'tvdb_id');
              const show = found.results.find(r => r.media_type === 'tv');
              if (show) tmdbId = show.id;
            } catch (e) {
              console.warn('Failed to resolve TMDB ID from TVDB ID', e);
            }
          }

          // If still no TMDB ID, try search by name + year
          if (!tmdbId) {
            try {
              const searchResults = await tmdb.searchTV(currentSeries.Name);
              if (searchResults.results.length > 0) {
                let match = searchResults.results[0];

                // If we have a year, try to find exact year match
                if (currentSeries.ProductionYear) {
                  const yearMatch = searchResults.results.find(r =>
                    r.first_air_date?.startsWith(String(currentSeries.ProductionYear))
                  );
                  if (yearMatch) match = yearMatch;
                }

                console.log(`[ItemDetails] Matched "${currentSeries.Name}" to TMDB ID: ${match.id}`);
                tmdbId = match.id;
              }
            } catch (e) {
              console.warn('Failed to resolve TMDB ID by name search', e);
            }
          }

          if (tmdbId) {
            // Fetch Jellyfin Episodes for availability
            let allEpisodes: JellyfinItem[] = [];
            if (jellyfin) {
              allEpisodes = await jellyfin.getEpisodes(currentSeries.Id);
              setJellyfinEpisodes(allEpisodes);
            }

            // Fetch TMDB Details
            const details = await tmdb.getTVDetails(tmdbId);
            setTmdbDetails(details);

            // Fetch TV logos from TMDB images
            try {
              const images = await tmdb.getTVImages(tmdbId);
              if (images.logos && images.logos.length > 0) {
                // Prefer English logos, or use the first available
                const englishLogo = images.logos.find(logo => logo.iso_639_1 === 'en');
                const selectedLogo = englishLogo || images.logos[0];
                const logoUrl = TMDBService.getLogoUrl(selectedLogo.file_path, 'w500');
                setTvLogoUrl(logoUrl);
              }
            } catch (e) {
              console.warn('Failed to fetch TV logos', e);
            }

            // Helper to load seasons structure
            const seasons: EnrichedSeason[] = details.seasons
              .filter(s => s.season_number > 0 && s.episode_count > 0)
              .map(s => {
                const hasInLibrary = allEpisodes.some(ep => ep.ParentIndexNumber === s.season_number);
                return {
                  seasonNumber: s.season_number,
                  name: s.name,
                  posterPath: s.poster_path,
                  episodeCount: s.episode_count,
                  episodes: [],
                  isFullyAvailable: false,
                  hasInLibrary,
                };
              });

            setEnrichedSeasons(seasons);
            if (details.credits?.cast) {
              setCast(details.credits.cast);
            }

            // Determine Initial Selection
            if (initialItem.Type === 'Episode') {
              const seasonNum = initialItem.ParentIndexNumber || 1;
              const seasonToSelect = seasons.find(s => s.seasonNumber === seasonNum) || seasons[0];
              if (seasonToSelect) {
                await loadSeasonEpisodes(seasonToSelect, tmdbId, allEpisodes || []);
              }
            } else {
              if (seasons.length > 0) {
                await loadSeasonEpisodes(seasons[0], tmdbId, allEpisodes || []);
              }
            }
          } else if (jellyfin) {
            // Fallback to Jellyfin-only logic (existing code path will follow in next block implicitly if I structure this right, 
            // but here I am inside the if(tmdbId) block. 
            // FAKE ELSE to trigger fallback if TMDB resolution failed?
            // Actually, I can just let the original "else if" handle it if I restructure slightly.
            // But simpler to just copy the fallback logic here or do a "resolvedTmdb = false" flag.
            // Let's stick to the current flow but update the conditions.
            // Wait, I can't easily jump to the existing "else if" from here without duplicating.
            // Let's use the efficient approach.
            throw new Error("TMDB Resolution Failed, fallback to local");
          }
        }
      }
    } catch (e) {
      console.log("Using local fallback due to:", e);
      // Fallback logic for Series/Episode if TMDB fails or isn't present
      if (initialItem.Type !== 'Movie' && (seriesItem || initialItem) && jellyfin) {
        // ... (Logic from lines 126-177)
        // I'll need to include the fallback logic here since I'm replacing the whole block
        const targetSeries = seriesItem || (initialItem.Type === 'Series' ? initialItem : null);
        if (targetSeries) {
          const allEpisodes = await jellyfin.getEpisodes(targetSeries.Id);
          setJellyfinEpisodes(allEpisodes);

          const seasonsMap = new Map<number, EnrichedSeason>();
          allEpisodes.forEach(ep => {
            const seasonNum = ep.ParentIndexNumber || 1;
            if (!seasonsMap.has(seasonNum)) {
              seasonsMap.set(seasonNum, {
                seasonNumber: seasonNum,
                name: ep.SeasonName || `Season ${seasonNum}`,
                posterPath: null,
                episodeCount: 0,
                episodes: [],
                isFullyAvailable: true,
                hasInLibrary: true,
              });
            }
            const season = seasonsMap.get(seasonNum)!;
            season.episodeCount++;
            season.episodes.push({
              id: parseInt(ep.Id.replace(/[^0-9]/g, '').substring(0, 9)) || Math.floor(Math.random() * 100000),
              name: ep.Name,
              episode_number: ep.IndexNumber || 0,
              season_number: seasonNum,
              overview: ep.Overview || '',
              still_path: null,
              air_date: ep.ProductionYear ? `${ep.ProductionYear}-01-01` : null,
              vote_average: ep.CommunityRating || 0,
              vote_count: 0,
              production_code: '',
              runtime: ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / 10000000 / 60) : 0,
              jellyfinItem: ep,
              isAvailable: true,
            });
          });

          const seasons = Array.from(seasonsMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber);
          setEnrichedSeasons(seasons);
          if (seasons.length > 0) setSelectedSeason(seasons[0]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && initialItem.Type === 'Episode' && selectedSeason && selectedSeason.episodes.length > 0 && !selectedEpisode) {
      const ep = selectedSeason.episodes.find(e => e.episode_number === initialItem.IndexNumber);
      if (ep) setSelectedEpisode(ep);
    }
  }, [isLoading, selectedSeason, initialItem]);

  const loadSeasonEpisodes = useCallback(async (season: EnrichedSeason, tmdbId: number, jfEpisodes: JellyfinItem[]) => {
    if (!tmdb) return;

    try {
      const seasonDetails = await tmdb.getSeasonDetails(tmdbId, season.seasonNumber);

      const enrichedEpisodes: EnrichedEpisode[] = seasonDetails.episodes.map(tmdbEp => {
        const jellyfinEp = jfEpisodes.find(
          jfEp => jfEp.ParentIndexNumber === season.seasonNumber && jfEp.IndexNumber === tmdbEp.episode_number
        );
        
        // Find Sonarr episode data
        const sonarrEp = sonarrEpisodes.find(
          sEp => sEp.seasonNumber === season.seasonNumber && sEp.episodeNumber === tmdbEp.episode_number
        );
        
        // Check if episode is downloading
        const queueItem = sonarrQueue.find(
          q => q.episodeId === sonarrEp?.id
        );

        // Calculate download progress safely
        const downloadProgress = queueItem && queueItem.size > 0
          ? Math.max(0, Math.min(1, (queueItem.size - queueItem.sizeleft) / queueItem.size))
          : undefined;

        // Debug logging for images
        console.log(`[ItemDetails] Episode S${season.seasonNumber}E${tmdbEp.episode_number} - ${tmdbEp.name}:`, {
          still_path: tmdbEp.still_path,
          hasImage: !!tmdbEp.still_path,
          fullImageUrl: tmdbEp.still_path ? `https://image.tmdb.org/t/p/w780${tmdbEp.still_path}` : null,
        });
        
        return {
          ...tmdbEp,
          jellyfinItem: jellyfinEp,
          isAvailable: !!jellyfinEp,
          sonarrEpisode: sonarrEp,
          hasFile: sonarrEp?.hasFile || false,
          isDownloading: !!queueItem,
          downloadProgress: downloadProgress,
        };
      });

      const updatedSeason = {
        ...season,
        episodes: enrichedEpisodes,
        isFullyAvailable: enrichedEpisodes.every(e => e.isAvailable),
      };

      setEnrichedSeasons(prev => prev.map(s => s.seasonNumber === season.seasonNumber ? updatedSeason : s));
      setSelectedSeason(updatedSeason);

    } catch (e) {
      console.error("Failed to load season details", e);
    }
  }, [tmdb, sonarrEpisodes, sonarrQueue]);

  const handleSeasonSelect = async (season: EnrichedSeason) => {
    setSelectedSeason(season);

    // Always reload season to get fresh Sonarr download status
    if (season.episodes.length === 0 || sonarrEpisodes.length > 0) {
      if (tmdbDetails?.id) {
        await loadSeasonEpisodes(season, tmdbDetails.id, jellyfinEpisodes);
      } else if (seriesItem?.ProviderIds?.Tmdb) {
        await loadSeasonEpisodes(season, parseInt(seriesItem.ProviderIds.Tmdb), jellyfinEpisodes);
      }
    }
  };

  const handleEpisodeSelect = (episode: EnrichedEpisode) => {
    setSelectedEpisode(episode);
  };

  const handleToggleWatched = async () => {
    if (!jellyfin || !selectedEpisode || !selectedEpisode.jellyfinItem) return;

    try {
      const isPlayed = selectedEpisode.jellyfinItem.UserData?.Played;
      let success = false;

      if (isPlayed) {
        // Just mark this one as unplayed
        success = await jellyfin.markUnplayed(selectedEpisode.jellyfinItem.Id);
        if (success) {
          updateLocalWatchedStatus([{ id: selectedEpisode.jellyfinItem.Id, isPlayed: false }]);
        }
      } else {
        // Mark this one AND all preceding episodes as played
        const currentSeason = selectedEpisode.season_number;
        const currentEpisode = selectedEpisode.episode_number;

        const episodesToMark = jellyfinEpisodes.filter(ep => {
          const s = ep.ParentIndexNumber || 0;
          const e = ep.IndexNumber || 0;

          // Preceding: earlier season OR same season, earlier episode
          const isPreceding = s < currentSeason || (s === currentSeason && e <= currentEpisode);
          return isPreceding && !ep.UserData?.Played;
        });

        // Batch mark as played
        const results = await Promise.all(episodesToMark.map(ep => jellyfin.markPlayed(ep.Id)));
        success = results.some(r => r); // At least one succeeded (or technically we hope all did)

        if (success) {
          const updates = episodesToMark.map((ep, index) => ({
            id: ep.Id,
            isPlayed: results[index]
          })).filter(u => u.isPlayed);

          updateLocalWatchedStatus(updates);
        }
      }
    } catch (e) {
      console.error("Failed to toggle watched status", e);
      Alert.alert("Error", "Failed to update watched status");
    }
  };

  const updateLocalWatchedStatus = (updates: { id: string, isPlayed: boolean }[]) => {
    const updateMap = new Map(updates.map(u => [u.id, u.isPlayed]));

    // Update jellyfinEpisodes list
    const updatedJfEpisodes = jellyfinEpisodes.map(ep => {
      if (updateMap.has(ep.Id)) {
        return {
          ...ep,
          UserData: {
            ...ep.UserData,
            Played: updateMap.get(ep.Id)!,
            PlaybackPositionTicks: updateMap.get(ep.Id) ? 0 : ep.UserData?.PlaybackPositionTicks || 0
          }
        };
      }
      return ep;
    });
    setJellyfinEpisodes(updatedJfEpisodes);

    // Update selectedEpisode if it's in the updates
    if (selectedEpisode?.jellyfinItem && updateMap.has(selectedEpisode.jellyfinItem.Id)) {
      setSelectedEpisode({
        ...selectedEpisode,
        jellyfinItem: {
          ...selectedEpisode.jellyfinItem,
          UserData: {
            ...selectedEpisode.jellyfinItem.UserData,
            Played: updateMap.get(selectedEpisode.jellyfinItem.Id)!,
            PlaybackPositionTicks: updateMap.get(selectedEpisode.jellyfinItem.Id) ? 0 : selectedEpisode.jellyfinItem.UserData?.PlaybackPositionTicks || 0
          }
        }
      });
    }

    // Update enrichedSeasons and selectedSeason
    setEnrichedSeasons(prevSeasons => prevSeasons.map(season => {
      let seasonUpdated = false;
      const updatedEpisodes = season.episodes.map(ep => {
        if (ep.jellyfinItem && updateMap.has(ep.jellyfinItem.Id)) {
          seasonUpdated = true;
          return {
            ...ep,
            jellyfinItem: {
              ...ep.jellyfinItem,
              UserData: {
                ...ep.jellyfinItem.UserData,
                Played: updateMap.get(ep.jellyfinItem.Id)!,
                PlaybackPositionTicks: updateMap.get(ep.jellyfinItem.Id) ? 0 : ep.jellyfinItem.UserData?.PlaybackPositionTicks || 0
              }
            }
          };
        }
        return ep;
      });

      if (seasonUpdated) {
        const newSeason = { ...season, episodes: updatedEpisodes };
        if (selectedSeason?.seasonNumber === season.seasonNumber) {
          setSelectedSeason(newSeason);
        }
        return newSeason;
      }
      return season;
    }));
  };

  const handlePlay = async () => {
    let targetId = initialItem.Id; // Default to initial Item (works for Movie or specific Episode passed)

    if (selectedEpisode) {
      // If in Jellyfin, play from Jellyfin
      if (selectedEpisode.jellyfinItem) {
        targetId = selectedEpisode.jellyfinItem.Id;
      }
      // If file exists in Sonarr but not in Jellyfin, try to find it
      else if (selectedEpisode.hasFile && jellyfin && seriesItem) {
        try {
          // Refresh Jellyfin library to pick up new files
          Alert.alert('Syncing Library', 'Checking Jellyfin for new episodes...');
          
          // Fetch fresh episode list from Jellyfin
          const freshEpisodes = await jellyfin.getEpisodes(seriesItem.Id);
          const foundEp = freshEpisodes.find(
            ep => ep.ParentIndexNumber === selectedEpisode.season_number && 
                  ep.IndexNumber === selectedEpisode.episode_number
          );
          
          if (foundEp) {
            // Found it! Play it
            targetId = foundEp.Id;
          } else {
            Alert.alert(
              'File Not Yet Scanned',
              'Episode file exists in Sonarr but hasn\'t been scanned by Jellyfin yet. Please wait for Jellyfin to scan the library.'
            );
            return;
          }
        } catch (e) {
          console.error('Failed to refresh episode list:', e);
        }
      }
      // Not available at all
      else if (!selectedEpisode.isAvailable && !selectedEpisode.hasFile) {
        if (selectedSeason) handleRequestSeason(selectedSeason.seasonNumber);
        return;
      }
    }

    // @ts-ignore
    navigation.navigate('Player', { itemId: targetId });
  };

  const handleRequestSeason = async (seasonNumber: number) => {
    if (!sonarr || !isSonarrConnected) {
      Alert.alert('Sonarr Not Connected', 'Please configure Sonarr in Settings.');
      return;
    }

    const tvdbId = seriesItem?.ProviderIds?.Tvdb
      ? parseInt(seriesItem.ProviderIds.Tvdb)
      : tmdbDetails?.external_ids?.tvdb_id;

    if (!tvdbId) {
      Alert.alert('Details Missing', 'Cannot identify series (TVDB ID missing).');
      return;
    }

    try {
      Alert.alert('Checking Sonarr', 'Communicating with Sonarr...');

      const sonarrSeries = await sonarr.checkSeriesExists(tvdbId);

      if (sonarrSeries && sonarrSeries.id) {
        // Series Exists - Monitor and Search
        await sonarr.updateSeasonMonitoring(sonarrSeries.id, seasonNumber, true);
        await sonarr.searchForSeason(sonarrSeries.id, seasonNumber);
        Alert.alert('Request Sent', `Monitoring & Searching for Season ${seasonNumber}`);
      } else {
        // Series Missing - Add and Search
        if (!settings?.sonarr?.rootFolderPath || !settings?.sonarr?.qualityProfileId) {
          Alert.alert('Configuration Missing', 'Please set Root Folder and Quality Profile in Settings -> Sonarr');
          return;
        }

        const seriesTitle = tmdbDetails?.name || seriesItem?.Name || 'Unknown Series';

        // Construct minimal SonarrSeries object
        const newSeries: any = {
          title: seriesTitle,
          tvdbId: tvdbId,
          titleSlug: seriesTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          images: [],
          seasons: [], // Sonarr will fill this
        };

        await sonarr.addSeriesWithSeasons(newSeries, {
          rootFolderPath: settings.sonarr.rootFolderPath,
          qualityProfileId: settings.sonarr.qualityProfileId,
          monitored: true,
          seasonFolder: true,
          searchForMissingEpisodes: true,
          monitoredSeasons: [seasonNumber]
        });

        Alert.alert('Series Added', `${seriesTitle} added to Sonarr. Searching for Season ${seasonNumber}...`);
      }
    } catch (e) {
      console.error("Sonarr request failed", e);
      Alert.alert('Request Failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  // State for Sonarr Progress
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    sizeLeft: number;
    timeLeft: string;
    status: string;
  } | null>(null);

  // Fetch Sonarr data and poll for progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const loadSonarrData = async () => {
      // Get TVDB ID from either Jellyfin or TMDB
      const tvdbId = seriesItem?.ProviderIds?.Tvdb 
        ? parseInt(seriesItem.ProviderIds.Tvdb)
        : tmdbDetails?.external_ids?.tvdb_id;
      
      console.log('[ItemDetails] loadSonarrData called:', {
        hasSonarr: !!sonarr,
        isSonarrConnected,
        hasSeriesItem: !!seriesItem,
        hasTmdbDetails: !!tmdbDetails,
        tvdbIdFromJellyfin: seriesItem?.ProviderIds?.Tvdb,
        tvdbIdFromTMDB: tmdbDetails?.external_ids?.tvdb_id,
        tvdbId,
        seriesName: seriesItem?.Name,
      });
      
      if (!sonarr || !isSonarrConnected || !tvdbId) {
        console.log('[ItemDetails] Skipping Sonarr data load - missing requirements');
        return;
      }

      try {
        console.log('[ItemDetails] Looking up Sonarr series with TVDB ID:', tvdbId);
        const sonarrSeries = await sonarr.checkSeriesExists(tvdbId);
        
        console.log('[ItemDetails] Sonarr series lookup result:', sonarrSeries ? `Found: ${sonarrSeries.title}` : 'Not found');
        
        if (sonarrSeries?.id) {
          setSonarrSeriesId(sonarrSeries.id);
          
          // Fetch episodes
          const episodes = await sonarr.getEpisodesBySeriesId(sonarrSeries.id);
          setSonarrEpisodes(episodes);
          console.log(`[ItemDetails] Loaded ${episodes.length} Sonarr episodes for series ${sonarrSeries.title}`);
          
          // Fetch queue
          console.log(`[ItemDetails] Fetching queue for series ID ${sonarrSeries.id}...`);
          const queue = await sonarr.getQueueBySeriesId(sonarrSeries.id);
          setSonarrQueue(queue);
          console.log(`[ItemDetails] Loaded ${queue.length} queue items for series ${sonarrSeries.title}`);
          
          if (queue.length > 0) {
            queue.forEach(q => {
              console.log(`[ItemDetails] Queue item:`, {
                episodeId: q.episodeId,
                seriesId: q.seriesId,
                title: q.title,
                status: q.status,
                progress: ((q.size - q.sizeleft) / q.size * 100).toFixed(1) + '%',
                timeLeft: q.timeleft,
              });
            });
          } else {
            // Check if there are ANY queue items at all
            const fullQueue = await sonarr.getQueue();
            console.log(`[ItemDetails] Full queue has ${fullQueue.totalRecords} items total`);
            if (fullQueue.totalRecords > 0) {
              console.log(`[ItemDetails] All queue series IDs:`, fullQueue.records.map(q => q.seriesId));
              console.log(`[ItemDetails] Looking for series ID: ${sonarrSeries.id}`);
              console.log(`[ItemDetails] First 3 queue items:`, 
                fullQueue.records.slice(0, 3).map(q => ({
                  id: q.id,
                  seriesId: q.seriesId,
                  episodeId: q.episodeId,
                  title: q.title,
                  seriesTitle: q.series?.title,
                }))
              );
            }
          }

          // Aggregate progress for the overall series
          if (queue.length > 0) {
            const totalSize = queue.reduce((acc, item) => acc + item.size, 0);
            const totalLeft = queue.reduce((acc, item) => acc + item.sizeleft, 0);
            const percent = totalSize > 0 ? ((totalSize - totalLeft) / totalSize) * 100 : 0;

            setDownloadProgress({
              percent,
              sizeLeft: totalLeft,
              timeLeft: queue[0].timeleft,
              status: queue[0].status
            });
          } else {
            setDownloadProgress(null);
          }
        }
      } catch (e) {
        console.error('Failed to load Sonarr data:', e);
      }
    };

    console.log('[ItemDetails] Sonarr useEffect triggered:', {
      hasSonarr: !!sonarr,
      isSonarrConnected,
      hasSeriesItem: !!seriesItem,
      hasTmdbDetails: !!tmdbDetails,
      isFocused,
    });

    // Only poll Sonarr when the screen is focused (not when navigated to PlayerScreen)
    if (sonarr && isSonarrConnected && (seriesItem || tmdbDetails) && isFocused) {
      loadSonarrData();
      interval = setInterval(loadSonarrData, 10000); // Refresh every 10 seconds
    } else {
      console.log('[ItemDetails] Not loading Sonarr data - conditions not met');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sonarr, isSonarrConnected, seriesItem, tmdbDetails, isFocused]);
  
  // Track selected season number
  useEffect(() => {
    if (selectedSeason) {
      currentSeasonRef.current = selectedSeason.seasonNumber;
    }
  }, [selectedSeason]);
  
  // Reload season episodes when Sonarr data changes
  useEffect(() => {
    // Only reload if we have a selected season with episodes AND we have loaded Sonarr data
    const seasonNum = currentSeasonRef.current;
    if (!seasonNum || !tmdbDetails?.id || !selectedSeason) {
      return;
    }

    // Create a hash of the Sonarr data to detect actual changes
    const sonarrDataHash = JSON.stringify({
      episodeCount: sonarrEpisodes.length,
      queueCount: sonarrQueue.length,
      queueIds: sonarrQueue.map(q => q.episodeId).sort(),
    });

    // Only reload if the Sonarr data actually changed
    if (sonarrDataHash !== lastSonarrUpdateRef.current) {
      console.log(`[ItemDetails] Reloading season ${seasonNum} with updated Sonarr data`);
      lastSonarrUpdateRef.current = sonarrDataHash;
      loadSeasonEpisodes(selectedSeason, tmdbDetails.id, jellyfinEpisodes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonarrEpisodes, sonarrQueue, tmdbDetails, jellyfinEpisodes]);

  // ... (Init logic remains similar, mostly UI changes)

  // Render Helpers
  const renderEpisodeCard = ({ item }: { item: EnrichedEpisode }) => {
    const isSelected = selectedEpisode?.id === item.id;
    // Prioritize TMDB still image (episode thumbnail), fall back to season poster, then Jellyfin
    let imageUrl = item.still_path ? `https://image.tmdb.org/t/p/w780${item.still_path}` : null;
    
    // If no episode still, use season poster as fallback
    if (!imageUrl && selectedSeason?.posterPath) {
      imageUrl = `https://image.tmdb.org/t/p/w780${selectedSeason.posterPath}`;
    }
    
    // Final fallback to Jellyfin
    if (!imageUrl && item.jellyfinItem && jellyfin?.getImageUrl) {
      imageUrl = jellyfin.getImageUrl(item.jellyfinItem.Id, 'Primary', { maxWidth: 780 });
    }
    
    // Determine episode status
    const inJellyfin = !!item.jellyfinItem;
    const hasFileInSonarr = item.hasFile && !inJellyfin;
    const isDownloading = item.isDownloading;
    const canPlay = inJellyfin || hasFileInSonarr;

    // Debug: Log episode status
    if (isDownloading || hasFileInSonarr || (item.sonarrEpisode && !item.sonarrEpisode.hasFile)) {
      console.log(`[ItemDetails] Episode ${item.episode_number} - ${item.name}:`, {
        isDownloading,
        downloadProgress: item.downloadProgress,
        hasFileInSonarr,
        inJellyfin,
        hasSonarrEpisode: !!item.sonarrEpisode,
        sonarrHasFile: item.sonarrEpisode?.hasFile,
      });
    }

    return (
      <TouchableOpacity
        style={[
          styles.episodeCard,
          { width: episodeWidth },
          isSelected && styles.episodeCardSelected
        ]}
        onPress={() => handleEpisodeSelect(item)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.episodeImageContainer,
          { width: episodeWidth, height: episodeHeight }
        ]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.episodeThumbnail} />
          ) : (
            <View style={styles.episodePlaceholder}>
              <Icon name="tv-outline" size={30} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          
          {/* Download Progress Indicator - Simple Progress Bar */}
          {isDownloading && item.downloadProgress !== undefined && (
            <View style={styles.episodeDownloadProgressBar}>
              <View style={[styles.episodeDownloadProgressFill, { width: `${item.downloadProgress * 100}%` }]} />
            </View>
          )}
          
          {/* Play Button Overlay for Available Episodes */}
          {isSelected && canPlay && !isDownloading && (
            <View style={styles.playButtonOverlay}>
              <View style={styles.playButtonCircle}>
                <Icon name="play" size={48} color="#fff" />
              </View>
            </View>
          )}
          
          {/* Status Badges */}
          {item.jellyfinItem?.UserData?.Played && (
            <View style={styles.watchedIndicator}>
              <Icon name="checkmark-circle" size={24} color="#FFD700" />
            </View>
          )}
          
          {hasFileInSonarr && (
            <View style={styles.sonarrBadge}>
              <Icon name="cloud-done" size={16} color="#4caf50" />
            </View>
          )}
        </View>
        <View style={styles.episodeCardContent}>
          <Text style={styles.episodeCardTitle} numberOfLines={1}>
            {item.episode_number}. {item.name}
          </Text>
          <Text style={styles.episodeCardOverview} numberOfLines={2}>
            {item.overview}
          </Text>
          {hasFileInSonarr && (
            <Text style={styles.sonarrStatusText}>Available in Sonarr</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSeasonTab = (season: EnrichedSeason) => {
    const isSelected = selectedSeason?.seasonNumber === season.seasonNumber;
    const GlassWrapper = isLiquidGlassSupported ? LiquidGlassView : View;
    
    return (
      <TouchableOpacity
        key={season.seasonNumber}
        style={styles.seasonTabWrapper}
        onPress={() => handleSeasonSelect(season)}
      >
        <GlassWrapper
          style={[
            styles.seasonTab,
            isSelected && styles.seasonTabActive,
            !isLiquidGlassSupported && isSelected && { backgroundColor: 'rgba(255,255,255,0.2)' },
            !isLiquidGlassSupported && !isSelected && { backgroundColor: 'rgba(255,255,255,0.08)' },
          ]}
          {...(isLiquidGlassSupported && {
            effect: isSelected ? 'regular' : 'clear',
            tintColor: isSelected ? 'rgba(255, 215, 0, 0.2)' : undefined,
          })}
        >
          <Text style={[
            styles.seasonTabText,
            isSelected && styles.seasonTabTextActive
          ]}>
            {season.name}
          </Text>
        </GlassWrapper>
      </TouchableOpacity>
    );
  };



  if (isLoading) return <LoadingScreen message="Loading Details..." />;

  // Guard for "Not Found" - Allow if it's a Movie OR if it's a Series and we have seriesItem
  if (isSeriesOrEpisode && !seriesItem) return <View style={styles.container}><Text style={{ color: 'white' }}>Series Not Found</Text></View>;

  const getHeroImage = () => {
    if (selectedEpisode) {
      if (selectedEpisode.jellyfinItem && jellyfin?.getImageUrl) {
        return jellyfin.getImageUrl(selectedEpisode.jellyfinItem.Id, 'Primary', { maxWidth: 1920 });
      }
      if (selectedEpisode.still_path) {
        return `https://image.tmdb.org/t/p/original${selectedEpisode.still_path}`;
      }
    }
    return backdropUrl;
  };

  const heroImage = getHeroImage();

  let heroTitle = initialItem.Name;
  let heroSubtitle = '';
  let heroOverview = initialItem.Overview;
  let logoUrl: string | null = null;
  let tmdbScore: number | null = null;
  let imdbScore: number | null = null;
  let endsAtTime: string | null = null;
  let rating: string | null = null;
  let tagline: string | null = null;
  let director: string | null = null;
  let writer: string | null = null;
  let genres: string[] = [];
  let studios: string[] = [];

  if (isMovie) {
    heroTitle = movieDetails?.title || initialItem.Name;
    heroSubtitle = movieDetails ? `${new Date(movieDetails.release_date).getFullYear()} • ${movieDetails.runtime} min` : '';
    heroOverview = movieDetails?.overview || initialItem.Overview;

    // Logo
    if (initialItem.ImageTags?.Logo && jellyfin) {
      logoUrl = jellyfin.getImageUrl(initialItem.Id, 'Logo', { maxWidth: 500 });
    }

    // Scores
    tmdbScore = movieDetails?.vote_average || null;
    imdbScore = initialItem.CommunityRating || null;

    // Calculate "Ends at" time
    if (movieDetails?.runtime) {
      const now = new Date();
      const endTime = new Date(now.getTime() + movieDetails.runtime * 60000);
      endsAtTime = endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // Rating
    rating = initialItem.OfficialRating || null;

    // Tagline
    tagline = movieDetails?.tagline || null;

    // Director and Writer
    if (movieDetails?.credits?.crew) {
      const directorObj = movieDetails.credits.crew.find(c => c.job === 'Director');
      director = directorObj?.name || null;
      const writerObj = movieDetails.credits.crew.find(c => c.job === 'Writer' || c.job === 'Screenplay');
      writer = writerObj?.name || null;
    }

    // Genres
    genres = movieDetails?.genres?.map(g => g.name) || [];

    // Studios
    studios = movieDetails?.production_companies?.map(c => c.name) || [];
  } else {
    heroTitle = selectedEpisode ? selectedEpisode.name : (seriesItem?.SeriesName || seriesItem?.Name || '');
    heroSubtitle = selectedEpisode
      ? `S${selectedEpisode.season_number} • E${selectedEpisode.episode_number}`
      : (tmdbDetails ? `${tmdbDetails.number_of_seasons} Seasons` : '');
    heroOverview = selectedEpisode?.overview || seriesItem?.Overview;
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: heroImage || undefined }}
        style={[styles.backdrop, { width: windowWidth, height: backdropHeight }]}
        resizeMode="cover"
      >
        <View style={[styles.backdropOverlay, selectedEpisode && styles.backdropOverlayDimmed]} />
        <LinearGradient
          colors={[
            'rgba(0,0,0,0)',
            'rgba(0,0,0,0.3)',
            'rgba(15,5,25,0.8)',
            'rgba(15,5,25,0.95)',
            '#0f0519'
          ]}
          style={styles.gradientOverlay}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </ImageBackground>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.scrollContent, { paddingTop: backdropHeight * 0.5 }]}
        focusable={false}
      >
        <View style={[styles.heroContent, { paddingHorizontal: spacing }]}>
          {/* TV Series Logo - only when no episode selected */}
          {(isSeriesOrEpisode && seriesItem && !selectedEpisode && tvLogoUrl) && (
            <Image source={{ uri: tvLogoUrl }} style={[styles.logoImage, { width: logoWidth }]} resizeMode="contain" />
          )}

          {/* TV Series Title - only when no logo and no episode selected */}
          {(isSeriesOrEpisode && seriesItem && !selectedEpisode && !tvLogoUrl) && (
            <Text style={styles.seriesTitle}>{seriesItem.SeriesName || seriesItem.Name}</Text>
          )}

          {/* Movie Logo */}
          {(isMovie && logoUrl) && (
            <Image source={{ uri: logoUrl }} style={[styles.logoImage, { width: logoWidth }]} resizeMode="contain" />
          )}

          {/* Movie Title, Episode Title, or Series Title (when no logo) */}
          {((isMovie && !logoUrl) || selectedEpisode) && (
            <Text style={styles.heroTitle}>{heroTitle}</Text>
          )}

          <View style={styles.metaRow}>
            {rating && (
              isLiquidGlassSupported ? (
                <LiquidGlassView style={styles.ratingBadge} effect="clear">
                  <Text style={styles.ratingText}>{rating}</Text>
                </LiquidGlassView>
              ) : (
                <View style={[styles.ratingBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Text style={styles.ratingText}>{rating}</Text>
                </View>
              )
            )}
            <Text style={[styles.metaText, { fontSize: metaTextSize }]}>{heroSubtitle}</Text>
            {tmdbScore && (
              <View style={styles.scoreContainer}>
                <Icon name="star" size={16} color="#FFD700" />
                <Text style={styles.scoreText}>{tmdbScore.toFixed(1)}</Text>
              </View>
            )}
            {imdbScore && (
              <View style={styles.scoreContainer}>
                <Text style={styles.imdbLabel}>IMDb</Text>
                <Text style={styles.scoreText}>{imdbScore.toFixed(1)}</Text>
              </View>
            )}
            {endsAtTime && <Text style={styles.endsAtText}>Ends at {endsAtTime}</Text>}
          </View>

          {tagline && <Text style={styles.tagline}>{tagline}</Text>}

          <Text 
            style={[styles.overview, { 
              fontSize: overviewTextSize, 
              lineHeight: overviewLineHeight,
              marginBottom: overviewMargin 
            }]} 
            numberOfLines={4}
          >
            {heroOverview}
          </Text>

          <View style={styles.actionRow}>
            {/* Primary Action - Show Request button for unavailable episodes, Play for available */}
            {selectedEpisode && !selectedEpisode.isAvailable && !selectedEpisode.hasFile ? (
              <FocusableButton
                title={`Request Season ${selectedEpisode.season_number}`}
                onPress={() => handleRequestSeason(selectedEpisode.season_number)}
                style={styles.playButton}
                icon="download"
              />
            ) : (
              <FocusableButton
                title={
                  (selectedEpisode?.jellyfinItem?.UserData?.PlaybackPositionTicks || initialItem.UserData?.PlaybackPositionTicks)
                    ? "Resume" : "Play"
                }
                onPress={handlePlay}
                style={styles.playButton}
                icon="play"
                hasTVPreferredFocus={true}
              />
            )}

            {/* Mark as Watched Toggle - only for available episodes */}
            {selectedEpisode && selectedEpisode.jellyfinItem && (
              <FocusableButton
                title={selectedEpisode.jellyfinItem.UserData?.Played ? "Mark Unwatched" : "Mark Watched"}
                onPress={handleToggleWatched}
                variant="secondary"
                style={styles.actionButton}
                icon={selectedEpisode.jellyfinItem.UserData?.Played ? "eye-off-outline" : "eye-outline"}
              />
            )}

            {/* Request Missing Episodes for partially available seasons */}
            {selectedSeason && selectedSeason.hasInLibrary && !selectedSeason.isFullyAvailable && selectedEpisode?.isAvailable && (
              <FocusableButton
                title="Request Missing Episodes"
                onPress={() => handleRequestSeason(selectedSeason.seasonNumber)}
                variant="secondary"
                style={styles.actionButton}
                icon="download-outline"
              />
            )}

            <TouchableOpacity style={styles.circleButtonWrapper}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView style={styles.circleButton} effect="clear" interactive>
                  <Icon name="heart-outline" size={24} color="#fff" />
                </LiquidGlassView>
              ) : (
                <View style={styles.circleButton}>
                  <Icon name="heart-outline" size={24} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleButtonWrapper}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView style={styles.circleButton} effect="clear" interactive>
                  <Icon name="ellipsis-horizontal" size={24} color="#fff" />
                </LiquidGlassView>
              ) : (
                <View style={styles.circleButton}>
                  <Icon name="ellipsis-horizontal" size={24} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Download Progress Bar - Full Width */}
          {downloadProgress && (
            <View style={styles.downloadProgressSection}>
              <View style={styles.downloadProgressInfo}>
                <Text style={styles.downloadProgressTitle}>Downloading</Text>
                <Text style={styles.downloadProgressStats}>
                  {downloadProgress.percent.toFixed(1)}% • {downloadProgress.timeLeft} remaining
                </Text>
              </View>
              <View style={styles.downloadProgressBarContainer}>
                <View 
                  style={[
                    styles.downloadProgressBarFill, 
                    { width: `${downloadProgress.percent}%` }
                  ]} 
                />
              </View>
            </View>
          )}

          {/* Media Info */}
          {isMovie && initialItem.MediaSources && initialItem.MediaSources.length > 0 && (
            isLiquidGlassSupported ? (
              <LiquidGlassView style={styles.mediaInfoContainer} effect="clear">
                <View style={styles.mediaInfoRow}>
                  <Icon name="film-outline" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.mediaInfoLabel}>4K HEVC SDR</Text>
                </View>
                <View style={styles.mediaInfoRow}>
                  <Icon name="musical-notes-outline" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.mediaInfoLabel}>AAC - 5.1 - Stereo</Text>
                </View>
                <View style={styles.mediaInfoRow}>
                  <Icon name="text-outline" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.mediaInfoLabel}>English [CC] - 16 more</Text>
                </View>
              </LiquidGlassView>
            ) : (
              <View style={[styles.mediaInfoContainer, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                <View style={styles.mediaInfoRow}>
                  <Icon name="film-outline" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.mediaInfoLabel}>4K HEVC SDR</Text>
                </View>
                <View style={styles.mediaInfoRow}>
                  <Icon name="musical-notes-outline" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.mediaInfoLabel}>AAC - 5.1 - Stereo</Text>
                </View>
                <View style={styles.mediaInfoRow}>
                  <Icon name="text-outline" size={20} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.mediaInfoLabel}>English [CC] - 16 more</Text>
                </View>
              </View>
            )
          )}

          {/* Details Grid */}
          {isMovie && (genres.length > 0 || director || writer || studios.length > 0) && (
            isLiquidGlassSupported ? (
              <LiquidGlassView style={styles.detailsGrid} effect="clear">
                {genres.length > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Genres</Text>
                    <Text style={styles.detailValue}>{genres.join(', ')}</Text>
                  </View>
                )}
                {director && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Director</Text>
                    <Text style={styles.detailValue}>{director}</Text>
                  </View>
                )}
                {writer && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Writer</Text>
                    <Text style={styles.detailValue}>{writer}</Text>
                  </View>
                )}
                {studios.length > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Studios</Text>
                    <Text style={styles.detailValue}>{studios.slice(0, 2).join(', ')}</Text>
                  </View>
                )}
              </LiquidGlassView>
            ) : (
              <View style={[styles.detailsGrid, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                {genres.length > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Genres</Text>
                    <Text style={styles.detailValue}>{genres.join(', ')}</Text>
                  </View>
                )}
                {director && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Director</Text>
                    <Text style={styles.detailValue}>{director}</Text>
                  </View>
                )}
                {writer && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Writer</Text>
                    <Text style={styles.detailValue}>{writer}</Text>
                  </View>
                )}
                {studios.length > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Studios</Text>
                    <Text style={styles.detailValue}>{studios.slice(0, 2).join(', ')}</Text>
                  </View>
                )}
              </View>
            )
          )}

        </View>

        <View style={[styles.sectionsContainer, { paddingLeft: spacing }]}>
          {/* Season Selector */}
          {isSeriesOrEpisode && (
            <View style={styles.section}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonScroll} focusable={false}>
                {enrichedSeasons.map(renderSeasonTab)}
              </ScrollView>
            </View>
          )}

          {/* Episodes List */}
          {isSeriesOrEpisode && selectedSeason && (
            <View style={styles.section}>
              <FlatList
                data={selectedSeason.episodes}
                renderItem={renderEpisodeCard}
                keyExtractor={item => String(item.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.episodesList, { paddingRight: spacing }]}
              />
            </View>
          )}

          {/* Cast */}
          {cast.length > 0 && (
            <View style={styles.section}>
              <CastList cast={cast} />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0519' },
  backdrop: { position: 'absolute', top: 0, left: 0 },
  backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  backdropOverlayDimmed: { backgroundColor: 'rgba(0,0,0,0.5)' },
  gradientOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 400 },
  backButton: { position: 'absolute', top: 60, left: 40, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 50 },
  heroContent: { paddingHorizontal: 48, marginBottom: 40 },
  seriesTitle: { color: '#FFD700', fontSize: 24, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 36, fontWeight: '800', marginBottom: 12, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  metaText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginRight: 10 },
  overview: { color: 'rgba(255,255,255,0.7)', maxWidth: 700 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  playButton: { minWidth: 160 },
  downloadingButton: { minWidth: 160, opacity: 0.8 },
  actionButton: { minWidth: 160 },
  circleButtonWrapper: {},
  circleButton: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', shadowColor: 'rgba(0,0,0,0.3)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
  sectionsContainer: { paddingLeft: 48, backgroundColor: '#000', paddingTop: 20 },
  section: { marginBottom: 30 },
  seasonScroll: { flexDirection: 'row', marginBottom: 10 },
  seasonTabWrapper: { marginRight: 12 },
  seasonTab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  seasonTabActive: { borderColor: 'rgba(255, 215, 0, 0.6)', shadowColor: 'rgba(255, 215, 0, 0.8)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 16 },
  seasonTabText: { color: 'rgba(255,255,255,0.6)', fontSize: 20, fontWeight: '600' },
  seasonTabTextActive: { color: '#fff', fontWeight: '700' },
  seasonTabMissing: { opacity: 0.5 },
  seasonTabTextMissing: { color: 'rgba(255,255,255,0.5)' },
  episodesList: { paddingRight: 48 },
  episodeCard: { width: 300, marginRight: 16 },
  episodeCardMissing: { opacity: 0.5 },
  episodeCardSelected: { transform: [{ scale: 1.02 }] },
  episodeImageContainer: { width: 300, height: 169, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(30px)', overflow: 'hidden', marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  episodeImageMissing: { grayscale: 1 },
  episodeThumbnail: { width: '100%', height: '100%' },
  episodeThumbnailMissing: { opacity: 0.5 },
  episodePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  episodeCardContent: { paddingHorizontal: 4 },
  episodeCardTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 4 },
  episodeCardOverview: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
  textMissing: { color: 'rgba(255,255,255,0.4)' },
  progressContainer: { marginTop: 20, maxWidth: 500 },
  progressBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFD700' },
  progressText: { color: '#FFD700', fontSize: 12, fontWeight: '600' },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(20px)',
    borderRadius: 16,
    padding: 2,
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  episodeDownloadProgressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  episodeDownloadProgressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  downloadProgressSection: {
    marginTop: 20,
    maxWidth: 700,
    width: '100%',
  },
  downloadProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  downloadProgressTitle: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  downloadProgressStats: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
  },
  downloadProgressBarContainer: {
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  downloadProgressBarFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 6,
  },
  sonarrBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
    backdropFilter: 'blur(20px) saturate(180%)',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  sonarrStatusText: {
    color: '#4caf50',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
  },
  logoImage: {
    width: 400,
    height: 120,
    marginBottom: 16,
  },
  ratingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  ratingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    gap: 4,
  },
  scoreText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  imdbLabel: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 4,
  },
  endsAtText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    marginLeft: 10,
  },
  tagline: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 22,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  mediaInfoContainer: {
    marginTop: 24,
    marginBottom: 24,
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  mediaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mediaInfoLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
  },
  detailsGrid: {
    marginTop: 24,
    gap: 16,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    width: 120,
    fontWeight: '600',
  },
  detailValue: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    flex: 1,
  },
  debugContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  debugText: {
    color: '#4caf50',
    fontSize: 13,
    fontWeight: '600',
  },
});
