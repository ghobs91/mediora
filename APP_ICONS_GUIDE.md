# App Icon Requirements for Mediora

## Overview
All app icons are stored in `/ios/mediora/Images.xcassets/AppIcon.appiconset/`

## Required Icons by Platform

### iOS (iPhone/iPad)
Place these PNG files in the AppIcon.appiconset folder:

- **iPhone Notifications**
  - `Icon-20@2x.png` - 40x40px
  - `Icon-20@3x.png` - 60x60px

- **iPhone Settings**
  - `Icon-29@2x.png` - 58x58px
  - `Icon-29@3x.png` - 87x87px

- **iPhone Spotlight**
  - `Icon-40@2x.png` - 80x80px
  - `Icon-40@3x.png` - 120x120px

- **iPhone App**
  - `Icon-60@2x.png` - 120x120px
  - `Icon-60@3x.png` - 180x180px

- **iPad Notifications**
  - `Icon-20.png` - 20x20px
  - `Icon-20@2x.png` - 40x40px (same as iPhone)

- **iPad Settings**
  - `Icon-29.png` - 29x29px
  - `Icon-29@2x.png` - 58x58px (same as iPhone)

- **iPad Spotlight**
  - `Icon-40.png` - 40x40px
  - `Icon-40@2x.png` - 80x80px (same as iPhone)

- **iPad App**
  - `Icon-76.png` - 76x76px
  - `Icon-76@2x.png` - 152x152px
  - `Icon-83.5@2x.png` - 167x167px (iPad Pro)

- **App Store**
  - `Icon-1024.png` - 1024x1024px (no alpha channel, flatten to RGB)

### tvOS (Apple TV)
Apple TV uses layered icons for a parallax effect. Create these layers:

**App Icon Layers** (each layer separate):
- **Front Layer** - `AppIcon-tvOS-Front.png` - 1280x768px
- **Middle Layer** - `AppIcon-tvOS-Middle.png` - 1280x768px  
- **Back Layer** - `AppIcon-tvOS-Back.png` - 1280x768px

**Single Icons** (for older tvOS or fallback):
- `AppIcon-tvOS-1x.png` - 400x240px
- `AppIcon-tvOS-2x.png` - 800x480px

**Top Shelf Image** (shown when app is focused on home screen):
- `TopShelf.png` - 1920x720px
- `TopShelf@2x.png` - 3840x1440px

**Top Shelf Image (Wide)**:
- `TopShelf-Wide.png` - 2320x720px
- `TopShelf-Wide@2x.png` - 4640x1440px

### macOS (Mac Catalyst)
- `Icon-mac-16.png` - 16x16px
- `Icon-mac-16@2x.png` - 32x32px
- `Icon-mac-32.png` - 32x32px
- `Icon-mac-32@2x.png` - 64x64px
- `Icon-mac-128.png` - 128x128px
- `Icon-mac-128@2x.png` - 256x256px
- `Icon-mac-256.png` - 256x256px
- `Icon-mac-256@2x.png` - 512x512px
- `Icon-mac-512.png` - 512x512px
- `Icon-mac-512@2x.png` - 1024x1024px

## Design Guidelines

### General Requirements
- **Format**: PNG
- **Color Space**: sRGB or P3
- **Alpha Channel**: Supported (except App Store 1024x1024 icon)
- **Shape**: Square with rounded corners (iOS applies corner radius automatically)
- **No gradients or glows** in the shape itself - keep edges clean

### iOS Icon Design
- Design as a **square** - iOS will mask to rounded square automatically
- Fill the entire square - no transparent borders
- Avoid placing important elements in corners (they get clipped)
- Test in both light and dark mode

### tvOS Icon Design
- **Must use layered images** for modern tvOS (15.0+)
- Layers create parallax effect when focused
- Each layer should be a separate design element:
  - **Back Layer**: Background/atmosphere
  - **Middle Layer**: Main logo/brand
  - **Front Layer**: Accent elements/highlights
- Layers are slightly offset when tilting remote
- Keep important content centered
- PNG with transparency for front/middle layers

### macOS Icon Design
- Use full **1024x1024** master and downscale
- macOS shows more detail than iOS
- Can have depth/3D effects
- Consider both light and dark menu bar

## Tools for Icon Generation

### Recommended Tools
1. **IconKitchen** (https://icon.kitchen) - Free online generator
2. **Figma** - Professional design tool with export presets
3. **Sketch** - macOS design app with icon templates
4. **IconGenerator** - VS Code extension or CLI tool

### Quick Generation
If you have a single 1024x1024 master icon:

```bash
# Install imagemagick (if not already installed)
brew install imagemagick

# Generate all iOS sizes
magick master-icon.png -resize 40x40 Icon-20@2x.png
magick master-icon.png -resize 60x60 Icon-20@3x.png
magick master-icon.png -resize 58x58 Icon-29@2x.png
magick master-icon.png -resize 87x87 Icon-29@3x.png
magick master-icon.png -resize 80x80 Icon-40@2x.png
magick master-icon.png -resize 120x120 Icon-40@3x.png
magick master-icon.png -resize 120x120 Icon-60@2x.png
magick master-icon.png -resize 180x180 Icon-60@3x.png
magick master-icon.png -resize 1024x1024 Icon-1024.png
```

## Update Contents.json

After adding icons, update `/ios/mediora/Images.xcassets/AppIcon.appiconset/Contents.json`:

```json
{
  "images" : [
    {
      "filename" : "Icon-20@2x.png",
      "idiom" : "iphone",
      "scale" : "2x",
      "size" : "20x20"
    },
    {
      "filename" : "Icon-20@3x.png",
      "idiom" : "iphone",
      "scale" : "3x",
      "size" : "20x20"
    },
    ...
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

## Checklist

- [ ] Design 1024x1024 master icon
- [ ] Generate all iOS sizes (iPhone + iPad)
- [ ] Create tvOS layered icons (Front, Middle, Back)
- [ ] Create tvOS Top Shelf images
- [ ] Generate macOS sizes for Catalyst
- [ ] Update Contents.json with all filenames
- [ ] Test icons on real devices
- [ ] Verify 1024x1024 has NO alpha channel
- [ ] Check dark mode appearance
- [ ] Submit to App Store Connect

## Testing

1. Build and run on each platform
2. Check icon in:
   - Home screen
   - Settings
   - Spotlight search
   - App Switcher
   - Notifications (iOS)
3. Test focus/parallax effect on tvOS
4. Verify in different lighting modes

## Common Issues

**Icon not appearing**: Make sure Contents.json references correct filenames
**Blurry icons**: Verify you're using @2x/@3x properly
**App Store rejection**: 1024x1024 must not have alpha channel
**tvOS no parallax**: Must provide layered images, not single icon
