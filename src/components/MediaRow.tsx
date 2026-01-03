import React from 'react';
import { FlatList, Text, StyleSheet, View, Platform } from 'react-native';
import { MediaCard } from './MediaCard';
import { useResponsiveColumns } from '../hooks';
import { JellyfinItem, TMDBMovie, TMDBTVShow } from '../types';

interface JellyfinMediaRowProps {
  title: string;
  items: JellyfinItem[];
  onItemPress: (item: JellyfinItem) => void;
  onItemRemove?: (item: JellyfinItem) => void;
  onItemMarkWatched?: (item: JellyfinItem) => void;
  getImageUrl?: (item: JellyfinItem) => string | null;
  tmdbItems?: never;
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
  const { spacing } = useResponsiveColumns();
  
  // Sidebar is 220px wide, use consistent padding for content
  const horizontalPadding = 48;

  if ('items' in props && props.items) {
    const { items, onItemPress, onItemRemove, onItemMarkWatched, getImageUrl } = props;

    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.container}>
        <Text style={[styles.title, { marginLeft: horizontalPadding }]}>{title}</Text>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.Id}
          renderItem={({ item }) => (
            <MediaCard
              item={item}
              imageUrl={getImageUrl?.(item)}
              onPress={() => onItemPress(item)}
              onRemove={onItemRemove ? () => onItemRemove(item) : undefined}
              onMarkWatched={onItemMarkWatched ? () => onItemMarkWatched(item) : undefined}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingLeft: horizontalPadding - 8, paddingRight: 40 }]}
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
      <View style={styles.container}>
        <Text style={[styles.title, { marginLeft: horizontalPadding }]}>{title}</Text>
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
          contentContainerStyle={[styles.listContent, { paddingLeft: horizontalPadding - 8, paddingRight: 40 }]}
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
    marginBottom: 32,
    marginTop: 8,
  },
  title: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 18,
    marginLeft: 48,
    letterSpacing: 0.4,
  },
  listContent: {
    paddingHorizontal: 40,
  },
});
