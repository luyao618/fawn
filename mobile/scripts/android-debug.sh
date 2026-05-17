#!/usr/bin/env bash
# Build a debug APK locally via Gradle (no EAS).
#
# Output: mobile/android/app/build/outputs/apk/debug/app-debug.apk
#
# Usage: from mobile/, run `npm run android:debug` (or this script directly).

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/android-common.sh"

ensure_prebuild

cd "$ANDROID_DIR"
echo "[android] running ./gradlew assembleDebug"
./gradlew assembleDebug

APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  echo ""
  echo "[android] debug APK ready: $APK"
else
  echo "[android] WARNING: expected APK not found at $APK" >&2
  exit 1
fi
