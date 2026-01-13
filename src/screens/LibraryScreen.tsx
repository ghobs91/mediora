import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LiquidGlassView } from '@callstack/liquid-glass';
import { useServices } from '../context';
import { MediaCard, LoadingScreen } from '../components';
import { useResponsiveColumns } from '../hooks';
import { useDeviceType } from '../hooks/useResponsive';
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
  const { numColumns, itemWidth, isMobile, contentPadding } = useResponsiveColumns();
  const { isMobile: isMobileDevice } = useDeviceType();
  const insets = useSafeAreaInsets();

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

  // Dynamic styles based on device
  const dynamicStyles = {
    container: {
      paddingTop: 0,
    },
    dropdownSectionTitle: {
      fontSize: isMobile ? 11 : scaleFontSize(14),
      paddingHorizontal: isMobile ? 14 : scaleSize(20),
      paddingVertical: isMobile ? 8 : scaleSize(12),
    },
    dropdownItem: {
      paddingHorizontal: isMobile ? 14 : scaleSize(20),
      paddingVertical: isMobile ? 12 : scaleSize(16),
    },
    dropdownItemText: {
      fontSize: isMobile ? 14 : scaleFontSize(16),
    },
    gridContent: {
      paddingLeft: contentPadding,
      paddingRight: contentPadding,
      paddingTop: isMobile ? insets.top + 68 : scaleSize(20),
      paddingBottom: isMobile ? insets.bottom + 20 : scaleSize(52),
    },
    emptyContainer: {
      padding: contentPadding,
      paddingTop: isMobile ? insets.top + 68 : scaleSize(52),
    },
    emptyTitle: {
      fontSize: isMobile ? 24 : scaleFontSize(40),
      marginBottom: isMobile ? 12 : scaleSize(18),
    },
    emptyText: {
      fontSize: isMobile ? 14 : scaleFontSize(20),
    },
    emptyList: {
      paddingTop: isMobile ? 60 : scaleSize(120),
    },
    iconSize: isMobile ? 18 : scaleSize(22),
    checkmarkSize: isMobile ? 16 : scaleSize(20),
  };

  if (!isJellyfinConnected && !isSonarrConnected && !isRadarrConnected) {
    const title = filterType === 'movies' ? 'Movies' : filterType === 'tvshows' ? 'TV Shows' : 'Library';
    return (
      <View style={[styles.emptyContainer, dynamicStyles.emptyContainer]}>
        <Text style={[styles.emptyTitle, dynamicStyles.emptyTitle]}>{title}</Text>
        <Text style={[styles.emptyText, dynamicStyles.emptyText]}>
          Connect to Jellyfin, Sonarr, or Radarr in Settings to browse your library
        </Text>
      </View>
    );
  }

  if (isLoadingLibraries) {
    return <LoadingScreen message="Loading libraries..." />;
  }

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      {/* Floating Sort Pill Button (Mobile Only) */}
      {isMobileDevice && (
        <View style={[styles.floatingSortPill, { top: insets.top + 8 }]}>
          <LiquidGlassView
            style={styles.floatingPillGlass}
            effect="regular"
            tintColor="rgba(255, 255, 255, 0.25)">
            <TouchableOpacity
              style={styles.floatingPill}
              onPress={() => setShowSortMenu(!showSortMenu)}
              activeOpacity={0.7}>
              <Icon name="funnel-outline" size={18} color="rgba(60, 60, 67, 0.85)" />
              <Text style={styles.floatingPillText}>
                {sortBy === 'name' ? 'Name' :
                 sortBy === 'random' ? 'Random' :
                 sortBy === 'communityRating' ? 'Community Rating' :
                 sortBy === 'criticsRating' ? 'Critics Rating' :
                 sortBy === 'dateAdded' ? 'Date Added' :
                 sortBy === 'dateShowAdded' ? 'Date Show Added' :
                 sortBy === 'dateEpisodeAdded' ? 'Date Episode Added' :
                 sortBy === 'datePlayed' ? 'Date Played' :
                 sortBy === 'parentalRating' ? 'Parental Rating' :
                 sortBy === 'playCount' ? 'Play Count' :
                 sortBy === 'releaseDate' ? 'Release Date' :
                 sortBy === 'runtime' ? 'Runtime' : 'Sort'}
              </Text>
              <Icon name="chevron-down" size={16} color="rgba(60, 60, 67, 0.85)" />
            </TouchableOpacity>
          </LiquidGlassView>
        </View>
      )}
      
      {/* Centered Sort Modal */}
      {showSortMenu && (
        <Modal
          visible={showSortMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowSortMenu(false)}>
          <TouchableWithoutFeedback onPress={() => setShowSortMenu(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.sortModal}>
          <View style={styles.dropdownSection}>
            <Text style={[styles.dropdownSectionTitle, dynamicStyles.dropdownSectionTitle]}>Sort By</Text>
            {filterType === 'tvshows' ? (
              // TV Show sort options
              (['name', 'random', 'communityRating', 'dateShowAdded', 'dateEpisodeAdded', 'datePlayed', 'parentalRating', 'releaseDate'] as TVShowSortOption[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.dropdownItem, dynamicStyles.dropdownItem, sortBy === option && styles.dropdownItemActive]}
                  onPress={() => {
                    setSortBy(option);
                    setShowSortMenu(false);
                  }}>
                  <Text style={[styles.dropdownItemText, dynamicStyles.dropdownItemText, sortBy === option && styles.dropdownItemTextActive]}>
                    {option === 'name' ? 'Name' :
                     option === 'random' ? 'Random' :
                     option === 'communityRating' ? 'Community Rating' :
                     option === 'dateShowAdded' ? 'Date Show Added' :
                     option === 'dateEpisodeAdded' ? 'Date Episode Added' :
                     option === 'datePlayed' ? 'Date Played' :
                     option === 'parentalRating' ? 'Parental Rating' :
                     'Release Date'}
                  </Text>
                  {sortBy === option && <Icon name="radio-button-on" size={dynamicStyles.checkmarkSize} color="#8b5cf6" />}
                </TouchableOpacity>
              ))
            ) : (
              // Movie sort options
              (['name', 'random', 'communityRating', 'criticsRating', 'dateAdded', 'datePlayed', 'parentalRating', 'playCount', 'releaseDate', 'runtime'] as MovieSortOption[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.dropdownItem, dynamicStyles.dropdownItem, sortBy === option && styles.dropdownItemActive]}
                  onPress={() => {
                    setSortBy(option);
                    setShowSortMenu(false);
                  }}>
                  <Text style={[styles.dropdownItemText, dynamicStyles.dropdownItemText, sortBy === option && styles.dropdownItemTextActive]}>
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
                  {sortBy === option && <Icon name="radio-button-on" size={dynamicStyles.checkmarkSize} color="#8b5cf6" />}
                </TouchableOpacity>
              ))
            )}
          </View>
          <View style={styles.dropdownDivider} />
          <View style={styles.dropdownSection}>
            <Text style={[styles.dropdownSectionTitle, dynamicStyles.dropdownSectionTitle]}>Sort Order</Text>
            <TouchableOpacity
              style={[styles.dropdownItem, dynamicStyles.dropdownItem, sortOrder === 'ascending' && styles.dropdownItemActive]}
              onPress={() => {
                setSortOrder('ascending');
                setShowSortMenu(false);
              }}>
              <Text style={[styles.dropdownItemText, dynamicStyles.dropdownItemText, sortOrder === 'ascending' && styles.dropdownItemTextActive]}>Ascending</Text>
              {sortOrder === 'ascending' && <Icon name="radio-button-on" size={dynamicStyles.checkmarkSize} color="#8b5cf6" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownItem, dynamicStyles.dropdownItem, sortOrder === 'descending' && styles.dropdownItemActive]}
              onPress={() => {
                setSortOrder('descending');
                setShowSortMenu(false);
              }}>
              <Text style={[styles.dropdownItemText, dynamicStyles.dropdownItemText, sortOrder === 'descending' && styles.dropdownItemTextActive]}>Descending</Text>
              {sortOrder === 'descending' && <Icon name="radio-button-on" size={dynamicStyles.checkmarkSize} color="#8b5cf6" />}
            </TouchableOpacity>
          </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
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
            dynamicStyles.gridContent
          ]}
          columnWrapperStyle={styles.gridRow}
          removeClippedSubviews={true}
          tvParallaxProperties={undefined}
          ListEmptyComponent={
            <View style={[styles.emptyList, dynamicStyles.emptyList]}>
              <Text style={[styles.emptyText, dynamicStyles.emptyText]}>No items match your filters</Text>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sortModal: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    maxHeight: '80%',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 9998,
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
  floatingSortPill: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  floatingPillGlass: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 44,
    gap: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  floatingPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.85)',
    letterSpacing: 0.2,
  },
  floatingSortButton: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
  },
  floatingButtonGlass: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
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
