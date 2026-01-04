# Demo Server Feature

## Overview

Added a "Use Demo Server" button in the Jellyfin settings that automatically configures the public Jellyfin demo server for quick testing.

## Feature Details

### Location
Settings → Jellyfin tab → "Use Demo Server" button

### Functionality
When clicked, the button:
1. Sets the server URL to `http://demo.jellyfin.org/stable`
2. Clears any existing errors or test results
3. Clears discovered servers list
4. Shows an alert confirming the configuration

### User Flow
1. Open Mediora
2. Navigate to Settings (sidebar)
3. Click "Use Demo Server" button
4. Click "Test Connection" to verify connectivity
5. Click "Connect with Quick Connect" to authenticate
   - Note: Quick Connect may not work on the public demo server
   - Alternative: Use username/password authentication if available

### Demo Server Details
- **URL**: `http://demo.jellyfin.org/stable`
- **Username**: `demo`
- **Password**: (leave empty)
- **Source**: Public Jellyfin demo server

### Benefits
- Quick testing without setting up a personal Jellyfin server
- Useful for App Store reviewers
- Helps new users understand app functionality
- Simplifies onboarding process

### Implementation
Added to [src/screens/SettingsScreen.tsx](src/screens/SettingsScreen.tsx):
- `handleUseDemoServer()` function
- "Use Demo Server" button with flask icon
- Helper text explaining the feature
- Styling for demo container

## App Store Submission

This feature directly supports the App Store review process by:
- Providing reviewers easy access to test content
- Eliminating the need for reviewers to set up their own Jellyfin server
- Matching the demo credentials provided in review information
- Making the app immediately testable

The demo server credentials match those in [fastlane/metadata/review_information.json](fastlane/metadata/review_information.json).
