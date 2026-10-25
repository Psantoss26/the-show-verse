---
tags: [area/features, area/frontend, type/referencia]
aliases: [Vista previa móvil, Pulsación larga, Peek]
---
# Vista previa al mantener pulsado (móvil)

En el móvil, mantener el dedo sobre la tarjeta de una película, una serie o un episodio abre su vista previa sin salir de la página. Funciona en todas las páginas y en los dashboards (Inicio, Películas, Series y sus secciones).

## Qué ve el usuario

- Al mantener el dedo (~0,4 s) la tarjeta se hunde un poco y, al cumplirse el tiempo, la vista previa crece desde ella hasta el centro de la pantalla con una transición. En Android, una vibración corta lo marca.
- La vista previa no enseña la imagen de la tarjeta pulsada (suele ser otra: una backdrop u otro póster). La página se difumina en cuanto se cumple el tiempo y la tarjeta flotante crece cuando su portada ya está descargada, así que aparece directamente con ella. Primero entra la portada ligera (w342) y la nítida (w780) encima, sin que se note el cambio. Si la portada tarda más de 1,5 s, se abre con un esqueleto.
- La transición de apertura y cierre va en el compositor del navegador (Web Animations API, solo `transform` y `opacity`, con el muelle de antes muestreado en una curva `linear()`). Así no se frena aunque la ficha rápida esté renderizando los datos que van llegando; antes iba con framer en el hilo principal y daba tirones. El cierre empieza en el mismo fotograma del toque y vuelve a la tarjeta pulsada desde donde esté, también si se cierra a mitad de la apertura.
- El pie de la portada se funde con el cristal de la tarjeta con una máscara (la misma curva que el hero de la ficha rápida), sin velo negro ni corte visible.
- La vista previa es una tarjeta flotante que no ocupa toda la pantalla: deja 6 px a cada lado (como mucho 440 px de ancho) y no llega arriba ni abajo. La página se queda detrás, difuminada.
- Solo enseña tres cosas:
  1. la portada del título con su logo (sin logo si la portada ya trae el título impreso);
  2. la fila de botones de la ficha (tráiler, banda sonora, visto, puntuar, favorito, pendiente, listas, reseñas), con sus mismos modales. Sin sesión, reseñas lleva al login, como en la ficha;
  3. el marcador de puntuaciones (TMDb, Trakt, IMDb y estadísticas).
- La fila de botones y el marcador se ven exactamente como en la ficha móvil: dejan 10 px a cada lado dentro de la tarjeta, así que miden lo mismo que allí (ancho de pantalla menos 32 px), con los mismos botones, el mismo tamaño de letra, 4 px entre botones y 20 px entre la fila y el marcador.
- Tocar la portada lleva a la ficha completa. La vista previa no se cierra: se queda encima, tal cual, mientras la ficha carga (también durante su pantalla de carga). Cuando la ficha ya está en pantalla se retira de golpe, sin animación de salida, y ya no vuelve a verse, tampoco al volver atrás. Si la ficha no llega en 10 s, se retira igualmente.
- Tocar fuera, o la tecla Escape, cierra la vista previa y la tarjeta vuelve a su sitio.
- Al soltar el dedo no se abre la ficha ni sale el menú del sistema para enlaces o imágenes.
- Si el dedo se mueve más de 10 px (desplazar la página o un carrusel), no se abre nada.
- Personas, temporadas, listas y colecciones no tienen vista previa.
- Solo en pantallas de móvil táctiles (menos de 768 px de ancho y puntero táctil). En ordenador y tablet todo sigue igual.

## Código

| Pieza | Qué hace |
|---|---|
| `src/components/preview/MobileTitlePeek.jsx` | Se monta una vez en `src/app/layout.jsx`. Escucha los toques en el documento, detecta la pulsación larga, anula el clic al soltar y pinta la vista previa. Descarga la ficha rápida solo cuando empieza una pulsación sobre un título. Al ir a la ficha (`onPeekOpenFull`) navega y retira la vista previa cuando la ruta de la ficha está en pantalla sin `[data-details-root][aria-busy="true"]`. |
| `src/lib/navigation/titlePeek.mjs` | Lógica pura: qué título corresponde a un enlace `/details/...` o a un atributo `data-sv-peek`, y los márgenes del gesto. Con tests (`titlePeek.test.mjs`). |
| `src/components/dashboard/DetailModal.jsx` | La ficha rápida con la prop `peek`: reutiliza su portada, su fila de botones y su marcador en la tarjeta flotante (`DetailPeekLayout`). |

Las tarjetas que son un enlace a `/details/movie/:id`, `/details/tv/:id` o `/details/tv/:id/season/:s/episode/:e` ya funcionan sin tocarlas. Las tarjetas de los dashboards que abren la ficha con un botón llevan `{...titlePeekAttrs(item)}`. Un bloque con `data-sv-no-peek` queda excluido.

## Relacionado
- [[Features]]
- [[paginas-de-usuario]]
- [[app-router-pages]]
