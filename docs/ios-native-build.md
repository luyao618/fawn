# iOS native build (local, no EAS)

This doc describes how to run the Fawn mobile app on an iOS simulator and on a
local iPhone, including the user's iPhone 16 target, without TestFlight, App
Store Connect, or App Store metadata.

> Sibling docs: Android local builds live in
> [`android-native-build.md`](./android-native-build.md). The mobile overview
> lives in [`../mobile/README.md`](../mobile/README.md).

## Build policy

Use the lightest build that matches the test:

| Build type | Where it runs | Signing | When to use |
|------------|---------------|---------|-------------|
| Simulator debug | `expo run:ios` | Xcode simulator signing | Layout, navigation, chat, records, profile, memory, and picker smoke checks. |
| Device debug | `expo run:ios --device` | Local Apple ID/team in Xcode | Native debugging when Metro/live reload is useful. Requires the iPhone to reach Metro. |
| Device release-local | `npm run ios:release:device` | Local Apple ID/team in Xcode | Best first physical-phone path: embedded JS bundle, production backend, no Metro, no TestFlight/App Store. |
| Store/TestFlight | Out of scope | Distribution signing | Not part of this stage. |

Fawn uses Expo prebuild / Continuous Native Generation. The `ios/` directory is
generated from `mobile/app.json`, should be regenerated when native config or
permission copy changes, and must not be committed.

## Backend URL policy

The default mobile backend is production:

```text
https://lumingchuan.vip/api
```

It is defined in both `mobile/app.json` and `mobile/src/lib/api.ts`. Do not
commit an iOS build config that points to `localhost`, `127.0.0.1`, or the
Android emulator alias `10.0.2.2`. A real iPhone build should use production by
default unless a one-off local backend test is explicitly being performed.

## One-time setup

Install and open Xcode once so it can finish installing simulators and command
line components. Then verify:

```bash
xcode-select -p
xcrun simctl list devices available
```

For physical iPhone testing:

- Sign in to Xcode with an Apple ID under Settings -> Accounts.
- Connect the iPhone by USB or paired wireless debugging.
- Enable Developer Mode on the iPhone if iOS prompts for it.
- Trust the Mac from the iPhone prompt.
- After the first Personal Team install, trust the developer profile on the
  iPhone under Settings -> General -> VPN & Device Management -> Developer App.
  This is separate from Developer Mode and cannot be bypassed from the CLI.
- Let Xcode choose or create a development team for the app target during the
  first device run.

These are Apple/Xcode prerequisites, not Fawn backend or JavaScript code
requirements. If they are missing, record the exact Xcode signing/device error
and continue with simulator checks.

## Commands

Run from the repo root unless noted.

```bash
cd mobile
npm install
npm run ios:prebuild
npm run ios
```

For the connected iPhone:

```bash
cd mobile
npm run ios:device
```

`npm run ios` and `npm run ios:device` both produce local development builds.
They are enough for this stage's local testing and do not require TestFlight or
App Store distribution.

For a local Release build on the connected iPhone:

```bash
cd mobile
npm run ios:release:device
```

This signs with the local Apple team/profile, bundles JavaScript into the app,
installs through `devicectl`, and launches without Metro. It still uses the
default production API URL, `https://lumingchuan.vip/api`.

## Permission flows to verify

The iOS permission copy is generated from `mobile/app.json`:

- Camera: album camera upload.
- Photo library: album photo picker upload.
- Microphone: chat voice recording.
- Notifications: runtime prompt from `expo-notifications`.

Do the first permission prompts on a physical iPhone when possible because the
simulator cannot cover camera hardware and real push token behavior.

## Smoke matrix

Simulator:

- Launch and login render without a blank screen.
- Drawer navigation opens chat, history, dashboard, records, album, profile,
  memory files, and settings.
- Chat text, image picker, keyboard, and safe-area behavior remain usable.
- Records and profile/family screens render and submit or show clear backend
  errors.
- MMKV-backed query cache does not crash on launch, relaunch, logout, or
  account switch.

Physical iPhone 16:

- Local install succeeds or the exact signing/device blocker is recorded.
- Album camera and photo library flows prompt correctly and return uploadable
  assets.
- Voice recording prompts for microphone access, records, cancels, times out,
  and uploads/transcribes without an iOS-only crash.
- Assistant audio playback works where backend media is available.
- Notification permission is requested and handled without blocking login.
- Push token registration succeeds or records the precise APNs/dev-build
  blocker.

## Known local limitations

- iOS simulators do not provide real camera capture and are not a complete push
  notification validation surface.
- Physical push token registration can require Apple development signing,
  APNs credentials, and an Expo project configuration that are outside this
  local code change.
- Personal Team local iPhone builds strip the iOS `aps-environment`
  entitlement because Apple does not allow Personal Teams to provision Push
  Notifications. These builds are intended for local app testing; real iOS
  push token/APNs validation requires a paid Apple Developer Program team that
  supports the Push Notifications capability.
- Background remote notification mode is intentionally not enabled in this
  stage. Paid-team builds can keep the normal development APNs entitlement for
  foreground push token testing, but Personal Team builds remove it as described
  above. Enable background remote notifications only after a verified product
  requirement needs them.

## Troubleshooting

If `npm run ios` fails before compiling with a destination error similar to
`iOS <version> is not installed`, compare the installed simulator runtime with
the SDK Xcode is trying to use:

```bash
xcodebuild -showsdks
xcrun simctl list runtimes available
xcodebuild -workspace ios/app.xcworkspace -scheme app -showdestinations
```

Install the missing matching iOS Simulator runtime from Xcode -> Settings ->
Components, then rerun `npm run ios`. A runtime mismatch can make `simctl`
list devices while `xcodebuild` still reports zero eligible destinations.

If the simulator opens to a React Native red screen that says
`No script URL provided`, start through the full Expo command instead of
opening the generated app manually or using a `--no-bundler` build:

```bash
cd mobile
npm run ios
```

The command starts Metro, installs the debug app, and opens the app with the
correct bundle URL.

On a physical iPhone, the same red screen usually means the app could not reach
the Mac's Metro server. Confirm that the iPhone and Mac are on the same network,
and launch the app through `npm run ios:device` or the `devicectl` payload URL
below instead of tapping the home-screen icon. If Metro/live reload is not
needed, prefer `npm run ios:release:device`; Release-local builds embed the JS
bundle and do not need a script URL.

If `npm run ios:device` opens a selector that only lists simulators, verify
that the iPhone is connected/trusted:

```bash
xcrun devicectl list devices
xcrun xctrace list devices
```

If `npm run ios:device` fails with `Developer Mode disabled`, enable Developer
Mode on the iPhone under Settings -> Privacy & Security -> Developer Mode,
restart the phone if prompted, confirm the Developer Mode prompt after reboot,
then rerun `npm run ios:device`.

If the app installs but launch fails with an error like `profile has not been
explicitly trusted by the user`, open Settings -> General -> VPN & Device
Management on the iPhone and trust the listed Developer App. For Personal Team
builds the developer name can appear as the Apple ID, `Yao Lu`, or a temporary
Apple account identity such as `yaolu2-microsoft.com@temporary.appleaccount.com`.
After trusting it, relaunch the already-installed app; a rebuild is not needed.

If `npm run ios:device` builds successfully but fails during install with
`There was an error reading pair record for device`, install with Xcode's
CoreDevice tool instead:

```bash
xcrun devicectl list devices
APP_PATH=$(find "$HOME/Library/Developer/Xcode/DerivedData" -path "*/Build/Products/Debug-iphoneos/app.app" -type d -print | xargs ls -td | head -1)
xcrun devicectl device install app --device <CoreDevice UUID> "$APP_PATH"
```

Then start Metro and launch the development build with the LAN URL:

```bash
npx expo start --dev-client --host lan --port 8081
MAC_IP=$(ipconfig getifaddr en0)
xcrun devicectl device process launch --device <CoreDevice UUID> --terminate-existing --payload-url "com.luyao618.fawn.local://expo-development-client/?url=http%3A%2F%2F${MAC_IP}%3A8081" com.luyao618.fawn.local
```

Use the `CoreDevice UUID` from `xcrun devicectl list devices`, not the older
Xcode UDID, when working around this Expo install-path issue.
