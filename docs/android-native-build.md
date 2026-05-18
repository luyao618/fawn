# Android native build (local, no EAS)

This doc describes how to build the Fawn Android app locally from source on
macOS (Apple Silicon) without going through Expo EAS. The default local flow
produces a **debug APK** you can install on a real device (verified target:
Vivo X90, Android 13 / API 33). Release builds live in Expo EAS — see the
signing policy below.

> Sibling docs: see `mobile/README.md` for the EAS-based flow. Local builds and
> EAS builds can coexist — the `android/` directory is generated on demand and
> git-ignored.

## Signing policy (read this first)

The release keystore is the source of truth for app identity on the Play
Store, so we keep it in **one place only — Expo EAS**. Locally we never need
(or want) the release keystore on disk.

| Build type | Where it runs | Signing key | When to use |
|------------|---------------|-------------|-------------|
| **Debug**   | Local Gradle (`assembleDebug` / `installDebug`) | Local auto-generated debug keystore (shipped with Android SDK; not the release key) | Day-to-day iteration on Vivo X90 / emulator. **This is the default local flow.** |
| **Release** | Expo EAS (cloud) | Release keystore managed by EAS | Anything you intend to ship, sideload to testers, or upload to the Play Store. |

What this means in practice:

- **Do not** keep `~/.fawn/fawn-release.jks` or `FAWN_ANDROID_*` env vars on
  your dev machine for normal work. The local `assembleRelease` path is
  retained only as an **optional / troubleshooting** escape hatch (e.g. you
  need to reproduce an EAS signing bug offline). Treat it as a power-user
  tool, not part of the regular loop.
- **Do not** use a locally-built unsigned (or debug-signed) release APK as if
  it were a real release. It will not be upgrade-compatible with EAS-signed
  installs and it bypasses the only keystore we trust.
- Release builds, including any APK/AAB you hand to a tester or upload to a
  store, must come from EAS. See `mobile/README.md` for the EAS flow.

If you only need a debug build, you can skip the entire "Release signing"
section below.

## TL;DR (after the one-time setup below)

```bash
cd mobile
npm install
npm run android:debug      # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install    # build debug APK + install on connected device
# Release builds go through Expo EAS — see mobile/README.md.
# (npm run android:release exists but is optional / troubleshooting only;
#  see "Release signing" below.)
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

## Release signing (optional / troubleshooting only)

> **Reminder:** Per the signing policy at the top of this doc, real release
> builds go through Expo EAS. The local `assembleRelease` path described in
> this section exists only as an offline / troubleshooting escape hatch (e.g.
> reproducing an EAS signing issue without network access). Do **not** use a
> locally-produced release APK as a shippable artifact, and do **not** keep
> the release keystore on your dev machine for normal work.

If you do need a local signed release build, the wiring below is what the
optional `npm run android:release` script uses. Release builds require a Java
keystore. **Never commit the keystore or its passwords.** All credentials are
passed via environment variables prefixed `FAWN_ANDROID_*`.

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

### Verifying the release APK is signed with the right keystore

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
| `npm run android:debug` | Build a debug APK via `./gradlew assembleDebug`. |
| `npm run android:install` | Build + install the debug APK on the connected adb device (`./gradlew installDebug`). |
| `npm run android:release` | **Optional / troubleshooting only.** Build a locally-signed release APK via `./gradlew assembleRelease`, using `FAWN_ANDROID_*` env vars. Do not ship this artifact — release builds go through Expo EAS. |

Each script auto-runs `expo prebuild --platform android --no-install` if
`android/` is missing.

## Verifying on the Vivo X90

```bash
# 1. Enable Developer Options + USB debugging on the phone, then connect USB.
adb devices                  # should list the X90 as "device"

# 2. Debug install (fast iteration loop — the default local flow):
npm run android:install

# 3. Release APKs come from Expo EAS, not from local builds.
#    Download the EAS-built APK and sideload it:
#      adb install -r path/to/eas-build.apk
#    (The local `npm run android:release` path is troubleshooting-only —
#    see the "Release signing" section.)
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
