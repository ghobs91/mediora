# GitHub Actions Secrets Required for App Store Submission

This document lists the secrets you need to configure in your GitHub repository for automated builds.

## Required Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

### 1. CERTIFICATES_P12
Base64-encoded .p12 file containing your Apple Distribution certificate.

**How to create:**
1. Open Keychain Access
2. Find your "Apple Distribution" certificate
3. Right-click → Export
4. Save as .p12 with a password
5. Convert to base64: `base64 -i certificates.p12 | pbcopy`
6. Paste as secret value

### 2. CERTIFICATES_PASSWORD
The password you used when exporting the .p12 file.

### 3. TVOS_PROVISIONING_PROFILE
Base64-encoded tvOS provisioning profile.

**How to create:**
1. Go to Apple Developer Portal
2. Create App Store provisioning profile for `com.mediora.app`
3. Download the .mobileprovision file
4. Convert to base64: `base64 -i profile.mobileprovision | pbcopy`
5. Paste as secret value

### 4. APPLE_TEAM_ID
Your Apple Developer Team ID (e.g., `XTXZ3CYRPX`)

### 5. APP_STORE_API_KEY_ID
App Store Connect API Key ID.

**How to create:**
1. Go to App Store Connect → Users and Access → Keys
2. Generate API Key with "App Manager" role
3. Copy the Key ID

### 6. APP_STORE_API_ISSUER
App Store Connect API Issuer ID (shown on the Keys page).

### 7. APP_STORE_API_KEY (Optional for Fastlane)
The .p8 API key file contents.

**How to create:**
1. Download the API Key .p8 file
2. Copy the contents of the file
3. Paste as secret value

## Local Development

For local builds, you don't need these secrets. Just use Xcode's automatic signing:

1. Open Xcode
2. Sign in with your Apple ID
3. Enable "Automatically manage signing"
4. Build and archive normally

## Alternative: Fastlane Match

For team environments, consider using Fastlane Match:

```bash
# Initialize match (first time)
bundle exec fastlane match init

# Generate certificates
bundle exec fastlane match appstore

# Use in CI
bundle exec fastlane tvos beta
```

See [fastlane/Matchfile](fastlane/Matchfile) for configuration.
