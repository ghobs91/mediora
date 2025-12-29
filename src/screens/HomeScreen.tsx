import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaRow, LoadingScreen } from '../components';
import { JellyfinItem } from '../types';

export function HomeScreen() {
  const navigation = useNavigation();
  const { jellyfin, isJellyfinConnected } = useServices();
  const [resumeItems, setResumeItems] = useState<JellyfinItem[]>([]);
  const [nextUpItems, setNextUpItems] = useState<JellyfinItem[]>([]);
  const [latestMovies, setLatestMovies] = useState<JellyfinItem[]>([]);
  const [latestShows, setLatestShows] = useState<JellyfinItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!jellyfin) return;

    try {
      const [resume, nextUp, latest] = await Promise.all([
        jellyfin.getResumeItems(10),
        jellyfin.getNextUp(10),
        jellyfin.getLatestMedia(undefined, 20),
      ]);

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

      setResumeItems(finalResumeItems.slice(0, 15));
      setNextUpItems([]);

      // Separate movies and episodes
      const movies = latest.filter(item => item.Type === 'Movie');
      const episodes = latest.filter(item => item.Type === 'Episode' || item.Type === 'Series');

      setLatestMovies(movies);
      setLatestShows(episodes);
    } catch (error) {
      console.error('Failed to load home data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
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

  const handleRemoveFromContinueWatching = async (item: JellyfinItem) => {
    if (!jellyfin) return;

    try {
      const success = await jellyfin.removeFromContinueWatching(item.Id);
      if (success) {
        setResumeItems(prev => prev.filter(i => i.Id !== item.Id));
      }
    } catch (error) {
      console.error('Failed to remove item from continue watching:', error);
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
    } catch (error) {
      console.error('Failed to mark item as watched:', error);
    }
  };


  if (!isJellyfinConnected) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Welcome to Mediora</Text>
        <Text style={styles.emptyText}>
          Connect to your Jellyfin server in Settings to get started
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return <LoadingScreen message="Loading your media..." />;
  }

  const hasContent =
    resumeItems.length > 0 ||
    nextUpItems.length > 0 ||
    latestMovies.length > 0 ||
    latestShows.length > 0;


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
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
          <Text style={styles.emptyText}>
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
        getImageUrl={getImageUrl}
      />

      <MediaRow
        title="New Episodes"
        items={latestShows}
        onItemPress={handleItemPress}
        getImageUrl={getImageUrl}
      />

      <MediaRow
        title="New Movies"
        items={latestMovies}
        onItemPress={handleItemPress}
        getImageUrl={getImageUrl}
      />

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    paddingTop: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    backgroundColor: '#000',
    minHeight: 600,
  },
  emptyContentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    minHeight: 400,
  },
  emptyTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 42,
    fontWeight: '700',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 20,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 28,
  },
  bottomPadding: {
    height: 60,
  },
});
