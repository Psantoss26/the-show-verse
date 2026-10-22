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
| `Navbar.jsx` | Barra de navegación global (desktop + móvil), avatar de usuario (`UserAvatar`), buscador e i18n (`useTranslation`). |
| `NoPageScroll.jsx` | Utilidad de layout: bloquea el scroll de `<html>`/`<body>` para páginas tipo pantalla completa. |
| `ScrollRestoration.jsx` | Restaura la posición de scroll al navegar (guardado en `sessionStorage`/similar), tolerante a contenido asíncrono que crece tras el primer frame. |
| `PwaManager.jsx` | Gestiona instalación de PWA y limpieza de cachés `showverse-*` del Service Worker. |
| `OptimizedImage.jsx` | Wrapper ligero sobre `<img>` (sin `next/image`) usado en casi toda la app, alineado con `images.unoptimized` de `next.config.ts`. |
| `MainDashboardClient.jsx` | Cliente de la home (`/`): filas de tendencias/populares/recomendados, hero destacado, carruseles. |
| `FeaturedHero.jsx` | Hero principal del dashboard (backdrop grande, trailer en hover/autoplay, CTAs favorito/watchlist). |
| `ContinueWatchingSection.jsx` | Carrusel "Continuar viendo" (progreso Trakt); patrón reutilizado por `DashboardCalendarSection`. |
| `DashboardCalendarSection.jsx` | Sección "Calendario" del home: próximos episodios (BBDD propia + TMDb) reutilizando el carrusel de Continuar viendo. |
| `CarruselIndividual.jsx` | Carrusel horizontal simple (Swiper) para una lista de títulos. |
| `DiscoverClient.jsx` | Cliente de `/discover`: filtros (género, año, plataforma) sobre discover de TMDb. |
| `WatchNextAssistant.jsx` | Asistente "qué ver ahora" (llama a `api/ai/watch-next`). |
| `DetailsSectionMenu.jsx` | Menú de navegación por anclas dentro de una ficha de detalle (temporadas, reparto, etc.). |
| `DetailsClient.jsx` | Componente principal de ficha de película/serie: puntuaciones (TMDb/Trakt/IMDb/RT/Metacritic), listas, episodios/temporadas, colecciones, comentarios, reparto, recomendaciones, Trakt y Plex. El componente más grande de la app. |
| `DetailsPageLoader.jsx` | Envoltorio que carga datos diferidos (créditos, recomendaciones, reviews, watch providers) y monta `DetailsClient`. |
| `SeasonDetailsClient.jsx` | Cliente de `/details/tv/[id]/season/[season]`. |
| `EpisodeDetailsClient.jsx` | Cliente de la ficha de episodio. |
| `EpisodeRatingsGrid.jsx` | Grid de valoraciones de episodios de una temporada (usado también dentro de `EpisodeRatingsModal`). |
| `ActorDetails.jsx` | Ficha de actor/actriz (`/details/person/[id]`). |
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

## `dashboard/`

Piezas específicas de los dashboards (Inicio/Películas/Series/Secciones).

| Componente | Propósito |
|---|---|
| `useEngineRows.js` | Hook compartido que pide al backend las filas genéricas + recomendaciones (dedupe/rotación ya resuelta en servidor) para los tres dashboards; cachea en memoria y `localStorage` (`showverse:dashboard:engine:v3:*`). |
| `DashboardSpotlightPreview.jsx` | Preview "spotlight" de un título dentro del dashboard (acciones rápidas: favorito, watchlist, play). |
| `HeroSoundtrackPlayer.jsx` | Reproductor de banda sonora (Spotify) integrado en el hero del dashboard. |
| `DashboardRankNumber.jsx` | Número de ranking estilizado (estética "cristal") para listas tipo Top 10, con paletas por tono (`movies`, `series`, ...). |

Ver también [[dashboards-implementation|Implementación de dashboards]].

## `details/`

Subcomponentes y modales usados por `DetailsClient`/`SeasonDetailsClient`/`EpisodeDetailsClient`.

| Componente | Propósito |
|---|---|
| `DetailAtoms.jsx` | Átomos visuales reutilizados en la ficha (`VisualMetaCard`, etc.). |
| `DetailHeaderBits.jsx` | Piezas del cabecero de la ficha (badges compactos, botón compartir...). |
| `AnimatedSection.jsx` | Wrapper de `framer-motion` para animar secciones al entrar en viewport. |
| `AnimatedPosterFrame.jsx` | Marco de póster con transición/estado de error de imagen. |
| `PosterStack.jsx` | Pila de pósters superpuestos (colecciones). |
| `LoadingSkeleton.jsx` | Esqueletos de carga (`PosterSkeleton`, etc.) para estados pendientes. |
| `ScoreboardBar.jsx` | Barra de puntuaciones agregadas (TMDb/Trakt/IMDb/RT/Metacritic) + acciones (visto, lista, favorito). |
| `StreamingHoverOverlay.jsx` | Overlay al hover sobre un póster: "Ver en" + wordmark/color de la plataforma de streaming. |
| `SoundtrackModal.jsx` | Modal de banda sonora (Spotify) de un título. |
| `ExternalLinksModal.jsx` | Modal de enlaces externos (JustWatch, Letterboxd, etc.), bloquea scroll vía `useBodyScrollLock`. |
| `EpisodeRatingsModal.jsx` | Modal que envuelve `EpisodeRatingsGrid` para ver valoraciones por temporada. |
| `AddToListModal.jsx` | Modal para añadir un título a una o varias listas propias. |
| `TraktCommentModal.jsx` | Modal para crear/editar/borrar un comentario de Trakt. |
| `VideoModal.jsx` | Modal de reproducción de tráiler (YouTube IFrame API / Vimeo). |

## `lists/`

Componentes de listas propias, colecciones TMDb y listas públicas de Trakt.

| Componente | Propósito |
|---|---|
| `UnifiedListDetailsLayout.jsx` | Layout común (cabecera, metadatos, acciones) compartido por detalle de lista propia, colección y lista de Trakt. |
| `ListDetailsTools.jsx` | Barra de herramientas de una lista (orden, filtro, vista grid/lista) — `FilterableListItems`. |
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
| `TraktWatchedModal.jsx` | Modal de gestión de reproducciones (fechas, notas) de un título. |
| `TraktEpisodesWatchedModal.jsx` | Modal de progreso de episodios vistos de una serie/temporada. |
| `TraktContinueWatching.jsx` | Variante ligera de "continuar viendo" basada solo en Trakt. |

## Relacionado
- [[Home]]
- [[Frontend]]
- [[app-router-pages]]
- [[Frontend-Lib]]
- [[dashboards-implementation|Implementación de dashboards]]
- [[LIQUID_BUTTONS]]
- [[README_MODULOS_FUNCIONALES]]
