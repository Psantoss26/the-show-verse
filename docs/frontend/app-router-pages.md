---
tags: [area/frontend, type/referencia]
---
# Páginas del App Router (`src/app`)

> Mapa de todas las rutas de `src/app`: páginas de UI y rutas de API internas.

## Layout raíz y middleware

- `src/app/layout.jsx` — único `RootLayout` de la app (`<html lang="es">`). Monta `AuthProvider` ([[Frontend#Organización de src|AuthContext]]), `Navbar`, `ScrollRestoration`, `PwaManager` y Vercel `Analytics`/`SpeedInsights`; define `metadata`/`viewport` globales y precarga (`preconnect`/`dns-prefetch`) TMDb, YouTube y Vimeo para que los trailers en hover carguen casi al instante. No hay layouts anidados adicionales ni `loading.jsx`/`error.jsx`/`not-found.jsx` personalizados.
- `middleware.js` (raíz del repo) — se ejecuta en casi toda ruta de página y `/api/*` (ver matcher, excluye estáticos): aplica el **gate de acceso privado** (cookie `showverse_device_access` cuando `SHOWVERSE_PRIVATE_ACCESS_KEY` está activa) y **reescribe** `/details/{movie|tv|person}/[id]` a `/s/{movie|tv|person}/[id]` para user-agents de bots/crawlers (WhatsApp, Facebook, Twitter, Slack, Discord, Telegram, Google, Bing...).

## Páginas de catálogo y dashboard

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/` | `page.jsx` + `MainDashboardClient.jsx` | Home/dashboard principal: filas de tendencias/populares/recomendados vía TMDb + engine de recomendaciones propia. `force-static`, `revalidate: 3600`. |
| `/movies` | `page.jsx` + `MoviesPageClient.jsx` | Dashboard de películas (secciones por género, mind-bending, tendencias...). |
| `/series` | `page.jsx` + `SeriesPageClient.jsx` | Dashboard de series (equivalente a `/movies` para TV), `revalidate: 1800`. |
| `/dashboard/[section]` | `page.jsx` + `DashboardSectionClient.jsx` | Vista expandida de una sección del dashboard (`tendencias`, `populares`, `recomendados`, `mas-esperadas`). |
| `/discover` | `DiscoverClient.jsx` | Descubrimiento con filtros (género, año, plataforma...) sobre `discoverMovies`/`discoverTV`. |
| `/calendar` | `page.jsx` (client) | Calendario de próximos estrenos/episodios (vista mes/semana), combina BBDD propia + TMDb. |

## Fichas de detalle

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/details/[type]/[id]` | `page.jsx` + `DetailsPageLoader` → `DetailsClient` | Ficha genérica de película o serie (`type` = `movie`\|`tv`); `getDetails` con `append_to_response` amplio, `revalidate: 600`. |
| `/details/tv/[id]` | `page.jsx` (mismo `DetailsPageLoader`) | Alias explícito para series. |
| `/details/tv/[id]/season/[season]` | `SeasonDetailsClient.jsx` | Detalle de una temporada (episodios, valoraciones). |
| `/details/tv/[id]/season/[season]/episode/[episode]` | `EpisodeDetailsClient.jsx` | Detalle de episodio (créditos, valoraciones, navegación a episodio siguiente/anterior). |
| `/details/person/[id]` | `page.jsx` + `ActorDetails.jsx` | Ficha de actor/actriz: biografía, "known for", créditos combinados. |
| `/s/movie/[id]`, `/s/tv/[id]`, `/s/person/[id]` | `route.js` (runtime `nodejs`) | Versión ligera server-only en HTML plano con metadatos OG/Twitter, pensada para bots de redes sociales (destino del rewrite del middleware), no para usuarios humanos. |

## Listas, favoritos y estados de usuario

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/favorites` | `FavoritesClient.jsx` | Favoritos del usuario (TMDb account states). |
| `/watchlist` | `WatchlistClient.jsx` | Pendientes de ver. |
| `/in-progress` | `InProgressClient.jsx` | Series en progreso con detalle de avance por temporada/episodio. |
| `/history` | `HistoryClient.jsx` | Historial de visionado (propio + Trakt). |
| `/lists` | `page.jsx` (client) | Listado de listas TMDb del usuario. |
| `/lists/[listId]` | `page.jsx` (client) | Detalle de una lista propia (TMDb), con `UnifiedListDetailsLayout` + `ListDetailsTools`. |
| `/lists/collection/[collectionId]` | `page.jsx` → `CollectionDetailsClient` | Detalle de una colección/saga TMDb. |
| `/lists/trakt/[username]/[listId]` | `page.jsx` → `TraktListDetailsClient` | Detalle de una lista pública de Trakt. |
| `/biblioteca` | `BibliotecaClient.jsx` | Dashboard de la biblioteca Plex del usuario (contenido y resoluciones disponibles), `revalidate: 1800`. |

## Cuenta, perfil y auth

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/login` | `LoginClient.jsx` (+ `LoginForm`) | Login/registro propio; sanitiza `?next=` para evitar redirecciones abiertas. |
| `/auth/callback` | `page.jsx`/`CallbackClient.jsx` | Redirige a `/api/tmdb/auth/callback` con los mismos query params (compatibilidad OAuth TMDb). |
| `/auth/tmdb/callback` | `page.jsx`/`CallbackClient.jsx` | Redirige a `/auth/callback` (alias legado). |
| `/auth/tmdb/logout`, `/auth/tmdb/request-token` | `route.js` | Endpoints legado de sesión TMDb v3 (cierre de sesión y solicitud de token) que conviven con el sistema de auth propio. |
| `/profile` | `page.jsx` → reutiliza `StatsClient` | Perfil = estadísticas del usuario. |
| `/profile/settings` | `ProfileSettingsClient.jsx` | Preferencias de usuario, conexiones (Trakt/Plex/Spotify/Netflix) e importaciones. |
| `/stats` | `StatsClient.jsx` (+ `chartConstants.js`, `profileCharts.jsx`) | Estadísticas y gráficas (recharts) de visionado. |

## Utilidades y demo

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/trakt-diagnostic` | `page.jsx` (client) | Panel manual para probar altas/consultas de historial Trakt (debug). |
| `/demo/liquid-buttons` | `page.jsx` (client) | Demo visual del componente `LiquidButton` ([[components]]). |

## Rutas de API (`src/app/api`)

Todas son *route handlers* (`route.js`) que actúan de BFF: normalizan/cachean respuestas de servicios externos y hablan con el backend propio y cookies de sesión. Documentación funcional detallada en [[Frontend-Lib]] y en `docs/backend` ([[backend_api_reference]]). Agrupadas por dominio:

| Grupo | Rutas destacadas | Propósito |
|---|---|---|
| `api/auth/**` | `login`, `register`, `logout`, `me`, `connections`, `google/start`, `google/callback` | Sesión propia (email/password) + login con Google. |
| `api/tmdb/**` | `auth/*` (request-token/session v3 y v4), `account/*`, `movies/[id]/*`, `tv/[id]/season/[season]/episode/[episode]/*`, `ratings`, `collection(s)`, `import/*` | Todo lo relativo a TMDb: sesiones, cuenta, valoraciones, créditos, colecciones e importación masiva. |
| `api/trakt/**` | `auth/*` (OAuth + device code), `dashboard/*` (trending/popular/recommended/anticipated/watched/played/collected), `discover/*`, `history/*`, `item/*`, `episode/*`, `show/*`, `season/*`, `calendar/episodes`, `community/*`, `lists`, `list-items`, `recommendations/personal`, `scoreboard`, `stats`, `sync/*`, `import/*` | Integración completa con Trakt: auth, historial/watched, listas, comunidad (comentarios/sentimientos), calendario, importación y motor de recomendaciones/dashboard. |
| `api/plex/**` | `auth/*` (start/callback/session/status/connection/disconnect), `library`, `sync`, `open` | Conexión y sincronización con servidores Plex del usuario. |
| `api/spotify/**` | `login`, `callback`, `auth/status`, `auth/disconnect` | OAuth con Spotify (bandas sonoras / `HeroSoundtrackPlayer`). |
| `api/netflix/**` | `connect`, `disconnect`, `pair-mobile`, `poll`, `import`, `simulate`, `extension-sync`, `extension-import` | Sincronización de visionado de Netflix vía extensión de navegador y notificaciones móviles (`NetflixSyncListener`); `extension-*` quedan públicas en el middleware por autenticarse con Bearer token propio. |
| `api/dashboard/**` | `[surface]`, `sections/[section]` | Motor de filas/recomendaciones que consumen los dashboards de Inicio/Películas/Series (`useEngineRows`). |
| `api/ai/**` | `watch-next`, `health` | Asistente "qué ver ahora" (`WatchNextAssistant`). |
| `api/calendar/**` | `upcoming-episodes` | Próximos episodios para `/calendar` y `DashboardCalendarSection`. |
| `api/streaming/**` | `route`, `episode-links` | Enlaces de streaming/plataformas por título y episodio (JustWatch, ver [[JUSTWATCH_INTEGRATION]]). |
| `api/links/**` | `justwatch`, `letterboxd` | Resolución de enlaces externos por título. |
| `api/imdb/**`, `api/omdb`, `api/filmaffinity/rating` | `ratings`, `top-rated` | Valoraciones externas (IMDb, OMDb, FilmAffinity). |
| `api/seriesgraph/**` | `episode-ratings` | Valoraciones de episodios por temporada (gráfico de notas). |
| `api/ratings/season`, `api/tv/[id]/*` | — | Valoraciones/ratings agregados por temporada y episodio-IMDb. |
| `api/soundtrack` | — | Búsqueda de banda sonora (Spotify) para la ficha de detalle. |
| `api/scoreboard/public` | — | Marcador público reutilizado por `ScoreboardBar`. |
| `api/user/preferences` | — | Lectura/escritura de preferencias (consumida por `AuthContext`). |
| `api/profile` | — | Datos de perfil propio. |
| `api/artwork` | — | Resolución de artwork adicional. |
| `api/questions` | — | Preguntas/feedback. |
| `api/private-access` | — | Emite la cookie del gate de acceso privado del middleware. |
| `api/health`, `api/backend/item/status` | — | Health checks propios y proxy de estado hacia el backend Node/Fastify. |
| `api/_utils/tmdbMetadata.js` | — | Utilidades internas compartidas entre rutas TMDb (no es un endpoint). |

## Relacionado
- [[Home]]
- [[Frontend]]
- [[components]]
- [[Frontend-Lib]]
- [[backend_api_reference]]
- [[JUSTWATCH_INTEGRATION]]
- [[PLEX_INTEGRATION]]
- [[TRAKT_CACHE_SYSTEM]]
