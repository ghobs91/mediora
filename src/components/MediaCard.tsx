import React, { useState } from 'react';
import {
  TouchableOpacity,
  Image,
  Text,
  StyleSheet,
  View,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { JellyfinItem, TMDBMovie, TMDBTVShow } from '../types';
import { TMDBService } from '../services';
import { scaleSize, scaleFontSize } from '../utils/scaling';

interface MediaCardProps {
  item?: JellyfinItem;
  tmdbItem?: TMDBMovie | TMDBTVShow;
  imageUrl?: string | null;
  title?: string;
  subtitle?: string;
  onPress: () => void;
  onRemove?: () => void;
  onMarkWatched?: () => void;
  onToggleFavorite?: (isFavorite: boolean) => void;
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
  onToggleFavorite,
  size = 'medium',
  width: customWidth,
  height: customHeight,
  downloadProgress,
  isDownloading,
}: MediaCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleContextMenu = () => {
    if (!onMarkWatched && !onRemove && !onToggleFavorite) return;

    const options = [];
    if (item?.UserData?.IsFavorite !== undefined && onToggleFavorite) {
      options.push(item.UserData.IsFavorite ? 'Remove from Favorites' : 'Add to Favorites');
    }
    if (onMarkWatched) options.push('Mark as Watched');
    if (onRemove) options.push('Remove from Continue Watching');
    options.push('Cancel');

    const buttons = [
      ...(item?.UserData?.IsFavorite !== undefined && onToggleFavorite ? [{
        text: item.UserData.IsFavorite ? 'Remove from Favorites' : 'Add to Favorites',
        onPress: () => onToggleFavorite(!item.UserData.IsFavorite),
      }] : []),
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
    ];

    Alert.alert(
      'Options',
      'Choose an action',
      buttons,
      { cancelable: true }
    );
  };

  const handleToggleFavorite = () => {
    if (item && onToggleFavorite) {
      onToggleFavorite(!item.UserData?.IsFavorite);
    }
  };

  const dimensions = {
    small: { width: scaleSize(Platform.isTV ? 140 : 100), height: scaleSize(Platform.isTV ? 210 : 150) },
    medium: { width: scaleSize(Platform.isTV ? 180 : 140), height: scaleSize(Platform.isTV ? 270 : 210) },
    large: { width: scaleSize(Platform.isTV ? 220 : 180), height: scaleSize(Platform.isTV ? 330 : 270) },
    xlarge: { width: scaleSize(Platform.isTV ? 360 : 280), height: scaleSize(Platform.isTV ? 540 : 420) },
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
      onLongPress={(onMarkWatched || onRemove || onToggleFavorite) ? handleContextMenu : undefined}
      delayLongPress={500}
      style={styles.container}>
      <View
        style={[
          styles.cardContainer,
          { width, height },
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
              <Icon name="arrow-down-circle" size={scaleSize(14)} color="#fff" />
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
              <Icon name="close" size={scaleSize(22)} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
        {isFocused && (onToggleFavorite || (onMarkWatched && onRemove)) && (
          <View style={styles.actionButtons}>
            {onToggleFavorite && item && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleToggleFavorite}
                activeOpacity={0.7}
              >
                <View style={[styles.actionButtonInner, item.UserData?.IsFavorite && styles.actionButtonFavorite]}>
                  <Icon 
                    name={item.UserData?.IsFavorite ? "heart" : "heart-outline"} 
                    size={scaleSize(20)} 
                    color={item.UserData?.IsFavorite ? "#e50914" : "#fff"} 
                  />
                </View>
              </TouchableOpacity>
            )}
            {(onMarkWatched || onRemove) && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleContextMenu}
                activeOpacity={0.7}
              >
                <View style={styles.actionButtonInner}>
                  <Icon name="ellipsis-horizontal" size={scaleSize(20)} color="#fff" />
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
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
    marginVertical: scaleSize(14),
    marginHorizontal: scaleSize(6),
  },
  cardContainer: {
    borderRadius: scaleSize(18),
    overflow: 'hidden',
    backgroundColor: 'rgba(42, 42, 42, 0.6)',
  },
  focused: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: scaleSize(20) },
    shadowOpacity: 1.0,
    shadowRadius: scaleSize(40),
    borderWidth: scaleSize(6),
    borderColor: '#ffffff',
    elevation: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  image: {
    borderRadius: scaleSize(18),
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(58, 58, 58, 0.4)',
  },
  placeholderText: {
    fontSize: scaleFontSize(56),
    color: 'rgba(102, 102, 102, 0.6)',
    fontWeight: 'bold',
  },
  textContainer: {
    marginTop: scaleSize(14),
    paddingHorizontal: scaleSize(6),
  },
  title: {
    color: '#fff',
    fontSize: scaleFontSize(17),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: scaleFontSize(15),
    marginTop: scaleSize(5),
    fontWeight: '500',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: scaleSize(6),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
  },
  progressBar: {
    height: scaleSize(6),
    backgroundColor: 'rgba(10, 132, 255, 0.95)',
    borderRadius: scaleSize(6),
  },
  downloadProgressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: scaleSize(10),
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  downloadProgressBackground: {
    height: scaleSize(7),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: scaleSize(4),
    overflow: 'hidden',
  },
  downloadProgressBar: {
    height: scaleSize(7),
    backgroundColor: '#4caf50',
    borderRadius: scaleSize(4),
  },
  downloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: scaleSize(5),
    gap: scaleSize(5),
  },
  downloadText: {
    color: '#fff',
    fontSize: scaleFontSize(12),
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: scaleSize(10),
    right: scaleSize(10),
    zIndex: 10,
  },
  removeButtonInner: {
    width: scaleSize(32),
    height: scaleSize(32),
    borderRadius: scaleSize(16),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  actionButtons: {
    position: 'absolute',
    bottom: scaleSize(10),
    right: scaleSize(10),
    flexDirection: 'row',
    gap: scaleSize(8),
    zIndex: 10,
  },
  actionButton: {
    // Wrapper for focus handling
  },
  actionButtonInner: {
    width: scaleSize(36),
    height: scaleSize(36),
    borderRadius: scaleSize(18),
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  actionButtonFavorite: {
    borderColor: '#e50914',
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
});
