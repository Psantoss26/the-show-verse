---
tags: [area/features, area/frontend, type/referencia]
aliases: [Vista previa móvil, Pulsación larga, Peek]
---
# Vista previa al mantener pulsado (móvil)

En el móvil, mantener el dedo sobre la tarjeta de una película, una serie o un episodio abre su vista previa sin salir de la página. Funciona en todas las páginas y en los dashboards (Inicio, Películas, Series y sus secciones).

## Qué ve el usuario

- Al mantener el dedo (~0,4 s) la tarjeta se hunde un poco y, al cumplirse el tiempo, la vista previa crece desde ella hasta el centro de la pantalla con una transición. En Android, una vibración corta lo marca.
- La vista previa es una tarjeta flotante que no ocupa toda la pantalla: deja 6 px a cada lado (como mucho 440 px de ancho) y no llega arriba ni abajo. La página se queda detrás, difuminada.
- Solo enseña tres cosas:
  1. la portada del título con su logo (sin logo si la portada ya trae el título impreso);
  2. la fila de botones de la ficha (tráiler, banda sonora, visto, puntuar, favorito, pendiente, listas…), con sus mismos modales. Ocupan casi todo el ancho de la tarjeta (4 px de margen), con 4 px entre ellos como en la ficha móvil, así que salen al menos igual de grandes que allí;
  3. el marcador de puntuaciones (TMDb, Trakt, IMDb y estadísticas), reducido al 70 % para que no pese más que la portada.
- Tocar la portada lleva a la ficha completa. Tocar fuera, o la tecla Escape, cierra la vista previa y la tarjeta vuelve a su sitio.
- Al soltar el dedo no se abre la ficha ni sale el menú del sistema para enlaces o imágenes.
- Si el dedo se mueve más de 10 px (desplazar la página o un carrusel), no se abre nada.
- Personas, temporadas, listas y colecciones no tienen vista previa.
- Solo en pantallas de móvil táctiles (menos de 768 px de ancho y puntero táctil). En ordenador y tablet todo sigue igual.

## Código

| Pieza | Qué hace |
|---|---|
| `src/components/preview/MobileTitlePeek.jsx` | Se monta una vez en `src/app/layout.jsx`. Escucha los toques en el documento, detecta la pulsación larga, anula el clic al soltar y pinta la vista previa. Descarga la ficha rápida solo cuando empieza una pulsación sobre un título. |
| `src/lib/navigation/titlePeek.mjs` | Lógica pura: qué título corresponde a un enlace `/details/...` o a un atributo `data-sv-peek`, y los márgenes del gesto. Con tests (`titlePeek.test.mjs`). |
| `src/components/dashboard/DetailModal.jsx` | La ficha rápida con la prop `peek`: reutiliza su portada, su fila de botones y su marcador en la tarjeta flotante (`DetailPeekLayout`). |

Las tarjetas que son un enlace a `/details/movie/:id`, `/details/tv/:id` o `/details/tv/:id/season/:s/episode/:e` ya funcionan sin tocarlas. Las tarjetas de los dashboards que abren la ficha con un botón llevan `{...titlePeekAttrs(item)}`. Un bloque con `data-sv-no-peek` queda excluido.

## Relacionado
- [[Features]]
- [[paginas-de-usuario]]
- [[app-router-pages]]
