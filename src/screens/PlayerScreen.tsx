import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Video, { OnProgressData, VideoRef, SelectedTrackType } from 'react-native-video';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices } from '../context';
import { LoadingScreen } from '../components';
import { RootStackParamList, JellyfinPlaybackInfo } from '../types';

type PlayerScreenRouteProp = RouteProp<RootStackParamList, 'Player'>;

export function PlayerScreen() {
  const route = useRoute<PlayerScreenRouteProp>();
  const navigation = useNavigation();
  const { jellyfin } = useServices();
  const { itemId } = route.params;

  const [playbackInfo, setPlaybackInfo] = useState<JellyfinPlaybackInfo | null>(
    null,
  );
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamAttempt, setStreamAttempt] = useState<'hls' | 'transcoded'>('hls');
  const [isRetrying, setIsRetrying] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);

  // Advanced Controls State
  const [isFavorite, setIsFavorite] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [episodes, setEpisodes] = useState<JellyfinItem[]>([]);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number | undefined>(undefined);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modal Visibility
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const videoRef = useRef<VideoRef>(null);


  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const loadPlaybackInfo = useCallback(async () => {
    if (!jellyfin) return;

    try {
      console.log('[PlayerScreen] Loading playback info and item details for:', itemId);
      // Start a new play session before loading playback info
      jellyfin.newPlaySession();
      console.log('[PlayerScreen] New play session:', jellyfin.getPlaySessionId());

      const [info, itemDetails] = await Promise.all([
        jellyfin.getPlaybackInfo(itemId),
        jellyfin.getItem(itemId),
      ]);

      console.log('[PlayerScreen] Playback info and item details received');
      setPlaybackInfo(info);
      setItem(itemDetails);
      setIsFavorite(itemDetails.UserData?.IsFavorite || false);

      // If it's an episode, fetch all episodes in the season for exploration
      if (itemDetails.Type === 'Episode' && itemDetails.SeriesId) {
        const seasonEpisodes = await jellyfin.getEpisodes(
          itemDetails.SeriesId,
          itemDetails.SeasonId,
        );
        setEpisodes(seasonEpisodes);
      }


      if (info.MediaSources.length > 0) {
        // Report as Transcode since we're using HLS
        await jellyfin.reportPlaybackStart(
          itemId,
          info.MediaSources[0].Id,
          0,
          'Transcode',
        );
      }
    } catch (err) {
      console.error('[PlayerScreen] Failed to load playback info:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load playback info';

      // Provide more helpful error messages
      if (errorMessage.includes('timed out') || errorMessage.toLowerCase().includes('timeout')) {
        setError('Connection timed out. The Jellyfin server may be slow or unreachable. Please check your network connection and try again.');
      } else if (errorMessage.includes('Network request failed')) {
        setError('Network error. Please check your connection to the Jellyfin server.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [jellyfin, itemId]);

  useEffect(() => {
    loadPlaybackInfo();

    return () => {
      // Report playback stopped and stop encoding when leaving
      if (jellyfin && playbackInfo?.MediaSources[0]) {
        jellyfin.reportPlaybackStopped(
          itemId,
          playbackInfo.MediaSources[0].Id,
          Math.floor(currentTime * 10000000), // Convert to ticks
        );
        // Stop the encoding session to free up server resources
        jellyfin.stopEncodingSession();
      }
    };
  }, [itemId]); // Reload when itemId changes

  // Log stream attempt changes
  useEffect(() => {
    if (jellyfin && playbackInfo?.MediaSources[0]) {
      const mediaSourceId = playbackInfo.MediaSources[0].Id;
      const streamType = streamAttempt === 'hls' ? 'HLS (main.m3u8)' : 'Transcoded (720p)';
      const url = streamAttempt === 'hls'
        ? jellyfin.getHlsStreamUrl(itemId, mediaSourceId)
        : jellyfin.getTranscodedStreamUrl(itemId, mediaSourceId);

      console.log('[PlayerScreen] Stream type:', streamType);
      console.log('[PlayerScreen] Stream URL:', url);
      console.log('[PlayerScreen] Media source:', {
        id: mediaSourceId,
        container: playbackInfo.MediaSources[0].Container,
      });
    }
  }, [streamAttempt, playbackInfo, jellyfin, itemId]);

  const handleRetry = async () => {
    setIsRetrying(true);
    setError(null);
    setIsLoading(true);
    setStreamAttempt('hls');
    await loadPlaybackInfo();
    setIsRetrying(false);
  };

  const showControlsWithTimeout = useCallback(() => {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }

    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }
    }, 5000);
  }, [isPlaying, controlsOpacity]);

  const handleProgress = (data: OnProgressData) => {
    setCurrentTime(data.currentTime);

    // Report progress every 10 seconds
    if (jellyfin && playbackInfo?.MediaSources[0] && Math.floor(data.currentTime) % 10 === 0) {
      jellyfin.reportPlaybackProgress(
        itemId,
        playbackInfo.MediaSources[0].Id,
        Math.floor(data.currentTime * 10000000),
        !isPlaying,
        'Transcode', // We're using HLS which is transcoded
      );
    }
  };

  const handleLoad = (data: { duration: number }) => {
    setDuration(data.duration);
  };

  const handlePlayPause = () => {
    console.log('[PlayerScreen] Play/Pause toggled, was playing:', isPlaying, 'now:', !isPlaying);
    setIsPlaying(!isPlaying);
    showControlsWithTimeout();
  };

  const handleSeek = (forward: boolean) => {
    const seekTime = forward ? currentTime + 10 : currentTime - 10;
    const clampedTime = Math.max(0, Math.min(seekTime, duration));
    videoRef.current?.seek(clampedTime);
    setCurrentTime(clampedTime);
    showControlsWithTimeout();
  };

  const handleNext = () => {
    if (episodes.length === 0 || !item) return;
    const currentIndex = episodes.findIndex((e) => e.Id === item.Id);
    if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
      const nextEpisode = episodes[currentIndex + 1];
      navigation.setParams({ itemId: nextEpisode.Id });
      // The screen will reload due to itemId changing in deps
    }
  };

  const handlePrevious = () => {
    if (episodes.length === 0 || !item) return;
    const currentIndex = episodes.findIndex((e) => e.Id === item.Id);
    if (currentIndex > 0) {
      const prevEpisode = episodes[currentIndex - 1];
      navigation.setParams({ itemId: prevEpisode.Id });
    }
  };

  const handleToggleFavorite = async () => {
    if (!jellyfin || !item) return;
    const newStatus = !isFavorite;
    setIsFavorite(newStatus);
    const success = await jellyfin.toggleFavorite(item.Id, newStatus);
    if (!success) {
      setIsFavorite(!newStatus); // Rollback
    }
  };

  const handleToggleSubtitles = () => {
    const subtitleTracks = playbackInfo?.MediaSources[0]?.MediaStreams.filter(m => m.Type === 'Subtitle') || [];
    
    if (subtitleTracks.length === 0) {
      return; // No subtitles available
    }

    if (!subtitlesEnabled) {
      // Enable subtitles with the first available track or default track
      const defaultTrack = subtitleTracks.find(track => track.IsDefault) || subtitleTracks[0];
      setSelectedSubtitleTrack(defaultTrack.Index);
      setSubtitlesEnabled(true);
      console.log('[PlayerScreen] Subtitles enabled, track:', defaultTrack.DisplayTitle || defaultTrack.Language);
    } else {
      // Disable subtitles
      setSelectedSubtitleTrack(undefined);
      setSubtitlesEnabled(false);
      console.log('[PlayerScreen] Subtitles disabled');
    }
    showControlsWithTimeout();
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(Math.max(0, Math.min(1, newVolume)));
  };

  const handleProgressPress = (event: any) => {

    if (progressBarWidth === 0 || duration === 0) return;
    const { locationX } = event.nativeEvent;
    const percent = Math.max(0, Math.min(locationX / progressBarWidth, 1));
    const seekTime = percent * duration;
    videoRef.current?.seek(seekTime);
    setCurrentTime(seekTime);
    showControlsWithTimeout();
  };


  const handleBack = () => {
    navigation.goBack();
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRemainingTime = (seconds: number): string => {
    const remaining = duration - seconds;
    return `-${formatTime(remaining)}`;
  };

  const getEnrichedTitle = () => {
    if (!item) return `Item ${itemId}`;
    if (item.Type === 'Episode') {
      return `${item.SeriesName} - S${item.ParentIndexNumber}:E${item.IndexNumber} - ${item.Name}${item.ProductionYear ? ` (${item.ProductionYear})` : ''}`;
    }
    return `${item.Name}${item.ProductionYear ? ` (${item.ProductionYear})` : ''}`;
  };

  const getEndsAt = () => {
    if (duration === 0) return '';
    const remainingSeconds = duration - currentTime;
    const now = new Date();
    const end = new Date(now.getTime() + remainingSeconds * 1000);
    return `Ends at ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  };

  const subtitleTracks = playbackInfo?.MediaSources[0]?.MediaStreams.filter(m => m.Type === 'Subtitle') || [];
  const hasSubtitles = subtitleTracks.length > 0;
  const currentSubtitleTrack = subtitleTracks.find(track => track.Index === selectedSubtitleTrack);
  const castList = item?.People || [];
  const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Build text tracks for external subtitles
  const textTracks = subtitleTracks.map(track => ({
    title: track.DisplayTitle || track.Language || `Track ${track.Index}`,
    language: track.Language || 'und',
    type: 'text/vtt' as const,
    uri: jellyfin?.getSubtitleUrl(itemId, playbackInfo?.MediaSources[0]?.Id || '', track.Index) || '',
  }));

  const currentEpisodeIndex = episodes.findIndex(e => e.Id === item?.Id);
  const hasPrevious = currentEpisodeIndex > 0;
  const hasNext = currentEpisodeIndex !== -1 && currentEpisodeIndex < episodes.length - 1;

  if (isLoading) {
    return <LoadingScreen message="Loading video..." />;
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <View style={styles.errorButtons}>
          <TouchableOpacity onPress={handleRetry} style={styles.errorButton} disabled={isRetrying}>
            <Text style={styles.errorButtonText}>{isRetrying ? 'Retrying...' : 'Retry'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBack} style={styles.errorButtonSecondary}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!jellyfin || !playbackInfo?.MediaSources[0]) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No playable media found</Text>
        <TouchableOpacity onPress={handleBack} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Generate stream URLs
  const mediaSourceId = playbackInfo.MediaSources[0].Id;

  const videoUrl = streamAttempt === 'hls'
    ? jellyfin.getHlsStreamUrl(itemId, mediaSourceId)
    : jellyfin.getTranscodedStreamUrl(itemId, mediaSourceId);

  const streamType = streamAttempt === 'hls' ? 'HLS (main.m3u8)' : 'Transcoded (720p)';

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={showControlsWithTimeout}
      // Don't capture focus on tvOS - let buttons handle it
      accessible={false}>
      <Video
        ref={videoRef}
        key={videoUrl}
        source={{
          uri: videoUrl,
          // Add headers for better compatibility
          headers: {
            'Accept': '*/*',
          },
        }}
        style={styles.video}
        resizeMode="contain"
        paused={!isPlaying}
        volume={volume}
        rate={playbackRate}
        textTracks={textTracks}
        selectedTextTrack={
          subtitlesEnabled && selectedSubtitleTrack !== undefined 
            ? { type: SelectedTrackType.INDEX, value: subtitleTracks.findIndex(t => t.Index === selectedSubtitleTrack) } 
            : { type: SelectedTrackType.DISABLED }
        }
        onProgress={handleProgress}
        onLoadStart={() => {
          console.log('[PlayerScreen] Video load started');
          setIsBuffering(true);
        }}
        onLoad={(data) => {
          console.log('[PlayerScreen] Video loaded, duration:', data.duration);
          handleLoad(data);
          setIsBuffering(false);
          // Start auto-hide timer for controls
          showControlsWithTimeout();
        }}
        onReadyForDisplay={() => {
          console.log('[PlayerScreen] Video ready for display');
          setIsBuffering(false);
          // Ensure controls auto-hide after video is ready
          showControlsWithTimeout();
        }}
        onBuffer={(data) => {
          console.log('[PlayerScreen] Buffering:', data.isBuffering);
          setIsBuffering(data.isBuffering);
        }}
        onEnd={() => {
          console.log('[PlayerScreen] Video ended');
          setIsPlaying(false);
        }}
        onPlaybackRateChange={(data) => {
          console.log('[PlayerScreen] Playback rate:', data.playbackRate);
        }}
        repeat={false}
        playInBackground={false}
        playWhenInactive={false}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
        onError={(err) => {
          console.error('[PlayerScreen] Video error:', err);
          console.error('[PlayerScreen] Error details:', JSON.stringify(err, null, 2));

          // Handle specific CoreMedia errors
          const errorCode = err.error?.code;
          const errorDomain = err.error?.domain;

          console.log('[PlayerScreen] Error domain:', errorDomain, 'Code:', errorCode);
          console.log('[PlayerScreen] Current stream attempt:', streamAttempt);

          // Try fallback: hls -> transcoded
          if (streamAttempt === 'hls') {
            console.log('[PlayerScreen] HLS failed, trying forced transcoding...');
            setStreamAttempt('transcoded');
            return;
          }

          // All methods failed, show error
          let errorMessage = 'Playback error occurred.';

          if (errorCode === -11822) {
            errorMessage = 'Authentication failed or server not configured correctly. Please check your Jellyfin server settings and try again.';
          } else if (errorCode === -12889 || errorCode === -12847) {
            errorMessage = 'Video format not supported on all streaming methods. Your Jellyfin server may need transcoding enabled or configured.';
          } else if (errorCode === -12660) {
            errorMessage = 'Cannot decode video. The codec may not be supported on this device.';
          } else {
            errorMessage = err.error?.errorString ||
              err.error?.localizedDescription ||
              'Playback failed on all stream types. Please check your network and server configuration.';
          }

          setError(errorMessage);
        }}
      />

      {/* Buffering Indicator */}
      {isBuffering && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.bufferingText}>Buffering...</Text>
        </View>
      )}

      {showControls && (
        <Animated.View
          style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <TouchableOpacity onPress={handleBack} style={styles.topIconButton}>
                <Icon name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.topTitle}>{getEnrichedTitle()}</Text>
            </View>
            <View style={styles.topBarRight}>
              <TouchableOpacity
                style={styles.topIconButton}
                onPress={() => setShowPeople(true)}>
                <Icon name="people-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topIconButton}>
                <Icon name="tv-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Container */}
          <View style={styles.bottomContainer}>
            {/* Control Row */}
            <View style={styles.controlRow}>
              <View style={styles.controlGroupLeft}>
                <ControlButton
                  icon="play-skip-back-outline"
                  onPress={handlePrevious}
                  size="small"
                  transparent
                  disabled={!hasPrevious}
                />
                <ControlButton
                  icon="play-back-outline"
                  onPress={() => handleSeek(false)}
                  size="small"
                  transparent
                />
                <ControlButton
                  icon={isPlaying ? 'pause' : 'play'}
                  onPress={handlePlayPause}
                  size="medium"
                  hasTVPreferredFocus={true}
                />
                <ControlButton
                  icon="play-forward-outline"
                  onPress={() => handleSeek(true)}
                  size="small"
                  transparent
                />
                <ControlButton
                  icon="play-skip-forward-outline"
                  onPress={handleNext}
                  size="small"
                  transparent
                  disabled={!hasNext}
                />
                <Text style={styles.endsAtText}>{getEndsAt()}</Text>
              </View>

              <View style={styles.controlGroupRight}>
                <TouchableOpacity
                  style={styles.bottomIconButton}
                  onPress={handleToggleFavorite}>
                  <Icon
                    name={isFavorite ? "heart" : "heart-outline"}
                    size={22}
                    color={isFavorite ? "#e50914" : "#fff"}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bottomIconButton, !hasSubtitles && styles.disabledButton]}
                  onPress={handleToggleSubtitles}
                  disabled={!hasSubtitles}>
                  <Icon 
                    name={subtitlesEnabled ? "closed-captioning" : "closed-captioning-outline"} 
                    size={22} 
                    color={subtitlesEnabled ? "#e50914" : "#fff"} 
                  />
                  {subtitlesEnabled && currentSubtitleTrack && (
                    <Text style={styles.subtitleLabel}>
                      {currentSubtitleTrack.Language?.substring(0, 2).toUpperCase() || 'CC'}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bottomIconButton, !hasSubtitles && styles.disabledButton]}
                  onPress={() => setShowSubtitles(true)}
                  disabled={!hasSubtitles}>
                  <Icon name="list-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <View>
                  <TouchableOpacity
                    style={styles.bottomIconButton}
                    onPress={() => {
                      setShowVolumeSlider(!showVolumeSlider);
                      showControlsWithTimeout();
                    }}>
                    <Icon 
                      name={volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-low" : "volume-high"} 
                      size={22} 
                      color="#fff" 
                    />
                  </TouchableOpacity>
                  {showVolumeSlider && showControls && (
                    <View style={styles.volumeSliderPopup}>
                      <TouchableOpacity 
                        style={styles.volumeIconTop}
                        onPress={() => handleVolumeChange(1)}>
                        <Icon name="volume-high" size={18} color="#fff" />
                      </TouchableOpacity>
                      <View style={styles.volumeSliderContainer}>
                        <View style={styles.volumeSliderTrack}>
                          <View style={[styles.volumeSliderFill, { height: `${volume * 100}%` }]} />
                        </View>
                      </View>
                      <TouchableOpacity 
                        style={styles.volumeIconBottom}
                        onPress={() => handleVolumeChange(0)}>
                        <Icon name="volume-mute" size={18} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.volumePercentage}>{Math.round(volume * 100)}%</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.bottomIconButton}
                  onPress={() => setShowSettings(true)}>
                  <Icon name="settings-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bottomIconButton}
                  onPress={() => setIsPiP(!isPiP)}>
                  <Icon name="copy-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bottomIconButton}
                  onPress={() => setIsFullscreen(!isFullscreen)}>
                  <Icon name="expand-outline" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Progress Bar Container */}
            <View style={styles.progressSection}>
              <Text style={styles.timeLabel}>{formatTime(currentTime)}</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleProgressPress}
                style={styles.progressBarContainer}
                onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: (duration > 0 ? (currentTime / duration) * 100 : 0) + '%' },
                    ]}
                  />
                </View>
              </TouchableOpacity>
              <Text style={styles.timeLabel}>{formatRemainingTime(currentTime)}</Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Selection Modals */}
      <SelectionModal
        visible={showSubtitles}
        title="Subtitles"
        onClose={() => setShowSubtitles(false)}
        data={[{ Index: -1, DisplayTitle: 'Off', Type: 'Subtitle' as const }, ...subtitleTracks]}
        keyExtractor={(item) => item.Index.toString()}
        renderItem={({ item: track }) => (
          <TouchableOpacity
            style={[
              styles.modalItem, 
              (track.Index === -1 ? !subtitlesEnabled : selectedSubtitleTrack === track.Index) && styles.modalItemActive
            ]}
            onPress={() => {
              if (track.Index === -1) {
                setSelectedSubtitleTrack(undefined);
                setSubtitlesEnabled(false);
              } else {
                setSelectedSubtitleTrack(track.Index);
                setSubtitlesEnabled(true);
              }
              setShowSubtitles(false);
            }}>
            <Text style={[
              styles.modalItemText, 
              (track.Index === -1 ? !subtitlesEnabled : selectedSubtitleTrack === track.Index) && { color: '#000' }
            ]}>
              {track.DisplayTitle || track.Language || `Track ${track.Index}`}
            </Text>
          </TouchableOpacity>
        )}
      />

      <SelectionModal
        visible={showPeople}
        title="Cast & Crew"
        onClose={() => setShowPeople(false)}
        data={castList}
        renderItem={({ item: person }) => (
          <View style={styles.personItem}>
            <Icon name="person-circle-outline" size={40} color="#fff" />
            <View>
              <Text style={styles.personName}>{person.Name}</Text>
              <Text style={styles.personRole}>{person.Role || person.Type}</Text>
            </View>
          </View>
        )}
      />

      <SelectionModal
        visible={showSettings}
        title="Playback Speed"
        onClose={() => setShowSettings(false)}
        data={playbackSpeeds}
        renderItem={({ item: speed }) => (
          <TouchableOpacity
            style={[styles.modalItem, playbackRate === speed && styles.modalItemActive]}
            onPress={() => {
              setPlaybackRate(speed);
              setShowSettings(false);
            }}>
            <Text style={[styles.modalItemText, playbackRate === speed && { color: '#000' }]}>{speed}x</Text>
          </TouchableOpacity>
        )}
      />
    </TouchableOpacity>
  );
}

interface SelectionModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  data: any[];
  renderItem: ({ item, index }: { item: any; index: number }) => React.ReactElement;
  keyExtractor?: (item: any, index: number) => string;
}

function SelectionModal({ visible, title, onClose, data, renderItem, keyExtractor }: SelectionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor || ((_, index) => index.toString())}
            contentContainerStyle={styles.modalList}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}


interface ControlButtonProps {
  icon: string;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
  hasTVPreferredFocus?: boolean;
  transparent?: boolean;
  disabled?: boolean;
}

function ControlButton({
  icon,
  onPress,
  size = 'medium',
  hasTVPreferredFocus = false,
  transparent = false,
  disabled = false
}: ControlButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.2,
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

  const sizes = {
    small: 32,
    medium: 48,
    large: 64,
    xlarge: 80,
    xxlarge: 100,
  };

  const iconSizes = {
    small: 18,
    medium: 24,
    large: 32,
    xlarge: 40,
    xxlarge: 56,
  };

  return (
    <TouchableOpacity
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      tvParallaxProperties={undefined}
      accessible={true}
      accessibilityRole="button">
      <Animated.View
        style={[
          styles.controlButton,
          {
            width: sizes[size],
            height: sizes[size],
            transform: [{ scale: scaleValue }],
            backgroundColor: transparent ? 'transparent' : 'rgba(255,255,255,0.1)',
            opacity: disabled ? 0.3 : 1,
          },
          isFocused && styles.controlButtonFocused,
        ]}>
        <Icon name={icon} size={iconSizes[size]} color="#fff" />
      </Animated.View>
    </TouchableOpacity>
  );
}


const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width,
    height,
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  bufferingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 24,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topIconButton: {
    padding: 8,
    marginRight: 16,
  },
  topTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    opacity: 0.9,
  },
  bottomContainer: {
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 24,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  controlGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlGroupRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  endsAtText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 16,
    opacity: 0.8,
  },
  bottomIconButton: {
    padding: 4,
    position: 'relative',
  },
  disabledButton: {
    opacity: 0.3,
  },
  subtitleLabel: {
    position: 'absolute',
    bottom: -12,
    alignSelf: 'center',
    color: '#e50914',
    fontSize: 10,
    fontWeight: 'bold',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarContainer: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  timeLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    minWidth: 45,
    textAlign: 'center',
    opacity: 0.8,
  },
  controlButton: {
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonFocused: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 48,
  },
  errorText: {
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  errorButton: {
    padding: 16,
    backgroundColor: '#e50914',
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  errorButtonSecondary: {
    padding: 16,
    backgroundColor: '#333',
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 400,
    maxHeight: '70%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalList: {
    paddingBottom: 10,
  },
  modalItem: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modalItemActive: {
    backgroundColor: '#fff',
  },
  modalItemText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  personItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  personName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  personRole: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
  volumeSliderPopup: {
    position: 'absolute',
    bottom: 40,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 200,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  volumeIconTop: {
    padding: 4,
  },
  volumeIconBottom: {
    padding: 4,
  },
  volumeSliderContainer: {
    flex: 1,
    width: 6,
    marginVertical: 8,
    justifyContent: 'flex-end',
  },
  volumeSliderTrack: {
    width: 6,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  volumeSliderFill: {
    width: '100%',
    backgroundColor: '#fff',
  },
  volumePercentage: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});


