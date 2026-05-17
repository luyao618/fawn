#!/usr/bin/env bash
# Build a signed release APK locally via Gradle.
#
# Signing credentials are passed through env vars (see mobile/.env.example):
#   FAWN_ANDROID_KEYSTORE_PATH    absolute or repo-relative path to .jks/.keystore
#   FAWN_ANDROID_KEYSTORE_PASSWORD
#   FAWN_ANDROID_KEY_ALIAS
#   FAWN_ANDROID_KEY_PASSWORD
#
# Wiring: mobile/plugins/withAndroidReleaseSigning.js (an Expo config plugin
# registered in app.json) patches the generated android/app/build.gradle every
# prebuild so the release buildType reads its signing config from
# android/keystore.properties. This script writes that file from the env vars
# above (it is git-ignored). Secrets are NOT passed on the Gradle CLI, so they
# do not appear in `ps`.
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

# Write the keystore.properties consumed by the config-plugin patch in
# android/app/build.gradle. The file is git-ignored.
umask 077
cat > "$ANDROID_DIR/keystore.properties" <<EOF
storeFile=$KEYSTORE_ABS
storePassword=$FAWN_ANDROID_KEYSTORE_PASSWORD
keyAlias=$FAWN_ANDROID_KEY_ALIAS
keyPassword=$FAWN_ANDROID_KEY_PASSWORD
EOF

cd "$ANDROID_DIR"
echo "[android] running ./gradlew assembleRelease"
./gradlew assembleRelease

APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  echo "[android] WARNING: expected APK not found at $APK" >&2
  echo "[android] check android/app/build/outputs/apk/release/ for variants" >&2
  exit 1
fi

echo ""
echo "[android] release APK ready: $APK"

# --- Verify the APK was signed with FAWN_ANDROID_* keystore ----------------
# Compute the SHA-256 of the certificate that signs the APK and compare it to
# the SHA-256 of FAWN_ANDROID_KEY_ALIAS in our keystore. If they don't match,
# the APK was signed with something else (e.g. Expo's default debug keystore)
# and the release flow is broken.

normalize_sha() {
  # Strip colons, spaces, lowercase. Reads from stdin.
  tr -d ': \t\r\n' | tr 'A-F' 'a-f'
}

extract_sha256() {
  # Pulls the "SHA-256:" hex from `keytool -printcert`/`apksigner` text output.
  awk -F': ' 'tolower($1) ~ /sha-?256/ {print $2; exit}'
}

# Pass the store password via env, not argv, so it does not show up in `ps`.
EXPECTED_SHA=$(
  FAWN_ANDROID_KEYSTORE_PASSWORD="$FAWN_ANDROID_KEYSTORE_PASSWORD" \
  keytool -list -v \
    -keystore "$KEYSTORE_ABS" \
    -alias "$FAWN_ANDROID_KEY_ALIAS" \
    -storepass:env FAWN_ANDROID_KEYSTORE_PASSWORD \
    2>/dev/null \
    | extract_sha256 \
    | normalize_sha
)
if [ -z "$EXPECTED_SHA" ]; then
  echo "[android] WARNING: could not read SHA-256 for alias $FAWN_ANDROID_KEY_ALIAS from keystore" >&2
  echo "[android] skipping signature verification" >&2
  exit 0
fi

APKSIGNER=""
if command -v apksigner >/dev/null 2>&1; then
  APKSIGNER="apksigner"
elif [ -n "${ANDROID_HOME:-}" ]; then
  # build-tools/<latest>/apksigner is the canonical location.
  CANDIDATE=$(ls -1 "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -n1 || true)
  if [ -n "$CANDIDATE" ] && [ -x "$CANDIDATE" ]; then
    APKSIGNER="$CANDIDATE"
  fi
fi

ACTUAL_SHA=""
if [ -n "$APKSIGNER" ]; then
  ACTUAL_SHA=$(
    "$APKSIGNER" verify --print-certs "$APK" 2>/dev/null \
      | extract_sha256 \
      | normalize_sha
  )
fi

if [ -z "$ACTUAL_SHA" ]; then
  # Fallback: unzip the signing cert and read it with keytool.
  TMPDIR_=$(mktemp -d)
  trap 'rm -rf "$TMPDIR_"' EXIT
  if unzip -p "$APK" 'META-INF/*.RSA' > "$TMPDIR_/cert.rsa" 2>/dev/null \
     && [ -s "$TMPDIR_/cert.rsa" ]; then
    ACTUAL_SHA=$(
      keytool -printcert -file "$TMPDIR_/cert.rsa" 2>/dev/null \
        | extract_sha256 \
        | normalize_sha
    )
  fi
fi

if [ -z "$ACTUAL_SHA" ]; then
  echo "[android] WARNING: could not extract signing cert SHA-256 from APK" >&2
  echo "[android] install Android build-tools to get 'apksigner' for verification" >&2
  exit 0
fi

if [ "$ACTUAL_SHA" = "$EXPECTED_SHA" ]; then
  echo "[android] signature OK — APK is signed with FAWN_ANDROID_KEY_ALIAS=$FAWN_ANDROID_KEY_ALIAS"
  echo "[android] cert SHA-256: $ACTUAL_SHA"
else
  echo "[android] ERROR: APK signing certificate does not match the configured keystore." >&2
  echo "[android]   expected SHA-256 (from $KEYSTORE_ABS alias $FAWN_ANDROID_KEY_ALIAS): $EXPECTED_SHA" >&2
  echo "[android]   actual   SHA-256 (from $APK):                                       $ACTUAL_SHA" >&2
  echo "[android] this usually means the config plugin (mobile/plugins/withAndroidReleaseSigning.js)" >&2
  echo "[android] did not run or the android/ dir was not regenerated. Try:" >&2
  echo "[android]   rm -rf mobile/android && npm run android:release" >&2
  exit 1
fi
