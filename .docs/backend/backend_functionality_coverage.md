# Cobertura funcional del backend propio

Este documento compara el backend propio de `backend/` con las funcionalidades que usa hoy la aplicacion Next.js. El objetivo es saber si el backend nuevo puede sustituir a las API Routes actuales sin perder comportamiento.

Fecha de revision: 2026-06-19.

## Veredicto

El backend propio todavia no cubre el 100% de la aplicacion actual.

Si cubre el nucleo de datos privados de usuario: autenticacion propia, favoritos, watchlist, historial, ratings, listas personalizadas, estado unificado de item, importacion desde Trakt y proxy basico de TMDb con cache Redis.

No cubre todavia toda la forma de respuesta ni todas las integraciones que consume la UI actual. La app sigue dependiendo de rutas Next.js bajo `src/app/api/*`, sobre todo para TMDb account, Trakt community, dashboard, Plex, Spotify, OMDb/IMDb, IA, musica, colecciones y varias rutas auxiliares.

## Superficie cubierta

Estas funcionalidades ya tienen equivalente directo en `backend/src/routes`:

| Funcionalidad | Backend propio | Estado |
| --- | --- | --- |
| Registro, login, refresh, logout | `/v1/auth/*` | Cubierto para auth propia |
| Perfil autenticado basico | `/v1/auth/me` | Cubierto parcial |
| Favoritos de usuario | `/v1/favorites` | Cubierto |
| Watchlist de usuario | `/v1/watchlist` | Cubierto |
| Historial global | `/v1/history` | Cubierto parcial |
| Plays de pelicula | `/v1/history/movies/:tmdbId` | Cubierto |
| Episodios vistos por serie | `/v1/history/shows/:tmdbId` | Cubierto |
| Plays de episodio | `/v1/history/episodes/:tmdbId/:season/:episode` | Cubierto |
| Marcar episodio visto/no visto | `/v1/history/episodes` | Cubierto |
| Marcar temporada vista/no vista | `/v1/history/seasons` | Cubierto parcial |
| Ratings | `/v1/ratings` | Cubierto parcial |
| Listas propias | `/v1/lists` | Cubierto |
| Estado unificado item | `/v1/items/:tmdbId/:mediaType/status` | Cubierto parcial |
| Proxy TMDb detalle/search/discover/trending/providers | `/v1/tmdb/*` | Cubierto parcial |
| Importacion inicial desde Trakt | `/v1/import/trakt` | Cubierto parcial |
| Estadisticas basicas | `/v1/stats/*` | Cubierto parcial |

## Diferencias que bloquean sustituir la UI actual

### Autenticacion

La UI actual no usa todavia la auth propia del backend. `src/context/AuthContext.jsx` hidrata una sesion de TMDb desde `localStorage` y cookies (`tmdb_session_id`). Muchas pantallas siguen interpretando "login" como "TMDb conectado" o "Trakt conectado".

Para sustituir sin romper la app hacen falta dos capas:

1. Adaptar el frontend a `accessToken` propio o usar cookies httpOnly del backend.
2. Mantener compatibilidad temporal para TMDb/Trakt import, si se quieren migrar datos existentes.

### Favoritos y watchlist

El backend guarda favoritos y watchlist propios, pero la UI actual llama rutas de TMDb:

- `/api/tmdb/account/favorite`
- `/api/tmdb/account/watchlist`
- `/api/tmdb/account/status/[type]/[id]`

Tambien hay sincronizacion especifica:

- `/api/trakt/sync/tmdb-favorites-list`

Para migrar sin cambios visuales, las rutas Next.js deben pasar a hacer proxy al backend y devolver la misma forma que esperan `FavoritesClient.jsx`, `WatchlistClient.jsx` y `FavoriteWatchlistButtons.jsx`.

### Historial y progreso

El backend tiene datos suficientes para historial basico, pero no devuelve exactamente lo mismo que `/api/trakt/history`.

La ruta actual devuelve:

```json
{
  "connected": true,
  "items": [],
  "stats": { "plays": 0, "uniques": 0, "movies": 0, "shows": 0 },
  "pagination": { "page": 1, "limit": 200, "returned": 0, "hasMore": false }
}
```

El backend devuelve `results` y `page`. Para reemplazar la UI, hay que crear una capa de compatibilidad o cambiar los clientes.

Tambien falta paridad completa para:

- `/api/trakt/item/history`
- `/api/trakt/item/history/add`
- `/api/trakt/item/history/update`
- `/api/trakt/item/history/remove`
- `/api/trakt/show/plays`
- `/api/trakt/episode/play`
- `/api/trakt/history/remove`

### Estado de item

El backend expone `/v1/items/:tmdbId/:mediaType/status` con `mediaType` `movie|tv`.

La UI actual llama `/api/trakt/item/status?type=movie|show&tmdbId=...` y espera campos como `found`, `traktId`, `traktUrl`, `progress`, `completed`, `aired`, `history`, `favorite` e `inWatchlist`.

Para sustituirlo, hay que normalizar:

- `show` de Trakt a `tv` del backend.
- `watchlist` del backend a `inWatchlist` si se conserva la respuesta actual.
- Progreso de serie (`completed`, `aired`, `progress`), que ahora Trakt calcula con su endpoint de progreso.

### Ratings

El backend soporta `movie`, `tv` y `episode`.

La UI actual usa varias rutas y nombres:

- `/api/trakt/ratings`
- `/api/trakt/item/rating`
- `/api/ratings/season`
- `/api/tmdb/ratings`
- `/api/tmdb/movies/[id]/rating`
- `/api/tv/[id]/ratings`

Falta decidir que ratings son propios, cuales son comunitarios o externos, y que respuesta espera cada pantalla.

### Temporadas

`/v1/history/seasons` requiere que el cliente envie la lista de episodios. La UI actual llama `/api/trakt/season/watched` solo con `tmdbId`, `season`, `watched` y `watchedAt`; la ruta actual resuelve episodios contra Trakt/TMDb.

Para paridad, el backend debe poder resolver episodios de una temporada por TMDb o la ruta Next.js debe seguir enriqueciendo antes de llamar al backend.

### Estadisticas

El backend tiene estadisticas basicas:

- totales
- calendario
- series en progreso
- series completadas

La pagina `src/app/stats/StatsClient.jsx` consume `/api/trakt/user-stats` y espera mucho mas:

- `username`
- `stats` crudo de Trakt
- `genres`
- `watchedMovies`
- `watchedShows`
- `history`
- `topActors`
- `topDirectors`
- modo `peopleOnly`
- modo `historyLimit`
- localizacion de titulos con TMDb

Para cubrir la pagina de estadisticas hay que implementar `/v1/stats/profile` o una ruta compatible que compute estos datos desde PostgreSQL + TMDb.

### Listas

El backend cubre listas propias privadas/publicas. La app actual usa tres mundos:

- listas TMDb del usuario (`src/lib/api/tmdbLists.js`)
- listas Trakt del usuario/comunidad (`/api/trakt/lists`, `/api/trakt/lists/[username]/[listId]`)
- colecciones TMDb (`/api/tmdb/collections/*`, `/api/tmdb/collection`)

El backend no cubre todavia listas publicas comunitarias ni colecciones TMDb enriquecidas.

### Comunidad Trakt

No esta cubierto en el backend propio:

- `/api/trakt/community/comments`
- `/api/trakt/community/sentiments`
- `/api/trakt/community/lists`
- `/api/trakt/community/seasons`
- comentarios propios
- likes, spoilers, edicion y borrado de comentarios propios

Si se quiere eliminar Trakt como dependencia de produccion, hay que crear tablas propias de comentarios/reacciones o retirar esa funcionalidad.

### Dashboard y descubrimiento

El backend tiene TMDb trending/discover basico, pero la app usa:

- `/api/dashboard/sections/[section]`
- `/api/trakt/dashboard/trending`
- `/api/trakt/dashboard/popular`
- `/api/trakt/dashboard/recommended`
- `/api/trakt/dashboard/movies-anticipated`
- `/api/trakt/dashboard/shows-anticipated`
- `/api/trakt/discover/anticipated`
- `/api/trakt/discover/recommend`

Estas secciones mezclan Trakt y TMDb. El backend debe decidir si:

1. Las reemplaza por TMDb puro.
2. Mantiene Trakt como fuente publica de descubrimiento.
3. Crea un motor propio de recomendaciones.

### Integraciones externas que siguen fuera del backend

Estas funcionalidades siguen en Next.js y no tienen reemplazo en `backend/`:

| Area | Rutas actuales |
| --- | --- |
| Plex | `/api/plex`, `/api/plex/library`, `/api/plex/open` |
| Spotify | `/api/spotify/login`, `/api/spotify/callback` |
| Soundtrack | `/api/soundtrack` |
| IA Watch Next | `/api/ai/watch-next`, `/api/ai/health` |
| OMDb/IMDb/Filmaffinity/SeriesGraph | `/api/omdb`, `/api/imdb/*`, `/api/filmaffinity/rating`, `/api/seriesgraph/episode-ratings` |
| Artwork overrides | `/api/artwork` |
| Enlaces externos | `/api/links/justwatch`, `/api/links/letterboxd` |
| TMDb auxiliares | awards, collections, localized-images, episode details, credits |
| Scoreboard publico | `/api/scoreboard/public`, `/api/trakt/scoreboard` |

Estas rutas pueden quedarse como BFF de Next.js. No hace falta moverlas todas al backend propio si no guardan datos privados de usuario.

## Criterio para decir "backend completo"

El backend propio se puede considerar funcionalmente completo para la app actual cuando se cumplan estas condiciones:

1. El login principal de la app usa auth propia o cookies del backend.
2. Favoritos, watchlist, historial, ratings y listas ya no dependen de TMDb account ni Trakt para escritura.
3. Las rutas Next.js antiguas son proxies al backend o el frontend llama directamente a `/v1`.
4. Las respuestas de compatibilidad conservan la forma que esperan los clientes actuales.
5. La pagina de estadisticas funciona sin `/api/trakt/user-stats`.
6. Las paginas de detalle mantienen acciones de visto, rating, favoritos, watchlist y progreso de episodios.
7. La importacion desde Trakt es solo un flujo puntual, no una dependencia de cada carga.
8. Las integraciones externas que se mantengan en Next.js estan documentadas como BFF, no como datos core de usuario.

## Plan recomendado de cierre

### Fase A: Compatibilidad BFF

Mantener las rutas `src/app/api/trakt/*` y `src/app/api/tmdb/account/*`, pero cambiar su implementacion para llamar al backend propio. Es el camino con menos riesgo porque no exige tocar todas las pantallas a la vez.

Prioridad:

1. `/api/trakt/auth/status` contra auth propia.
2. `/api/trakt/item/status` contra `/v1/items/:tmdbId/:mediaType/status`.
3. `/api/trakt/item/watched`, `/api/trakt/episode/watched`, `/api/trakt/season/watched` contra `/v1/history/*`.
4. `/api/trakt/history` contra `/v1/history`, conservando `items`, `stats` y `pagination`.
5. `/api/trakt/ratings` y `/api/trakt/item/rating` contra `/v1/ratings`.
6. `/api/tmdb/account/favorite` y `/api/tmdb/account/watchlist` contra `/v1/favorites` y `/v1/watchlist`.

### Fase B: Estadisticas y dashboard

Implementar endpoints backend para:

- resumen de perfil compatible con `/api/trakt/profile`
- estadisticas avanzadas compatible con `/api/trakt/user-stats`
- dashboard propio o proxy TMDb/Trakt explicito

### Fase C: Comunidad y features opcionales

Decidir por producto:

- comentarios propios o retirar comentarios Trakt
- Plex multiusuario o feature local/personal
- Spotify/soundtrack en backend o seguir en Next.js
- IA Watch Next con datos propios de usuario

## Pruebas de paridad por pantalla

| Pantalla | Estado con backend actual | Prueba necesaria |
| --- | --- | --- |
| Login | No integrada | Registrar/login backend y adaptar UI |
| Home/dashboard | Parcial | Validar secciones sin Trakt |
| Details movie/tv | Parcial | Acciones de favorito/watchlist/visto/rating |
| Details season/episode | Parcial | Marcar temporada y episodios |
| Favorites | Parcial | Sustituir TMDb account por backend |
| Watchlist | Parcial | Sustituir TMDb account por backend |
| History | Parcial | Compatibilidad `items/stats/pagination` |
| Stats | Pendiente | Reemplazar `/api/trakt/user-stats` |
| In progress | Parcial | Usar `/v1/stats/shows/in-progress` con shape UI |
| Lists | Parcial | Separar listas propias, TMDb collections y Trakt public lists |
| Calendar | Parcial | Usar `/v1/stats/calendar` y mantener episodios futuros |
| Profile | Pendiente | Perfil propio + resumen de actividad |
| Plex/Biblioteca | Fuera de backend | Mantener BFF o mover despues |

