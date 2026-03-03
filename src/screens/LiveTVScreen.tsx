import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView } from '@callstack/liquid-glass';
import Icon from 'react-native-vector-icons/Ionicons';
import Video, { VideoRef } from 'react-native-video';
import { useServices, useSettings } from '../context';
import { LoadingScreen } from '../components';
import { LiveTVChannel, EPGChannel, EPGProgram } from '../types';
import { fetchChannelsFromCountries } from '../services/iptvManager';
import { epgService } from '../services/epg';
import { IPTV_COUNTRIES } from '../services/iptv';
import { scaleSize, scaleFontSize } from '../utils/scaling';
import { useDeviceType } from '../hooks/useResponsive';

const CHANNELS_PER_PAGE = 50;
const FAVORITES_STORAGE_KEY = 'livetv_favorites';

// Self-contained filter chip with focus state for TV navigation
const FilterChip = React.memo(function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isActive && styles.filterChipActive,
        isFocused && styles.filterChipFocused,
      ]}
      onPress={onPress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      focusable={true}
      activeOpacity={0.8}>
      <Text
        style={[
          styles.filterChipText,
          isActive && styles.filterChipTextActive,
          isFocused && styles.filterChipTextFocused,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// Parse resolution from parentheses in channel name e.g. "CNN (HD)" → { cleanName: "CNN", resolution: "HD" }
// Also strips noise tags like [Not 24/7] and [Geo-Blocked]
function parseChannelName(name: string): { cleanName: string; resolution: string | null } {
  // Remove noise bracket tags
  let cleaned = name
    .replace(/\s*\[Not\s+24\/7\]\s*/gi, ' ')
    .replace(/\s*\[Geo[- ]?Blocked\]\s*/gi, ' ')
    .trim();

  // Extract resolution from parentheses
  const match = cleaned.match(/\s*\((UHD|FHD|HD|SD|8K|4K|2160[pi]?|1080[pi]|720[pi]?|576[pi]|480[pi]?)\)\s*/i);
  if (match) {
    return { cleanName: cleaned.replace(match[0], '').trim(), resolution: match[1].toUpperCase() };
  }
  return { cleanName: cleaned, resolution: null };
}

function getResolutionColors(resolution: string): { bg: string; textColor: string } {
  const r = resolution.toUpperCase();
  if (r === '4K' || r === 'UHD' || r === '8K' || r.startsWith('2160')) {
    return { bg: 'rgba(251, 191, 36, 0.9)', textColor: '#1a1000' };
  }
  if (r === 'FHD' || r.startsWith('1080')) {
    return { bg: 'rgba(99, 102, 241, 0.9)', textColor: '#fff' };
  }
  if (r === 'HD' || r.startsWith('720')) {
    return { bg: 'rgba(16, 185, 129, 0.85)', textColor: '#fff' };
  }
  return { bg: 'rgba(120, 120, 130, 0.85)', textColor: '#fff' };
}

const ResolutionBadge = React.memo(function ResolutionBadge({
  resolution,
  isMobile = false,
}: {
  resolution: string;
  isMobile?: boolean;
}) {
  const { bg, textColor } = getResolutionColors(resolution);
  return (
    <View style={[isMobile ? styles.resolutionBadgeSmall : styles.resolutionBadge, { backgroundColor: bg }]}>
      <Text style={[isMobile ? styles.resolutionBadgeSmallText : styles.resolutionBadgeText, { color: textColor }]}>
        {resolution}
      </Text>
    </View>
  );
});

export function LiveTVScreen() {
  const navigation = useNavigation();
  const { isJellyfinConnected } = useServices();
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { isMobile } = useDeviceType();
  const { height: windowHeight } = useWindowDimensions();
  // Channel data state
  const [allChannels, setAllChannels] = useState<LiveTVChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<LiveTVChannel[]>([]);
  const [channelDisplayCount, setChannelDisplayCount] = useState(CHANNELS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // EPG state
  const [epgData, setEpgData] = useState<EPGChannel[]>([]);
  const [isLoadingGuide, setIsLoadingGuide] = useState(false);
  const [epgLoadingMessage, setEpgLoadingMessage] = useState<string>('');
  const [epgError, setEpgError] = useState<string | null>(null);
  const epgPreloadStarted = useRef(false);

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  // Favorites state
  const [favoriteChannelIds, setFavoriteChannelIds] = useState<Set<string>>(new Set());
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [selectedChannelForFavorite, setSelectedChannelForFavorite] = useState<{ id: string; displayName: string } | null>(null);

  // Selected channel & inline player state (desktop/TV combined view)
  const [selectedChannel, setSelectedChannel] = useState<LiveTVChannel | null>(null);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isPlayerMuted, setIsPlayerMuted] = useState(false);
  const [rightFocusedEl, setRightFocusedEl] = useState<'player' | 'mute' | 'fullscreen' | null>(null);
  const videoRef = useRef<VideoRef>(null);

  // ----- MEMOS -----

  const categories = useMemo(() => {
    const cats = new Set(
      allChannels
        .map(c => c.group?.split(';')[0].trim())
        .filter((g): g is string => Boolean(g))
    );
    return Array.from(cats).sort();
  }, [allChannels]);

  const countries = useMemo(() => {
    const ctrs = new Set(allChannels.map(c => (c as any).countryCode).filter(Boolean) as string[]);
    return Array.from(ctrs).sort();
  }, [allChannels]);

  const displayedChannels = useMemo(
    () => filteredChannels.slice(0, channelDisplayCount),
    [filteredChannels, channelDisplayCount]
  );

  // Current program for each channel (used in channel list subtitles)
  const channelCurrentPrograms = useMemo(() => {
    const map = new Map<string, EPGProgram>();
    const now = new Date();
    for (const epgCh of epgData) {
      const current = epgCh.programs.find(p => p.start <= now && p.stop > now);
      if (current) map.set(epgCh.id, current);
    }
    return map;
  }, [epgData]);

  // EPG data for selected channel
  const selectedChannelEpg = useMemo(() => {
    if (!selectedChannel) return null;
    return epgData.find(ch => ch.id === selectedChannel.id) || null;
  }, [selectedChannel, epgData]);

  // Current + upcoming programs for selected channel
  const selectedChannelPrograms = useMemo(() => {
    if (!selectedChannelEpg) return [];
    const now = new Date();
    return selectedChannelEpg.programs.filter(p => p.stop > now);
  }, [selectedChannelEpg]);

  // Current program for the selected channel
  const selectedChannelCurrentProgram = useMemo(() => {
    if (!selectedChannel) return null;
    return channelCurrentPrograms.get(selectedChannel.id) || null;
  }, [selectedChannel, channelCurrentPrograms]);

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
      // Load IPTV channels from selected countries (reads from persistent cache first)
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

    // If EPG data was already preloaded, use it directly without showing loading state
    if (!forceRefresh && epgService.hasData()) {
      console.log('[LiveTV] Using preloaded EPG data');
      const epgChannels = await epgService.fetchEPGData(
        allChannels,
        selectedCountries,
      );
      setEpgData(epgChannels);
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

  // Preload EPG data as soon as channels are available (before user opens guide tab)
  useEffect(() => {
    const selectedCountries = settings.iptv?.selectedCountries || [];
    if (allChannels.length > 0 && selectedCountries.length > 0 && !epgPreloadStarted.current) {
      epgPreloadStarted.current = true;
      console.log('[LiveTV] Starting EPG preload in background...');
      epgService.preloadEPGData(allChannels, selectedCountries).then(() => {
        loadProgramGuide();
      });
    }
  }, [allChannels, settings.iptv?.selectedCountries, loadProgramGuide]);

  // Always load guide data (needed for channel list subtitles + right panel)
  useEffect(() => {
    loadProgramGuide();
  }, [loadProgramGuide]);

  // Filter and sort channels based on search query, category, country, and favorites
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

    if (selectedCategory) {
      filtered = filtered.filter(c => c.group?.split(';')[0].trim() === selectedCategory);
    }

    if (selectedCountry) {
      filtered = filtered.filter(c => (c as any).countryCode === selectedCountry);
    }

    setChannelDisplayCount(CHANNELS_PER_PAGE);
    
    // Sort: favorites first, then by name
    const sorted = [...filtered].sort((a, b) => {
      const aFav = favoriteChannelIds.has(a.id);
      const bFav = favoriteChannelIds.has(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return a.name.localeCompare(b.name);
    });
    
    setFilteredChannels(sorted);
  }, [searchQuery, allChannels, favoriteChannelIds, selectedCategory, selectedCountry]);

  // Auto-select first channel on desktop/TV when filtered list changes
  useEffect(() => {
    if (isMobile) return;
    if (filteredChannels.length === 0) {
      setSelectedChannel(null);
      return;
    }
    setSelectedChannel(prev => {
      if (!prev || !filteredChannels.find(ch => ch.id === prev.id)) {
        return filteredChannels[0];
      }
      return prev;
    });
  }, [filteredChannels, isMobile]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    const selectedCountries = settings.iptv?.selectedCountries || [];
    // Force refresh: clear EPG cache and re-fetch channels
    epgService.clearCache().then(() => {
      fetchChannelsFromCountries(selectedCountries, { forceRefresh: true }).then(iptvChannels => {
        if (iptvChannels.length > 0) {
          setAllChannels(iptvChannels);
          setFilteredChannels(iptvChannels);
        }
        setIsRefreshing(false);
        // Reset preload flag so EPG re-fetches
        epgPreloadStarted.current = false;
      }).catch(() => setIsRefreshing(false));
    });
  }, [settings.iptv?.selectedCountries]);

  const handleChannelPress = useCallback((channel: LiveTVChannel) => {
    console.log('[LiveTV] Playing channel:', channel.name);
    (navigation as any).navigate('LivePlayer', {
      channelId: channel.id,
      channelName: channel.name,
      streamUrl: channel.url,
      logo: channel.logo,
    });
  }, [navigation]);

  // Select a channel: on mobile navigate to full player, on desktop/TV update inline player
  const handleChannelSelect = useCallback((channel: LiveTVChannel) => {
    if (isMobile) {
      handleChannelPress(channel);
    } else {
      setSelectedChannel(channel);
      setStreamError(null);
      setIsStreamLoading(true);
    }
  }, [isMobile, handleChannelPress]);

  // Navigate to full-screen player from inline player
  const handleFullscreen = useCallback(() => {
    if (selectedChannel) {
      handleChannelPress(selectedChannel);
    }
  }, [selectedChannel, handleChannelPress]);

  // Render a channel list item (shared between mobile and desktop)
  const renderChannelItem = useCallback(({ item: channel, index }: { item: LiveTVChannel; index: number }) => {
    const isSelected = selectedChannel?.id === channel.id;
    const isFavorite = favoriteChannelIds.has(channel.id);
    const { cleanName, resolution } = parseChannelName(channel.name);
    const currentProgram = channelCurrentPrograms.get(channel.id);
    const subtitle = currentProgram
      ? `${currentProgram.title}${currentProgram.category ? '. ' + currentProgram.category + '.' : ''}`
      : channel.group || '';

    return (
      <TouchableOpacity
        style={[
          styles.channelItem,
          isSelected && !isMobile && styles.channelItemSelected,
        ]}
        onPress={() => handleChannelSelect(channel)}
        onLongPress={() => {
          setSelectedChannelForFavorite({ id: channel.id, displayName: channel.name });
          setShowFavoriteModal(true);
        }}
        delayLongPress={500}
        focusable={true}
        activeOpacity={0.7}>
        <Text style={styles.channelNumber}>{index + 1}.</Text>
        {channel.logo ? (
          <Image source={{ uri: channel.logo }} style={styles.channelItemLogo} resizeMode="contain" />
        ) : (
          <View style={styles.channelItemLogoPlaceholder}>
            <Icon name="tv" size={isMobile ? 20 : scaleSize(22)} color="rgba(255, 255, 255, 0.3)" />
          </View>
        )}
        <View style={styles.channelItemInfo}>
          <View style={styles.channelItemNameRow}>
            <Text style={styles.channelItemName} numberOfLines={1}>{cleanName}</Text>
            {resolution && <ResolutionBadge resolution={resolution} isMobile />}
          </View>
          {subtitle ? (
            <Text style={styles.channelItemSubtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {isFavorite && (
          <Icon name="heart" size={isMobile ? 16 : scaleSize(18)} color="#e50914" style={{ marginLeft: 4 }} />
        )}
      </TouchableOpacity>
    );
  }, [selectedChannel, favoriteChannelIds, channelCurrentPrograms, isMobile, handleChannelSelect]);

  // ----- EARLY RETURNS -----

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

  // ----- MOBILE RENDER -----
  if (isMobile) {
    return (
      <View style={styles.container}>
        <View style={[styles.mobileSearchContainer, { paddingTop: insets.top + 8 }]}>
          <LiquidGlassView style={styles.mobileSearchGlass} effect="regular" tintColor="rgba(255, 255, 255, 0.25)">
            <View style={styles.searchInner}>
              <Icon name="search" size={20} color="rgba(0, 0, 0, 0.6)" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.mobileSearchInput}
                placeholder="Search channels..."
                placeholderTextColor="rgba(0, 0, 0, 0.4)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Icon name="close-circle" size={20} color="rgba(0, 0, 0, 0.6)" />
                </TouchableOpacity>
              )}
            </View>
          </LiquidGlassView>
        </View>
        <FlatList
          data={displayedChannels}
          renderItem={renderChannelItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 160 }}
          ListHeaderComponent={(categories.length > 0 || countries.length > 1) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow} style={{ marginBottom: 8 }}>
              <FilterChip label="All" isActive={!selectedCategory} onPress={() => setSelectedCategory(null)} />
              {categories.slice(0, 20).map(cat => (
                <FilterChip key={cat} label={cat} isActive={selectedCategory === cat}
                  onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)} />
              ))}
            </ScrollView>
          ) : undefined}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#fff" />
          }
          onEndReached={() => {
            if (channelDisplayCount < filteredChannels.length) {
              setChannelDisplayCount(c => Math.min(c + CHANNELS_PER_PAGE, filteredChannels.length));
            }
          }}
          onEndReachedThreshold={0.4}
        />
        {/* Favorite Modal */}
        <Modal
          visible={showFavoriteModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFavoriteModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedChannelForFavorite?.displayName}</Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  if (selectedChannelForFavorite) {
                    toggleFavorite(selectedChannelForFavorite.id);
                    setShowFavoriteModal(false);
                  }
                }}>
                <Icon
                  name={selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) ? 'heart' : 'heart-outline'}
                  size={22}
                  color={selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) ? '#e50914' : '#fff'}
                />
                <Text style={styles.modalButtonText}>
                  {selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id)
                    ? 'Remove from Favorites' : 'Add to Favorites'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowFavoriteModal(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ----- DESKTOP / TV COMBINED LAYOUT -----
  const { cleanName: selectedCleanName } = selectedChannel ? parseChannelName(selectedChannel.name) : { cleanName: '' };

  return (
    <View style={[styles.splitContainer, { height: windowHeight }]}>
      {/* ===== LEFT PANEL: Search + Filters + Channel List ===== */}
      <View style={styles.leftPanel}>
        {/* Search Bar */}
        <View style={styles.leftSearchContainer}>
          <Icon name="search" size={scaleSize(20)} color="rgba(255, 255, 255, 0.5)" style={{ marginRight: scaleSize(8) }} />
          <TextInput
            style={styles.leftSearchInput}
            placeholder="Search channels..."
            placeholderTextColor="rgba(255, 255, 255, 0.35)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Icon name="close-circle" size={scaleSize(20)} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips */}
        {(categories.length > 0 || countries.length > 1) && (
          <View style={styles.leftFilterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
              <FilterChip label="All" isActive={!selectedCategory} onPress={() => setSelectedCategory(null)} />
              {categories.map(cat => (
                <FilterChip key={cat} label={cat} isActive={selectedCategory === cat}
                  onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)} />
              ))}
            </ScrollView>
            {countries.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                <FilterChip label="All Countries" isActive={!selectedCountry} onPress={() => setSelectedCountry(null)} />
                {countries.map(code => {
                  const country = IPTV_COUNTRIES.find(c => c.code === code);
                  return (
                    <FilterChip key={code}
                      label={country ? `${country.flag} ${country.name}` : code.toUpperCase()}
                      isActive={selectedCountry === code}
                      onPress={() => setSelectedCountry(selectedCountry === code ? null : code)} />
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* Channel Header */}
        <View style={styles.channelListHeader}>
          <Text style={styles.channelListHeaderText}>All channels</Text>
          <Text style={styles.channelListCount}>{filteredChannels.length}</Text>
        </View>

        {/* Channel List — ScrollView + map avoids FlatList virtualization measurement issues on macOS Catalyst */}
        <ScrollView
          style={styles.channelListWrapper}
          contentContainerStyle={styles.channelListContent}
          showsVerticalScrollIndicator={true}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 200) {
              if (channelDisplayCount < filteredChannels.length) {
                setChannelDisplayCount(c => Math.min(c + CHANNELS_PER_PAGE, filteredChannels.length));
              }
            }
          }}
          scrollEventThrottle={400}>
          {displayedChannels.map((channel, index) => (
            <React.Fragment key={channel.id}>
              {renderChannelItem({ item: channel, index } as any)}
            </React.Fragment>
          ))}
          <View style={styles.channelListFooter} />
        </ScrollView>
      </View>

      {/* ===== RIGHT PANEL: Player + Info + Guide ===== */}
      <View style={styles.rightPanel}>
        {/* Video Player — tapping the player goes fullscreen */}
        <TouchableOpacity
          style={[styles.playerContainer, rightFocusedEl === 'player' && styles.focusRingPlayer]}
          activeOpacity={0.9}
          onPress={handleFullscreen}
          onFocus={() => setRightFocusedEl('player')}
          onBlur={() => setRightFocusedEl(null)}
          focusable={true}
          accessible={false}>
          {selectedChannel ? (
            <>
              {/* Video layer — pointerEvents box-none so the TouchableOpacity above catches taps */}
              <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <Video
                  key={selectedChannel.id}
                  ref={videoRef}
                  source={{
                    uri: selectedChannel.url,
                    headers: { 'Accept': '*/*' },
                  }}
                  style={styles.videoPlayer}
                  resizeMode="contain"
                  paused={false}
                  volume={isPlayerMuted ? 0 : 1}
                  onLoad={() => setIsStreamLoading(false)}
                  onReadyForDisplay={() => setIsStreamLoading(false)}
                  onBuffer={(data) => setIsStreamLoading(data.isBuffering)}
                  onError={(err) => {
                    const errorCode = err.error?.code;
                    let msg = 'Failed to load stream.';
                    if (errorCode === -1200) {
                      msg = 'SSL/TLS connection failed. Try whitelisting the domain.';
                    } else if (err.error?.localizedDescription) {
                      msg = err.error.localizedDescription;
                    }
                    setStreamError(msg);
                    setIsStreamLoading(false);
                  }}
                  bufferConfig={{
                    minBufferMs: 15000,
                    maxBufferMs: 50000,
                    bufferForPlaybackMs: 2500,
                    bufferForPlaybackAfterRebufferMs: 5000,
                  }}
                />
              </View>
              {/* Loading overlay */}
              {isStreamLoading && (
                <View style={styles.playerLoadingOverlay} pointerEvents="none">
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.playerLoadingText}>Loading {selectedCleanName}...</Text>
                </View>
              )}
              {/* Error overlay — needs its own button so stop propagation with dedicated handler */}
              {streamError && (
                <View style={styles.playerErrorOverlay}>
                  <Icon name="alert-circle-outline" size={scaleSize(48)} color="rgba(255, 255, 255, 0.4)" />
                  <Text style={styles.playerErrorText}>{streamError}</Text>
                  <TouchableOpacity
                    style={styles.playerRetryButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      setStreamError(null);
                      setIsStreamLoading(true);
                      const ch = selectedChannel;
                      setSelectedChannel(null);
                      setTimeout(() => setSelectedChannel(ch), 50);
                    }}>
                    <Text style={styles.playerRetryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Expand hint overlay */}
              {!streamError && !isStreamLoading && (
                <View style={styles.playerExpandHint} pointerEvents="none">
                  <Icon name="expand" size={scaleSize(16)} color="rgba(255,255,255,0.5)" />
                </View>
              )}
            </>
          ) : (
            <View style={styles.playerPlaceholder}>
              <Icon name="tv-outline" size={scaleSize(64)} color="rgba(255, 255, 255, 0.15)" />
              <Text style={styles.playerPlaceholderText}>Select a channel to start watching</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Player control bar — OUTSIDE overflow:hidden container so touches always work */}
        {selectedChannel && (
          <View style={styles.playerControlBar}>
            <TouchableOpacity
              onPress={() => setIsPlayerMuted(m => !m)}
              style={[styles.playerControlButton, rightFocusedEl === 'mute' && styles.playerControlButtonFocused]}
              onFocus={() => setRightFocusedEl('mute')}
              onBlur={() => setRightFocusedEl(null)}
              focusable={true}
              activeOpacity={0.7}>
              <Icon name={isPlayerMuted ? 'volume-mute' : 'volume-high'} size={scaleSize(18)} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <View style={styles.playerLiveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.playerControlBarSpacer} />
            <TouchableOpacity
              onPress={handleFullscreen}
              style={[styles.playerControlButton, rightFocusedEl === 'fullscreen' && styles.playerControlButtonFocused]}
              onFocus={() => setRightFocusedEl('fullscreen')}
              onBlur={() => setRightFocusedEl(null)}
              focusable={true}
              activeOpacity={0.7}>
              <Icon name="expand" size={scaleSize(18)} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Channel Info Bar */}
        {selectedChannel && (
          <View style={styles.infoBar}>
            <View style={styles.infoBarLeft}>
              {selectedChannel.logo ? (
                <Image source={{ uri: selectedChannel.logo }} style={styles.infoBarLogo} resizeMode="contain" />
              ) : (
                <View style={styles.infoBarLogoPlaceholder}>
                  <Icon name="tv" size={scaleSize(22)} color="rgba(255, 255, 255, 0.3)" />
                </View>
              )}
              <View style={styles.infoBarText}>
                <Text style={styles.infoBarChannelName}>{selectedCleanName}</Text>
                {selectedChannelCurrentProgram && (
                  <Text style={styles.infoBarProgramTitle} numberOfLines={1}>
                    {selectedChannelCurrentProgram.title}
                    {selectedChannelCurrentProgram.category ? `. ${selectedChannelCurrentProgram.category}.` : ''}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.infoBarRight}>
              {selectedChannelCurrentProgram && (
                <>
                  <View style={styles.infoBarLiveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.infoBarLiveText}>Live</Text>
                  </View>
                  <Text style={styles.infoBarTimeRange}>
                    {selectedChannelCurrentProgram.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    {' - '}
                    {selectedChannelCurrentProgram.stop.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Program Guide */}
        <View style={styles.programGuide}>
          <Text style={styles.programGuideTitle}>TV program</Text>
          {isLoadingGuide ? (
            <View style={styles.programGuideLoading}>
              <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.5)" />
              <Text style={styles.programGuideLoadingText}>{epgLoadingMessage || 'Loading guide...'}</Text>
            </View>
          ) : selectedChannelPrograms.length > 0 ? (
            <ScrollView
              style={styles.programList}
              contentContainerStyle={{ paddingBottom: scaleSize(20) }}
              scrollEnabled={true}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}>
              {selectedChannelPrograms.slice(0, 15).map((program, idx) => {
                const now = new Date();
                const isCurrent = program.start <= now && program.stop > now;
                const timeStr = program.start.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
                return (
                  <View key={`${program.channelId}-${idx}`} style={[styles.programRow, isCurrent && styles.programRowCurrent]}>
                    <View style={[styles.programDot, isCurrent && styles.programDotCurrent]} />
                    <View style={styles.programInfo}>
                      <Text style={[styles.programTitle, isCurrent && styles.programTitleCurrent]} numberOfLines={1}>
                        {program.title}
                        {program.category ? `. ${program.category}.` : ''}
                        {program.description ? ` ${program.description}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.programTime}>{timeStr}</Text>
                  </View>
                );
              })}
              {/* Date bar at bottom */}
              <View style={styles.programDateBar}>
                <Text style={styles.programDateText}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.programGuideEmpty}>
              <Text style={styles.programGuideEmptyText}>
                {epgError ? 'Failed to load guide data' : 'No program data available for this channel'}
              </Text>
              {epgError && (
                <TouchableOpacity style={styles.retryButton} onPress={() => loadProgramGuide(true)}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Favorite Modal */}
      <Modal
        visible={showFavoriteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFavoriteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedChannelForFavorite?.displayName}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                if (selectedChannelForFavorite) {
                  toggleFavorite(selectedChannelForFavorite.id);
                  setShowFavoriteModal(false);
                }
              }}
              hasTVPreferredFocus={true}
              focusable={true}>
              <Icon
                name={selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) ? 'heart' : 'heart-outline'}
                size={scaleSize(28)}
                color={selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id) ? '#e50914' : '#fff'}
              />
              <Text style={styles.modalButtonText}>
                {selectedChannelForFavorite && favoriteChannelIds.has(selectedChannelForFavorite.id)
                  ? 'Remove from Favorites' : 'Add to Favorites'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonCancel]}
              onPress={() => setShowFavoriteModal(false)}
              focusable={true}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ----- SHARED -----
  container: {
    flex: 1,
    backgroundColor: '#0d0d14',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: scaleSize(64),
    backgroundColor: '#0d0d14',
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

  // ----- FILTER CHIPS -----
  filterChipsRow: {
    paddingHorizontal: scaleSize(16),
    flexDirection: 'row',
    gap: scaleSize(6),
    alignItems: 'center',
    paddingVertical: scaleSize(4),
  },
  filterChip: {
    paddingHorizontal: scaleSize(14),
    paddingVertical: scaleSize(6),
    borderRadius: scaleSize(16),
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.85)',
    borderColor: '#e50914',
  },
  filterChipFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: scaleSize(10),
    transform: [{ scale: 1.1 }],
  },
  filterChipText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: scaleFontSize(13),
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  filterChipTextFocused: {
    color: '#fff',
    fontWeight: '700',
  },

  // ----- RESOLUTION BADGES -----
  resolutionBadge: {
    borderRadius: scaleSize(4),
    paddingHorizontal: scaleSize(6),
    paddingVertical: scaleSize(2),
    flexShrink: 0,
  },
  resolutionBadgeText: {
    fontSize: scaleFontSize(11),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  resolutionBadgeSmall: {
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    flexShrink: 0,
  },
  resolutionBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ----- CHANNEL LIST ITEM (shared) -----
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 10 : scaleSize(10),
      default: scaleSize(10),
    }),
    paddingHorizontal: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 12 : scaleSize(14),
      default: scaleSize(14),
    }),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 10 : scaleSize(10),
      default: scaleSize(10),
    }),
  },
  channelItemSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftWidth: scaleSize(3),
    borderLeftColor: '#e50914',
  },
  channelNumber: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 14 : scaleFontSize(15),
      default: scaleFontSize(15),
    }),
    fontWeight: '600',
    width: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 28 : scaleSize(30),
      default: scaleSize(30),
    }),
    textAlign: 'right',
  },
  channelItemLogo: {
    width: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 44 : scaleSize(46),
      default: scaleSize(46),
    }),
    height: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 44 : scaleSize(46),
      default: scaleSize(46),
    }),
    borderRadius: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 10 : scaleSize(10),
      default: scaleSize(10),
    }),
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  channelItemLogoPlaceholder: {
    width: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 44 : scaleSize(46),
      default: scaleSize(46),
    }),
    height: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 44 : scaleSize(46),
      default: scaleSize(46),
    }),
    borderRadius: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 10 : scaleSize(10),
      default: scaleSize(10),
    }),
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  channelItemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  channelItemName: {
    color: '#fff',
    fontSize: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 16 : scaleFontSize(16),
      default: scaleFontSize(16),
    }),
    fontWeight: '600',
    flexShrink: 1,
  },
  channelItemSubtitle: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: Platform.select({
      ios: (Platform.constants as any).interfaceIdiom === 'phone' ? 13 : scaleFontSize(13),
      default: scaleFontSize(13),
    }),
    marginTop: 2,
  },

  // ----- MOBILE -----
  mobileSearchContainer: {
    position: 'absolute',
    left: 68,
    right: 16,
    zIndex: 1000,
    pointerEvents: 'box-none',
  },
  mobileSearchGlass: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mobileSearchInput: {
    flex: 1,
    fontSize: 17,
    color: 'rgba(0, 0, 0, 0.9)',
    paddingVertical: 0,
  },

  // ----- SPLIT LAYOUT (Desktop/TV) -----
  splitContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0d0d14',
  },
  leftPanel: {
    flex: 3,
    backgroundColor: '#0f0f18',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.06)',
  },
  rightPanel: {
    flex: 7,
    backgroundColor: '#0d0d14',
  },

  // ----- LEFT PANEL -----
  leftSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: scaleSize(10),
    paddingHorizontal: scaleSize(12),
    paddingVertical: scaleSize(10),
    marginHorizontal: scaleSize(14),
    marginTop: scaleSize(16),
    marginBottom: scaleSize(8),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  leftSearchInput: {
    flex: 1,
    fontSize: scaleFontSize(15),
    color: '#fff',
    paddingVertical: 0,
  },
  leftFilterContainer: {
    paddingBottom: scaleSize(6),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: scaleSize(4),
  },
  channelListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scaleSize(16),
    paddingVertical: scaleSize(10),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  channelListHeaderText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(14),
    fontWeight: '600',
  },
  channelListCount: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: scaleFontSize(13),
  },
  channelListWrapper: {
    flex: 1,
  },
  channelListContent: {
    paddingBottom: scaleSize(20),
  },
  channelListFooter: {
    height: scaleSize(80),
  },

  // ----- RIGHT PANEL: PLAYER -----
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: '55%',
    backgroundColor: '#000',
    borderRadius: scaleSize(12),
    overflow: 'hidden',
    margin: scaleSize(16),
    marginBottom: 0,
    position: 'relative',
  },
  videoPlayer: {
    ...StyleSheet.absoluteFillObject,
  },
  playerLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: scaleSize(12),
  },
  playerLoadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(15),
  },
  playerErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: scaleSize(12),
    padding: scaleSize(24),
  },
  playerErrorText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(14),
    textAlign: 'center',
  },
  playerRetryButton: {
    backgroundColor: '#e50914',
    paddingHorizontal: scaleSize(24),
    paddingVertical: scaleSize(10),
    borderRadius: scaleSize(8),
  },
  playerRetryButtonText: {
    color: '#fff',
    fontSize: scaleFontSize(14),
    fontWeight: '600',
  },
  playerControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSize(16),
    paddingVertical: scaleSize(8),
    marginHorizontal: scaleSize(16),
    marginBottom: scaleSize(4),
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: scaleSize(8),
  },
  playerControlBarSpacer: {
    flex: 1,
  },
  playerExpandHint: {
    position: 'absolute',
    top: scaleSize(8),
    right: scaleSize(8),
    opacity: 0.6,
  },
  playerControlButton: {
    padding: scaleSize(6),
    borderRadius: scaleSize(8),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playerControlButtonFocused: {
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  focusRingPlayer: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  playerLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(6),
    marginLeft: scaleSize(10),
  },
  liveDot: {
    width: scaleSize(8),
    height: scaleSize(8),
    borderRadius: scaleSize(4),
    backgroundColor: '#e50914',
  },
  liveText: {
    color: '#e50914',
    fontSize: scaleFontSize(12),
    fontWeight: '700',
    letterSpacing: 1,
  },
  playerPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: scaleSize(12),
  },
  playerPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: scaleFontSize(16),
  },

  // ----- RIGHT PANEL: INFO BAR -----
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scaleSize(20),
    paddingVertical: scaleSize(14),
    marginHorizontal: scaleSize(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: scaleSize(12),
  },
  infoBarLogo: {
    width: scaleSize(44),
    height: scaleSize(44),
    borderRadius: scaleSize(10),
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoBarLogoPlaceholder: {
    width: scaleSize(44),
    height: scaleSize(44),
    borderRadius: scaleSize(10),
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBarText: {
    flex: 1,
  },
  infoBarChannelName: {
    color: '#fff',
    fontSize: scaleFontSize(18),
    fontWeight: '700',
  },
  infoBarProgramTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: scaleFontSize(14),
    marginTop: 2,
  },
  infoBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(14),
  },
  infoBarLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    paddingHorizontal: scaleSize(10),
    paddingVertical: scaleSize(5),
    borderRadius: scaleSize(6),
    gap: scaleSize(6),
  },
  infoBarLiveText: {
    color: '#e50914',
    fontSize: scaleFontSize(13),
    fontWeight: '700',
  },
  infoBarTimeRange: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: scaleFontSize(14),
    fontWeight: '600',
  },

  // ----- RIGHT PANEL: PROGRAM GUIDE -----
  programGuide: {
    flex: 1,
    marginHorizontal: scaleSize(16),
    marginTop: scaleSize(4),
  },
  programGuideTitle: {
    color: '#fff',
    fontSize: scaleFontSize(18),
    fontWeight: '700',
    paddingHorizontal: scaleSize(4),
    paddingVertical: scaleSize(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  programGuideLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: scaleSize(24),
    gap: scaleSize(10),
  },
  programGuideLoadingText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: scaleFontSize(14),
  },
  programList: {
    flex: 1,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scaleSize(12),
    paddingHorizontal: scaleSize(4),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
    gap: scaleSize(10),
  },
  programRowCurrent: {
    backgroundColor: 'rgba(229, 9, 20, 0.06)',
  },
  programDot: {
    width: scaleSize(6),
    height: scaleSize(6),
    borderRadius: scaleSize(3),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  programDotCurrent: {
    backgroundColor: '#e50914',
  },
  programInfo: {
    flex: 1,
  },
  programTitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: scaleFontSize(14),
  },
  programTitleCurrent: {
    color: '#fff',
    fontWeight: '600',
  },
  programTime: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: scaleFontSize(14),
    fontWeight: '600',
    minWidth: scaleSize(50),
    textAlign: 'right',
  },
  programDateBar: {
    alignItems: 'center',
    paddingVertical: scaleSize(14),
    marginTop: scaleSize(8),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  programDateText: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: scaleFontSize(13),
    fontWeight: '500',
  },
  programGuideEmpty: {
    padding: scaleSize(32),
    alignItems: 'center',
    gap: scaleSize(12),
  },
  programGuideEmptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: scaleFontSize(14),
    textAlign: 'center',
  },

  // ----- MODAL -----
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
  modalTitle: {
    color: '#fff',
    fontSize: scaleFontSize(24),
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: scaleSize(24),
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
});
