#!/bin/bash

echo "🔍 Verifying iCloud Sync Implementation..."
echo ""

# Check if Swift files exist
echo "✓ Checking Swift native module files..."
if [ -f "ios/mediora/ICloudSyncModule.swift" ]; then
    echo "  ✅ ICloudSyncModule.swift exists"
else
    echo "  ❌ ICloudSyncModule.swift NOT FOUND"
fi

if [ -f "ios/mediora/ICloudSyncModule.m" ]; then
    echo "  ✅ ICloudSyncModule.m exists"
else
    echo "  ❌ ICloudSyncModule.m NOT FOUND"
fi

if [ -f "ios/mediora/mediora-Bridging-Header.h" ]; then
    echo "  ✅ mediora-Bridging-Header.h exists"
else
    echo "  ❌ mediora-Bridging-Header.h NOT FOUND"
fi

echo ""

# Check if entitlements file exists
echo "✓ Checking entitlements file..."
if [ -f "ios/mediora/mediora.entitlements" ]; then
    echo "  ✅ mediora.entitlements exists"
else
    echo "  ❌ mediora.entitlements NOT FOUND"
fi

echo ""

# Check if TypeScript service exists
echo "✓ Checking TypeScript service..."
if [ -f "src/services/icloud.ts" ]; then
    echo "  ✅ icloud.ts service exists"
else
    echo "  ❌ icloud.ts service NOT FOUND"
fi

echo ""

# Check if SettingsContext is updated
echo "✓ Checking SettingsContext updates..."
if grep -q "iCloudService" "src/context/SettingsContext.tsx"; then
    echo "  ✅ SettingsContext has iCloud integration"
else
    echo "  ❌ SettingsContext NOT updated"
fi

echo ""
echo "================================================"
echo ""
echo "📋 MANUAL STEPS REQUIRED IN XCODE:"
echo ""
echo "1. Add Swift files to Xcode project:"
echo "   - Open ios/mediora.xcworkspace in Xcode"
echo "   - Add ICloudSyncModule.swift, ICloudSyncModule.m, and bridging header"
echo "   - Ensure BOTH targets are selected (mediora and mediora-mobile)"
echo ""
echo "2. Configure bridging header:"
echo "   - Build Settings → Objective-C Bridging Header"
echo "   - Set to: mediora/mediora-Bridging-Header.h"
echo ""
echo "3. Add iCloud capability:"
echo "   - Signing & Capabilities → + Capability → iCloud"
echo "   - Enable 'Key-value storage'"
echo ""
echo "4. Set entitlements file:"
echo "   - Build Settings → Code Signing Entitlements"
echo "   - Set to: mediora/mediora.entitlements"
echo ""
echo "📖 See ICLOUD_SYNC_SETUP.md for detailed instructions"
echo ""
