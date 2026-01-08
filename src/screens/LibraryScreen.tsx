import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaCard, LoadingScreen } from '../components';
import { useResponsiveColumns } from '../hooks';
import { JellyfinLibrary, JellyfinItem, SonarrSeries, RadarrMovie, TMDBTVShow } from '../types';
import Icon from 'react-native-vector-icons/Ionicons';
import { scaleSize, scaleFontSize } from '../utils/scaling';

interface LibraryScreenProps {
  filterType?: 'movies' | 'tvshows';
}

// Combined item type that can be either Jellyfin or Sonarr/Radarr
interface CombinedLibraryItem {
  id: string;
  title: string;
  imageUrl: string | null;
  year?: string;
  overview?: string;
  source: 'jellyfin' | 'sonarr' | 'radarr';
  originalItem: JellyfinItem | SonarrSeries | RadarrMovie;
  downloadProgress?: number; // 0-1 for download progress
  isDownloading?: boolean;
}

interface SeriesDownloadProgress {
  seriesId: number;
  progress: number; // 0-1
  totalSize: number;
  downloadedSize: number;
}

type TVShowSortOption = 'name' | 'random' | 'communityRating' | 'dateShowAdded' | 'dateEpisodeAdded' | 'datePlayed' | 'parentalRating' | 'releaseDate';
type MovieSortOption = 'name' | 'random' | 'communityRating' | 'criticsRating' | 'dateAdded' | 'datePlayed' | 'parentalRating' | 'playCount' | 'releaseDate' | 'runtime';
type SortOption = TVShowSortOption | MovieSortOption;
type SortOrder = 'ascending' | 'descending';
type FilterOption = 'all' | 'watched' | 'unwatched' | 'favorites';

export function LibraryScreen({ filterType }: LibraryScreenProps = {}) {
  const navigation = useNavigation();
  const { jellyfin, sonarr, radarr, tmdb, isJellyfinConnected, isSonarrConnected, isRadarrConnected } = useServices();
  const [_libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<JellyfinLibrary | null>(null);
  const [items, setItems] = useState<CombinedLibraryItem[]>([]);
  const [isLoadingLibraries, setIsLoadingLibraries] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Map<number, SeriesDownloadProgress>>(new Map());
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ascending');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const { numColumns, itemWidth } = useResponsiveColumns();

  const loadSonarrDownloadProgress = useCallback(async () => {
    if (!sonarr || !isSonarrConnected) return;

    try {
      const queueData = await sonarr.getQueue();
      const progressMap = new Map<number, SeriesDownloadProgress>();

      // Group queue items by series and calculate overall progress
      queueData.records.forEach(item => {
        const existing = progressMap.get(item.seriesId);
        const downloaded = item.size - item.sizeleft;

        if (existing) {
          existing.totalSize += item.size;
          existing.downloadedSize += downloaded;
          existing.progress = existing.downloadedSize / existing.totalSize;
        } else {
          progressMap.set(item.seriesId, {
            seriesId: item.seriesId,
            totalSize: item.size,
            downloadedSize: downloaded,
            progress: downloaded / item.size,
          });
        }
      });

      setDownloadProgress(progressMap);
    } catch (error) {
      // Silently log network errors - queue data is optional and shouldn't block the UI
      if (error instanceof Error && error.message.includes('Cannot connect to Sonarr')) {
        console.log('[LibraryScreen] Sonarr queue unavailable - skipping download progress');
      } else {
        console.error('[LibraryScreen] Failed to load Sonarr queue:', error);
      }
    }
  }, [sonarr, isSonarrConnected]);

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

  const loadLibraryItemsBase = useCallback(async () => {
    setIsLoadingItems(true);
    const combinedItems: CombinedLibraryItem[] = [];
    
    try {
      // Load Jellyfin items if connected and library is selected
      if (jellyfin && isJellyfinConnected && selectedLibrary) {
        const result = await jellyfin.getLibraryItems(selectedLibrary.Id, {
          limit: 100,
          includeItemTypes:
            selectedLibrary.CollectionType === 'movies'
              ? ['Movie']
              : selectedLibrary.CollectionType === 'tvshows'
                ? ['Series']
                : undefined,
        });
        
        // Convert Jellyfin items to combined format
        const jellyfinItems: CombinedLibraryItem[] = result.Items.map(item => ({
          id: item.Id,
          title: item.Name,
          imageUrl: jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 400 }),
          year: item.ProductionYear?.toString(),
          overview: item.Overview,
          source: 'jellyfin' as const,
          originalItem: item,
        }));
        
        combinedItems.push(...jellyfinItems);
      }
      
      // Load Sonarr series if connected and viewing TV shows
      if (sonarr && isSonarrConnected && (!filterType || filterType === 'tvshows')) {
        try {
          const sonarrSeries = await sonarr.getAllSeries();
          
          // Convert Sonarr series to combined format
          const sonarrItems: CombinedLibraryItem[] = sonarrSeries.map(series => ({
            id: `sonarr-${series.id}`,
            title: series.title,
            imageUrl: series.images?.find(img => img.coverType === 'poster')?.remoteUrl || null,
            year: series.year?.toString(),
            overview: series.overview,
            source: 'sonarr' as const,
            originalItem: series,
          }));
          
          combinedItems.push(...sonarrItems);
        } catch (error) {
          console.error('Failed to load Sonarr series:', error);
        }
      }
      
      // Load Radarr movies if connected and viewing movies
      if (radarr && isRadarrConnected && (!filterType || filterType === 'movies')) {
        try {
          const radarrMovies = await radarr.getAllMovies();
          
          // Convert Radarr movies to combined format
          const radarrItems: CombinedLibraryItem[] = radarrMovies.map(movie => ({
            id: `radarr-${movie.id}`,
            title: movie.title,
            imageUrl: movie.images?.find(img => img.coverType === 'poster')?.remoteUrl || null,
            year: movie.year?.toString(),
            overview: movie.overview,
            source: 'radarr' as const,
            originalItem: movie,
          }));
          
          combinedItems.push(...radarrItems);
        } catch (error) {
          console.error('Failed to load Radarr movies:', error);
        }
      }
      
      // Remove duplicates (prefer Jellyfin items)
      const uniqueItems = Array.from(
        combinedItems.reduce((map, item) => {
          const key = item.title.toLowerCase().trim();
          const existing = map.get(key);
          
          // Prefer Jellyfin > Radarr/Sonarr
          if (!existing || (existing.source !== 'jellyfin' && item.source === 'jellyfin')) {
            map.set(key, item);
          }
          
          return map;
        }, new Map<string, CombinedLibraryItem>()).values()
      );
      
      // Sort by title
      uniqueItems.sort((a, b) => a.title.localeCompare(b.title));
      
      setItems(uniqueItems);
    } catch (error) {
      console.error('Failed to load library items:', error);
    } finally {
      setIsLoadingItems(false);
    }
  }, [jellyfin, sonarr, radarr, isJellyfinConnected, isSonarrConnected, isRadarrConnected, selectedLibrary, filterType]);

  // Apply download progress to items without causing re-fetches
  const itemsWithProgress = useMemo(() => {
    return items.map(item => {
      if (item.source === 'sonarr' && item.originalItem && 'id' in item.originalItem) {
        const seriesId = (item.originalItem as SonarrSeries).id;
        const progress = seriesId ? downloadProgress.get(seriesId) : undefined;
        return {
          ...item,
          downloadProgress: progress?.progress,
          isDownloading: !!progress,
        };
      }
      return item;
    });
  }, [items, downloadProgress]);

  // Apply filtering and sorting
  const filteredAndSortedItems = useMemo(() => {
    let result = [...itemsWithProgress];

    // Apply filtering (only works for Jellyfin items with UserData)
    if (filterBy !== 'all') {
      result = result.filter(item => {
        if (item.source !== 'jellyfin') return true; // Keep non-Jellyfin items
        const jellyfinItem = item.originalItem as JellyfinItem;
        
        switch (filterBy) {
          case 'watched':
            return jellyfinItem.UserData?.Played === true;
          case 'unwatched':
            return jellyfinItem.UserData?.Played !== true;
          case 'favorites':
            return jellyfinItem.UserData?.IsFavorite === true;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    result.sort((a, b) => {
      let compareResult = 0;
      
      switch (sortBy) {
        case 'name':
          compareResult = a.title.localeCompare(b.title);
          break;
          
        case 'random':
          // Random sort - use Math.random() centered around 0.5
          compareResult = Math.random() - 0.5;
          break;
          
        case 'communityRating':
          if (a.source === 'jellyfin' && b.source === 'jellyfin') {
            const ratingA = (a.originalItem as JellyfinItem).CommunityRating || 0;
            const ratingB = (b.originalItem as JellyfinItem).CommunityRating || 0;
            compareResult = ratingB - ratingA;
          }
          break;
          
        case 'criticsRating':
          // Jellyfin doesn't have a separate critics rating, use CommunityRating
          if (a.source === 'jellyfin' && b.source === 'jellyfin') {
            const ratingA = (a.originalItem as JellyfinItem).CommunityRating || 0;
            const ratingB = (b.originalItem as JellyfinItem).CommunityRating || 0;
            compareResult = ratingB - ratingA;
          }
          break;
          
        case 'dateAdded':
        case 'dateShowAdded':
          // Would need DateCreated field from Jellyfin API - fallback to title for now
          compareResult = a.title.localeCompare(b.title);
          break;
          
        case 'dateEpisodeAdded':
          // For TV shows, sort by latest episode added - fallback to title for now
          compareResult = a.title.localeCompare(b.title);
          break;
          
        case 'datePlayed':
          // Would need LastPlayedDate from UserData - fallback to title for now
          compareResult = a.title.localeCompare(b.title);
          break;
          
        case 'parentalRating':
          if (a.source === 'jellyfin' && b.source === 'jellyfin') {
            const ratingA = (a.originalItem as JellyfinItem).OfficialRating || '';
            const ratingB = (b.originalItem as JellyfinItem).OfficialRating || '';
            compareResult = ratingA.localeCompare(ratingB);
          }
          break;
          
        case 'playCount':
          if (a.source === 'jellyfin' && b.source === 'jellyfin') {
            const countA = (a.originalItem as JellyfinItem).UserData?.PlayCount || 0;
            const countB = (b.originalItem as JellyfinItem).UserData?.PlayCount || 0;
            compareResult = countB - countA;
          }
          break;
          
        case 'releaseDate':
          const yearA = parseInt(a.year || '0', 10);
          const yearB = parseInt(b.year || '0', 10);
          compareResult = yearB - yearA;
          break;
          
        case 'runtime':
          if (a.source === 'jellyfin' && b.source === 'jellyfin') {
            const runtimeA = (a.originalItem as JellyfinItem).RunTimeTicks || 0;
            const runtimeB = (b.originalItem as JellyfinItem).RunTimeTicks || 0;
            compareResult = runtimeB - runtimeA;
          }
          break;
          
        default:
          compareResult = 0;
      }
      
      // Apply sort order (ascending/descending)
      return sortOrder === 'ascending' ? compareResult : -compareResult;
    });

    return result;
  }, [itemsWithProgress, sortBy, sortOrder, filterBy]);

  useEffect(() => {
    if (isJellyfinConnected || isSonarrConnected || isRadarrConnected) {
      loadLibraries();
      loadLibraryItemsBase();
    } else {
      setIsLoadingLibraries(false);
    }
  }, [isJellyfinConnected, isSonarrConnected, isRadarrConnected, loadLibraries, loadLibraryItemsBase]);

  useEffect(() => {
    if (selectedLibrary || isSonarrConnected || isRadarrConnected) {
      loadLibraryItemsBase();
    }
  }, [selectedLibrary, isSonarrConnected, isRadarrConnected, loadLibraryItemsBase]);

  // Load and refresh download progress for Sonarr
  useEffect(() => {
    if (isSonarrConnected) {
      loadSonarrDownloadProgress();
      
      // Refresh progress every 10 seconds
      const interval = setInterval(() => {
        loadSonarrDownloadProgress();
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isSonarrConnected, loadSonarrDownloadProgress]);

  const handleItemPress = async (item: CombinedLibraryItem) => {
    if (item.source === 'jellyfin') {
      // @ts-ignore - navigation typing
      navigation.navigate('ItemDetails', { item: item.originalItem });
    } else if (item.source === 'sonarr') {
      // Try to find the series in Jellyfin by TVDB ID
      const sonarrSeries = item.originalItem as SonarrSeries;
      
      if (jellyfin && isJellyfinConnected && sonarrSeries.tvdbId) {
        try {
          const jellyfinResults = await jellyfin.searchByTvdbId(sonarrSeries.tvdbId.toString());
          if (jellyfinResults.length > 0) {
            // Found in Jellyfin, navigate to it
            // @ts-ignore - navigation typing
            navigation.navigate('ItemDetails', { item: jellyfinResults[0] });
            return;
          }
        } catch (error) {
          console.error('Failed to search Jellyfin for series:', error);
        }
      }
      
      // Not in Jellyfin, look up TMDB ID using TVDB ID, then navigate to TMDB details
      if (tmdb && sonarrSeries.tvdbId) {
        try {
          const tmdbResults = await tmdb.findByExternalId(sonarrSeries.tvdbId.toString(), 'tvdb_id');
          if (tmdbResults.results.length > 0) {
            const tmdbShow = tmdbResults.results[0] as TMDBTVShow;
            // @ts-ignore - navigation typing
            navigation.navigate('TMDBDetails', { item: tmdbShow, mediaType: 'tv' });
            return;
          }
        } catch (error) {
          console.error('Failed to find TMDB ID for series:', error);
        }
      }
      
      // Fallback: search by title
      if (tmdb) {
        try {
          const searchResults = await tmdb.searchTV(sonarrSeries.title);
          if (searchResults.results.length > 0) {
            const tmdbShow = searchResults.results[0] as TMDBTVShow;
            // @ts-ignore - navigation typing
            navigation.navigate('TMDBDetails', { item: tmdbShow, mediaType: 'tv' });
          }
        } catch (error) {
          console.error('Failed to search TMDB for series:', error);
        }
      }
    } else if (item.source === 'radarr') {
      // Try to find the movie in Jellyfin by TMDB ID
      const radarrMovie = item.originalItem as RadarrMovie;
      
      if (jellyfin && isJellyfinConnected && radarrMovie.tmdbId) {
        try {
          const jellyfinResults = await jellyfin.searchByTmdbId(radarrMovie.tmdbId.toString(), 'Movie');
          if (jellyfinResults.length > 0) {
            // Found in Jellyfin, navigate to it
            // @ts-ignore - navigation typing
            navigation.navigate('ItemDetails', { item: jellyfinResults[0] });
            return;
          }
        } catch (error) {
          console.error('Failed to search Jellyfin for movie:', error);
        }
      }
      
      // Not in Jellyfin, navigate to TMDB details using TMDB ID
      if (tmdb && radarrMovie.tmdbId) {
        try {
          const movieDetails = await tmdb.getMovieDetails(radarrMovie.tmdbId);
          // @ts-ignore - navigation typing
          navigation.navigate('TMDBDetails', { item: movieDetails, mediaType: 'movie' });
        } catch (error) {
          console.error('Failed to get movie details from TMDB:', error);
        }
      }
    }
  };

  const handleToggleFavorite = async (item: CombinedLibraryItem, isFavorite: boolean) => {
    if (!jellyfin || item.source !== 'jellyfin') return;

    try {
      const success = await jellyfin.toggleFavorite(item.id, isFavorite);
      if (success) {
        // Update the item in the list
        setItems(prev => prev.map(i => {
          if (i.id === item.id && i.source === 'jellyfin') {
            const jellyfinItem = i.originalItem as JellyfinItem;
            const updatedItem: CombinedLibraryItem = {
              ...i,
              originalItem: {
                ...jellyfinItem,
                UserData: jellyfinItem.UserData ? {
                  ...jellyfinItem.UserData,
                  IsFavorite: isFavorite,
                } : {
                  IsFavorite: isFavorite,
                  PlaybackPositionTicks: 0,
                  PlayCount: 0,
                  Played: false,
                },
              } as JellyfinItem,
            };
            return updatedItem;
          }
          return i;
        }));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  if (!isJellyfinConnected && !isSonarrConnected && !isRadarrConnected) {
    const title = filterType === 'movies' ? 'Movies' : filterType === 'tvshows' ? 'TV Shows' : 'Library';
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>
          Connect to Jellyfin, Sonarr, or Radarr in Settings to browse your library
        </Text>
      </View>
    );
  }

  if (isLoadingLibraries) {
    return <LoadingScreen message="Loading libraries..." />;
  }

  return (
    <View style={styles.container}>
      {/* Filter and Sort Bar */}
      <View style={styles.controlBar}>
        <View style={styles.controlGroup}>
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => {
              setShowSortMenu(!showSortMenu);
              setShowFilterMenu(false);
            }}>
            <Icon name="funnel-outline" size={scaleSize(22)} color="#fff" />
            <Text style={styles.controlButtonText}>Sort</Text>
            <Icon name={showSortMenu ? "chevron-up" : "chevron-down"} size={scaleSize(18)} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => {
              setShowFilterMenu(!showFilterMenu);
              setShowSortMenu(false);
            }}>
            <Icon name="filter-outline" size={scaleSize(22)} color="#fff" />
            <Text style={styles.controlButtonText}>Filter: {filterBy}</Text>
            <Icon name={showFilterMenu ? "chevron-up" : "chevron-down"} size={scaleSize(18)} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={styles.itemCount}>
          {filteredAndSortedItems.length} {filteredAndSortedItems.length === 1 ? 'item' : 'items'}
        </Text>
      </View>

      {/* Sort Menu Dropdown */}
      {showSortMenu && (
        <View style={styles.dropdownMenu}>
          <View style={styles.dropdownSection}>
            <Text style={styles.dropdownSectionTitle}>Sort By</Text>
            {filterType === 'tvshows' ? (
              // TV Show sort options
              (['name', 'random', 'communityRating', 'dateShowAdded', 'dateEpisodeAdded', 'datePlayed', 'parentalRating', 'releaseDate'] as TVShowSortOption[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.dropdownItem, sortBy === option && styles.dropdownItemActive]}
                  onPress={() => {
                    setSortBy(option);
                  }}>
                  <Text style={[styles.dropdownItemText, sortBy === option && styles.dropdownItemTextActive]}>
                    {option === 'name' ? 'Name' :
                     option === 'random' ? 'Random' :
                     option === 'communityRating' ? 'Community Rating' :
                     option === 'dateShowAdded' ? 'Date Show Added' :
                     option === 'dateEpisodeAdded' ? 'Date Episode Added' :
                     option === 'datePlayed' ? 'Date Played' :
                     option === 'parentalRating' ? 'Parental Rating' :
                     'Release Date'}
                  </Text>
                  {sortBy === option && <Icon name="radio-button-on" size={scaleSize(20)} color="#8b5cf6" />}
                </TouchableOpacity>
              ))
            ) : (
              // Movie sort options
              (['name', 'random', 'communityRating', 'criticsRating', 'dateAdded', 'datePlayed', 'parentalRating', 'playCount', 'releaseDate', 'runtime'] as MovieSortOption[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.dropdownItem, sortBy === option && styles.dropdownItemActive]}
                  onPress={() => {
                    setSortBy(option);
                  }}>
                  <Text style={[styles.dropdownItemText, sortBy === option && styles.dropdownItemTextActive]}>
                    {option === 'name' ? 'Name' :
                     option === 'random' ? 'Random' :
                     option === 'communityRating' ? 'Community Rating' :
                     option === 'criticsRating' ? 'Critics Rating' :
                     option === 'dateAdded' ? 'Date Added' :
                     option === 'datePlayed' ? 'Date Played' :
                     option === 'parentalRating' ? 'Parental Rating' :
                     option === 'playCount' ? 'Play Count' :
                     option === 'releaseDate' ? 'Release Date' :
                     'Runtime'}
                  </Text>
                  {sortBy === option && <Icon name="radio-button-on" size={scaleSize(20)} color="#8b5cf6" />}
                </TouchableOpacity>
              ))
            )}
          </View>
          <View style={styles.dropdownDivider} />
          <View style={styles.dropdownSection}>
            <Text style={styles.dropdownSectionTitle}>Sort Order</Text>
            <TouchableOpacity
              style={[styles.dropdownItem, sortOrder === 'ascending' && styles.dropdownItemActive]}
              onPress={() => setSortOrder('ascending')}>
              <Text style={[styles.dropdownItemText, sortOrder === 'ascending' && styles.dropdownItemTextActive]}>Ascending</Text>
              {sortOrder === 'ascending' && <Icon name="radio-button-on" size={scaleSize(20)} color="#8b5cf6" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownItem, sortOrder === 'descending' && styles.dropdownItemActive]}
              onPress={() => setSortOrder('descending')}>
              <Text style={[styles.dropdownItemText, sortOrder === 'descending' && styles.dropdownItemTextActive]}>Descending</Text>
              {sortOrder === 'descending' && <Icon name="radio-button-on" size={scaleSize(20)} color="#8b5cf6" />}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Filter Menu Dropdown */}
      {showFilterMenu && (
        <View style={styles.dropdownMenu}>
          {(['all', 'unwatched', 'watched', 'favorites'] as FilterOption[]).map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.dropdownItem, filterBy === option && styles.dropdownItemActive]}
              onPress={() => {
                setFilterBy(option);
                setShowFilterMenu(false);
              }}>
              <Text style={[styles.dropdownItemText, filterBy === option && styles.dropdownItemTextActive]}>
                {option === 'all' ? 'All Items' : 
                 option === 'unwatched' ? 'Unwatched' : 
                 option === 'watched' ? 'Watched' : 'Favorites'}
              </Text>
              {filterBy === option && <Icon name="checkmark" size={scaleSize(20)} color="#8b5cf6" />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Library Content */}
      {isLoadingItems ? (
        <LoadingScreen message="Loading items..." />
      ) : (
        <FlatList
          data={filteredAndSortedItems}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <MediaCard
              title={item.title}
              imageUrl={item.imageUrl}
              subtitle={item.year}
              onPress={() => handleItemPress(item)}
              onToggleFavorite={item.source === 'jellyfin' ? (isFavorite) => handleToggleFavorite(item, isFavorite) : undefined}
              item={item.source === 'jellyfin' ? item.originalItem as JellyfinItem : undefined}
              width={itemWidth}
              downloadProgress={item.downloadProgress}
              isDownloading={item.isDownloading}
            />
          )}
          contentContainerStyle={[
            styles.gridContent,
            { paddingLeft: scaleSize(52), paddingRight: scaleSize(52), paddingTop: scaleSize(20) }
          ]}
          columnWrapperStyle={styles.gridRow}
          removeClippedSubviews={true}
          tvParallaxProperties={undefined}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Text style={styles.emptyText}>No items match your filters</Text>
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
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scaleSize(52),
    paddingVertical: scaleSize(20),
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(139, 92, 246, 0.3)',
  },
  controlGroup: {
    flexDirection: 'row',
    gap: scaleSize(16),
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(10),
    paddingHorizontal: scaleSize(20),
    paddingVertical: scaleSize(12),
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: scaleSize(10),
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: scaleFontSize(16),
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  itemCount: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(16),
    fontWeight: '500',
  },
  dropdownMenu: {
    position: 'absolute',
    top: scaleSize(80),
    left: scaleSize(52),
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: scaleSize(12),
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    minWidth: scaleSize(280),
    maxHeight: scaleSize(600),
    zIndex: 9999,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 20,
  },
  dropdownSection: {
    paddingVertical: scaleSize(8),
  },
  dropdownSectionTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: scaleFontSize(14),
    fontWeight: '700',
    paddingHorizontal: scaleSize(20),
    paddingVertical: scaleSize(12),
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dropdownDivider: {
    height: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    marginVertical: scaleSize(4),
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scaleSize(20),
    paddingVertical: scaleSize(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: scaleFontSize(16),
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: '#a78bfa',
    fontWeight: '700',
  },
  gridContent: {
    paddingBottom: scaleSize(52),
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSize(52),
    backgroundColor: '#000',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: scaleFontSize(40),
    fontWeight: 'bold',
    marginBottom: scaleSize(18),
  },
  emptyText: {
    color: '#888',
    fontSize: scaleFontSize(20),
    textAlign: 'center',
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: scaleSize(120),
  },
});
