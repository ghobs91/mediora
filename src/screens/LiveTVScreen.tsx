import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Platform,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useServices, useSettings } from '../context';
import { LoadingScreen } from '../components';
import { LiveTVChannel, EPGChannel } from '../types';
import { fetchChannelsFromCountries } from '../services/iptvManager';
import { epgService } from '../services/epg';
import { scaleSize, scaleFontSize } from '../utils/scaling';

const CHANNELS_PER_PAGE = 50;
const GUIDE_CHANNELS_PER_PAGE = 30;
const FAVORITES_STORAGE_KEY = 'livetv_favorites';

type ViewMode = 'channels' | 'guide';

export function LiveTVScreen() {
  const navigation = useNavigation();
  const { isJellyfinConnected } = useServices();
  const { settings } = useSettings();
  const [allChannels, setAllChannels] = useState<LiveTVChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<LiveTVChannel[]>([]);
  const [displayedChannels, setDisplayedChannels] = useState<LiveTVChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedChannelId, setFocusedChannelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('guide');
  const [epgData, setEpgData] = useState<EPGChannel[]>([]);
  const [isLoadingGuide, setIsLoadingGuide] = useState(false);
  const [epgLoadingMessage, setEpgLoadingMessage] = useState<string>('');
  const [epgError, setEpgError] = useState<string | null>(null);
  const [guideCurrentPage, setGuideCurrentPage] = useState(1);
  const [favoriteChannelIds, setFavoriteChannelIds] = useState<Set<string>>(new Set());
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [selectedChannelForFavorite, setSelectedChannelForFavorite] = useState<EPGChannel | null>(null);

  // Load favorites from storage
  const loadFavorites = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        setFavoriteChannelIds(new Set(JSON.parse(stored)));
      }
    } catch (err) {
      console.error('[LiveTV] Failed to load favorites:', err);
    }
  }, []);

  // Save favorites to storage
  const saveFavorites = useCallback(async (favorites: Set<string>) => {
    try {
      await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
    } catch (err) {
      console.error('[LiveTV] Failed to save favorites:', err);
    }
  }, []);

  // Toggle favorite status
  const toggleFavorite = useCallback((channelId: string) => {
    setFavoriteChannelIds(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(channelId)) {
        newFavorites.delete(channelId);
      } else {
        newFavorites.add(channelId);
      }
      saveFavorites(newFavorites);
      return newFavorites;
    });
  }, [saveFavorites]);

  const loadChannels = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    // Get selected IPTV countries from settings
    const selectedCountries = settings.iptv?.selectedCountries || [];
    
    // Show error if no countries selected
    if (selectedCountries.length === 0) {
      console.log('[LiveTV] No countries selected');
      setAllChannels([]);
      setFilteredChannels([]);
      setError('No countries selected. Go to Settings → Live TV to select countries.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    try {
      // Load IPTV channels from selected countries (client-side M3U parsing)
      console.log(`[LiveTV] Loading IPTV from ${selectedCountries.length} countries: ${selectedCountries.join(', ')}`);
      const iptvChannels = await fetchChannelsFromCountries(selectedCountries);
      console.log(`[LiveTV] Loaded ${iptvChannels.length} IPTV channels`);

      if (iptvChannels.length > 0) {
        setAllChannels(iptvChannels);
        setFilteredChannels(iptvChannels);
      } else {
        setAllChannels([]);
        setFilteredChannels([]);
        setError('No channels found. Try selecting different countries in Settings.');
      }
    } catch (err) {
      console.error('[LiveTV] Failed to load channels:', err);
      setAllChannels([]);
      setFilteredChannels([]);
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [settings.iptv?.selectedCountries]);

  const loadProgramGuide = useCallback(async (forceRefresh: boolean = false) => {
    const selectedCountries = settings.iptv?.selectedCountries || [];
    
    if (selectedCountries.length === 0 || allChannels.length === 0) {
      return;
    }

    setIsLoadingGuide(true);
    setEpgError(null);
    setEpgLoadingMessage('Initializing...');
    
    try {
      // Clear cache if force refresh
      if (forceRefresh) {
        console.log('[LiveTV] Force refresh - clearing EPG cache');
        await epgService.clearCache();
      }
      
      console.log(`[LiveTV] Loading EPG for countries: ${selectedCountries.join(', ')}`);
      
      const epgChannels = await epgService.fetchEPGData(
        allChannels,
        selectedCountries,
        (message: string) => setEpgLoadingMessage(message)
      );
      
      setEpgData(epgChannels);
      const withPrograms = epgChannels.filter(ch => ch.programs.length > 0).length;
      console.log(`[LiveTV] EPG loaded with ${epgChannels.length} channels, ${withPrograms} have program data`);
    } catch (err) {
      console.error('[LiveTV] Failed to load program guide:', err);
      setEpgError(err instanceof Error ? err.message : 'Failed to load program guide');
    } finally {
      setIsLoadingGuide(false);
      setEpgLoadingMessage('');
    }
  }, [settings.iptv?.selectedCountries, allChannels]);

  useEffect(() => {
    loadFavorites();
    loadChannels();
  }, [loadFavorites, loadChannels]);

  useEffect(() => {
    if (viewMode === 'guide') {
      loadProgramGuide();
    }
  }, [viewMode, loadProgramGuide]);

  // Filter and sort channels based on search query and favorites
  useEffect(() => {
    let filtered: LiveTVChannel[];
    
    if (!searchQuery.trim()) {
      filtered = allChannels;
    } else {
      const query = searchQuery.toLowerCase();
      filtered = allChannels.filter(channel =>
        channel.name.toLowerCase().includes(query) ||
        channel.group?.toLowerCase().includes(query)
      );
    }
    
    // Sort: favorites first, then by name
    const sorted = [...filtered].sort((a, b) => {
      const aFav = favoriteChannelIds.has(a.id);
      const bFav = favoriteChannelIds.has(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name);
    });
    
    setFilteredChannels(sorted);
    setCurrentPage(1); // Reset to first page on search
    setGuideCurrentPage(1); // Reset guide page too
  }, [searchQuery, allChannels, favoriteChannelIds]);

  // Paginate filtered channels
  useEffect(() => {
    const startIndex = (currentPage - 1) * CHANNELS_PER_PAGE;
    const endIndex = startIndex + CHANNELS_PER_PAGE;
    setDisplayedChannels(filteredChannels.slice(startIndex, endIndex));
  }, [filteredChannels, currentPage]);

  const totalPages = Math.ceil(filteredChannels.length / CHANNELS_PER_PAGE);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadChannels();
  };

  const handleChannelPress = (channel: LiveTVChannel) => {
    console.log('[LiveTV] Playing channel:', channel.name);
    (navigation as any).navigate('LivePlayer', {
      channelId: channel.id,
      channelName: channel.name,
      streamUrl: channel.url,
      logo: channel.logo,
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderChannelCard = ({ item: channel }: { item: LiveTVChannel }) => {
    const isFocused = focusedChannelId === channel.id;
    const isFavorite = favoriteChannelIds.has(channel.id);
    
    return (
      <TouchableOpacity
        style={[styles.channelCard, isFocused && styles.channelCardFocused]}
        onPress={() => handleChannelPress(channel)}
        onFocus={() => setFocusedChannelId(channel.id)}
        onBlur={() => setFocusedChannelId(null)}
        activeOpacity={0.7}
        focusable={true}>
        <View style={styles.channelImageContainer}>
          {channel.logo ? (
            <Image
              source={{ uri: channel.logo }}
              style={styles.channelLogo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderLogo}>
              <Icon name="tv" size={scaleSize(56)} color="rgba(255, 255, 255, 0.4)" />
            </View>
          )}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={(e) => {
              e.stopPropagation();
              toggleFavorite(channel.id);
            }}>
            <Icon 
              name={isFavorite ? "heart" : "heart-outline"} 
              size={scaleSize(32)} 
              color={isFavorite ? "#e50914" : "rgba(255, 255, 255, 0.7)"} 
            />
          </TouchableOpacity>
        </View>
        <View style={styles.channelInfo}>
          <Text style={styles.channelName} numberOfLines={2}>
            {channel.name}
          </Text>
          {channel.group && (
            <Text style={styles.channelGroup} numberOfLines={1}>
              {channel.group}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return <LoadingScreen message="Loading channels..." />;
  }

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="alert-circle-outline" size={scaleSize(88)} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={loadChannels} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (allChannels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="tv-outline" size={scaleSize(88)} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.emptyTitle}>No Live TV Channels</Text>
        <Text style={styles.emptyText}>
          {isJellyfinConnected
            ? 'Configure Live TV in your Jellyfin server or check your connection'
            : 'Connect to Jellyfin in Settings to access Live TV'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with search */}
      <View style={styles.header}>
        <View style={styles.controls}>
          <View style={styles.searchContainer}>
            <Icon name="search" size={scaleSize(28)} color="rgba(255, 255, 255, 0.5)" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search channels..."
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Icon name="close-circle" size={scaleSize(28)} color="rgba(255, 255, 255, 0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            Showing {displayedChannels.length} of {filteredChannels.length} channels
            {filteredChannels.length !== allChannels.length && ` (filtered from ${allChannels.length})`}
          </Text>
          
          {/* View Mode Toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleButton, viewMode === 'channels' && styles.toggleButtonActive]}
              onPress={() => setViewMode('channels')}>
              <Icon name="grid" size={scaleSize(24)} color={viewMode === 'channels' ? '#fff' : 'rgba(255,255,255,0.6)'} />
              <Text style={[styles.toggleText, viewMode === 'channels' && styles.toggleTextActive]}>
                Channels
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, viewMode === 'guide' && styles.toggleButtonActive]}
              onPress={() => setViewMode('guide')}>
              <Icon name="list" size={scaleSize(24)} color={viewMode === 'guide' ? '#fff' : 'rgba(255,255,255,0.6)'} />
              <Text style={[styles.toggleText, viewMode === 'guide' && styles.toggleTextActive]}>
                Guide
              </Text>
            </TouchableOpacity>
            {viewMode === 'guide' && (
              <TouchableOpacity
                style={styles.refreshGuideButton}
                onPress={() => loadProgramGuide(true)}
                disabled={isLoadingGuide}>
                <Icon name="refresh" size={scaleSize(28)} color={isLoadingGuide ? '#666' : '#fff'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      
      {viewMode === 'channels' ? (
        <>
          <FlatList
            data={displayedChannels}
            renderItem={renderChannelCard}
            keyExtractor={(item) => item.id}
            numColumns={4}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
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
            }
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                onPress={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}>
                <Icon name="chevron-back" size={scaleSize(28)} color={currentPage === 1 ? '#666' : '#fff'} />
              </TouchableOpacity>
              
              <View style={styles.pageInfo}>
                <Text style={styles.pageText}>
                  Page {currentPage} of {totalPages}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                onPress={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}>
                <Icon name="chevron-forward" size={scaleSize(28)} color={currentPage === totalPages ? '#666' : '#fff'} />
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <View style={styles.guideContainer}>
          {isLoadingGuide ? (
            <View style={styles.guideLoading}>
              <Icon name="hourglass-outline" size={48} color="rgba(255,255,255,0.5)" />
              <Text style={styles.guideLoadingTitle}>Loading Program Guide</Text>
              <Text style={styles.guideLoadingText}>{epgLoadingMessage || 'Please wait...'}</Text>
            </View>
          ) : epgError ? (
            <View style={styles.guideNotAvailable}>
              <Icon name="alert-circle-outline" size={48} color="rgba(255,100,100,0.5)" />
              <Text style={styles.guideNotAvailableTitle}>Failed to Load Guide</Text>
              <Text style={styles.guideNotAvailableText}>{epgError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadProgramGuide(true)}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : epgData.length === 0 ? (
            <View style={styles.guideNotAvailable}>
              <Icon name="calendar-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.guideNotAvailableTitle}>No Guide Data</Text>
              <Text style={styles.guideNotAvailableText}>
                Tap the refresh button to load the program guide.
              </Text>
            </View>
          ) : (
            <View style={styles.guideContent}>
              <ScrollView style={styles.guideScrollView}>
                {epgData
                  .filter(ch => {
                    // Filter by search query
                    if (!searchQuery.trim()) return ch.programs.length > 0;
                    const query = searchQuery.toLowerCase();
                    return ch.programs.length > 0 && 
                      (ch.displayName.toLowerCase().includes(query) || 
                       ch.id.toLowerCase().includes(query));
                  })
                  // Sort: favorites first
                  .sort((a, b) => {
                    const aFav = favoriteChannelIds.has(a.id);
                    const bFav = favoriteChannelIds.has(b.id);
                    if (aFav && !bFav) return -1;
                    if (!aFav && bFav) return 1;
                    return a.displayName.localeCompare(b.displayName);
                  })
                  .slice(
                    (guideCurrentPage - 1) * GUIDE_CHANNELS_PER_PAGE,
                    guideCurrentPage * GUIDE_CHANNELS_PER_PAGE
                  )
                  .map(channel => (
                <View key={channel.id} style={styles.guideChannel}>
                  <TouchableOpacity 
                    style={styles.guideChannelHeader}
                    onPress={() => {
                      // Find the original channel to get the stream URL
                      const originalChannel = allChannels.find(c => c.id === channel.id);
                      if (originalChannel) {
                        handleChannelPress(originalChannel);
                      }
                    }}
                    onLongPress={() => {
                      setSelectedChannelForFavorite(channel);
                      setShowFavoriteModal(true);
                    }}
                    delayLongPress={500}>
                    {channel.icon ? (
                      <Image source={{ uri: channel.icon }} style={styles.guideChannelLogo} />
                    ) : (
                      <View style={styles.guideChannelLogoPlaceholder}>
                        <Icon name="tv-outline" size={scaleSize(24)} color="#666" />
                      </View>
                    )}
                    <Text style={styles.guideChannelName} numberOfLines={1}>
                      {channel.displayName}
                    </Text>
                    <TouchableOpacity
                      style={styles.guideFavoriteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleFavorite(channel.id);
                      }}>
                      <Icon 
                        name={favoriteChannelIds.has(channel.id) ? "heart" : "heart-outline"} 
                        size={scaleSize(28)} 
                        color={favoriteChannelIds.has(channel.id) ? "#e50914" : "rgba(255, 255, 255, 0.5)"} 
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.guideProgramsRow}>
                    {channel.programs.slice(0, 10).map((program, idx) => {
                      const now = new Date();
                      const isCurrentlyAiring = program.start <= now && program.stop > now;
                      const startTime = program.start.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                      });
                      const endTime = program.stop.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                      });
                      
                      return (
                        <TouchableOpacity 
                          key={`${program.channelId}-${idx}`} 
                          style={[
                            styles.guideProgram,
                            isCurrentlyAiring && styles.guideProgramNow
                          ]}
                          onPress={() => {
                            // Find the original channel to get the stream URL
                            const originalChannel = allChannels.find(c => c.id === channel.id);
                            if (originalChannel) {
                              handleChannelPress(originalChannel);
                            }
                          }}
                          activeOpacity={0.7}>
                          <Text style={styles.guideProgramTime}>
                            {startTime} - {endTime}
                          </Text>
                          <Text style={styles.guideProgramTitle} numberOfLines={2}>
                            {program.title}
                          </Text>
                          {program.category && (
                            <Text style={styles.guideProgramCategory} numberOfLines={1}>
                              {program.category}
                            </Text>
                          )}
                          {isCurrentlyAiring && (
                            <View style={styles.nowBadge}>
                              <Text style={styles.nowBadgeText}>NOW</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ))}
              {epgData.filter(ch => ch.programs.length > 0).length === 0 && (
                <View style={styles.guideNotAvailable}>
                  <Text style={styles.guideNotAvailableText}>
                    No program data found for your channels.
                  </Text>
                </View>
              )}
              </ScrollView>
              
              {/* Guide Pagination */}
              {(() => {
                const filteredGuideChannels = epgData.filter(ch => {
                  if (!searchQuery.trim()) return ch.programs.length > 0;
                  const query = searchQuery.toLowerCase();
                  return ch.programs.length > 0 && 
                    (ch.displayName.toLowerCase().includes(query) || 
                     ch.id.toLowerCase().includes(query));
                });
                const totalGuidePages = Math.ceil(filteredGuideChannels.length / GUIDE_CHANNELS_PER_PAGE);
                
                return totalGuidePages > 1 ? (
                  <View style={styles.pagination}>
                    <TouchableOpacity
                      style={[styles.pageButton, guideCurrentPage === 1 && styles.pageButtonDisabled]}
                      onPress={() => setGuideCurrentPage(guideCurrentPage - 1)}
                      disabled={guideCurrentPage === 1}>
                      <Icon name="chevron-back" size={scaleSize(28)} color={guideCurrentPage === 1 ? '#666' : '#fff'} />
                    </TouchableOpacity>
                    
                    <View style={styles.pageInfo}>
                      <Text style={styles.pageText}>
                        Page {guideCurrentPage} of {totalGuidePages}
                      </Text>
                      <Text style={styles.pageSubtext}>
                        Showing {filteredGuideChannels.slice(
                          (guideCurrentPage - 1) * GUIDE_CHANNELS_PER_PAGE,
                          guideCurrentPage * GUIDE_CHANNELS_PER_PAGE
                        ).length} of {filteredGuideChannels.length} channels
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.pageButton, guideCurrentPage === totalGuidePages && styles.pageButtonDisabled]}
                      onPress={() => setGuideCurrentPage(guideCurrentPage + 1)}
                      disabled={guideCurrentPage === totalGuidePages}>
                      <Icon name="chevron-forward" size={scaleSize(28)} color={guideCurrentPage === totalGuidePages ? '#666' : '#fff'} />
                    </TouchableOpacity>
                  </View>
                ) : null;
              })()}
            </View>
          )}
        </View>
      )}

      {/* Favorite Modal */}
      <Modal
        visible={showFavoriteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFavoriteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedChannelForFavorite?.displayName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                if (selectedChannelForFavorite) {
                  toggleFavorite(selectedChannelForFavorite.id);
                  setShowFavoriteModal(false);
                }
              }}
              hasTVPreferredFocus={true}
              focusable={true}
              activeOpacity={0.7}>
              <Icon 
                name={selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) ? "heart" : "heart-outline"} 
                size={scaleSize(28)} 
                color={selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) ? "#e50914" : "#fff"} 
              />
              <Text style={styles.modalButtonText}>
                {selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) 
                  ? 'Remove from Favorites' 
                  : 'Add to Favorites'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonCancel]}
              onPress={() => setShowFavoriteModal(false)}
              focusable={true}
              activeOpacity={0.7}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: scaleSize(52),
  },
  controls: {
    flexDirection: 'row',
    padding: scaleSize(24),
    gap: scaleSize(20),
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scaleSize(12),
    paddingHorizontal: scaleSize(20),
    height: scaleSize(60),
  },
  searchIcon: {
    marginRight: scaleSize(12),
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: scaleFontSize(20),
    paddingVertical: scaleSize(12),
  },
  clearButton: {
    padding: scaleSize(8),
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scaleSize(24),
    paddingBottom: scaleSize(16),
  },
  statsText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(18),
    fontWeight: '500',
  },
  // Channel Grid Styles
  grid: {
    padding: scaleSize(32),
  },
  row: {
    justifyContent: 'flex-start',
    gap: scaleSize(32),
    marginBottom: scaleSize(32),
  },
  channelCard: {
    width: scaleSize(340),
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
    borderRadius: scaleSize(16),
    overflow: 'hidden',
    borderWidth: scaleSize(4),
    borderColor: 'transparent',
  },
  channelCardFocused: {
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: scaleSize(6) },
    shadowOpacity: 0.4,
    shadowRadius: scaleSize(16),
  },
  channelImageContainer: {
    width: '100%',
    height: scaleSize(190),
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  favoriteButton: {
    position: 'absolute',
    top: scaleSize(12),
    right: scaleSize(12),
    padding: scaleSize(10),
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: scaleSize(24),
  },
  channelLogo: {
    width: '100%',
    height: '100%',
  },
  placeholderLogo: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  channelInfo: {
    padding: scaleSize(20),
    minHeight: scaleSize(100),
  },
  channelName: {
    color: '#fff',
    fontSize: scaleFontSize(20),
    fontWeight: '600',
    marginBottom: scaleSize(6),
    lineHeight: scaleFontSize(28),
  },
  channelGroup: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: scaleFontSize(16),
    fontWeight: '500',
  },
  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: scaleSize(28),
    paddingHorizontal: scaleSize(32),
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: scaleSize(24),
  },
  pageButton: {
    padding: scaleSize(16),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scaleSize(12),
    minWidth: scaleSize(60),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageButtonDisabled: {
    opacity: 0.3,
  },
  pageInfo: {
    paddingHorizontal: scaleSize(28),
  },
  pageText: {
    color: '#fff',
    fontSize: scaleFontSize(20),
    fontWeight: '600',
  },
  pageSubtext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: scaleFontSize(16),
    marginTop: scaleSize(4),
  },
  // Empty/Error states
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSize(64),
    backgroundColor: '#000',
  },
  emptyTitle: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: scaleFontSize(44),
    fontWeight: '700',
    marginTop: scaleSize(32),
    marginBottom: scaleSize(16),
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(22),
    textAlign: 'center',
    lineHeight: scaleFontSize(32),
    maxWidth: scaleSize(600),
  },
  errorText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: scaleFontSize(22),
    textAlign: 'center',
    marginTop: scaleSize(32),
    marginBottom: scaleSize(32),
    maxWidth: scaleSize(600),
  },
  retryButton: {
    backgroundColor: '#e50914',
    paddingHorizontal: scaleSize(44),
    paddingVertical: scaleSize(18),
    borderRadius: scaleSize(12),
    marginTop: scaleSize(12),
  },
  retryButtonText: {
    color: '#fff',
    fontSize: scaleFontSize(20),
    fontWeight: '600',
  },
  // View Toggle
  viewToggle: {
    flexDirection: 'row',
    gap: scaleSize(12),
    alignItems: 'center',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(8),
    paddingHorizontal: scaleSize(20),
    paddingVertical: scaleSize(12),
    borderRadius: scaleSize(10),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  toggleButtonActive: {
    backgroundColor: '#e50914',
  },
  toggleText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(18),
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  refreshGuideButton: {
    padding: scaleSize(14),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scaleSize(10),
    marginLeft: scaleSize(8),
  },
  guideContainer: {
    flex: 1,
  },
  guideContent: {
    flex: 1,
  },
  guideList: {
    flex: 1,
  },
  guideChannelRow: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: 16,
  },
  guideChannelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 200,
    gap: 12,
  },
  guideChannelLogo: {
    width: scaleSize(56),
    height: scaleSize(56),
    borderRadius: scaleSize(8),
  },
  guideChannelLogoPlaceholder: {
    width: scaleSize(56),
    height: scaleSize(56),
    borderRadius: scaleSize(8),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideChannelName: {
    color: '#fff',
    fontSize: scaleFontSize(20),
    fontWeight: '600',
    flex: 1,
  },
  guideFavoriteButton: {
    padding: scaleSize(10),
    marginLeft: scaleSize(12),
  },
  guideProgramList: {
    flex: 1,
    gap: 8,
  },
  guideProgramItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  guideProgramTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(16),
    fontWeight: '600',
    width: scaleSize(90),
  },
  guideProgramTitle: {
    color: '#fff',
    fontSize: scaleFontSize(18),
    flex: 1,
  },
  noGuideData: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: scaleFontSize(18),
    fontStyle: 'italic',
  },
  guideNotAvailable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSize(44),
    gap: scaleSize(20),
  },
  guideNotAvailableTitle: {
    color: '#fff',
    fontSize: scaleFontSize(28),
    fontWeight: '600',
    textAlign: 'center',
  },
  guideNotAvailableText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(18),
    textAlign: 'center',
    lineHeight: scaleFontSize(28),
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(28, 28, 30, 0.98)',
    borderRadius: scaleSize(16),
    padding: scaleSize(32),
    width: scaleSize(500),
    borderWidth: 2,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: scaleSize(8) },
    shadowOpacity: 0.6,
    shadowRadius: scaleSize(20),
    elevation: 20,
  },
  modalHeader: {
    marginBottom: scaleSize(24),
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: scaleFontSize(24),
    fontWeight: '700',
    textAlign: 'center',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scaleSize(12),
    backgroundColor: '#e50914',
    paddingVertical: scaleSize(16),
    paddingHorizontal: scaleSize(24),
    borderRadius: scaleSize(10),
    marginBottom: scaleSize(12),
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: scaleFontSize(20),
    fontWeight: '600',
  },
  guideLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: scaleSize(20),
    padding: scaleSize(44),
  },
  guideLoadingTitle: {
    color: '#fff',
    fontSize: scaleFontSize(24),
    fontWeight: '600',
  },
  guideLoadingText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(18),
  },
  guideScrollView: {
    flex: 1,
  },
  guideChannel: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: scaleSize(16),
  },
  guideChannelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSize(24),
    marginBottom: scaleSize(12),
    gap: scaleSize(14),
  },
  guideProgramsRow: {
    paddingHorizontal: scaleSize(20),
  },
  guideProgram: {
    width: scaleSize(240),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: scaleSize(10),
    padding: scaleSize(16),
    marginHorizontal: scaleSize(6),
  },
  guideProgramNow: {
    backgroundColor: 'rgba(229, 9, 20, 0.3)',
    borderWidth: 2,
    borderColor: '#e50914',
  },
  guideProgramCategory: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: scaleFontSize(14),
    marginTop: scaleSize(6),
  },
  nowBadge: {
    position: 'absolute',
    top: scaleSize(6),
    right: scaleSize(6),
    backgroundColor: '#e50914',
    paddingHorizontal: scaleSize(8),
    paddingVertical: scaleSize(4),
    borderRadius: scaleSize(6),
  },
  nowBadgeText: {
    color: '#fff',
    fontSize: scaleFontSize(12),
    fontWeight: '700',
  },
});
