import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import Video, { OnProgressData, VideoRef } from 'react-native-video';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices } from '../context';
import { LoadingScreen } from '../components';
import { RootStackParamList, JellyfinPlaybackInfo, JellyfinItem } from '../types';
import { playbackPositionService } from '../services/playbackPosition';
import { videoPlayerWindowService } from '../services/videoPlayerWindow';
import { configureDisplayForHDR } from '../services/hdrSupport';
import { LocalMediaService } from '../services/localMedia';

type PlayerScreenRouteProp = RouteProp<RootStackParamList, 'Player'>;

/**
 * Native Player Screen
 * 
 * Uses react-native-video with native controls (controls={true}) which presents
 * AVPlayerViewController on iOS/tvOS. This provides:
 * - Native subtitle picker (no rebuffering when selecting subtitles)
 * - Native rotation handling (no rebuffering when rotating device)
 * - Native picture-in-picture support
 * - Native AirPlay support
 * - Native controls that auto-hide
 * - Proper safe area handling
 */
export function PlayerScreen() {
  const route = useRoute<PlayerScreenRouteProp>();
  const navigation = useNavigation();
  const { jellyfin } = useServices();
  const { itemId, localPath, title: routeTitle } = route.params;
  const insets = useSafeAreaInsets();

  const isLocalFile = !!localPath;

  const [playbackInfo, setPlaybackInfo] = useState<JellyfinPlaybackInfo | null>(null);
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [_currentTime, setCurrentTime] = useState(0);
  const [_duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamAttempt, setStreamAttempt] = useState<'direct' | 'hls' | 'transcoded'>('hls');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [useNativeWindow, setUseNativeWindow] = useState<boolean | null>(null);
  const [nativeWindowOpened, setNativeWindowOpened] = useState(false);
  
  // Debug: Log platform info
  console.log('[PlayerScreen] Platform.OS:', Platform.OS, 'Platform.isTV:', Platform.isTV, 'useNativeWindow:', useNativeWindow);
  
  // Show custom controls only if we're NOT using native window or on non-TV iOS
  const showCustomControls = useNativeWindow === false && !Platform.isTV && Platform.OS === 'ios';

  const videoRef = useRef<VideoRef>(null);
  const hasRestoredPosition = useRef(false);
  const savedPositionToRestore = useRef<number>(0);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoLoadedRef = useRef(false);
  const lastProgressReport = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const itemRef = useRef<JellyfinItem | null>(null);
  const jellyfinRef = useRef(jellyfin);
  const playbackInfoRef = useRef<JellyfinPlaybackInfo | null>(null);

  // Keep refs updated for cleanup
  useEffect(() => { itemRef.current = item; }, [item]);
  useEffect(() => { jellyfinRef.current = jellyfin; }, [jellyfin]);
  useEffect(() => { playbackInfoRef.current = playbackInfo; }, [playbackInfo]);

  // Check if native window player is supported (Mac Catalyst)
  useEffect(() => {
    const checkNativeWindow = async () => {
      try {
        const supported = await videoPlayerWindowService.isSupported();
        console.log('[PlayerScreen] Native window player supported:', supported);
        setUseNativeWindow(supported);
      } catch (err) {
        console.log('[PlayerScreen] Native window check failed:', err);
        setUseNativeWindow(false);
      }
    };
    checkNativeWindow();
  }, []);

  // Open native window player when ready (Mac Catalyst)
  // This opens video in a separate macOS window with native window controls
  useEffect(() => {
    const openNativePlayer = async () => {
      if (useNativeWindow !== true || isLoading || !playbackInfo?.MediaSources[0] || !jellyfin || !item || nativeWindowOpened) {
        return;
      }

      try {
        const mediaSourceId = playbackInfo.MediaSources[0].Id;
        const videoUrl = jellyfin.getHlsStreamUrl(itemId, mediaSourceId);
        const title = item.Name || 'Video';
        const startPosition = savedPositionToRestore.current;

        console.log('[PlayerScreen] Opening native window player:', { title, videoUrl: videoUrl.substring(0, 100) });
        setNativeWindowOpened(true); // Prevent multiple opens
        
        const result = await videoPlayerWindowService.openPlayer(videoUrl, title, itemId, startPosition);
        console.log('[PlayerScreen] Native window opened:', result);
        
        // Navigate back immediately - native window handles its own playback and close
        setTimeout(() => navigation.goBack(), 100);
      } catch (err) {
        console.error('[PlayerScreen] Failed to open native window:', err);
        // Fallback to in-app player
        setUseNativeWindow(false);
        setNativeWindowOpened(false);
      }
    };

    openNativePlayer();
  }, [isLoading, useNativeWindow, playbackInfo, jellyfin, item, itemId, navigation, nativeWindowOpened]);

  // Handle keyboard events on macOS (ESC to exit)
  useEffect(() => {
    if (Platform.OS !== 'macos') return;

    const handleKeyPress = (e: any) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        navigation.goBack();
      }
    };

    // @ts-ignore - addEventListener exists in React Native macOS
    document?.addEventListener('keydown', handleKeyPress);

    return () => {
      // @ts-ignore
      document?.removeEventListener('keydown', handleKeyPress);
    };
  }, [navigation]);

  const loadPlaybackInfo = useCallback(async () => {
    // Local file playback - no need for Jellyfin playback info
    if (isLocalFile && localPath) {
      console.log('[PlayerScreen] Playing local file:', localPath);
      setItem({
        Id: itemId,
        Name: routeTitle || 'Local Video',
        Type: 'Movie',
        ServerId: 'local',
      });
      setIsLoading(false);
      return;
    }

    if (!jellyfin) return;

    try {
      console.log('[PlayerScreen] Loading playback info for:', itemId);
      jellyfin.newPlaySession();

      const [info, itemDetails] = await Promise.all([
        jellyfin.getPlaybackInfo(itemId),
        jellyfin.getItem(itemId),
      ]);

      setPlaybackInfo(info);
      setItem(itemDetails);

      // Configure tvOS display for automatic HDR mode switching
      // This works with "Match Dynamic Range" in tvOS Settings
      if (Platform.isTV) {
        configureDisplayForHDR().then(result => {
          console.log('[PlayerScreen] HDR display configured:', result);
        });
      }

      // Check for saved position. Prefer the furthest position: if a server
      // write failed (queued for retry), local is ahead; if another device
      // advanced playback, the server is ahead. Max covers both.
      const serverTicks = itemDetails.UserData?.PlaybackPositionTicks ?? 0;
      const serverSeconds = serverTicks > 300000000 ? serverTicks / 10000000 : 0;
      if (serverSeconds > 0) {
        console.log(`[PlayerScreen] Resume position from server: ${Math.floor(serverSeconds)}s`);
      }
      const savedPosition = await playbackPositionService.getPosition(itemId);
      const localSeconds =
        savedPosition && savedPosition.positionSeconds > 30
          ? savedPosition.positionSeconds
          : 0;
      if (localSeconds > 0) {
        console.log(`[PlayerScreen] Resume position from local: ${Math.floor(localSeconds)}s`);
      }
      const startPositionSeconds = Math.max(serverSeconds, localSeconds);

      savedPositionToRestore.current = startPositionSeconds;
      hasRestoredPosition.current = startPositionSeconds === 0;

      if (info.MediaSources.length > 0) {
        await jellyfin.reportPlaybackStart(
          itemId,
          info.MediaSources[0].Id,
          0,
          'Transcode',
        );
      }
    } catch (err) {
      console.error('[PlayerScreen] Failed to load playback info:', err);
      setError(err instanceof Error ? err.message : 'Failed to load playback info');
    } finally {
      setIsLoading(false);
    }
  }, [jellyfin, itemId]);

  useEffect(() => {
    loadPlaybackInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Separate effect for cleanup - uses refs so no dependencies needed
  useEffect(() => {
    return () => {
      // Save position and report stopped on unmount
      const time = currentTimeRef.current;
      const dur = durationRef.current;
      const currentItem = itemRef.current;
      const currentJellyfin = jellyfinRef.current;
      const currentPlaybackInfo = playbackInfoRef.current;
      
      // Save position to local storage
      if (time > 0 && dur > 0 && currentItem) {
        playbackPositionService.savePosition({
          itemId: currentItem.Id,
          positionTicks: Math.floor(time * 10000000),
          positionSeconds: time,
          durationSeconds: dur,
          timestamp: Date.now(),
          title: currentItem.Name,
          type: currentItem.Type,
        });
      }

      // Report playback stopped to server (queued for retry on failure,
      // so background/kill doesn't lose resume state).
      if (currentJellyfin && currentPlaybackInfo?.MediaSources[0]) {
        currentJellyfin.reportPlaybackStopped(
          itemId,
          currentPlaybackInfo.MediaSources[0].Id,
          Math.floor(time * 10000000),
        ).catch(error => {
          console.warn('[PlayerScreen] Failed to report playback stopped:', error);
        });
        currentJellyfin.stopEncodingSession();
      }

      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
    // This effect intentionally has no dependencies - it only runs on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProgress = useCallback((data: OnProgressData) => {
    setCurrentTime(data.currentTime);
    currentTimeRef.current = data.currentTime;

    // Report progress every 10 seconds (failures queue for retry server-side
    // in JellyfinService; auth errors surface via console).
    const currentSecond = Math.floor(data.currentTime);
    if (jellyfin && playbackInfo?.MediaSources[0] && currentSecond % 10 === 0 && currentSecond !== lastProgressReport.current) {
      lastProgressReport.current = currentSecond;
      jellyfin.reportPlaybackProgress(
        itemId,
        playbackInfo.MediaSources[0].Id,
        Math.floor(data.currentTime * 10000000),
        false,
        'Transcode',
      ).catch(error => {
        console.warn('[PlayerScreen] Failed to report playback progress:', error);
      });
    }
  }, [jellyfin, playbackInfo, itemId]);

  const handleLoad = useCallback((data: { duration: number }) => {
    console.log('[PlayerScreen] Video loaded, duration:', data.duration);
    setDuration(data.duration);
    durationRef.current = data.duration;
    videoLoadedRef.current = true;
    setIsBuffering(false);

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    // Restore position if needed
    if (!hasRestoredPosition.current && savedPositionToRestore.current > 0 && videoRef.current) {
      console.log('[PlayerScreen] Seeking to resume position:', Math.floor(savedPositionToRestore.current), 's');
      videoRef.current.seek(savedPositionToRestore.current);
      hasRestoredPosition.current = true;
    }
  }, []);

  const handleEnd = useCallback(() => {
    console.log('[PlayerScreen] Video ended');
    if (item) {
      playbackPositionService.removePosition(item.Id);
    }
    navigation.goBack();
  }, [item, navigation]);

  const handleError = useCallback((err: any) => {
    console.error('[PlayerScreen] Video error:', err);
    videoLoadedRef.current = false;
    setIsBuffering(false);

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    const errorCode = err?.error?.errorString || err?.error?.code || 'unknown';
    console.log('[PlayerScreen] Error code:', errorCode, 'Stream attempt:', streamAttempt);

    // Fallback strategy
    if (streamAttempt === 'direct') {
      console.log('[PlayerScreen] Trying HLS...');
      setStreamAttempt('hls');
    } else if (streamAttempt === 'hls') {
      console.log('[PlayerScreen] Trying transcoded...');
      setStreamAttempt('transcoded');
    } else {
      setError(`Playback failed: ${errorCode}`);
    }
  }, [streamAttempt]);

  const handleRetry = async () => {
    setIsRetrying(true);
    setError(null);
    setIsLoading(true);
    setStreamAttempt('hls');
    await loadPlaybackInfo();
    setIsRetrying(false);
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Generate stream URL
  const videoUrl = useMemo(() => {
    if (isLocalFile && localPath) {
      const fileUrl = LocalMediaService.getFileUrl(localPath);
      console.log('[PlayerScreen] Local file URL:', fileUrl);
      return fileUrl;
    }
    if (!playbackInfo?.MediaSources[0] || !jellyfin) return '';

    const mediaSourceId = playbackInfo.MediaSources[0].Id;

    switch (streamAttempt) {
      case 'direct':
        return jellyfin.getStreamUrl(itemId, mediaSourceId);
      case 'hls':
        return jellyfin.getHlsStreamUrl(itemId, mediaSourceId);
      case 'transcoded':
        return jellyfin.getTranscodedStreamUrl(itemId, mediaSourceId);
      default:
        return jellyfin.getHlsStreamUrl(itemId, mediaSourceId);
    }
  }, [playbackInfo, streamAttempt, jellyfin, itemId]);

  // Log available subtitle streams for debugging
  useEffect(() => {
    if (playbackInfo?.MediaSources[0]) {
      const subtitleStreams = playbackInfo.MediaSources[0].MediaStreams.filter(
        s => s.Type === 'Subtitle'
      );
      console.log('[PlayerScreen] Available subtitle streams:', subtitleStreams.length);
      subtitleStreams.forEach(s => {
        console.log('[PlayerScreen] Subtitle:', {
          index: s.Index,
          language: s.Language,
          displayTitle: s.DisplayTitle,
          codec: s.Codec,
          isExternal: s.IsExternal,
        });
      });
    }
  }, [playbackInfo]);

  if (isLoading) {
    return <LoadingScreen message="Loading video..." />;
  }

  // If we're waiting to check native window support or opening native window, show loading
  if (useNativeWindow === null || (useNativeWindow === true && !nativeWindowOpened)) {
    return <LoadingScreen message="Opening player..." />;
  }

  // If native window was opened successfully, show loading while navigating back
  if (nativeWindowOpened) {
    return <LoadingScreen message="Opening native player window..." />;
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

  if (!videoUrl) {
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
    <View style={styles.container}>
      <Video
        ref={videoRef}
        source={{
          uri: videoUrl,
          type: streamAttempt === 'hls' ? 'm3u8' : undefined,
        }}
        style={Platform.isTV ? styles.videoTV : styles.video}
        // Disable native controls when we need custom back button (macOS/desktop)
        // Native controls cover React Native views
        controls={!showCustomControls}
        paused={isPaused}
        resizeMode="contain"
        onProgress={handleProgress}
        onLoad={handleLoad}
        onEnd={handleEnd}
        onError={handleError}
        onBuffer={(data) => setIsBuffering(data.isBuffering)}
        onLoadStart={() => {
          console.log('[PlayerScreen] Video load started');
          setIsBuffering(true);
          videoLoadedRef.current = false;

          // Timeout fallback
          if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = setTimeout(() => {
            if (!videoLoadedRef.current) {
              console.log('[PlayerScreen] Load timeout');
              if (streamAttempt === 'direct') {
                setStreamAttempt('hls');
              } else if (streamAttempt === 'hls') {
                setStreamAttempt('transcoded');
              } else {
                setError('Video failed to load');
              }
            }
          }, 30000);
        }}
        // Video configuration
        // Note: textTracks prop not used - subtitles are embedded in HLS stream via SubtitleMethod=Hls
        // AVPlayerViewController will automatically detect and display subtitle options from HLS manifest
        repeat={false}
        playInBackground={true}
        playWhenInactive={true}
        enterPictureInPictureOnLeave={true}
        automaticallyWaitsToMinimizeStalling={true}
        preferredForwardBufferDuration={30}
        // Enable native features
        allowsExternalPlayback={true}
        ignoreSilentSwitch="ignore"
        // Do NOT use fullscreen on tvOS — it modally presents AVPlayerViewController
        // which rips it out of the React Native view hierarchy causing a black screen
        // (width=0 constraint warnings). controls={true} already provides inline
        // AVPlayerViewController with native controls, which is correct for tvOS.
        fullscreen={false}
        fullscreenAutorotate={true}
        fullscreenOrientation="landscape"
        // Buffer configuration
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
      />

      {/* Only show buffering indicator - native controls handle everything else */}
      {isBuffering && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.bufferingText}>Loading...</Text>
        </View>
      )}

      {/* Custom controls overlay for macOS/desktop - back button and play/pause */}
      {showCustomControls && (
        <>
          {/* Tap anywhere to toggle play/pause */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsPaused(!isPaused)}
          />
          {/* Back button */}
          <Pressable
            style={[styles.backButton, { top: Math.max(insets.top, 20), left: Math.max(insets.left, 20) }]}
            onPress={(e) => {
              e.stopPropagation();
              handleBack();
            }}
          >
            <Icon name="arrow-back" size={28} color="#fff" />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          {/* Play/Pause indicator in center */}
          {isPaused && !isBuffering && (
            <View style={styles.pauseIndicator} pointerEvents="none">
              <Icon name="play" size={80} color="rgba(255,255,255,0.8)" />
              <Text style={styles.pauseText}>Tap to play</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  videoTV: {
    // Use explicit screen dimensions on tvOS to guarantee the native
    // AVPlayerViewController view gets non-zero bounds from Yoga layout.
    // flex:1 alone can result in zero-size frames on tvOS causing a black screen.
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  backButton: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    gap: 10,
    zIndex: 999999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pauseIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  pauseText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
});


