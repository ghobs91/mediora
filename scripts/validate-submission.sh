#!/bin/bash

# Pre-submission validation for App Store
# Run before submitting to catch common issues

set -e

echo "🔍 Mediora App Store Pre-Submission Validation"
echo "================================================"
echo ""

ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# ============================================
# 1. Check Icons
# ============================================
echo "📱 Checking App Icons..."

# iOS 1024x1024 icon
if [ -f "ios/mediora/Images.xcassets/AppIcon.appiconset/Icon-1024.png" ]; then
    # Check dimensions
    DIMS=$(magick identify -format "%wx%h" "ios/mediora/Images.xcassets/AppIcon.appiconset/Icon-1024.png" 2>/dev/null || echo "unknown")
    if [ "$DIMS" = "1024x1024" ]; then
        success "iOS App Store icon exists (1024x1024)"
    else
        error "iOS App Store icon has wrong dimensions: $DIMS (expected 1024x1024)"
    fi
    
    # Check for alpha channel
    if magick identify "ios/mediora/Images.xcassets/AppIcon.appiconset/Icon-1024.png" 2>/dev/null | grep -q "RGBA"; then
        error "iOS App Store icon has alpha channel (will be rejected)"
    else
        success "iOS App Store icon has no alpha channel"
    fi
else
    error "iOS App Store icon missing (Icon-1024.png)"
fi

# tvOS icons
if [ -f "ios/mediora/Images.xcassets/App Icon & Top Shelf Image.brandassets/App Icon - App Store.imagestack/Back.imagestacklayer/Content.imageset/icon-back.png" ]; then
    success "tvOS App Store icon exists"
else
    error "tvOS App Store icon missing"
fi

if [ -f "ios/mediora/Images.xcassets/App Icon & Top Shelf Image.brandassets/Top Shelf Image.imageset/top-shelf.png" ]; then
    success "tvOS Top Shelf image exists"
else
    error "tvOS Top Shelf image missing"
fi

# ============================================
# 2. Check Info.plist
# ============================================
echo ""
echo "📋 Checking Info.plist..."

INFO_PLIST="ios/mediora/Info.plist"

if grep -q "ITSAppUsesNonExemptEncryption" "$INFO_PLIST"; then
    success "Export compliance key present"
else
    error "Missing ITSAppUsesNonExemptEncryption key in Info.plist"
fi

if grep -q "NSAllowsArbitraryLoads" "$INFO_PLIST"; then
    error "NSAllowsArbitraryLoads is present (security risk, may cause rejection)"
else
    success "No insecure network settings"
fi

if grep -q "CFBundleDisplayName" "$INFO_PLIST"; then
    success "Display name is set"
else
    warning "CFBundleDisplayName not explicitly set"
fi

# ============================================
# 3. Check Bundle Identifier
# ============================================
echo ""
echo "🏷️  Checking Bundle Identifier..."

if grep -q "com.mediora.app" "ios/mediora.xcodeproj/project.pbxproj"; then
    success "Bundle identifier configured"
else
    warning "Bundle identifier may need verification"
fi

# ============================================
# 4. Check Version Numbers
# ============================================
echo ""
echo "🔢 Checking Version Numbers..."

VERSION=$(grep "MARKETING_VERSION = " "ios/mediora.xcodeproj/project.pbxproj" | head -1 | sed 's/.*= //' | tr -d '[:space:];')
BUILD=$(grep "CURRENT_PROJECT_VERSION = " "ios/mediora.xcodeproj/project.pbxproj" | head -1 | sed 's/.*= //' | tr -d '[:space:];')

if [ -n "$VERSION" ]; then
    success "Marketing version: $VERSION"
else
    warning "Could not determine marketing version"
fi

if [ -n "$BUILD" ]; then
    success "Build number: $BUILD"
else
    warning "Could not determine build number"
fi

# ============================================
# 5. Check Privacy Policy
# ============================================
echo ""
echo "🔒 Checking Privacy Policy..."

if [ -f "PRIVACY_POLICY.md" ]; then
    success "Privacy policy exists"
else
    error "Privacy policy missing (PRIVACY_POLICY.md)"
fi

# ============================================
# 6. Check Fastlane Metadata
# ============================================
echo ""
echo "📝 Checking App Store Metadata..."

if [ -f "fastlane/metadata/en-US/description.txt" ]; then
    success "App description exists"
else
    error "App description missing"
fi

if [ -f "fastlane/metadata/en-US/keywords.txt" ]; then
    KEYWORDS=$(cat "fastlane/metadata/en-US/keywords.txt")
    KEYWORD_LENGTH=${#KEYWORDS}
    if [ $KEYWORD_LENGTH -le 100 ]; then
        success "Keywords valid ($KEYWORD_LENGTH/100 chars)"
    else
        error "Keywords too long ($KEYWORD_LENGTH/100 chars)"
    fi
else
    error "Keywords missing"
fi

if [ -f "fastlane/metadata/en-US/release_notes.txt" ]; then
    success "Release notes exist"
else
    warning "Release notes missing"
fi

# ============================================
# 7. Check Screenshots
# ============================================
echo ""
echo "📸 Checking Screenshots..."

SCREENSHOT_DIR="fastlane/screenshots/en-US"
if [ -d "$SCREENSHOT_DIR" ]; then
    SCREENSHOT_COUNT=$(find "$SCREENSHOT_DIR" -name "*.png" -o -name "*.jpg" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$SCREENSHOT_COUNT" -ge 3 ]; then
        success "Found $SCREENSHOT_COUNT screenshots"
    elif [ "$SCREENSHOT_COUNT" -gt 0 ]; then
        warning "Only $SCREENSHOT_COUNT screenshots found (recommend 5+)"
    else
        warning "No screenshots found in $SCREENSHOT_DIR"
    fi
else
    warning "Screenshot directory not found"
fi

# ============================================
# 8. Check for Common Issues
# ============================================
echo ""
echo "🔧 Checking for Common Issues..."

# Check for console.log statements
LOG_COUNT=$(grep -r "console.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 10 ]; then
    warning "Found $LOG_COUNT console.log statements (consider removing for production)"
else
    success "Minimal console.log usage"
fi

# Check for TODO/FIXME
TODO_COUNT=$(grep -rE "TODO|FIXME" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -gt 0 ]; then
    warning "Found $TODO_COUNT TODO/FIXME comments"
else
    success "No TODO/FIXME comments"
fi

# Check node_modules
if [ -d "node_modules" ]; then
    success "node_modules installed"
else
    error "node_modules not installed (run npm install)"
fi

# Check Pods
if [ -d "ios/Pods" ]; then
    success "CocoaPods installed"
else
    error "CocoaPods not installed (run cd ios && pod install)"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "================================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready for submission.${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warnings found. Review before submission.${NC}"
else
    echo -e "${RED}❌ $ERRORS errors and $WARNINGS warnings found.${NC}"
    echo "Please fix errors before submitting to App Store."
fi
echo ""

exit $ERRORS
