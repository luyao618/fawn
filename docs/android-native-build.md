# Android native build (local, no EAS)

This doc describes how to build the Fawn Android app locally from source on
macOS (Apple Silicon) without going through Expo EAS. The output is a signed
APK you can install on a real device (verified target: Vivo X90, Android 13 /
API 33).

> Sibling docs: see `mobile/README.md` for the EAS-based flow. Local builds and
> EAS builds can coexist — the `android/` directory is generated on demand and
> git-ignored.

## TL;DR (after the one-time setup below)

```bash
cd mobile
npm install
npm run android:debug      # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install    # build debug APK + install on connected device
npm run android:release    # signed release APK (requires .env, see below)
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
| Android SDK Platform | 35 (compile) + 33 (target device) | Expo SDK 54 compiles against 35 |
| Android Build-Tools | 35.0.0 | installed via SDK Manager |
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
#   - SDK Platforms: Android 15 (API 35), Android 13 (API 33)
#   - SDK Tools: Android SDK Build-Tools 35.0.0, Platform-Tools,
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
sdkmanager --list_installed | grep -E 'build-tools|platforms;android-(33|35)|ndk'
```

## Release signing

Release builds require a Java keystore. **Never commit the keystore or its
passwords.** All credentials are passed via environment variables prefixed
`FAWN_ANDROID_*`.

### Generate your personal release keystore (one time)

```bash
mkdir -p ~/.fawn
keytool -genkeypair -v -storetype JKS \
  -keystore ~/.fawn/fawn-release.jks \
  -alias fawn-release -keyalg RSA -keysize 2048 -validity 10000
# Pick a store password and key password. Record them in your password manager.
```

> `*.jks` is already in `mobile/.gitignore` as an extra safety net, but keep
> the keystore outside the repo (e.g. under `~/.fawn/`).

### Configure env

Copy `.env.example` → `.env` (inside `mobile/`) and fill in:

```env
FAWN_ANDROID_KEYSTORE_PATH=/Users/<you>/.fawn/fawn-release.jks
FAWN_ANDROID_KEYSTORE_PASSWORD=...
FAWN_ANDROID_KEY_ALIAS=fawn-release
FAWN_ANDROID_KEY_PASSWORD=...
```

`mobile/.env` is git-ignored. The release script also writes
`android/keystore.properties` from these env vars at build time — that file is
git-ignored as well (`mobile/.gitignore`).

### Wire the keystore into Gradle

`expo prebuild` produces an `android/app/build.gradle` that already supports
the standard `signingConfigs.release` block. If your generated `build.gradle`
does not have one (it depends on the Expo SDK version), add the following
once and re-run prebuild on every native folder reset:

```gradle
// android/app/build.gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

A persistent solution is to encapsulate this in a small Expo config plugin so
it survives prebuild regeneration; that is tracked as a follow-up and is out
of scope for this issue.

## Scripts (the entry points)

All commands are run from `mobile/`. Definitions live in `mobile/package.json`
and the shell helpers in `mobile/scripts/`.

| Command | What it does |
|---------|--------------|
| `npm run android:prebuild` | Regenerate `android/` from `app.json` (no install). |
| `npm run android:debug` | Build a debug APK via `./gradlew assembleDebug`. |
| `npm run android:install` | Build + install the debug APK on the connected adb device (`./gradlew installDebug`). |
| `npm run android:release` | Build the signed release APK via `./gradlew assembleRelease`, using env vars. |

Each script auto-runs `expo prebuild --platform android --no-install` if
`android/` is missing.

## Verifying on the Vivo X90

```bash
# 1. Enable Developer Options + USB debugging on the phone, then connect USB.
adb devices                  # should list the X90 as "device"

# 2. Debug install (fast iteration loop):
npm run android:install

# 3. Or build the release APK and sideload it:
npm run android:release
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The app launches as `com.luyao618.fawn` (see `app.json` → `android.package`).

## Troubleshooting

- **"SDK location not found"** → create `android/local.properties` (see above)
  or export `ANDROID_HOME` before running the script.
- **"Unsupported class file major version"** → wrong JDK. Make sure
  `java -version` reports 17, not 11 or 21.
- **`./gradlew` hangs on first run** → it is downloading the Gradle
  distribution and NDK. Subsequent builds are incremental.
- **Release APK installs but won't open** → confirm the keystore alias
  matches the one used for the previous install, or `adb uninstall
  com.luyao618.fawn` first (signature changes are not upgrade-compatible).
- **Want to nuke the native folder** → `rm -rf mobile/android` then re-run
  `npm run android:prebuild`. Safe because we regenerate from `app.json`.

## Out of scope (tracked elsewhere)

- iOS local builds.
- CI cloud builds (will reuse these scripts but live in a separate workflow).
- Play Store upload signing (we still use EAS for that today).
