import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaRow, MediaCard } from '../components';
import { TMDBMovie, TMDBTVShow } from '../types';

type SearchMode = 'all' | 'movies' | 'tv';

export function SearchScreen() {
  const navigation = useNavigation();
  const { tmdb, isTMDBConnected } = useServices();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('all');
  const [results, setResults] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<TMDBMovie[]>([]);
  const [trendingTV, setTrendingTV] = useState<TMDBTVShow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const loadTrending = useCallback(async () => {
    if (!tmdb) return;

    try {
      const [movies, tv] = await Promise.all([
        tmdb.getPopularMovies(),
        tmdb.getPopularTV(),
      ]);
      setTrendingMovies(movies.results as TMDBMovie[]);
      setTrendingTV(tv.results as TMDBTVShow[]);
    } catch (error) {
      console.error('Failed to load trending:', error);
    }
  }, [tmdb]);

  React.useEffect(() => {
    if (isTMDBConnected) {
      loadTrending();
    }
  }, [isTMDBConnected, loadTrending]);

  const handleSearch = async () => {
    if (!tmdb || !query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      let searchResults;
      switch (searchMode) {
        case 'movies':
          searchResults = await tmdb.searchMovies(query);
          break;
        case 'tv':
          searchResults = await tmdb.searchTV(query);
          break;
        default:
          searchResults = await tmdb.searchMulti(query);
      }
      setResults(searchResults.results);
    } catch (error) {
      console.error('Failed to search:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleItemPress = (item: TMDBMovie | TMDBTVShow) => {
    const mediaType = 'title' in item ? 'movie' : 'tv';
    // @ts-ignore - navigation typing
    navigation.navigate('TMDBDetails', { item, mediaType });
  };

  if (!isTMDBConnected) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Search</Text>
        <Text style={styles.emptyText}>
          Configure your TMDB API key in Settings to search for movies and TV
          shows
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies and TV shows..."
          placeholderTextColor="#666"
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
      </View>

      {/* Search Mode Tabs */}
      <View style={styles.modeContainer}>
        <SearchModeTab
          title="All"
          isSelected={searchMode === 'all'}
          onPress={() => setSearchMode('all')}
        />
        <SearchModeTab
          title="Movies"
          isSelected={searchMode === 'movies'}
          onPress={() => setSearchMode('movies')}
        />
        <SearchModeTab
          title="TV Shows"
          isSelected={searchMode === 'tv'}
          onPress={() => setSearchMode('tv')}
        />
      </View>

      {isSearching ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : hasSearched ? (
        results.length > 0 ? (
          <View style={styles.resultsGrid}>
            {results.map((item, index) => (
              <MediaCard
                key={`result-${item.id}-${index}`}
                tmdbItem={item}
                onPress={() => handleItemPress(item)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>
              No results found for "{query}"
            </Text>
          </View>
        )
      ) : (
        <>
          <MediaRow
            title="Popular Movies"
            tmdbItems={trendingMovies}
            onItemPress={handleItemPress}
          />
          <MediaRow
            title="Popular TV Shows"
            tmdbItems={trendingTV}
            onItemPress={handleItemPress}
          />
        </>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

interface SearchModeTabProps {
  title: string;
  isSelected: boolean;
  onPress: () => void;
}

function SearchModeTab({ title, isSelected, onPress }: SearchModeTabProps) {
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
          styles.modeTab,
          isSelected && styles.modeTabSelected,
          isFocused && styles.modeTabFocused,
          { transform: [{ scale: scaleValue }] },
        ]}>
        <Text
          style={[
            styles.modeTabText,
            (isSelected || isFocused) && styles.modeTabTextSelected,
          ]}>
          {title}
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
  searchContainer: {
    paddingHorizontal: 48,
    paddingTop: 24,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    fontSize: 20,
    color: '#fff',
    borderWidth: 2,
    borderColor: '#333',
  },
  modeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 48,
    marginBottom: 24,
  },
  modeTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeTabSelected: {
    backgroundColor: '#333',
  },
  modeTabFocused: {
    borderColor: '#fff',
  },
  modeTabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  modeTabTextSelected: {
    color: '#fff',
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 40,
  },
  noResults: {
    padding: 48,
    alignItems: 'center',
  },
  noResultsText: {
    color: '#888',
    fontSize: 18,
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
