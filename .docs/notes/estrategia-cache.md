# Estrategia de caché de The Show Verse

Este documento resume, a partir del código actual, cómo se cachean los datos en la aplicación, en qué nivel se guardan y cuánto tiempo duran.

## Capas de caché

La app combina varios niveles:

1. `ISR / Next Data Cache`
   Se usa en páginas y `fetch(..., { next: { revalidate } })` del servidor.
   Guarda respuestas en el servidor de Next/Vercel y regenera tras el TTL.

2. `unstable_cache`
   Se usa para agregados caros o repetidos, sobre todo en Trakt e IMDb por episodio/temporada.
   Es una caché persistente del lado servidor, compartida entre peticiones.

3. `HTTP/CDN cache`
   Varias rutas API devuelven cabeceras `Cache-Control: public, s-maxage=..., stale-while-revalidate=...`.
   Esto permite cachear en la CDN y reutilizar respuestas públicas.

4. `Cache en memoria de módulo`
   `Map()` en servidor o cliente para evitar refetches durante la vida del proceso o de la pestaña.
   No persiste entre despliegues ni reinicios.

5. `localStorage / sessionStorage`
   Se usa para snapshots, preferencias de UI y resultados auxiliares.
   `localStorage` persiste entre sesiones; `sessionStorage` vive mientras dure la pestaña.

6. `Deduplicación de peticiones en vuelo`
   Mapas como `pendingRequests`, `inFlightGetRequests` o `*Inflight` evitan lanzar la misma petición varias veces a la vez.

## Resumen por sección

| Sección | Qué se cachea | Dónde | TTL |
|---|---|---|---|
| Home `/` | HTML SSR/ISR del dashboard | Next ISR | 1 hora |
| Películas `/movies` | HTML SSR/ISR y llamadas server-side a IMDb/TMDb | Next ISR + Data Cache | 30 min |
| Series `/series` | HTML SSR/ISR y llamadas server-side a IMDb/TMDb | Next ISR + Data Cache | 30 min |
| Detalle película/serie | HTML base + TMDb + scoreboard Trakt + IMDb/OMDb + providers + Plex | ISR + `unstable_cache` + CDN + navegador | entre 2 min y 30 días según dato |
| Temporada / episodio | TMDb, scoreboard Trakt e IMDb agregado | ISR + `unstable_cache` + caché cliente | 1 hora en servidor |
| Watchlist / Favoritos | puntuaciones externas, posters y preferencias | `localStorage`, `sessionStorage`, `Map()` | 24h, 10 min o 30 días |
| En progreso | listado Trakt del usuario | `sessionStorage` + memoria servidor | 5 min cliente, 3 min servidor |
| Biblioteca Plex | librería agregada de Plex | `localStorage` + CDN | 30 min |
| Descubrir / Calendar / Historial / Lists | sobre todo filtros y preferencias | `localStorage` / `sessionStorage` | sin TTL explícito salvo OMDb |

## 1. Home

Archivos principales:
- `src/app/page.jsx`
- `src/lib/api/tmdb.js`
- `src/lib/api/traktHelpers.js`
- `src/lib/trakt/fetchWithCache.js`

Cómo funciona:
- La página principal usa `export const revalidate = 3600`, así que el HTML del dashboard se regenera cada 1 hora.
- Las llamadas server-side a TMDb en `src/lib/api/tmdb.js` usan por defecto `cache: "force-cache"` y `next: { revalidate: 60 * 10 }`, así que el catálogo TMDb se revalida cada 10 minutos.
- Los bloques de Trakt del dashboard usan `fetchWithCache` con caché en memoria de 1 hora.
- En cliente, `MainDashboardClient` usa `Map()` para imágenes, backdrops y trailers ya resueltos durante la sesión de la pestaña.
- Las preferencias de artwork se guardan en `localStorage` sin TTL explícito.

## 2. Películas y Series

Archivos principales:
- `src/app/movies/page.jsx`
- `src/app/series/page.jsx`
- `src/lib/api/tmdb.js`
- `src/app/api/imdb/top-rated/route.js`

Cómo funciona:
- Tanto `/movies` como `/series` tienen `revalidate = 1800`, así que la página se rehace cada 30 minutos.
- Las llamadas server-side a `/api/imdb/top-rated` también se hacen con `next: { revalidate: revalidate }`, o sea 30 minutos.
- La propia ruta `/api/imdb/top-rated` además usa:
  - `export const revalidate = 43200` para su trabajo interno
  - `Cache-Control: public, s-maxage=43200, stale-while-revalidate=86400`
- Resultado: el HTML de la sección dura 30 min, pero la fuente de IMDb está mucho más amortiguada y puede servirse desde CDN hasta 12h.

## 3. Página de detalle de película/serie

Archivos principales:
- `src/app/details/[type]/[id]/page.jsx`
- `src/app/details/tv/[id]/page.jsx`
- `src/components/DetailsClient.jsx`
- `src/lib/trakt/scoreboardCached.js`
- `src/lib/trakt/scoreboard.js`
- `src/app/api/scoreboard/public/route.js`
- `src/app/api/trakt/scoreboard/route.js`
- `src/app/api/trakt/stats/route.js`
- `src/lib/details/omdbCache.js`

Capas activas:

### HTML base del detalle
- `revalidate = 600` en las páginas de detalle de movie/tv.
- La página base se refresca cada 10 minutos.

### TMDb del detalle
- `getDetails()` usa el helper de `src/lib/api/tmdb.js`.
- En servidor: `force-cache` + `revalidate` por defecto de 10 minutos.

### Scoreboard público de Trakt
- En servidor:
  - `scoreboardCached.js` usa `unstable_cache`.
  - Modo rápido: `revalidate: 1800` para rating/votos.
  - Modo completo: `revalidate: 120` para rating/votos/stats.
- En API pública:
  - `/api/scoreboard/public` y `/api/trakt/scoreboard`
  - `includeStats=true`: `s-maxage=120`, `stale-while-revalidate=900`
  - `includeStats=false`: `s-maxage=1800`, `stale-while-revalidate=3600`
  - Si el resultado no es cacheable o falla, se devuelve `private, no-store`.
- En Trakt:
  - `src/lib/trakt/fetchWithCache.js` guarda respuestas en memoria 1 hora.
  - También cachea errores esperables 5 min y bloquea temporalmente 429.

### Resolución TMDb -> Trakt ID
- `src/lib/trakt/resolve.js`
- Caché en memoria 1 hora.
- `pendingResolutions` deduplica peticiones simultáneas.

### Stats públicas de Trakt
- `src/app/api/trakt/stats/route.js`
- `unstable_cache` con `revalidate: 600`
- Cabecera CDN: `s-maxage=600`, `stale-while-revalidate=3600`

### Estado de Trakt del usuario
- Rutas como `/api/trakt/item/status` están marcadas con `revalidate = 0`.
- No se cachean de forma pública porque dependen del usuario autenticado.
- En cliente, `DetailsClient.jsx` guarda snapshots en `localStorage`:
  - `showverse:trakt:status:*`
  - `showverse:trakt:showWatched:*`
- Estos snapshots no tienen TTL explícito; se usan como hidratación rápida y se sobrescriben al refrescar el estado.

### IMDb / OMDb extra
- `src/lib/details/omdbCache.js`
- `sessionStorage`
- TTL: 24 horas
- Se cachean `imdbRating`, `imdbVotes`, premios, Rotten Tomatoes y Metacritic.

### Ratings por episodio de una serie
- `DetailsClient.jsx`
- `localStorage`
- TTL: 30 días
- Clave: `showverse:tv:{id}:episode-ratings:v3-imdb-tmdb`

### Providers y enlaces externos del detalle
- Providers de streaming en `DetailsClient.jsx`
  - `sessionStorage`
  - TTL: 24 horas
- Disponibilidad de Plex
  - `sessionStorage`
  - TTL: 7 días
- Link de JustWatch
  - `localStorage`
  - sin TTL explícito

## 4. Temporadas y episodios

Archivos principales:
- `src/app/details/tv/[id]/season/[season]/page.jsx`
- `src/app/details/tv/[id]/season/[season]/episode/[episode]/page.jsx`
- `src/lib/api/ratingsCached.js`
- `src/components/SeasonDetailsClient.jsx`
- `src/components/EpisodeDetailsClient.jsx`

Cómo funciona:
- Las páginas de temporada y episodio usan `revalidate = 3600`.
- TMDb para temporada/episodio también se consulta con ese mismo TTL de 1 hora.
- `ratingsCached.js` usa `unstable_cache` para:
  - ratings por episodio
  - IMDb agregado de temporada
  - IMDb de episodio
  - TTL: 1 hora
- En cliente, `SeasonDetailsClient` y `EpisodeDetailsClient` mantienen caches en memoria (`Map`) para scoreboard, stats e IMDb durante la vida de la pestaña.
- Las peticiones cliente de estas vistas usan `cache: "force-cache"` para aprovechar también la capa HTTP del navegador/CDN.

## 5. Watchlist y Favoritos

Archivos principales:
- `src/app/watchlist/WatchlistClient.jsx`
- `src/app/favorites/FavoritesClient.jsx`

### Watchlist
- Puntuaciones persistentes por fuente (`showverse:scores:*`) en `localStorage`
- TTL: 30 días
- Se usan para no recalcular continuamente ratings ya obtenidos.
- Las preferencias de vista, filtros, orden, agrupación e image mode se guardan en `localStorage` sin TTL.

### Favoritos
- OMDb en `sessionStorage`
  - TTL: 24 horas
- Caché en memoria de rating del usuario TMDb
  - TTL: 10 min si existe valor
  - TTL: 45 s si el valor es nulo
- Caché en memoria de nota de Trakt
  - TTL: 24 horas
- Score cache persistente en `localStorage`
  - TTL: 30 días
- Preferencias de UI
  - `localStorage`, sin TTL

## 6. En progreso

Archivos principales:
- `src/app/in-progress/InProgressClient.jsx`
- `src/app/api/trakt/show/in-progress/route.js`

Capas:
- Cliente:
  - `sessionStorage`
  - clave `showverse:trakt:in-progress:v1`
  - TTL: 5 minutos
- Servidor:
  - `Map()` `_progressCache`
  - TTL: 3 minutos por instancia de Node
- TMDb complementario en esa ruta:
  - `fetch(..., { next: { revalidate: 86400 } })`
  - TTL: 24 horas

La idea aquí es clara: los datos personales de progreso se refrescan rápido, pero los metadatos estáticos de TMDb se amortizan mucho más.

## 7. Biblioteca Plex

Archivos principales:
- `src/app/biblioteca/BibliotecaClient.jsx`
- `src/app/api/plex/library/route.js`
- `src/app/api/plex/route.js`

Capas:
- Página `/biblioteca`
  - `revalidate = 1800`
- Cliente:
  - `localStorage`
  - TTL: 30 minutos
  - clave base `showverse:plex-library:v5`
- API `/api/plex/library`
  - `revalidate = 1800`
  - `Cache-Control: public, s-maxage=1800, stale-while-revalidate=3600, max-age=900`
  - también define `CDN-Cache-Control` y `Vercel-CDN-Cache-Control`
- API `/api/plex`
  - `s-maxage=3600`, `stale-while-revalidate=7200` para disponibilidad puntual

## 8. Discover, Lists, Calendar e Historial

Archivos principales:
- `src/components/DiscoverClient.jsx`
- `src/app/lists/page.jsx`
- `src/app/calendar/page.jsx`
- `src/app/history/HistoryClient.jsx`

Patrón dominante:
- En estas secciones la caché principal no es de datos públicos, sino de estado de interfaz.
- Se persisten en `localStorage`:
  - filtros
  - modo de vista
  - orden
  - agrupación
  - paneles abiertos/cerrados
- Normalmente no tienen TTL explícito.

Excepciones:
- `lists/page.jsx` cachea ratings de OMDb en `sessionStorage` con TTL de 24 horas.
- `useTraktLists` usa `fetch(..., { cache: "no-store" })`, así que las listas de Trakt se refrescan siempre.

## 9. APIs auxiliares con TTL claro

### OMDb
- `src/app/api/omdb/route.js`
- `next.revalidate = 24h`
- `Cache-Control: s-maxage=86400, stale-while-revalidate=604800`

### Streaming / JustWatch proxy
- `src/app/api/streaming/route.js`
- `Cache-Control: s-maxage=86400, stale-while-revalidate=172800`

### Ratings TV por episodios y temporadas
- `src/app/api/tv/[id]/ratings/route.js`
  - `s-maxage = RATINGS_REVALIDATE_SECONDS`
- `src/app/api/ratings/season/route.js`
  - `revalidate = 3600`
  - `s-maxage=3600`, `stale-while-revalidate=86400`
- `src/app/api/tv/[id]/episode-imdb/route.js`
  - `revalidate = 3600`
  - `s-maxage=3600`, `stale-while-revalidate=86400`

## Conclusión

La estrategia real del proyecto no depende de una sola caché, sino de una cascada:

1. `ISR` para páginas completas
2. `fetch(...next.revalidate...)` y `unstable_cache` para agregados de servidor
3. `Cache-Control` para CDN
4. `Map()` para memoria de proceso o de pestaña
5. `localStorage/sessionStorage` para acelerar visitas repetidas y recordar UI

En la práctica:
- datos públicos y lentos de cambiar: 1h a 24h
- scoreboards y stats de Trakt: 2 min a 30 min según nivel
- estado de usuario: `no-store` o caches muy cortas
- preferencias y snapshots de UI: persistentes en navegador
