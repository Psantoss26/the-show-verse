# Hero destacado a pantalla completa — Página de Inicio

Fecha: 2026-06-23

## Objetivo

Añadir como primera sección de la página de Inicio un *hero* a pantalla completa
con contenido destacado (películas/series), al estilo de Netflix, Amazon Prime
Video o Disney+. La sección actual «Mejor valoradas» (`TopRatedHero`) se conserva
justo debajo.

## Decisiones (acordadas con el usuario)

- **Alcance**: el hero se **añade encima** de «Mejor valoradas»; no la sustituye.
- **Criterio de contenido destacado**: mezcla curada de fuentes ya cargadas en SSR.
- **Tamaño/navbar**: pantalla completa (~88vh desktop / ~72vh móvil) con la navbar
  transparente sobre la imagen, que vuelve a su fondo *glass* al hacer scroll.
- **Overlay**: logo oficial del título (arte tipo `logo` de TMDb; nombre como
  respaldo), metadatos, puntuaciones TMDb e IMDb con sus marcas, sinopsis breve y
  botones de acción: trailer, favorito, pendiente y visionado.
- **Visionado**: usa el historial del backend/BBDD propio (función
  `traktSetWatched`, de nombre heredado pero ya respaldada por `/v1/history`), no
  Trakt. El estado inicial se lee con `traktGetItemStatus`.
- **Rotación**: 8 títulos, autoplay ~7s, con *dots* y flechas; pausa al interactuar.

## Criterio de selección (`buildFeatured`, servidor en `page.jsx`)

Combina las fuentes que ya se cargan en SSR (`topRatedMovies`, `topRatedTV`,
`trending`, `awarded`) para que el hero sea *server-rendered* y no provoque
*layout shift*:

1. **Dedupe** por `id`; descarta títulos sin `backdrop_path`.
2. **Score** por título:
   - nota normalizada (`vote_average / 10`) con peso alto,
   - confianza/popularidad: `log10(vote_count + 1)` normalizado,
   - *boost* si aparece en `trending`,
   - *boost* si aparece en `awarded`.
3. **Variedad**: intercala películas y series para que no sean las 8 del mismo tipo.
4. Devuelve los **8 mejores** en `dashboardData.featured`.

Mejora progresiva en cliente (tras montar, sin bloquear LCP): se sustituye el
backdrop por el mejor backdrop EN (`fetchBestBackdrop`) y se carga el logo del
título (`getLogos`), sembrados con `backdrop_path` para evitar hueco inicial.

## Componentes y archivos

- **`src/lib/dashboard/media.js`** (nuevo): helpers compartidos extraídos de
  `MainDashboardClient.jsx` (`buildImg`, `GENRES`, `getMediaTypeForItem`,
  formatters `yearOf`/`ratingOf`/`formatRuntime`, `preloadImage`,
  `getMovieImages`, `fetchBestBackdrop`, `preparePreviewBackdrop`,
  `fetchBestPoster`, `getBestTrailerCached`, cachés compartidas y selectores de
  imagen/trailer). Importado por `MainDashboardClient` y `FeaturedHero`.
- **`src/components/FeaturedHero.jsx`** (nuevo): el hero a pantalla completa.
  - Swiper 1 slide/full, 8 ítems, autoplay 7s, *dots* + flechas, pausa al interactuar.
  - Backdrop `object-cover` + degradados inferior/izquierda para legibilidad.
  - Overlay: logo del título (o nombre), metadatos (año • géneros • duración/temporadas),
    puntuaciones TMDb/IMDb con logos, sinopsis breve, y botones `LiquidButton`
    (trailer inline silenciado, favorito, pendiente, visionado). Clic en el fondo →
    `/details/{type}/{id}`.
  - Móvil: altura menor, overlay apilado.
- **`src/app/page.jsx`**: añadir `buildFeatured()` y `featured` a `getDashboardData`.
- **`src/components/MainDashboardClient.jsx`**: renderizar `<FeaturedHero>` como
  primera sección (full-bleed con márgenes negativos), importar helpers del módulo.
- **`src/components/Navbar.jsx`**: en la ruta `/`, fondo transparente cuando
  `scrollY ≈ 0` (reutiliza `isScrolled`); *glass* al hacer scroll. Resto de rutas
  sin cambios.

## Acciones del hero (reutilización)

- Favorito/pendiente: `getMediaAccountStates`, `markAsFavorite`, `markInWatchlist`
  (igual que `InlinePreviewCard`).
- Visionado: estado con `traktGetItemStatus({ type, tmdbId })`; toggle con
  `traktSetWatched({ type, tmdbId, watched })`. `type` es `movie|show` (tv→show).
- Trailer: `getBestTrailerCached` + iframe de YouTube silenciado (como `InlinePreviewCard`).

## Rendimiento

- Hero *server-rendered* (`force-static`, `revalidate=3600`). El primer slide se
  marca `priority`. Backdrops EN y logos se cargan en cliente de forma progresiva.

## Verificación

- `npm run lint` y `npm run build` sin errores.
- Comprobación visual: hero a pantalla completa, navbar transparente arriba y
  glass al scrollear, botones funcionales, rotación y *dots*.
