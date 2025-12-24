import React, { useRef, useState } from 'react';
import {
  TouchableOpacity,
  Image,
  Text,
  StyleSheet,
  View,
  Animated,
} from 'react-native';
import { JellyfinItem, TMDBMovie, TMDBTVShow } from '../types';
import { TMDBService } from '../services';

interface MediaCardProps {
  item?: JellyfinItem;
  tmdbItem?: TMDBMovie | TMDBTVShow;
  imageUrl?: string | null;
  title?: string;
  subtitle?: string;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function MediaCard({
  item,
  tmdbItem,
  imageUrl,
  title,
  subtitle,
  onPress,
  size = 'medium',
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

  const dimensions = {
    small: { width: 120, height: 180 },
    medium: { width: 160, height: 240 },
    large: { width: 200, height: 300 },
  };

  const { width, height } = dimensions[size];

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
    margin: 8,
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
});
