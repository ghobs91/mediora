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
  const [useDirectStream, setUseDirectStream] = useState(false);

  const videoRef = useRef<VideoRef>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const loadPlaybackInfo = useCallback(async () => {
    if (!jellyfin) return;

    try {
      console.log('[PlayerScreen] Loading playback info for item:', itemId);
      const info = await jellyfin.getPlaybackInfo(itemId);
      console.log('[PlayerScreen] Playback info received:', {
        mediaSourcesCount: info.MediaSources?.length,
        firstMediaSource: info.MediaSources?.[0]?.Id,
      });
      setPlaybackInfo(info);

      if (info.MediaSources.length > 0) {
        await jellyfin.reportPlaybackStart(
          itemId,
          info.MediaSources[0].Id,
          0,
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

    return () => {
      // Report playback stopped when leaving
      if (jellyfin && playbackInfo?.MediaSources[0]) {
        jellyfin.reportPlaybackStopped(
          itemId,
          playbackInfo.MediaSources[0].Id,
          Math.floor(currentTime * 10000000), // Convert to ticks
        );
      }
    };
  }, []);

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
      );
    }
  };

  const handleLoad = (data: { duration: number }) => {
    setDuration(data.duration);
  };

  const handlePlayPause = () => {
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
        <TouchableOpacity onPress={handleBack} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
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

  const streamUrl = jellyfin.getHlsStreamUrl(
    itemId,
    playbackInfo.MediaSources[0].Id,
  );

  // Fallback to direct stream if HLS is problematic
  const directStreamUrl = jellyfin.getStreamUrl(
    itemId,
    playbackInfo.MediaSources[0].Id,
  );

  const videoUrl = useDirectStream ? directStreamUrl : streamUrl;

  console.log('[PlayerScreen] Stream URL:', videoUrl);
  console.log('[PlayerScreen] Using direct stream:', useDirectStream);

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={showControlsWithTimeout}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={styles.video}
        resizeMode="contain"
        paused={!isPlaying}
        onProgress={handleProgress}
        onLoad={handleLoad}
        onError={(err) => {
          console.error('[PlayerScreen] Video error:', err);
          console.error('[PlayerScreen] Error details:', JSON.stringify(err, null, 2));
          
          // Try direct stream as fallback
          if (!useDirectStream) {
            console.log('[PlayerScreen] HLS failed, trying direct stream...');
            setUseDirectStream(true);
          } else {
            setError(err.error?.errorString || err.error?.localizedDescription || 'Playback error. Please check your network connection and Jellyfin server.');
          }
        }}
      />

      {showControls && (
        <Animated.View
          style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <ControlButton
              icon="←"
              onPress={handleBack}
              size="medium"
            />
          </View>

          {/* Center Controls */}
          <View style={styles.centerControls}>
            <ControlButton
              icon="⏪"
              onPress={() => handleSeek(false)}
              size="large"
            />
            <ControlButton
              icon={isPlaying ? '⏸' : '▶'}
              onPress={handlePlayPause}
              size="xlarge"
            />
            <ControlButton
              icon="⏩"
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
}

function ControlButton({ icon, onPress, size = 'medium' }: ControlButtonProps) {
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
    medium: 50,
    large: 70,
    xlarge: 100,
  };

  const fontSize = {
    medium: 24,
    large: 32,
    xlarge: 48,
  };

  return (
    <TouchableOpacity
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}>
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
        <Text style={[styles.controlButtonText, { fontSize: fontSize[size] }]}>
          {icon}
        </Text>
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
  errorButton: {
    padding: 16,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 18,
  },
});
