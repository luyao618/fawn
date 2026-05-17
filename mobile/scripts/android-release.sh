#!/usr/bin/env bash
# Build a signed release APK locally via Gradle.
#
# Signing credentials are passed through env vars (see mobile/.env.example):
#   FAWN_ANDROID_KEYSTORE_PATH    absolute or repo-relative path to .jks/.keystore
#   FAWN_ANDROID_KEYSTORE_PASSWORD
#   FAWN_ANDROID_KEY_ALIAS
#   FAWN_ANDROID_KEY_PASSWORD
#
# These are forwarded to Gradle as project properties (-P) under the names
# RELEASE_STORE_FILE / RELEASE_STORE_PASSWORD / RELEASE_KEY_ALIAS /
# RELEASE_KEY_PASSWORD, which the Expo-generated android/app/build.gradle
# picks up via its standard signingConfigs.release block (when present).
#
# If the prebuild output doesn't already wire those properties into a
# signingConfigs.release block, the script also writes a minimal
# `android/keystore.properties` file consumed by an injected build.gradle
# patch — see docs/android-native-build.md for the one-time setup.
#
# Output: mobile/android/app/build/outputs/apk/release/app-release.apk

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/android-common.sh"

load_env_file

require_env FAWN_ANDROID_KEYSTORE_PATH
require_env FAWN_ANDROID_KEYSTORE_PASSWORD
require_env FAWN_ANDROID_KEY_ALIAS
require_env FAWN_ANDROID_KEY_PASSWORD

# Resolve keystore path to absolute so Gradle finds it regardless of cwd.
if [[ "$FAWN_ANDROID_KEYSTORE_PATH" = /* ]]; then
  KEYSTORE_ABS="$FAWN_ANDROID_KEYSTORE_PATH"
else
  KEYSTORE_ABS="$MOBILE_DIR/$FAWN_ANDROID_KEYSTORE_PATH"
fi

if [ ! -f "$KEYSTORE_ABS" ]; then
  echo "[android] keystore not found: $KEYSTORE_ABS" >&2
  echo "[android] see docs/android-native-build.md for how to generate one" >&2
  exit 1
fi

ensure_prebuild

# Drop a keystore.properties next to android/ so the optional gradle hook
# (see docs) can pick it up. The file is git-ignored.
cat > "$ANDROID_DIR/keystore.properties" <<EOF
storeFile=$KEYSTORE_ABS
storePassword=$FAWN_ANDROID_KEYSTORE_PASSWORD
keyAlias=$FAWN_ANDROID_KEY_ALIAS
keyPassword=$FAWN_ANDROID_KEY_PASSWORD
EOF
chmod 600 "$ANDROID_DIR/keystore.properties"

cd "$ANDROID_DIR"
echo "[android] running ./gradlew assembleRelease"
./gradlew assembleRelease \
  -PRELEASE_STORE_FILE="$KEYSTORE_ABS" \
  -PRELEASE_STORE_PASSWORD="$FAWN_ANDROID_KEYSTORE_PASSWORD" \
  -PRELEASE_KEY_ALIAS="$FAWN_ANDROID_KEY_ALIAS" \
  -PRELEASE_KEY_PASSWORD="$FAWN_ANDROID_KEY_PASSWORD"

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK" ]; then
  echo ""
  echo "[android] release APK ready: $APK"
else
  echo "[android] WARNING: expected APK not found at $APK" >&2
  echo "[android] check android/app/build/outputs/apk/release/ for variants" >&2
  exit 1
fi
