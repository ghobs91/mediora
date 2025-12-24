import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaCard, LoadingScreen } from '../components';
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
      {/* Library Tabs */}
      <ScrollView
        horizontal
        style={styles.tabContainer}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabContent}>
        {libraries.map(library => (
          <LibraryTab
            key={library.Id}
            library={library}
            isSelected={selectedLibrary?.Id === library.Id}
            onPress={() => setSelectedLibrary(library)}
          />
        ))}
      </ScrollView>

      {/* Library Content */}
      {isLoadingItems ? (
        <LoadingScreen message="Loading items..." />
      ) : (
        <FlatList
          data={items}
          numColumns={6}
          keyExtractor={item => item.Id}
          renderItem={({ item }) => (
            <MediaCard
              item={item}
              imageUrl={getImageUrl(item)}
              onPress={() => handleItemPress(item)}
            />
          )}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
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

interface LibraryTabProps {
  library: JellyfinLibrary;
  isSelected: boolean;
  onPress: () => void;
}

function LibraryTab({ library, isSelected, onPress }: LibraryTabProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = React.useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  return (
    <TouchableOpacity
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}>
      <Animated.View
        style={[
          styles.tab,
          isSelected && styles.tabSelected,
          isFocused && styles.tabFocused,
          { transform: [{ scale: scaleValue }] },
        ]}>
        <Text
          style={[
            styles.tabText,
            isSelected && styles.tabTextSelected,
            isFocused && styles.tabTextFocused,
          ]}>
          {library.Name}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  tabContainer: {
    maxHeight: 80,
    paddingVertical: 16,
    marginTop: 24,
  },
  tabContent: {
    paddingHorizontal: 48,
  },
  tab: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginRight: 16,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabSelected: {
    backgroundColor: '#333',
  },
  tabFocused: {
    borderColor: '#fff',
  },
  tabText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
  },
  tabTextSelected: {
    color: '#fff',
  },
  tabTextFocused: {
    color: '#fff',
  },
  gridContent: {
    paddingHorizontal: 40,
    paddingBottom: 48,
  },
  gridRow: {
    justifyContent: 'flex-start',
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
