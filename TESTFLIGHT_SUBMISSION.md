# Mediora - tvOS TestFlight & App Store Submission Guide

This document provides step-by-step instructions for submitting Mediora to TestFlight and the App Store.

## Prerequisites Checklist

### ✅ Already Completed
- [x] App bundle identifier configured (`com.mediora.app` for tvOS)
- [x] App display name set to "Mediora"
- [x] Privacy policy created
- [x] Export compliance key added (`ITSAppUsesNonExemptEncryption: NO`)
- [x] tvOS icons configured (App Icon & Top Shelf Image)
- [x] Fastlane configuration created
- [x] App Store metadata prepared

### 🔲 You Need To Complete
- [ ] Apple Developer Program membership ($99/year)
- [ ] App Store Connect app entry created
- [ ] Screenshots captured (5-10 at 1920x1080)
- [ ] Development Team ID updated in Xcode
- [ ] Demo Jellyfin server for app review

---

## Step 1: Generate App Icons

Run the icon generation script:

```bash
# Make script executable
chmod +x scripts/generate-all-icons.sh

# Generate all icons from source
./scripts/generate-all-icons.sh

# Or specify a custom source icon
./scripts/generate-all-icons.sh path/to/your/icon.png
```

This creates:
- iOS 1024x1024 App Store icon (no alpha channel)
- tvOS layered icons (Front/Middle/Back)
- tvOS Top Shelf images

---

## Step 2: Configure Xcode Signing

1. Open the project in Xcode:
   ```bash
   open ios/mediora.xcworkspace
   ```

2. Select the **mediora** target (tvOS)

3. Go to **Signing & Capabilities** tab

4. Update settings:
   - **Team**: Select YOUR Apple Developer team
   - Enable **Automatically manage signing**
   - **Bundle Identifier**: `com.mediora.app`

5. Verify no signing errors appear

---

## Step 3: Create App Store Connect Entry

1. Go to [App Store Connect](https://appstoreconnect.apple.com)

2. Click **My Apps** → **+** → **New App**

3. Fill in:
   - **Platform**: tvOS
   - **Name**: Mediora
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: com.mediora.app
   - **SKU**: mediora-tvos-2026

4. Click **Create**

---

## Step 4: Capture Screenshots

### Using Simulator:

1. Start the tvOS simulator:
   ```bash
   npx react-native run-ios --simulator "Apple TV"
   ```

2. Navigate to different screens and capture:
   - Press **Cmd+S** in Simulator to save screenshot
   - Or use the helper script:
     ```bash
     chmod +x scripts/capture-screenshots.sh
     ./scripts/capture-screenshots.sh
     ```

### Required Screenshots (1920x1080):
- Home screen showing media library
- Media details screen
- Video player
- Search results
- Settings screen

---

## Step 5: Build for TestFlight (Manual)

### Option A: Using Xcode

1. Select **Any tvOS Device (arm64)** as destination

2. Go to **Product** → **Archive**

3. Wait for archive to complete

4. Click **Distribute App**

5. Select **App Store Connect** → **Upload**

6. Follow prompts to upload

### Option B: Using Fastlane

```bash
# Install dependencies
cd fastlane
bundle install

# Update Appfile with your Apple ID
# Then run:
cd ..
bundle exec fastlane tvos beta
```

---

## Step 6: Configure TestFlight

1. In App Store Connect, go to your app → **TestFlight**

2. Wait for build processing (5-30 minutes)

3. Answer Export Compliance:
   - "Does your app use encryption?" → **Yes** (HTTPS)
   - "Is it exempt?" → **Yes** (standard HTTPS only)

4. Add Test Information:
   - **Beta App Description**: Brief description for testers
   - **Contact Email**: Your email
   - **Beta App Review Information**: Demo credentials

5. Add Internal Testers:
   - Click **App Store Connect Users**
   - Select team members to test

---

## Step 7: Prepare for App Store Review

### Fill in App Information:

1. **App Information** tab:
   - **Category**: Entertainment
   - **Content Rights**: Confirm rights

2. **Pricing and Availability**:
   - **Price**: Free
   - **Availability**: All territories

3. **App Privacy**:
   - **Data Collection**: No data collected
   - Link to privacy policy URL

### Version Information:

1. Add screenshots (1920x1080)

2. Fill in description (from `fastlane/metadata/en-US/description.txt`)

3. Add keywords

4. Set promotional text

5. Set support URL

6. Set marketing URL (optional)

### App Review Information:

```
Demo Account:
  URL: http://demo.jellyfin.org/stable
  Username: demo
  Password: (leave empty or check jellyfin.org)

Notes for Reviewer:
Mediora is a client for Jellyfin media servers. The demo server above
contains sample content for testing. To test:

1. Open Mediora
2. Go to Settings
3. Enter the server URL
4. Enter credentials
5. Browse and play media

The app does not collect user data. All communication is directly
between the device and the user's configured server.
```

---

## Step 8: Submit for Review

1. Select your build in App Store Connect

2. Review all information

3. Click **Submit for Review**

4. Answer additional questions:
   - **Export Compliance**: Yes, exempt (standard encryption)
   - **Content Rights**: Confirm
   - **Advertising Identifier**: No

5. Wait for review (typically 1-3 days)

---

## Troubleshooting

### "Missing App Icon"
- Run `./scripts/generate-all-icons.sh`
- Verify icons in Xcode Asset Catalog
- Clean build folder: **Product** → **Clean Build Folder**

### "Invalid Binary"
- Check minimum deployment target (tvOS 15.1+)
- Verify bundle identifier matches App Store Connect
- Ensure no simulator-only code in release build

### "Missing Compliance"
- Add `ITSAppUsesNonExemptEncryption` key to Info.plist (already done)

### "Provisioning Profile Issues"
- Enable automatic signing in Xcode
- Or use `bundle exec fastlane sync_certs`

### Build Fails
```bash
# Clean and rebuild
cd ios
rm -rf build Pods Podfile.lock
pod install
cd ..
npx react-native run-ios --scheme mediora --device "Apple TV"
```

---

## Post-Submission

### If Approved ✅
1. Release the app (manual or automatic)
2. Monitor reviews and ratings
3. Plan next version

### If Rejected ❌
1. Read rejection reason in Resolution Center
2. Fix mentioned issues
3. Reply if clarification needed
4. Resubmit

---

## Quick Commands Reference

```bash
# Generate icons
./scripts/generate-all-icons.sh

# Capture screenshots
./scripts/capture-screenshots.sh

# Build for TestFlight
bundle exec fastlane tvos beta

# Submit to App Store
bundle exec fastlane tvos release

# Increment version
bundle exec fastlane bump type:patch

# Run locally on simulator
npx react-native run-ios --simulator "Apple TV"

# Archive in Xcode
# Product → Archive
```

---

## Resources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [tvOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/tvos)
- [React Native tvOS](https://github.com/react-native-tvos/react-native-tvos)
- [Fastlane Documentation](https://docs.fastlane.tools)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)

---

**Good luck with your submission! 🚀**
