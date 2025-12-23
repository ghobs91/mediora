import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices, useSettings } from '../context';
import { FocusableButton } from '../components';
import { RootStackParamList, TMDBMovie, TMDBTVShow, TMDBMovieDetails, TMDBTVDetails } from '../types';
import { TMDBService } from '../services';

type TMDBDetailsRouteProp = RouteProp<RootStackParamList, 'TMDBDetails'>;

export function TMDBDetailsScreen() {
  const route = useRoute<TMDBDetailsRouteProp>();
  const navigation = useNavigation();
  const { tmdb, sonarr, radarr, isSonarrConnected, isRadarrConnected } = useServices();
  const { settings } = useSettings();
  const { item, mediaType } = route.params;

  const [details, setDetails] = useState<TMDBMovieDetails | TMDBTVDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  useEffect(() => {
    loadDetails();
    checkIfExists();
  }, []);

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
      Alert.alert('Error', 'TVDB ID not found for this show');
      return;
    }

    setIsRequesting(true);

    try {
      // Look up the series in Sonarr
      const sonarrResults = await sonarr.lookupSeriesByTvdbId(tvDetails.external_ids.tvdb_id);

      if (sonarrResults.length === 0) {
        Alert.alert('Error', 'Series not found in Sonarr');
        return;
      }

      // Add the series
      await sonarr.addSeries(sonarrResults[0], {
        rootFolderPath: settings.sonarr.rootFolderPath,
        qualityProfileId: settings.sonarr.qualityProfileId,
        searchForMissingEpisodes: true,
      });

      setAlreadyExists(true);
      Alert.alert('Success', 'TV show has been added to Sonarr');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add TV show';
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
                  variant={alreadyExists ? 'secondary' : 'primary'}
                />
              )}
              {!canRequest && (
                <Text style={styles.configureText}>
                  Configure {mediaType === 'movie' ? 'Radarr' : 'Sonarr'} in
                  Settings to request this {mediaType === 'movie' ? 'movie' : 'show'}
                </Text>
              )}
            </View>
          </View>
        </View>
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
});
