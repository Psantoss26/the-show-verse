---
tags: [area/features, area/companion, type/analisis]
aliases: [Comparativa Trakt sync, Trakt streaming scrobbler]
---
# Sincronización de streaming: Trakt frente a The Show Verse

Análisis del 24-10-2026, revisado el 26-10-2026 con los contratos actuales de `trakt-api`, la página de ajustes de `trakt-web`, el código de scrobble de `trakt-android` y el de Universal Trakt Scrobbler. Trata cómo sincroniza Trakt el progreso desde las plataformas de streaming, por qué su detección en el navegador falla menos y se comporta igual en cada plataforma, y qué le falta a The Show Verse. El hueco 1 está hecho (ver [[detecciones-streaming]]); el resto está en [[ROADMAP]].

## Qué hace The Show Verse

Tres clientes propios, sin terceros, que escriben en el mismo backend:

- **App Android** (*The Show Verse Sync* y la app completa). Lee la MediaSession de 15 plataformas conocidas (19 paquetes) cada 3 s (`MediaListenerService`). Para Prime Video y Crunchyroll, que no publican la serie, lee además el reproductor con el servicio de accesibilidad (`PlayerScreen`). Tras 15 s de reproducción envía un punto de progreso cada 30 s y uno final al parar. La cola local (`ProgressOutbox`) es cifrada y se reintenta con WorkManager.
- **Extensión del navegador** (3.3). Lee el reproductor en el DOM de cualquier sitio permitido (en Netflix, el estado del reproductor y sus metadatos) y envía los mismos puntos de progreso. En Netflix, además, recupera `viewingActivity` cada 30 min desde la última marca de agua (`/netflix/sync/batch`): es el único servicio con recuperación de historial.
- **Backend** (`POST /v1/auth/netflix/progress`).
  - Resuelve TMDb en el cliente o con las reglas aprendidas de las correcciones ([[detecciones-streaming]]).
  - Serializa por usuario y contenido con un bloqueo advisory y guarda recibos idempotentes (`streaming_events`). Descarta los puntos anteriores al último confirmado.
  - Por debajo del 90 % hace upsert en `watch_progress` («Continuar viendo»).
  - Al cruzar el 90 % con posición real (nunca estimada) pasa a `watch_history`. Un nuevo cruce cuenta como otro visionado, con un tiempo mínimo entre visionados para no duplicar.

## Qué hay abierto en Trakt

- **El backend de Trakt (Rails) no es público.** Los repositorios de `github.com/trakt` son clientes:
  - `trakt-web` (app.trakt.tv), `trakt-og`, `trakt-time`, `trakt-android`, `trakt-apple` y `trakt-rippple`;
  - `trakt-api`, el contrato de la API con ts-rest y zod, en `projects/api/src/contracts/*`;
  - `Plex-Trakt-Scrobbler` (abandonado desde 2022) y `discord-presence`.
- **Streaming Scrobbler** (Netflix, Disney+, Max, Prime Video, Hulu, Apple TV+, Paramount+; VIP, en beta). Lo hace un tercero, **younify**, que entra en la cuenta del usuario en cada plataforma. Trakt expone (contrato `younify`, junio de 2026):
  - `GET /younify/connections`: una cuadrícula ordenada de servicios con `vip`, `connectable` (si el plan del usuario permite conectarlo; si no, se ofrece la mejora), `connected`, `active` (`false` = vínculo roto), `profile` y `last_synced_at`;
  - `POST /younify/connect { service_id, return_url }`, que devuelve una URL firmada. El usuario entra en la plataforma en la web de younify y vuelve a `trakt://` o `*.trakt.tv`. Si el plan no lo permite, responde 422;
  - `POST /younify/users/refresh/:service` (incremental) y `…/:service/all_data` (completa), y `DELETE /younify/users/services/:service`.
  - Al conectar pregunta **«¿Importar los datos existentes o solo lo nuevo?»**.
  - Según la prensa, la primera sincronización llega a los ~10 min y después cada 24 h. Trae historial y notas, no progreso en directo.
- **Registro de sincronizaciones** (`/users/syncs`, común a younify, Plex e importadores):
  - cada ejecución es una fila con `kind`, `source`, recuentos por sección (historial, biblioteca, notas, lista de pendientes; películas, episodios, series y temporadas) y `paused_count` / `skipped_count`;
  - `/:id/paused` y `/:id/skipped` paginan los elementos. Cada uno guarda el dato en bruto del origen (`service_id`, `content_id`, `profile_id`, `tmdb_id`, `progress`) más el objeto de Trakt resuelto, o `null` si no se resolvió. La web marca en rojo el campo que hizo omitirlo;
  - **`DELETE /users/syncs/:id` deshace una sincronización entera**: revierte todo lo que importó y la marca como deshecha;
  - la web lo resume en un banner («Los datos se han sincronizado N veces; la más reciente fue…») y avisa de los vínculos rotos («Vuelve a conectar {services}»).
- **Plex y Jellyfin:** `/v3/users/me/sync/connections`. El servidor se vincula con PIN o QuickConnect.
  - Sincronizaciones `full | incremental | webhook`, por servidor o para todos.
  - Cada conexión tiene un estado (`active | paused | unreachable | unauthorized`) y una URL de webhook.
- **Universal Trakt Scrobbler** (extensión comunitaria, MIT): lee las APIs privadas de cada plataforma con la sesión del usuario.
  - En Netflix usa la vía Falcor `viewingActivity`, y el progreso es `bookmark / duration`.
  - Resuelve el título en este orden: búsqueda exacta por título y año, slug, TMDb y, por último, número de episodio absoluto (anime).
  - Considera el mismo visionado uno a ±26 h de otro ya registrado.

## Cómo detecta UTS en cada plataforma

Revisado sobre `src/common/Scrobble*.ts`, `src/apis/Trakt*.ts` y `src/services/*` de UTS. Es lo que explica que falle poco y que se comporte igual en todas las plataformas.

- **Identifica por el id de la plataforma, no por el texto.** Cada servicio declara un `watchingUrlRegex` con el id del contenido: `/watch/<id>` en Netflix, `/play/<guid>` en Disney+, `/player/<id>` en Max, `umc.cmc.*` en Apple TV, `/watch/playback/vod/<id>` en SkyShowtime. Con ese id pide los metadatos a la API interna del servicio (`getItem`) y obtiene título, año, temporada y episodio estructurados. El DOM solo se lee donde no hay API (Prime Video) o se usa el JSON-LD de la página (Apple TV).
- **Netflix sin DOM.** Un script inyectado en la página lee `netflix.appContext.state.playerApp.getState().videoPlayer.playbackStateBySessionId`: `videoId`, `currentTime`, `duration` y `paused` del reproductor. Con el `videoId` pide `metadata` a shakti, que da `currentEpisode` y la lista de temporadas con su `seq`. Si la serie es una colección (`hiddenEpisodeNumbers`), no usa los números y busca el episodio por su nombre. Si los metadatos aún no existen (directos), recurre al historial reciente y reintenta el id cada 30 s.
- **Una cascada común, con sobrescrituras por servicio.** `ScrobbleParser` prueba en orden, para la reproducción: `<video>` → script inyectado → DOM → personalizado; para el contenido: API con el id → script inyectado → DOM → personalizado; y para el id: URL → script → DOM → personalizado. Cada servicio solo sobrescribe el paso que necesita. La reproducción solo cuenta con progreso > 0 y el contenido se busca una vez por reproducción.
- **Cambio de contenido sin perder el final.** Prime Video y Apple TV comparan la identidad de lo que suena en cada vuelta. Si cambia (autoplay), devuelven una vuelta vacía para que se envíe el `stop` del anterior con su último progreso antes de empezar el nuevo. Apple TV da por terminado el contenido al llegar `ended` o al 99,9 %.
- **Caché por id del servicio.** `itemsToTraktItems` guarda `servicio:id → elemento de Trakt`: un contenido ya resuelto no se vuelve a buscar. Las correcciones del usuario se guardan con la misma clave.
- **Búsqueda del episodio con red de seguridad:** título y año exactos → slug transliterado → TMDb → numeración absoluta (anime). Un nombre genérico («Episode 12») salta directo a la numeración absoluta.
- **Ciclo `start / pause / stop`** cada 0,5 s de sondeo. El estado se guarda en almacenamiento para enviar el `stop` aunque se cierre la pestaña. El servidor decide: ≥ 80 % es visionado, 1–79 % es pausa, < 1 % da 422 y un duplicado reciente da 409 con `expires_at`.
- **Recuperación de historial** (`loadHistoryItems` + `AutoSync` desde la última sincronización) en Netflix, Prime Video, Max, Crunchyroll, discovery+, Viaplay, Crave, MUBI, ADN, NRK y TV 2 Play, entre otras. No en Disney+ ni Apple TV.

Donde Trakt **no** va por delante es en el envío: UTS no tiene cola (un fallo solo emite `SCROBBLE_ERROR`), y la app de Android TV de Trakt programa el `stop` con WorkManager pero con `MAX_RETRY_ATTEMPTS = 1` y `ExistingWorkPolicy.REPLACE`, así que en la práctica no reintenta y un `stop` nuevo pisa al pendiente. La cola persistente con `eventId`, recibos idempotentes y orden por usuario y contenido de The Show Verse es más robusta y no hay que copiar nada de ahí.

### Frente a The Show Verse

- La extensión ya extraía el id de la plataforma (`contentId` en `platform-enhancers.js`), pero el servidor resolvía **siempre por texto** y el id solo se guardaba como `lastNetflixVideoId`. Desde el hueco 1 se consulta antes de buscar. Las reglas aprendidas también van sobre el texto (`detectionFingerprint`: `plataforma|texto`). Por eso un cambio de DOM o un texto de relleno puede desviar una detección que ya se resolvió bien antes.
- En Netflix se leía el título del DOM (`[data-uia="video-title"]`), que Netflix retira durante la reproducción, y la temporada salía de un badge de texto. Desde la extensión 3.3 se usan el estado del reproductor y los metadatos de Netflix; el DOM queda de respaldo.
- La app Android no lee `METADATA_KEY_MEDIA_ID` de la MediaSession; para las apps que lo publican sería el mismo tipo de id.
- La detección del navegador es una cascada genérica (`detection-core.js`) más refinadores que solo afinan campos; no hay un paso de «API del servicio» ni de «estado del reproductor» por plataforma.

## Tabla comparativa

| Trakt | The Show Verse |
|---|---|
| younify: lote cada ~24 h desde la cuenta del servicio; ve lo que se vio en cualquier dispositivo, televisores incluidos | En directo desde el móvil y el navegador vinculados; lo visto en un televisor no llega. Netflix también recupera su historial cada 30 min desde la extensión. |
| `POST /scrobble/start\|pause\|stop` (≥ 80 % pasa al historial; 1–79 % se guarda como pausa; 409 si es un duplicado reciente) | Punto de progreso cada ~30 s. Al **90 %** (`COMPLETE_AT`) pasa a `watch_history`. Las posiciones estimadas nunca completan. |
| `GET /sync/playback` (`progress`, `paused_at`) | `watch_progress` (`position_seconds`, `percent`, `platform`): «Continuar viendo». |
| `GET /younify/connections`: estado, perfil y última sincronización por servicio; mejora a VIP si no es conectable | `GET /v1/auth/connections` solo dice si `netflix` (el token de sincronización, que cubre todas las plataformas) está conectado y con qué dispositivo. |
| `/users/syncs`: registro con recuentos, elementos omitidos y **deshacer** | Corrección **por detección** (`/detections`, `CorreccionActivity`) con aprendizaje global. No hay registro por ejecución ni forma de deshacer un lote de `viewingActivity`. |
| Elementos omitidos con el motivo | Las observaciones sin resolver se descartan tras tres 404/422 y solo dejan un diagnóstico en el cliente. |
| `POST /sync/history` con `watched_at` o `released\|unknown`; sin deduplicación en el servidor | Importadores (Trakt, Netflix CSV, Letterboxd, IMDb, TMDb). Las fechas falsas de importación se filtran al leer (`realActivityInstant.js`). |
| Deduplicación de UTS (±26 h) | Cruce del 90 % más tiempo mínimo entre visionados en tiempo real; `syncDedupKey` (episodio en ventanas de 12 h, un registro de serie por día) en los lotes. Recibos idempotentes en `streaming_events`. |
| Identidad por id del servicio y su API de metadatos; caché `servicio:id` | Mapa `(plataforma, content_id)` → TMDb consultado antes del texto (Netflix, Max, Disney+, Crunchyroll); la identidad de partida sigue saliendo del texto del reproductor. |
| Búsqueda título → slug → TMDb → número absoluto | `src/lib/netflix/resolve.js` y `streamingResolve.js`, más las reglas aprendidas de las correcciones ([[detecciones-streaming]]). |
| Sin cola de envío (UTS); un solo intento en Android TV | Cola persistente con reintentos, `eventId` e idempotencia en el servidor. |
| VIP para casi todo el streaming | Sin restricción por plan. En `backend/src/lib/billing/plans.js` solo `plex` está reservado a Pro. |

**Conclusión:** son modelos complementarios. The Show Verse detecta en directo, con progreso, y no depende de un tercero. Trakt lee la cuenta del servicio una vez al día, así que ve también lo que se ve en el televisor. Donde Trakt va por delante es en lo que rodea a la sincronización: estado por servicio, un registro auditable de cada ejecución, lo que no se pudo importar y deshacer. Y su ecosistema (UTS) acierta más porque identifica cada contenido por el id que le da la propia plataforma; el envío, en cambio, es más frágil que el nuestro.

## Huecos

Los cuatro primeros son los que más reducen fallos y más igualan el comportamiento entre plataformas.

1. ✅ **El id de la plataforma como clave de resolución** (hecho el 26-10-2026, `streaming_content_ids`; Android sigue pendiente). Una tabla `(plataforma, content_id) → tipo, TMDb, temporada, episodio`, rellenada con las resoluciones confirmadas (visionado completado o coincidencia exacta) y con las correcciones, que se consulta antes de buscar por texto. Las reglas de corrección pasan a valer también por id, no solo por huella de texto. Android la usaría donde la MediaSession publique `METADATA_KEY_MEDIA_ID`.
2. ✅ **Netflix desde el reproductor, no desde el DOM** (hecho el 26-10-2026, extensión 3.3; sin probar con una cuenta real): script en el mundo de la página (`world: "MAIN"`) que lea `playerApp.getState()` (id, posición, duración, pausa) y `metadata?movieid=` de shakti con el `BUILD_IDENTIFIER` que ya se obtiene. Temporada y episodio salen de `seq`; en colecciones (`hiddenEpisodeNumbers`), por nombre de episodio.
3. **Contrato común por plataforma**, como `ScrobbleParser`: id (URL → estado de la página → DOM), reproducción (`<video>` → estado interno → DOM) e identidad (API o JSON-LD → DOM), cada plataforma con solo los pasos que necesite. Apple TV por JSON-LD y `apple:content_id`; Disney+ y Max por su id de URL. Cada paso con su caso en `players.test.js`.
4. **Recuperación de historial más allá de Netflix**, reutilizando `/netflix/sync/batch`: Prime Video, Max y Crunchyroll tienen historial consultable con la sesión del navegador (UTS lo hace). Cubre lo visto en el televisor y las sesiones perdidas.
5. **Panel de conexiones por servicio:** una fila por plataforma, a partir de las detecciones y de `watch_progress.platform`. Cada fila con estado (activa, sin actividad, token revocado), dispositivo, «última sincronización» y, en Netflix, «sincronizar ahora» (completa o incremental), como `younify/connections`.
6. **Registro de sincronizaciones con deshacer:** una fila por lote de `viewingActivity` e importador, con recuentos y `DELETE` que revierta lo que insertó. Exige guardar en `watch_history` de qué lote viene cada fila.
7. 🟡 **Elementos omitidos visibles** (parcial, 26-10-2026: `streaming_discards`, resumen por plataforma y lista en `/detections`, solo lectura). Falta poder corregirlos a mano desde ahí, como una detección.
8. **Importación inicial opcional:** al vincular Netflix, preguntar si recuperar todo el historial o solo lo nuevo. Hoy siempre se recupera desde la marca de agua.
9. **Plex y Jellyfin servidor a servidor:** webhook y sondeo desde el backend. Hoy Plex se lee desde el navegador (`src/app/api/plex/sync`).
10. **Escritura hacia Trakt:** enviar a Trakt lo detectado (scrobble y `/sync/history`). Necesita guardar el OAuth de Trakt en el backend; hoy vive en cookies de Next.
11. **Número de episodio absoluto** como último recurso de la resolución (anime en Crunchyroll), y salto directo a él cuando el nombre del episodio es genérico.
12. **`last_activities`:** marcas por tipo para que los clientes solo pidan lo que cambió.
13. **Lo visto en el televisor:** solo lo cubre leer la cuenta del servicio (younify u otro proveedor) o la recuperación de historial de cada plataforma (hueco 4). Disney+ y Apple TV no tienen historial accesible ni en UTS.

## Relacionado
- [[streaming-sync-reliability]]
- [[detecciones-streaming]]
- [[Companion-Apps]]
- [[hoy]]
