# Mediora tvOS/iOS Fastlane README

This directory contains Fastlane configuration for automating builds and App Store submissions.

## Setup

1. Install Fastlane:
   ```bash
   # Using Bundler (recommended)
   cd fastlane
   bundle install
   
   # Or directly
   gem install fastlane
   ```

2. Configure your credentials:
   - Update `Appfile` with your Apple Developer account details
   - Update `Matchfile` with your certificates repository
   - Set environment variables for sensitive data

## Available Lanes

### tvOS

```bash
# Build and upload to TestFlight
bundle exec fastlane tvos beta

# Submit to App Store
bundle exec fastlane tvos release

# Local development build
bundle exec fastlane tvos build
```

### iOS

```bash
# Build and upload to TestFlight
bundle exec fastlane ios beta

# Submit to App Store
bundle exec fastlane ios release
```

### Shared

```bash
# Run tests
bundle exec fastlane test

# Generate screenshots
bundle exec fastlane screenshots

# Sync certificates
bundle exec fastlane sync_certs

# Bump version (patch, minor, major)
bundle exec fastlane bump type:patch
```

## Environment Variables

Set these for CI/CD:

```bash
export FASTLANE_USER="your-apple-id@example.com"
export FASTLANE_PASSWORD="your-app-specific-password"
export MATCH_PASSWORD="your-certificates-encryption-password"
export APP_STORE_CONNECT_APP_ID_TVOS="your-tvos-app-id"
export APP_STORE_CONNECT_APP_ID_IOS="your-ios-app-id"
```

## Metadata

App Store metadata is stored in `metadata/en-US/`:
- `description.txt` - Full app description
- `subtitle.txt` - App subtitle (30 chars max)
- `keywords.txt` - Search keywords (100 chars max)
- `release_notes.txt` - What's new in this version
- `name.txt` - App name
- `promotional_text.txt` - Promotional text
- `copyright.txt` - Copyright notice

## Screenshots

Place screenshots in `screenshots/en-US/`:
- tvOS: 1920x1080 (landscape)
- iPhone: 1290x2796 (6.7" display)
- iPad: 2048x2732 (12.9" display)

## First Time Setup

1. Create App Store Connect app entries for tvOS and iOS
2. Get the app IDs from App Store Connect
3. Set up a private git repo for certificates (match)
4. Run `bundle exec fastlane match appstore` to generate certificates
5. Update the review information in `metadata/review_information.json`
6. Upload your first build with `bundle exec fastlane tvos beta`
