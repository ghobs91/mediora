import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYBACK_POSITION_KEY = '@mediora/playback_positions';

export interface PlaybackPosition {
  itemId: string;
  positionTicks: number; // Jellyfin uses ticks (10,000,000 ticks = 1 second)
  positionSeconds: number;
  durationSeconds: number;
  timestamp: number; // When this position was saved
  title?: string;
  type?: string;
}

class PlaybackPositionService {
  private positions: Map<string, PlaybackPosition> = new Map();
  private loaded = false;

  /**
   * Load all saved positions from AsyncStorage
   */
  async loadPositions(): Promise<void> {
    if (this.loaded) return;

    try {
      const stored = await AsyncStorage.getItem(PLAYBACK_POSITION_KEY);
      if (stored) {
        const positions: PlaybackPosition[] = JSON.parse(stored);
        this.positions = new Map(positions.map(p => [p.itemId, p]));
        console.log(`[PlaybackPosition] Loaded ${this.positions.size} saved positions`);
      }
      this.loaded = true;
    } catch (error) {
      console.error('[PlaybackPosition] Failed to load positions:', error);
    }
  }

  /**
   * Save all positions to AsyncStorage
   */
  private async savePositions(): Promise<void> {
    try {
      const positions = Array.from(this.positions.values());
      await AsyncStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify(positions));
    } catch (error) {
      console.error('[PlaybackPosition] Failed to save positions:', error);
    }
  }

  /**
   * Get saved position for an item
   * @param itemId The Jellyfin item ID
   * @returns The saved position or null if none exists
   */
  async getPosition(itemId: string): Promise<PlaybackPosition | null> {
    await this.loadPositions();
    return this.positions.get(itemId) || null;
  }

  /**
   * Save playback position for an item
   * @param position The position data to save
   */
  async savePosition(position: PlaybackPosition): Promise<void> {
    await this.loadPositions();

    // Only save if user is more than 30 seconds in but hasn't finished (within 2 minutes of end)
    const percentWatched = position.positionSeconds / position.durationSeconds;
    if (position.positionSeconds < 30 || percentWatched > 0.95) {
      // Too early or nearly finished - remove position
      await this.removePosition(position.itemId);
      return;
    }

    position.timestamp = Date.now();
    this.positions.set(position.itemId, position);
    await this.savePositions();
    console.log(`[PlaybackPosition] Saved position for ${position.itemId}: ${Math.floor(position.positionSeconds)}s`);
  }

  /**
   * Remove saved position for an item
   * @param itemId The Jellyfin item ID
   */
  async removePosition(itemId: string): Promise<void> {
    await this.loadPositions();
    if (this.positions.has(itemId)) {
      this.positions.delete(itemId);
      await this.savePositions();
      console.log(`[PlaybackPosition] Removed position for ${itemId}`);
    }
  }

  /**
   * Clear all saved positions (for cleanup/maintenance)
   */
  async clearAllPositions(): Promise<void> {
    this.positions.clear();
    await AsyncStorage.removeItem(PLAYBACK_POSITION_KEY);
    console.log('[PlaybackPosition] Cleared all positions');
  }

  /**
   * Clean up old positions (older than 30 days)
   */
  async cleanupOldPositions(): Promise<void> {
    await this.loadPositions();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let removedCount = 0;

    for (const [itemId, position] of this.positions.entries()) {
      if (position.timestamp < thirtyDaysAgo) {
        this.positions.delete(itemId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.savePositions();
      console.log(`[PlaybackPosition] Cleaned up ${removedCount} old positions`);
    }
  }
}

export const playbackPositionService = new PlaybackPositionService();
