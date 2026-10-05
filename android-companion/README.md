# The Show Verse — apps de Android

De este proyecto salen **dos apps** (sabores de Gradle):

| App | Paquete | Qué es |
|---|---|---|
| **The Show Verse** (`full`) | `com.theshowverse.app` | La web completa en una carcasa nativa, más la sincronización de streaming. |
| **The Show Verse Sync** (`sync`) | `com.theshowverse.sync` | Solo la sincronización y el **registro de detecciones**, para quien usa la PWA y no quiere la app completa. Sin WebView. |

Se puede tener la PWA más Sync, solo la completa o las dos apps. Con las dos
instaladas, **la completa le cede la sincronización a Sync** (`Delegacion`): deja
de detectar y su panel solo explica que la sincronización es de Sync. Así nunca
detectan las dos a la vez.

- **Sync** usa el paquete de la antigua APK sideload (2.2, versionCode 13). Si
  está firmada con la misma clave, la nueva (versionCode 20) se instala encima
  como actualización. Si no, hay que desinstalar la vieja una vez.
- **Mínimo:** Android 8.0 (API 26). **Objetivo:** API 35.
- **Tablets:** soportadas; la interfaz de la completa es la web responsive.

## Cómo está montada

```
src/main   ── lo de las DOS apps
  MediaListenerService, AccessibilityStreamingService  (detección)
  QuickAccessNotifier   aviso de acceso rápido («Abrir ficha» / «No es correcto»)
  MainActivity          panel de sincronización (inicio de Sync)
  DeteccionesActivity   registro de detecciones del móvil (últimos 7 días)
  CorreccionActivity    corrección: «no había ficha» / «era otro título»
  PairingActivity       theshowverse://pair
  Delegacion            la completa cede la sincronización si Sync está instalada

src/full   ── solo la app completa (WebView, puente, Google, push, ajustes)
src/sync   ── solo Sync (MainActivity como lanzador, textos propios)
AppVariante (en full y en sync) ── dónde se abre la ficha: en el WebView
                                   (completa) o en la PWA/navegador (Sync)
```

El registro de detecciones del móvil es **nativo**. Va con el token de
vinculación contra `/api/streaming/device/*`, porque Sync no tiene sesión web.
La web (`/detections`) solo enseña las de la extensión del navegador: el
backend guarda el origen de cada detección (`android` / `browser`).

### La app completa

```
WebAppActivity  ── carcasa: WebView a pantalla completa con theshowverse.com
      │              (sesión, tráileres, enlaces externos, offline, recarga)
      │
      ├── WebAppBridge  ── window.TSVAndroidBridge: la web habla con el nativo
      │                     (emparejar, ver permisos, abrir ajustes, compartir)
      │
      ├── MainActivity  ── panel nativo de sincronización (permisos, apps, log)
      ├── ServerActivity ─ servidor propio y clave de acceso privado
      │
      └── servicios que ya existían, intactos:
          MediaListenerService          (sesiones multimedia → historial)
          AccessibilityStreamingService (ficha abierta sin reproducir)
```

### Por qué WebView y no una TWA

Una Trusted Web Activity delega la web a Chrome. Desde ahí **no** se puede
hablar con el servicio de sincronización ni abrir su pantalla, así que harían
falta dos aplicaciones otra vez. Con WebView la web y el nativo comparten
proceso y se comunican por el puente: emparejar el dispositivo o conceder un
permiso se hace desde Ajustes de la propia web, sin salir de la app.

Lo que la carcasa resuelve y un WebView "pelado" no:

| Cosa | Dónde |
|---|---|
| Sesión que sobrevive a cerrar la app | cookies persistentes + `flush()` al pausar |
| Tráileres a pantalla completa | `onShowCustomView` en `WebAppActivity` |
| Subir foto de perfil (`<input type=file>`) | `onShowFileChooser` |
| Enlaces a TMDb, YouTube… | pestaña personalizada del navegador |
| `market://`, `mailto:`… | los resuelve el sistema |
| Servidor caído / sin red | pantalla propia con reintento |
| Web con acceso privado (404) | pantalla propia + clave en `ServerActivity` |
| Volver donde lo dejaste | `Prefs.lastUrl` |
| Entrar con Google sin salir a Chrome | `GoogleSignIn` (Credential Manager) |

La decisión de qué es "de casa" y qué es externo está en `WebOrigin`, que es
código puro y con tests: de ahí depende quién puede usar el puente.

## Notificaciones push

Solo la app completa. Sync no tiene web a la que entregarlos: con la PWA, los
avisos llegan por Web Push.

La app recibe los avisos de The Show Verse (progreso sincronizado, vistos,
recordatorios de puntuar) con **Firebase Cloud Messaging**: el WebView no admite
Web Push. `PushMessagingService` los recibe; con la app delante se los pasa a la
web (evento `tsv:push`) y, si no, pinta la notificación del sistema.

Necesita `app/google-services.json` del proyecto de Firebase (paquete
`com.theshowverse.app`). Sin él la app compila igual, sin push. Puesta en marcha
completa en [docs/push-notifications.md](../docs/push-notifications.md).

## Compilar

Hace falta JDK 17 y el SDK de Android (o Android Studio Giraffe+).
`local.properties` apunta al SDK; no está en git.

```bash
cd android-companion
gradle wrapper                 # una vez, si no existe ./gradlew
./gradlew assembleFullDebug    # app/build/outputs/apk/full/debug/app-full-debug.apk
./gradlew assembleSyncDebug    # app/build/outputs/apk/sync/debug/app-sync-debug.apk
./gradlew testFullDebugUnitTest testSyncDebugUnitTest
```

Sin JDK local, con Docker:

```bash
docker run --rm --user root -v "$PWD":/project -w /project cimg/android:2025.01 \
  bash -lc 'gradle testFullDebugUnitTest testSyncDebugUnitTest assembleFullDebug assembleSyncDebug --no-daemon'
```

Firebase (push) es solo de la completa: `app/google-services.json` lleva el
cliente de `com.theshowverse.app` y la tarea de Google Services de Sync se salta.

### Probar contra tu propio servidor

La app apunta a `https://theshowverse.com`. Para probar cambios sin recompilar:
abre la app → si no carga, **Servidor**; o desde la web, Ajustes → Conexiones →
*Panel de sincronización*. Ahí se cambia el origen y, si el servidor tiene el
gate de acceso privado, se mete la clave (equivale a abrir
`/api/private-access?key=…` una vez).

- Emulador: `http://10.0.2.2:3000`
- Dispositivo por cable: `adb reverse tcp:3000 tcp:3000` → `http://localhost:3000`
- NAS en la LAN: `http://192.168.x.x:3000` — **solo en la build de debug**, que
  es la única que permite HTTP en claro (`app/src/debug/res/xml/`).

## Publicar en Play

Ver [`docs/android-play-store.md`](../docs/android-play-store.md): firma, AAB,
App Links y —lo importante— las declaraciones que Play exige por usar acceso a
notificaciones y accesibilidad.

## Login con Google

Google rechaza su formulario dentro de un WebView (`disallowed_useragent`), así
que un WebView "pelado" siempre acaba mandándote a Chrome. La app usa el selector
de cuentas del sistema (`GoogleSignIn.kt` → Credential Manager), le pasa el
`idToken` a la web y esta lo canjea en `/api/auth/google/native` contra el mismo
endpoint del backend que el login por navegador: **cero navegador y la sesión
queda en las cookies del WebView**.

Requiere un cliente OAuth de tipo **Android** en Google Cloud (paquete
`com.theshowverse.app` + huella SHA-1 de cada certificado de firma). Sin él,
Android responde `no_credentials` y la web cae automáticamente al flujo por
navegador, que vuelve a la app por `theshowverse://open`. Los pasos exactos están
en [`docs/android-play-store.md`](../docs/android-play-store.md#3bis-login-con-google-dentro-de-la-app).

## Emparejamiento y permisos

- **Con la app completa:** Perfil → Ajustes → Conexiones → The Show Verse Sync.
  Ahí se ve en una sola pantalla si el dispositivo está vinculado y qué
  permisos faltan, con un botón para conceder cada uno.
- **Con la PWA y Sync:** el mismo sitio en la PWA, botón «Vincular app
  Android». Abre Sync con un enlace `intent://` dirigido a su paquete
  (`src/lib/android/syncPairLink.js`), para que no conteste la completa si
  también está instalada. El enlace que se copia es el de siempre,
  `theshowverse://pair`. Sync sin vincular enseña un botón que abre esos
  Ajustes.
- **Con las dos apps:** la vinculación es de Sync. Desde la web de la
  completa, «Vincular Sync» le pasa el token por el puente
  (`pairSyncApp`).

Para que la sincronización funcione hacen falta dos cosas:

1. **Vincular** el dispositivo (guarda un token propio del móvil, distinto del de
   la extensión del navegador).
2. **Acceso a notificaciones**, que es lo que permite leer las sesiones
   multimedia de Netflix, Prime Video, Disney+, Max, Crunchyroll…

La **detección de fichas** (accesibilidad) es opcional: detecta el título que
abres en una app de streaming sin darle a reproducir, para ofrecerte su ficha.

## Límites conocidos

- La app necesita servidor: no hay modo offline propio más allá del service
  worker de la web (shell + último contenido cargado).
- No hay notificaciones push nativas (haría falta FCM y trabajo en el backend).
- La precisión de la detección depende de los metadatos que publique cada app de
  streaming; cuando no se puede saber el episodio exacto se registra a nivel de
  serie, igual que la extensión.
