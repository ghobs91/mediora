import { NativeModules, Platform } from 'react-native';

const { HDRSupportModule } = NativeModules;

export interface HDRCapabilities {
  isHDRSupported: boolean;
  supportedVideoRanges: string[];
}

/**
 * Query the native platform for HDR/Dolby Vision video range capabilities.
 * Returns the set of VideoRangeType strings that AVPlayer can handle,
 * suitable for inclusion in the Jellyfin DeviceProfile.
 */
export async function getHDRCapabilities(): Promise<HDRCapabilities> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'tvos') {
    return { isHDRSupported: false, supportedVideoRanges: ['SDR'] };
  }

  if (!HDRSupportModule) {
    console.warn('[HDR] HDRSupportModule not available');
    return { isHDRSupported: false, supportedVideoRanges: ['SDR'] };
  }

  try {
    const [isHDRSupported, supportedVideoRanges] = await Promise.all([
      HDRSupportModule.isHDRSupported() as Promise<boolean>,
      HDRSupportModule.getSupportedVideoRanges() as Promise<string[]>,
    ]);

    return { isHDRSupported, supportedVideoRanges };
  } catch (error) {
    console.warn('[HDR] Failed to get HDR capabilities:', error);
    return { isHDRSupported: false, supportedVideoRanges: ['SDR'] };
  }
}

/**
 * On tvOS, configure the display for automatic HDR mode switching.
 * This works with the "Match Dynamic Range" setting in tvOS Settings.
 */
export async function configureDisplayForHDR(): Promise<boolean> {
  if (!HDRSupportModule) {
    return false;
  }

  try {
    return await HDRSupportModule.configureDisplayForHDR();
  } catch (error) {
    console.warn('[HDR] Failed to configure display for HDR:', error);
    return false;
  }
}
