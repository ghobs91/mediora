import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import Video, { OnProgressData, VideoRef } from 'react-native-video';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamAttempt, setStreamAttempt] = useState<'hls' | 'transcoded'>('hls');
  const [isRetrying, setIsRetrying] = useState(false);

  const videoRef = useRef<VideoRef>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const loadPlaybackInfo = useCallback(async () => {
    if (!jellyfin) return;

    try {
      console.log('[PlayerScreen] Loading playback info for item:', itemId);
      // Start a new play session before loading playback info
      jellyfin.newPlaySession();
      console.log('[PlayerScreen] New play session:', jellyfin.getPlaySessionId());
      
      const info = await jellyfin.getPlaybackInfo(itemId);
      console.log('[PlayerScreen] Playback info received:', {
        mediaSourcesCount: info.MediaSources?.length,
        firstMediaSource: info.MediaSources?.[0]?.Id,
        container: info.MediaSources?.[0]?.Container,
        supportsTranscoding: info.MediaSources?.[0]?.SupportsTranscoding,
        supportsDirectPlay: info.MediaSources?.[0]?.SupportsDirectPlay,
        supportsDirectStream: info.MediaSources?.[0]?.SupportsDirectStream,
      });
      setPlaybackInfo(info);

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
  }, []);

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
        onProgress={handleProgress}
        onLoad={(data) => {
          console.log('[PlayerScreen] Video loaded, duration:', data.duration);
          handleLoad(data);
          // Start auto-hide timer for controls
          showControlsWithTimeout();
        }}
        onReadyForDisplay={() => {
          console.log('[PlayerScreen] Video ready for display');
          // Ensure controls auto-hide after video is ready
          showControlsWithTimeout();
        }}
        onBuffer={(data) => {
          console.log('[PlayerScreen] Buffering:', data.isBuffering);
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

      {showControls && (
        <Animated.View
          style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <ControlButton
              icon="arrow-back"
              onPress={handleBack}
              size="medium"
            />
          </View>

          {/* Center Controls */}
          <View style={styles.centerControls}>
            <ControlButton
              icon="play-back"
              onPress={() => handleSeek(false)}
              size="large"
            />
            <ControlButton
              icon={isPlaying ? 'pause' : 'play'}
              onPress={handlePlayPause}
              size="xlarge"
              hasTVPreferredFocus={true}
            />
            <ControlButton
              icon="play-forward"
              onPress={() => handleSeek(true)}
              size="large"
            />
          </View>

          {/* Bottom Bar */}
          <View style={styles.bottomBar}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: (duration > 0 ? (currentTime / duration) * 100 : 0) + '%' },
                ]}
              />
            </View>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

interface ControlButtonProps {
  icon: string;
  onPress: () => void;
  size?: 'medium' | 'large' | 'xlarge';
  hasTVPreferredFocus?: boolean;
}

function ControlButton({ icon, onPress, size = 'medium', hasTVPreferredFocus = false }: ControlButtonProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    console.log('[ControlButton] Focused:', icon);
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.2,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handleBlur = () => {
    console.log('[ControlButton] Blurred:', icon);
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePress = () => {
    console.log('[ControlButton] Pressed:', icon);
    onPress();
  };

  const sizes = {
    medium: 50,
    large: 70,
    xlarge: 100,
  };

  const iconSize = {
    medium: 28,
    large: 40,
    xlarge: 56,
  };

  return (
    <TouchableOpacity
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={handlePress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      // Ensure it's focusable on tvOS
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
          },
          isFocused && styles.controlButtonFocused,
        ]}>
        <Icon name={icon} size={iconSize[size]} color="#fff" />
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
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    padding: 48,
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 48,
    gap: 16,
  },
  controlButton: {
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonFocused: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 3,
    borderColor: '#fff',
  },
  controlButtonText: {
    color: '#fff',
  },
  timeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 60,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 3,
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
