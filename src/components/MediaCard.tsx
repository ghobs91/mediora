import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  Image,
  Text,
  StyleSheet,
  View,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { JellyfinItem, TMDBMovie, TMDBTVShow } from '../types';
import { TMDBService } from '../services';

interface MediaCardProps {
  item?: JellyfinItem;
  tmdbItem?: TMDBMovie | TMDBTVShow;
  imageUrl?: string | null;
  title?: string;
  subtitle?: string;
  onPress: () => void;
  onRemove?: () => void;
  onMarkWatched?: () => void;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  width?: number;
  height?: number;
  downloadProgress?: number; // 0-1 for active downloads
  isDownloading?: boolean;
}


export function MediaCard({
  item,
  tmdbItem,
  imageUrl,
  title,
  subtitle,
  onPress,
  onRemove,
  onMarkWatched,
  size = 'medium',
  width: customWidth,
  height: customHeight,
  downloadProgress,
  isDownloading,
}: MediaCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.spring(scaleValue, {
      toValue: 1.12,
      useNativeDriver: true,
      friction: 7,
      tension: 100,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 100,
    }).start();
  };

  const handleContextMenu = () => {
    if (!onMarkWatched && !onRemove) return;

    const options = [];
    if (onMarkWatched) options.push('Mark as Watched');
    if (onRemove) options.push('Remove from Continue Watching');
    options.push('Cancel');

    Alert.alert(
      'Options',
      'Choose an action',
      [
        ...(onMarkWatched ? [{
          text: 'Mark as Watched',
          onPress: onMarkWatched,
        }] : []),
        ...(onRemove ? [{
          text: 'Remove from Continue Watching',
          onPress: onRemove,
          style: 'destructive' as const,
        }] : []),
        {
          text: 'Cancel',
          style: 'cancel' as const,
        },
      ],
      { cancelable: true }
    );
  };

  const dimensions = {
    small: { width: Platform.isTV ? 120 : 100, height: Platform.isTV ? 180 : 150 },
    medium: { width: Platform.isTV ? 160 : 140, height: Platform.isTV ? 240 : 210 },
    large: { width: Platform.isTV ? 200 : 180, height: Platform.isTV ? 300 : 270 },
    xlarge: { width: Platform.isTV ? 320 : 280, height: Platform.isTV ? 480 : 420 },
  };

  const width = customWidth || dimensions[size].width;
  const height = customHeight || (customWidth ? customWidth * 1.5 : dimensions[size].height);

  let displayTitle = title;
  let displaySubtitle = subtitle;
  let displayImageUrl = imageUrl;

  if (item) {
    displayTitle = item.SeriesName || item.Name;
    displaySubtitle = item.SeriesName
      ? item.SeasonName + ' - E' + item.IndexNumber
      : item.ProductionYear?.toString();
  } else if (tmdbItem) {
    displayTitle =
      'title' in tmdbItem ? tmdbItem.title : tmdbItem.name;
    displaySubtitle =
      'release_date' in tmdbItem
        ? tmdbItem.release_date?.substring(0, 4)
        : tmdbItem.first_air_date?.substring(0, 4);
    displayImageUrl = TMDBService.getPosterUrl(tmdbItem.poster_path, 'w342');
  }

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      onLongPress={(onMarkWatched || onRemove) ? handleContextMenu : undefined}
      delayLongPress={500}
      style={styles.container}>
      <Animated.View
        style={[
          styles.cardContainer,
          { width, height },
          { transform: [{ scale: scaleValue }] },
          isFocused && styles.focused,
        ]}>
        {displayImageUrl ? (
          <Image
            source={{ uri: displayImageUrl }}
            style={[styles.image, { width, height }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholder, { width, height }]}>
            <Text style={styles.placeholderText}>
              {displayTitle?.charAt(0) || '?'}
            </Text>
          </View>
        )}
        {item?.UserData?.PlaybackPositionTicks != null &&
          item?.RunTimeTicks != null &&
          item.RunTimeTicks > 0 ? (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  flex: item.UserData.PlaybackPositionTicks / item.RunTimeTicks,
                },
              ]}
            />
            <View style={{ flex: 1 - (item.UserData.PlaybackPositionTicks / item.RunTimeTicks) }} />
          </View>
        ) : null}
        {isDownloading && downloadProgress != null && (
          <View style={styles.downloadProgressContainer}>
            <View style={styles.downloadProgressBackground}>
              <View
                style={[
                  styles.downloadProgressBar,
                  {
                    width: `${Math.round(downloadProgress * 100)}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.downloadBadge}>
              <Icon name="arrow-down-circle" size={12} color="#fff" />
              <Text style={styles.downloadText}>
                {Math.round(downloadProgress * 100)}%
              </Text>
            </View>
          </View>
        )}
        {onRemove && isFocused && (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={(e) => {
              // Prevent selecting the card when removing
              if (Platform.OS === 'ios' || Platform.OS === 'android') {
                // In RN mobile, we might need stopPropagation if it was a nested button
                // But here card itself is TouchableOpacity.
              }
              onRemove();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.removeButtonInner}>
              <Icon name="close" size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
      </Animated.View>
      <View style={[styles.textContainer, { width }]}>
        <Text style={styles.title} numberOfLines={1}>
          {displayTitle}
        </Text>
        {displaySubtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {displaySubtitle}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    marginHorizontal: 4,
  },
  cardContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(42, 42, 42, 0.6)',
  },
  focused: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    elevation: 16,
  },
  image: {
    borderRadius: 16,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(58, 58, 58, 0.4)',
  },
  placeholderText: {
    fontSize: 48,
    color: 'rgba(102, 102, 102, 0.6)',
    fontWeight: 'bold',
  },
  textContainer: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    flexDirection: 'row',
  },
  progressBar: {
    height: 5,
    backgroundColor: 'rgba(10, 132, 255, 0.9)',
    borderRadius: 5,
  },
  downloadProgressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  downloadProgressBackground: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  downloadProgressBar: {
    height: 6,
    backgroundColor: '#4caf50',
    borderRadius: 3,
  },
  downloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  downloadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  removeButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
});
