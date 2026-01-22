import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaRow, LoadingScreen } from '../components';
import { JellyfinItem } from '../types';
import { scaleSize, scaleFontSize } from '../utils/scaling';
import { useDeviceType } from '../hooks/useResponsive';
import { TMDBService } from '../services';

export function HomeScreen() {
  const navigation = useNavigation();
  const { jellyfin, isJellyfinConnected } = useServices();
  const { isMobile } = useDeviceType();
  const insets = useSafeAreaInsets();
  const [resumeItems, setResumeItems] = useState<JellyfinItem[]>([]);
  const [nextUpItems, setNextUpItems] = useState<JellyfinItem[]>([]);
  const [latestMovies, setLatestMovies] = useState<JellyfinItem[]>([]);
  const [latestShows, setLatestShows] = useState<JellyfinItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesBackdrops, setSeriesBackdrops] = useState<Map<string, string>>(new Map());

  const dynamicStyles = {
    contentContainer: {
      paddingTop: isMobile ? insets.top + 60 : scaleSize(52),
      paddingBottom: isMobile ? insets.bottom + 16 : scaleSize(64),
    },
    emptyContainer: {
      paddingTop: isMobile ? insets.top + 60 : scaleSize(52),
      padding: isMobile ? 24 : scaleSize(52),
    },
  };

  const loadData = useCallback(async () => {
    if (!jellyfin) return;

    let isCancelled = false;
    setError(null);

    try {
      const [resume, nextUp, latest] = await Promise.all([
        jellyfin.getResumeItems(10),
        jellyfin.getNextUp(10),
        jellyfin.getLatestMedia(undefined, 20),
      ]);

      if (isCancelled) return;

      // Combine resume and next up candidates
      const allResumeCandidates = [...resume, ...nextUp];

      // Deduplicate items by SeriesId, keeping only the latest episode
      const seriesBestEpisodeMap = new Map<string, JellyfinItem>();
      const processedSeriesIds = new Set<string>();
      const processedItemIds = new Set<string>();

      // First pass: Find the "best" (latest) episode for each series
      allResumeCandidates.forEach(item => {
        if (item.Type !== 'Episode' || !item.SeriesId) return;

        const existingBest = seriesBestEpisodeMap.get(item.SeriesId);
        if (!existingBest) {
          seriesBestEpisodeMap.set(item.SeriesId, item);
        } else {
          // Compare to see which is "later"
          const currentSeason = item.ParentIndexNumber ?? -1;
          const currentEpisode = item.IndexNumber ?? -1;
          const bestSeason = existingBest.ParentIndexNumber ?? -1;
          const bestEpisode = existingBest.IndexNumber ?? -1;

          if (
            currentSeason > bestSeason ||
            (currentSeason === bestSeason && currentEpisode > bestEpisode)
          ) {
            seriesBestEpisodeMap.set(item.SeriesId, item);
          }
        }
      });

      // Second pass: Build final list preserving order of first appearance
      const finalResumeItems: JellyfinItem[] = [];

      allResumeCandidates.forEach(item => {
        // Skip if we've already included this specific item ID (handle exact duplicates)
        if (processedItemIds.has(item.Id)) return;

        if (item.Type === 'Episode' && item.SeriesId) {
          // Check if this series has already been added to the final list
          if (processedSeriesIds.has(item.SeriesId)) return;

          // Add the BEST episode for this series
          const bestEpisode = seriesBestEpisodeMap.get(item.SeriesId);
          if (bestEpisode) {
            finalResumeItems.push(bestEpisode);
            processedSeriesIds.add(item.SeriesId);
            processedItemIds.add(bestEpisode.Id);
            // Also mark the original item as processed so we don't try to add it again
            if (bestEpisode.Id !== item.Id) {
              processedItemIds.add(item.Id);
            }
          }
        } else {
          // Not an episode (or no SeriesId), just add it
          finalResumeItems.push(item);
          processedItemIds.add(item.Id);
        }
      });

      const finalResumeSlice = finalResumeItems.slice(0, 15);
      setResumeItems(finalResumeSlice);
      setNextUpItems([]);

      // Separate movies and episodes
      const movies = latest.filter(item => item.Type === 'Movie');
      const episodes = latest.filter(item => item.Type === 'Episode' || item.Type === 'Series');
      const episodesSlice = episodes.slice(0, 10);

      const moviesSlice = movies.slice(0, 10);
      setLatestMovies(moviesSlice);
      setLatestShows(episodesSlice);
      
      // Fetch TMDB backdrops in background (non-blocking)
      setTimeout(() => {
        fetchMediaBackdrops([...finalResumeSlice, ...episodesSlice, ...moviesSlice]);
      }, 100);
    } catch (err) {
      console.error('Failed to load home data:', err);
      if (!isCancelled) {
        if (err instanceof Error && err.message.includes('Network request failed')) {
          setError('Unable to connect to your Jellyfin server. Please check your network connection and server settings.');
        } else {
          setError('Failed to load media. Please try again.');
        }
      }
    } finally {
      if (!isCancelled) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [jellyfin]);

  useEffect(() => {
    if (isJellyfinConnected) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [isJellyfinConnected, loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const handleItemPress = (item: JellyfinItem) => {
    // @ts-ignore - navigation typing
    navigation.navigate('ItemDetails', { item });
  };

  const getImageUrl = (item: JellyfinItem): string | null => {
    if (!jellyfin) return null;
    return jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 400 });
  };

  const getImageUrlWithBackdrop = (item: JellyfinItem): string | null => {
    if (!jellyfin) return null;
    
    // Check if we have a TMDB backdrop for this item (Series or Movie)
    if ((item.Type === 'Series' || item.Type === 'Movie') && seriesBackdrops.has(item.Id)) {
      const backdropUrl = seriesBackdrops.get(item.Id);
      return backdropUrl || null;
    }
    
    // Fall back to Jellyfin image
    return jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 400 });
  };

  const fetchMediaBackdrops = async (items: JellyfinItem[]) => {
    if (!jellyfin) return;
    
    const tmdb = new TMDBService();
    const newBackdrops = new Map<string, string>();
    
    // Get unique series IDs and movie IDs
    const seriesIds = new Set<string>();
    const movieIds = new Set<string>();
    
    items.forEach(item => {
      if (item.Type === 'Episode' && item.SeriesId) {
        seriesIds.add(item.SeriesId);
      } else if (item.Type === 'Movie') {
        movieIds.add(item.Id);
      }
    });
    
    // Helper function to process items in batches to avoid overwhelming the network
    const processBatch = async (ids: string[], processFn: (id: string) => Promise<void>) => {
      const batchSize = 3; // Process 3 at a time
      const batches = [];
      const idArray = Array.from(ids);
      
      for (let i = 0; i < idArray.length; i += batchSize) {
        batches.push(idArray.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        await Promise.all(batch.map(processFn));
        // Small delay between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    };
    
    // Process series
    await processBatch(seriesIds, async (seriesId) => {
      try {
        const seriesItem = await jellyfin.getItem(seriesId);
        const tmdbId = seriesItem?.ProviderIds?.Tmdb;
        
        if (tmdbId) {
          const images = await tmdb.getTVImages(tmdbId);
          if (images.backdrops && images.backdrops.length > 0) {
            const backdrop = images.backdrops.find(b => b.aspect_ratio >= 1.7 && b.aspect_ratio <= 1.8) || images.backdrops[0];
            const backdropUrl = TMDBService.getBackdropUrl(backdrop.file_path, 'w780');
            if (backdropUrl) {
              newBackdrops.set(seriesId, backdropUrl);
              return;
            }
          }
        }
        
        // Fallback to Jellyfin backdrop
        if (seriesItem?.BackdropImageTags && seriesItem.BackdropImageTags.length > 0) {
          const jellyfinBackdrop = jellyfin.getImageUrl(seriesId, 'Backdrop', { maxWidth: 780 });
          newBackdrops.set(seriesId, jellyfinBackdrop);
        }
      } catch (error) {
        // Silently fail for individual items
      }
    });
    
    // Process movies
    await processBatch(movieIds, async (movieId) => {
      try {
        const movieItem = await jellyfin.getItem(movieId);
        const tmdbId = movieItem?.ProviderIds?.Tmdb;
        
        if (tmdbId) {
          const images = await tmdb.getMovieImages(tmdbId);
          if (images.backdrops && images.backdrops.length > 0) {
            const backdrop = images.backdrops.find(b => b.aspect_ratio >= 1.7 && b.aspect_ratio <= 1.8) || images.backdrops[0];
            const backdropUrl = TMDBService.getBackdropUrl(backdrop.file_path, 'w780');
            if (backdropUrl) {
              newBackdrops.set(movieId, backdropUrl);
              return;
            }
          }
        }
        
        // Fallback to Jellyfin backdrop
        if (movieItem?.BackdropImageTags && movieItem.BackdropImageTags.length > 0) {
          const jellyfinBackdrop = jellyfin.getImageUrl(movieId, 'Backdrop', { maxWidth: 780 });
          newBackdrops.set(movieId, jellyfinBackdrop);
        }
      } catch (error) {
        // Silently fail for individual items
      }
    });
    
    setSeriesBackdrops(newBackdrops);
  };

  const handleRemoveFromContinueWatching = async (item: JellyfinItem) => {
    if (!jellyfin) return;

    try {
      const success = await jellyfin.removeFromContinueWatching(item.Id);
      if (success) {
        setResumeItems(prev => prev.filter(i => i.Id !== item.Id));
      }
    } catch (err) {
      console.error('Failed to remove item from continue watching:', err);
    }
  };

  const handleMarkAsWatched = async (item: JellyfinItem) => {
    if (!jellyfin) return;

    try {
      const success = await jellyfin.markPlayed(item.Id);
      if (success) {
        // Remove from continue watching list
        setResumeItems(prev => prev.filter(i => i.Id !== item.Id));
      }
    } catch (err) {
      console.error('Failed to mark item as watched:', err);
    }
  };

  const handleToggleFavorite = async (item: JellyfinItem, isFavorite: boolean) => {
    if (!jellyfin) return;

    try {
      const success = await jellyfin.toggleFavorite(item.Id, isFavorite);
      if (success) {
        // Update the item in all lists
        const updateItem = (i: JellyfinItem) => {
          if (i.Id === item.Id && i.UserData) {
            return { ...i, UserData: { ...i.UserData, IsFavorite: isFavorite } };
          }
          return i;
        };
        
        setResumeItems(prev => prev.map(updateItem));
        setNextUpItems(prev => prev.map(updateItem));
        setLatestMovies(prev => prev.map(updateItem));
        setLatestShows(prev => prev.map(updateItem));
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };


  if (!isJellyfinConnected) {
    return (
      <View style={[styles.emptyContainer, dynamicStyles.emptyContainer]}>
        <Text style={[styles.emptyTitle, isMobile && styles.emptyTitleMobile]}>Welcome to Mediora</Text>
        <Text style={[styles.emptyText, isMobile && styles.emptyTextMobile]}>
          Connect to your Jellyfin server in Settings to get started
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return <LoadingScreen message="Loading your media..." />;
  }

  if (error) {
    return (
      <View style={[styles.emptyContainer, dynamicStyles.emptyContainer]}>
        <Text style={[styles.errorText, isMobile && styles.errorTextMobile]}>
          {error}
        </Text>
      </View>
    );
  }

  const hasContent =
    resumeItems.length > 0 ||
    nextUpItems.length > 0 ||
    latestMovies.length > 0 ||
    latestShows.length > 0;


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={dynamicStyles.contentContainer}
      focusable={false}
      refreshControl={
        Platform.select({
          ios: (Platform.constants as any).interfaceIdiom === 'phone' ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
            />
          ) : undefined,
          default: (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
            />
          ),
        })
      }>
      {!hasContent && (
        <View style={styles.emptyContentContainer}>
          <Text style={[styles.emptyText, isMobile && styles.emptyTextMobile]}>
            No media found. Add some content to your Jellyfin server.
          </Text>
        </View>
      )}

      <MediaRow
        title="Continue Watching"
        items={resumeItems}
        onItemPress={handleItemPress}
        onItemRemove={handleRemoveFromContinueWatching}
        onItemMarkWatched={handleMarkAsWatched}
        onItemToggleFavorite={handleToggleFavorite}
        getImageUrl={getImageUrlWithBackdrop}
        landscape={true}
        useSeriesThumbnail={true}
      />

      <MediaRow
        title="New Episodes"
        items={latestShows}
        onItemPress={handleItemPress}
        onItemToggleFavorite={handleToggleFavorite}
        getImageUrl={getImageUrlWithBackdrop}
        landscape={true}
        useSeriesThumbnail={true}
      />

      <MediaRow
        title="New Movies"
        items={latestMovies}
        onItemPress={handleItemPress}
        onItemToggleFavorite={handleToggleFavorite}
        getImageUrl={getImageUrlWithBackdrop}
        landscape={true}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    paddingTop: scaleSize(52),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSize(52),
    backgroundColor: '#000',
    minHeight: scaleSize(640),
  },
  emptyContentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSize(52),
    minHeight: scaleSize(440),
  },
  emptyTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: scaleFontSize(48),
    fontWeight: '700',
    marginBottom: scaleSize(24),
    letterSpacing: 0.6,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  emptyTitleMobile: {
    fontSize: 28,
    marginBottom: 16,
  },
  errorText: {
    color: 'rgba(255, 69, 58, 1)',
    fontSize: scaleFontSize(22),
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: scaleSize(32),
    textShadowColor: 'rgba(255, 69, 58, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  errorTextMobile: {
    fontSize: 16,
    lineHeight: 24,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(22),
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: scaleSize(32),
  },
  emptyTextMobile: {
    fontSize: 16,
    lineHeight: 24,
  },
});
