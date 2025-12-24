import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  Dimensions,
  Alert,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices, useSettings } from '../context';
import { FocusableButton } from '../components';
import { RootStackParamList, TMDBMovie, TMDBTVShow, TMDBMovieDetails, TMDBTVDetails, TMDBSeasonDetails, TMDBEpisode, TMDBCast } from '../types';
import { TMDBService } from '../services';

type TMDBDetailsRouteProp = RouteProp<RootStackParamList, 'TMDBDetails'>;

export function TMDBDetailsScreen() {
  const route = useRoute<TMDBDetailsRouteProp>();
  const navigation = useNavigation();
  const { tmdb, sonarr, radarr, jellyfin, isSonarrConnected, isRadarrConnected, isJellyfinConnected } = useServices();
  const { settings } = useSettings();
  const { item, mediaType } = route.params;

  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [jellyfinItem, setJellyfinItem] = useState<any>(null);
  const [checkingJellyfin, setCheckingJellyfin] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(1);
  const [seasonDetails, setSeasonDetails] = useState<TMDBSeasonDetails | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);

  useEffect(() => {
    loadDetails();
    checkIfExists();
  }, []);

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

    setIsRequesting(true);

    try {
      // Look up the movie in Radarr
      const radarrMovie = await radarr.lookupMovieByTmdbId(item.id);

      // Add the movie
      await radarr.addMovie(radarrMovie, {
        rootFolderPath: settings.radarr.rootFolderPath,
        qualityProfileId: settings.radarr.qualityProfileId,
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

    setIsRequesting(true);

    try {
      console.log('[TMDBDetailsScreen] Current Sonarr settings:', {
        serverUrl: settings.sonarr.serverUrl,
        apiKey: settings.sonarr.apiKey.substring(0, 8) + '...',
        rootFolderPath: settings.sonarr.rootFolderPath,
        qualityProfileId: settings.sonarr.qualityProfileId,
      });
      console.log('[TMDBDetailsScreen] Looking up series with TVDB ID:', tvDetails.external_ids.tvdb_id);
      
      // Look up the series in Sonarr
      const sonarrResults = await sonarr.lookupSeriesByTvdbId(tvDetails.external_ids.tvdb_id);

      if (sonarrResults.length === 0) {
        Alert.alert('Error', 'Series not found in Sonarr. The show may not be available in Sonarr\'s database yet.');
        return;
      }

      console.log('[TMDBDetailsScreen] Found series in Sonarr:', sonarrResults[0].title);

      // Add the series
      await sonarr.addSeries(sonarrResults[0], {
        rootFolderPath: settings.sonarr.rootFolderPath,
        qualityProfileId: settings.sonarr.qualityProfileId,
        searchForMissingEpisodes: true,
      });

      setAlreadyExists(true);
      Alert.alert('Success', 'TV show has been added to Sonarr');
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
          <Text style={styles.episodeOverview} numberOfLines={2}>
            {episode.overview}
          </Text>
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
          style={styles.backdrop}
          resizeMode="cover"
        />
      )}
      <View style={styles.backdropOverlay} />

      <View style={styles.content}>
        <View style={styles.mainContent}>
          {/* Poster */}
          {posterUrl && (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
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
                  disabled={alreadyExists || isRequesting}
                  loading={isRequesting}
                  size="large"
                  variant={jellyfinItem ? 'secondary' : (alreadyExists ? 'secondary' : 'primary')}
                />
              )}
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
                  <TouchableOpacity
                    key={season.id}
                    style={[
                      styles.seasonTab,
                      selectedSeasonNumber === season.season_number && styles.seasonTabActive,
                    ]}
                    onPress={() => setSelectedSeasonNumber(season.season_number)}
                  >
                    <Text
                      style={[
                        styles.seasonTabText,
                        selectedSeasonNumber === season.season_number && styles.seasonTabTextActive,
                      ]}
                    >
                      Season {season.season_number}
                    </Text>
                  </TouchableOpacity>
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
    </ScrollView>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdrop: {
    width,
    height: height * 0.6,
    position: 'absolute',
    top: 0,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    height: height * 0.6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  content: {
    marginTop: height * 0.3,
    padding: 48,
  },
  mainContent: {
    flexDirection: 'row',
  },
  poster: {
    width: 300,
    height: 450,
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
  seasonTab: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  seasonTabActive: {
    backgroundColor: '#fff',
  },
  seasonTabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  seasonTabTextActive: {
    color: '#000',
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
});
