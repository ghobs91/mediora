#!/bin/sh
#
# Compatibility wrapper.
#
# Xcode Cloud looks for custom build scripts next to the workspace file
# (ios/ci_scripts/) when the Xcode project lives in a subfolder of the
# repository. The real script lives there; keep this root-level copy so the
# default repo-root location also works.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "${SCRIPT_DIR%/ci_scripts}/ios/ci_scripts/ci_post_clone.sh" "$@"
