import { Dimensions, Platform } from 'react-native';

// Get the device screen dimensions
const { width, height } = Dimensions.get('window');

// Base dimensions - typical TV size (1920x1080)
const baseWidth = 1920;
const baseHeight = 1080;

// Calculate scale factors
const scaleWidth = width / baseWidth;
const scaleHeight = height / baseHeight;

// Use the smaller scale factor to ensure everything fits
const scale = Math.min(scaleWidth, scaleHeight);

/**
 * Scale a value based on screen size
 * For TV, scales relative to a 1920x1080 base
 * For mobile, returns the original value
 */
export const scaleSize = (size: number): number => {
  if (Platform.isTV) {
    // Apply scaling for TV, but don't go below 1.0
    return Math.round(size * Math.max(scale, 1.0));
  }
  return size;
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
 * Get screen info
 */
export const getScreenInfo = () => ({
  width,
  height,
  scale,
  isTV: Platform.isTV,
  isLargeScreen: width >= 1920,
});
