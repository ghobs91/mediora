import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scaleSize } from '../utils/scaling';

const STORAGE_KEY = '@mediora/sidebarWidth';

export const MIN_SIDEBAR_WIDTH = 150;
export const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = Platform.isTV ? scaleSize(240) : 200;

const clamp = (value: number) =>
  Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(value)));

/**
 * Width of the desktop/tablet sidebar, persisted across launches. The drag
 * handler updates state on every move (cheap) while storage writes are
 * debounced so a drag doesn't hammer AsyncStorage.
 */
export function useSidebarWidth() {
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(stored => {
        if (cancelled || !stored) return;
        const parsed = Number(stored);
        if (Number.isFinite(parsed)) {
          setSidebarWidthState(clamp(parsed));
        }
      })
      .catch(() => {
        // Fall back to the default width.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    },
    [],
  );

  const setSidebarWidth = useCallback((next: number) => {
    const clamped = clamp(next);
    setSidebarWidthState(clamped);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, String(clamped)).catch(() => {});
    }, 300);
  }, []);

  return { sidebarWidth, setSidebarWidth };
}
