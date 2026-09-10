import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { useServices, useSettings } from '../context';
import { MedioraServerService } from '../services';
import { TMDBService } from '../services';
import { TMDBMovie, TMDBTVShow } from '../types';
import { scaleSize, scaleFontSize } from '../utils/scaling';
import { useDeviceType } from '../hooks/useResponsive';

export type FeaturedMediaType = 'movie' | 'tv';

interface FeaturedItem {
  kind: FeaturedMediaType;
  tmdbId: number;
  title: string;
  overview: string;
  year: string | null;
  rating: number;
  backdropUrl: string | null;
  posterUrl: string | null;
  genres: string[];
  tmdbItem: TMDBMovie | TMDBTVShow;
}

interface FeaturedCarouselProps {
  onItemPress: (item: TMDBMovie | TMDBTVShow, mediaType: FeaturedMediaType) => void;
  /** Number of featured items to show. Defaults to 8. */
  maxItems?: number;
  /** Seconds between automatic slides. Defaults to 7. */
  cycleSeconds?: number;
}

const AUTOPLAY_DEFAULT_SECONDS = 7;

function yearFromDate(date?: string | null): string | null {
  if (!date || date.length < 4) return null;
  return date.substring(0, 4);
}

/**
 * Apple TV-inspired hero carousel shown above "Continue Watching".
 *
 * Cycles through still thumbnails (no autoplay video) of the recommended
 * movies/shows from mediora-server's /suggestions page. Renders nothing when
 * the mediora-server backend isn't configured or has no recommendations.
 */
export function FeaturedCarousel({
  onItemPress,
  maxItems = 8,
  cycleSeconds = AUTOPLAY_DEFAULT_SECONDS,
}: FeaturedCarouselProps) {
  const { settings } = useSettings();
  const { tmdb } = useServices();
  const { isMobile } = useDeviceType();
  const [items, setItems] = useState<FeaturedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const serverConfig =
    settings.backendMode === 'mediarr-server' ? settings.mediarrServer : null;

  const loadRecommendations = useCallback(async () => {
    if (!serverConfig?.serverUrl || !serverConfig?.apiKey) return;
    if (!tmdb) return;

    setIsLoading(true);
    try {
      const service = new MedioraServerService(
        serverConfig.serverUrl,
        serverConfig.apiKey,
      );
      const { movies, tvShows } = await service.getRecommended();

      // Interleave movies and shows so the carousel mixes both, like the
      // /suggestions page which lists recommended movies + recommended shows.
      const interleaved: { kind: FeaturedMediaType; rec: (typeof movies)[number] }[] = [];
      const maxLen = Math.max(movies.length, tvShows.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movies.length) interleaved.push({ kind: 'movie', rec: movies[i] });
        if (i < tvShows.length) interleaved.push({ kind: 'tv', rec: tvShows[i] });
      }
      const top = interleaved.slice(0, maxItems);
      if (top.length === 0) {
        setItems([]);
        return;
      }

      // Enrich with backdrop + genres from TMDB (still images only).
      const enriched = await Promise.all(
        top.map(async ({ kind, rec }): Promise<FeaturedItem | null> => {
          try {
            if (kind === 'movie') {
              const details = await tmdb.getMovieDetails(rec.tmdbId);
              const tmdbItem = {
                id: rec.tmdbId,
                title: rec.title,
                overview: rec.overview || details.overview,
                poster_path: rec.posterPath || details.poster_path,
                backdrop_path: details.backdrop_path,
                release_date:
                  rec.releaseDate || details.release_date,
                vote_average: rec.voteAverage || details.vote_average,
              } as unknown as TMDBMovie;
              return {
                kind,
                tmdbId: rec.tmdbId,
                title: rec.title,
                overview: rec.overview,
                year: yearFromDate(rec.releaseDate || details.release_date),
                rating: rec.voteAverage || details.vote_average || 0,
                backdropUrl: TMDBService.getBackdropUrl(
                  details.backdrop_path,
                  'w1280',
                ),
                posterUrl: TMDBService.getPosterUrl(
                  rec.posterPath || details.poster_path,
                  'w500',
                ),
                genres: (details.genres || []).slice(0, 2).map(g => g.name),
                tmdbItem,
              };
            }
            const details = await tmdb.getTVDetails(rec.tmdbId);
            const tmdbItem = {
              id: rec.tmdbId,
              name: rec.title,
              overview: rec.overview || details.overview,
              poster_path: rec.posterPath || details.poster_path,
              backdrop_path: details.backdrop_path,
              first_air_date:
                rec.releaseDate || details.first_air_date,
              vote_average: rec.voteAverage || details.vote_average,
            } as unknown as TMDBTVShow;
            return {
              kind,
              tmdbId: rec.tmdbId,
              title: rec.title,
              overview: rec.overview,
              year: yearFromDate(rec.releaseDate || details.first_air_date),
              rating: rec.voteAverage || details.vote_average || 0,
              backdropUrl: TMDBService.getBackdropUrl(
                details.backdrop_path,
                'w1280',
              ),
              posterUrl: TMDBService.getPosterUrl(
                rec.posterPath || details.poster_path,
                'w500',
              ),
              genres: (details.genres || []).slice(0, 2).map(g => g.name),
              tmdbItem,
            };
          } catch {
            return null;
          }
        }),
      );

      const valid = enriched.filter((i): i is FeaturedItem => i !== null);
      setItems(valid);
      setActiveIndex(0);
    } catch {
      // Fail silently - the carousel is decorative; HomeScreen works without it.
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [serverConfig?.serverUrl, serverConfig?.apiKey, tmdb, maxItems]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const goTo = useCallback(
    (index: number) => {
      if (items.length === 0) return;
      setActiveIndex(((index % items.length) + items.length) % items.length);
    },
    [items.length],
  );

  // Auto-cycle stills (no video autoplay, mirroring Apple TV's rotation).
  useEffect(() => {
    if (items.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % items.length);
    }, cycleSeconds * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length, cycleSeconds]);

  const activeItem = useMemo(
    () => (items.length > 0 ? items[activeIndex % items.length] : null),
    [items, activeIndex],
  );

  if (!serverConfig?.serverUrl || !serverConfig?.apiKey) return null;
  if (isLoading && items.length === 0) {
    return (
      <View style={[styles.loader, isMobile && styles.loaderMobile]}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
      </View>
    );
  }
  if (!activeItem) return null;

  const metadataParts = [
    activeItem.kind === 'movie' ? 'Movie' : 'TV Show',
    ...activeItem.genres,
    activeItem.year,
  ].filter(Boolean);

  return (
    <View style={[styles.container, isMobile && styles.containerMobile]}>
      {/* Backdrop still */}
      {activeItem.backdropUrl ? (
        <Image
          key={activeItem.tmdbId}
          source={{ uri: activeItem.backdropUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.fallback]} />
      )}
      {/* Legibility gradients */}
      <LinearGradient
        colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Prev / next arrows */}
      {items.length > 1 && (
        <>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowLeft]}
            onPress={() => goTo(activeIndex - 1)}
            activeOpacity={0.7}
            accessibilityLabel="Previous recommendation">
            <Icon
              name="chevron-back"
              size={isMobile ? 22 : scaleSize(32)}
              color="rgba(255,255,255,0.6)"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowRight]}
            onPress={() => goTo(activeIndex + 1)}
            activeOpacity={0.7}
            accessibilityLabel="Next recommendation">
            <Icon
              name="chevron-forward"
              size={isMobile ? 22 : scaleSize(32)}
              color="rgba(255,255,255,0.6)"
            />
          </TouchableOpacity>
        </>
      )}

      {/* Info */}
      <View style={[styles.info, isMobile && styles.infoMobile]}>
        <View style={styles.badgeRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {activeItem.kind === 'movie' ? 'Movie' : 'TV Show'}
            </Text>
          </View>
          <Text style={styles.recommendedLabel}>Recommended for you</Text>
        </View>
        <Text
          style={[styles.title, isMobile && styles.titleMobile]}
          numberOfLines={2}>
          {activeItem.title}
        </Text>
        <Text
          style={[styles.metadata, isMobile && styles.metadataMobile]}
          numberOfLines={1}>
          {metadataParts.join(' · ')}
          {activeItem.rating > 0 && `   ★ ${activeItem.rating.toFixed(1)}`}
        </Text>
        {!!activeItem.overview && (
          <Text
            style={[styles.overview, isMobile && styles.overviewMobile]}
            numberOfLines={isMobile ? 2 : 3}>
            {activeItem.overview}
          </Text>
        )}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, isMobile && styles.primaryButtonMobile]}
            onPress={() => onItemPress(activeItem.tmdbItem, activeItem.kind)}
            activeOpacity={0.85}>
            <Icon
              name="play"
              size={isMobile ? 16 : scaleSize(20)}
              color="#000"
              style={styles.playIcon}
            />
            <Text
              style={[
                styles.primaryButtonText,
                isMobile && styles.primaryButtonTextMobile,
              ]}>
              More Info
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleButton, isMobile && styles.circleButtonMobile]}
            onPress={() => onItemPress(activeItem.tmdbItem, activeItem.kind)}
            activeOpacity={0.7}
            accessibilityLabel="View details">
            <Icon
              name="add"
              size={isMobile ? 20 : scaleSize(24)}
              color="#fff"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dots */}
      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={`${item.kind}-${item.tmdbId}`}
              onPress={() => goTo(index)}
              activeOpacity={0.7}
              style={[
                styles.dot,
                index === activeIndex % items.length && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: scaleSize(520),
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: scaleSize(12),
  },
  containerMobile: {
    height: 380,
    marginBottom: 8,
  },
  fallback: {
    backgroundColor: '#111',
  },
  loader: {
    height: scaleSize(200),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderMobile: {
    height: 140,
  },
  arrow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: scaleSize(16),
    zIndex: 3,
  },
  arrowLeft: {
    left: 0,
  },
  arrowRight: {
    right: 0,
  },
  info: {
    position: 'absolute',
    left: scaleSize(64),
    right: scaleSize(64),
    bottom: scaleSize(64),
    maxWidth: scaleSize(640),
    zIndex: 2,
  },
  infoMobile: {
    left: 20,
    right: 20,
    bottom: 44,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scaleSize(12),
    gap: scaleSize(10),
  },
  typeBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: scaleSize(6),
    paddingHorizontal: scaleSize(8),
    paddingVertical: scaleSize(3),
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: scaleFontSize(13),
    fontWeight: '600',
  },
  recommendedLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: scaleFontSize(14),
    fontWeight: '500',
  },
  title: {
    color: '#fff',
    fontSize: scaleFontSize(56),
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: scaleSize(10),
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  titleMobile: {
    fontSize: 28,
    letterSpacing: 0.8,
  },
  metadata: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: scaleFontSize(17),
    fontWeight: '500',
    marginBottom: scaleSize(10),
  },
  metadataMobile: {
    fontSize: 13,
  },
  overview: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: scaleFontSize(17),
    lineHeight: scaleFontSize(25),
    marginBottom: scaleSize(20),
  },
  overviewMobile: {
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSize(12),
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: scaleSize(24),
    paddingHorizontal: scaleSize(32),
    paddingVertical: scaleSize(12),
  },
  primaryButtonMobile: {
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  playIcon: {
    marginRight: scaleSize(8),
  },
  primaryButtonText: {
    color: '#000',
    fontSize: scaleFontSize(18),
    fontWeight: '700',
  },
  primaryButtonTextMobile: {
    fontSize: 15,
  },
  circleButton: {
    width: scaleSize(48),
    height: scaleSize(48),
    borderRadius: scaleSize(24),
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleButtonMobile: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  dots: {
    position: 'absolute',
    bottom: scaleSize(20),
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: scaleSize(8),
    zIndex: 2,
  },
  dot: {
    width: scaleSize(8),
    height: scaleSize(8),
    borderRadius: scaleSize(4),
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: scaleSize(10),
    height: scaleSize(10),
    borderRadius: scaleSize(5),
  },
});

export default FeaturedCarousel;
