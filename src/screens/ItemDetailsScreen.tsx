import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Text, Image, Dimensions, TouchableOpacity, FlatList, Alert, ImageBackground } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useServices, useSettings } from '../context';
import { FocusableButton, LoadingScreen, CastList } from '../components';
import { RootStackParamList, JellyfinItem, TMDBTVDetails, TMDBEpisode, TMDBCast, TMDBMovieDetails } from '../types';

type ItemDetailsRouteProp = RouteProp<RootStackParamList, 'ItemDetails'>;

interface EnrichedEpisode extends TMDBEpisode {
  jellyfinItem?: JellyfinItem;
  isAvailable: boolean;
}

interface EnrichedSeason {
  seasonNumber: number;
  name: string;
  posterPath: string | null;
  episodeCount: number;
  episodes: EnrichedEpisode[];
  isFullyAvailable: boolean;
}

export function ItemDetailsScreen() {
  const route = useRoute<ItemDetailsRouteProp>();
  const navigation = useNavigation();
  const { jellyfin, tmdb, sonarr, isSonarrConnected } = useServices();
  const { settings } = useSettings();
  const { item: initialItem } = route.params;

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

  const isMovie = initialItem.Type === 'Movie';
  const isSeriesOrEpisode = initialItem.Type === 'Series' || initialItem.Type === 'Episode';

  // Derived
  const backdropUrl = jellyfin?.getImageUrl?.(initialItem.Id, 'Backdrop', { maxWidth: 1920 }) ?? null;

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

        if (currentSeries && tmdb && currentSeries.ProviderIds?.Tmdb) {
          // Fetch TMDB Details
          const details = await tmdb.getTVDetails(parseInt(currentSeries.ProviderIds.Tmdb));
          setTmdbDetails(details);

          // Helper to load seasons structure
          const seasons: EnrichedSeason[] = details.seasons
            .filter(s => s.season_number > 0)
            .map(s => ({
              seasonNumber: s.season_number,
              name: s.name,
              posterPath: s.poster_path,
              episodeCount: s.episode_count,
              episodes: [],
              isFullyAvailable: false,
            }));

          setEnrichedSeasons(seasons);
          if (details.credits?.cast) {
            setCast(details.credits.cast);
          }

          // Fetch Jellyfin Episodes for availability
          let allEpisodes: JellyfinItem[] = [];
          if (jellyfin) {
            allEpisodes = await jellyfin.getEpisodes(currentSeries.Id);
            setJellyfinEpisodes(allEpisodes);
          }

          // Determine Initial Selection
          if (initialItem.Type === 'Episode') {
            const seasonNum = initialItem.ParentIndexNumber || 1;
            const seasonToSelect = seasons.find(s => s.seasonNumber === seasonNum) || seasons[0];
            if (seasonToSelect) {
              await loadSeasonEpisodes(seasonToSelect, parseInt(currentSeries.ProviderIds.Tmdb), allEpisodes || []);
            }
          } else {
            if (seasons.length > 0) {
              await loadSeasonEpisodes(seasons[0], parseInt(currentSeries.ProviderIds.Tmdb), allEpisodes || []);
            }
          }
        } else if (currentSeries && jellyfin) {
          // Fallback: Fetch from Jellyfin directly
          const allEpisodes = await jellyfin.getEpisodes(currentSeries.Id);
          setJellyfinEpisodes(allEpisodes);

          // Group by Season
          const seasonsMap = new Map<number, EnrichedSeason>();

          allEpisodes.forEach(ep => {
            const seasonNum = ep.ParentIndexNumber || 1;
            if (!seasonsMap.has(seasonNum)) {
              seasonsMap.set(seasonNum, {
                seasonNumber: seasonNum,
                name: ep.SeasonName || `Season ${seasonNum}`,
                posterPath: null, // Jellyfin doesn't always give season posters easily here without more queries
                episodeCount: 0,
                episodes: [],
                isFullyAvailable: true,
              });
            }
            const season = seasonsMap.get(seasonNum)!;
            season.episodeCount++;
            season.episodes.push({
              id: parseInt(ep.Id.replace(/[^0-9]/g, '').substring(0, 9)) || Math.floor(Math.random() * 100000), // Hack for ID
              name: ep.Name,
              episode_number: ep.IndexNumber || 0,
              season_number: seasonNum,
              overview: ep.Overview || '',
              still_path: null, // Use Jellyfin image instead
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

          // Initial Selection
          if (initialItem.Type === 'Episode') {
            const seasonNum = initialItem.ParentIndexNumber || 1;
            const seasonToSelect = seasons.find(s => s.seasonNumber === seasonNum) || seasons[0];
            if (seasonToSelect) {
              setSelectedSeason(seasonToSelect);
            }
          } else {
            if (seasons.length > 0) {
              setSelectedSeason(seasons[0]);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error initializing details:", e);
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
        return {
          ...tmdbEp,
          jellyfinItem: jellyfinEp,
          isAvailable: !!jellyfinEp,
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

  const handleSeasonSelect = (season: EnrichedSeason) => {
    if (!seriesItem?.ProviderIds?.Tmdb) return;
    loadSeasonEpisodes(season, parseInt(seriesItem.ProviderIds.Tmdb), jellyfinEpisodes);
  };

  const handleEpisodeSelect = (episode: EnrichedEpisode) => {
    setSelectedEpisode(episode);
  };

  const handlePlay = () => {
    let targetId = initialItem.Id; // Default to initial Item (works for Movie or specific Episode passed)

    if (selectedEpisode && selectedEpisode.jellyfinItem) {
      targetId = selectedEpisode.jellyfinItem.Id;
    }

    // Check availablity
    if (selectedEpisode && !selectedEpisode.isAvailable) {
      if (selectedSeason) handleRequestSeason(selectedSeason.seasonNumber);
      return;
    }

    // @ts-ignore
    navigation.navigate('Player', { itemId: targetId });
  };

  const handleRequestSeason = async (seasonNumber: number) => {
    if (!sonarr || !seriesItem?.ProviderIds?.Tvdb || !isSonarrConnected) {
      Alert.alert('Sonarr Not Connected', 'Please configure Sonarr in Settings.');
      return;
    }
    Alert.alert('Request Sent', `Requesting Season ${seasonNumber} (Functionality stubbed for now)`);
    // Implement actual request logic if needed reusing service calls
  };

  // Render Helpers
  const renderEpisodeCard = ({ item }: { item: EnrichedEpisode }) => {
    const isSelected = selectedEpisode?.id === item.id;
    let imageUrl = item.still_path ? `https://image.tmdb.org/t/p/w300${item.still_path}` : null;
    if (!imageUrl && item.jellyfinItem && jellyfin?.getImageUrl) {
      imageUrl = jellyfin.getImageUrl(item.jellyfinItem.Id, 'Primary', { maxWidth: 320 });
    }

    return (
      <TouchableOpacity
        style={[styles.episodeCard, isSelected && styles.episodeCardSelected]}
        onPress={() => handleEpisodeSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.episodeImageContainer}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.episodeThumbnail} />
          ) : (
            <View style={styles.episodePlaceholder}>
              <Icon name="tv-outline" size={30} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          {!item.isAvailable && (
            <View style={styles.unavailableOverlay}>
              <Icon name="cloud-download-outline" size={24} color="#FF9500" />
            </View>
          )}
        </View>
        <View style={styles.episodeCardContent}>
          <Text style={styles.episodeCardTitle} numberOfLines={1}>{item.episode_number}. {item.name}</Text>
          <Text style={styles.episodeCardOverview} numberOfLines={2}>{item.overview}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSeasonTab = (season: EnrichedSeason) => {
    const isSelected = selectedSeason?.seasonNumber === season.seasonNumber;
    return (
      <TouchableOpacity
        key={season.seasonNumber}
        style={[styles.seasonTab, isSelected && styles.seasonTabActive]}
        onPress={() => handleSeasonSelect(season)}
      >
        <Text style={[styles.seasonTabText, isSelected && styles.seasonTabTextActive]}>{season.name}</Text>
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

  if (isMovie) {
    heroTitle = movieDetails?.title || initialItem.Name;
    heroSubtitle = movieDetails ? `${new Date(movieDetails.release_date).getFullYear()} • ${movieDetails.runtime} min` : '';
    heroOverview = movieDetails?.overview || initialItem.Overview;
  } else {
    heroTitle = selectedEpisode ? selectedEpisode.name : (seriesItem?.SeriesName || seriesItem?.Name || '');
    heroSubtitle = selectedEpisode
      ? `S${selectedEpisode.season_number} • E${selectedEpisode.episode_number}`
      : (tmdbDetails ? `${tmdbDetails.number_of_seasons} Seasons` : '');
    heroOverview = selectedEpisode?.overview || seriesItem?.Overview;
  }

  return (
    <View style={styles.container}>
      <ImageBackground source={{ uri: heroImage || undefined }} style={styles.backdrop} resizeMode="cover">
        <View style={styles.backdropOverlay} />
        <View style={styles.gradientOverlay} />
      </ImageBackground>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Icon name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroContent}>
          {(isSeriesOrEpisode && seriesItem) && <Text style={styles.seriesTitle}>{seriesItem.SeriesName || seriesItem.Name}</Text>}

          <Text style={styles.heroTitle}>{heroTitle}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{heroSubtitle}</Text>
            {selectedEpisode && <Text style={styles.metaText}> • {Math.round(selectedEpisode.vote_average * 10)}%</Text>}
            {isMovie && movieDetails && <Text style={styles.metaText}> • {Math.round(movieDetails.vote_average * 10)}%</Text>}
          </View>

          <Text style={styles.overview} numberOfLines={4}>{heroOverview}</Text>

          <View style={styles.actionRow}>
            <FocusableButton
              title={
                (selectedEpisode?.jellyfinItem?.UserData?.PlaybackPositionTicks || initialItem.UserData?.PlaybackPositionTicks)
                  ? "Resume" : "Play"
              }
              onPress={handlePlay}
              style={styles.playButton}
              icon="play"
            />
            {selectedEpisode && !selectedEpisode.isAvailable && (
              <FocusableButton
                title="Request"
                onPress={() => selectedSeason && handleRequestSeason(selectedSeason.seasonNumber)}
                variant="secondary"
                style={styles.actionButton}
                icon="download-outline"
              />
            )}
            <TouchableOpacity style={styles.circleButton}>
              <Icon name="heart-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.circleButton}>
              <Icon name="download-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionsContainer}>
          {/* Season Selector - TV Only */}
          {isSeriesOrEpisode && (
            <View style={styles.section}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seasonScroll}>
                {enrichedSeasons.map(renderSeasonTab)}
              </ScrollView>
            </View>
          )}

          {/* Episodes List - TV Only */}
          {isSeriesOrEpisode && selectedSeason && (
            <View style={styles.section}>
              <FlatList
                data={selectedSeason.episodes}
                renderItem={renderEpisodeCard}
                keyExtractor={item => String(item.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.episodesList}
              />
            </View>
          )}

          {/* Cast */}
          <CastList cast={cast} />
        </View>
      </ScrollView>
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height * 0.7, // Cover top 70%
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  gradientOverlay: { // Simulate gradient
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 40,
    zIndex: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: height * 0.35, // Push content down
    paddingBottom: 50,
  },
  heroContent: {
    paddingHorizontal: 48,
    marginBottom: 40,
  },
  seriesTitle: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  metaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 10,
  },
  overview: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 700,
    marginBottom: 30,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    minWidth: 160,
  },
  actionButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sectionsContainer: {
    paddingLeft: 48,
    backgroundColor: '#000', // Solid background for list area
    paddingTop: 20,
  },
  section: {
    marginBottom: 30,
  },
  seasonScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  seasonTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  seasonTabActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: '#FFD700',
  },
  seasonTabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '600',
  },
  seasonTabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  episodesList: {
    paddingRight: 48,
  },
  episodeCard: {
    width: 300,
    marginRight: 16,
  },
  episodeCardSelected: {
    // Highlight style
    transform: [{ scale: 1.02 }],
  },
  episodeImageContainer: {
    width: 300,
    height: 169, // 16:9
    borderRadius: 12,
    backgroundColor: '#222',
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  episodeThumbnail: {
    width: '100%',
    height: '100%',
  },
  episodePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeCardContent: {
    paddingHorizontal: 4,
  },
  episodeCardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  episodeCardOverview: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
});
