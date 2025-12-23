import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  Image,
  Dimensions,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useServices, useSettings } from '../context';
import { FocusableButton, LoadingScreen } from '../components';
import { RootStackParamList, JellyfinItem } from '../types';

type ItemDetailsRouteProp = RouteProp<RootStackParamList, 'ItemDetails'>;

export function ItemDetailsScreen() {
  const route = useRoute<ItemDetailsRouteProp>();
  const navigation = useNavigation();
  const { jellyfin } = useServices();
  const { item } = route.params;

  const handlePlay = () => {
    // @ts-ignore - navigation typing
    navigation.navigate('Player', { itemId: item.Id });
  };

  const formatRuntime = (ticks?: number): string => {
    if (!ticks) return '';
    const minutes = Math.floor(ticks / 600000000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  const getBackdropUrl = (): string | null => {
    if (!jellyfin) return null;
    if (item.BackdropImageTags?.length) {
      return jellyfin.getImageUrl(item.Id, 'Backdrop', { maxWidth: 1920 });
    }
    return null;
  };

  const getPosterUrl = (): string | null => {
    if (!jellyfin) return null;
    return jellyfin.getImageUrl(item.Id, 'Primary', { maxWidth: 400 });
  };

  const backdropUrl = getBackdropUrl();
  const posterUrl = getPosterUrl();

  return (
    <ScrollView style={styles.container}>
      {/* Backdrop */}
      {backdropUrl && (
        <Image
          source={{ uri: backdropUrl }}
          style={styles.backdrop}
          resizeMode="cover"
        />
      )}
      <View style={styles.backdropOverlay} />

      <View style={styles.content}>
        <View style={styles.mainContent}>
          {/* Poster */}
          {posterUrl && (
            <Image
              source={{ uri: posterUrl }}
              style={styles.poster}
              resizeMode="cover"
            />
          )}

          {/* Info */}
          <View style={styles.info}>
            <Text style={styles.title}>
              {item.SeriesName || item.Name}
            </Text>

            {item.SeriesName && (
              <Text style={styles.episodeTitle}>
                {item.SeasonName} • Episode {item.IndexNumber}: {item.Name}
              </Text>
            )}

            <View style={styles.metadata}>
              {item.ProductionYear && (
                <Text style={styles.metadataItem}>{item.ProductionYear}</Text>
              )}
              {item.OfficialRating && (
                <Text style={styles.metadataItem}>{item.OfficialRating}</Text>
              )}
              {item.RunTimeTicks && (
                <Text style={styles.metadataItem}>
                  {formatRuntime(item.RunTimeTicks)}
                </Text>
              )}
              {item.CommunityRating && (
                <Text style={styles.metadataItem}>
                  ⭐ {item.CommunityRating.toFixed(1)}
                </Text>
              )}
            </View>

            {item.Overview && (
              <Text style={styles.overview}>{item.Overview}</Text>
            )}

            {/* Progress */}
            {item.UserData?.PlaybackPositionTicks && item.RunTimeTicks && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${(item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {formatRuntime(
                    item.RunTimeTicks - item.UserData.PlaybackPositionTicks,
                  )}{' '}
                  remaining
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <FocusableButton
                title={
                  item.UserData?.PlaybackPositionTicks ? 'Resume' : 'Play'
                }
                onPress={handlePlay}
                size="large"
              />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backdrop: {
    width,
    height: height * 0.6,
    position: 'absolute',
    top: 0,
  },
  backdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    height: height * 0.6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  content: {
    marginTop: height * 0.3,
    padding: 48,
  },
  mainContent: {
    flexDirection: 'row',
  },
  poster: {
    width: 300,
    height: 450,
    borderRadius: 12,
    marginRight: 48,
  },
  info: {
    flex: 1,
    paddingTop: 24,
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  episodeTitle: {
    color: '#ccc',
    fontSize: 24,
    marginBottom: 16,
  },
  metadata: {
    flexDirection: 'row',
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  metadataItem: {
    color: '#888',
    fontSize: 18,
    marginRight: 24,
    marginBottom: 8,
  },
  overview: {
    color: '#ccc',
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e50914',
    borderRadius: 3,
  },
  progressText: {
    color: '#888',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
});
