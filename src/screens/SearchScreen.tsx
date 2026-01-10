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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaRow, MediaCard } from '../components';
import { useResponsiveColumns, useDeviceType } from '../hooks';
import { TMDBMovie, TMDBTVShow, TMDBGenre } from '../types';

type ContentMode = 'movies' | 'tv';

export function SearchScreen() {
  const navigation = useNavigation();
  const { tmdb, isTMDBConnected } = useServices();
  const [query, setQuery] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('movies');
  const [results, setResults] = useState<(TMDBMovie | TMDBTVShow)[]>([]);
  const [movieGenres, setMovieGenres] = useState<TMDBGenre[]>([]);
  const [tvGenres, setTVGenres] = useState<TMDBGenre[]>([]);
  const [genreContent, setGenreContent] = useState<Record<number, (TMDBMovie | TMDBTVShow)[]>>({});
  const [trendingMovies, setTrendingMovies] = useState<TMDBMovie[]>([]);
  const [trendingTV, setTrendingTV] = useState<TMDBTVShow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { numColumns, itemWidth, spacing, isMobile } = useResponsiveColumns();
  const insets = useSafeAreaInsets();

  const dynamicStyles = {
    contentContainer: {
      paddingTop: isMobile ? insets.top + 60 : 48,
      paddingBottom: isMobile ? insets.bottom + 16 : 48,
    },
    searchContainer: {
      paddingHorizontal: isMobile ? 16 : 48,
      paddingTop: isMobile ? 16 : 24,
    },
    modeContainer: {
      paddingHorizontal: isMobile ? 16 : 48,
    },
  };

  const loadGenres = useCallback(async () => {
    if (!tmdb) return;

    try {
      const [movieGenresData, tvGenresData] = await Promise.all([
        tmdb.getMovieGenres(),
        tmdb.getTVGenres(),
      ]);
      setMovieGenres(movieGenresData.genres);
      setTVGenres(tvGenresData.genres);
    } catch (error) {
      console.error('Failed to load genres:', error);
    }
  }, [tmdb]);

  const loadTrending = useCallback(async (mode: ContentMode) => {
    if (!tmdb) return;

    try {
      const result = await tmdb.getTrending(
        mode === 'movies' ? 'movie' : 'tv',
        'week',
        1
      );
      
      if (mode === 'movies') {
        setTrendingMovies(result.results as TMDBMovie[]);
      } else {
        setTrendingTV(result.results as TMDBTVShow[]);
      }
    } catch (error) {
      console.error('Failed to load trending:', error);
    }
  }, [tmdb]);

  const loadGenreContent = useCallback(async (mode: ContentMode) => {
    if (!tmdb) return;

    try {
      const genres = mode === 'movies' ? movieGenres : tvGenres;
      const contentMap: Record<number, (TMDBMovie | TMDBTVShow)[]> = {};

      // Load popular content for each genre (limit to top 6 genres to avoid too many requests)
      const topGenres = genres.slice(0, 6);
      
      await Promise.all(
        topGenres.map(async (genre) => {
          try {
            const result = mode === 'movies' 
              ? await tmdb.discoverMovies(genre.id, 1)
              : await tmdb.discoverTV(genre.id, 1);
            contentMap[genre.id] = result.results;
          } catch (error) {
            console.error(`Failed to load content for genre ${genre.name}:`, error);
          }
        })
      );

      setGenreContent(contentMap);
    } catch (error) {
      console.error('Failed to load genre content:', error);
    }
  }, [tmdb, movieGenres, tvGenres]);

  React.useEffect(() => {
    if (isTMDBConnected) {
      loadGenres();
    }
  }, [isTMDBConnected, loadGenres]);

  React.useEffect(() => {
    if (isTMDBConnected && (movieGenres.length > 0 || tvGenres.length > 0)) {
      loadTrending(contentMode);
      loadGenreContent(contentMode);
    }
  }, [isTMDBConnected, contentMode, movieGenres, tvGenres, loadTrending, loadGenreContent]);

  const handleSearch = async () => {
    if (!tmdb || !query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const searchResults = contentMode === 'movies'
        ? await tmdb.searchMovies(query)
        : await tmdb.searchTV(query);
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
      <View style={[styles.emptyContainer, { paddingTop: isMobile ? insets.top + 60 : 48 }]}>
        <Text style={[styles.emptyTitle, isMobile && styles.emptyTitleMobile]}>Search</Text>
        <Text style={[styles.emptyText, isMobile && styles.emptyTextMobile]}>
          Configure your TMDB API key in Settings to search for movies and TV
          shows
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={dynamicStyles.contentContainer}>
      {/* Search Input */}
      <View style={[styles.searchContainer, dynamicStyles.searchContainer]}>
        <TextInput
          style={[styles.searchInput, isMobile && styles.searchInputMobile]}
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${contentMode === 'movies' ? 'movies' : 'TV shows'}...`}
          placeholderTextColor="#666"
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
      </View>

      {/* Content Mode Toggle */}
      <View style={[styles.modeContainer, dynamicStyles.modeContainer]}>
        <ContentModeTab
          title="Movies"
          isSelected={contentMode === 'movies'}
          onPress={() => {
            setContentMode('movies');
            setQuery('');
            setHasSearched(false);
            setResults([]);
          }}
        />
        <ContentModeTab
          title="TV Shows"
          isSelected={contentMode === 'tv'}
          onPress={() => {
            setContentMode('tv');
            setQuery('');
            setHasSearched(false);
            setResults([]);
          }}
        />
      </View>

      {isSearching ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : hasSearched ? (
        results.length > 0 ? (
          <View style={[styles.resultsContainer, { paddingHorizontal: spacing }]}>
            <View style={styles.resultsGrid}>
              {results.map((item, index) => (
                <MediaCard
                  key={`result-${item.id}-${index}`}
                  tmdbItem={item}
                  onPress={() => handleItemPress(item)}
                  width={itemWidth}
                />
              ))}
            </View>
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
          {/* Trending Section */}
          {contentMode === 'movies' && trendingMovies.length > 0 && (
            <MediaRow
              title="Trending Movies This Week"
              tmdbItems={trendingMovies}
              onItemPress={handleItemPress}
            />
          )}
          {contentMode === 'tv' && trendingTV.length > 0 && (
            <MediaRow
              title="Trending TV Shows This Week"
              tmdbItems={trendingTV}
              onItemPress={handleItemPress}
            />
          )}

          {/* Popular Content by Genre */}
          {(contentMode === 'movies' ? movieGenres : tvGenres)
            .slice(0, 6)
            .map((genre) => (
              genreContent[genre.id] && genreContent[genre.id].length > 0 && (
                <MediaRow
                  key={`genre-${genre.id}`}
                  title={`Popular ${genre.name}`}
                  tmdbItems={genreContent[genre.id]}
                  onItemPress={handleItemPress}
                />
              )
            ))}
        </>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

interface ContentModeTabProps {
  title: string;
  isSelected: boolean;
  onPress: () => void;
}

function ContentModeTab({ title, isSelected, onPress }: ContentModeTabProps) {
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
  contentContainer: {
    paddingTop: 48,
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
    fontSize: 18,
    color: '#fff',
    borderWidth: 2,
    borderColor: '#333',
  },
  searchInputMobile: {
    padding: 12,
    fontSize: 16,
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
  resultsContainer: {
    width: '100%',
  },
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
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
    textAlign: 'center',
  },
  emptyTitleMobile: {
    fontSize: 24,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    textAlign: 'center',
  },
  emptyTextMobile: {
    fontSize: 15,
  },
  bottomPadding: {
    height: 48,
  },
});
