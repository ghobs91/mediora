import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  Dimensions,
  Alert,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices, useSettings } from '../context';
import { FocusableButton, LoadingScreen } from '../components';
import { RootStackParamList, JellyfinItem } from '../types';

type ItemDetailsRouteProp = RouteProp<RootStackParamList, 'ItemDetails'>;

export function ItemDetailsScreen() {
  const route = useRoute<ItemDetailsRouteProp>();
  const navigation = useNavigation();
  const { jellyfin } = useServices();
  const { item } = route.params;

  const [seasons, setSeasons] = useState<JellyfinItem[]>([]);
  const [episodes, setEpisodes] = useState<JellyfinItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const isSeries = item.Type === 'Series';

  useEffect(() => {
    if (isSeries && jellyfin) {
      loadSeasons();
    }
  }, [isSeries, jellyfin]);

  useEffect(() => {
    if (selectedSeasonId && jellyfin) {
      loadEpisodes();
    }
  }, [selectedSeasonId, jellyfin]);

  const loadSeasons = async () => {
    if (!jellyfin) return;
    setLoadingSeasons(true);
    try {
      const seasonsData = await jellyfin.getSeasons(item.Id);
      // Filter out specials (Season 0) if present
      const regularSeasons = seasonsData.filter(s => (s.IndexNumber ?? 0) > 0);
      setSeasons(regularSeasons);
      // Auto-select first season
      if (regularSeasons.length > 0) {
        setSelectedSeasonId(regularSeasons[0].Id);
      }
    } catch (error) {
      console.error('Failed to load seasons:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const loadEpisodes = async () => {
    if (!jellyfin || !selectedSeasonId) return;
    setLoadingEpisodes(true);
    try {
      const episodesData = await jellyfin.getEpisodes(item.Id, selectedSeasonId);
      setEpisodes(episodesData);
    } catch (error) {
      console.error('Failed to load episodes:', error);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handlePlay = () => {
    // @ts-ignore - navigation typing
    navigation.navigate('Player', { itemId: item.Id });
  };

  const handleEpisodePlay = (episode: JellyfinItem) => {
    // @ts-ignore - navigation typing
    navigation.navigate('Player', { itemId: episode.Id });
  };

  const formatRuntime = (ticks?: number): string => {
    if (!ticks) return '';
    const minutes = Math.floor(ticks / 600000000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  const getBackdropUrl = (): string | null => {
    if (!jellyfin) return null;
    // For episodes, try Primary (thumbnail) first, then fall back to Backdrop
    if (item.Type === 'Episode') {
      return jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 1920 });
    }
    if (item.BackdropImageTags?.length) {
      return jellyfin.getImageUrl(item.Id, 'Backdrop', { maxWidth: 1920 });
    }
    return null;
  };

  const getPosterUrl = (): string | null => {
    if (!jellyfin) return null;
    return jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 400 });
  };

  const backdropUrl = getBackdropUrl();
  const posterUrl = getPosterUrl();

  const [backButtonFocused, setBackButtonFocused] = useState(false);
  const backButtonScale = useRef(new Animated.Value(1)).current;

  const handleBackFocus = () => {
    setBackButtonFocused(true);
    Animated.spring(backButtonScale, {
      toValue: 1.1,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  const handleBackBlur = () => {
    setBackButtonFocused(false);
    Animated.spring(backButtonScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

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
        {/* Back Button - in normal flow at top */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            onFocus={handleBackFocus}
            onBlur={handleBackBlur}
          >
            <Animated.View
              style={[
                styles.backButtonInner,
                backButtonFocused && styles.backButtonFocused,
                { transform: [{ scale: backButtonScale }] },
              ]}
            >
              <Text style={[
                styles.backButtonIcon,
                backButtonFocused && { color: '#000' }
              ]}>←</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>

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
            <Text style={styles.title}>
              {item.SeriesName || item.Name}
            </Text>

            {item.SeriesName && (
              <Text style={styles.episodeTitle}>
                {item.SeasonName} • Episode {item.IndexNumber}: {item.Name}
              </Text>
            )}

            <View style={styles.metadata}>
              {item.ProductionYear && (
                <Text style={styles.metadataItem}>{item.ProductionYear}</Text>
              )}
              {item.OfficialRating && (
                <Text style={styles.metadataItem}>{item.OfficialRating}</Text>
              )}
              {item.RunTimeTicks && (
                <Text style={styles.metadataItem}>
                  {formatRuntime(item.RunTimeTicks)}
                </Text>
              )}
              {item.CommunityRating && (
                <Text style={styles.metadataItem}>
                  ⭐ {item.CommunityRating.toFixed(1)}
                </Text>
              )}
            </View>

            {item.Overview && (
              <Text style={styles.overview}>{item.Overview}</Text>
            )}

            {/* Progress */}
            {item.UserData?.PlaybackPositionTicks && item.RunTimeTicks && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${(item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {formatRuntime(
                    item.RunTimeTicks - item.UserData.PlaybackPositionTicks,
                  )}{' '}
                  remaining
                </Text>
              </View>
            )}

            {/* Progress indicator is shown but button moved outside */}
          </View>
        </View>

        {/* Play Button Outside Nested Views for better tvOS focus - For Movies/Episodes */}
        {!isSeries && (
          <View style={styles.actionsRow}>
            <FocusableButton
              title={item.UserData?.PlaybackPositionTicks ? 'Resume' : 'Play'}
              onPress={handlePlay}
              size="large"
              hasTVPreferredFocus={true}
            />
          </View>
        )}

        {/* Seasons & Episodes for TV Series */}
        {isSeries && (
          <View style={styles.seasonsSection}>
            <Text style={styles.sectionTitle}>Seasons & Episodes</Text>

            {loadingSeasons ? (
              <Text style={styles.loadingText}>Loading seasons...</Text>
            ) : seasons.length > 0 ? (
              <>
                {/* Season Tabs */}
                <View style={styles.seasonTabsWrapper}>
                  {seasons.map((season, index) => (
                    <FocusableSeasonTab
                      key={season.Id}
                      season={season}
                      isSelected={selectedSeasonId === season.Id}
                      onPress={() => setSelectedSeasonId(season.Id)}
                      hasTVPreferredFocus={index === 0}
                    />
                  ))}
                </View>

                {/* Episodes List */}
                {loadingEpisodes ? (
                  <Text style={styles.loadingText}>Loading episodes...</Text>
                ) : episodes.length > 0 ? (
                  <View style={styles.episodesList}>
                    {episodes.map(episode => (
                      <FocusableEpisodeCard
                        key={episode.Id}
                        episode={episode}
                        jellyfin={jellyfin}
                        onPress={() => handleEpisodePlay(episode)}
                        formatRuntime={formatRuntime}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.loadingText}>No episodes found</Text>
                )}
              </>
            ) : (
              <Text style={styles.loadingText}>No seasons found</Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// Focusable Season Tab Component
interface FocusableSeasonTabProps {
  season: JellyfinItem;
  isSelected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

function FocusableSeasonTab({ season, isSelected, onPress, hasTVPreferredFocus }: FocusableSeasonTabProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.08,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  return (
    <TouchableOpacity
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          styles.seasonTab,
          isSelected && styles.seasonTabActive,
          isFocused && styles.seasonTabFocused,
          { transform: [{ scale: scaleValue }] },
        ]}
      >
        <Text
          style={[
            styles.seasonTabText,
            (isSelected || isFocused) && styles.seasonTabTextActive,
          ]}
        >
          {season.Name}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// Focusable Episode Card Component
interface FocusableEpisodeCardProps {
  episode: JellyfinItem;
  jellyfin: any;
  onPress: () => void;
  formatRuntime: (ticks?: number) => string;
}

function FocusableEpisodeCard({ episode, jellyfin, onPress, formatRuntime }: FocusableEpisodeCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.05,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  return (
    <TouchableOpacity
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.episodeCard,
          isFocused && styles.episodeCardFocused,
          { transform: [{ scale: scaleValue }] },
        ]}
      >
        {/* Episode Thumbnail */}
        {jellyfin && episode.ImageTags?.Primary ? (
          <Image
            source={{
              uri: jellyfin.getImageUrl(episode.Id, 'Primary', {
                maxWidth: 320,
              }),
            }}
            style={styles.episodeImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.episodeImage, styles.episodeImagePlaceholder]}>
            <Text style={styles.episodeNumber}>
              E{episode.IndexNumber ?? '?'}
            </Text>
          </View>
        )}

        {/* Episode Info */}
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeCardTitle} numberOfLines={1}>
            {episode.IndexNumber ?? '?'}. {episode.Name ?? 'Unknown Episode'}
          </Text>
          {episode.RunTimeTicks && (
            <Text style={styles.episodeRuntime}>
              {formatRuntime(episode.RunTimeTicks)}
            </Text>
          )}
          {episode.Overview && (
            <Text style={styles.episodeOverview} numberOfLines={2}>
              {episode.Overview}
            </Text>
          )}
          {/* Progress indicator */}
          {episode.UserData?.PlaybackPositionTicks && episode.RunTimeTicks && (
            <View style={styles.episodeProgressContainer}>
              <View style={styles.episodeProgressBar}>
                <View
                  style={[
                    styles.episodeProgressFill,
                    {
                      width: `${(episode.UserData.PlaybackPositionTicks / episode.RunTimeTicks) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
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
    marginTop: height * 0.25,
    padding: 48,
  },
  topBar: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  backButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonFocused: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  backButtonIcon: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
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
    marginBottom: 8,
  },
  episodeTitle: {
    color: '#ccc',
    fontSize: 24,
    marginBottom: 16,
  },
  metadata: {
    flexDirection: 'row',
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  metadataItem: {
    color: '#888',
    fontSize: 18,
    marginRight: 24,
    marginBottom: 8,
  },
  overview: {
    color: '#ccc',
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 3,
  },
  progressText: {
    color: '#888',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 24,
    marginBottom: 24,
  },
  seasonsSection: {
    marginTop: 48,
    width: '100%',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  seasonTabsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
    gap: 12,
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
  seasonTabFocused: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#007AFF',
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
  episodeCardFocused: {
    backgroundColor: '#222',
    borderWidth: 4,
    borderColor: '#fff',
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
  episodeCardTitle: {
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
  episodeProgressContainer: {
    marginTop: 8,
  },
  episodeProgressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  episodeProgressFill: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 2,
  },
});
