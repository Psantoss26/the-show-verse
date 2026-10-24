---
tags: [area/frontend, type/referencia]
---
# Páginas del App Router (`src/app`)

> Mapa de todas las rutas de `src/app`: páginas de UI y rutas de API internas. Revisado el 22-10-2026.

## Layout raíz y middleware

- `src/app/layout.jsx` — `RootLayout` de la app (`<html lang="es">`). Monta `AuthProvider` ([[Frontend#Organización de src|AuthContext]]), `Navbar`, `ScrollRestoration`, `PwaManager` y Vercel `Analytics`/`SpeedInsights`; define `metadata`/`viewport` globales y precarga (`preconnect`/`dns-prefetch`) TMDb, YouTube y Vimeo para que los trailers en hover carguen casi al instante. Recibe además el slot paralelo `@overlay` (fichas superpuestas, ver abajo). Hay layouts anidados persistentes en `/profile` y `/u/[username]` para conservar la cabecera del perfil al cambiar de pestaña.
- `middleware.js` (raíz del repo) — se ejecuta en casi toda ruta de página y `/api/*` (ver matcher, excluye estáticos): aplica el **gate de acceso privado** (cookie `showverse_device_access` cuando `SHOWVERSE_PRIVATE_ACCESS_KEY` está activa) y **reescribe** `/details/{movie|tv|person}/[id]` a `/s/{movie|tv|person}/[id]` para user-agents de bots/crawlers (WhatsApp, Facebook, Twitter, Slack, Discord, Telegram, Google, Bing...).

## Páginas de catálogo y dashboard

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/` | `page.jsx` + `MainDashboardClient.jsx` | Home/dashboard principal: filas de tendencias/populares/recomendados vía TMDb + engine de recomendaciones propia. `force-static`, `revalidate: 3600`. |
| `/movies` | `page.jsx` + `MoviesPageClient.jsx` | Dashboard de películas (secciones por género, mind-bending, tendencias...). |
| `/series` | `page.jsx` + `SeriesPageClient.jsx` | Dashboard de series (equivalente a `/movies` para TV), `revalidate: 1800`. |
| `/dashboard/[section]` | `page.jsx` + `DashboardSectionClient.jsx` | Página «Ver todos» de una sección (`tendencias`, `populares`, `recomendados`, `mas-esperadas`). La lista llega ya en el RSC desde `/v1/dashboard/sections/{key}`. |
| `/recommendations` | `RecommendationsClient.jsx` | Baraja de recomendaciones para deslizar (descartar, pendientes, favoritos, lista). Ver [[paginas-de-usuario]]. |
| `/recap`, `/recap/[year]` | `page.jsx` → `src/components/recap/RecapClient.jsx` | «Tu año en The Show Verse». Ver [[recap-anual]]. |
| `/discover` | `DiscoverClient.jsx` | Descubrimiento con filtros (género, año, plataforma...) sobre `discoverMovies`/`discoverTV`. |
| `/calendar` | `page.jsx` + `CalendarClient.jsx` | Calendario de próximos estrenos/episodios (vista mes/semana). Los episodios salen de `/v1/calendar/episodes` (BBDD propia + TMDb, sin Trakt). |

## Fichas de detalle

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/details/[type]/[id]` | `page.jsx` + `DetailsPageLoader` → `DetailsClient` | Ficha genérica de película o serie (`type` = `movie`\|`tv`); `getDetails` con `append_to_response` amplio, `revalidate: 600`. El título de cada sección abre su vista lateral; la de «Portadas y fondos» (`lib/details/artworkSheetTabs.js`) tiene las mismas pestañas que la galería y en «Logo» enseña solo logos en español e inglés (todos si el título no tiene ninguno). |
| `/details/tv/[id]` | `page.jsx` (mismo `DetailsPageLoader`) | Alias explícito para series. |
| `/details/tv/[id]/season/[season]` | `SeasonDetailsClient.jsx` | Detalle de una temporada (episodios, valoraciones). El servidor trae los vídeos de la temporada en la misma petición (`append_to_response=videos`) y los pasa como `initialSeasonVideos`: «Ver tráiler» nace encendido o apagado, sin buscar vídeos en el cliente. |
| `/details/tv/[id]/season/[season]/episode/[episode]` | `EpisodeDetailsClient.jsx` | Detalle de episodio (créditos, valoraciones, navegación a episodio siguiente/anterior). Anterior/siguiente de temporada y episodio (flechas y gesto móvil) pasa por `navigateSubrouteHolding` (`lib/navigation/subrouteHoldTransition.js`): una copia de la ficha actual queda encima hasta que la nueva está montada y se funde, en vez de enseñar la superficie oscura de `details/loading.jsx`. La copia va sin animaciones (`[data-subroute-snapshot]` en `globals.css`; lo que se animaba queda en su valor de ese instante, p. ej. el fundido por scroll), en `z-index: 29` para no tapar la barra inferior móvil (`z-30`), y las entradas de primera apertura de la ficha nueva (póster, logo, cascada de botones) se dan por terminadas durante el relevo: si no, el gesto móvil parpadeaba. Además, con la ficha en reposo se precarga COMPLETA la anterior y la siguiente (`useWarmSubrouteNeighbors`, `router.prefetch(href, { kind: "full" })`; también al apuntar la flecha): medido en producción, la ficha nueva se monta a ~45-80 ms del clic y se ve a ~260-330 ms (sin precarga, ~360 y ~530 ms). En `next dev` Next no precarga nada. |
| `/details/person/[id]` | `page.jsx` + `ActorDetails.jsx` | Ficha de actor/actriz: biografía, "known for", créditos combinados. |
| `@overlay/(.)details/...` | Reexportan las páginas de `/details` | Rutas interceptoras: al navegar a una ficha desde la app se pinta encima y la página de origen queda montada y oculta (`OverlayRouteHost`). Recargar sirve la ficha completa. |
| `/embed/details/[...segments]` | `page.jsx` | Ficha móvil incrustada para la «vista teléfono» del panel lateral de escritorio (`noindex`). |
| `/s/movie/[id]`, `/s/tv/[id]`, `/s/person/[id]` | `route.js` (runtime `nodejs`) | Versión ligera server-only en HTML plano con metadatos OG/Twitter, pensada para bots de redes sociales (destino del rewrite del middleware), no para usuarios humanos. |

## Listas, favoritos y estados de usuario

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/favorites` | `FavoritesClient.jsx` | Favoritos del usuario (TMDb account states). |
| `/watchlist` | `WatchlistClient.jsx` | Pendientes de ver. |
| `/continue-watching` | `ContinueWatchingClient.jsx` | Reproducciones en curso (automáticas y manuales). |
| `/in-progress` | `InProgressClient.jsx` | Series en progreso con detalle de avance por temporada/episodio. |
| `/completed` | `page.jsx` → `InProgressClient` (modo `completed`) | Series completadas (antes, pestaña de `/in-progress`). |
| `/history` | `HistoryClient.jsx` | Historial de visionado (propio + Trakt). |
| `/lists` | `page.jsx` (client) | Listas propias, colecciones y listas de la comunidad (pestañas). |
| `/lists/[listId]` | `page.jsx` (client) | Detalle de una lista propia, con `UnifiedListDetailsLayout` + `ListDetailsTools`. |
| `/lists/collection/[collectionId]` | `page.jsx` → `CollectionDetailsClient` | Detalle de una colección/saga TMDb. |
| `/lists/community/[id]` | `page.jsx` → `TraktListDetailsClient` | Detalle de una lista de la comunidad (importada de Trakt o publicada por un miembro), servida por id interno desde la BBDD propia. Ver [[comunidad]]. |
| `/biblioteca` | `BibliotecaClient.jsx` | Dashboard de la biblioteca Plex del usuario (contenido y resoluciones disponibles), `revalidate: 1800`. |

## Cuenta, perfil y auth

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/login` | `LoginClient.jsx` (+ `LoginForm`) | Login/registro propio; sanitiza `?next=` para evitar redirecciones abiertas. |
| `/auth/callback` | `page.jsx`/`CallbackClient.jsx` | Redirige a `/api/tmdb/auth/callback` con los mismos query params (compatibilidad OAuth TMDb). |
| `/auth/tmdb/callback` | `page.jsx`/`CallbackClient.jsx` | Redirige a `/auth/callback` (alias legado). |
| `/auth/tmdb/logout`, `/auth/tmdb/request-token` | `route.js` | Endpoints legado de sesión TMDb v3 (cierre de sesión y solicitud de token) que conviven con el sistema de auth propio. |
| `/auth/verify-email` | `EmailVerificationClient.jsx` | Confirma el cambio de email con el token del enlace. |
| `/profile`, `/profile/[section]` | `layout.jsx` + `ProfilePageClient.jsx` | Perfil propio con pestañas (nivel, estadísticas, vista neuronal, actividad, vistos, reseñas, favoritos, pendientes, puntuaciones, listas, social). Ver [[social-y-perfiles]]. |
| `/profile/settings` | `ProfileSettingsClient.jsx` | Preferencias, apertura de fichas, barra inferior móvil, conexiones (Trakt/Plex/Spotify/Netflix/Letterboxd/Android), importaciones (Trakt, TMDb, IMDb, Letterboxd) y exportación. Ver [[paginas-de-usuario]]. |
| `src/app/stats/` | `StatsClient.jsx` (+ `chartConstants.js`, `profileCharts.jsx`) | Ya no es una ruta (no tiene `page.jsx`): sus componentes de gráficas los reutiliza el perfil. |

## Social

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/u/[username]`, `/u/[username]/[section]` | `layout.jsx` + `ProfileClient.jsx`, `profileRoutes.js` | Perfil público de un miembro y sus pestañas. |
| `/u/[username]/followers`, `/following` | `FollowListClient.jsx` | Seguidores y seguidos. |
| `/social` | `SocialClient.jsx` | Feed de actividad (siguiendo / yo). |
| `/members` | `MembersClient.jsx` | Directorio y buscador de miembros. |
| `/detections`, `/detections/[id]` | `DetectionsClient.jsx`, `DetectionCorrectionClient.jsx` | Detecciones de streaming de la extensión y su corrección. Ver [[detecciones-streaming]]. |

## Utilidades y demo

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/trakt-diagnostic` | `page.jsx` (client) | Panel manual para probar altas/consultas de historial Trakt (debug). |
| `/demo/liquid-buttons` | `page.jsx` (client) | Demo visual del componente `LiquidButton` ([[components]]). |

## Rutas de API (`src/app/api`)

Todas son *route handlers* (`route.js`) que actúan de BFF: normalizan/cachean respuestas de servicios externos y hablan con el backend propio y cookies de sesión. Documentación funcional detallada en [[Frontend-Lib]] y en `docs/backend` ([[backend_api_reference]]). Agrupadas por dominio:

| Grupo | Rutas destacadas | Propósito |
|---|---|---|
| `api/auth/**` | `login`, `register`, `logout`, `me`, `connections`, `google/start`, `google/callback`, `account/email/{change-request,confirm}`, `account/password` | Sesión propia (email/password), login con Google y gestión de la cuenta. |
| `api/tmdb/**` | `auth/*` (request-token/session v3 y v4), `account/*`, `movies/[id]/*`, `tv/[id]/season/[season]/episode/[episode]/*`, `ratings`, `collection(s)`, `import/*` | Todo lo relativo a TMDb: sesiones, cuenta, valoraciones, créditos, colecciones e importación masiva. |
| `api/trakt/**` | `auth/*` (OAuth + device code), `dashboard/*` (trending/popular/recommended/anticipated/watched/played/collected), `discover/*`, `history/*`, `item/*`, `episode/*`, `show/*`, `season/*`, `calendar/episodes`, `community/*`, `lists`, `list-items`, `recommendations/personal`, `scoreboard`, `stats`, `sync/*`, `import/*` | Integración completa con Trakt: auth, historial/watched, listas, comunidad (comentarios/sentimientos), calendario, importación y motor de recomendaciones/dashboard. |
| `api/plex/**` | `auth/*` (start/callback/session/status/connection/disconnect), `library`, `sync`, `open` | Conexión y sincronización con servidores Plex del usuario. |
| `api/spotify/**` | `login`, `callback`, `auth/status`, `auth/disconnect` | OAuth con Spotify (bandas sonoras / `HeroSoundtrackPlayer`). |
| `api/netflix/**` | `connect`, `disconnect`, `pair-mobile`, `poll`, `import`, `simulate`, `extension-sync`, `extension-import`, `extension-progress`, `detection-rules` | Sincronización de visionado de Netflix vía extensión de navegador y notificaciones móviles (`NetflixSyncListener`); `extension-*` quedan públicas en el middleware por autenticarse con Bearer token propio. |
| `api/users/**` | `search`, `feed`, `feed/summary`, `notifications`, `resolve-usernames`, `me/profile-favorites`, `[username]/{profile,follow,followers,following,[section]}` | Capa social: proxies de `/v1/users/*`. |
| `api/community/**` | `[type]/[tmdbId]/{comments,sentiment,lists,...}`, `lists/[id]/like`, `collections/*`, `actors/*` | Comentarios, sentimiento, listas y «me gusta» de la comunidad. |
| `api/recommendations/**` | `route`, `dismiss`, `dismiss/[mediaType]/[tmdbId]` | Baraja de `/recommendations` y descartes. |
| `api/recap/**` | `route`, `card` | Datos del recap anual e imagen para compartir (1080×1920). |
| `api/share/**` | `details-card`, `details-story`, `list-card`, `list-story` | Imágenes para compartir una ficha o una lista (tarjeta y story). |
| `api/push/**` | `config`, `subscriptions`, `test` | Notificaciones push (ver [[push-notifications]]). |
| `api/progress` | — | «Continuar viendo» (proxy de `/v1/progress`). |
| `api/letterboxd/**` | `connection`, `sync`, `extension-sync`, `import` | Conexión, sincronización por RSS e importación de Letterboxd. |
| `api/lists/**` | `route`, `[id]` | Listas propias en el backend. |
| `api/user/export` | — | Exportación de la biblioteca (CSV, JSON, Letterboxd). |
| `api/dashboard/**` | `[surface]`, `sections/[section]` | Motor de filas/recomendaciones que consumen los dashboards de Inicio/Películas/Series (`useEngineRows`). |
| `api/ai/**` | `watch-next`, `health` | Asistente "qué ver ahora" (`WatchNextAssistant`). |
| `api/calendar/**` | `upcoming-episodes`, `episodes-range` | Próximos episodios para `/calendar` (rango de fechas) y `DashboardCalendarSection`; proxy de `/v1/calendar/episodes`. |
| `api/streaming/detections`, `api/streaming/device` | — | Detecciones de streaming (web y app Android). |
| `api/streaming/**` | `route`, `episode-links` | Enlaces de streaming/plataformas por título y episodio (JustWatch, ver [[JUSTWATCH_INTEGRATION]]). |
| `api/links/**` | `justwatch`, `letterboxd`, `ratings`, `wikipedia` | Resolución de enlaces externos por título. |
| `api/imdb/**`, `api/omdb`, `api/filmaffinity/rating` | `ratings`, `top-rated`, `import` | Valoraciones externas (IMDb, OMDb, FilmAffinity). |
| `api/seriesgraph/**` | `episode-ratings` | Valoraciones de episodios por temporada (gráfico de notas). |
| `api/ratings/season`, `api/tv/[id]/*` | — | Valoraciones/ratings agregados por temporada y episodio-IMDb. |
| `api/soundtrack` | — | Búsqueda de banda sonora (Spotify) para la ficha de detalle. |
| `api/scoreboard/public` | — | Marcador público reutilizado por `ScoreboardBar`. |
| `api/user/preferences` | — | Lectura/escritura de preferencias (consumida por `AuthContext`). |
| `api/profile` | — | Datos de perfil propio. |
| `api/artwork` | — | Resolución de artwork adicional. |
| `api/questions` | — | Preguntas/feedback. |
| `api/private-access` | — | Emite la cookie del gate de acceso privado del middleware. |
| `api/health`, `api/backend/item/status`, `api/backend/items/states` | — | Health checks propios y proxy de estado hacia el backend Node/Fastify. |
| `api/_utils/tmdbMetadata.js` | — | Utilidades internas compartidas entre rutas TMDb (no es un endpoint). |

## Relacionado
- [[Features]]
- [[Home]]
- [[Frontend]]
- [[components]]
- [[Frontend-Lib]]
- [[backend_api_reference]]
- [[JUSTWATCH_INTEGRATION]]
- [[PLEX_INTEGRATION]]
- [[TRAKT_CACHE_SYSTEM]]
