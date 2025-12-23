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

      setResumeItems(resume);
      setNextUpItems(nextUp);

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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            // @ts-ignore
            navigation.navigate('MainMenu');
          }}>
          <Text style={styles.backButtonText}>← Menu</Text>
        </TouchableOpacity>
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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            // @ts-ignore
            navigation.navigate('MainMenu');
          }}>
          <Text style={styles.backButtonText}>← Menu</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mediora</Text>
        {settings.jellyfin && (
          <Text style={styles.headerSubtitle}>
            Connected to {settings.jellyfin.serverUrl}
          </Text>
        )}
      </View>

      {!hasContent && (
        <View style={styles.emptyContainer}>
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
        title="Next Up"
        items={nextUpItems}
        onItemPress={handleItemPress}
        getImageUrl={getImageUrl}
      />

      <MediaRow
        title="Latest Movies"
        items={latestMovies}
        onItemPress={handleItemPress}
        getImageUrl={getImageUrl}
      />

      <MediaRow
        title="Latest Episodes"
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
  header: {
    padding: 48,
    paddingBottom: 24,
  },
  backButton: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 18,
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    backgroundColor: '#000',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 48,
  },
});
