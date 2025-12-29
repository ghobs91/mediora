import { useState, useEffect, useMemo } from 'react';
import { Dimensions, Platform } from 'react-native';

interface ResponsiveConfig {
  numColumns: number;
  itemWidth: number;
  spacing: number;
  windowWidth: number;
}

export function useResponsiveColumns(): ResponsiveConfig {
  const [width, setWidth] = useState(() => Dimensions.get('window').width);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (window.width > 0) {
        setWidth(window.width);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const spacing = Platform.isTV ? 48 : 16;
  const horizontalPadding = spacing * 2;

  const config = useMemo(() => {
    const safeWidth = Math.max(width, 320);
    const availableWidth = Math.max(safeWidth - horizontalPadding, 200);

    let numCols = 2;
    if (Platform.isTV) {
      numCols = 5;
      if (safeWidth > 2000) numCols = 7;
      if (safeWidth < 1200) numCols = 4;
    } else {
      if (safeWidth > 2000) numCols = 10;
      else if (safeWidth > 1600) numCols = 8;
      else if (safeWidth > 1200) numCols = 6;
      else if (safeWidth > 900) numCols = 4;
      else if (safeWidth > 600) numCols = 3;
      else numCols = 2;
    }

    const itemW = (availableWidth - (numCols - 1) * 12) / numCols;

    return {
      numColumns: numCols,
      itemWidth: itemW,
      spacing,
      windowWidth: safeWidth,
    };
  }, [width, spacing, horizontalPadding]);

  return config;
}
