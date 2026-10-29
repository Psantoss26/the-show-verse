---
tags: [area/features, area/frontend, type/referencia]
aliases: [Páginas de usuario, Continuar viendo, Recomendaciones]
---
# Páginas de usuario y ajustes

Funcionalidades de las páginas personales añadidas o rehechas desde julio de 2026.

## Continuar viendo, En progreso y Completadas

Las tres comparten navegación (`WatchingSectionNav` en En progreso y Completadas, `HistorySectionNav` en Historial y Continuar viendo; también la usa `/lists` con su `ListsSourceSelector`). En escritorio cada sección muestra icono y título, esté activa o no; en el móvil son solo iconos. Para dejarles sitio, la barra de filtros se compacta midiendo lo que piden sus piezas (`usePageToolbarSearchFit`, también en Favoritos, Pendientes y el dashboard): prueba de menos a más hasta que la fila cabe y lo marca en `data-fit` (`no-labels` quita los rótulos, `icons` deja los desplegables en icono y flecha, `bare` quita además los títulos de las secciones). Sin foco, el buscador cuenta como cuadrado; con foco, a su ancho de escritura, así que al abrirlo los desplegables se compactan en vez de montarse unos sobre otros. Los desplegables nunca se estrechan por debajo de su botón y, con el buscador en cuadrado, se estiran para que la fila ocupe todo el ancho. Al abrir o cerrar el buscador el cambio se anima (260 ms, WAAPI: cada pieza va de su ancho anterior al nuevo, el relleno del campo también, y los textos que reaparecen entran con un fundido); al redimensionar la ventana es inmediato y con «reducir movimiento» no se anima.

| Ruta | Qué muestra |
|---|---|
| `/continue-watching` | Reproducciones en curso: las automáticas (extensión y app Android) y las añadidas a mano. |
| `/in-progress` | Series empezadas, con avance por temporada y episodio. |
| `/completed` | Series terminadas. Antes era una pestaña de `/in-progress`; reutiliza `InProgressClient` en modo `completed`. |

**Progreso manual:** se puede añadir una entrada eligiendo plataforma (Netflix, Prime Video, Max, Disney+, Apple TV, Movistar, Crunchyroll o Plex), porcentaje (como mucho 89 %) y, en series, el episodio. A partir del 90 % el progreso automático ya lo da por visto y lo saca de la fila. Backend: `/v1/progress`.

**Marcar como finalizado:** la barra de `/continue-watching` tiene dos modos excluyentes junto a «+»: el ✓ («Marcar títulos como finalizados») y la papelera («Quitar títulos»); en móvil van en la primera fila del desplegable, en el orden «+», ✓, papelera (✓ y papelera juntos en un segmentado, para que el bloque mida lo mismo que los de las otras filas). En el modo ✓ cada tarjeta lleva un botón verde ✓ en el sitio de la papelera. Tras confirmar, la entrada sale de la fila y se apunta en el historial con el episodio que tuviera, igual que el completado automático (`POST /v1/progress/{id}/complete`).

**Desde la ficha:** si la película o el episodio está en curso, el modal de historial de visionado (`TraktWatchedModal`, en la ficha de película, la de episodio y la vista previa) lo muestra como primera entrada de la actividad: «En curso · N %», con plataforma, tiempo restante, la última vez que se vio y una etiqueta «En curso» en la cabecera. Desde ahí se puede **marcar como visto** (✓, mismo `complete`: sale de la fila y entra en el historial, que se actualiza en el propio modal) o **quitar** (papelera, `DELETE /v1/progress/{id}`), sin ir a `/continue-watching`. La ficha recibe el cambio (`onProgressChange`) para quitar su indicador de progreso y la entrada se poda de la caché de la página.

## Historial (`/history`)

La lista se carga de 200 en 200 al hacer scroll, pero la cabecera (Vistos, Títulos, Películas, Episodios) muestra los totales de **todo** el historial: `GET /v1/history` los devuelve en `totals` con la página 1, `/api/trakt/history` los pasa tal cual y la página los guarda en `localStorage` (`showverse:history:totals:v1`) para pintarlos al volver. Con el filtro Películas o Series se usan los totales de ese tipo. Con una búsqueda o un día elegido, o cuando ya está todo cargado, se cuenta la lista. Al borrar entradas se restan al momento; la revalidación de la página 1 los corrige. Sin backend (respaldo de Trakt) no hay totales y se cuenta lo cargado.

**Desplegable móvil:** la primera fila lleva Tipo, Agrupar (solo icono y valor) y la papelera del modo borrar; la segunda, Ordenar, los tres modos de vista y, en las vistas de tarjetas y compacta, el botón que alterna póster y backdrop.

## Recomendaciones (deslizar)

`/recommendations` es una baraja de títulos:

- ← izquierda: **descartar**. Se guarda en el backend y vale en todos los dispositivos.
- → derecha: añadir a **pendientes**.
- ↑ arriba: añadir a **favoritos**.
- Botón: añadir a una **lista**.

El backend entrega la baraja ya filtrada (sin descartados, pendientes ni favoritos), así que el cliente solo la consume en orden. Umbrales del gesto en `src/lib/recommendations/swipeDecision.js`. Backend: `/v1/recommendations`.

## Secciones del dashboard (`/dashboard/[section]`)

Páginas «Ver todos» de *Tendencias*, *Populares*, *Recomendados* y *Más esperadas* (`src/lib/dashboard/sectionItems.js`). La lista llega ya en el RSC, sin esqueletos, y es la misma (mismo orden) que la fila de Inicio. Tienen botón de recargar junto al de volver. Backend: `/v1/dashboard/sections/{key}`. Ver [[dashboards-implementation]].

## Entrada de Favoritos y Pendientes

Las dos páginas montan sus tarjetas por tandas para que entrar sea barato. La primera tanda cubre toda la pantalla: `estimateUserPageEntranceCount` (`lib/ui/entranceFill.js`) calcula, con las columnas y la proporción de la vista activa (lista, cuadrícula o compacta; póster o backdrop), las tarjetas que caben más dos filas de margen. Ese mismo número decide cuántas se animan (`animateWithin`), así que todo lo visible entra animado a la vez, nunca menos de 24. El resto se añade en tandas de 36 cuando acaba la entrada, por debajo de la pantalla y sin animar. Al volver atrás se pinta todo de golpe y sin animación, como antes.

## Portada de las tarjetas

Las tarjetas con póster de Favoritos, Pendientes, En progreso, Historial, Perfil y sus secciones (`PosterTile`), Continuar viendo, Películas, Series, el dashboard y sus secciones, el detalle de listas y colecciones (`ListPosterCard` y, en la vista de lista, `TitleRow`, que también usan las vistas laterales de la ficha) usan la portada elegida en la ficha (kind `poster` de `uiSettings.artworkOverrides`). En el ordenador es la de «Portadas y fondos» → «Portada», compartida con la ficha. En el móvil, «Portada» elige la del hero (`mobilePoster`, sin idioma o, desde su filtro de idioma, con idioma) y solo vale para la ficha; la pestaña «Tarjetas» guarda la portada `poster`; también en la vista lateral de la vista teléfono del panel (`PhoneDetailsSections`, con su propia selección `selectedCardPoster`). En esa vista, «Restaurar valores por defecto» avisa al modal con `kind: "reset"` y `useDetailModalData` vuelve a la portada y el logo automáticos que guardó al abrir (`autoHeroPosterPath`, `autoLogoPath`: la misma política sin elecciones ni votos propios, calculada aparte para no retrasar la portada). Sin elección propia, la tarjeta usa la imagen MÁS VOTADA por todos (cada elección es un voto, como en la ficha) y, sin votos, su portada automática. `getCardArtwork` (`lib/artworkApi.js`) junta las dos: la propia desde la instantánea y la más votada desde una caché por lotes (`getCommunityCardArtwork`: `/api/community/artwork?type=…&ids=…`, hasta 100 títulos por petición, guardada en localStorage 7 días y revalidada pasado 1 minuto), que avisa por la misma suscripción al llegar; la más votada que leen la ficha (SSR), DetailModal o el destacado de un título también pasa a esa caché (`rememberCommunityCardArtwork`), así que el voto de otro usuario que ya enseña la ficha llega al momento a sus tarjetas en vez de seguir con la copia «sin votos» anterior; retirar o cambiar el voto propio la actualiza al momento (`retractOwnArtworkVotes`, `forgetCommunityArtwork`). Las vistas previas del dashboard, las filas de backdrops y las tarjetas del detalle de listas y colecciones (`ListPosterCard`, `TitleRow`) usan `useCardArtworkState` (`{ path, pending }`, de `getCardArtworkState`): mientras el lote del título está en camino (como mucho 1 s) no pintan el backdrop automático, que antes se veía un instante antes del votado. La vista previa DESTACADA (spotlight: Más esperadas en el inicio, Tendencias en Películas y Series), que lleva el logo encima, usa en su lugar el backdrop sin idioma de «Vista previa» (kind `backdrop`, el de la cabecera de DetailModal) elegido o más votado y el logo elegido o más votado (`useSpotlightLogo`), con la misma espera; sin ninguno, el backdrop sin idioma y el logo automáticos. Vale para portadas (`poster`), tarjetas backdrop (`cardBackdrop`) y el logo del destacado, y también en las vistas de /lists (cuadrícula, filas y lista de Listas y Colecciones: `listItemPosterPath` y `ListItemCard`), el calendario, Estadísticas, Social, Hoy, las filas de Recomendaciones y Colección de la ficha y de DetailModal (`CardPosterImage`), los «Similares» y vistas previas de los dashboards, y la baraja de Recomendaciones (portada móvil, fondo y logo). La leen `getOwnCardPoster` y el hook `useOwnCardPoster` (`lib/hooks/useOwnCardPoster.js`), desde la copia de preferencias que guarda AuthContext: se parsea una vez y queda en memoria hasta que AuthContext la reescribe (`notifyPersistedArtworkOverridesChanged`) u otra pestaña la cambia. El aviso a las tarjetas va en una microtarea: AuthContext reescribe la copia dentro del actualizador de `setPreferences`, durante el render de `AuthProvider`, y avisar ahí actualizaba otros componentes en pleno render. Sin red ni lotes nuevos: con portada propia, la tarjeta no pide imágenes a TMDb ni espera a la automática en inglés; en las listas de la comunidad, que ocultan los títulos sin póster en inglés, un título con portada propia no se oculta. Al cambiarla en la ficha solo vuelven a renderizar las tarjetas de ese título, también en las páginas vivas en segundo plano. Las secciones del dashboard, que llegan del servidor, la aplican al hidratar.

En el detalle de listas y colecciones (`FilterableListItems` de `ListDetailsTools`), cada tarjeta va en `ListCardEntrance`: la misma entrada que Favoritos (`useCardEntrance`, fundido y escala en cascada, una vez al montar), solo para las que caben en pantalla (`estimateVisibleCards` con las columnas de cada vista) y nunca al volver atrás.

Las tarjetas en modo **backdrop** hacen lo mismo con el kind `cardBackdrop`, que se elige en la pestaña «Backdrop» de «Portadas y fondos» (escritorio, vista lateral móvil y vista teléfono del panel; backdrops con idioma en español e inglés y, si no hay, los de otros idiomas o todos: `buildArtworkSheetTabs`). Es también la portada de la ficha de escritorio en modo backdrop (`posterBackdropFallback`: elegido propio, luego el más votado, luego la escalera de idiomas). La leen `useOwnCardBackdrop` y `useOwnCardImage(type, id, mode)` (`lib/hooks/useOwnCardPoster.js`) en `SmartPoster` de Favoritos y Pendientes, `SmartBackdrop` de En progreso/Completadas, `Backdrop` de Historial, `SmartImage` de Continuar viendo, `PosterImage` de las secciones del dashboard, `useItemBackdrop` de `DashboardBackdropRow` (filas backdrop del inicio, Películas y Series, también su vista previa al pasar el ratón), el Top 10 móvil de Películas y Series y `ActivityBackdropImage` (Actividad del Perfil y Social en «Lista con backdrop»). El elegido no se guarda en las cachés del backdrop automático, así que al quitarlo vuelve el automático.

## Menú de filtros en el móvil

En el móvil, el botón de filtros de la barra de Favoritos, Pendientes, Historial, Biblioteca, Calendario, Continuar viendo, En progreso, Listas, Social, las secciones del dashboard, el detalle de lista, las secciones del Perfil (también la vista neuronal), y las películas y series de una persona abre una **hoja inferior** (`MobileOptionsSheet`) en vez de un desplegable. Lleva todos los filtros, el orden, la agrupación, los modos de vista y las acciones de la página, en ese orden y con todas las opciones a la vista como píldoras. Elegir una opción no cierra la hoja (se ve el resultado detrás y se pueden combinar filtros); las acciones que cambian de modo o abren otra cosa (Añadir título, Borrar registros, Crear lista, Volver a hoy…) sí la cierran. En escritorio la barra sigue con sus desplegables. «Portadas y fondos» de la ficha no tiene botones en la fila del título en el móvil ni en la vista teléfono del panel: sus pestañas, filtros y Restaurar están en su vista lateral, y la fila enseña la portada sin idioma. Las vistas laterales de la ficha («Portadas y fondos») y de una persona (Películas, Series y Filmografía, donde el rol y el tipo de título dejan de ser pestañas) abren sus filtros en la misma hoja, en cualquier ancho: desde 640px sube dentro del panel lateral.

La barra se sigue fijando bajo la barra superior al hacer scroll (`isPinned` de `useStickyToolbarState`).

## Fichas superpuestas (rutas interceptoras)

Al abrir una ficha (`/details/...`) desde dentro de la app, Next la pinta en el slot `src/app/@overlay/(.)details/...` y **deja montada la página de origen**, que `OverlayRouteHost` oculta con `<Activity mode="hidden">`. Al volver atrás reaparece igual que estaba, sin volver a cargar ni animar. Recargar la URL o entrar por un enlace externo sirve la ficha completa de siempre.

### Cómo se abre una ficha (ajustes)

En *Ajustes* (`DetailOpenSettings`) se elige:

- **Al seleccionar un título:** ficha rápida (panel) o ficha completa.
- **Posición:** centrada o lateral; en lateral, superpuesta o acoplada.
- **Contenido del panel:** la ficha o la **vista teléfono**, que incrusta la ficha móvil servida por `/embed/details/[...segments]` (con el estado de favorito/pendiente/nota adelantado en la URL, `src/lib/navigation/embeddedDetails.js`).
- **Tamaño del panel lateral:** solo la ficha ancha se redimensiona arrastrando su borde izquierdo (el ancho se guarda en `showverse:detailModalWidth`). La vista teléfono no tiene tirador: va pegada a los bordes superior e inferior y su ancho sale de la proporción de teléfono (9:19,5) sobre el alto de la ventana, acotado por `clampMobileDetailsWidth` (`src/lib/ui/detailModalSizing.js`). Igual en el panel de temporada y episodio (`SubrouteDetailsPanel`).

**Desde un modal.** Una ficha rápida abierta desde dentro de un modal de la página (los episodios agrupados del Historial, por ejemplo) se superpone a él: `usePreviewOpen` y la captura de enlaces de temporada/episodio de `DetailModalProvider` detectan el diálogo (`isInsidePageModal` de `src/lib/ui/pageModal.js`, `[aria-modal="true"]`) y el panel abre con `overModal`, que lo sube de `z-[9999]` a `z-[10001]` junto con su capa de modales hijos. En el móvil, la vista previa de pulsación larga (`MobileTitlePeek`) hace lo mismo con su capa. Al cerrarla (X, Esc o tocando fuera) el modal sigue abierto: Esc cierra primero lo de encima.

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
