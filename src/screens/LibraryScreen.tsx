import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useServices } from '../context';
import { MediaCard, LoadingScreen } from '../components';
import { useResponsiveColumns } from '../hooks';
import { JellyfinLibrary, JellyfinItem, SonarrSeries, RadarrMovie, TMDBTVShow } from '../types';

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

export function LibraryScreen({ filterType }: LibraryScreenProps = {}) {
  const navigation = useNavigation();
  const { jellyfin, sonarr, radarr, tmdb, isJellyfinConnected, isSonarrConnected, isRadarrConnected } = useServices();
  const [_libraries, setLibraries] = useState<JellyfinLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<JellyfinLibrary | null>(null);
  const [items, setItems] = useState<CombinedLibraryItem[]>([]);
  const [isLoadingLibraries, setIsLoadingLibraries] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Map<number, SeriesDownloadProgress>>(new Map());
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
      console.error('Failed to load Sonarr queue:', error);
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
      {/* Library Content */}
      {isLoadingItems ? (
        <LoadingScreen message="Loading items..." />
      ) : (
        <FlatList
          data={itemsWithProgress}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <MediaCard
              title={item.title}
              imageUrl={item.imageUrl}
              subtitle={item.year}
              onPress={() => handleItemPress(item)}
              width={itemWidth}
              downloadProgress={item.downloadProgress}
              isDownloading={item.isDownloading}
            />
          )}
          contentContainerStyle={[
            styles.gridContent,
            { paddingLeft: 48, paddingRight: 48, paddingTop: 48 }
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
