import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Video, { OnProgressData, VideoRef } from 'react-native-video';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices } from '../context';
import { LoadingScreen } from '../components';
import { RootStackParamList, JellyfinPlaybackInfo, JellyfinItem } from '../types';
import { playbackPositionService } from '../services/playbackPosition';

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
  const { itemId } = route.params;

  const [playbackInfo, setPlaybackInfo] = useState<JellyfinPlaybackInfo | null>(null);
  const [item, setItem] = useState<JellyfinItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [_currentTime, setCurrentTime] = useState(0);
  const [_duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamAttempt, setStreamAttempt] = useState<'direct' | 'hls' | 'transcoded'>('hls');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

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

  const loadPlaybackInfo = useCallback(async () => {
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

      // Check for saved position
      let startPositionSeconds = 0;
      if (itemDetails.UserData?.PlaybackPositionTicks && itemDetails.UserData.PlaybackPositionTicks > 300000000) {
        startPositionSeconds = itemDetails.UserData.PlaybackPositionTicks / 10000000;
        console.log(`[PlayerScreen] Resume position from server: ${Math.floor(startPositionSeconds)}s`);
      } else {
        const savedPosition = await playbackPositionService.getPosition(itemId);
        if (savedPosition && savedPosition.positionSeconds > 30) {
          startPositionSeconds = savedPosition.positionSeconds;
          console.log(`[PlayerScreen] Resume position from local: ${Math.floor(startPositionSeconds)}s`);
        }
      }

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

      // Report playback stopped to server
      if (currentJellyfin && currentPlaybackInfo?.MediaSources[0]) {
        currentJellyfin.reportPlaybackStopped(
          itemId,
          currentPlaybackInfo.MediaSources[0].Id,
          Math.floor(time * 10000000),
        );
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

    // Report progress every 10 seconds
    const currentSecond = Math.floor(data.currentTime);
    if (jellyfin && playbackInfo?.MediaSources[0] && currentSecond % 10 === 0 && currentSecond !== lastProgressReport.current) {
      lastProgressReport.current = currentSecond;
      jellyfin.reportPlaybackProgress(
        itemId,
        playbackInfo.MediaSources[0].Id,
        Math.floor(data.currentTime * 10000000),
        false,
        'Transcode',
      );
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

  if (!jellyfin || !playbackInfo?.MediaSources[0] || !videoUrl) {
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
        style={styles.video}
        // Use native controls - this uses AVPlayerViewController on iOS/tvOS
        // which provides native subtitle picker, rotation handling, PiP, AirPlay
        controls={true}
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
        playInBackground={false}
        playWhenInactive={false}
        automaticallyWaitsToMinimizeStalling={true}
        preferredForwardBufferDuration={30}
        // Enable native features
        allowsExternalPlayback={true}
        ignoreSilentSwitch="ignore"
        // Fullscreen configuration for proper rotation handling
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
    </View>
  );
}

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
});


