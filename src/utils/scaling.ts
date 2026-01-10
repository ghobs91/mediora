import { Dimensions, Platform } from 'react-native';

// Get the device screen dimensions
const { width, height } = Dimensions.get('window');

// Base dimensions - typical TV size (1920x1080)
const baseWidth = 1920;
const baseHeight = 1080;

// Mobile base dimensions (iPhone 14/15 Pro)
const mobileBaseWidth = 393;

// Calculate scale factors
const scaleWidth = width / baseWidth;
const scaleHeight = height / baseHeight;

// Use the smaller scale factor to ensure everything fits
const scale = Math.min(scaleWidth, scaleHeight);

// Mobile breakpoint
const MOBILE_BREAKPOINT = 768;

/**
 * Check if current device is mobile-sized
 */
export const isMobileDevice = (): boolean => {
  const { width: currentWidth } = Dimensions.get('window');
  return !Platform.isTV && currentWidth < MOBILE_BREAKPOINT;
};

/**
 * Scale a value based on screen size
 * For TV, scales relative to a 1920x1080 base
 * For mobile, returns the original value (or slightly adjusted)
 */
export const scaleSize = (size: number): number => {
  if (Platform.isTV) {
    // Apply scaling for TV, but don't go below 1.0
    return Math.round(size * Math.max(scale, 1.0));
  }
  // For mobile/non-TV, return size as-is (mobile designs should use responsive values)
  return size;
};

/**
 * Scale a value for mobile screens
 * Uses a ratio based on screen width to adjust sizes proportionally
 */
export const scaleMobile = (size: number): number => {
  const { width: currentWidth } = Dimensions.get('window');
  if (Platform.isTV) {
    return scaleSize(size);
  }
  // Scale relative to base mobile width
  const mobileScale = currentWidth / mobileBaseWidth;
  return Math.round(size * Math.min(mobileScale, 1.2)); // Cap at 1.2x to prevent oversizing
};

/**
 * Scale font size for better readability on TV
 */
export const scaleFontSize = (size: number): number => {
  if (Platform.isTV) {
    // Apply slightly more aggressive scaling for fonts
    return Math.round(size * Math.max(scale * 1.2, 1.0));
  }
  return size;
};

/**
 * Get appropriate spacing for the current platform
 */
export const getSpacing = (base: number): number => {
  return scaleSize(base);
};

/**
 * Get responsive value based on device type
 */
export const responsive = <T>(options: { mobile: T; tablet?: T; desktop?: T; tv?: T }): T => {
  const { width: currentWidth } = Dimensions.get('window');
  
  if (Platform.isTV) {
    return options.tv ?? options.desktop ?? options.tablet ?? options.mobile;
  }
  
  if (currentWidth < MOBILE_BREAKPOINT) {
    return options.mobile;
  }
  
  if (currentWidth < 1024) {
    return options.tablet ?? options.mobile;
  }
  
  return options.desktop ?? options.tablet ?? options.mobile;
};

/**
 * Get screen info
 */
export const getScreenInfo = () => {
  const { width: currentWidth, height: currentHeight } = Dimensions.get('window');
  return {
    width: currentWidth,
    height: currentHeight,
    scale,
    isTV: Platform.isTV,
    isMobile: !Platform.isTV && currentWidth < MOBILE_BREAKPOINT,
    isTablet: !Platform.isTV && currentWidth >= MOBILE_BREAKPOINT && currentWidth < 1024,
    isLargeScreen: currentWidth >= 1920,
  };
};
