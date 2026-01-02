import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Video, { VideoRef } from 'react-native-video';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { LoadingScreen } from '../components';
import { RootStackParamList } from '../types';

type LivePlayerScreenRouteProp = RouteProp<RootStackParamList, 'LivePlayer'>;

export function LivePlayerScreen() {
  const route = useRoute<LivePlayerScreenRouteProp>();
  const navigation = useNavigation();
  const { channelName, streamUrl, logo } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<VideoRef>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

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
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, 5000);
  }, [controlsOpacity]);

  useEffect(() => {
    // Start controls auto-hide timer
    showControlsWithTimeout();
    
    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    };
  }, [showControlsWithTimeout]);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    showControlsWithTimeout();
  };

  const handleVolumeChange = (increase: boolean) => {
    const newVolume = increase 
      ? Math.min(1, volume + 0.1) 
      : Math.max(0, volume - 0.1);
    setVolume(newVolume);
    if (newVolume > 0) setIsMuted(false);
    showControlsWithTimeout();
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alert-circle-outline" size={64} color="rgba(255, 255, 255, 0.3)" />
        <Text style={styles.errorText}>{error}</Text>
        <View style={styles.errorButtons}>
          <TouchableOpacity onPress={handleRetry} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBack} style={styles.errorButtonSecondary}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={showControlsWithTimeout}
      accessible={false}>
      <Video
        ref={videoRef}
        source={{
          uri: streamUrl,
          headers: {
            'Accept': '*/*',
          },
        }}
        style={styles.video}
        resizeMode="contain"
        paused={false}
        volume={isMuted ? 0 : volume}
        rate={1}
        onLoad={() => {
          console.log('[LivePlayer] Stream loaded:', channelName);
          setIsLoading(false);
          showControlsWithTimeout();
        }}
        onReadyForDisplay={() => {
          console.log('[LivePlayer] Stream ready for display');
          setIsLoading(false);
        }}
        onBuffer={(data) => {
          console.log('[LivePlayer] Buffering:', data.isBuffering);
          setIsLoading(data.isBuffering);
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
          console.error('[LivePlayer] Stream error:', err);
          const errorCode = err.error?.code;
          let errorMessage = 'Failed to load stream.';
          
          if (errorCode === -11822) {
            errorMessage = 'Authentication failed. Please check your connection.';
          } else if (errorCode === -12889 || errorCode === -12847) {
            errorMessage = 'Stream format not supported.';
          } else {
            errorMessage = err.error?.localizedDescription || 'Failed to load stream. The channel may be offline.';
          }
          
          setError(errorMessage);
          setIsLoading(false);
        }}
      />

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <LoadingScreen message={`Loading ${channelName}...`} />
        </View>
      )}

      {showControls && (
        <Animated.View
          style={[styles.controlsOverlay, { opacity: controlsOpacity }]}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <TouchableOpacity onPress={handleBack} style={styles.topIconButton}>
                <Icon name="arrow-back" size={28} color="#fff" />
              </TouchableOpacity>
              {logo && (
                <Image
                  source={{ uri: logo }}
                  style={styles.channelLogo}
                  resizeMode="contain"
                />
              )}
              <View>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <Text style={styles.channelName}>{channelName}</Text>
              </View>
            </View>
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomContainer}>
            <View style={styles.controlRow}>
              <View style={styles.volumeControls}>
                <TouchableOpacity 
                  onPress={handleToggleMute}
                  style={styles.volumeButton}>
                  <Icon 
                    name={isMuted ? "volume-mute" : volume < 0.5 ? "volume-low" : "volume-high"} 
                    size={24} 
                    color="#fff" 
                  />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleVolumeChange(false)}
                  style={styles.volumeButton}>
                  <Icon name="remove" size={20} color="#fff" />
                </TouchableOpacity>
                <View style={styles.volumeTrack}>
                  <View style={[styles.volumeLevel, { width: `${volume * 100}%` }]} />
                </View>
                <TouchableOpacity 
                  onPress={() => handleVolumeChange(true)}
                  style={styles.volumeButton}>
                  <Icon name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      )}
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
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
    gap: 16,
  },
  topIconButton: {
    padding: 8,
  },
  channelLogo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e50914',
  },
  liveText: {
    color: '#e50914',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  channelName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  bottomContainer: {
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 24,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  volumeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  volumeButton: {
    padding: 8,
  },
  volumeTrack: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  volumeLevel: {
    height: '100%',
    backgroundColor: '#fff',
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
    fontSize: 20,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 32,
    maxWidth: 500,
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
    fontWeight: '600',
  },
});
