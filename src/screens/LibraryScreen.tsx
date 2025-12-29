import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaCard, LoadingScreen } from '../components';
import { useResponsiveColumns } from '../hooks';
import { JellyfinLibrary, JellyfinItem } from '../types';

interface LibraryScreenProps {
  filterType?: 'movies' | 'tvshows';
}

export function LibraryScreen({ filterType }: LibraryScreenProps = {}) {
  const navigation = useNavigation();
  const { jellyfin, isJellyfinConnected } = useServices();
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<JellyfinLibrary | null>(null);
  const [items, setItems] = useState<JellyfinItem[]>([]);
  const [isLoadingLibraries, setIsLoadingLibraries] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const { numColumns, itemWidth, spacing } = useResponsiveColumns();

  const loadLibraries = useCallback(async () => {
    if (!jellyfin) return;

    try {
      const libs = await jellyfin.getLibraries();
      // Filter libraries based on filterType if provided
      const filteredLibs = filterType
        ? libs.filter(lib => lib.CollectionType === filterType)
        : libs;
      setLibraries(filteredLibs);
      if (filteredLibs.length > 0 && !selectedLibrary) {
        setSelectedLibrary(filteredLibs[0]);
      }
    } catch (error) {
      console.error('Failed to load libraries:', error);
    } finally {
      setIsLoadingLibraries(false);
    }
  }, [jellyfin, selectedLibrary, filterType]);

  const loadLibraryItems = useCallback(async () => {
    if (!jellyfin || !selectedLibrary) return;

    setIsLoadingItems(true);
    try {
      const result = await jellyfin.getLibraryItems(selectedLibrary.Id, {
        limit: 100,
        includeItemTypes:
          selectedLibrary.CollectionType === 'movies'
            ? ['Movie']
            : selectedLibrary.CollectionType === 'tvshows'
              ? ['Series']
              : undefined,
      });
      setItems(result.Items);
    } catch (error) {
      console.error('Failed to load library items:', error);
    } finally {
      setIsLoadingItems(false);
    }
  }, [jellyfin, selectedLibrary]);

  useEffect(() => {
    if (isJellyfinConnected) {
      loadLibraries();
    } else {
      setIsLoadingLibraries(false);
    }
  }, [isJellyfinConnected, loadLibraries]);

  useEffect(() => {
    if (selectedLibrary) {
      loadLibraryItems();
    }
  }, [selectedLibrary, loadLibraryItems]);

  const handleItemPress = (item: JellyfinItem) => {
    // @ts-ignore - navigation typing
    navigation.navigate('ItemDetails', { item });
  };

  const getImageUrl = (item: JellyfinItem): string | null => {
    if (!jellyfin) return null;
    return jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 400 });
  };

  if (!isJellyfinConnected) {
    const title = filterType === 'movies' ? 'Movies' : filterType === 'tvshows' ? 'TV Shows' : 'Library';
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>
          Connect to your Jellyfin server in Settings to browse your library
        </Text>
      </View>
    );
  }

  if (isLoadingLibraries) {
    return <LoadingScreen message="Loading libraries..." />;
  }

  return (
    <View style={styles.container}>
      {/* Library Content */}
      {isLoadingItems ? (
        <LoadingScreen message="Loading items..." />
      ) : (
        <FlatList
          data={items}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          keyExtractor={item => item.Id}
          renderItem={({ item }) => (
            <MediaCard
              item={item}
              imageUrl={getImageUrl(item)}
              onPress={() => handleItemPress(item)}
              width={itemWidth}
            />
          )}
          contentContainerStyle={[
            styles.gridContent,
            { paddingHorizontal: spacing, paddingTop: spacing }
          ]}
          columnWrapperStyle={styles.gridRow}
          removeClippedSubviews={true}
          tvParallaxProperties={undefined}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Text style={styles.emptyText}>No items in this library</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  gridContent: {
    paddingBottom: 48,
  },
  gridRow: {
    justifyContent: 'space-between',
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
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
});
