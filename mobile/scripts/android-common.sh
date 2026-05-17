#!/usr/bin/env bash
# Shared helpers for the local Android build scripts.
#
# All Android build scripts assume:
#   - You are running from `mobile/`.
#   - `node_modules/` is installed (run `npm install` first).
#   - The Expo CLI is available via `npx`.
#   - Android SDK / JDK env vars are exported (see docs/android-native-build.md).
#
# The `android/` directory is git-ignored and regenerated on demand via
# `expo prebuild` (Expo prebuild workflow). Scripts will run prebuild if the
# directory is missing.

set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$MOBILE_DIR/android"

ensure_prebuild() {
  cd "$MOBILE_DIR"
  if [ ! -d "$ANDROID_DIR" ]; then
    echo "[android] android/ not found, running 'expo prebuild --platform android --no-install'..."
    npx expo prebuild --platform android --no-install
  else
    echo "[android] reusing existing android/ (delete it to regenerate from app.json)"
  fi
}

# Load mobile/.env if it exists. This is where developers put their personal
# FAWN_ANDROID_* keystore values. The file itself is git-ignored.
load_env_file() {
  if [ -f "$MOBILE_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$MOBILE_DIR/.env"
    set +a
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "[android] missing required env var: $name" >&2
    echo "[android] see mobile/.env.example and docs/android-native-build.md" >&2
    exit 1
  fi
}
