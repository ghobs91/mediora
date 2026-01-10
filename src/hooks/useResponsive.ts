import { useState, useEffect, useMemo } from 'react';
import { Dimensions, Platform } from 'react-native';

interface ResponsiveConfig {
  numColumns: number;
  itemWidth: number;
  spacing: number;
  windowWidth: number;
  windowHeight: number;
  isMobile: boolean;
  isTablet: boolean;
  isTV: boolean;
  showSidebar: boolean;
  sidebarWidth: number;
  contentPadding: number;
}

// Breakpoints
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useResponsiveColumns(): ResponsiveConfig {
  const [dimensions, setDimensions] = useState(() => ({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  }));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (window.width > 0) {
        setDimensions({ width: window.width, height: window.height });
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const config = useMemo(() => {
    const { width, height } = dimensions;
    const safeWidth = Math.max(width, 320);
    const safeHeight = Math.max(height, 480);

    // Determine device type
    const isTV = Platform.isTV;
    const isMobile = !isTV && safeWidth < MOBILE_BREAKPOINT;
    const isTablet = !isTV && !isMobile && safeWidth < TABLET_BREAKPOINT;

    // Sidebar configuration - hide on mobile, show on tablet/desktop/TV
    const showSidebar = !isMobile;
    const sidebarWidth = isTV ? 240 : (isTablet ? 200 : (showSidebar ? 220 : 0));

    // Spacing based on device
    const spacing = isTV ? 48 : (isMobile ? 12 : 16);
    const contentPadding = isTV ? 48 : (isMobile ? 16 : 24);

    // Calculate available width for content
    const availableWidth = Math.max(safeWidth - sidebarWidth - (contentPadding * 2), 200);

    // Column calculation
    let numCols = 2;
    if (isTV) {
      numCols = 5;
      if (safeWidth > 2000) numCols = 7;
      if (safeWidth < 1200) numCols = 4;
    } else if (isMobile) {
      // Mobile: 2-3 columns based on width
      numCols = safeWidth > 500 ? 3 : 2;
    } else if (isTablet) {
      // Tablet: 3-4 columns
      numCols = safeWidth > 900 ? 4 : 3;
    } else {
      // Desktop/large screens
      if (availableWidth > 2000) numCols = 10;
      else if (availableWidth > 1600) numCols = 8;
      else if (availableWidth > 1200) numCols = 6;
      else if (availableWidth > 900) numCols = 5;
      else if (availableWidth > 700) numCols = 4;
      else if (availableWidth > 500) numCols = 3;
      else numCols = 2;
    }

    const gap = isMobile ? 8 : 12;
    const itemW = (availableWidth - (numCols - 1) * gap) / numCols;

    return {
      numColumns: numCols,
      itemWidth: itemW,
      spacing,
      windowWidth: safeWidth,
      windowHeight: safeHeight,
      isMobile,
      isTablet,
      isTV,
      showSidebar,
      sidebarWidth,
      contentPadding,
    };
  }, [dimensions]);

  return config;
}

/**
 * Hook to get just the device type info without grid calculations
 */
export function useDeviceType() {
  const [dimensions, setDimensions] = useState(() => ({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  }));

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      if (window.width > 0) {
        setDimensions({ width: window.width, height: window.height });
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return useMemo(() => {
    const { width, height } = dimensions;
    const isTV = Platform.isTV;
    const isMobile = !isTV && width < MOBILE_BREAKPOINT;
    const isTablet = !isTV && !isMobile && width < TABLET_BREAKPOINT;
    const isDesktop = !isTV && !isMobile && !isTablet;

    return {
      width,
      height,
      isMobile,
      isTablet,
      isDesktop,
      isTV,
      showSidebar: !isMobile,
    };
  }, [dimensions]);
}
