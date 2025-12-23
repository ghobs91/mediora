import React from 'react';
import { FlatList, Text, StyleSheet, View } from 'react-native';
import { MediaCard } from './MediaCard';
import { JellyfinItem, TMDBMovie, TMDBTVShow } from '../types';

interface JellyfinMediaRowProps {
  title: string;
  items: JellyfinItem[];
  onItemPress: (item: JellyfinItem) => void;
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

  if ('items' in props && props.items) {
    const { items, onItemPress, getImageUrl } = props;
    
    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.Id}
          renderItem={({ item }) => (
            <MediaCard
              item={item}
              imageUrl={getImageUrl?.(item)}
              onPress={() => onItemPress(item)}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
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
        <Text style={styles.title}>{title}</Text>
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
          contentContainerStyle={styles.listContent}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    marginLeft: 48,
  },
  listContent: {
    paddingHorizontal: 40,
  },
});
