import { Platform, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import { LocalMediaItem } from '../types';

// Video file extensions to scan for
const VIDEO_EXTENSIONS = [
  '.mp4', '.m4v', '.mov', '.mkv', '.avi', '.wmv',
  '.flv', '.webm', '.ts', '.mts', '.m2ts', '.3gp',
  '.ogv', '.divx', '.xvid', '.rmvb', '.asf',
];

// Max file size to scan (5GB) - skip extremely large files
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

// Max files to return per directory to avoid overwhelming the UI
const MAX_FILES_PER_DIR = 500;

export class LocalMediaService {
  private directories: string[];

  constructor(directories: string[] = []) {
    this.directories = directories;
  }

  setDirectories(directories: string[]) {
    this.directories = directories;
  }

  getDirectories(): string[] {
    return this.directories;
  }

  /**
   * Check if local file access is available on this platform.
   * Available on iOS (sandboxed Documents dir + document picker).
   * On tvOS, local file access is very limited so we disable.
   */
  static isPlatformSupported(): boolean {
    return Platform.OS === 'ios' && !Platform.isTV;
  }

  /**
   * Pick a directory using the native document picker (iOS 14+).
   * Returns the selected directory URI.
   */
  static async pickDirectory(): Promise<string | null> {
    try {
      const result = await DocumentPicker.pickDirectory();
      if (result && result.uri) {
        // On iOS, the URI from pickDirectory is a security-scoped URL
        // that may need decoding
        const decodedUri = decodeURIComponent(result.uri);
        console.log('[LocalMedia] Picked directory:', decodedUri);
        return decodedUri;
      }
      return null;
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) {
        console.log('[LocalMedia] Directory pick cancelled');
        return null;
      }
      console.error('[LocalMedia] Failed to pick directory:', err);
      throw err;
    }
  }

  /**
   * Pick individual video files using the native document picker.
   * Returns array of selected file URIs.
   */
  static async pickVideoFiles(): Promise<string[]> {
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.video],
        allowMultiSelection: true,
        copyTo: 'cachesDirectory',
      });

      const uris = results.map(r => {
        // If file was copied to caches directory, use that path
        if (r.fileCopyUri) {
          return decodeURIComponent(r.fileCopyUri);
        }
        return decodeURIComponent(r.uri);
      });

      console.log('[LocalMedia] Picked', uris.length, 'video files');
      return uris;
    } catch (err: any) {
      if (DocumentPicker.isCancel(err)) {
        console.log('[LocalMedia] File pick cancelled');
        return [];
      }
      console.error('[LocalMedia] Failed to pick files:', err);
      throw err;
    }
  }

  /**
   * Get the app's Documents directory path.
   * This is the default location where users can place media files
   * via iTunes File Sharing or the iOS Files app.
   */
  static getDocumentsDirectory(): string {
    return RNFS.DocumentDirectoryPath;
  }

  /**
   * Scan all configured directories for video files.
   * Returns a flat list of LocalMediaItem objects.
   */
  async scanAllDirectories(): Promise<LocalMediaItem[]> {
    if (this.directories.length === 0) {
      return [];
    }

    const allItems: LocalMediaItem[] = [];

    for (const dir of this.directories) {
      try {
        const exists = await RNFS.exists(dir);
        if (!exists) {
          console.log('[LocalMedia] Directory does not exist:', dir);
          continue;
        }

        const items = await this.scanDirectory(dir);
        allItems.push(...items);
      } catch (err) {
        console.error('[LocalMedia] Error scanning directory:', dir, err);
      }
    }

    return allItems;
  }

  /**
   * Recursively scan a single directory for video files.
   */
  async scanDirectory(dirPath: string): Promise<LocalMediaItem[]> {
    const items: LocalMediaItem[] = [];

    try {
      const contents = await RNFS.readDir(dirPath);

      for (const item of contents) {
        // Stop if we've collected enough items
        if (items.length >= MAX_FILES_PER_DIR) {
          console.log('[LocalMedia] Reached max files per directory limit');
          break;
        }

        if (item.isDirectory()) {
          // Recurse into subdirectories
          try {
            const subItems = await this.scanDirectory(item.path);
            items.push(...subItems);
          } catch (err) {
            // Skip inaccessible subdirectories
            console.log('[LocalMedia] Skipping inaccessible subdirectory:', item.path);
          }
        } else if (item.isFile()) {
          const fileName = item.name || '';
          const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

          if (VIDEO_EXTENSIONS.includes(ext)) {
            // Skip files that are too large
            const fileSize = Number(item.size) || 0;
            if (fileSize > MAX_FILE_SIZE) {
              console.log('[LocalMedia] Skipping large file:', fileName, `(${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB)`);
              continue;
            }

            items.push({
              id: `local-${item.path}`,
              name: this.cleanFileName(fileName),
              path: item.path,
              size: fileSize,
              mimeType: this.guessMimeType(ext),
              type: this.guessMediaType(fileName),
            });
          }
        }
      }
    } catch (err) {
      console.error('[LocalMedia] Error reading directory:', dirPath, err);
    }

    // Sort alphabetically
    items.sort((a, b) => a.name.localeCompare(b.name));

    return items;
  }

  /**
   * Check if a specific file path is accessible and is a video file.
   */
  async validateFile(path: string): Promise<boolean> {
    try {
      const exists = await RNFS.exists(path);
      if (!exists) return false;

      const stat = await RNFS.stat(path);
      if (!stat.isFile()) return false;

      const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
      return VIDEO_EXTENSIONS.includes(ext);
    } catch {
      return false;
    }
  }

  /**
   * Clean up a filename for display (remove extension, replace underscores/dots).
   */
  private cleanFileName(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    let name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;

    // Replace common separators with spaces
    name = name.replace(/[._]/g, ' ');

    // Collapse multiple spaces
    name = name.replace(/\s+/g, ' ').trim();

    // If the name is empty after cleaning, return original
    return name || fileName;
  }

  /**
   * Guess media type based on filename patterns.
   */
  private guessMediaType(fileName: string): 'movie' | 'episode' | 'unknown' {
    const name = fileName.toLowerCase();

    // Episode patterns: S01E01, s1e1, 1x01, E01, Episode
    const episodePatterns = [
      /[sS]\d{1,2}[eE]\d{1,3}/,
      /\d{1,2}x\d{1,3}/,
      /[eE]pisode\s*\d+/i,
      /[eE]\d{2,3}/,
      /第\d+[話話]/,
    ];

    for (const pattern of episodePatterns) {
      if (pattern.test(name)) {
        return 'episode';
      }
    }

    // Common movie patterns (year in name, 1080p, 4K, etc.)
    const moviePatterns = [
      /(19|20)\d{2}/,  // Year pattern
      /1080p|720p|2160p|4k|uhd|bluray|brrip|dvdrip|web-dl|webrip|hdcam/i,
    ];

    for (const pattern of moviePatterns) {
      if (pattern.test(name)) {
        return 'movie';
      }
    }

    return 'unknown';
  }

  /**
   * Guess MIME type based on file extension.
   */
  private guessMimeType(extension: string): string {
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.m4v': 'video/mp4',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm',
      '.ts': 'video/mp2t',
      '.mts': 'video/mp2t',
      '.m2ts': 'video/mp2t',
      '.3gp': 'video/3gpp',
      '.ogv': 'video/ogg',
    };
    return mimeMap[extension] || 'video/mp4';
  }

  /**
   * Get the file URL for a local path (for use with react-native-video).
   */
  static getFileUrl(path: string): string {
    if (path.startsWith('file://')) {
      return path;
    }
    return `file://${path}`;
  }
}
