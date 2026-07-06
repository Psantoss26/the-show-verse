---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/details

> Utilidades de soporte para las fichas de detalle de película/serie/episodio: formateo, imágenes, premios, sentimiento de reseñas y el gráfico de valoraciones por episodio.

## Responsabilidad

Agrupa lógica extraída de los componentes de ficha (`DetailsClient.jsx` y afines) para mantenerlos manejables: formateo de números/fechas, selección de la mejor imagen (poster/backdrop) por idioma/resolución/votos, caché de OMDb en el navegador, texto de premios legible, análisis de "sentimiento" de comentarios de Trakt, y la estructura de datos que alimenta el gráfico de valoraciones por episodio (SeriesGraph).

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `formatters.js` | `formatShortNumber` (1.2M/3.4k), `slugifyForSeriesGraph`, `formatDateEs`/`formatDateTimeEs`, `formatVoteCount`, `formatCountShort`, `stripHtml`, `mixedCount`/`sumCount`, `translateGenre`. En uso activo (`ScoreboardBar`, `EpisodeDetailsClient`, `SeasonDetailsClient`, `DetailsClient`, `InProgressClient`). |
| `utils.js` | Subconjunto casi idéntico de `formatters.js` (`mixedCount`, `sumCount`, `formatShortNumber`, `slugifyForSeriesGraph`, `formatDateEs`, `formatVoteCount`, `stripHtml`, `formatDateTimeEs`, `uniqBy`), marcado como "auto-extraído de `DetailsClient.jsx`". **Sin importadores en el código actual** — duplicado legacy de `formatters.js`. |
| `tmdbImages.js` | Selección de la mejor imagen: `mergeUniqueImages`, `pickBestImage`, `pickBestNeutralPosterByResVotes`, `pickBestNeutralBackdropByResVotes`, `pickBestBackdropByLangResVotes`, `pickBestBackdropForPreview`, `resolveNeutralBackdropPath`, `preloadTmdb`, `fetchTVImages`. En uso activo desde `DetailsClient.jsx`. Con test (`tmdbImages.test.mjs`). |
| `images.js` | Subconjunto equivalente (`mergeUniqueImages`, `buildOriginalImageUrl`, `pickBestBackdropForPreview`), también "auto-extraído de `DetailsClient.jsx`". **Sin importadores** — duplicado legacy de `tmdbImages.js`. |
| `omdbCache.js` | Caché de OMDb en `localStorage`/`sessionStorage` (TTL 24h): `readOmdbCache`/`writeOmdbCache`, `runIdle`, y parsers de puntuaciones (`omdbGetRatingValue`, `parseOmdbScore0to100`, `parseOmdbScore0to10`, `parseOmdbVotes`, `extractOmdbExtraScores`, `extractOmdbImdbScore`). Usado por `DetailsClient.jsx`. |
| `awardsText.js` | `formatDashboardAwards(rawAwards)`: normaliza nombres de premios (Oscar, Emmy, Globo de Oro, BAFTA…) y cuenta victorias/nominaciones para mostrar un texto corto en tarjetas de dashboard. |
| `sentiment.js` | `buildSentimentFromComments(comments)`: heurística de patrones (positivos/negativos, por temas como "visuals", ritmo, actuación) sobre el texto de comentarios de Trakt para etiquetar el sentimiento general. **Sin importadores actuales** en el código. |
| `episodeRatingsStructure.js` (+ `episodeRatingsStructure.test.js`) | Alinea la numeración "visual" de episodios (posiciones contiguas) con la numeración real de fuentes externas dispares: `getVisualEpisodeNumber`, `seasonStructuresAlign`, `getDirectEpisodeTarget`, `getVisualEpisodeOrdinal`, `mapRatingEpisodesByTmdbOrdinal`. Es la base de `seriesGraphRatings.js`. |
| `seriesGraphRatings.js` | `fetchSeriesGraphRatingsCached`, `getSeriesGraphSeasonAverages/Aggregate`, `getSeriesGraphEpisodeRating`, `getSeriesGraphEpisodeCellData`: construye los datos (con caché en memoria) del gráfico de valoraciones por episodio de una serie, usando `episodeRatingsStructure.js` y `formatters.js`. Consumido por `EpisodeDetailsClient`, `EpisodeRatingsGrid`, `SeasonDetailsClient`, `DetailsClient` y la ruta `api/tv/[id]/episode-imdb`. |
| `tmdbListsClient.js` | Cliente ligero de listas de usuario TMDb v3 desde el navegador (`tmdbFetchAllUserLists`, `tmdbListItemStatus`, `tmdbAddMovieToList`, `tmdbCreateList`), usado por `DetailsClient.jsx` — solapa parcialmente con [[lib-api]]`/tmdbLists.js` (versión servidor). |
| `videos.js` (+ `videos.test.mjs`) | `uniqBy`, `isPlayableVideo`, `videoExternalUrl`/`videoEmbedUrl`/`videoThumbUrl`, `rankVideo`, `pickPreferredVideo`: selección del tráiler/vídeo "preferido" de una ficha. Usado por `VideoModal.jsx`, `ContinueWatchingSection.jsx`, `DetailsClient.jsx`. |

> Nota: hay dos pares de ficheros duplicados (`formatters.js`/`utils.js` e `images.js`/`tmdbImages.js`) fruto de una extracción automática desde `DetailsClient.jsx`; solo la versión más completa (`formatters.js`, `tmdbImages.js`) tiene importadores hoy.

## Cómo se usa

Consumido casi en exclusiva por los componentes de ficha: `DetailsClient.jsx`, `SeasonDetailsClient.jsx`, `EpisodeDetailsClient.jsx`, `EpisodeRatingsGrid.jsx`, `EpisodeRatingsModal.jsx`, `ScoreboardBar.jsx`, además de tarjetas de dashboard que muestran premios (`MainDashboardClient`, `FeaturedHero`, `ContinueWatchingSection`, `SeriesPageClient`, `MoviesPageClient`) y una ruta API (`api/tv/[id]/episode-imdb`).

## Dependencias

- Ninguna API externa directa (trabajan sobre datos ya obtenidos vía [[lib-api]]), salvo `seriesGraphRatings.js` y `tmdbImages.js` que hacen fetch a rutas internas propias.
- Dependencias internas cruzadas dentro del propio módulo: `seriesGraphRatings.js` → `episodeRatingsStructure.js` + `formatters.js`; `sentiment.js` → `formatters.js`.

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
- [[components]]
