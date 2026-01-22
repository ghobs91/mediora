import React from 'react';
import { FlatList, Text, StyleSheet, View, Platform, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { MediaCard } from './MediaCard';
import { useResponsiveColumns } from '../hooks';
import { JellyfinItem, TMDBMovie, TMDBTVShow } from '../types';
import { scaleSize, scaleFontSize } from '../utils/scaling';

const MOBILE_BREAKPOINT = 768;

interface JellyfinMediaRowProps {
  title: string;
  items: JellyfinItem[];
  onItemPress: (item: JellyfinItem) => void;
  onItemRemove?: (item: JellyfinItem) => void;
  onItemMarkWatched?: (item: JellyfinItem) => void;
  onItemToggleFavorite?: (item: JellyfinItem, isFavorite: boolean) => void;
  getImageUrl?: (item: JellyfinItem) => string | null;
  tmdbItems?: never;
  landscape?: boolean;
  useSeriesThumbnail?: boolean;
}

interface TMDBMediaRowProps {
  title: string;
  tmdbItems: (TMDBMovie | TMDBTVShow)[];
  onItemPress: (item: TMDBMovie | TMDBTVShow) => void;
  items?: never;
  getImageUrl?: never;
}

type MediaRowProps = JellyfinMediaRowProps | TMDBMediaRowProps;

export function MediaRow(props: MediaRowProps) {
  const { title } = props;
  const { spacing, isMobile } = useResponsiveColumns();

  // Responsive horizontal padding
  const horizontalPadding = isMobile ? 16 : scaleSize(52);

  // Separator component for spacing between items
  const ItemSeparator = () => <View style={{ width: spacing }} />;

  if ('items' in props && props.items) {
    const { items, onItemPress, onItemRemove, onItemMarkWatched, onItemToggleFavorite, getImageUrl, landscape, useSeriesThumbnail } = props;

    if (items.length === 0) {
      return null;
    }

    // Helper function to get the appropriate image URL
    const getCardImageUrl = (item: JellyfinItem): string | null => {
      if (!getImageUrl) return null;
      
      // If useSeriesThumbnail is true and item is an episode with a SeriesId, use series image
      if (useSeriesThumbnail && item.Type === 'Episode' && item.SeriesId) {
        return getImageUrl({ ...item, Id: item.SeriesId, Type: 'Series' });
      }
      
      return getImageUrl(item);
    };

    return (
      <View style={[styles.container, isMobile && styles.containerMobile]}>
        <View style={[styles.titleContainer, { marginLeft: horizontalPadding }]}>
          <Text style={[styles.title, isMobile && styles.titleMobile]}>{title}</Text>
          <Icon name="chevron-forward" size={isMobile ? 16 : scaleSize(24)} color="rgba(255, 255, 255, 0.5)" style={styles.chevron} />
        </View>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.Id}
          renderItem={({ item }) => (
            <MediaCard
              item={item}
              imageUrl={getCardImageUrl(item)}
              onPress={() => onItemPress(item)}
              onRemove={onItemRemove ? () => onItemRemove(item) : undefined}
              onMarkWatched={onItemMarkWatched ? () => onItemMarkWatched(item) : undefined}
              onToggleFavorite={onItemToggleFavorite ? (isFavorite) => onItemToggleFavorite(item, isFavorite) : undefined}
              landscape={landscape}
            />
          )}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingLeft: horizontalPadding, // Removed compensation for card margin
              paddingRight: horizontalPadding
            }
          ]}
          removeClippedSubviews={true}
          tvParallaxProperties={undefined}
        />
      </View>
    );
  }

  if ('tmdbItems' in props && props.tmdbItems) {
    const { tmdbItems, onItemPress } = props;

    if (tmdbItems.length === 0) {
      return null;
    }

    return (
      <View style={[styles.container, isMobile && styles.containerMobile]}>
        <View style={[styles.titleContainer, { marginLeft: horizontalPadding }]}>
          <Text style={[styles.title, isMobile && styles.titleMobile]}>{title}</Text>
          <Icon name="chevron-forward" size={isMobile ? 16 : scaleSize(24)} color="rgba(255, 255, 255, 0.5)" style={styles.chevron} />
        </View>
        <FlatList
          horizontal
          data={tmdbItems}
          keyExtractor={(item, index) => `tmdb-${item.id}-${index}`}
          renderItem={({ item }) => (
            <MediaCard
              tmdbItem={item}
              onPress={() => onItemPress(item)}
            />
          )}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingLeft: horizontalPadding, // Removed compensation for card margin
              paddingRight: horizontalPadding
            }
          ]}
          removeClippedSubviews={true}
          tvParallaxProperties={undefined}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: scaleSize(36),
    marginTop: scaleSize(10),
  },
  containerMobile: {
    marginBottom: 24,
    marginTop: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scaleSize(16),
  },
  title: {
    color: '#ffffff',
    fontSize: scaleFontSize(28),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  titleMobile: {
    fontSize: 20,
  },
  chevron: {
    marginLeft: scaleSize(8),
    opacity: 0.6,
  },
  listContent: {
    paddingHorizontal: scaleSize(44),
  },
});
