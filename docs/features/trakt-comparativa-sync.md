---
tags: [area/features, area/companion, type/analisis]
aliases: [Comparativa Trakt sync, Trakt streaming scrobbler]
---
# Sincronización de streaming: Trakt frente a The Show Verse

Análisis del 24-10-2026 sobre cómo sincroniza Trakt el progreso desde las plataformas de streaming y qué le falta a The Show Verse. No hay código asociado; los huecos están en [[ROADMAP]].

## Qué hay abierto en Trakt

- **El backend de Trakt (Rails) no es público.** Los repositorios de `github.com/trakt` son clientes:
  - `trakt-web` (app.trakt.tv), `trakt-lite`, `trakt-android` y `trakt-apple`;
  - `trakt-api`, el contrato de la API con ts-rest y zod, en `projects/api/src/contracts/*`;
  - las guías de desarrollador.
- **Streaming Scrobbler** (Netflix, Disney+, Max, Prime Video, Hulu, Apple TV+; VIP):
  - Lo hace un tercero, **younify**. Trakt solo expone `GET /younify/connections`, `POST /younify/connect` (que devuelve una URL firmada donde el usuario entra en su plataforma), `POST /younify/users/refresh/:service[/all_data]` y `DELETE /younify/users/services/:service`.
  - Según la prensa, la primera sincronización llega a los ~10 min y después cada 24 h. Solo trae historial y notas.
- **Plex y Jellyfin:** `/v3/users/me/sync/connections`. El servidor se vincula con PIN o QuickConnect.
  - Sincronizaciones `full | incremental | webhook`, cada una con recuentos.
  - Cada conexión tiene un estado (`active | paused | unreachable | unauthorized`) y una URL de webhook.
- **Universal Trakt Scrobbler** (extensión comunitaria, MIT): lee las APIs privadas de cada plataforma con la sesión del usuario.
  - En Netflix usa la vía Falcor `viewingActivity`, y el progreso es `bookmark / duration`.
  - Resuelve el título en este orden: búsqueda exacta por título y año, slug, TMDb y, por último, número de episodio absoluto (anime).
  - Considera el mismo visionado uno a ±26 h de otro ya registrado.

## Tabla comparativa

| Trakt | The Show Verse |
|---|---|
| `POST /scrobble/start\|pause\|stop` (≥ 80 % pasa al historial; 1–79 % se guarda como pausa; 409 si es un duplicado reciente) | `POST /v1/auth/netflix/progress` cada ~30 s. Al **90 %** (`COMPLETE_AT`) pasa a `watch_history`. Las posiciones estimadas nunca completan. |
| `GET /sync/playback` (`progress`, `paused_at`) | `watch_progress` (`position_seconds`, `percent`, `platform`): «Continuar viendo». |
| `POST /sync/history` con `watched_at` o `released\|unknown`; sin deduplicación en el servidor | Importadores (Trakt, Netflix CSV, Letterboxd, IMDb, TMDb). Las fechas falsas de importación se filtran al leer (`realActivityInstant.js`). |
| Deduplicación de UTS (±26 h) | `syncDedupKey`: mismo episodio en ventanas de 12 h, y un registro de serie por día (`netflixSyncDedup.js`), más recibos idempotentes en `streaming_events`. |
| Búsqueda título → TMDb → número absoluto | `src/lib/netflix/resolve.js` y `streamingResolve.js`, más las reglas aprendidas de las correcciones ([[detecciones-streaming]]). |
| younify (sin extensión) | Extensión del navegador más app Android (MediaSession y accesibilidad), sin terceros. Ver [[streaming-sync-reliability]] y [[Companion-Apps]]. |

**Conclusión:** la detección en tiempo real de The Show Verse es equivalente a UTS y no depende de un tercero. La diferencia con Trakt está en la gestión de las conexiones, no en cómo se detecta lo que se ve.

## Huecos

1. **Panel de conexiones por servicio:** una fila por plataforma con estado (conectada, rota), perfil, «última sincronización» y «sincronizar ahora», como `younify/connections`.
2. **Plex y Jellyfin servidor a servidor:** webhook y sondeo desde el backend. Hoy Plex se lee desde el navegador (`src/app/api/plex/sync`).
3. **Escritura hacia Trakt:** enviar a Trakt lo detectado (scrobble y `/sync/history`). Necesita guardar el OAuth de Trakt en el backend; hoy vive en cookies de Next.
4. **Número de episodio absoluto** como último recurso de la resolución (anime en Crunchyroll).
5. **`last_activities`:** marcas por tipo para que los clientes solo pidan lo que cambió.

## Relacionado
- [[streaming-sync-reliability]]
- [[detecciones-streaming]]
- [[hoy]]
