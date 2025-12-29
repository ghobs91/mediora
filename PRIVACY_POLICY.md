# Privacy Policy for Mediora

**Last Updated: December 29, 2025**

## Introduction

Mediora ("we", "our", or "the app") is a media client application that connects to your personal media servers (Jellyfin, Sonarr, Radarr) and The Movie Database (TMDB) API. This privacy policy explains how Mediora handles your data.

## Data Collection and Usage

### Data We DO NOT Collect

Mediora does **not** collect, store, or transmit any personal information to our servers. Specifically:

- We do not collect your name, email, or contact information
- We do not track your viewing habits or media consumption
- We do not collect analytics or usage statistics
- We do not store your media server credentials on our servers
- We do not use advertising or tracking technologies
- We do not share any data with third parties for marketing purposes

### Data Stored Locally on Your Device

Mediora stores the following information **locally on your device only**:

1. **Server Connection Settings**:
   - Jellyfin server URL and API credentials
   - Sonarr server URL and API credentials (if configured)
   - Radarr server URL and API credentials (if configured)
   - TMDB API key (if configured)

2. **App Preferences**:
   - User interface settings
   - Playback preferences
   - Content organization preferences

This data is stored using iOS/macOS/tvOS secure storage mechanisms (UserDefaults/Keychain) and never leaves your device unless you explicitly sync via iCloud (iOS/macOS only).

### Data Transmitted to Third-Party Services

When you use Mediora, the app communicates **directly** with your configured services:

#### 1. Your Media Servers
- **Jellyfin**: Your credentials and API requests are sent directly to your Jellyfin server
- **Sonarr**: Your API key and requests are sent directly to your Sonarr server
- **Radarr**: Your API key and requests are sent directly to your Radarr server

**What this means**: The security and privacy of this data depends on your server configuration. We recommend:
- Using HTTPS for all server connections
- Keeping your servers behind a firewall or VPN
- Using strong, unique API keys

#### 2. The Movie Database (TMDB)
- When you search for media or view metadata, requests are sent to TMDB's API
- TMDB may collect data according to their privacy policy: https://www.themoviedb.org/privacy-policy
- No personally identifiable information is sent to TMDB

### Network Security

Mediora supports:
- **HTTPS connections** for secure communication with servers
- **Local network discovery** for finding servers on your network
- **Certificate validation** for HTTPS connections

⚠️ **Important**: For local network connections, you may need to use HTTP instead of HTTPS. Ensure your network is secure when using unencrypted connections.

## iCloud Sync (iOS/macOS Only)

If you enable iCloud on your device, your app settings **may** be synced across your Apple devices via iCloud. This includes:
- Server URLs and credentials
- App preferences

This data is encrypted and stored in your personal iCloud account according to Apple's privacy policy. We do not have access to your iCloud data.

To disable iCloud sync:
- **iOS**: Settings → [Your Name] → iCloud → Turn off Mediora
- **macOS**: System Preferences → Apple ID → iCloud → Turn off Mediora

## Data Retention

All data is stored locally on your device and persists until:
- You manually delete it via app settings
- You uninstall the app
- You reset your device

## Children's Privacy

Mediora does not knowingly collect any personal information from anyone, including children under 13. Since all data is stored locally on your device, parents/guardians have full control over what content is accessed through their media servers.

## Third-Party Services

Mediora integrates with the following third-party services that you configure:

1. **Jellyfin** (Your Server) - https://jellyfin.org/docs/general/privacy
2. **Sonarr** (Your Server) - https://sonarr.tv
3. **Radarr** (Your Server) - https://radarr.video
4. **The Movie Database (TMDB)** - https://www.themoviedb.org/privacy-policy

Each service has its own privacy policy and data handling practices. Please review them independently.

## Your Rights and Control

You have complete control over your data:

- **Access**: All your data is accessible in the app's Settings
- **Modify**: You can modify server settings and credentials at any time
- **Delete**: You can delete all settings by:
  - Going to Settings → "Clear All Settings" (if available)
  - Uninstalling the app
  - On iOS: Settings → Mediora → Reset

## Security

We implement security best practices:
- Sensitive credentials are stored in platform secure storage (Keychain on Apple platforms)
- Direct device-to-server communication (no intermediary servers)
- Support for HTTPS/TLS encrypted connections
- No telemetry or analytics that could leak information

## Changes to This Privacy Policy

We may update this privacy policy from time to time. We will notify you of any changes by:
- Updating the "Last Updated" date
- Posting the new policy in the app
- (If material changes) Displaying an in-app notification

## Open Source

Mediora's source code is available for review. You can verify our privacy claims by examining the code.

## Contact Information

If you have questions about this privacy policy or Mediora's privacy practices:

- **GitHub**: [Your GitHub Repository URL]
- **Email**: [Your Contact Email]
- **Website**: [Your Website URL]

## Legal Basis for Processing (GDPR)

If you are in the European Union:
- We process data based on **necessary performance** of the app's core functionality
- All processing occurs locally on your device
- You have the right to data portability (export your settings)
- You have the right to erasure (uninstall the app)

## California Privacy Rights (CCPA)

If you are a California resident:
- We do not sell your personal information
- We do not collect personal information as defined by CCPA
- All data is stored locally on your device

## Consent

By using Mediora, you consent to this privacy policy and understand that:
- Data is stored locally on your device
- The app communicates directly with your configured servers
- You are responsible for securing your server credentials
- Third-party services have their own privacy policies

---

**Summary**: Mediora is a privacy-focused app that stores everything locally on your device and does not collect or transmit personal information to any servers we control. Your privacy depends on how you configure and secure your own media servers.
