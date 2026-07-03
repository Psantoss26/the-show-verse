# The Show Verse Sync — Android companion app

Automatic streaming-activity sync from the **official native apps** on Android
(Netflix, Disney+, Prime Video, Max, Crunchyroll, Movistar+, …). It reads the
"now playing" media metadata those apps publish (for lock-screen / Android Auto
controls) and sends it to your existing backend — the **same** endpoint the
browser extension uses (`/api/netflix/extension-sync`), so the whole
resolver / confidence / history pipeline is reused.

> A PWA/browser cannot read what other apps play; only a native app with
> **Notification access** can. That's what this app is.

## How it works

`NotificationListenerService` (the permission that unlocks
`MediaSessionManager.getActiveSessions()`) observes active media sessions →
`SignalBuilder` turns the metadata into a `PlaybackSignal` (same shape as the
extension) → `SyncClient` POSTs it with your device sync token.

## Build

You need Android Studio (Giraffe+) or a local JDK 17 + Android SDK.

- **Android Studio:** `File → Open` this `android-companion/` folder, let it sync,
  then `Build → Build APK(s)` (or Run on a connected device).
- **CLI:** from `android-companion/`, first generate the Gradle wrapper if it's
  missing, then build:
  ```bash
  gradle wrapper            # one-time, if ./gradlew is absent
  ./gradlew assembleDebug   # APK at app/build/outputs/apk/debug/app-debug.apk
  ./gradlew test            # runs the SignalBuilder unit tests
  ```

## Install & pair

1. Sideload the debug APK (`adb install app-debug.apk`, or copy + open on device).
2. On the **same device**, open The Show Verse (your PWA) →
   `Perfil → Ajustes → Plataformas de streaming → Vincular app Android`. Tapping
   it opens this app via the `theshowverse://pair` deep link and stores your
   device sync token (separate from the browser-extension token).
3. In the app, tap **Conceder acceso a notificaciones** and enable
   "The Show Verse Sync" in the system list.
4. Leave sync enabled. Play something for ≥15s in a streaming app.

## App list

Known streaming apps are enabled by default; music apps (e.g. Spotify) are not.
Any other app that emits a media session appears in the app list after you play
in it — toggle it on to sync it too. (Package names for niche apps can vary; the
toggle list covers whatever your device actually reports.)

## Notes / limits

- Requires the streaming app to publish media metadata + a known playback
  position (most do). Apps that report no position won't sync until they do.
- Detection accuracy depends on the metadata the app exposes; when the exact
  episode can't be determined the backend records a show-level entry
  (confidence `low`), exactly like the extension.
- No launcher icon asset is bundled (uses the system default); add one under
  `res/mipmap-*` if you want a custom icon.
