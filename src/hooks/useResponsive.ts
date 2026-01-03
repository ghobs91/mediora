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
  const sidebarWidth = 220; // Account for sidebar width

  const config = useMemo(() => {
    const safeWidth = Math.max(width, 320);
    // Subtract sidebar width and horizontal padding to get actual available width
    const availableWidth = Math.max(safeWidth - sidebarWidth - (48 * 2), 200);

    let numCols = 2;
    if (Platform.isTV) {
      numCols = 5;
      if (safeWidth > 2000) numCols = 7;
      if (safeWidth < 1200) numCols = 4;
    } else {
      // Adjust column calculation based on available width (not full window width)
      const contentWidth = safeWidth - sidebarWidth;
      if (contentWidth > 2000) numCols = 10;
      else if (contentWidth > 1600) numCols = 8;
      else if (contentWidth > 1200) numCols = 6;
      else if (contentWidth > 900) numCols = 5;
      else if (contentWidth > 700) numCols = 4;
      else if (contentWidth > 500) numCols = 3;
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
