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
| `/details/[type]/[id]` | `page.jsx` + `DetailsPageLoader` → `DetailsClient` | Ficha genérica de película o serie (`type` = `movie`\|`tv`); `getDetails` con `append_to_response` amplio, `revalidate: 600`. El título de cada sección abre su vista lateral (`SectionSheet`; mientras está abierta pone `data-sv-sheet-open` en `<html>` y, en móvil, la ficha tapada deja de componer cristal, capas `transform-gpu` y animaciones para que los toques del panel no hagan parpadear la pantalla; dentro del panel, la zona con scroll lleva `will-change: transform` para que, al desplegar la fila de filtros, se desplace sin volver a pintar sus imágenes en cada fotograma, y las tarjetas de imagen no llevan piezas con `backdrop-filter`); la de «Portadas y fondos» (`lib/details/artworkSheetTabs.js`) tiene las mismas pestañas que la galería y en «Logo» enseña solo logos en español e inglés (todos si el título no tiene ninguno). La de «Tráiler y vídeos», si hay vídeos de más de un tipo, lleva pestañas por tipo con su número (Todos, Tráiler, Teaser, Clip, Featurette, Detrás de las cámaras…; `videoTypeOptions` de `lib/details/videos.js`). Sus desplegables de orden e idioma (`CreditFilterControls`) entran con una animación CSS solo de `transform` (`.sv-inline-menu`), sin fundido ni escala sobre el cristal, y se cierran al instante; el filtro elegido se aplica en una transición. La imagen elegida en «Vista previa» solo cambia la de DetailModal; la portada de la ficha en modo backdrop sigue con su propia imagen. Cada selección cuenta como un voto: sin selección propia, cada tipo de imagen (portada, portada móvil, vista previa, fondo y logo) usa la más votada por todos los usuarios, que llega en el SSR (`artwork` del resumen de comunidad; en `/details/tv/[id]`, `fetchCommunityArtwork`) y la precarga `MobilePosterPreload`. DetailModal la pide a `api/community/[type]/[tmdbId]/artwork`. La más votada leída al entrar incluye el voto propio de visitas anteriores: al restablecer, la ficha lo quita al momento de su copia (`retractOwnArtworkVotes` con las rutas elegidas en la visita) y, guardado, la vuelve a pedir (`forgetCommunityArtwork` avisa a las páginas suscritas con `subscribeCommunityArtwork`). Además, la portada y el fondo base nacen con la selección guardada en el dispositivo (para pintarla sin esperar), así que restablecer los devuelve a los automáticos que calculó `initArtwork` (`autoArtworkRef`). |
| `/details/tv/[id]` | `page.jsx` (mismo `DetailsPageLoader`) | Alias explícito para series. |
| `/details/tv/[id]/season/[season]` | `SeasonDetailsClient.jsx` | Detalle de una temporada (episodios, valoraciones). El servidor trae los vídeos de la temporada en la misma petición (`append_to_response=videos`) y los pasa como `initialSeasonVideos`: «Ver tráiler» nace encendido o apagado, sin buscar vídeos en el cliente. «Editar portada» (`details/SeasonCoverEditModal`) abre la misma vista lateral que «Portadas y fondos» de la ficha (`ImagesSheet` de `sectionSheet/DetailsSectionSheets`): pósters de la temporada en español e inglés (los únicos idiomas del filtro) con su resolución, orden e idioma en la hoja de filtros y Restaurar; elegir uno lo guarda al momento (`artworkOverrides["season:<id>"]`), sin botón de guardar. Como en la ficha, cada elección es un voto y la más votada es la portada por defecto de la temporada para todos (`lib/details/communitySeasonPosters`, `GET /api/community/seasons/artwork` en lote): la trae el servidor sin caché en cada carga (`initialCommunityPoster`, como las imágenes votadas de la ficha; por eso la página es dinámica aunque TMDb siga en caché 1 h) y el cliente la vuelve a pedir al montar y la corrige si cambió; mientras, o si esa consulta falla, vale la del servidor y la usan también las tarjetas de «Temporadas» y la vista previa (`useSeasonPoster`). Orden: elección propia → más votada → automática. Cambiar o restaurar la elección retira al momento el voto anterior de la copia de los hooks montados (`retractCommunitySeasonPoster`) y, guardado, la vuelven a pedir (`forgetCommunitySeasonPoster`), así que Restaurar no cae en la propia como «más votada». |
| `/details/tv/[id]/season/[season]/episode/[episode]` | `EpisodeDetailsClient.jsx` | Detalle de episodio (créditos, valoraciones, navegación a episodio siguiente/anterior). Fondo: en escritorio, UNA imagen (capas como las de la temporada) que el servidor elige con `pickEpisodeBackdrop` (`lib/details/episodeHeroStills.js`): otra imagen del episodio, si no un fondo sin texto de la serie o su fondo principal, distinta de la que enmarca el hero siempre que haya otra; en el teléfono, la composición apilada de la portada. Anterior/siguiente de temporada y episodio (flechas y gesto móvil) pasa por `navigateSubrouteHolding` (`lib/navigation/subrouteHoldTransition.js`): una copia de la ficha actual queda encima hasta que la nueva está montada y se funde, en vez de enseñar la superficie oscura de `details/loading.jsx`. La copia va sin animaciones (`[data-subroute-snapshot]` en `globals.css`; lo que se animaba queda en su valor de ese instante, p. ej. el fundido por scroll), en `z-index: 29` para no tapar la barra inferior móvil (`z-30`), y las entradas de primera apertura de la ficha nueva (póster, logo, cascada de botones) se dan por terminadas durante el relevo: si no, el gesto móvil parpadeaba. Además, con la ficha en reposo se precarga COMPLETA la anterior y la siguiente (`useWarmSubrouteNeighbors`, `router.prefetch(href, { kind: "full" })`; también al apuntar la flecha): medido en producción, la ficha nueva se monta a ~45-80 ms del clic y se ve a ~260-330 ms (sin precarga, ~360 y ~530 ms). En `next dev` Next no precarga nada. |
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
| `/in-progress` | `InProgressClient.jsx` | Series en progreso con detalle de avance por temporada/episodio. Vistas: Tarjetas, Portadas y Lista (`compact`, etiqueta de porcentaje de 12 px). |
| `/completed` | `page.jsx` → `InProgressClient` (modo `completed`) | Series completadas (antes, pestaña de `/in-progress`). Las portadas no llevan tick de completado y la vista Lista no lleva barra de progreso (solo la etiqueta del 100 %). |
| `/history` | `HistoryClient.jsx` | Historial de visionado (propio + Trakt). |
| `/lists` | `page.jsx` (client) | Listas propias, colecciones y listas de la comunidad (pestañas). Sin sesión, Comunidad y Colecciones (y sus fichas) se ven enteras; Mis listas conserva la cabecera y las pestañas y pinta `LoginRequiredCard` en lugar del contenido, sin botón de sincronizar ni tarjetas de cabecera. En la vista de filas, los pósters de los títulos siguen la escalera de idioma de Favoritos (inglés → español → original → sin idioma: `useEnglishPosterItems` con `holdOriginalPosters`, del lote `api/tmdb/artwork`); mientras se resuelven no se pinta el póster en es-ES de TMDb. En la vista de lista (`ListModeRow`), cada fila lleva una tira de pósters con huecos 2:3 de 88 px de alto en el móvil (3 pósters; el título usa hasta dos líneas), 96 px desde `sm` y 112 px desde `lg` (5 pósters, descripción en dos líneas). La tira no tiene fondo ni borde: con menos de cinco títulos solo se ven los pósters, sin caja negra detrás. En la vista de filas (junto al título) y en el pie de las tarjetas de la rejilla van píldoras de cristal líquido teñido (`components/lists/ListCountPills`, que usan también las tarjetas de la sección Listas de la ficha en `DetailsClient` y `PhoneDetailsSections`): la de items en morado y la de me gusta en rojo, esta solo con 1 o más. El texto baja 1 px (`GlassCountPillText`: PT Sans pinta las cifras 1 px por encima del centro de su caja) y el corazón sube 0,5 px, medido a 1x. En la rejilla, el pie es `@container` y en tarjetas estrechas (< 17,5rem, 4 columnas) oculta el nombre del autor y deja el avatar. Al pasar a «filas» solo montan carrusel las secciones cerca de la pantalla (las 6 primeras lo comprueban antes del primer pintado con `useInView({ eager })`; las demás esperan al observador, con un esqueleto quieto si ya tenían títulos), y cada carrusel pinta primero 8 tarjetas y el resto en `requestIdleCallback`. |
| `/lists/[listId]` | `page.jsx` (client) | Detalle de una lista propia, con `UnifiedListDetailsLayout` + `ListDetailsTools`. |
| `/lists/collection/[collectionId]` | `page.jsx` → `CollectionDetailsClient` | Detalle de una colección/saga TMDb. «Editar colección» (`lists/CollectionEditModal`) abre la misma vista lateral que «Portadas y fondos» de la ficha (`ImagesSheet`): pestañas Póster, Backdrop de portada (solo ordenador) y Fondo, resolución en cada imagen, orden e idioma en la hoja de filtros y Restaurar; elegir una imagen la guarda al momento (`artworkOverrides["collection:<id>"]`), sin Guardar ni Cancelar. Cada elección es un voto y la más votada de cada imagen es la de por defecto para todos (`fetchCommunityArtwork({ type: 'collection' })`, con tope de 1,5 s; mientras, las imágenes esperan como a la galería: la portada no se pinta aunque la galería ya haya dado la automática). Orden: elección propia → más votada → automática; Restaurar borra las propias y retira los votos, también de la copia que la página leyó al entrar (`retractOwnArtworkVotes` + `subscribeCommunityArtwork`), así que la portada y la imagen marcada en la vista lateral cambian sin recargar. |
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
| `/profile/settings` | `ProfileSettingsClient.jsx` | Preferencias, apertura de fichas, barra inferior móvil, conexiones (Trakt/Plex/Spotify/Netflix/Letterboxd/Android), importaciones (Trakt, TMDb, IMDb, Letterboxd), exportación y suscripción (`?tab=subscription`). Ver [[paginas-de-usuario]]. |
| `/planes` | `page.jsx` → `PlansClient.jsx` | Planes Gratis, Sin anuncios y Pro: selector mensual/anual y tres tarjetas con precio y la misma lista de características para compararlas; paso a Stripe Checkout. Ver [[planes-y-suscripciones]]. |
| `src/app/stats/` | `StatsClient.jsx` (+ `chartConstants.js`, `profileCharts.jsx`) | Ya no es una ruta (no tiene `page.jsx`): sus componentes de gráficas los reutiliza el perfil. |

## Social

| Ruta | Fichero(s) | Propósito |
|---|---|---|
| `/u/[username]`, `/u/[username]/[section]` | `layout.jsx` + `ProfileClient.jsx`, `profileRoutes.js` | Perfil público de un miembro y sus pestañas. |
| `/u/[username]/followers`, `/following` | `FollowListClient.jsx` | Seguidores y seguidos. |
| `/social` | `page.jsx` (RSC) + `SocialHub.jsx`, `SocialClient.jsx` (barra Actividad / Siguiendo / Yo y feed; `?view=activity\|mine`), `TodayClient.jsx` (contenido de Hoy) | Sección Social: lo destacado de hoy (historias, destacada, más activos; siguiendo / comunidad) y el feed de actividad (siguiendo / yo). Ver [[hoy]]. |
| `/today` | `page.jsx` | Redirige a `/social` conservando los parámetros. |
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
| `api/tmdb/**` | `auth/*` (request-token/session v3 y v4), `account/*`, `movies/[id]/*`, `tv/[id]/season/[season]/episode/[episode]/*`, `ratings`, `collection(s)`, `import/*` | Todo lo relativo a TMDb: sesiones, cuenta, valoraciones, créditos, colecciones e importación masiva. `tv/[id]/season/[season]/episode/[episode]/hero-stills` devuelve `{ stills }`, las imágenes de la portada móvil del episodio (la misma selección que hace su ficha en el servidor, `pickEpisodeHeroStills`); la usa la vista previa de pulsación larga. `artwork` (POST `{ items: ["movie:603", "season:1396:2", …] }`) elige en lote el arte de tarjetas, portadas y fondos (`pickListArtwork`): pide la ficha y la galería `/images` por separado, sin filtro de idioma; `append_to_response=images` llega a veces desde el servidor solo con el inglés y dejaba sin los pósters sin idioma al mosaico de las listas. Lo mismo hacen `collections/featured` (vistas previas del catálogo), `lib/dashboard/sectionBackdrops.js` (fondos de las primeras tarjetas de `/dashboard/[section]`) y, en el backend, `resolveEnglishPosterPaths` (pósters del perfil; caché `profile:english-poster:v5`). |
| `api/trakt/**` | `auth/*` (OAuth + device code), `dashboard/*` (trending/popular/recommended/anticipated/watched/played/collected), `discover/*`, `history/*`, `item/*`, `episode/*`, `show/*`, `season/*`, `calendar/episodes`, `community/*`, `lists`, `list-items`, `recommendations/personal`, `scoreboard`, `stats`, `sync/*`, `import/*` | Integración completa con Trakt: auth, historial/watched, listas, comunidad (comentarios/sentimientos), calendario, importación y motor de recomendaciones/dashboard. |
| `api/plex/**` | `auth/*` (start/callback/session/status/connection/disconnect), `library`, `sync`, `open` | Conexión y sincronización con servidores Plex del usuario. |
| `api/billing/**` | `plans`, `me`, `checkout`, `portal`, `webhook` | Planes y suscripciones (proxies de `/v1/billing/*`). `webhook` reenvía el cuerpo de Stripe sin tocar (la firma va sobre los bytes) y está exento del acceso privado en el middleware. `plex/sync` responde 402 `plan_required` sin Pro. |
| `api/spotify/**` | `login`, `callback`, `auth/status`, `auth/disconnect` | OAuth con Spotify (bandas sonoras / `HeroSoundtrackPlayer`). |
| `api/netflix/**` | `connect`, `disconnect`, `pair-mobile`, `poll`, `import`, `simulate`, `extension-sync`, `extension-import`, `extension-progress`, `detection-rules` | Sincronización de visionado de Netflix vía extensión de navegador y notificaciones móviles (`NetflixSyncListener`); `extension-*` quedan públicas en el middleware por autenticarse con Bearer token propio. |
| `api/users/**` | `search`, `feed`, `feed/summary`, `today`, `notifications`, `resolve-usernames`, `me/profile-favorites`, `[username]/{profile,follow,followers,following,[section]}` | Capa social: proxies de `/v1/users/*`. |
| `api/community/**` | `[type]/[tmdbId]/{comments,sentiment,lists,artwork,...}`, `lists/[id]/like`, `collections/*`, `actors/*` | Comentarios, sentimiento, listas y «me gusta» de la comunidad. |
| `api/recommendations/**` | `route`, `dismiss`, `dismiss/[mediaType]/[tmdbId]` | Baraja de `/recommendations` y descartes. |
| `api/recap/**` | `route`, `card` | Datos del recap anual e imagen para compartir (1080×1920). |
| `api/share/**` | `details-card`, `details-story`, `list-card`, `list-story` | Imágenes para compartir una ficha o una lista (tarjeta y story). Las opacas salen en JPEG y las capas transparentes del vídeo en PNG; guardan en memoria las imágenes generadas (10 min) y las de TMDb ya reducidas y filtradas (30 min). Ver `src/lib/share/ogKit.jsx`. En `list-card`, una lista sin portada propia lleva de fondo el mismo de su página en el móvil: el cliente resuelve el arte sin texto de los mismos títulos (`prepareListCollage`, con la caché de `resolveCoverArt`) y el servidor compone con sharp la rejilla de la portada (`getPosterCollagePlacement`), sus uniones fundidas y la prolongación difuminada (`src/lib/share/listCollage.js`). |
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
