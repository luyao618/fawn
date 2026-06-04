#!/usr/bin/env bash
# Build and install a local iOS Release app on a connected iPhone.
#
# This is a local-device flow, not TestFlight/App Store distribution:
# - Xcode signs with the configured local Apple team/profile.
# - React Native bundles JS into the .app, so Metro is not required.
# - The app uses the production API URL from app.json / src/lib/api.ts.
#
# Optional overrides:
#   IOS_DEVICE_ID       Xcode device UDID used by xcodebuild
#   IOS_COREDEVICE_ID   CoreDevice UUID used by devicectl install/launch

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$MOBILE_DIR"

DEVICE_JSON="$(mktemp)"
trap 'rm -f "$DEVICE_JSON"' EXIT

xcrun devicectl list devices --json-output "$DEVICE_JSON" >/dev/null

DEVICE_INFO="$(
  node - "$DEVICE_JSON" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const json = JSON.parse(fs.readFileSync(path, 'utf8'));
const devices = json.result?.devices ?? [];
const connectedPhones = devices.filter((device) => {
  const hardware = device.hardwareProperties ?? {};
  const state = device.connectionProperties?.tunnelState ?? device.state;
  return hardware.platform === 'iOS'
    && hardware.reality === 'physical'
    && hardware.deviceType === 'iPhone'
    && state === 'connected';
});

const device = connectedPhones[0];
if (!device) {
  console.error('No connected physical iPhone found. Check cable/trust/Developer Mode, then retry.');
  process.exit(1);
}

console.log(device.identifier ?? '');
console.log(device.hardwareProperties?.udid ?? '');
console.log(device.deviceProperties?.name ?? device.name ?? 'iPhone');
NODE
)"

DEFAULT_COREDEVICE_ID="$(printf '%s\n' "$DEVICE_INFO" | sed -n '1p')"
DEFAULT_XCODE_UDID="$(printf '%s\n' "$DEVICE_INFO" | sed -n '2p')"
DEVICE_NAME="$(printf '%s\n' "$DEVICE_INFO" | sed -n '3p')"

COREDEVICE_ID="${IOS_COREDEVICE_ID:-$DEFAULT_COREDEVICE_ID}"
XCODE_UDID="${IOS_DEVICE_ID:-$DEFAULT_XCODE_UDID}"
BUNDLE_ID="$(node -e "console.log(require('./app.json').expo.ios.bundleIdentifier)")"
DERIVED_DATA_PATH="$MOBILE_DIR/ios/build"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/Release-iphoneos/app.app"

if [ -z "$COREDEVICE_ID" ] || [ -z "$XCODE_UDID" ]; then
  echo "[ios] could not resolve device identifiers for $DEVICE_NAME" >&2
  exit 1
fi

echo "[ios] target device: $DEVICE_NAME"
echo "[ios] xcodebuild device id: $XCODE_UDID"
echo "[ios] devicectl device id: $COREDEVICE_ID"
echo "[ios] bundle id: $BUNDLE_ID"

echo "[ios] ensuring generated iOS project is current"
npx expo prebuild --platform ios --no-install

echo "[ios] ensuring CocoaPods are installed"
npx pod-install ios

echo "[ios] building Release app with embedded JS bundle"
xcodebuild \
  -workspace ios/app.xcworkspace \
  -scheme app \
  -configuration Release \
  -destination "id=$XCODE_UDID" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build

if [ ! -d "$APP_PATH" ]; then
  echo "[ios] expected Release app not found: $APP_PATH" >&2
  exit 1
fi

echo "[ios] installing Release app"
xcrun devicectl device install app --device "$COREDEVICE_ID" "$APP_PATH"

echo "[ios] launching Release app"
xcrun devicectl device process launch --device "$COREDEVICE_ID" --terminate-existing "$BUNDLE_ID"

echo "[ios] Release app installed and launched: $BUNDLE_ID"
