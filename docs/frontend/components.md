---
tags: [area/frontend, type/referencia]
---
# Componentes (`src/components`)

> Mapa navegable de los componentes de UI, agrupados por carpeta. No detalla props: para eso, abrir el fichero.

Casi todos son Client Components (`"use client"`); consumen `useAuth()` de [[Frontend#Organización de src|AuthContext]] y la lógica de dominio de `src/lib` (ver [[Frontend-Lib]]). Los que renderizan `page.jsx` de una ruta completa se documentan también en [[app-router-pages]].

## Raíz (`src/components/*.jsx`)

Layout global, dashboards y páginas de detalle "grandes".

| Componente | Propósito |
|---|---|
| `Navbar.jsx` | Barra de navegación global (desktop + móvil), avatar de usuario (`UserAvatar`), buscador e i18n (`useTranslation`). En el móvil, el botón «Filtrar búsqueda» del buscador abre `MobileOptionsSheet` (tipos en píldoras, `layerClassName="z-[100001]"` para quedar por encima del desplegable de resultados, que sigue detrás y se actualiza; elegir no cierra la hoja ni enfoca el campo); en escritorio y tablet sigue el desplegable junto al botón. El menú lateral móvil usa el mismo cristal que la barra inferior (`LIQUID_GLASS_SURFACE` + `LiquidGlassOpticalLayers`), con el velo en una capa hermana para no apagar el desenfoque. En escritorio pinta además la **barra lateral izquierda**: las mismas secciones que la inferior del móvil (preferencia `mobileBottomNav`), en vertical y con la misma cápsula activa (`BottomNavActiveLens`). Sale en todas las páginas salvo los dashboards (`/`, `/movies`, `/series`, `/dashboard/*`), el acceso y `/embed` (`showsDesktopSideNav` en `src/lib/ui/mobileBottomNav.js`); `navigation/DesktopSideNavInset` reserva su ancho a la izquierda del contenido para que no tape nada. Entra y sale deslizándose por el borde izquierdo (posición en línea, curvas en `.sv-desktop-side-nav` de `globals.css`) y se desmonta al terminar la salida: en los dashboards no está montada. Solo `transform`, porque una `opacity` apagaría su cristal. Hover de sus botones (`.sv-side-nav-link` + `data-tone`): el icono crece y toma el tono de la sección, y una lente de cristal (`.sv-side-nav-hover`) crece detrás; en la sección activa solo crece el icono. |
| `NoPageScroll.jsx` | Utilidad de layout: bloquea el scroll de `<html>`/`<body>` para páginas tipo pantalla completa. |
| `ScrollRestoration.jsx` | Restaura la posición de scroll al navegar (guardado en `sessionStorage`/similar), tolerante a contenido asíncrono que crece tras el primer frame. |
| `PwaManager.jsx` | Gestiona instalación de PWA y limpieza de cachés `showverse-*` del Service Worker. |
| `OptimizedImage.jsx` | Wrapper ligero sobre `<img>` (sin `next/image`) usado en casi toda la app, alineado con `images.unoptimized` de `next.config.ts`. |
| `MainDashboardClient.jsx` | Cliente de la home (`/`): filas de tendencias/populares/recomendados, hero destacado, carruseles. |
| `FeaturedHero.jsx` | Hero principal del dashboard (backdrop grande, trailer en hover/autoplay, CTAs favorito/watchlist). El logo sigue el mismo criterio que la ficha y la ficha rápida: elección propia (`useOwnArtwork(…, "logo")`, al momento) → el más votado (`fetchCommunityArtwork`, en paralelo con `/images` y con tope de 1,5 s; escucha `subscribeCommunityArtwork` del título activo) → automático con `HERO_LOGO_LANGS` (inglés → sin idioma → español, de `lib/dashboard/media.js`). Si el logo es oscuro (luminancia media < 75 **y** brillo del canal más alto < 110, muestreado a 48×48) se pinta en blanco; la segunda condición evita que logos de colores saturados (rojo, azul) acaben como silueta blanca. |
| `ContinueWatchingSection.jsx` | Carrusel "Continuar viendo" (progreso Trakt); patrón reutilizado por `DashboardCalendarSection`. En escritorio sus tarjetas backdrop tienen el mismo ancho fijo que `DashboardBackdropRow` (300 px; 340 px desde `xl`, `slidesPerView: "auto"`), así que no encogen según el ancho de pantalla. |
| `DashboardCalendarSection.jsx` | Sección "Calendario" del home: próximos episodios (BBDD propia + TMDb) reutilizando el carrusel de Continuar viendo. |
| `CarruselIndividual.jsx` | Carrusel horizontal simple (Swiper) para una lista de títulos. |
| `DiscoverClient.jsx` | Cliente de `/discover`: filtros (género, año, plataforma) sobre discover de TMDb. |
| `WatchNextAssistant.jsx` | Asistente "qué ver ahora" (llama a `api/ai/watch-next`). |
| `DetailsSectionMenu.jsx` | Menú de navegación por anclas dentro de una ficha de detalle (temporadas, reparto, etc.). |
| `DetailsClient.jsx` | Componente principal de ficha de película/serie: puntuaciones (TMDb/Trakt/IMDb/RT/Metacritic), listas, episodios/temporadas, colecciones, comentarios, reparto, recomendaciones, Trakt y Plex. El componente más grande de la app. En las filas de Reparto, Recomendaciones y Colección, las tarjetas de la primera vista (`detailsRowImageLoading` de `src/lib/tmdb/imageSrcSet.js`, 7 por fila) piden su imagen al montarse con prioridad baja; el resto de la fila sigue en diferido. |
| `DetailsPageLoader.jsx` | Envoltorio que carga datos diferidos (créditos, recomendaciones, reviews, watch providers) y monta `DetailsClient`. |
| `SeasonDetailsClient.jsx` | Cliente de `/details/tv/[id]/season/[season]`. |
| `EpisodeDetailsClient.jsx` | Cliente de la ficha de episodio. |
| `EpisodeRatingsGrid.jsx` | Grid de valoraciones de episodios de una temporada (usado también dentro de `EpisodeRatingsModal`). |
| `ActorDetails.jsx` | Ficha de actor/actriz (`/details/person/[id]`). La trayectoria (`lib/actor/careerRange.js`) y la vista lateral Filmografía (`lib/actor/filmography.js`, con `birthday`) no cuentan los créditos fechados antes del nacimiento: TMDb fecha la TV con el estreno de la serie, y una gala o un programa con décadas de emisión (Oscars, Globos de Oro) movía el inicio décadas atrás. En Filmografía esos títulos van al final, sin año. |
| `FavoriteWatchlistButtons.jsx` | Botones de favorito/watchlist reutilizables sobre TMDb account states. |
| `StarRating.jsx` | Selector de valoración por estrellas (usado en fichas y modales de Trakt). |
| `LiquidButton.jsx` | Botón con efecto "líquido/cristal" (demo en `/demo/liquid-buttons`); ver [[LIQUID_BUTTONS]]. |
| `NetflixSyncListener.jsx` | Escucha en segundo plano la sincronización de Netflix (extensión/móvil) y muestra toasts de "detectado X". |

## `auth/`

| Componente | Propósito |
|---|---|
| `LoginForm.jsx` | Formulario de login/registro (usa `useAuth()`), sanitiza `?next=`. |
| `LoginButton.jsx` | Botón de acceso rápido que redirige a `/login?next=...`. |
| `UserAvatar.jsx` | Avatar del usuario (iniciales si no hay imagen) enlazado a `/profile`. |
| `LoginRequiredScreen.jsx` | Pantalla «Inicia sesión» sin sesión en Favoritos, Pendientes y Social: cabecera de la sección, manchas de su color (`theme`: red, blue, purple, pink) y tarjeta de cristal con logo y botón a `/login?next=`. Exporta también esa tarjeta sola, `LoginRequiredCard`, para las páginas que bloquean una única sección y conservan su cabecera y pestañas (Mis listas en `/lists`). |

## `dashboard/`

Piezas específicas de los dashboards (Inicio/Películas/Series/Secciones).

| Componente | Propósito |
|---|---|
| `useEngineRows.js` | Hook compartido que pide al backend las filas genéricas + recomendaciones (dedupe/rotación ya resuelta en servidor) para los tres dashboards; cachea en memoria y `localStorage` (`showverse:dashboard:engine:v3:*`). |
| `DashboardSpotlightPreview.jsx` | Preview "spotlight" de un título dentro del dashboard (acciones rápidas: favorito, watchlist, play). |
| `HeroSoundtrackPlayer.jsx` | Reproductor de banda sonora (Spotify) integrado en el hero del dashboard. |
| `DashboardBackdropRow.jsx` | Fila de tarjetas backdrop (16:9) que en el ordenador alterna con las de pósters en los dashboards (`shouldUseDashboardBackdropRow` de `lib/dashboard/rowLayout.js`). En escritorio cada tarjeta tiene ancho fijo, tan ancha como alto es el póster de las filas vecinas (`!w-[300px] xl:!w-[340px]`, `slidesPerView: "auto"`), así que su tamaño no depende del ancho de la pantalla; las visibles enteras (alineación de la vista previa y paso de las flechas) se calculan del ancho de la fila. En el móvil, dos por fila. |
| `DashboardRankNumber.jsx` | Número de ranking estilizado (estética "cristal") para listas tipo Top 10, con paletas por tono (`movies`, `series`, ...). |

Ver también [[dashboards-implementation|Implementación de dashboards]].

## `details/`

Subcomponentes y modales usados por `DetailsClient`/`SeasonDetailsClient`/`EpisodeDetailsClient`.

| Componente | Propósito |
|---|---|
| `DetailAtoms.jsx` | Átomos visuales reutilizados en la ficha (`VisualMetaCard`, etc.). |
| `DetailHeaderBits.jsx` | Piezas del cabecero de la ficha (badges compactos, botón compartir...). `useShareAction` devuelve `warmProps`: al pasar el ratón, enfocar o tocar el botón empieza a generarse la imagen de compartir (`prefetchShare` de `DetailsShareSheet`), y la hoja reutiliza esa petición. |
| `AnimatedSection.jsx` | Wrapper de `framer-motion` para animar secciones al entrar en viewport. |
| `AnimatedPosterFrame.jsx` | Marco de póster con transición/estado de error de imagen. |
| `PosterStack.jsx` | Pila de pósters superpuestos (colecciones). |
| `LoadingSkeleton.jsx` | Esqueletos de carga (`PosterSkeleton`, etc.) para estados pendientes. |
| `ScoreboardBar.jsx` | Barra de puntuaciones agregadas (TMDb/Trakt/IMDb/RT/Metacritic) + acciones (visto, lista, favorito). |
| `SeasonsSection.jsx` | Sección «Temporadas» de la ficha de la serie con dos vistas (tarjetas en rejilla y pósters en carrusel) y su selector. El cambio de vista es animado con la Web Animations API: la vista actual se apaga en su sitio (160 ms), la sección pasa de su altura a la de la nueva sin saltos (360 ms) y las temporadas de la nueva entran en cascada (las 6 primeras escalonadas). El selector cambia al momento; si se vuelve a pulsar a mitad, el cambio en curso se corta y parte de donde estaba. Con movimiento reducido el cambio es directo. Los pósters de las 7 primeras tarjetas (las de la primera vista) se piden en el acto con prioridad baja (`detailsRowImageLoading`), como en Reparto y Recomendaciones; el resto, en diferido. Con todos en `loading="lazy"`, tras volver a la ficha guardada Chrome a veces no llegaba a pedirlos aunque estuvieran en pantalla y las tarjetas se quedaban negras. El póster de `SeasonCard` y `SeasonPosterCard` no se enseña hasta estar cargado y decodificado (`useImageLoadReady`): mientras, el hueco es un velo tenue (`bg-white/[0.04]`), no un bloque negro, y luego entra con un fundido de 500 ms y escala 1,03 → 1. Si viene de caché (menos de 200 ms, p. ej. al volver) sale de golpe. |
| `SeasonCard.jsx` | Tarjeta de una temporada (póster 2:3, título, año, episodios, notas de TMDb e IMDb y barra de vistos al pie) en la sección «Temporadas» de la ficha y en su vista lateral. En la vista lateral va en `compact`, más pequeña solo desde `sm`: en el móvil tiene las medidas de la tarjeta de la sección (póster de 128 px), así que los datos caben a la altura del póster y la barra de progreso queda alineada con su pie, con el mismo margen arriba y abajo. |
| `EpisodeCard.jsx` | Tarjeta de un episodio en la sección «Episodios» de `SeasonDetailsClient` (su única vista, una por fila) y en la de `EpisodeDetailsClient` (los tres siguientes episodios): cristal de `SeasonCard`, sin el número grande de fondo: fotograma horizontal del episodio (160 px en el teléfono; desde `sm`, el 46% del ancho de la tarjeta hasta 320 px; 16:9 como mínimo, `self-stretch` para que el margen sea el mismo por los cuatro lados si los datos son más altos), «Episodio N» con el mismo estilo que la fecha y la duración (`text-xs font-bold text-zinc-400`, sin mayúsculas: legible sobre fondos claros), título en una línea (dos desde `lg`), fecha y duración en una fila, notas, la sinopsis (`overview`: en la columna de texto, solo desde `sm`), y un icono visto / sin ver (20 px) en la esquina superior derecha, con el margen de la imagen (`right-3 top-3`; el texto deja `pr-6`) (`watched`: `true`/`false`, o `null` sin Trakt) en vez de la barra de progreso. |
| `MobileDetailsHero.jsx` | Cabecera móvil inmersiva (`useMobileDetailsHero`) de la ficha, temporadas, episodios, listas y colecciones: portada, botones y marcador; con el scroll despliega la barra de stats del marcador compacto y revela lo que va debajo (píldoras, pestañas, buscador). Un bloque revelado mientras la barra crece lleva una animación aditiva (`composite: 'add'`) sincronizada con la transición de la barra que anula su empuje: entra subiendo hasta su sitio sin pasarse ni volver a bajar. En la ficha (`fitCover` + `fitCoverPosterRatio: 1.5`) logo, botones y marcador compacto van siempre a la misma distancia del navbar inferior; en pantallas bajas el hueco en flujo (`--mobile-cover-flow-h`) se acorta pero la imagen (`--mobile-cover-h`) nunca baja de 2:3: no se recorta por arriba y sigue por detrás del logo y los botones. Con `fitCoverScoreboardOptional` (ficha, temporadas y episodios), si con el marcador la portada quedara más de un 10 % por debajo de 2:3, `scoreboardMode` pasa a `'hidden'` (el marcador lleva `revealProps` y aparece con el scroll) y la portada llega hasta los botones, a 20 px del navbar inferior. Las temporadas usan exactamente la configuración de la ficha (misma imagen 2:3 por detrás de los botones y misma transición del pie). Los episodios llevan además `fitCoverOverlap: false` (su póster lleva el título impreso al pie y nada puede ir encima): la imagen mide lo que el hueco. En móvil no hay rótulo «Temporada N» (el `h1` queda solo para lectores de pantalla). Listas y colecciones usan `fitCoverWhenShort`: portada a 150vw con el marcador centrado mientras quepa al menos el compacto a 20 px del navbar inferior; si no, el mismo ajuste de la ficha (marcador opcional; `fitCoverOverlap` solo con mosaico, el póster de colección se recorta por arriba). La decisión se mide con la portada a 150vw, así que no oscila. |
| `AwardCard.jsx` | Tarjeta de un premio en la sección «Premios» de la ficha (`AwardCard`, con su color de galardón de fondo, resultado, año, categoría y galardón) y fila de la vista lateral (`AwardRow`). La tarjeta no lleva rótulo con el nombre corto del galardón (OSCAR, GLOBOS, ACTORES, AFI…) ni la línea horizontal que lo acompañaba: el logo del tipo de premio ocupa ese hueco: cuadrado al 85 % del ancho de la tarjeta (el mismo margen a cada lado en cualquier tamaño), centrado entre la fila de resultado y año (desde `sm`) y el texto, que va en el flujo; si el texto ocupa mucho, el logo se encoge. La ficha de persona (`ActorDetails.jsx`) tiene su propia `AwardCard` con el mismo diseño. |
| `StreamingHoverOverlay.jsx` | Overlay al hover sobre un póster: "Ver en" + wordmark/color de la plataforma de streaming. |
| `SoundtrackModal.jsx` | Modal de banda sonora (Spotify) de un título. La reproducción automática y la valoración (👍, 👎, deshacer, ocultar) van plegadas tras el botón de tres puntos de la fila del volumen. |
| `ExternalLinksModal.jsx` | Modal de enlaces externos (JustWatch, Letterboxd, etc.), bloquea scroll vía `useBodyScrollLock`. En la ficha de título, en DetailModal (también en su vista teléfono) y en las fichas de temporada y episodio no lista IMDb, TMDb ni Trakt: ya enlazan desde sus puntuaciones del marcador (en temporada y episodio los quita `buildTvExternalLinks` de `lib/details/tvExternalLinks.js`). |
| `dashboard/DetailModal.jsx` | Ficha rápida de un título (centrada o en panel lateral). Su acabado es `LIQUID_GLASS_DETAIL_SURFACE` (`src/lib/ui/liquidGlass.js`): tinte oscuro y sombra exterior, sin borde ni brillo interior en el canto, así que el panel no tiene contorno marcado en ningún lado. Las vistas previa de los dashboards (`LIQUID_GLASS_DETAIL_TINT`) y el panel de temporada/episodio usan el mismo acabado. La entrada y el cierre comparten `dashboard/detailPanelMotion.js` con el panel de temporada/episodio y se animan con el `transform` completo, así que van en el compositor (WAAPI) y no se frenan mientras la ficha renderiza. El centrado es una hoja pegada al borde inferior: sube desde fuera de la pantalla (440 ms, sin rebote) y baja hasta salir (320 ms, sale rápido y frena) sin tocar la opacidad, para que el cristal de las tarjetas se vea durante todo el recorrido; el desenfoque del fondo entra y sale en el mismo tiempo. Al bajar o subir en la pila de previews con el modal abierto hace un fundido cruzado en el sitio. |
| `EpisodeRatingsModal.jsx` | Modal que envuelve `EpisodeRatingsGrid` para ver valoraciones por temporada. |
| `AddToListModal.jsx` | Modal para añadir un título a una o varias listas propias. |
| `TraktCommentModal.jsx` | Modal para crear/editar/borrar un comentario de Trakt. |
| `VideoModal.jsx` | Modal de reproducción de tráiler (YouTube IFrame API / Vimeo). |

## `lists/`

Componentes de listas propias, colecciones TMDb y listas públicas de Trakt.

| Componente | Propósito |
|---|---|
| `UnifiedListDetailsLayout.jsx` | Layout común (cabecera, metadatos, acciones) compartido por detalle de lista propia, colección y lista de Trakt. |
| `ListDetailsTools.jsx` | Barra de herramientas de una lista (orden, filtro, vista grid/lista) — `FilterableListItems`. Buscador, botón de filtros, desplegables, selector de vista y modo borrar llevan el cristal líquido de la sinopsis y el marcador (`LIQUID_GLASS_SURFACE` + `LiquidGlassOpticalLayers`); el input va transparente dentro de su cristal, que marca el foco. Tipo, orden, agrupación y vista se guardan en localStorage (`showverse:<prefsKey>Details:*`, leídos tras montar para no romper la hidratación), como en las páginas de usuario: `prefsKey` «list» para listas propias, de la comunidad y de Trakt, «collection» para colecciones (solo películas). La búsqueda no se guarda. |
| `ListPosterCard.jsx` | Tarjeta de póster usada en grids de listas (con estado de carga/error de imagen). |
| `CollectionDetailsClient.jsx` | Cliente de `/lists/collection/[collectionId]` (saga/colección TMDb). |
| `TraktListDetailsClient.jsx` | Cliente de `/lists/trakt/[username]/[listId]` (lista pública de Trakt, paginada). |

## `trakt/`

Integración de UI con Trakt (auth, estado de visto, modales de historial).

| Componente | Propósito |
|---|---|
| `TraktConnectButton.jsx` | Botón de conexión vía Device Flow OAuth (`useTraktAuth`). |
| `TraktConnectModal.jsx` | Modal compacto que muestra el código de activación y espera autorización. |
| `TraktActions.jsx` | Acciones rápidas sobre un título (marcar visto, puntuar) usando el token válido de `useTraktAuth`. |
| `TraktWatchedControl.jsx` | Control visual (ojo abierto/cerrado + badge de plays) para marcar visto/no visto. |
| `TraktWatchedModal.jsx` | Modal de gestión de reproducciones (fechas, notas) de un título. Con `progressTarget` muestra también su entrada de «Continuar viendo» para marcarla como vista o quitarla (`onProgressChange`). Eliminar un visionado (papelera) pide confirmación con `ListToggleConfirmModal` (tipo `play`), el mismo modal que quitar un título de Favoritos. |
| `TraktEpisodesWatchedModal.jsx` | Modal de progreso de episodios vistos de una serie/temporada. En móvil, el botón junto al buscador abre `MobileOptionsSheet` (vista Global/rewatch, lista o tabla, todos o no vistos y las acciones Historial, Añadir / Rewatch y Marcar serie) por encima del modal. En un rewatch, al marcar un episodio como visto se abre un diálogo propio de ese episodio (Hoy / Otra fecha con el calendario; no admite fechas anteriores al inicio del rewatch). |
| `TraktContinueWatching.jsx` | Variante ligera de "continuar viendo" basada solo en Trakt. |

## `ui/`

Piezas de interfaz compartidas por varias páginas.

| Componente | Propósito |
|---|---|
| `MobileOptionsSheet.jsx` | Hoja inferior de **filtros y vista** de las páginas en móvil: el botón de filtros de la barra la abre. Mismo cristal que los modales (`LIQUID_GLASS_PANEL`), sube desde abajo solo con `transform` y se cierra con la X, el velo, Escape o arrastrando la cabecera. También la abren los filtros de las vistas laterales («Portadas y fondos», Películas, Series y Filmografía de una persona; en Filmografía, el rol y el tipo de título) con `placement="sectionSheet"`: desde 640px sube dentro del ancho del panel lateral. Dentro no hay desplegables: cada grupo (`SheetOptionGroup`) enseña sus opciones como píldoras (`SheetOption`), en filas, a mitades o en una fila deslizable (`layout="scroll"`, p. ej. años; con ratón se mueve con la rueda o arrastrando); las acciones de la página van al final con `SheetAction`. Los desplegables de cada página (`InlineDropdown`/`DropdownItem`) consultan `useInOptionsSheet()` y, dentro de la hoja, se pintan como grupo y píldoras. Orden: filtros → orden → agrupar → vista → imagen → acciones. Encima de un modal pintado dentro de la página (episodios vistos de Trakt) se sube la capa con `layerClassName` y `pausePageBelow={false}` evita marcar `data-sv-sheet-open`, que le quitaría el cristal. |
| `MobileFiltersPanel.jsx` | Desplegable en el sitio (altura animada con `grid-template-rows`). Solo en la vista teléfono del drawer y los filtros de Actor en escritorio. |
| `ImageModeSelector.jsx` | Modo de imagen de las tarjetas (póster/backdrop): `ImageModeSegmented` en escritorio y `ImageModeSheetGroup` (grupo «Imagen») en la hoja móvil. |

## Relacionado
- [[Home]]
- [[Frontend]]
- [[app-router-pages]]
- [[Frontend-Lib]]
- [[dashboards-implementation|Implementación de dashboards]]
- [[LIQUID_BUTTONS]]
- [[README_MODULOS_FUNCIONALES]]
