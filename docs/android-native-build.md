# Android native build (local, no EAS)

This doc describes how to build the Fawn Android app locally from source on
macOS (Apple Silicon) without going through Expo EAS. There are two normal
local flows:

- **Debug APK** for investigating bugs while Metro is running.
- **Gradle release APK** for installing a standalone build on a test phone
  (verified target: Vivo X90, Android 13 / API 33).

EAS is optional for cloud/production distribution. Do not spend EAS quota just
to put a test build on a local device.

> Sibling docs: see `mobile/README.md` for the mobile overview. Local Gradle
> builds and EAS builds can coexist — the `android/` directory is generated on
> demand and git-ignored.

## Build policy (read this first)

Use the lightest build that matches the test you are doing:

| Build type | Where it runs | Signing key | When to use |
|------------|---------------|-------------|-------------|
| **Debug** | Local Gradle (`assembleDebug` / `installDebug`) | Local debug keystore | Bug investigation, native logs, emulator work, and fast iteration. Debug builds do **not** embed the JS bundle, so keep Metro running. |
| **Release-test APK** | Local Gradle (`assembleRelease`) | Configured local/test keystore via `FAWN_ANDROID_*` | Installing a standalone build on a test phone such as the Vivo X90. This is the default path for handing a build to a tester or reproducing a phone-only issue. |
| **Production / store** | EAS or another deliberate production signing pipeline | Production release/upload key | Only when intentionally producing a production artifact or store upload. |

What this means in practice:

- For local debugging, use `npm run android:debug` or
  `npm run android:install` plus Metro.
- For a test phone, use `npm run android:release` and install
  `android/app/build/outputs/apk/release/app-release.apk` with `adb install -r`.
- A release-test APK is standalone and bundles JS; it should not require Metro.
- Signing identity still matters. `adb install -r` only upgrades an existing app
  when the new APK is signed with the same certificate as the installed one.
- Do not treat a debug-signed/test-signed APK as a production/store artifact.
  Use the production signing path only when that is the explicit goal.

If you only need a debug build, you can skip the entire "Release-test signing"
section below.

## TL;DR (after the one-time setup below)

```bash
cd mobile
npm install
npm run android:debug      # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install    # build debug APK + install on connected device
npm run android:release    # → android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## Expo workflow selection: prebuild (not eject)

We use **Expo prebuild** (managed workflow + on-demand native projects), not a
full `eject`. Rationale:

- We still want managed Expo upgrades (`expo upgrade`) and config plugins
  (`expo-build-properties`, `expo-notifications`, `expo-font` are already in
  `app.json`). Ejecting would freeze the native config and force us to maintain
  `android/` by hand.
- `expo prebuild --platform android` regenerates the `android/` directory from
  `app.json` whenever needed. It is reproducible from source, so we git-ignore
  `android/` (see `mobile/.gitignore` `generated native folders` section).
- Prebuild gives us a real Gradle project, so all of `assembleDebug` /
  `assembleRelease` / `installDebug` work exactly like a vanilla RN app — which
  is what this issue (YAO-38) needs.

If we ever hit a case that forces a full eject (e.g. native code that prebuild
plugins can't express), we will revisit and document the reason here.

## One-time environment setup

You need the following installed and on `PATH`:

| Tool | Recommended version | Notes |
|------|---------------------|-------|
| Node.js | ≥ 20 LTS | matches `mobile/README.md` |
| JDK | 17 (Temurin) | RN 0.81 / Gradle 8.x requires JDK 17 |
| Android SDK Platform | 36 (compile) + 33 (target device) | current generated Gradle config compiles against API 36 |
| Android Build-Tools | 36.0.0 or newer | installed via SDK Manager; `apksigner` is used for release-test verification |
| Android NDK | matches Expo SDK 54 default (currently 27.x) | installed via SDK Manager |
| Android Platform-Tools | latest | for `adb` |
| Android cmdline-tools | latest | for `sdkmanager` |

### Recommended install path (macOS Apple Silicon)

```bash
# JDK 17
brew install --cask temurin@17
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"

# Android Studio (ships SDK + cmdline-tools + emulator)
brew install --cask android-studio
# Open Android Studio → More Actions → SDK Manager and install:
#   - SDK Platforms: Android API 36, Android 13 (API 33)
#   - SDK Tools: Android SDK Build-Tools 36.0.0 or newer, Platform-Tools,
#                NDK (Side by side) 27.x, CMake, cmdline-tools (latest)

export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Persist `JAVA_HOME`, `ANDROID_HOME`, and the `PATH` additions in your shell rc
(`~/.zshrc`).

### `local.properties`

`expo prebuild` generates `android/local.properties` automatically using
`$ANDROID_HOME`. You normally do not need to touch it. If a fresh clone fails
with "SDK location not found", create `android/local.properties` manually:

```
sdk.dir=/Users/<you>/Library/Android/sdk
```

This file is git-ignored (it's inside `android/`, which is itself ignored).

### Verify the toolchain

```bash
java -version           # → openjdk 17.x
adb --version           # → Android Debug Bridge 35.x
sdkmanager --list_installed | grep -E 'build-tools|platforms;android-(33|36)|ndk'
```

## Release-test signing

`npm run android:release` is the normal way to produce a standalone APK for a
test phone. It runs local Gradle `assembleRelease`; it does not call EAS and
does not consume Expo build quota.

Release-test builds require a Java keystore. Use a stable test keystore if you
want `adb install -r` upgrades to preserve app data across builds. **Never
commit the keystore or its passwords.** All credentials are passed via
environment variables prefixed `FAWN_ANDROID_*`.

### Generate your personal/test keystore (one time)

```bash
mkdir -p ~/.fawn
keytool -genkeypair -v -storetype JKS \
  -keystore ~/.fawn/fawn-test.jks \
  -alias fawn-test -keyalg RSA -keysize 2048 -validity 10000
# Pick a store password and key password. Record them in your password manager.
```

> `*.jks` is already in `mobile/.gitignore` as an extra safety net, but keep
> the keystore outside the repo (e.g. under `~/.fawn/`).

### Configure env

Copy `.env.example` → `.env` (inside `mobile/`) and fill in:

```env
FAWN_ANDROID_KEYSTORE_PATH=/Users/<you>/.fawn/fawn-test.jks
FAWN_ANDROID_KEYSTORE_PASSWORD=...
FAWN_ANDROID_KEY_ALIAS=fawn-test
FAWN_ANDROID_KEY_PASSWORD=...
```

`mobile/.env` is git-ignored. The release script also writes
`android/keystore.properties` from these env vars at build time — that file is
git-ignored as well (`mobile/.gitignore`).

For a one-off local test build that only needs to install over an existing
debug-signed install, you can point the release script at the generated debug
keystore instead of creating a separate test key:

```bash
FAWN_ANDROID_KEYSTORE_PATH=android/app/debug.keystore \
FAWN_ANDROID_KEYSTORE_PASSWORD=android \
FAWN_ANDROID_KEY_ALIAS=androiddebugkey \
FAWN_ANDROID_KEY_PASSWORD=android \
npm run android:release
```

That produces a standalone release APK, but it is still debug-key signed. Use
it for local/test-device verification only.

### How the keystore is wired into Gradle (repeatable, no manual patch)

The wiring is done by a repo-tracked Expo config plugin:
`mobile/plugins/withAndroidReleaseSigning.js`, registered in
`mobile/app.json` under `expo.plugins`. Every `expo prebuild` patches the
generated `android/app/build.gradle` to:

1. Load `android/keystore.properties` (written by `scripts/android-release.sh`
   from the `FAWN_ANDROID_*` env vars; git-ignored).
2. Define `android.signingConfigs.release` backed by those properties.
3. Repoint `android.buildTypes.release.signingConfig` from the default debug
   keystore to `signingConfigs.release`.

You do not need to edit `android/app/build.gradle` by hand — any hand-edit
would be lost the next time `android/` is regenerated. If you ever need to
disable the wiring temporarily, remove the plugin entry from `app.json` and
re-run `npm run android:prebuild`.

Secrets are never passed on the Gradle command line; they live in
`android/keystore.properties` (mode 600, git-ignored) so they do not appear in
`ps` output.

### Verifying the release-test APK is signed with the right keystore

`npm run android:release` runs `assembleRelease` and then compares the
SHA-256 of the APK's signing certificate to the SHA-256 of
`FAWN_ANDROID_KEY_ALIAS` in your keystore (via `apksigner verify
--print-certs` with a `keytool -printcert` fallback). The script exits
non-zero if they do not match, so a build that silently fell back to the
default debug keystore will fail loudly instead of producing a
mis-signed APK.

You can re-run the check manually:

```bash
# Expected fingerprint (from your keystore):
# Pass the password via env, not argv, so it does not leak via `ps`.
FAWN_ANDROID_KEYSTORE_PASSWORD="$FAWN_ANDROID_KEYSTORE_PASSWORD" \
keytool -list -v -keystore "$FAWN_ANDROID_KEYSTORE_PATH" \
  -alias "$FAWN_ANDROID_KEY_ALIAS" -storepass:env FAWN_ANDROID_KEYSTORE_PASSWORD \
  | grep SHA256

# Actual fingerprint (from the APK):
"$ANDROID_HOME"/build-tools/*/apksigner verify --print-certs \
  mobile/android/app/build/outputs/apk/release/app-release.apk \
  | grep SHA-256
```

## Scripts (the entry points)

All commands are run from `mobile/`. Definitions live in `mobile/package.json`
and the shell helpers in `mobile/scripts/`.

| Command | What it does |
|---------|--------------|
| `npm run android:prebuild` | Regenerate `android/` from `app.json` (no install). |
| `npm run android:debug` | Build a debug APK via `./gradlew assembleDebug`. Use for bug investigation with Metro. |
| `npm run android:install` | Build + install the debug APK on the connected adb device (`./gradlew installDebug`). |
| `npm run android:release` | Build a locally-signed, standalone release APK via `./gradlew assembleRelease`, using `FAWN_ANDROID_*` env vars. Use this for test-machine installs. |

Each script auto-runs `expo prebuild --platform android --no-install` if
`android/` is missing.

## Verifying on the Vivo X90

```bash
# 1. Enable Developer Options + USB debugging on the phone, then connect USB.
adb devices                  # should list the X90 as "device"

# 2. Debug install (bug investigation / fast iteration):
npm run start -- --localhost --dev-client
adb reverse tcp:8081 tcp:8081
npm run android:install

# 3. Standalone test-machine install (preferred for a test phone):
npm run android:release
adb install -r android/app/build/outputs/apk/release/app-release.apk

# 4. Confirm the installed version/signature state if needed:
adb shell dumpsys package com.luyao618.fawn | grep -E 'versionName|versionCode|lastUpdateTime|signatures'
```

The app launches as `com.luyao618.fawn` (see `app.json` → `android.package`).

## Troubleshooting

- **"SDK location not found"** → create `android/local.properties` (see above)
  or export `ANDROID_HOME` before running the script.
- **"Unsupported class file major version"** → wrong JDK. Make sure
  `java -version` reports 17, not 11 or 21.
- **`./gradlew` hangs on first run** → it is downloading the Gradle
  distribution and NDK. Subsequent builds are incremental.
- **`npm run android:release` builds the APK but fails signature verification**
  → make sure `ANDROID_HOME` is exported so the script can find
  `$ANDROID_HOME/build-tools/*/apksigner`, or add the latest Android
  Build-Tools directory to `PATH`.
- **`adb install -r` fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`** → the
  installed app and new APK are signed by different keys. Rebuild with the same
  test keystore, or uninstall first only if losing local app data is acceptable.
- **Release APK installs but won't open** → confirm the keystore alias matches
  the one used for the previous install, then check `adb logcat` for native
  crash details.
- **Want to nuke the native folder** → `rm -rf mobile/android` then re-run
  `npm run android:prebuild`. Safe because we regenerate from `app.json`.

## Out of scope (tracked elsewhere)

- iOS local builds.
- CI cloud builds (will reuse these scripts but live in a separate workflow).
- Play Store upload signing / production release policy.
