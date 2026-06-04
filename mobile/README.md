# Fawn Mobile

> **Backend URLs (read first):**
> - **Default = Production**: `https://lumingchuan.vip/api` (in `app.json` and `src/lib/api.ts`). This is what every build ships with.
> - **Local emulator only**: `http://10.0.2.2:8000/api`. Does **not** work on a physical device.
>
> See [`AGENTS.md`](./AGENTS.md) for the full policy. Never default back to
> the emulator URL.

React Native + Expo app for the Fawn family parenting agent system.

- **Stack**: Expo (managed workflow) + TypeScript + React Native
- **Targets**: Android (`minSdkVersion = 26`) and local iOS development builds
- **Backend**: reuses the existing FastAPI backend in `../backend`
- **Distribution**: local Android APKs and local iOS simulator/device installs; no store pipeline by default

## Layout in the monorepo

```
fawn/
├── backend/    FastAPI + LangGraph
├── frontend/   Next.js web app
└── mobile/     ← this package (Expo mobile)
```

## Local development

```bash
cd mobile
npm install
npm run start         # Expo dev server (Metro)
npm run android       # launch on connected Android device / emulator
npm run ios           # launch on an iOS simulator
npm run ios:device    # install/run on a connected iPhone via Xcode signing
```

You need:

- Node ≥ 20
- Android Studio with an emulator, or a real Android 8.0+ device with USB debugging
- Xcode for iOS simulator or local iPhone development installs
- Optional only for cloud builds: an [Expo account](https://expo.dev) and `npm i -g eas-cli`

## Building locally (no EAS): Android

For day-to-day Android UI work we now have a fully local build chain that
skips EAS / cloud queues. See [`../docs/android-native-build.md`](../docs/android-native-build.md)
for the one-time JDK/SDK/NDK setup and signing details.

Quick commands (run from `mobile/`):

```bash
npm run android:debug      # build debug APK via ./gradlew assembleDebug
npm run android:install    # build + adb install on connected device
npm run android:release    # build standalone APK via ./gradlew assembleRelease
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Use `android:debug` / `android:install` when you are actively debugging and can
keep Metro running. Use `android:release` when you need to install a
standalone APK on a test phone such as the Vivo X90. This Gradle path is local
and does not consume Expo/EAS build quota.

See the [build policy in
`../docs/android-native-build.md`](../docs/android-native-build.md#build-policy-read-this-first)
for signing details and the difference between debug, release-test, and
production/store artifacts.

`android/` is generated on demand via `expo prebuild` and is git-ignored.

## Building locally (no EAS): iOS

Use Expo CNG/prebuild for iOS too; `ios/` is generated on demand and
git-ignored.

```bash
cd mobile
npm run ios:prebuild
npm run ios           # simulator
npm run ios:device    # connected iPhone, e.g. iPhone 16
npm run ios:release:device  # connected iPhone, embedded JS bundle, no Metro
```

See [`../docs/ios-native-build.md`](../docs/ios-native-build.md) for Xcode,
Apple ID/team signing, device trust, permission prompts, and known local push
notification limits. It also documents the `devicectl` install fallback for
machines where Expo's iPhone installer cannot read the device pair record. Use
`ios:release:device` when you want the app to open directly against
`https://lumingchuan.vip/api` without a Metro bundle URL. This local flow does
not require TestFlight, App Store Connect, or App Store metadata.

## Building with EAS (optional)

EAS is optional and should not be the default way to install builds on local
test devices. Use it only when you intentionally need Expo's cloud build
environment or a production distribution pipeline. The current EAS profiles are
Android-focused; use the local Xcode flow above for first-stage iOS testing.

```bash
cd mobile
npx eas-cli login
npx eas-cli init                       # one-time: links the project to EAS
npx eas-cli build --platform android --profile preview
```

When the build finishes, EAS prints an install URL. For ordinary X90/tester
verification, prefer the local Gradle release APK described above.

## Acceptance criteria for this slice (YAO-14)

- [x] `mobile/` exists alongside `backend/` and `frontend/`
- [x] Expo + TypeScript, `minSdkVersion = 26`
- [x] Local Gradle build scripts configured for debug and release-test APKs
- [x] Placeholder home screen rendering the app name + version
- [ ] Gradle release APK installed on a real Android 8.0+ device

The last box requires an Android device and USB debugging, so it has to be
ticked off by a human running the local Gradle build/install flow above.

## Chat module v1 (YAO-18)

The chat tab in `HomeScreen` shows a conversation list (powered by the
TanStack Query persister, so a second visit hits cache and skips the spinner)
and lets you open a conversation to send text + image messages.

- Conversations: `GET /chat/conversations`
- Detail: `GET /chat/conversations/{id}`
- Send: `POST /chat/conversations/{id}/messages` (SSE; we drain and refetch)
- Upload: `POST /chat/conversations/{id}/images` (multipart)
- Image rendering: `expo-image` with `cachePolicy="memory-disk"` for the
  Expo Image cache requirement.

`apiBaseUrl` in `app.json` now includes the `/api` prefix so all backend
routes resolve correctly.
