import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices, useSettings } from '../context';
import { MediaRow, LoadingScreen } from '../components';
import { JellyfinItem } from '../types';

export function HomeScreen() {
  const navigation = useNavigation();
  const { jellyfin, isJellyfinConnected } = useServices();
  const { settings } = useSettings();
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

      // Combine resume and next up, prioritizing resume items
      const combinedItems = [...resume];
      const resumeIds = new Set(resume.map(item => item.Id));
      nextUp.forEach(item => {
        if (!resumeIds.has(item.Id)) {
          combinedItems.push(item);
        }
      });
      setResumeItems(combinedItems.slice(0, 15));
      setNextUpItems([]);

      // Separate movies and episodes
      const movies = latest.filter(item => item.Type === 'Movie');
      const episodes = latest.filter(item => item.Type === 'Episode');

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
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor="#fff"
        />
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
        getImageUrl={getImageUrl}
      />

      <MediaRow
        title="New Movies"
        items={latestMovies}
        onItemPress={handleItemPress}
        getImageUrl={getImageUrl}
      />

      <MediaRow
        title="New Episodes"
        items={latestShows}
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
