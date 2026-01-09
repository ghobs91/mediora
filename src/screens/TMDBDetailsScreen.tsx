import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  useWindowDimensions,
  Alert,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useServices, useSettings } from '../context';
import { FocusableButton, QualityProfileSelector } from '../components';
import { RootStackParamList, TMDBMovie, TMDBTVShow, TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails, TMDBEpisode, TMDBCast, SonarrQualityProfile, RadarrQualityProfile, SonarrQueueItem, RadarrQueueItem } from '../types';
import { TMDBService } from '../services';

type TMDBDetailsRouteProp = RouteProp<RootStackParamList, 'TMDBDetails'>;

export function TMDBDetailsScreen() {
  const route = useRoute<TMDBDetailsRouteProp>();
  const navigation = useNavigation();
  const { tmdb, sonarr, radarr, jellyfin, isSonarrConnected, isRadarrConnected, isJellyfinConnected } = useServices();
  const { settings } = useSettings();
  const { item, mediaType } = route.params;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Responsive values
  const backdropHeight = windowHeight * 0.6;
  const posterWidth = Math.max(windowWidth * 0.2, 200);
  const posterHeight = posterWidth * 1.5;

  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [jellyfinItem, setJellyfinItem] = useState<any>(null);
  const [checkingJellyfin, setCheckingJellyfin] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(1);
  const [seasonDetails, setSeasonDetails] = useState<TMDBSeasonDetails | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [requestingSeasons, setRequestingSeasons] = useState<Set<number>>(new Set());
  const [selectedSeasonsToRequest, setSelectedSeasonsToRequest] = useState<Set<number>>(new Set());

  // Quality profile selection
  const [showQualityProfileModal, setShowQualityProfileModal] = useState(false);
  const [qualityProfiles, setQualityProfiles] = useState<SonarrQualityProfile[] | RadarrQualityProfile[]>([]);
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number | undefined>(undefined);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [requestingSeasonNumber, setRequestingSeasonNumber] = useState<number | null>(null);

  // Download progress tracking
  const [queueItems, setQueueItems] = useState<SonarrQueueItem[] | RadarrQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  useEffect(() => {
    loadDetails();
    checkIfExists();
    checkJellyfinFirst();
  }, []);

  const checkJellyfinFirst = async () => {
    if (!jellyfin || !isJellyfinConnected) return;

    setCheckingJellyfin(true);
    try {
      let jellyfinResults: any[] = [];

      if (mediaType === 'movie') {
        jellyfinResults = await jellyfin.searchByTmdbId(item.id.toString(), 'Movie');
      } else {
        // For TV shows, we need to get details first to get TVDB ID
        if (!tmdb) return;
        const tvDetails = await tmdb.getTVDetails(item.id);
        if (tvDetails.external_ids?.tvdb_id) {
          jellyfinResults = await jellyfin.searchByTvdbId(tvDetails.external_ids.tvdb_id.toString());
        }
      }

      if (jellyfinResults.length > 0) {
        // Content exists in Jellyfin - navigate to ItemDetailsScreen instead
        const jellyfinItem = jellyfinResults[0];
        // @ts-ignore - navigation typing
        navigation.replace('ItemDetails', { item: jellyfinItem });
      }
    } catch (error) {
      console.error('Failed to check Jellyfin availability:', error);
    } finally {
      setCheckingJellyfin(false);
    }
  };

  useEffect(() => {
    if (details) {
      checkJellyfinAvailability();
    }
  }, [details]);

  useEffect(() => {
    if (details && mediaType === 'tv') {
      loadSeasonDetails(selectedSeasonNumber);
    }
  }, [selectedSeasonNumber, details]);

  // Fetch queue data for download progress
  useEffect(() => {
    if (!alreadyExists) return;

    const fetchQueue = async () => {
      try {
        if (mediaType === 'movie' && radarr) {
          const existingMovie = await radarr.checkMovieExists(item.id);
          if (existingMovie?.id) {
            const queue = await radarr.getQueueByMovieId(existingMovie.id);
            setQueueItems(queue);
          }
        } else if (mediaType === 'tv' && sonarr) {
          const tvDetails = details as TMDBTVDetails;
          if (tvDetails?.external_ids?.tvdb_id) {
            const existingSeries = await sonarr.checkSeriesExists(tvDetails.external_ids.tvdb_id);
            if (existingSeries?.id) {
              const queue = await sonarr.getQueueBySeriesId(existingSeries.id);
              setQueueItems(queue);
            }
          }
        }
      } catch (error) {
        console.error('[TMDBDetailsScreen] Failed to fetch queue:', error);
      }
    };

    fetchQueue();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchQueue, 10000);

    return () => clearInterval(interval);
  }, [alreadyExists, mediaType, item.id, details, radarr, sonarr]);

  const loadDetails = async () => {
    if (!tmdb) return;

    try {
      if (mediaType === 'movie') {
        const movieDetails = await tmdb.getMovieDetails(item.id);
        setDetails(movieDetails);
      } else {
        const tvDetails = await tmdb.getTVDetails(item.id);
        setDetails(tvDetails);
      }
    } catch (error) {
      console.error('Failed to load details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSeasonDetails = async (seasonNumber: number) => {
    if (!tmdb) return;

    setLoadingSeasons(true);
    try {
      const season = await tmdb.getSeasonDetails(item.id, seasonNumber);
      setSeasonDetails(season);
    } catch (error) {
      console.error('Failed to load season details:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const checkIfExists = async () => {
    try {
      if (mediaType === 'movie' && radarr) {
        const existing = await radarr.checkMovieExists(item.id);
        setAlreadyExists(!!existing);
      } else if (mediaType === 'tv' && sonarr && details) {
        const tvDetails = details as TMDBTVDetails;
        if (tvDetails.external_ids?.tvdb_id) {
          const existing = await sonarr.checkSeriesExists(tvDetails.external_ids.tvdb_id);
          setAlreadyExists(!!existing);
        }
      }
    } catch (error) {
      console.error('Failed to check if exists:', error);
    }
  };

  const checkJellyfinAvailability = async () => {
    if (!jellyfin || !isJellyfinConnected || !details) return;

    setCheckingJellyfin(true);
    try {
      if (mediaType === 'movie') {
        const movieDetails = details as TMDBMovieDetails;
        const results = await jellyfin.searchByTmdbId(item.id.toString(), 'Movie');
        if (results.length > 0) {
          setJellyfinItem(results[0]);
        }
      } else {
        const tvDetails = details as TMDBTVDetails;
        if (tvDetails.external_ids?.tvdb_id) {
          const results = await jellyfin.searchByTvdbId(tvDetails.external_ids.tvdb_id.toString());
          if (results.length > 0) {
            setJellyfinItem(results[0]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check Jellyfin availability:', error);
    } finally {
      setCheckingJellyfin(false);
    }
  };

  const handlePlayFromJellyfin = () => {
    if (!jellyfinItem) return;
    // @ts-ignore - navigation typing
    navigation.navigate('ItemDetails', { item: jellyfinItem });
  };

  const handleRequestMovie = async () => {
    if (!radarr || !settings.radarr) {
      Alert.alert('Error', 'Radarr is not configured');
      return;
    }

    // Load quality profiles
    setLoadingProfiles(true);
    try {
      const profiles = await radarr.getQualityProfiles();
      setQualityProfiles(profiles);
      
      // Set default to the configured one or first available
      const defaultProfile = profiles.find(p => p.id === settings.radarr?.qualityProfileId) || profiles[0];
      setSelectedQualityProfileId(defaultProfile?.id);
      
      // Show quality profile selector
      setShowQualityProfileModal(true);
    } catch (error) {
      console.error('Failed to load quality profiles:', error);
      Alert.alert('Error', 'Failed to load quality profiles. Check your Radarr connection.');
    } finally {
      setLoadingProfiles(false);
    }
  };

  const confirmRequestMovie = async (qualityProfileId: number) => {
    if (!radarr || !settings.radarr) return;

    setIsRequesting(true);

    try {
      // Look up the movie in Radarr
      const radarrMovie = await radarr.lookupMovieByTmdbId(item.id);

      // Add the movie with selected quality profile
      await radarr.addMovie(radarrMovie, {
        rootFolderPath: settings.radarr.rootFolderPath,
        qualityProfileId: qualityProfileId,
        searchForMovie: true,
      });

      setAlreadyExists(true);
      Alert.alert('Success', 'Movie has been added to Radarr');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add movie';
      Alert.alert('Error', message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRequestTV = async () => {
    if (!sonarr || !settings.sonarr) {
      Alert.alert('Error', 'Sonarr is not configured');
      return;
    }

    const tvDetails = details as TMDBTVDetails;
    if (!tvDetails?.external_ids?.tvdb_id) {
      Alert.alert('Error', 'TVDB ID not found for this show. Try searching for it directly in Sonarr.');
      return;
    }

    // Load quality profiles
    setLoadingProfiles(true);
    try {
      const profiles = await sonarr.getQualityProfiles();
      setQualityProfiles(profiles);
      
      // Set default to the configured one or first available
      const defaultProfile = profiles.find(p => p.id === settings.sonarr?.qualityProfileId) || profiles[0];
      setSelectedQualityProfileId(defaultProfile?.id);
      
      // Show quality profile selector
      setShowQualityProfileModal(true);
    } catch (error) {
      console.error('Failed to load quality profiles:', error);
      Alert.alert('Error', 'Failed to load quality profiles. Check your Sonarr connection.');
    } finally {
      setLoadingProfiles(false);
    }
  };

  const confirmRequestTV = async (qualityProfileId: number) => {
    if (!sonarr || !settings.sonarr) return;

    const tvDetails = details as TMDBTVDetails;
    if (!tvDetails?.external_ids?.tvdb_id) return;

    setIsRequesting(true);

    try {
      console.log('[TMDBDetailsScreen] Current Sonarr settings:', {
        serverUrl: settings.sonarr.serverUrl,
        apiKey: settings.sonarr.apiKey.substring(0, 8) + '...',
        rootFolderPath: settings.sonarr.rootFolderPath,
        qualityProfileId: qualityProfileId,
      });
      console.log('[TMDBDetailsScreen] Looking up series with TVDB ID:', tvDetails.external_ids.tvdb_id);

      // Look up the series in Sonarr
      const sonarrResults = await sonarr.lookupSeriesByTvdbId(tvDetails.external_ids.tvdb_id);

      if (sonarrResults.length === 0) {
        Alert.alert('Error', 'Series not found in Sonarr. The show may not be available in Sonarr\'s database yet.');
        return;
      }

      console.log('[TMDBDetailsScreen] Found series in Sonarr:', sonarrResults[0].title);

      // Add the series with selected seasons or all seasons
      const seasonsToMonitor = selectedSeasonsToRequest.size > 0
        ? Array.from(selectedSeasonsToRequest)
        : undefined; // undefined means monitor all seasons

      await sonarr.addSeriesWithSeasons(sonarrResults[0], {
        rootFolderPath: settings.sonarr.rootFolderPath,
        qualityProfileId: qualityProfileId,
        searchForMissingEpisodes: true,
        monitoredSeasons: seasonsToMonitor,
      });

      setAlreadyExists(true);
      const seasonText = selectedSeasonsToRequest.size > 0
        ? `Season(s) ${Array.from(selectedSeasonsToRequest).join(', ')} added`
        : 'TV show has been added';
      Alert.alert('Success', seasonText + ' to Sonarr');
    } catch (error) {
      console.error('[TMDBDetailsScreen] Failed to add TV show:', error);
      let message = 'Failed to add TV show';

      if (error instanceof Error) {
        if (error.message.includes('401')) {
          message = 'Sonarr authentication failed. Please check your API key in Settings.';
        } else if (error.message.includes('404')) {
          message = 'Series not found in Sonarr. It may not be available in their database yet.';
        } else if (error.message.includes('Network request failed')) {
          message = 'Cannot connect to Sonarr server. Please check your server URL and network connection.';
        } else {
          message = error.message;
        }
      }

      Alert.alert('Error', message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRequestSeason = async (seasonNumber: number) => {
    if (!sonarr || !settings.sonarr) {
      Alert.alert('Error', 'Sonarr is not configured');
      return;
    }

    const tvDetails = details as TMDBTVDetails;
    if (!tvDetails?.external_ids?.tvdb_id) {
      Alert.alert('Error', 'TVDB ID not found for this show.');
      return;
    }

    // Load quality profiles
    setLoadingProfiles(true);
    setRequestingSeasonNumber(seasonNumber);
    try {
      const profiles = await sonarr.getQualityProfiles();
      setQualityProfiles(profiles);
      
      // Set default to the configured one or first available
      const defaultProfile = profiles.find(p => p.id === settings.sonarr?.qualityProfileId) || profiles[0];
      setSelectedQualityProfileId(defaultProfile?.id);
      
      // Show quality profile selector
      setShowQualityProfileModal(true);
    } catch (error) {
      console.error('Failed to load quality profiles:', error);
      Alert.alert('Error', 'Failed to load quality profiles. Check your Sonarr connection.');
      setRequestingSeasonNumber(null);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const confirmRequestSeason = async (seasonNumber: number, qualityProfileId: number) => {
    if (!sonarr || !settings.sonarr) return;

    const tvDetails = details as TMDBTVDetails;
    if (!tvDetails?.external_ids?.tvdb_id) return;

    setRequestingSeasons(prev => new Set(prev).add(seasonNumber));

    try {
      // Check if series already exists
      const existingSeries = await sonarr.checkSeriesExists(tvDetails.external_ids.tvdb_id);

      if (existingSeries && existingSeries.id) {
        // Series exists, just monitor this season and search
        await sonarr.updateSeasonMonitoring(existingSeries.id, seasonNumber, true);
        await sonarr.searchForSeason(existingSeries.id, seasonNumber);
        Alert.alert('Success', `Season ${seasonNumber} has been requested`);
      } else {
        // Series doesn't exist, add it with only this season monitored
        const sonarrResults = await sonarr.lookupSeriesByTvdbId(tvDetails.external_ids.tvdb_id);
        if (sonarrResults.length === 0) {
          Alert.alert('Error', 'Series not found in Sonarr.');
          return;
        }

        await sonarr.addSeriesWithSeasons(sonarrResults[0], {
          rootFolderPath: settings.sonarr.rootFolderPath,
          qualityProfileId: qualityProfileId,
          searchForMissingEpisodes: true,
          monitoredSeasons: [seasonNumber],
        });

        Alert.alert('Success', `Series added with Season ${seasonNumber} monitored`);
        setAlreadyExists(true);
      }
    } catch (error) {
      console.error('[TMDBDetailsScreen] Failed to request season:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to request season');
    } finally {
      setRequestingSeasons(prev => {
        const newSet = new Set(prev);
        newSet.delete(seasonNumber);
        return newSet;
      });
      setRequestingSeasonNumber(null);
    }
  };

  const toggleSeasonSelection = (seasonNumber: number) => {
    setSelectedSeasonsToRequest(prev => {
      const newSet = new Set(prev);
      if (newSet.has(seasonNumber)) {
        newSet.delete(seasonNumber);
      } else {
        newSet.add(seasonNumber);
      }
      return newSet;
    });
  };

  // Helper to get download progress for an episode
  const getEpisodeProgress = (episodeNumber: number, seasonNumber: number): SonarrQueueItem | null => {
    if (!queueItems.length || mediaType !== 'tv') return null;
    const sonarrQueue = queueItems as SonarrQueueItem[];
    return sonarrQueue.find(qi => 
      qi.episode?.episodeNumber === episodeNumber && 
      qi.episode?.seasonNumber === seasonNumber
    ) || null;
  };

  // Helper to get movie download progress
  const getMovieProgress = (): RadarrQueueItem | null => {
    if (!queueItems.length || mediaType !== 'movie') return null;
    return (queueItems as RadarrQueueItem[])[0] || null;
  };

  // Helper to calculate progress percentage
  const calculateProgress = (queueItem: SonarrQueueItem | RadarrQueueItem): number => {
    if (!queueItem.size || queueItem.size === 0) return 0;
    const downloaded = queueItem.size - queueItem.sizeleft;
    return Math.round((downloaded / queueItem.size) * 100);
  };

  // Helper to get season overall progress
  const getSeasonProgress = (seasonNumber: number): { downloading: number; total: number; percentage: number } => {
    if (!seasonDetails || mediaType !== 'tv') return { downloading: 0, total: 0, percentage: 0 };
    const sonarrQueue = queueItems as SonarrQueueItem[];
    const downloadingEpisodes = sonarrQueue.filter(qi => qi.episode?.seasonNumber === seasonNumber);
    const totalEpisodes = seasonDetails.episodes?.length || 0;
    const percentage = totalEpisodes > 0 ? Math.round((downloadingEpisodes.length / totalEpisodes) * 100) : 0;
    return { downloading: downloadingEpisodes.length, total: totalEpisodes, percentage };
  };

  const title = 'title' in item ? item.title : item.name;
  const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
  const posterUrl = TMDBService.getPosterUrl(item.poster_path, 'w500');
  const backdropUrl = TMDBService.getBackdropUrl(item.backdrop_path, 'w1280');

  const canRequest = mediaType === 'movie' ? isRadarrConnected : isSonarrConnected;

  const renderCastMember = ({ item: castMember }: { item: TMDBCast }) => {
    const profileUrl = TMDBService.getProfileUrl(castMember.profile_path);

    return (
      <View style={styles.castMember}>
        {profileUrl ? (
          <Image source={{ uri: profileUrl }} style={styles.castImage} />
        ) : (
          <View style={[styles.castImage, styles.castImagePlaceholder]}>
            <Text style={styles.castInitial}>{castMember.name.charAt(0)}</Text>
          </View>
        )}
        <Text style={styles.castName} numberOfLines={1}>
          {castMember.name}
        </Text>
        <Text style={styles.castCharacter} numberOfLines={1}>
          {castMember.character}
        </Text>
      </View>
    );
  };

  const renderEpisode = ({ item: episode }: { item: TMDBEpisode }) => {
    const stillUrl = TMDBService.getStillUrl(episode.still_path);
    const episodeProgress = getEpisodeProgress(episode.episode_number, episode.season_number);
    const progress = episodeProgress ? calculateProgress(episodeProgress) : null;

    return (
      <TouchableOpacity style={styles.episodeCard}>
        {stillUrl ? (
          <Image source={{ uri: stillUrl }} style={styles.episodeImage} />
        ) : (
          <View style={[styles.episodeImage, styles.episodeImagePlaceholder]}>
            <Text style={styles.episodeNumber}>E{episode.episode_number}</Text>
          </View>
        )}
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={1}>
            {episode.episode_number}. {episode.name}
          </Text>
          {episode.runtime && (
            <Text style={styles.episodeRuntime}>{episode.runtime}m</Text>
          )}
          {episodeProgress ? (
            <View style={styles.downloadProgress}>
              <Text style={styles.downloadProgressText}>
                Downloading: {progress}% • {episodeProgress.timeleft || 'calculating...'}
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
            </View>
          ) : (
            <Text style={styles.episodeOverview} numberOfLines={2}>
              {episode.overview}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const tvDetails = mediaType === 'tv' ? (details as TMDBTVDetails) : null;

  return (
    <ScrollView style={styles.container}>
      {/* Backdrop */}
      {backdropUrl && (
        <Image
          source={{ uri: backdropUrl }}
          style={[styles.backdrop, { width: windowWidth, height: backdropHeight }]}
          resizeMode="cover"
        />
      )}
      <View style={[styles.backdropOverlay, { height: backdropHeight }]} />

      <View style={[styles.content, { marginTop: backdropHeight * 0.5 }]}>
        <View style={styles.mainContent}>
          {/* Poster */}
          {posterUrl && (
            <Image
              source={{ uri: posterUrl }}
              style={[styles.poster, { width: posterWidth, height: posterHeight }]}
              resizeMode="cover"
            />
          )}

          {/* Info */}
          <View style={styles.info}>
            <Text style={styles.title}>{title}</Text>

            <View style={styles.metadata}>
              {releaseDate && (
                <Text style={styles.metadataItem}>
                  {releaseDate.substring(0, 4)}
                </Text>
              )}
              {details && 'runtime' in details && details.runtime && (
                <Text style={styles.metadataItem}>{details.runtime}m</Text>
              )}
              {details && 'number_of_seasons' in details && (
                <Text style={styles.metadataItem}>
                  {details.number_of_seasons} Seasons
                </Text>
              )}
              {item.vote_average > 0 && (
                <Text style={styles.metadataItem}>
                  ⭐ {item.vote_average.toFixed(1)}
                </Text>
              )}
            </View>

            {details?.genres && (
              <View style={styles.genres}>
                {details.genres.map(genre => (
                  <View key={genre.id} style={styles.genreTag}>
                    <Text style={styles.genreText}>{genre.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {item.overview && (
              <Text style={styles.overview}>{item.overview}</Text>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              {jellyfinItem && (
                <FocusableButton
                  title={mediaType === 'movie' ? 'Play Movie' : 'View Series'}
                  onPress={handlePlayFromJellyfin}
                  size="large"
                  variant="primary"
                />
              )}
              {canRequest && (
                <FocusableButton
                  title={
                    alreadyExists
                      ? mediaType === 'movie'
                        ? 'Already in Radarr'
                        : 'Already in Sonarr'
                      : mediaType === 'movie'
                        ? 'Request Movie'
                        : 'Request TV Show'
                  }
                  onPress={
                    mediaType === 'movie' ? handleRequestMovie : handleRequestTV
                  }
                  disabled={alreadyExists || isRequesting || loadingProfiles}
                  loading={isRequesting || loadingProfiles}
                  size="large"
                  variant={jellyfinItem ? 'secondary' : (alreadyExists ? 'secondary' : 'primary')}
                />
              )}
              {/* Show movie download progress */}
              {mediaType === 'movie' && alreadyExists && (() => {
                const movieProgress = getMovieProgress();
                if (movieProgress) {
                  const progress = calculateProgress(movieProgress);
                  return (
                    <View style={styles.downloadProgressContainer}>
                      <Text style={styles.downloadProgressTitle}>Downloading Movie</Text>
                      <Text style={styles.downloadProgressDetails}>
                        {progress}% • {movieProgress.timeleft || 'calculating...'}
                      </Text>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                      </View>
                      <Text style={styles.downloadProgressStatus}>
                        {movieProgress.status} • {movieProgress.downloadClient}
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}
              {!canRequest && !jellyfinItem && (
                <View>
                  <Text style={styles.configureText}>
                    Configure {mediaType === 'movie' ? 'Radarr' : 'Sonarr'} in
                    Settings to request this {mediaType === 'movie' ? 'movie' : 'show'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Cast Section */}
        {details?.credits?.cast && details.credits.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <FlatList
              data={details.credits.cast.slice(0, 10)}
              renderItem={renderCastMember}
              keyExtractor={item => item.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.castList}
            />
          </View>
        )}

        {/* Seasons & Episodes Section (TV Shows only) */}
        {mediaType === 'tv' && tvDetails && tvDetails.seasons && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Seasons & Episodes</Text>

            {!alreadyExists && canRequest && (
              <View style={styles.seasonSelectionHint}>
                <Text style={styles.seasonSelectionHintText}>
                  Select specific seasons to request, or request all
                </Text>
              </View>
            )}

            {/* Show season download progress summary */}
            {alreadyExists && selectedSeasonNumber && (() => {
              const seasonProgress = getSeasonProgress(selectedSeasonNumber);
              if (seasonProgress.downloading > 0) {
                return (
                  <View style={styles.seasonProgressContainer}>
                    <Text style={styles.seasonProgressText}>
                      Season {selectedSeasonNumber}: Downloading {seasonProgress.downloading} of {seasonProgress.total} episodes
                    </Text>
                  </View>
                );
              }
              return null;
            })()}

            {/* Season Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.seasonTabs}
              contentContainerStyle={styles.seasonTabsContent}
            >
              {tvDetails.seasons
                .filter(season => season.season_number > 0)
                .map(season => (
                  <View key={season.id} style={styles.seasonTabContainer}>
                    <TouchableOpacity
                      style={[
                        styles.seasonTab,
                        selectedSeasonNumber === season.season_number && styles.seasonTabActive,
                        selectedSeasonsToRequest.has(season.season_number) &&
                        !alreadyExists && styles.seasonTabSelected,
                      ]}
                      onPress={() => setSelectedSeasonNumber(season.season_number)}
                      onLongPress={() => !alreadyExists && toggleSeasonSelection(season.season_number)}
                    >
                      <Text
                        style={[
                          styles.seasonTabText,
                          selectedSeasonNumber === season.season_number && styles.seasonTabTextActive,
                        ]}
                      >
                        Season {season.season_number}
                      </Text>
                      {selectedSeasonsToRequest.has(season.season_number) && !alreadyExists && (
                        <Icon name="checkmark-circle" size={16} color="#4caf50" style={styles.seasonCheckIcon} />
                      )}
                    </TouchableOpacity>
                    {!alreadyExists && canRequest && (
                      <TouchableOpacity
                        style={styles.seasonRequestButton}
                        onPress={() => handleRequestSeason(season.season_number)}
                        disabled={requestingSeasons.has(season.season_number)}
                      >
                        {requestingSeasons.has(season.season_number) ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Icon name="add-circle-outline" size={20} color="#2196f3" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
            </ScrollView>

            {/* Episodes List */}
            {loadingSeasons ? (
              <Text style={styles.loadingText}>Loading episodes...</Text>
            ) : seasonDetails && seasonDetails.episodes ? (
              <View style={styles.episodesList}>
                {seasonDetails.episodes.map(episode => (
                  <View key={episode.id}>
                    {renderEpisode({ item: episode })}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Quality Profile Selector Modal */}
      <QualityProfileSelector
        visible={showQualityProfileModal}
        onClose={() => {
          setShowQualityProfileModal(false);
          setRequestingSeasonNumber(null);
        }}
        onSelect={(profileId) => {
          setSelectedQualityProfileId(profileId);
          // Execute the request with the selected profile
          if (requestingSeasonNumber !== null) {
            // Requesting a specific season
            confirmRequestSeason(requestingSeasonNumber, profileId);
          } else if (mediaType === 'movie') {
            confirmRequestMovie(profileId);
          } else {
            confirmRequestTV(profileId);
          }
        }}
        profiles={qualityProfiles}
        title={`Select Quality Profile for ${requestingSeasonNumber !== null ? `Season ${requestingSeasonNumber}` : mediaType === 'movie' ? 'Movie' : 'TV Show'}`}
        selectedProfileId={selectedQualityProfileId}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  content: {
    padding: 48,
  },
  mainContent: {
    flexDirection: 'row',
  },
  poster: {
    borderRadius: 12,
    marginRight: 48,
  },
  info: {
    flex: 1,
    paddingTop: 24,
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  metadata: {
    flexDirection: 'row',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metadataItem: {
    color: '#888',
    fontSize: 18,
    marginRight: 24,
    marginBottom: 8,
  },
  genres: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  genreTag: {
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  genreText: {
    color: '#fff',
    fontSize: 14,
  },
  overview: {
    color: '#ccc',
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  configureText: {
    color: '#888',
    fontSize: 16,
    fontStyle: 'italic',
  },
  section: {
    marginTop: 48,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  castList: {
    paddingRight: 48,
  },
  castMember: {
    width: 120,
    marginRight: 16,
  },
  castImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 8,
    backgroundColor: '#333',
  },
  castImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  castInitial: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  castName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  castCharacter: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  seasonTabs: {
    marginBottom: 24,
  },
  seasonTabsContent: {
    paddingRight: 48,
  },
  seasonTabContainer: {
    marginRight: 12,
  },
  seasonTab: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#222',
    flexDirection: 'row',
    alignItems: 'center',
  },
  seasonTabActive: {
    backgroundColor: '#fff',
  },
  seasonTabSelected: {
    borderWidth: 2,
    borderColor: '#4caf50',
  },
  seasonTabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  seasonTabTextActive: {
    color: '#000',
  },
  seasonCheckIcon: {
    marginLeft: 6,
  },
  seasonRequestButton: {
    marginTop: 8,
    alignItems: 'center',
    padding: 4,
  },
  seasonSelectionHint: {
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  seasonSelectionHintText: {
    color: '#2196f3',
    fontSize: 14,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 24,
  },
  episodesList: {
    gap: 16,
  },
  episodeCard: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  episodeImage: {
    width: 240,
    height: 135,
    backgroundColor: '#222',
  },
  episodeImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeNumber: {
    color: '#666',
    fontSize: 32,
    fontWeight: 'bold',
  },
  episodeInfo: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  episodeTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeRuntime: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  episodeOverview: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  downloadProgressContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2196f3',
  },
  downloadProgressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  downloadProgressDetails: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 8,
  },
  downloadProgressStatus: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  downloadProgress: {
    marginTop: 4,
  },
  downloadProgressText: {
    fontSize: 12,
    color: '#2196f3',
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2196f3',
    borderRadius: 2,
  },
  seasonProgressContainer: {
    marginVertical: 8,
    padding: 12,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 8,
  },
  seasonProgressText: {
    fontSize: 14,
    color: '#2196f3',
    fontWeight: '500',
  },
});
