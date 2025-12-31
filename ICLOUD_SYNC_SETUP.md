# iCloud Sync Setup Guide

This guide explains how to complete the setup for iCloud syncing of service credentials across iOS, macOS, and tvOS.

## What's Been Implemented

1. **Native Swift Module** (`ICloudSyncModule.swift`): Handles iCloud key-value storage
2. **Objective-C Bridge** (`ICloudSyncModule.m`): Exposes Swift module to React Native
3. **TypeScript Service** (`src/services/icloud.ts`): Provides a clean interface for React Native
4. **Settings Context Updates**: Automatically syncs settings to/from iCloud

## How It Works

### On iOS/macOS (Mobile Apps):
- When you successfully connect to Jellyfin, Sonarr, or Radarr, the credentials are automatically saved to iCloud
- Settings are stored in iCloud Key-Value Storage, which syncs across all devices using the same Apple ID

### On tvOS:
- On app launch, if local settings are empty, the app checks iCloud for synced settings
- If found, credentials are automatically loaded and prefilled in the Settings screen
- This provides a seamless setup experience on Apple TV

## Required Manual Setup in Xcode

Since Xcode project files cannot be reliably edited programmatically, you need to complete these steps manually:

### 1. Add Swift Files to Xcode Project

1. Open `ios/mediora.xcworkspace` in Xcode
2. Right-click on the `mediora` folder in the Project Navigator
3. Select "Add Files to mediora..."
4. Navigate to `ios/mediora/` and select these files:
   - `ICloudSyncModule.swift`
   - `ICloudSyncModule.m`
   - `mediora-Bridging-Header.h`
5. Make sure "Copy items if needed" is **unchecked**
6. Make sure **both targets** are selected:
   - ☑️ mediora (tvOS)
   - ☑️ mediora-mobile (iOS/macOS)
7. Click "Add"

### 2. Configure Swift Bridging Header

For **both targets** (mediora and mediora-mobile):

1. Select the project in Project Navigator
2. Select the target (mediora or mediora-mobile)
3. Go to Build Settings tab
4. Search for "bridging header"
5. Under "Swift Compiler - General" → "Objective-C Bridging Header", set:
   ```
   mediora/mediora-Bridging-Header.h
   ```

### 3. Add Entitlements File

For **both targets** (mediora and mediora-mobile):

1. Select the project in Project Navigator
2. Select the target
3. Go to "Signing & Capabilities" tab
4. Click "+ Capability"
5. Add "iCloud"
6. In the iCloud section:
   - Enable "Key-value storage"
   - The entitlements file should be automatically created
7. If not automatically created, go to Build Settings and search for "entitlements"
8. Set "Code Signing Entitlements" to: `mediora/mediora.entitlements`

### 4. Configure iCloud Container

The entitlements file uses:
- **iCloud KVS Identifier**: `$(TeamIdentifierPrefix)$(CFBundleIdentifier)`
- **App Group**: `group.com.mediora.shared`

Make sure your Bundle Identifier is consistent across all targets.

### 5. Update Team and Provisioning

1. Select each target (mediora and mediora-mobile)
2. Go to "Signing & Capabilities"
3. Ensure your development team is selected
4. Xcode will automatically provision the iCloud capabilities

### 6. Verify Setup

After adding the files and capabilities, build the project:

```bash
cd ios
pod install
cd ..
npx react-native run-ios  # For iOS
# or for tvOS:
npx react-native run-ios --simulator="Apple TV"
```

## Testing the Flow

### Test on iOS/macOS:
1. Open the app and go to Settings
2. Configure Jellyfin, Sonarr, and Radarr
3. Credentials are automatically saved to iCloud
4. Check console logs for: `[iCloud] Jellyfin settings saved to iCloud`

### Test on tvOS:
1. Open the app (make sure you're using the same Apple ID)
2. On first launch, check console logs for: `[Settings] tvOS detected, checking iCloud for synced settings...`
3. If settings are found: `[Settings] Loaded Jellyfin settings from iCloud`
4. Go to Settings screen - fields should be prefilled

## Troubleshooting

### "Module not found" errors
- Make sure bridging header is configured for both targets
- Clean build folder: Product → Clean Build Folder (Cmd+Shift+K)
- Delete DerivedData: `rm -rf ~/Library/Developer/Xcode/DerivedData/*`

### iCloud not syncing
- Ensure both devices are signed in to the same Apple ID
- Check that iCloud Drive is enabled in Settings → Apple ID → iCloud
- iCloud KVS can take a few seconds to sync - be patient
- Check console logs for sync errors

### Entitlements errors
- Ensure your Apple Developer account has iCloud enabled
- Verify Bundle ID matches in all targets
- Try regenerating provisioning profiles in Xcode

## Security Notes

- iCloud Key-Value Storage is end-to-end encrypted
- Data is tied to your Apple ID
- Only devices signed into the same Apple ID can access the synced data
- API keys and tokens are stored securely in iCloud

## API Reference

The iCloud service is automatically used by the Settings context. You can also use it directly:

```typescript
import { iCloudService } from './services/icloud';

// Save Jellyfin settings
await iCloudService.saveJellyfinSettings({
  serverUrl: 'http://...',
  accessToken: '...',
  userId: '...',
  serverId: '...',
  deviceId: '...'
});

// Get Jellyfin settings
const settings = await iCloudService.getJellyfinSettings();

// Clear Jellyfin settings
await iCloudService.clearJellyfinSettings();
```

Same methods exist for Sonarr and Radarr.
