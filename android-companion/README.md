# The Show Verse — app oficial de Android

**Una sola app**: The Show Verse completo (lo mismo que la web, en móvil y
tablet) más la sincronización automática de lo que ves en las apps de streaming.
Antes eran dos cosas —la PWA por un lado y la APK "The Show Verse Sync" por
otro—; ahora se instalan juntas en un único paquete, que es lo que se publica en
Play Store.

- **applicationId:** `com.theshowverse.app` (la APK anterior era
  `com.theshowverse.sync`; son paquetes distintos y conviven).
- **Mínimo:** Android 8.0 (API 26). **Objetivo:** API 35.
- **Tablets:** soportadas; la interfaz es la web responsive, sin bloqueo de
  orientación.

## Cómo está montada

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

## Compilar

Hace falta JDK 17 y el SDK de Android (o Android Studio Giraffe+).
`local.properties` apunta al SDK; no está en git.

```bash
cd android-companion
gradle wrapper            # una vez, si no existe ./gradlew
./gradlew assembleDebug   # APK: app/build/outputs/apk/debug/app-debug.apk
./gradlew test            # tests unitarios (WebOrigin, SignalBuilder, …)
```

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

Dentro de la app: **Perfil → Ajustes → Conexiones → The Show Verse Sync**. Ahí se
ve, en una sola pantalla, si el dispositivo está vinculado y qué permisos faltan,
con su botón para concederlos. El deep link `theshowverse://pair` sigue
funcionando para quien tenga instalada la APK antigua desde el navegador.

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
