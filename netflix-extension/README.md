---
tags: [area/integracion, type/referencia, plataforma/navegador]
---
# Netflix / Web — Extensión de navegador (The Show Verse Sync)

> Extensión de Chrome (Manifest V3) que observa lo que se reproduce en Netflix y otras
> webs de streaming y lo sincroniza en tiempo real con el historial de The Show Verse.

## Qué hace

- Detecta qué título/episodio se está reproduciendo en la pestaña activa (Netflix,
  Prime Video, Max/HBO, Disney+, Plex, Crunchyroll, Movistar+, Apple TV+, Filmin,
  SkyShowtime, Pluto TV, Rakuten TV, Atresplayer, RTVE, y cualquier sitio que el
  usuario añada manualmente) y envía la señal al backend para resolverla contra TMDb
  e insertarla en el historial de visionado.
- Además, para Netflix en concreto, lee el historial real de "Actividad de
  visualización" de la cuenta (API interna `shakti`, reutilizando las cookies de
  sesión) y hace un backfill/sincronización incremental periódica, sin depender de
  tener la pestaña de reproducción abierta.
- Muestra un indicador flotante ("acceso rápido") con enlace directo a la ficha del
  título en The Show Verse en cuanto se resuelve, tanto viendo como navegando el
  catálogo.
- Se vincula a la cuenta de The Show Verse mediante un token de sincronización
  (`netflixSyncToken`) que la propia web genera y entrega a la extensión.

## Arquitectura (ficheros)

| Fichero | Responsabilidad |
|---|---|
| `manifest.json` | Manifest V3. Declara permisos (`cookies`, `storage`, `alarms`, `scripting`, `activeTab`), `host_permissions` fijos (Netflix + orígenes de The Show Verse), `optional_host_permissions` (`*://*/*`, para sitios añadidos por el usuario), `externally_connectable` (para que la web hable con la extensión) y las dos listas de `content_scripts`: una para las plataformas de streaming soportadas y otra para los orígenes de The Show Verse. |
| `background.js` | Service worker. Orquesta todo: recibe mensajes de los content scripts (`syncWatch`, `syncNetflix`, `getNetflixDetails`, `storeSyncConfig`/`clearSyncConfig`, `setSyncPaused`, `registerSite`/`unregisterSite`...), hace fetch al backend, gestiona el registro dinámico de content scripts para sitios añadidos por el usuario y ejecuta el polling periódico de la actividad real de Netflix (`chrome.alarms`). También expone `onMessageExternal` para que la web (orígenes en `externally_connectable`) pueda vincular/desvincular la sincronización directamente. |
| `content.js` | Content script "universal" inyectado en las plataformas soportadas. Sondea cada 2s (`POLL_MS`), construye el `PlaybackSignal` con `detection-core.js` + `platform-enhancers.js`, filtra nombres de plataforma sueltos, deduplica por clave de contenido y envía `syncWatch` al service worker. También dibuja el indicador flotante de acceso rápido (Shadow DOM, estilo "liquid glass"). |
| `content-showverse.js` | Content script inyectado solo en las páginas de The Show Verse. Puente evento↔mensaje: registra el origin activo, responde al ping de "extensión instalada", y reenvía a `background.js` las peticiones de la web para detectar cuenta de Netflix, vincular/desvincular el token de sync y forzar una sincronización manual del historial. |
| `detection-core.js` | Núcleo puro y testeable (patrón UMD, sin tocar `document`/`location`). Expone `self.TSVDetection`: parseo de temporada/episodio multi-idioma, limpieza de título de pestaña, escaneo de "badges" T/E en el DOM, elección de la carátula más grande de Media Session, construcción del `PlaybackSignal` y de la URL de detalles de The Show Verse. |
| `detection-core.test.js` | Tests unitarios de `detection-core.js` (`node:test`), sin navegador. |
| `platform-enhancers.js` | Refinadores opcionales por plataforma (`self.TSVEnhancers`). Uno por sitio (Netflix, Prime, Max, Disney+, Plex, Crunchyroll) que solo *afina* campos concretos (contentId desde la URL, selectores de título/subtítulo propios) sobre la señal base; nunca lanzan y si un selector cambia la señal genérica se mantiene intacta. |
| `popup.html` / `popup.js` | UI del icono de la extensión: estado de la sincronización (activa/pausada/no vinculada), email y perfil de Netflix vinculado, botón de pausa/reanudación, interruptor del indicador de acceso rápido, registro de actividad reciente (`chrome.storage.local.logs`) y gestión de "sitios de streaming" añadidos manualmente (solicita permiso de host y registra el content script en caliente). |

## Detección de reproducción

El motor es **Media-Session-first**: prioriza `navigator.mediaSession.metadata`
(que la mayoría de reproductores web rellenan para los controles del sistema/
pestaña) sobre cualquier selector CSS específico de plataforma. `detection-core.js`
(`buildPlaybackSignal`) decide:

1. Si hay `artist`/`album` en Media Session, se trata como serie (`showName` =
   artist/album, `episodeName` = title); si no, como película (`movieTitle` = title).
2. Temporada/episodio: escaneo genérico multi-idioma de "badges" en el DOM
   (`findSeasonEpisodeBadge`, admite `T4:E5`, `S4 E1`, `Temporada 4: Episodio 1`,
   `Cap. 5`...). La temporada **nunca se asume 1** si no aparece explícita: se deja
   `null` y la decide el backend (evita registrar T1 al ver, por ejemplo, la T4).
3. Fallback: título de la pestaña (`document.title`), limpiando prefijos/sufijos de
   plataforma (`stripPlatformPrefix`) — nunca se sincroniza un nombre de plataforma
   suelto ("Netflix") como si fuera un título real.
4. `platform-enhancers.js` afina después, si aplica, el `contentId` (parseado de la
   URL: `/watch/<id>` en Netflix, `gti=`/`/detail/` en Prime, etc.) y los selectores
   de título/subtítulo propios de cada plataforma (`REFINERS`: netflix, prime, max,
   disney, plex, crunchyroll).

`content.js` solo considera que hay reproducción real cuando existe un `<video>`
principal (≥320×180px, para descartar miniaturas/anuncios en iframes) con
`currentTime ≥ 15s`; por debajo de ese umbral no cuenta para el historial, aunque sí
puede mostrarse el indicador de ficha (`resolveOnly`, ver más abajo). Cachea el
último título bueno detectado por vídeo (`lastGood`) porque en Netflix el overlay de
título desaparece del DOM durante la reproducción.

## Flujo de datos hacia The Show Verse

Hay dos vías de sincronización, ambas hacia el mismo backend Next.js:

- **Reproducción en vivo (todas las plataformas soportadas).** `content.js` envía un
  mensaje `syncWatch` al service worker con el `PlaybackSignal` completo (título,
  temporada/episodio, `seasonEpisodeText`, `tabTitle`, carátula, duración/posición).
  `background.js` reenvía esto por `POST` a **`/api/netflix/extension-sync`**
  (ruta Next.js en `src/app/api/netflix/extension-sync/route.js`) con
  `Authorization: Bearer <netflixSyncToken>`. Esa ruta arma variantes de consulta
  (`buildQueryVariants`), resuelve contra TMDb (`resolveStreamingEntity`, proxy
  backend + fallback directo es-ES/en-US) y, si hay match, hace `POST` al backend
  Fastify (`/v1/auth/netflix/sync`) que inserta en `watch_history`. Si no se puede
  fijar el episodio exacto se registra a nivel de serie con `confidence: "low"` en
  vez de descartarse. Cuando el mensaje lleva `resolveOnly: true` (el usuario está
  navegando la ficha, sin reproducir) la ruta solo resuelve el título contra TMDb y
  lo devuelve —sin tocar el historial— para pintar el indicador de acceso rápido.
- **Backfill/histórico de Netflix (solo Netflix).** `background.js` reutiliza las
  cookies de sesión del usuario (`credentials: "include"`) para leer la API interna
  `https://www.netflix.com/api/shakti/<BUILD_ID>/viewingactivity` y descarga páginas
  de actividad real. Las normaliza y las envía en lotes de 200 a
  **`/api/netflix/extension-import`** (`src/app/api/netflix/extension-import/route.js`).
  Se ejecuta un backfill completo al vincular la cuenta y, después, una
  sincronización incremental cada 30 minutos vía `chrome.alarms`, avanzando una
  marca de agua (`netflixActivityHighWater`) para no reprocesar lo ya importado.

La vinculación inicial (obtener y guardar el `netflixSyncToken`) ocurre desde la
propia web: `content-showverse.js` escucha eventos custom (`request-netflix-bind`,
`request-netflix-unbind`, `request-netflix-details`, `request-netflix-sync`)
disparados por la página de ajustes de The Show Verse y los reenvía como mensajes
internos (`storeSyncConfig`, `clearSyncConfig`, `getNetflixDetails`,
`syncNetflixActivity`) a `background.js`. La web también puede hablar directamente
con la extensión vía `chrome.runtime.sendMessage` externo gracias a
`externally_connectable` (`onMessageExternal` en `background.js`), sin pasar por el
content script puente.

## Instalación (modo desarrollador)

1. Abre `chrome://extensions` (o el equivalente en un navegador basado en Chromium).
2. Activa el **Modo de desarrollador** (interruptor arriba a la derecha).
3. Pulsa **Cargar descomprimida** y selecciona la carpeta `netflix-extension/` de
   este repo (contiene el `manifest.json`, Manifest V3, versión declarada `2.5`).
4. Verifica que el icono de "The Show Verse - Streaming Sync" aparece en la barra de
   extensiones. Abre el popup para comprobar el estado ("Sesión no detectada" hasta
   vincular la cuenta).
5. Entra en The Show Verse (local `http://localhost:3000` o el dominio de
   producción, ambos ya cubiertos por `host_permissions`) → `Perfil → Ajustes →
   Plataformas de streaming → Conectar` para generar y guardar el token de
   sincronización en la extensión.
6. Reproduce algo en Netflix (u otra plataforma soportada) durante al menos 15
   segundos; revisa el registro de "Actividad Reciente" en el popup o la consola del
   content script (`[The Show Verse] ...`) para confirmar que se sincroniza.
7. Tras editar cualquier fichero, vuelve a `chrome://extensions` y pulsa
   **Actualizar** en la tarjeta de la extensión para recargar el código.

## Relacionado

- [[Home]]
- [[Companion-Apps]]
- [[2026-07-03-universal-streaming-sync-design|Diseño del Universal Streaming Sync]]
- [[android-companion/README|App companion de Android]] — misma sincronización pero desde
  apps nativas (Netflix, Disney+, Prime Video...) vía `NotificationListenerService`,
  reutilizando el mismo endpoint `/api/netflix/extension-sync`.
