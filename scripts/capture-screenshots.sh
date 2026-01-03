#!/bin/bash

# Capture screenshots for App Store submission
# This script helps automate screenshot capture from simulators

set -e

SCREENSHOT_DIR="fastlane/screenshots/en-US"
mkdir -p "$SCREENSHOT_DIR"

echo "📸 Screenshot Capture Helper for Mediora"
echo ""

# Check if xcrun is available
if ! command -v xcrun &> /dev/null; then
    echo "❌ xcrun not found. Please install Xcode command line tools."
    exit 1
fi

# Function to capture simulator screenshot
capture_screenshot() {
    local DEVICE_TYPE=$1
    local SCREENSHOT_NAME=$2
    
    echo "Capturing: $SCREENSHOT_NAME for $DEVICE_TYPE"
    
    # Get the booted device UDID
    DEVICE_UDID=$(xcrun simctl list devices booted -j | grep -o '"udid" : "[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$DEVICE_UDID" ]; then
        echo "  ⚠️  No simulator running. Please boot a simulator first."
        return 1
    fi
    
    xcrun simctl io "$DEVICE_UDID" screenshot "$SCREENSHOT_DIR/$SCREENSHOT_NAME"
    echo "  ✓ Saved: $SCREENSHOT_DIR/$SCREENSHOT_NAME"
}

# Interactive screenshot capture
echo "📺 tvOS Screenshot Capture"
echo ""
echo "This script will help you capture screenshots for App Store submission."
echo ""
echo "Instructions:"
echo "1. Start the Apple TV simulator: npx react-native run-ios --simulator 'Apple TV'"
echo "2. Navigate to each screen in the app"
echo "3. Press Enter when ready to capture each screenshot"
echo ""

# List of screenshots to capture
SCREENSHOTS=(
    "Apple TV-01-Home.png:Home screen with media library"
    "Apple TV-02-Browse.png:Library or browse screen"
    "Apple TV-03-Details.png:Media details screen"
    "Apple TV-04-Player.png:Video player in action"
    "Apple TV-05-Search.png:Search results"
)

for SCREEN in "${SCREENSHOTS[@]}"; do
    NAME="${SCREEN%%:*}"
    DESC="${SCREEN##*:}"
    
    echo ""
    echo "📌 Next: $DESC"
    echo "   Navigate to this screen in the app, then press Enter..."
    read -r
    
    capture_screenshot "Apple TV" "$NAME"
done

echo ""
echo "✅ Screenshot capture complete!"
echo ""
echo "Screenshots saved to: $SCREENSHOT_DIR"
echo ""
echo "📋 Next steps:"
echo "   1. Review screenshots in Finder"
echo "   2. Edit/crop if needed"
echo "   3. Upload to App Store Connect or use 'fastlane deliver'"
