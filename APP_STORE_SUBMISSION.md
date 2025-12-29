# App Store Submission Checklist for Mediora

Complete checklist for submitting Mediora to the App Store for iOS, tvOS, and macOS.

## Prerequisites

### ✅ Completed (by automation)
- [x] Bundle identifier changed to `com.mediora.app.mobile` (iOS/macOS) and `com.mediora.app` (tvOS)
- [x] App display name changed to "Mediora"
- [x] Security vulnerabilities fixed in Info.plist
- [x] Version set to 1.0.0
- [x] Code linting errors fixed
- [x] Privacy policy created

### 🔲 Manual Steps Required

## 1. Apple Developer Program

- [ ] Join Apple Developer Program ($99/year)
  - Go to https://developer.apple.com/programs/
  - Enroll with your Apple ID
  - Wait for approval (usually 24-48 hours)

## 2. App Icons

**Critical**: You must create actual app icon assets.

- [ ] Design a 1024x1024 master icon
- [ ] Generate all iOS icon sizes (see [APP_ICONS_GUIDE.md](APP_ICONS_GUIDE.md))
- [ ] Create tvOS layered icons (Front, Middle, Back layers)
- [ ] Create tvOS Top Shelf images
- [ ] Generate macOS icon sizes
- [ ] Add all icon files to `/ios/mediora/Images.xcassets/AppIcon.appiconset/`
- [ ] Update `Contents.json` with icon filenames
- [ ] Verify 1024x1024 icon has NO alpha channel

**Tools**: Use Figma, Sketch, or Icon Kitchen (https://icon.kitchen)

## 3. Certificates & Provisioning Profiles

### In Xcode:
- [ ] Open `/ios/mediora.xcworkspace`
- [ ] Select the `mediora` target (tvOS)
- [ ] Go to Signing & Capabilities
- [ ] Change Team from `XTXZ3CYRPX` to YOUR team
- [ ] Enable "Automatically manage signing"
- [ ] Repeat for `mediora-mobile` target (iOS/macOS)

### Verify:
- [ ] Development certificate created
- [ ] Distribution certificate created
- [ ] Provisioning profiles created for each platform

## 4. App Store Connect Setup

- [ ] Go to https://appstoreconnect.apple.com
- [ ] Click "My Apps" → "+" → "New App"
- [ ] Create THREE separate app entries:
  
  **App 1: Mediora (iOS)**
  - Platform: iOS
  - Bundle ID: `com.mediora.app.mobile`
  - Name: Mediora
  - Primary Language: English (or your choice)
  - SKU: `mediora-ios-001`
  
  **App 2: Mediora (tvOS)**
  - Platform: tvOS
  - Bundle ID: `com.mediora.app`
  - Name: Mediora
  - Primary Language: English
  - SKU: `mediora-tvos-001`
  
  **App 3: Mediora (macOS)** *(Optional)*
  - Platform: macOS
  - Bundle ID: `com.mediora.app.mobile` (same as iOS if using Catalyst)
  - Name: Mediora
  - Primary Language: English
  - SKU: `mediora-macos-001`

## 5. App Metadata

For **each platform**, fill in App Store Connect:

### General Information
- [ ] App Name: "Mediora"
- [ ] Subtitle: "Your Personal Media Client" (or similar)
- [ ] Category: Entertainment
- [ ] Secondary Category: Productivity (optional)

### Description
```
Mediora is a powerful media client that connects to your Jellyfin media server, 
allowing you to stream your personal media collection across all your Apple devices.

Features:
• Connect to your Jellyfin server
• Browse your movie and TV show libraries
• Resume watching from where you left off
• Search across your entire media collection
• Discover new content with TMDB integration
• Support for Sonarr and Radarr integration
• Beautiful, native interface designed for each platform
• Full support for iOS, tvOS, and macOS

Note: Requires a Jellyfin server. Visit jellyfin.org to learn more.
```

- [ ] Keywords: `jellyfin,media,streaming,plex,movies,tv shows,emby`
- [ ] Support URL: (your website or GitHub repo)
- [ ] Marketing URL: (optional)
- [ ] Privacy Policy URL: 
  - Upload `PRIVACY_POLICY.md` to your website OR
  - Use GitHub Pages: `https://yourusername.github.io/mediora/PRIVACY_POLICY.html`

### What's New in This Version
```
Initial release of Mediora!

• Connect to your Jellyfin media server
• Browse and play your media library
• Seamless experience across iOS, tvOS, and macOS
```

## 6. Screenshots & Previews

### iOS Screenshots (Required)
**6.7" Display (iPhone 14 Pro Max)**:
- [ ] 5-10 screenshots at 1290x2796 pixels

**5.5" Display (iPhone 8 Plus)**:
- [ ] 5-10 screenshots at 1242x2208 pixels

**12.9" iPad Pro (3rd gen)**:
- [ ] 5-10 screenshots at 2048x2732 pixels

### tvOS Screenshots (Required)
- [ ] 5-10 screenshots at 1920x1080 pixels
- Capture on Apple TV simulator or device

### macOS Screenshots (If submitting macOS)
- [ ] 5-10 screenshots showing app on macOS

**How to capture**:
```bash
# Build and run on each simulator
# Use Cmd+S to save screenshot
# Or use Xcode: Debug → View Debugging → Screenshot
```

### App Previews (Optional but Recommended)
- [ ] Create 15-30 second demo videos for each platform
- [ ] Upload to App Store Connect

## 7. App Review Information

In App Store Connect:

- [ ] Contact Information:
  - First Name: [Your Name]
  - Last Name: [Your Name]
  - Phone: [Your Phone]
  - Email: [Your Email]

- [ ] Demo Account (for reviewers):
  - Username: `demo` or `reviewer`
  - Password: [Create a demo Jellyfin account]
  - Notes: "Demo Jellyfin server with sample content for review"
  
  **⚠️ Important**: Apple reviewers need a working Jellyfin server to test.
  Options:
  - Set up a demo Jellyfin server with sample public domain content
  - Provide detailed setup instructions
  - Include demo server URL in notes

- [ ] Notes for Reviewer:
  ```
  Mediora requires a Jellyfin media server to function. We have provided a demo 
  server for testing purposes with sample content.
  
  Demo Server: http://demo.jellyfin.org/stable (or your demo server)
  Username: demo
  Password: [password]
  
  To test:
  1. Open Mediora
  2. Go to Settings
  3. Enter the server URL and credentials above
  4. Click "Connect"
  5. Browse and play media from the library
  
  The app does not collect any user data and all communication is directly 
  between the app and the user's configured servers.
  ```

## 8. Content Rights & Export Compliance

- [ ] **Content Rights**: Confirm you have rights to distribute
  - You're only providing a client app, not content
  - Users provide their own servers and content

- [ ] **Export Compliance**:
  - Does your app use encryption? YES (HTTPS)
  - Is it standard encryption? YES
  - Select "No" for custom encryption implementation
  - You may need to submit annual self-classification

- [ ] **Advertising Identifier**: NO (we don't use ads)

## 9. Age Rating

Complete the age rating questionnaire:
- [ ] No objectionable content (unless your users' media contains it)
- [ ] Recommended: 12+ (to account for potential user content)
- [ ] Gambling: None
- [ ] Horror/Fear themes: Infrequent/Mild
- [ ] Mature/Suggestive themes: Infrequent/Mild

## 10. Pricing & Availability

- [ ] Price: Free
- [ ] Availability: All countries (or select specific countries)
- [ ] Release: Manually release OR Automatically release after approval

## 11. Build & Upload

### Option A: Using Xcode (Recommended)

**For tvOS:**
```bash
# 1. Open workspace
open ios/mediora.xcworkspace

# 2. In Xcode:
#    - Select "Any tvOS Device (arm64)" scheme
#    - Product → Archive
#    - Wait for archive to complete
#    - Click "Distribute App"
#    - Select "App Store Connect"
#    - Follow prompts to upload

# 3. Build for iOS:
#    - Select "Any iOS Device (arm64)" scheme
#    - Select mediora-mobile scheme
#    - Product → Archive
#    - Distribute to App Store Connect

# 4. Build for macOS (Catalyst):
#    - Select "My Mac (Mac Catalyst)" scheme
#    - Product → Archive
#    - Distribute to App Store Connect
```

### Option B: Using Fastlane (Advanced)

```bash
# Install fastlane
sudo gem install fastlane

# Initialize fastlane (first time only)
cd ios
fastlane init

# Upload to TestFlight
fastlane beta

# Upload to App Store
fastlane release
```

## 12. TestFlight Beta Testing (Highly Recommended)

Before submitting for review:

- [ ] Upload build to App Store Connect
- [ ] Add internal testers (up to 100)
- [ ] Add external testers (beta testing)
- [ ] Test on real devices (not just simulator)
- [ ] Collect feedback
- [ ] Fix critical bugs
- [ ] Upload new build if needed

## 13. Final Pre-Submission Checklist

### Code Quality
- [ ] No compiler warnings
- [ ] No linting errors (already fixed ✓)
- [ ] All features working on all platforms
- [ ] Tested on physical devices

### Compliance
- [ ] Privacy Policy URL added
- [ ] No hardcoded credentials or API keys in code
- [ ] NSAllowsArbitraryLoads removed (already fixed ✓)
- [ ] All required app icons present

### Testing
- [ ] App launches without crashing
- [ ] Can connect to Jellyfin server
- [ ] Can browse media
- [ ] Can play media
- [ ] Navigation works with TV remote (tvOS)
- [ ] Works on iPhone, iPad, Apple TV, and Mac

### Metadata
- [ ] All screenshots uploaded
- [ ] Description is accurate
- [ ] Keywords added
- [ ] Support URL works
- [ ] Privacy policy accessible

## 14. Submit for Review

In App Store Connect:

- [ ] Select your build for each platform
- [ ] Review all information one last time
- [ ] Click "Submit for Review"
- [ ] Wait for Apple's review (typically 1-3 days)

## 15. After Submission

### If Approved ✅
- [ ] Celebrate! 🎉
- [ ] Share on social media
- [ ] Monitor reviews
- [ ] Plan updates

### If Rejected ❌
- [ ] Read rejection reason carefully
- [ ] Fix the issues mentioned
- [ ] Respond in Resolution Center if needed
- [ ] Resubmit

## Common Rejection Reasons

1. **Missing demo account** - Always provide working credentials
2. **App crashes** - Test thoroughly on real devices
3. **Incomplete metadata** - Fill all required fields
4. **Privacy policy missing** - Must be accessible via URL
5. **Using private APIs** - React Native should avoid this
6. **Misleading description** - Be accurate about features
7. **Broken links** - Test all URLs before submission

## Post-Launch Maintenance

- [ ] Set up App Analytics in App Store Connect
- [ ] Monitor crash reports
- [ ] Respond to user reviews
- [ ] Plan version 1.1 with user feedback
- [ ] Keep dependencies updated

## Resources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Human Interface Guidelines - tvOS](https://developer.apple.com/design/human-interface-guidelines/tvos)
- [Human Interface Guidelines - iOS](https://developer.apple.com/design/human-interface-guidelines/ios)
- [React Native tvOS Documentation](https://github.com/react-native-tvos/react-native-tvos)

## Next Steps

1. **TODAY**: Join Apple Developer Program
2. **TODAY**: Start designing app icons
3. **THIS WEEK**: Set up demo Jellyfin server for reviewers
4. **THIS WEEK**: Create screenshots and metadata
5. **NEXT WEEK**: Submit to TestFlight
6. **IN 2 WEEKS**: Submit for App Store review

---

**Need Help?**

- React Native tvOS: https://github.com/react-native-tvos/react-native-tvos/issues
- Apple Developer Forums: https://developer.apple.com/forums/
- Stack Overflow: [react-native-tvos] tag

Good luck with your submission! 🚀
