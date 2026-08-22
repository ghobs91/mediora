#!/bin/sh
#
# Xcode Cloud post-clone setup for Mediora.
#
# The repository does not track ios/Pods (gitignored), and Xcode Cloud does
# not run `pod install` automatically, so the build fails with:
#   "Unable to open base configuration reference file
#    .../Pods/Target Support Files/Pods-mediora-mobile/...xcconfig"
# This script installs Node, npm dependencies, CocoaPods, and the Pods
# before the xcodebuild step runs.
#
# Order matters: the Podfile requires `node` to evaluate, and
# `use_native_modules!` + post_install patches need node_modules present.
#
set -e

echo "=== Mediora ci_post_clone.sh starting ==="

# ── 1. Node.js (needed by the Podfile and the JS bundle build phase) ──────
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 20 via Homebrew..."
  HOMEBREW_NO_AUTO_UPDATE=1 brew install node@20
fi

# node@20 is keg-only; put it on PATH for this and subsequent steps.
if [ -d "/opt/homebrew/opt/node@20/bin" ]; then
  export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
elif [ -d "/usr/local/opt/node@20/bin" ]; then
  export PATH="/usr/local/opt/node@20/bin:$PATH"
fi

NODE_BIN="$(command -v node)"
echo "Node: $($NODE_BIN --version) at $NODE_BIN"

# Xcode build phases run with a minimal PATH and may not see the Homebrew
# node. Write the resolved binary into the local Xcode environment file
# (which is gitignored) so React Native's "Bundle React Native code and
# images" phase uses it directly.
XCODE_ENV_LOCAL="${CI_PRIMARY_REPOSITORY_PATH:-.}/ios/.xcode.env.local"
echo "export NODE_BINARY=\"$NODE_BIN\"" > "$XCODE_ENV_LOCAL"
echo "Wrote NODE_BINARY=$NODE_BIN to $XCODE_ENV_LOCAL"

# Also try to make node available globally; this is best-effort because
# /usr/local/bin may not be writable on Xcode Cloud runners.
if [ ! -e "/usr/local/bin/node" ]; then
  echo "Symlinking node into /usr/local/bin (best-effort)..."
  mkdir -p /usr/local/bin 2>/dev/null || true
  ln -s "$NODE_BIN" /usr/local/bin/node 2>/dev/null || true
fi
if [ ! -e "/usr/local/bin/npm" ] && command -v npm >/dev/null 2>&1; then
  ln -s "$(command -v npm)" /usr/local/bin/npm 2>/dev/null || true
fi
export NODE_BINARY="$NODE_BIN"

# ── 2. npm dependencies (postinstall runs patch-package) ──────────────────
cd "${CI_PRIMARY_REPOSITORY_PATH:-.}"
echo "Installing npm dependencies..."
npm ci --no-audit --no-fund

# ── 3. CocoaPods ──────────────────────────────────────────────────────────
if ! command -v pod >/dev/null 2>&1; then
  echo "Installing CocoaPods via Homebrew..."
  HOMEBREW_NO_AUTO_UPDATE=1 brew install cocoapods
fi
echo "CocoaPods: $(pod --version)"

# ── 4. Pods (both the tvOS `mediora` and iOS/Catalyst `mediora-mobile`
#       targets are covered by the single workspace) ───────────────────────
cd ios
echo "Running pod install..."
pod install

echo "=== Mediora ci_post_clone.sh complete ==="
