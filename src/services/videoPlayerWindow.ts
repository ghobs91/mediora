import { NativeModules, Platform } from 'react-native';

const { VideoPlayerWindow } = NativeModules;

interface PlaybackPosition {
  currentTime: number;
  duration: number;
  itemId: string;
}

/**
 * Service for opening video playback in a separate native window on macOS.
 * This allows using native window controls (close/minimize/maximize) to exit the player.
 * Falls back to normal React Native player on non-macOS platforms.
 */
export const videoPlayerWindowService = {
  /**
   * Check if native window player is supported on the current platform
   */
  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      // Only iOS/Catalyst platforms have the native module
      return false;
    }
    
    try {
      if (!VideoPlayerWindow) {
        console.log('[VideoPlayerWindow] Native module not available');
        return false;
      }
      const supported = await VideoPlayerWindow.isSupported();
      console.log('[VideoPlayerWindow] isSupported:', supported);
      return supported;
    } catch (error) {
      console.log('[VideoPlayerWindow] isSupported check failed:', error);
      return false;
    }
  },

  /**
   * Open video in a separate native window (Mac Catalyst only)
   * @param url - The video URL to play
   * @param title - The window title
   * @param itemId - The media item ID for tracking
   * @param startPosition - Start position in seconds
   */
  async openPlayer(
    url: string,
    title: string,
    itemId: string,
    startPosition: number = 0
  ): Promise<{ success: boolean; modal?: boolean }> {
    if (!VideoPlayerWindow) {
      throw new Error('VideoPlayerWindow native module not available');
    }
    
    console.log('[VideoPlayerWindow] Opening player:', { url: url.substring(0, 50), title, itemId, startPosition });
    
    return await VideoPlayerWindow.openPlayer(url, title, itemId, startPosition);
  },

  /**
   * Close the player window
   */
  async closePlayer(): Promise<void> {
    if (!VideoPlayerWindow) {
      return;
    }
    
    try {
      await VideoPlayerWindow.closePlayer();
    } catch (error) {
      console.log('[VideoPlayerWindow] closePlayer error:', error);
    }
  },

  /**
   * Get current playback position from the native player
   */
  async getPlaybackPosition(): Promise<PlaybackPosition | null> {
    if (!VideoPlayerWindow) {
      return null;
    }
    
    try {
      return await VideoPlayerWindow.getPlaybackPosition();
    } catch (error) {
      console.log('[VideoPlayerWindow] getPlaybackPosition error:', error);
      return null;
    }
  },
};
