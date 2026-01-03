#!/bin/bash

# Generate all app icons from source image for App Store submission
# Run from project root: ./scripts/generate-all-icons.sh

set -e

SOURCE_ICON="${1:-ios/mediora/Images.xcassets/NewAppIcon.appiconset/media-icon-large.png}"
ASSETS_DIR="ios/mediora/Images.xcassets"

echo "🎨 Generating all app icons for App Store submission..."
echo "Source: $SOURCE_ICON"

# Check if source exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "❌ Source icon not found: $SOURCE_ICON"
    echo "Usage: $0 [path-to-source-icon.png]"
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "❌ ImageMagick not found. Install with: brew install imagemagick"
    exit 1
fi

# ============================================
# iOS App Store Icon (1024x1024 NO ALPHA)
# ============================================
echo ""
echo "📱 Generating iOS App Store icon (1024x1024, no alpha)..."

IOS_APPICON_DIR="$ASSETS_DIR/AppIcon.appiconset"
mkdir -p "$IOS_APPICON_DIR"

# Generate 1024x1024 icon WITHOUT alpha channel (required for App Store)
magick "$SOURCE_ICON" -resize 1024x1024 -background '#1a1a2e' -flatten -alpha off "$IOS_APPICON_DIR/Icon-1024.png"
echo "  ✓ Generated Icon-1024.png (1024x1024, no alpha)"

# Update Contents.json for iOS
cat > "$IOS_APPICON_DIR/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "Icon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

echo "  ✓ Updated Contents.json"

# ============================================
# tvOS Icons (run the existing script)
# ============================================
echo ""
echo "📺 Generating tvOS icons..."

if [ -f "scripts/generate-tvos-icons.sh" ]; then
    ./scripts/generate-tvos-icons.sh "$SOURCE_ICON"
else
    echo "  ⚠️  tvOS icon script not found, skipping..."
fi

# ============================================
# Verification
# ============================================
echo ""
echo "🔍 Verifying generated icons..."

# Check iOS icon has no alpha
if magick identify "$IOS_APPICON_DIR/Icon-1024.png" 2>/dev/null | grep -q "RGBA"; then
    echo "  ⚠️  Warning: iOS icon still has alpha channel"
else
    echo "  ✓ iOS icon verified (no alpha)"
fi

# Check iOS icon dimensions
DIMS=$(magick identify -format "%wx%h" "$IOS_APPICON_DIR/Icon-1024.png" 2>/dev/null)
if [ "$DIMS" = "1024x1024" ]; then
    echo "  ✓ iOS icon dimensions correct (1024x1024)"
else
    echo "  ⚠️  Warning: iOS icon dimensions: $DIMS (expected 1024x1024)"
fi

# Check tvOS icons exist
if [ -f "$ASSETS_DIR/App Icon & Top Shelf Image.brandassets/App Icon - App Store.imagestack/Back.imagestacklayer/Content.imageset/icon-back.png" ]; then
    echo "  ✓ tvOS App Store icon exists"
else
    echo "  ⚠️  Warning: tvOS App Store icon missing"
fi

if [ -f "$ASSETS_DIR/App Icon & Top Shelf Image.brandassets/Top Shelf Image.imageset/top-shelf.png" ]; then
    echo "  ✓ tvOS Top Shelf image exists"
else
    echo "  ⚠️  Warning: tvOS Top Shelf image missing"
fi

echo ""
echo "✅ Icon generation complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Open Xcode and verify icons appear correctly"
echo "   2. Build the app to ensure no icon warnings"
echo "   3. Run 'Product > Archive' to create the submission build"
