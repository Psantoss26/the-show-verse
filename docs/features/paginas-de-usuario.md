---
tags: [area/features, area/frontend, type/referencia]
aliases: [Páginas de usuario, Continuar viendo, Recomendaciones]
---
# Páginas de usuario y ajustes

Funcionalidades de las páginas personales añadidas o rehechas desde julio de 2026.

## Continuar viendo, En progreso y Completadas

Las tres comparten navegación (`WatchingSectionNav`):

| Ruta | Qué muestra |
|---|---|
| `/continue-watching` | Reproducciones en curso: las automáticas (extensión y app Android) y las añadidas a mano. |
| `/in-progress` | Series empezadas, con avance por temporada y episodio. |
| `/completed` | Series terminadas. Antes era una pestaña de `/in-progress`; reutiliza `InProgressClient` en modo `completed`. |

**Progreso manual:** se puede añadir una entrada eligiendo plataforma (Netflix, Prime Video, Max, Disney+, Apple TV, Movistar, Crunchyroll o Plex), porcentaje (como mucho 89 %) y, en series, el episodio. A partir del 90 % el progreso automático ya lo da por visto y lo saca de la fila. Backend: `/v1/progress`.

**Marcar como finalizado:** la barra de `/continue-watching` tiene dos modos excluyentes junto a «+»: el ✓ («Marcar títulos como finalizados») y la papelera («Quitar títulos»); en móvil van en la primera fila del desplegable, en el orden «+», ✓, papelera (✓ y papelera juntos en un segmentado, para que el bloque mida lo mismo que los de las otras filas). En el modo ✓ cada tarjeta lleva un botón verde ✓ en el sitio de la papelera. Tras confirmar, la entrada sale de la fila y se apunta en el historial con el episodio que tuviera, igual que el completado automático (`POST /v1/progress/{id}/complete`).

## Recomendaciones (deslizar)

`/recommendations` es una baraja de títulos:

- ← izquierda: **descartar**. Se guarda en el backend y vale en todos los dispositivos.
- → derecha: añadir a **pendientes**.
- ↑ arriba: añadir a **favoritos**.
- Botón: añadir a una **lista**.

El backend entrega la baraja ya filtrada (sin descartados, pendientes ni favoritos), así que el cliente solo la consume en orden. Umbrales del gesto en `src/lib/recommendations/swipeDecision.js`. Backend: `/v1/recommendations`.

## Secciones del dashboard (`/dashboard/[section]`)

Páginas «Ver todos» de *Tendencias*, *Populares*, *Recomendados* y *Más esperadas* (`src/lib/dashboard/sectionItems.js`). La lista llega ya en el RSC, sin esqueletos, y es la misma (mismo orden) que la fila de Inicio. Tienen botón de recargar junto al de volver. Backend: `/v1/dashboard/sections/{key}`. Ver [[dashboards-implementation]].

## Fichas superpuestas (rutas interceptoras)

Al abrir una ficha (`/details/...`) desde dentro de la app, Next la pinta en el slot `src/app/@overlay/(.)details/...` y **deja montada la página de origen**, que `OverlayRouteHost` oculta con `<Activity mode="hidden">`. Al volver atrás reaparece igual que estaba, sin volver a cargar ni animar. Recargar la URL o entrar por un enlace externo sirve la ficha completa de siempre.

### Cómo se abre una ficha (ajustes)

En *Ajustes* (`DetailOpenSettings`) se elige:

- **Al seleccionar un título:** ficha rápida (panel) o ficha completa.
- **Posición:** centrada o lateral; en lateral, superpuesta o acoplada.
- **Contenido del panel:** la ficha o la **vista teléfono**, que incrusta la ficha móvil servida por `/embed/details/[...segments]` (con el estado de favorito/pendiente/nota adelantado en la URL, `src/lib/navigation/embeddedDetails.js`).

### Anterior y siguiente en la ficha

Una ficha abierta desde una página personal (Favoritas, Pendientes, Historial, En progreso, Listas, Social o el Perfil) recorre los títulos de **esa página en el orden en que se ven** (filtros, orden y grupos): con las flechas de escritorio (`DetailsSequenceNav`) y deslizando en móvil (`MobileUserPageSwipeNavigation`). Al pulsar una tarjeta se guarda la secuencia en `sessionStorage` (`src/lib/navigation/userDetailsSequence.js`), así que el mismo título tiene vecinos distintos según la página de la que se venga. La transición (`src/lib/navigation/detailsSequenceTransition.js`) copia la ficha **visible**: las fichas por las que ya se ha pasado siguen montadas y ocultas en la pila de pantallas (`OverlayRouteHost`) antes en el documento, y tomar la primera dejaba la pantalla en negro hasta que llegaba la nueva.

- La secuencia se toma solo de la **pantalla activa**: las pantallas anteriores siguen montadas y ocultas (`OverlayRouteHost`) y sus enlaces no cuentan. Tampoco los del panel de la ficha rápida.
- Las páginas que pintan sus tarjetas por tandas (Favoritas, Pendientes) publican su orden completo con `useUserDetailsSequenceSource`; las listas y colecciones lo pasan directamente con `saveUserDetailsSequence`.
- **FeaturedHero de los dashboards** (Inicio, Películas y Series): abrir un título del hero guarda el orden del hero (`openDetailModal(item, { sequence })` en `DetailModalProvider`), así que su ficha recorre los títulos destacados con las mismas flechas y el mismo gesto. En escritorio, con la vista previa, las flechas aparecen al pasar a la ficha completa. En los dashboards, abrir un título desde cualquier otra fila borra la secuencia (`clearUserDetailsSequence`) para no heredar los vecinos del hero.

## Barra inferior móvil

Hasta seis accesos configurables entre Inicio, Películas, Series, Descubrir, Biblioteca, Social, Listas, En progreso, Historial, Favoritas, Pendientes, Calendario, Recap y Recomendaciones (`src/lib/ui/mobileBottomNav.js`).

## Importación y exportación (`/profile/settings`)

| Panel | Qué hace |
|---|---|
| Trakt / TMDb | Importación de historial, puntuaciones, favoritos y pendientes. |
| `ImdbImportPanel` | Importa la exportación de IMDb: puntuaciones (películas, series y episodios), vistos, watchlist y listas. `/api/imdb/import` resuelve los ids de IMDb a TMDb. |
| `LetterboxdImportPanel` | Importa la exportación oficial de Letterboxd, incluidas las reseñas. |
| `LetterboxdConnectionCard` / `LetterboxdAutoSync` | Sincronización continua por el RSS público del perfil: visionados del diario, notas, «me gusta» → favoritos y reseñas. Corre cada pocas horas y con «Sincronizar ahora». Nunca sobrescribe lo que ya tienes. |
| `DataExportPanel` | Exporta favoritos, pendientes y puntuaciones a CSV, JSON o el formato del importador de Letterboxd. En Android la descarga la hace el nativo. |
| `AndroidSyncPanel` | Emparejamiento de la app Android. |

## Cuenta

- Cambio de email con confirmación por enlace (`/auth/verify-email`) y cambio de contraseña: `/v1/auth/account/*`.
- Confirmación antes de quitar un favorito o un pendiente desde la ficha.

## Relacionado
- [[Features]]
- [[app-router-pages]]
- [[lib-offline]] (modo sin conexión / PWA)
