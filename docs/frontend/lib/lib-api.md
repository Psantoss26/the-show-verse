---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/api

> Todos los clientes HTTP hacia servicios externos (TMDb, Trakt, JustWatch, OMDb/IMDb, iTunes/Deezer, Wikidata) y hacia el propio calendario del backend.

## Responsabilidad

`src/lib/api` es el módulo más grande de `src/lib`: reúne prácticamente todo el acceso a **TMDb** (catálogo, cuenta, favoritos/watchlist, listas), **Trakt** (acciones de usuario e ingesta de contenido para los dashboards legacy), **JustWatch** (disponibilidad en plataformas de streaming), **OMDb/IMDb** (valoraciones), **iTunes/Deezer** (búsqueda de bandas sonoras) y **Wikidata** (premios de personas). Algunas funciones corren en el navegador (fetch a rutas internas `/api/**`), otras en servidor (llaman directo a la API externa con la API key privada).

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `tmdb.js` (1410 líneas) | Cliente TMDb principal: `fetchTrendingMovies/TV`, `fetchPopularMovies/TV`, `getDetails/getImages/getVideos/getCredits/getRecommendations`, `getWatchProviders` + normalización por región, cuenta v3 (`getMediaAccountStates`, `markAsFavorite`, `markInWatchlist`, `fetchFavoritesForUser`, `fetchWatchlistForUser`, `fetchRatedForUser`), `discoverMovies/discoverTV`, y los generadores de secciones/buckets usados por dashboards (`fetchMovieSections`, `fetchTVSections`, `fetchMovieBuckets`, `fetchTVBuckets`). Las mutaciones de favorito/watchlist pasan por `offlineMutationFetch` ([[lib-offline]]) y actualizan la caché optimista ([[lib-userlists]]). |
| `auth.js` | Flujo de autenticación TMDb v3 clásico: `createRequestToken`, `validateWithLogin`, `createSession`, `getAccount`/`getUserAccount`, lectura de cookie. |
| `tmdbLists.js` | CRUD de listas de usuario TMDb v3 (`fetchUserLists`, `createUserList`, `updateUserList`, `deleteUserList`, `addMovieToList`/`removeMovieFromList`, `searchMovies`). |
| `calendar.js` / `calendarEpisodes.js` | Sección "Calendario": `getMoviesByDate(Range)` contra `discover/movie` de TMDb; `getTrackedEpisodesByDateRange` y `fetchUpcomingEpisodes` contra rutas internas (`/api/trakt/calendar/episodes`, `/api/calendar/upcoming-episodes`) que usan la BBDD propia, sin Trakt en el segundo caso. |
| `itemStatus.js` | `getBackendItemStatus({type, tmdbId})`: estado (favorito/pendiente/visto) de un título leído del backend propio, con deduplicación de peticiones en vuelo. Pensado para tarjetas de dashboard. |
| `traktClient.js` (818 líneas) | Cliente Trakt **de cliente** (llama a rutas internas `/api/trakt/*`, no a Trakt directo): marcar visto/pendiente, historial (`traktHistoryOp`, `traktAddWatchPlay`, `traktRemoveHistoryEntries`), episodios/temporadas vistas, valoraciones, comentarios, listas, scoreboard, "en progreso"/"completadas". Usa `offlineMutationFetch` y actualiza la caché optimista tras cada mutación. |
| `traktHelpers.js` (607 líneas) | Cliente Trakt **de servidor**: contenido variado (trending/popular/recommended/anticipated/played/watched/collected) para películas y series, usado por rutas `/api/trakt/dashboard/*`. Se apoya en `@/lib/trakt/fetchWithCache` y `@/lib/trakt/server`. |
| `justwatch.js` (549 líneas) | Cliente no oficial de JustWatch (GraphQL): `getStreamingProviders`/`getEpisodeStreamingProviders` (disponibilidad por país), `mapEpisodeOffersToProviders`, `selectJustWatchTitle`, mapeo de plataformas a URLs. Usado por `/api/streaming` y `/api/streaming/episode-links`. |
| `ratingsHelper.js` / `ratingsCached.js` | Agregación de valoraciones IMDb/OMDb por episodio y temporada (`getEpisodeImdbRating`, `getSeasonImdbAggregate`, `getEpisodeRatings`); `ratingsCached.js` envuelve estas funciones con `unstable_cache` de Next para servir agregados de temporada/episodio cacheados. |
| `imdbRatings.js` | `fetchImdbRatingByImdb(s)`: valoración IMDb por id, vía proxy interno, con timeout/abort configurable. |
| `omdb.js` | `fetchOmdbByImdb`: proxy a `/api/omdb` (Awards, Runtime, etc.). |
| `tmdbAwards.js` | `fetchTmdbAwards(type, id)`: premios detallados vía ruta interna `/api/tmdb/awards`. |
| `wikidata.js` | `fetchPersonAwardsFromWikidata(wikidataId)`: consulta la API de Wikidata para premios de una persona. |
| `soundtrack-utils.js` (548 líneas) | Utilidades **puras** compartidas de matching de bandas sonoras: normalización de texto/títulos, puntuación por similitud de título/año, listas de palabras clave (`SOUNDTRACK_WORDS`, `BAD_MATCH_WORDS`, `GENERIC_WORDS`), `scoreSoundtrackAlbumCandidate`. Sin dependencias de red. |
| `itunes.js` | `searchITunes`: búsqueda de bandas sonoras en iTunes Search API, usando `soundtrack-utils` para puntuar/filtrar candidatos; `dedupeTracks`. |
| `deezer.js` | `searchDeezer`: equivalente para la API de Deezer. |
| `soundtrack-fallback.js` | `searchFallback`: orquesta iTunes → Deezer cuando no hay suficientes pistas (`MIN_TRACKS_TO_STOP`), deduplicando por nombre/artista. Usado por `/api/soundtrack` como último recurso tras intentar Spotify (ver [[lib-spotify]]). |
| `movies.js`, `people.js`, `tv.js` | **Código muerto**: sin importadores en el resto del código. `movies.js` además importa `fetchFromTMDb` desde `./tmdb`, función que ya no existe en `tmdb.js` (el import rompería en ejecución). `people.js` y `tv.js` están vacíos. |
| `justwatchEpisode.test.mjs` | Test del mapeo de ofertas de streaming por episodio (`justwatch.js`). |

## Cómo se usa

Consumido masivamente desde páginas de servidor (`src/app/page.jsx`, `movies/`, `series/`, `details/[type]/[id]/`), sus `*Client.jsx` asociados, componentes de dashboard (`MainDashboardClient`, `FeaturedHero`, `ContinueWatchingSection`) y numerosas rutas API internas (`src/app/api/tmdb/**`, `src/app/api/trakt/**`, `src/app/api/tv/**`). Patrón típico: un Server Component o route handler llama a una función de `tmdb.js`/`traktHelpers.js` con la API key privada; el cliente llama a `traktClient.js`/`tmdbLists.js`/`itemStatus.js`, que a su vez llaman a rutas internas `/api/**` (nunca a la API externa directamente desde el navegador, salvo TMDb con `NEXT_PUBLIC_TMDB_API_KEY`).

## Dependencias

- APIs externas: TMDb v3, Trakt API, JustWatch (GraphQL no oficial), OMDb, dataset/API de IMDb, iTunes Search API, Deezer API, Wikidata.
- Otros módulos de `lib`: [[lib-offline]] (mutaciones), [[lib-userlists]] (caché optimista), `@/lib/trakt/fetchWithCache` y `@/lib/trakt/server` (ver [[TRAKT_CACHE_SYSTEM|Sistema de caché de Trakt]]), [[lib-spotify]] (orquestación en `/api/soundtrack`).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-offline]]
- [[lib-userlists]]
- [[lib-spotify]]
- [[TRAKT_CACHE_SYSTEM|Sistema de caché de Trakt]]
- [[dashboards-implementation|Implementación de dashboards]]
