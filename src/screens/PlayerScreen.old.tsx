import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  TVEventHandler,
  useTVEventHandler,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import Video, { OnProgressData, VideoRef } from 'react-native-video';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices } from '../context';
import { LoadingScreen } from '../components';
import { RootStackParamList, JellyfinPlaybackInfo } from '../types';
import { playbackPositionService } from '../services/playbackPosition';

type PlayerScreenRouteProp = RouteProp<RootStackParamList, 'Player'>;

export function PlayerScreen() {
  const route = useRoute<PlayerScreenRouteProp>();
  const navigation = useNavigation();
  const { jellyfin } = useServices();
  const { itemId } = route.params;
  const insets = useSafeAreaInsets();

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
  const [streamAttempt, setStreamAttempt] = useState<'direct' | 'hls' | 'transcoded'>('direct');
  const [isRetrying, setIsRetrying] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [startPositionTicks, setStartPositionTicks] = useState<number>(0);

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
  const hasRestoredPosition = useRef(false);
  const savedPositionToRestore = useRef<number>(0);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoLoadedRef = useRef(false);

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

      // Start with HLS for transcoding support (handles AV1, HEVC, etc.)
      // Direct stream only works if codecs are natively supported
      if (info.MediaSources.length > 0) {
        const container = info.MediaSources[0].Container?.toLowerCase();
        const videoCodec = info.MediaSources[0].MediaStreams.find(s => s.Type === 'Video')?.Codec;
        console.log('[PlayerScreen] Container:', container, 'Video codec:', videoCodec);
        console.log('[PlayerScreen] Starting with HLS streaming for transcoding support');
        setStreamAttempt('hls');
      }

      // If it's an episode, fetch all episodes in the season for exploration
      if (itemDetails.Type === 'Episode' && itemDetails.SeriesId) {
        const seasonEpisodes = await jellyfin.getEpisodes(
          itemDetails.SeriesId,
          itemDetails.SeasonId,
        );
        setEpisodes(seasonEpisodes);
      }


      // PRIORITY 1: Check Jellyfin server position first
      let startPosTicks = 0;
      let startPositionSeconds = 0;

      if (itemDetails.UserData?.PlaybackPositionTicks && itemDetails.UserData.PlaybackPositionTicks > 300000000) {
        // Server has a position (> 30 seconds in ticks)
        startPosTicks = itemDetails.UserData.PlaybackPositionTicks;
        startPositionSeconds = startPosTicks / 10000000;
        console.log(`[PlayerScreen] Using Jellyfin server position: ${Math.floor(startPositionSeconds)}s`);
        savedPositionToRestore.current = startPositionSeconds;
        hasRestoredPosition.current = false; // Will restore client-side
      } else {
        // PRIORITY 2: Fall back to local storage
        const savedPosition = await playbackPositionService.getPosition(itemId);
        if (savedPosition && savedPosition.positionSeconds > 30) {
          startPosTicks = savedPosition.positionTicks;
          startPositionSeconds = savedPosition.positionSeconds;
          console.log(`[PlayerScreen] Using local storage position: ${Math.floor(startPositionSeconds)}s`);
          savedPositionToRestore.current = startPositionSeconds;
          hasRestoredPosition.current = false; // Will restore client-side
        } else {
          savedPositionToRestore.current = 0;
          hasRestoredPosition.current = true; // No position to restore
        }
      }

      if (info.MediaSources.length > 0) {
        // For transcoded content (HLS), always start from 0 to avoid slow seeking during transcode
        // We'll seek client-side after playback starts
        const videoCodec = info.MediaSources[0].MediaStreams.find(s => s.Type === 'Video')?.Codec;
        const needsTranscoding = videoCodec === 'av1' || videoCodec === 'hevc' || videoCodec === 'vp9';
        const reportPosition = needsTranscoding ? 0 : startPosTicks;
        
        console.log(`[PlayerScreen] Video codec: ${videoCodec}, needs transcoding: ${needsTranscoding}`);
        console.log(`[PlayerScreen] Reporting playback start at position ${reportPosition / 10000000}s`);
        
        // Report playback start with the correct position
        await jellyfin.reportPlaybackStart(
          itemId,
          info.MediaSources[0].Id,
          reportPosition,
          'DirectStream', // Start with DirectStream, will be updated based on actual method
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
      // Save playback position before leaving
      if (item && currentTime > 0 && duration > 0) {
        playbackPositionService.savePosition({
          itemId: item.Id,
          positionTicks: Math.floor(currentTime * 10000000),
          positionSeconds: currentTime,
          durationSeconds: duration,
          timestamp: Date.now(),
          title: item.Name,
          type: item.Type,
        });
      }

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

  // Set up TV remote event handler using hook (must be called unconditionally)
  useTVEventHandler((evt: any) => {
    if (!Platform.isTV || !evt || !evt.eventType) return;

    const { eventType } = evt;
    console.log('[PlayerScreen] TV Remote Event:', eventType);

    switch (eventType) {
      case 'playPause':
        console.log('[PlayerScreen] Play/Pause button pressed');
        setIsPlaying(prev => {
          console.log('[PlayerScreen] Toggling play state from:', prev, 'to:', !prev);
          return !prev;
        });
        showControlsWithTimeout();
        break;
      case 'play':
        console.log('[PlayerScreen] Play button pressed');
        setIsPlaying(true);
        showControlsWithTimeout();
        break;
      case 'pause':
        console.log('[PlayerScreen] Pause button pressed');
        setIsPlaying(false);
        showControlsWithTimeout();
        break;
      case 'rewind':
        console.log('[PlayerScreen] Rewind button pressed, current time:', currentTime);
        if (videoRef.current) {
          const newTime = Math.max(0, currentTime - 10);
          videoRef.current.seek(newTime);
          setCurrentTime(newTime);
        }
        showControlsWithTimeout();
        break;
      case 'fastForward':
        console.log('[PlayerScreen] Fast Forward button pressed, current time:', currentTime);
        if (videoRef.current) {
          const newTime = Math.min(duration, currentTime + 10);
          videoRef.current.seek(newTime);
          setCurrentTime(newTime);
        }
        showControlsWithTimeout();
        break;
      case 'select':
        console.log('[PlayerScreen] Select button pressed');
        setIsPlaying(prev => !prev);
        showControlsWithTimeout();
        break;
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        console.log('[PlayerScreen] Directional button pressed:', eventType);
        // Let the focus system handle left/right/up/down for navigation
        showControlsWithTimeout();
        break;
      case 'menu':
        console.log('[PlayerScreen] Menu button pressed');
        navigation.goBack();
        break;
      default:
        console.log('[PlayerScreen] Unhandled event type:', eventType);
    }
  });

  useEffect(() => {
    console.log('[PlayerScreen] Component mounted, Platform.isTV:', Platform.isTV, 'Platform.OS:', Platform.OS);
    
    // Cleanup on unmount
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  // Log stream attempt changes
  useEffect(() => {
    if (jellyfin && playbackInfo?.MediaSources[0]) {
      const mediaSourceId = playbackInfo.MediaSources[0].Id;
      console.log('[PlayerScreen] Stream type:', streamType);
      console.log('[PlayerScreen] Stream URL:', videoUrl);
      console.log('[PlayerScreen] Subtitles:', { 
        enabled: subtitlesEnabled, 
        trackIndex: selectedSubtitleTrack,
        method: subtitlesEnabled ? 'server-side burn (Encode)' : 'disabled'
      });
      console.log('[PlayerScreen] Media source:', {
        id: mediaSourceId,
        container: playbackInfo.MediaSources[0].Container,
      });
    }
  }, [streamAttempt, playbackInfo, jellyfin, itemId, subtitlesEnabled, selectedSubtitleTrack, videoUrl, streamType]);

  // Restore saved position when video is ready for display
  // Seeking immediately on ready is faster than waiting for buffering to complete
  const hasAttemptedSeek = useRef(false);

  const attemptPositionRestore = useCallback(() => {
    if (!hasAttemptedSeek.current &&
      savedPositionToRestore.current > 0 &&
      videoRef.current) {
      const positionToSeek = savedPositionToRestore.current;
      console.log('[PlayerScreen] Seeking to resume position:', Math.floor(positionToSeek), 's');
      hasAttemptedSeek.current = true;

      // Seek immediately - video player will handle buffering from this position
      videoRef.current.seek(positionToSeek);
      hasRestoredPosition.current = true;
      savedPositionToRestore.current = 0;
    }
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    setError(null);
    setIsLoading(true);
    setStreamAttempt('direct');
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
      // Don't hide controls if any modal is open
      if (isPlaying && !showSubtitles && !showPeople && !showSettings) {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }
    }, 5000);
  }, [isPlaying, controlsOpacity, showSubtitles, showPeople, showSettings]);

  const handleProgress = (data: OnProgressData) => {
    setCurrentTime(data.currentTime);

    // Report progress every 10 seconds
    if (jellyfin && playbackInfo?.MediaSources[0] && Math.floor(data.currentTime) % 10 === 0) {
      const playMethod = streamAttempt === 'direct' ? 'DirectStream' : 'Transcode';
      jellyfin.reportPlaybackProgress(
        itemId,
        playbackInfo.MediaSources[0].Id,
        Math.floor(data.currentTime * 10000000),
        !isPlaying,
        playMethod,
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

  const performSeek = useCallback((time: number) => {
    if (!videoRef.current || isSeeking) return;

    setIsSeeking(true);
    setIsBuffering(true);

    console.log(`[PlayerScreen] Seeking to ${Math.floor(time)}s`);
    videoRef.current.seek(time);
    setCurrentTime(time);

    // Clear seeking state after a reasonable time
    setTimeout(() => {
      setIsSeeking(false);
    }, 1000);
  }, [isSeeking]);

  const handleSeek = (forward: boolean) => {
    const seekTime = forward ? currentTime + 10 : currentTime - 10;
    const clampedTime = Math.max(0, Math.min(seekTime, duration));
    performSeek(clampedTime);
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

  const handleToggleSubtitles = async () => {
    const subtitleTracks = playbackInfo?.MediaSources[0]?.MediaStreams.filter(m => m.Type === 'Subtitle') || [];

    console.log('[PlayerScreen] Available subtitle tracks:', subtitleTracks.map(t => ({
      index: t.Index,
      language: t.Language,
      title: t.DisplayTitle,
      isDefault: t.IsDefault
    })));

    if (subtitleTracks.length === 0) {
      return; // No subtitles available
    }

    // Save current position before reloading stream
    const currentPosition = currentTime;

    // Stop current encoding session before changing subtitle settings
    if (jellyfin && streamAttempt === 'hls') {
      console.log('[PlayerScreen] Stopping encoding session to change subtitles...');
      await jellyfin.stopEncodingSession();
    }

    if (!subtitlesEnabled) {
      // Enable subtitles with the first available track or default track
      const defaultTrack = subtitleTracks.find(track => track.IsDefault) || subtitleTracks[0];
      setSelectedSubtitleTrack(defaultTrack.Index);
      setSubtitlesEnabled(true);
      console.log('[PlayerScreen] Subtitles enabled, track:', defaultTrack.DisplayTitle || defaultTrack.Language, 'index:', defaultTrack.Index);
    } else {
      // Disable subtitles
      setSelectedSubtitleTrack(undefined);
      setSubtitlesEnabled(false);
      console.log('[PlayerScreen] Subtitles disabled');
    }

    // Save position for restoration after reload
    if (currentPosition > 0) {
      savedPositionToRestore.current = currentPosition;
      hasRestoredPosition.current = false;
      console.log('[PlayerScreen] Will restore position after subtitle change:', Math.floor(currentPosition), 's');
    }

    // Force reload by toggling stream attempt and back
    // This ensures a fresh encoding session with new subtitle settings
    setStreamAttempt('direct');
    setTimeout(() => {
      setStreamAttempt('hls');
    }, 100);

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

    // Debounce rapid clicks on progress bar
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    seekTimeoutRef.current = setTimeout(() => {
      performSeek(seekTime);
    }, 200);

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

  // Memoize subtitle tracks to prevent array recreation on every render
  const subtitleTracks = useMemo(() => {
    return playbackInfo?.MediaSources[0]?.MediaStreams.filter(m => m.Type === 'Subtitle') || [];
  }, [playbackInfo?.MediaSources]);

  const hasSubtitles = subtitleTracks.length > 0;
  const currentSubtitleTrack = subtitleTracks.find(track => track.Index === selectedSubtitleTrack);
  const castList = item?.People || [];
  const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Note: External text tracks are disabled on tvOS due to AVKit limitations
  // Subtitles are burned into the HLS stream server-side using subtitleMethod='Encode'
  // This works with all subtitle formats including ASS, SSA, SRT, VTT, and image-based subtitles

  // Generate stream URLs - memoized to prevent recalculation on every render
  // Includes subtitle track index for server-side subtitle burning
  const { videoUrl, streamType } = useMemo(() => {
    if (!playbackInfo?.MediaSources[0] || !jellyfin) {
      return { videoUrl: '', streamType: '' };
    }

    const mediaSourceId = playbackInfo.MediaSources[0].Id;

    // Determine which subtitle track to burn into the stream (if any)
    // Server-side subtitle burning works better on tvOS than external text tracks
    const burnSubtitleIndex = subtitlesEnabled ? selectedSubtitleTrack : undefined;

    switch (streamAttempt) {
      case 'direct':
        // Direct stream doesn't support subtitle burning - subtitles won't show
        return {
          videoUrl: jellyfin.getStreamUrl(itemId, mediaSourceId),
          streamType: 'Direct Stream',
        };
      case 'hls':
        // Burn subtitles into HLS stream using subtitleMethod='Encode'
        // This works with all subtitle formats (ASS, SSA, SRT, VTT, PGS, etc.)
        return {
          videoUrl: jellyfin.getHlsStreamUrl(itemId, mediaSourceId, burnSubtitleIndex),
          streamType: burnSubtitleIndex !== undefined ? 'HLS (with subtitles)' : 'HLS (master.m3u8)',
        };
      case 'transcoded':
        return {
          videoUrl: jellyfin.getTranscodedStreamUrl(itemId, mediaSourceId),
          streamType: 'Transcoded (720p)',
        };
      default:
        return {
          videoUrl: jellyfin.getHlsStreamUrl(itemId, mediaSourceId, burnSubtitleIndex),
          streamType: 'HLS (master.m3u8)',
        };
    }
  }, [playbackInfo, streamAttempt, jellyfin, itemId, subtitlesEnabled, selectedSubtitleTrack]);

  const currentEpisodeIndex = episodes.findIndex(e => e.Id === item?.Id);
  const hasPrevious = currentEpisodeIndex > 0;
  const hasNext = currentEpisodeIndex !== -1 && currentEpisodeIndex < episodes.length - 1;

  // Memoize video element to prevent re-rendering when modal states change
  const videoElement = useMemo(() => (
    <Video
      ref={videoRef}
      key={`${videoUrl}-${subtitlesEnabled ? selectedSubtitleTrack : 'nosub'}`}
      source={{
        uri: videoUrl,
        type: streamAttempt === 'hls' ? 'm3u8' : undefined,
      }}
      // Subtitles are burned into the HLS stream server-side (no external text tracks needed)
      // This is more reliable on tvOS than using textTracks prop
      style={styles.video}
      resizeMode="contain"
      paused={!isPlaying}
      volume={volume}
      rate={playbackRate}
      onProgress={handleProgress}
      onLoadStart={() => {
        console.log('[PlayerScreen] Video load started, URL:', videoUrl);
        setIsBuffering(true);
        videoLoadedRef.current = false;
        
        // Validate URL is accessible before waiting for timeout
        fetch(videoUrl, { method: 'HEAD' })
          .then(response => {
            console.log('[PlayerScreen] URL validation - Status:', response.status, 'Content-Type:', response.headers.get('content-type'));
            if (!response.ok) {
              console.error('[PlayerScreen] URL returned error status:', response.status, response.statusText);
            }
          })
          .catch(err => {
            console.error('[PlayerScreen] URL validation failed:', err.message);
          });
        
        // Clear any existing timeout
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
        }
        
        // Set a timeout to fallback if video doesn't load within 30 seconds
        // AV1 transcoding can take 15-20s to generate first HLS segment
        loadTimeoutRef.current = setTimeout(() => {
          if (!videoLoadedRef.current) {
            console.log('[PlayerScreen] Load timeout - video failed to load within 30s');
            console.log('[PlayerScreen] Current stream attempt:', streamAttempt);
            
            // Trigger fallback
            if (streamAttempt === 'direct') {
              console.log('[PlayerScreen] Timeout: switching from direct to HLS...');
              setStreamAttempt('hls');
            } else if (streamAttempt === 'hls') {
              console.log('[PlayerScreen] Timeout: switching from HLS to transcoded...');
              setStreamAttempt('transcoded');
            } else {
              console.log('[PlayerScreen] All stream methods timed out');
              setError('Video failed to load. Transcoding may have failed on server.');
            }
          }
        }, 30000);
      }}
      onLoad={(data) => {
        console.log('[PlayerScreen] Video loaded, duration:', data.duration);
        videoLoadedRef.current = true;
        // Clear timeout since video loaded successfully
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        handleLoad(data);
        setIsBuffering(false);
        // Start auto-hide timer for controls
        showControlsWithTimeout();
      }}
      onReadyForDisplay={() => {
        console.log('[PlayerScreen] Video ready for display');
        videoLoadedRef.current = true;
        // Clear timeout since video is ready
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        setIsBuffering(false);
        // Attempt to restore position as soon as video is ready
        attemptPositionRestore();
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
        // Clear saved position when video completes
        if (item) {
          playbackPositionService.removePosition(item.Id);
        }
      }}
      onPlaybackRateChange={(data) => {
        console.log('[PlayerScreen] Playback rate:', data.playbackRate);
      }}
      repeat={false}
      playInBackground={false}
      playWhenInactive={false}
      automaticallyWaitsToMinimizeStalling={true}
      preferredForwardBufferDuration={30}
      bufferConfig={{
        minBufferMs: 15000,
        maxBufferMs: 50000,
        bufferForPlaybackMs: 2500,
        bufferForPlaybackAfterRebufferMs: 5000,
      }}
      onError={(err) => {
        console.error('[PlayerScreen] Video error:', err);
        videoLoadedRef.current = false;
        // Clear timeout on error
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        setIsBuffering(false);

        const errorCode = err?.error?.errorString || err?.error?.code || 'unknown';
        console.log('[PlayerScreen] Error code:', errorCode);
        console.log('[PlayerScreen] Current stream attempt:', streamAttempt);

        // Attempt fallback strategy
        if (streamAttempt === 'direct') {
          console.log('[PlayerScreen] Error with direct stream, trying HLS...');
          setStreamAttempt('hls');
        } else if (streamAttempt === 'hls') {
          console.log('[PlayerScreen] Error with HLS stream, trying transcoded...');
          setStreamAttempt('transcoded');
        } else {
          console.log('[PlayerScreen] All stream methods failed');
          setError(`Playback failed: ${errorCode}. Try restarting the server.`);
        }
      }}
    />
  ), [videoUrl, streamAttempt, isPlaying, volume, playbackRate, subtitlesEnabled, selectedSubtitleTrack, handleProgress, handleLoad, showControlsWithTimeout, attemptPositionRestore, item, jellyfin, itemId]);

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

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={showControlsWithTimeout}
      // Don't capture focus on tvOS - let buttons handle it
      accessible={false}>
      {videoElement}

      {/* Buffering Indicator */}
      {isBuffering && !isSeeking && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.bufferingText}>Buffering...</Text>
        </View>
      )}

      {/* Seeking Indicator */}
      {isSeeking && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.bufferingText}>Seeking...</Text>
        </View>
      )}

      {showControls && (
        <Animated.View
          focusable={false}
          style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
          {/* Top Bar */}
          <View focusable={false} style={[styles.topBar, { paddingTop: Math.max(insets.top, 20), paddingLeft: Math.max(insets.left, 24), paddingRight: Math.max(insets.right, 24) }]}>
            <View focusable={false} style={styles.topBarLeft}>
              <TouchableOpacity onPress={handleBack} style={styles.topIconButton} tvParallaxProperties={undefined}>
                <Icon name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.topTitle}>{getEnrichedTitle()}</Text>
            </View>
            <View focusable={false} style={styles.topBarRight}>
            </View>
          </View>

          {/* Bottom Container */}
          <View focusable={false} style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 24), paddingLeft: Math.max(insets.left, 24), paddingRight: Math.max(insets.right, 24) }]}>
            {/* Control Row */}
            <View focusable={false} style={styles.controlRow}>
              <View focusable={false} style={styles.controlGroupLeft}>
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

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                focusable={false}
                contentContainerStyle={styles.controlGroupRight}
                style={{ flexGrow: 0 }}>
                <IconButton
                  icon={isFavorite ? "heart" : "heart-outline"}
                  onPress={handleToggleFavorite}
                  color={isFavorite ? "#e50914" : "#fff"}
                />
                <IconButton
                  icon="chatbubble-outline"
                  onPress={() => {
                    console.log('[PlayerScreen] Opening subtitle selection, available tracks:', subtitleTracks.map(t => ({
                      index: t.Index,
                      language: t.Language,
                      title: t.DisplayTitle,
                      codec: t.Codec
                    })));
                    // Clear the controls timeout to keep controls visible while modal is open
                    if (controlsTimeout.current) {
                      clearTimeout(controlsTimeout.current);
                    }
                    setShowSubtitles(true);
                  }}
                  disabled={!hasSubtitles}
                  color={subtitlesEnabled ? "#e50914" : "#fff"}
                />
                <IconButton
                  icon={volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-low" : "volume-high"}
                  onPress={() => {
                    setShowVolumeSlider(!showVolumeSlider);
                    showControlsWithTimeout();
                  }}
                />
                <IconButton
                  icon="settings-outline"
                  onPress={() => {
                    // Clear the controls timeout to keep controls visible while modal is open
                    if (controlsTimeout.current) {
                      clearTimeout(controlsTimeout.current);
                    }
                    setShowSettings(true);
                  }}
                />
                <IconButton
                  icon="copy-outline"
                  onPress={() => setIsPiP(!isPiP)}
                />
                <IconButton
                  icon="expand-outline"
                  onPress={() => setIsFullscreen(!isFullscreen)}
                />
              </ScrollView>
            </View>

            {/* Progress Bar Container */}
            <View focusable={false} style={styles.progressSection}>
              <Text style={styles.timeLabel}>{formatTime(currentTime)}</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleProgressPress}
                style={styles.progressBarContainer}
                tvParallaxProperties={undefined}
                onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` as any },
                    ]}
                  />
                </View>
              </TouchableOpacity>
              <Text style={styles.timeLabel}>{formatRemainingTime(currentTime)}</Text>
            </View>
          </View>

          {/* Volume Slider Popup */}
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
        </Animated.View>
      )}

      {/* Selection Modals */}
      <SelectionModal
        visible={showSubtitles}
        title="Subtitles"
        onClose={() => setShowSubtitles(false)}
        data={[{ Index: -1, DisplayTitle: 'Off', Type: 'Subtitle' as const }, ...subtitleTracks]}
        keyExtractor={(item) => item.Index.toString()}
        renderItem={({ item: track, index }) => (
          <ModalItem
            text={track.DisplayTitle || track.Language || `Track ${track.Index}`}
            isActive={track.Index === -1 ? !subtitlesEnabled : selectedSubtitleTrack === track.Index}
            hasTVPreferredFocus={index === 0}
            onPress={async () => {
              // Close modal first to restore focus
              setShowSubtitles(false);
              
              // Small delay to allow modal to close before state changes
              await new Promise(resolve => setTimeout(resolve, 100));
              
              if (track.Index === -1) {
                console.log('[PlayerScreen] Disabling subtitles');
                // If subtitles were enabled, toggle them off
                if (subtitlesEnabled) {
                  await handleToggleSubtitles();
                }
              } else {
                console.log('[PlayerScreen] Selecting subtitle track:', {
                  index: track.Index,
                  language: track.Language,
                  title: track.DisplayTitle
                });
                
                // Check if we're changing to a different subtitle track
                const isChangingTrack = selectedSubtitleTrack !== track.Index;
                
                if (isChangingTrack) {
                  // If subtitles are already enabled with a different track, need to reload
                  if (subtitlesEnabled && jellyfin && streamAttempt === 'hls') {
                    console.log('[PlayerScreen] Changing subtitle track, stopping encoding session...');
                    await jellyfin.stopEncodingSession();
                  }
                  
                  // Save current position
                  const currentPosition = currentTime;
                  if (currentPosition > 0) {
                    savedPositionToRestore.current = currentPosition;
                    hasRestoredPosition.current = false;
                    console.log('[PlayerScreen] Will restore position after subtitle change:', Math.floor(currentPosition), 's');
                  }
                  
                  // Update subtitle selection
                  setSelectedSubtitleTrack(track.Index);
                  setSubtitlesEnabled(true);
                  
                  // Force stream reload
                  setStreamAttempt('direct');
                  setTimeout(() => {
                    setStreamAttempt('hls');
                  }, 100);
                } else if (!subtitlesEnabled) {
                  // Just enabling the same track that was previously selected
                  await handleToggleSubtitles();
                }
              }
            }}
          />
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
        renderItem={({ item: speed, index }) => (
          <ModalItem
            text={`${speed}x`}
            isActive={playbackRate === speed}
            hasTVPreferredFocus={index === 1}
            onPress={() => {
              setPlaybackRate(speed);
              setShowSettings(false);
            }}
          />
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
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContent} focusable={false}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor || ((_, index) => index.toString())}
            contentContainerStyle={styles.modalList}
          />
        </View>
      </View>
    </Modal>
  );
}

interface ModalItemProps {
  text: string;
  isActive: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

function ModalItem({ text, isActive, onPress, hasTVPreferredFocus = false }: ModalItemProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.05,
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
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      activeOpacity={0.9}>
      <Animated.View
        style={[
          styles.modalItem,
          isActive && styles.modalItemActive,
          {
            transform: [{ scale: scaleValue }],
            borderWidth: isFocused ? 3 : 0,
            borderColor: isFocused ? '#fff' : 'transparent',
          },
        ]}>
        <Text
          style={[
            styles.modalItemText,
            isActive && { color: '#000' },
            isFocused && !isActive && { color: '#fff' },
          ]}>
          {text}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}


interface IconButtonProps {
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  badge?: string;
}

function IconButton({
  icon,
  onPress,
  disabled = false,
  color = '#fff',
  badge,
}: IconButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.3,
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
      onPress={onPress}
      disabled={disabled}
      style={[styles.bottomIconButton, disabled && styles.disabledButton]}
      tvParallaxProperties={undefined}
      accessible={true}
      accessibilityRole="button">
      <Animated.View
        style={{
          transform: [{ scale: scaleValue }],
        }}>
        <Icon name={icon} size={22} color={color} />
        {badge && (
          <Text style={styles.subtitleLabel}>
            {badge}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
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
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
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
    paddingTop: 40,
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
    paddingBottom: 24,
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
    bottom: 100,
    right: 150,
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


