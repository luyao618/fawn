#!/usr/bin/env bash
# Build a debug APK and install it on the connected Android device via adb.
#
# Equivalent to `./gradlew installDebug`, but routed through our script so
# it also handles prebuild and prints the resolved APK path.
#
# Usage: from mobile/, run `npm run android:install`.

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/android-common.sh"

ensure_prebuild

cd "$ANDROID_DIR"

if ! command -v adb >/dev/null 2>&1; then
  echo "[android] adb not on PATH — install Android platform-tools or export ANDROID_HOME" >&2
  exit 1
fi

DEVICE_COUNT=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l | tr -d ' ')
if [ "$DEVICE_COUNT" = "0" ]; then
  echo "[android] no adb devices found — connect your Vivo X90 with USB debugging enabled" >&2
  exit 1
fi

echo "[android] running ./gradlew installDebug"
./gradlew installDebug

echo ""
echo "[android] installed com.luyao618.fawn on device(s):"
adb devices | awk 'NR>1 && $2=="device" {print "  - "$1}'
