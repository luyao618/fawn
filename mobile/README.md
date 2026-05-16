# Fawn Mobile (Android)

React Native + Expo app for the Fawn family parenting agent system.

- **Stack**: Expo (managed workflow) + TypeScript + React Native
- **Target**: Android only in v1, `minSdkVersion = 26` (Android 8.0+)
- **Backend**: reuses the existing FastAPI backend in `../backend`
- **Distribution (v1)**: EAS internal distribution APK (sideload), no Play Store

## Layout in the monorepo

```
fawn/
├── backend/    FastAPI + LangGraph
├── frontend/   Next.js web app
└── mobile/     ← this package (Expo Android)
```

## Local development

```bash
cd mobile
npm install
npm run start         # Expo dev server (Metro)
npm run android       # launch on connected Android device / emulator
```

You need:

- Node ≥ 20
- Android Studio with an emulator, or a real Android 8.0+ device with USB debugging
- For native builds: an [Expo account](https://expo.dev) and `npm i -g eas-cli`

## Building the internal-distribution APK (EAS)

The first internal-distribution APK is built remotely via EAS so we don't need a
local Android SDK. The `preview` profile in `eas.json` produces a sideloadable
`.apk` file (not an `.aab`).

```bash
cd mobile
npx eas-cli login
npx eas-cli init                       # one-time: links the project to EAS
npx eas-cli build --platform android --profile preview
```

When the build finishes, EAS prints an install URL — open it on the Android
device, download the APK, install, and you should land on the placeholder home
screen showing the app version.

## Acceptance criteria for this slice (YAO-14)

- [x] `mobile/` exists alongside `backend/` and `frontend/`
- [x] Expo + TypeScript, `minSdkVersion = 26`
- [x] EAS build profile (`preview`) configured for internal-distribution APK
- [x] Placeholder home screen rendering the app name + version
- [ ] APK produced by EAS, installed on a real Android 8.0+ device

The last box requires an EAS account and an Android device, so it has to be
ticked off by a human running the `eas build` command above.

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
