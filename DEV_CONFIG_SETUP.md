# Development Environment Configuration

This project uses `react-native-config` to manage environment-specific variables for local development without exposing sensitive API keys in the repository or production builds.

## Setup

### 1. Create Your Local Environment File

Copy the example file and fill in your actual credentials:

```bash
cp .env.example .env.local
```

### 2. Edit `.env.local` with Your Credentials

```bash
# Sonarr Configuration
SONARR_URL=http://192.168.1.100:8989
SONARR_API_KEY=your_actual_sonarr_api_key

# Radarr Configuration
RADARR_URL=http://192.168.1.100:7878
RADARR_API_KEY=your_actual_radarr_api_key
```

**Important:** Replace the placeholder values with your actual server URLs and API keys.

## How It Works

### Development Mode (`__DEV__`)

When running the app in development mode (iOS Simulator, Android Emulator, or Metro bundler):

1. **Auto-filled Settings**: The Sonarr and Radarr settings screens will automatically pre-fill with your credentials from `.env.local`
2. **Auto-connect Services**: If you haven't saved any settings yet, the app will automatically use your dev credentials to connect to services
3. **Override Capability**: User-saved settings always take precedence over dev config

### Production Builds

When creating production builds (App Store submission, TestFlight, etc.):

1. **No Environment Variables**: The `.env.local` file is NOT included in the bundle
2. **No Auto-fill**: Settings screens will be empty, requiring manual user input
3. **Clean Archive**: Xcode archives and Android APKs will NOT contain your dev credentials

## Security Features

✅ **Git Ignored**: `.env.local` is in `.gitignore` and will never be committed  
✅ **Dev-Only**: Environment variables only load when `__DEV__` is `true`  
✅ **Build Excluded**: Production builds strip these values automatically  
✅ **User Override**: Saved settings override dev config

## File Structure

```
mediora/
├── .env.example          # Template (committed to git)
├── .env.local           # Your actual keys (git ignored)
├── src/
│   ├── config/
│   │   └── dev.ts       # Dev config loader
│   └── types/
│       └── react-native-config.d.ts  # TypeScript definitions
```

## Usage in Code

The dev config is automatically applied in:

- **ServicesContext** ([src/context/ServicesContext.tsx](src/context/ServicesContext.tsx)): Auto-connects services
- **SonarrSettingsScreen** ([src/screens/SonarrSettingsScreen.tsx](src/screens/SonarrSettingsScreen.tsx)): Pre-fills form
- **RadarrSettingsScreen** ([src/screens/RadarrSettingsScreen.tsx](src/screens/RadarrSettingsScreen.tsx)): Pre-fills form

## Troubleshooting

### Environment variables not loading

1. Make sure `.env.local` exists in the project root
2. Restart Metro bundler: `npm start -- --reset-cache`
3. For iOS: Clean build folder in Xcode (`Cmd+Shift+K`)
4. For Android: Clean build: `cd android && ./gradlew clean`

### Still seeing empty settings

Check that `__DEV__` is true:
```typescript
console.log('Dev mode?', __DEV__);
```

### Production build still has dev values

This should not happen, but if it does:
1. Check that you're creating a Release build, not Debug
2. Verify `.env.local` is in `.gitignore`
3. For iOS: Archive builds automatically use Release configuration

## Additional Environment Variables

You can add more variables to `.env.example` and `.env.local`:

```bash
# Example: TMDB API Key (if needed)
TMDB_API_KEY=

# Example: Different server for testing
JELLYFIN_TEST_URL=
```

Then update [src/types/react-native-config.d.ts](src/types/react-native-config.d.ts) and [src/config/dev.ts](src/config/dev.ts) accordingly.
