import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Text, Image, useWindowDimensions, TouchableOpacity, FlatList, Alert, ImageBackground, Platform } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useServices, useSettings } from '../context';
import { FocusableButton, LoadingScreen, CastList } from '../components';
import { RootStackParamList, JellyfinItem, TMDBTVDetails, TMDBEpisode, TMDBCast, TMDBMovieDetails, SonarrEpisode, SonarrQueueItem } from '../types';

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
  const backdropHeight = windowHeight * 0.7;
  const episodeWidth = Math.max(windowWidth * 0.25, 240);
  const episodeHeight = (episodeWidth * 9) / 16;

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
  
  // Sonarr State
  const [sonarrEpisodes, setSonarrEpisodes] = useState<SonarrEpisode[]>([]);
  const [sonarrSeriesId, setSonarrSeriesId] = useState<number | null>(null);
  const [sonarrQueue, setSonarrQueue] = useState<SonarrQueueItem[]>([]);

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

            // Helper to load seasons structure
            const seasons: EnrichedSeason[] = details.seasons
              .filter(s => s.season_number > 0)
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

  const loadSeasonEpisodes = async (season: EnrichedSeason, tmdbId: number, jfEpisodes: JellyfinItem[]) => {
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
        
        return {
          ...tmdbEp,
          jellyfinItem: jellyfinEp,
          isAvailable: !!jellyfinEp,
          sonarrEpisode: sonarrEp,
          hasFile: sonarrEp?.hasFile || false,
          isDownloading: !!queueItem,
          downloadProgress: queueItem ? (queueItem.size - queueItem.sizeleft) / queueItem.size : undefined,
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
  };

  const handleSeasonSelect = async (season: EnrichedSeason) => {
    setSelectedSeason(season);

    if (season.episodes.length === 0) {
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
      if (!sonarr || !isSonarrConnected || !seriesItem?.ProviderIds?.Tvdb) return;

      try {
        const tvdbId = parseInt(seriesItem.ProviderIds.Tvdb);
        const sonarrSeries = await sonarr.checkSeriesExists(tvdbId);
        
        if (sonarrSeries?.id) {
          setSonarrSeriesId(sonarrSeries.id);
          
          // Fetch episodes
          const episodes = await sonarr.getEpisodesBySeriesId(sonarrSeries.id);
          setSonarrEpisodes(episodes);
          
          // Fetch queue
          const queue = await sonarr.getQueueBySeriesId(sonarrSeries.id);
          setSonarrQueue(queue);

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

    if (sonarr && isSonarrConnected && seriesItem) {
      loadSonarrData();
      interval = setInterval(loadSonarrData, 10000); // Refresh every 10 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sonarr, isSonarrConnected, seriesItem]);
  
  // Reload season episodes when Sonarr data changes
  useEffect(() => {
    if (selectedSeason && tmdbDetails?.id && sonarrEpisodes.length > 0) {
      loadSeasonEpisodes(selectedSeason, tmdbDetails.id, jellyfinEpisodes);
    }
  }, [sonarrEpisodes, sonarrQueue]);

  // ... (Init logic remains similar, mostly UI changes)

  // Render Helpers
  const renderEpisodeCard = ({ item }: { item: EnrichedEpisode }) => {
    const isSelected = selectedEpisode?.id === item.id;
    let imageUrl = item.still_path ? `https://image.tmdb.org/t/p/w300${item.still_path}` : null;
    if (!imageUrl && item.jellyfinItem && jellyfin?.getImageUrl) {
      imageUrl = jellyfin.getImageUrl(item.jellyfinItem.Id, 'Primary', { maxWidth: 320 });
    }
    
    // Determine episode status
    const inJellyfin = !!item.jellyfinItem;
    const hasFileInSonarr = item.hasFile && !inJellyfin;
    const isDownloading = item.isDownloading;
    const canPlay = inJellyfin || hasFileInSonarr;

    return (
      <TouchableOpacity
        style={[
          styles.episodeCard,
          { width: episodeWidth },
          isSelected && styles.episodeCardSelected,
          !canPlay && !isDownloading && styles.episodeCardMissing
        ]}
        onPress={() => handleEpisodeSelect(item)}
        activeOpacity={0.7}
      >
        <View style={[
          styles.episodeImageContainer,
          { width: episodeWidth, height: episodeHeight },
          !canPlay && !isDownloading && styles.episodeImageMissing
        ]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={[styles.episodeThumbnail, !canPlay && !isDownloading && styles.episodeThumbnailMissing]} />
          ) : (
            <View style={styles.episodePlaceholder}>
              <Icon name="tv-outline" size={30} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          
          {/* Download Progress Indicator */}
          {isDownloading && item.downloadProgress !== undefined && (
            <View style={styles.episodeDownloadOverlay}>
              <View style={styles.episodeProgressBar}>
                <View style={[styles.episodeProgressFill, { width: `${item.downloadProgress * 100}%` }]} />
              </View>
              <Text style={styles.episodeDownloadText}>
                {Math.round(item.downloadProgress * 100)}%
              </Text>
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
          <Text style={[styles.episodeCardTitle, !canPlay && !isDownloading && styles.textMissing]} numberOfLines={1}>
            {item.episode_number}. {item.name}
          </Text>
          <Text style={[styles.episodeCardOverview, !canPlay && !isDownloading && styles.textMissing]} numberOfLines={2}>
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
    return (
      <TouchableOpacity
        key={season.seasonNumber}
        style={[
          styles.seasonTab,
          isSelected && styles.seasonTabActive,
          !season.hasInLibrary && styles.seasonTabMissing
        ]}
        onPress={() => handleSeasonSelect(season)}
      >
        <Text style={[
          styles.seasonTabText,
          isSelected && styles.seasonTabTextActive,
          !season.hasInLibrary && styles.seasonTabTextMissing
        ]}>
          {season.name}
        </Text>
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
      {/* ... (Keep existing backdrop) ... */}
      <ImageBackground
        source={{ uri: heroImage || undefined }}
        style={[styles.backdrop, { width: windowWidth, height: backdropHeight }]}
        resizeMode="cover"
      >
        <View style={styles.backdropOverlay} />
        <View style={styles.gradientOverlay} />
      </ImageBackground>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: backdropHeight * 0.5 }]}>
        <View style={[styles.heroContent, { paddingHorizontal: spacing }]}>
          {(isSeriesOrEpisode && seriesItem) && <Text style={styles.seriesTitle}>{seriesItem.SeriesName || seriesItem.Name}</Text>}

          {/* Movie Logo */}
          {isMovie && logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
          ) : (
            <Text style={styles.heroTitle}>{heroTitle}</Text>
          )}

          <View style={styles.metaRow}>
            {rating && <View style={styles.ratingBadge}><Text style={styles.ratingText}>{rating}</Text></View>}
            <Text style={styles.metaText}>{heroSubtitle}</Text>
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

          <Text style={styles.overview} numberOfLines={4}>{heroOverview}</Text>

          <View style={styles.actionRow}>
            {/* Primary Action */}
            {selectedSeason && !selectedSeason.hasInLibrary ? (
              <FocusableButton
                title={downloadProgress ? "Downloading..." : `Request Season ${selectedSeason.seasonNumber}`}
                onPress={() => !downloadProgress && handleRequestSeason(selectedSeason.seasonNumber)}
                style={downloadProgress ? styles.downloadingButton : styles.playButton}
                icon={downloadProgress ? "cloud-download" : "download"}
                disabled={!!downloadProgress}
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
              />
            )}



            {/* Mark as Watched Toggle */}
            {selectedEpisode && selectedEpisode.jellyfinItem && (
              <FocusableButton
                title={selectedEpisode.jellyfinItem.UserData?.Played ? "Mark Unwatched" : "Mark Watched"}
                onPress={handleToggleWatched}
                variant="secondary"
                style={styles.actionButton}
                icon={selectedEpisode.jellyfinItem.UserData?.Played ? "eye-off-outline" : "eye-outline"}
              />
            )}

            {/* Secondary Action */}
            {selectedSeason && selectedSeason.hasInLibrary && !selectedSeason.isFullyAvailable && (
              <FocusableButton
                title={downloadProgress ? "Checking..." : "Request Missing"}
                onPress={() => handleRequestSeason(selectedSeason.seasonNumber)}
                variant="secondary"
                style={styles.actionButton}
                icon="download-outline"
                disabled={!!downloadProgress}
              />
            )}

            <TouchableOpacity style={styles.circleButton}>
              <Icon name="heart-outline" size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.circleButton}>
              <Icon name="ellipsis-horizontal" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Media Info */}
          {isMovie && initialItem.MediaSources && initialItem.MediaSources.length > 0 && (
            <View style={styles.mediaInfoContainer}>
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
          )}

          {/* Details Grid */}
          {isMovie && (genres.length > 0 || director || writer || studios.length > 0) && (
            <View style={styles.detailsGrid}>
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
          )}

          {downloadProgress && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${downloadProgress.percent}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {downloadProgress.status} ({Math.round(downloadProgress.percent)}%) • {downloadProgress.timeLeft} remaining
              </Text>
            </View>
          )}

        </View>

        <View style={[styles.sectionsContainer, { paddingLeft: spacing }]}>
          {/* Season Selector */}
          {isSeriesOrEpisode && (
            <View style={styles.section}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonScroll}>
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
  container: { flex: 1, backgroundColor: '#000' },
  backdrop: { position: 'absolute', top: 0, left: 0 },
  backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  gradientOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 300, backgroundColor: 'rgba(0,0,0,0.8)' },
  backButton: { position: 'absolute', top: 60, left: 40, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 50 },
  heroContent: { paddingHorizontal: 48, marginBottom: 40 },
  seriesTitle: { color: '#FFD700', fontSize: 18, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 48, fontWeight: '800', marginBottom: 12, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  metaText: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '600', marginRight: 10 },
  overview: { color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 24, maxWidth: 700, marginBottom: 30 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  playButton: { minWidth: 160 },
  downloadingButton: { minWidth: 160, opacity: 0.8 },
  actionButton: { backgroundColor: 'rgba(255,255,255,0.1)' },
  circleButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  sectionsContainer: { paddingLeft: 48, backgroundColor: '#000', paddingTop: 20 },
  section: { marginBottom: 30 },
  seasonScroll: { flexDirection: 'row', marginBottom: 10 },
  seasonTab: { paddingHorizontal: 20, paddingVertical: 10, marginRight: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'transparent' },
  seasonTabActive: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: '#FFD700' },
  seasonTabText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600' },
  seasonTabTextActive: { color: '#fff', fontWeight: '700' },
  seasonTabMissing: { opacity: 0.5 },
  seasonTabTextMissing: { color: 'rgba(255,255,255,0.5)' },
  episodesList: { paddingRight: 48 },
  episodeCard: { width: 300, marginRight: 16 },
  episodeCardMissing: { opacity: 0.5 },
  episodeCardSelected: { transform: [{ scale: 1.02 }] },
  episodeImageContainer: { width: 300, height: 169, borderRadius: 12, backgroundColor: '#222', overflow: 'hidden', marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  episodeImageMissing: { grayscale: 1 },
  episodeThumbnail: { width: '100%', height: '100%' },
  episodeThumbnailMissing: { opacity: 0.5 },
  episodePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  episodeCardContent: { paddingHorizontal: 4 },
  episodeCardTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  episodeCardOverview: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  textMissing: { color: 'rgba(255,255,255,0.4)' },
  progressContainer: { marginTop: 20, maxWidth: 500 },
  progressBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFD700' },
  progressText: { color: '#FFD700', fontSize: 12, fontWeight: '600' },
  watchedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 2,
  },
  episodeDownloadOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 8,
    alignItems: 'center',
  },
  episodeProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  episodeProgressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  episodeDownloadText: {
    color: '#4caf50',
    fontSize: 11,
    fontWeight: '600',
  },
  sonarrBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  sonarrStatusText: {
    color: '#4caf50',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  logoImage: {
    width: 400,
    height: 120,
    marginBottom: 16,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 10,
  },
  ratingText: {
    color: '#fff',
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: '600',
  },
  imdbLabel: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 4,
  },
  endsAtText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginLeft: 10,
  },
  tagline: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  mediaInfoContainer: {
    marginTop: 24,
    marginBottom: 24,
    gap: 12,
  },
  mediaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mediaInfoLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  detailsGrid: {
    marginTop: 24,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    width: 120,
    fontWeight: '600',
  },
  detailValue: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    flex: 1,
  },
});
