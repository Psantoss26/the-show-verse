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

En Sync, «Abrir ficha» busca la PWA instalada como WebAPK de Chrome (por sus
metadatos, en la actividad o en la aplicación) cuyo ámbito contenga la ficha, y la
abre directamente. Si no la encuentra (PWA instalada como acceso directo en
Samsung Internet o Firefox, Chrome sin Google Play, o vinculada con otra
dirección), abre el enlace en el navegador, que lo pasa a la PWA si está en su
ámbito. Antes mostraba «No se encuentra la app web» aunque la PWA estuviera
instalada. Ese aviso solo queda para cuando no hay nada que pueda abrir el
enlace.

Las pantallas nativas (panel, detecciones, corrección y, en la completa, servidor
y rendimiento) usan `Theme.TSVSync`, siempre oscuro sobre negro como la PWA, y
llaman a `BarrasDelSistema.ajustar` tras `setContentView`: con targetSdk 35,
Android 15 dibuja de borde a borde, así que el contenido se aparta de las barras,
la cámara y el teclado con sus huecos (sustituye a `adjustResize`).

Al detectar una ficha navegando, el aviso lleva de título solo el de la película
o serie (`notif_browsing` en `src/main`), igual en Sync y en la app completa.

La sincronización es la misma en las dos apps: servicios, detección, avisos y
cola de envíos viven en `src/main`. Solo cambia lo que rodea a cada una: dónde
se abre la ficha al tocar el aviso (`AppVariante`: el WebView en la completa, la
PWA en Sync), desde dónde se vincula (la web de la propia app o el enlace
`theshowverse://pair`), los textos de «no vinculado» y el reparto con
`Delegacion`. El permiso de notificaciones (Android 13+) se pide en las dos al
vincular o al encender el aviso: en Sync desde su panel y en la completa desde
el puente de la web (`pair`, `setIndicator`).

El registro de detecciones del móvil es **nativo**. Va con el token de
vinculación contra `/api/streaming/device/*`, porque Sync no tiene sesión web.
La web (`/detections`) solo enseña las de la extensión del navegador: el
backend guarda el origen de cada detección (`android` / `browser`).

### La app completa

```
WebAppActivity  ── carcasa: WebView a pantalla completa con theshowverse.com
      │              (sesión, tráileres, enlaces externos, offline; sin
      │              deslizar para recargar: reintentar solo tras error)
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
| Gesto de atrás predictivo: mientras deslizas, la web se encoge, se aparta del borde, sigue un poco al dedo en vertical y redondea las esquinas, como Chrome en la PWA; al cancelar se queda. Al soltar hay transición entre páginas: una captura de la página actual (`PixelCopy`, hecha antes de encoger nada) sale en el acto deslizándose hacia el lado contrario al borde (450 ms, curva suave que empieza a moverse en el acto sin tirón y frena largo al final), sin esperar a la web. Debajo se ve la página anterior desde el primer fotograma (también mientras se arrastra): la app guarda una foto de cada página en cada toque (`PixelCopy` en `ACTION_DOWN`) y, cuando el historial avanza (`doUpdateVisitedHistory`), la asocia a la entrada que se deja, con su URL (hasta 4, `FotosHistorial`). Una foto solo se enseña si la entrada a la que se vuelve sigue teniendo esa URL, así que nunca sale la de otra página; con el historial del WebView lleno (50 entradas, cada página nueva borra la más antigua y todas bajan un puesto) las fotos bajan con sus entradas. Esa foto tapa la web mientras navega atrás y, cuando la web avisa de que la página anterior está pintada (`TSVAndroidBridge.backPainted()`, desde `AndroidBackPaintSignal`, como mucho 900 ms; 250 ms con una web que no avisa), se funde (200 ms) con la página real. Sin foto (se llegó sin tocar, o tras reabrir la app), un velo liso tapa la web, la captura sale igual en el acto y el velo se funde cuando la web pinta. Mientras deslizas, la web se encoge desde el primer fotograma sin esperar a la captura: `PixelCopy` copia el último fotograma ya entregado y la petición llega al hilo de render antes que el fotograma encogido. La misma transición se hace al pulsar atrás sin gesto (tres botones, tecla). En la primera página y con un vídeo a pantalla completa no hay transición: en la primera el gesto es del sistema, que anima la salida al inicio. En ColorOS (OnePlus, Oppo) el encogido mientras se arrastra solo se ve con «Ajustes › Sistema y actualización › Navegación por el sistema › Animaciones de deslizamiento (beta)» activado, que viene apagado; sin él solo llega la pulsación al soltar, y se anima la transición. No depende del `targetSdk` (probado con 35 y 36) Con un modal de la web abierto (la web lo avisa con `setModalOpen`), atrás solo lo cierra: sin encogido ni transición de página. Mientras deslizas, la app pasa el gesto a la web (`window.__svModalBackGesture`, `GestoModal`) y lo que se mueve es solo el panel del modal: se encoge hasta el 92 %, se aparta 24 px del borde y redondea las esquinas, sobre su velo difuminado quieto; al soltar se cierra con su animación de salida desde donde quedó, y al cancelar vuelve a su sitio. | `AtrasPredictivo`, `GestoModal` (con tests) |
| Barra de estado y barra de navegación visibles y TRANSPARENTES, con la web por detrás, como la app de Trakt (`enableEdgeToEdge` + `SystemBarStyle.dark(Color.TRANSPARENT)`); la web baja su barra superior y sube la inferior lo que mide cada una (`statusBarHeight()` y `navigationBarHeight()` del puente). Huecos leídos ignorando la visibilidad de las barras, para que la miniatura de recientes no salga duplicada | `configurarVentana()` y `configurarInsets()` en `WebAppActivity` |
| Liquid glass con desenfoque real y scroll fluido a 120 Hz: la app pide a la pantalla su modo más alto hasta 120 Hz con la resolución actual (`FrecuenciaPantalla`; en las de 144/165 se queda en 120, y si todos pasan de 120, el más alto). A 120 Hz el WebView tiene 8,3 ms por fotograma; en las fichas no llegaba por el segundo desenfoque con máscara del canto de cada cristal (`.sv-glass-rim`), que solo reprocesa el propio cristal (es su «backdrop root») y apenas se ve. La web lo quita con `html[data-android-app]` (globals.css). Medido en la ficha de una película con `dumpsys SurfaceFlinger --timestats`: 1,6-2,2 % de fotogramas tarde a 120 Hz sin él, 6-9 % con él, 2-3 % en Chrome a 90 Hz. La web no quita el resto de `backdrop-filter` en la app (lo hizo hasta noviembre de 2026, con un velo «escarcha» que imitaba el cristal). «Quitar desenfoques» de Rendimiento sigue como prueba. | `FrecuenciaPantalla.kt`, `WebAppActivity` |
| Sin barra de estado: la barra superior de la web ocupa su franja, sin logo y con los botones de los extremos encajados en las esquinas redondeadas. La app oculta la barra de estado (sale un momento al deslizar desde arriba) y pasa por el puente el centro de la cámara (`cameraCenterY()`, del recorte de pantalla) y el radio de las esquinas (`screenCornerRadius()`, `WindowInsets.getRoundedCorner`, Android 12+); la web los lee antes del primer pintado (`data-android-immersive`, ver `globals.css`). La búsqueda móvil se abre bajo la barra superior, que sigue visible por encima de su velo (`.sv-mobile-search`). El vídeo a pantalla completa oculta además la barra de navegación. **Segundo modo**, en Ajustes › Preferencias («Mostrar la barra de notificaciones», solo dentro de la app): la barra de estado se ve, transparente sobre el fondo de cada página; la barra superior baja su alto (`--sv-android-top`) y las portadas móviles de las fichas empiezan justo debajo, con el póster prolongado hacia arriba y difuminado en esa franja; el desenfoque es progresivo (`MOBILE_STATUS_STRIP_LAYERS`): pleno solo en el 20 % de arriba de la franja y, desde ahí hasta 10 px dentro del póster, cuatro capas de 12, 6, 3 y 1,5 px de desenfoque que se relevan con smootherstep sobre una copia nítida del reflejo, así que no queda borde ni corte y el póster se ve casi entero; las capas bajan 56 px (`MOBILE_STATUS_STRIP_LAYER_PX`, ocultas por su máscara) para que el canto del desenfoque no aclare nada visible, y sobresale 24 px por cada lado para que el desenfoque no oscurezca los laterales (esa capa ancha pinta la imagen con el ancho de la portada y luego la ensancha, para que `object-cover` la recorte igual que la portada). El reflejo usa solo las filas de arriba del póster que caben en la franja (`StatusStripMirror`); por encima, fuera de pantalla, se estira la última, así el desenfoque no trae colores de más abajo. En los episodios prolonga el primer fotograma de la portada apilada (`topEdge`) (`data-android-statusbar`, `--sv-cover-raise` y `--sv-cover-strip` en `globals.css`, `MOBILE_STATUS_STRIP_LAYERS` en `MobileHeroCover`). Se guarda en el dispositivo (`Prefs.statusBarVisible`), el puente lo expone (`statusBarVisible()`, `setStatusBarVisible()`) y se aplica al momento, sin recargar | `WebAppActivity`, `WebAppBridge`, `Prefs` |
| Subir foto de perfil (`<input type=file>`) | `onShowFileChooser` |
| Enlaces a TMDb, YouTube… | pestaña personalizada del navegador |
| Icono de Plex de las fichas (ficha `https://watch.plex.tv/movie|show/<slug>`) | se abre en la app de Plex, en esa ficha, con un intent dirigido a `com.plexapp.android` (Plex no tiene ese dominio verificado como App Link y, sin dirigirlo, Android lo mandaba al navegador); sin la app, pestaña personalizada. En la app la web siempre entrega esa ficha, también en tabletas con ratón; los títulos sin ficha pública siguen abriendo la ficha del servidor en el navegador. La comprobación va antes que la de logins de proveedores: `watch.plex.tv` es subdominio de `plex.tv` y antes se quedaba cargado dentro del WebView. Límite de Plex: solo navega a la ficha si arranca en frío; si ya estaba abierta, pasa al frente en la pantalla que tenía (ignora el enlace con cualquier flag, `plex://preplay` o `branch_force_new_session`, probado en Plex 2026.22) | `WebOrigin.isPlexTitle` (con tests), `abrirEnPlex` en `WebAppActivity`, `getPlexLink` (`plexLinks.js`) |
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
