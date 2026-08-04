// src/lib/ui/liquidGlass.js
//
// Única fuente de verdad del acabado "liquid glass".
//
// El acabado de PANEL nació del navbar inferior de móvil: fondo muy translúcido,
// un degradado diagonal que simula la luz sobre el cristal, desenfoque contenido
// (16px) con saturación realzada, y una sombra con reflejo interior superior.
// (La barra inferior ya no lo usa: necesita cristal sin bordes marcados y tiene
// su propia variante, LIQUID_GLASS_BAR, más abajo.)
//
// POR QUÉ UNA CONSTANTE Y NO COPIAR LAS CLASES
// Este acabado estaba repetido a mano en 7 modales, y una de esas copias ya
// se había desviado (TraktEpisodesWatchedModal usaba `via-white/5 to-black/55`).
// Con una constante compartida, cambiarlo en un sitio lo cambia en todos y
// dejan de poder divergir en silencio.
//
// Solo cubre el ACABADO (fondo, desenfoque, sombra). La forma (radio, tamaño,
// posición) la pone cada consumidor, porque es propia de cada superficie.
export const LIQUID_GLASS_PANEL =
  "bg-black/[0.28] bg-gradient-to-br from-white/[0.08] via-transparent to-black/[0.12] backdrop-blur-[16px] saturate-[140%] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.08),0_12px_36px_-6px_rgba(0,0,0,0.6)]";

export const LIQUID_GLASS_TOOLTIP =
  "bg-zinc-950/85 backdrop-blur-2xl saturate-[140%] shadow-[0_12px_36px_-6px_rgba(0,0,0,0.9)]";

// Variante para BARRAS FLOTANTES (la barra inferior de móvil - Estilo Instagram iOS Liquid Glass).
//
//  - DIFUMINADO MUY AGRESIVO (72px): a esa distancia lo de detrás deja de tener
//    forma reconocible y se convierte en una mancha de color, que es lo que hace
//    que la pieza parezca cristal y no un panel encima.
//  - TINTE MÍNIMO (`bg-black/25`): el color del fondo TIENE que atravesar. Con
//    un velo oscuro alto (estaba en `bg-black/60`) el cristal se comporta como
//    una placa gris: por muy alto que sea el desenfoque, ya no pasa color y el
//    efecto se pierde. El contraste de los iconos lo sostienen el desenfoque y
//    la sombra, no el tinte.
//  - COLOR REALZADO (`backdrop-saturate-[200%] backdrop-brightness-[1.08]`): al
//    difuminar tanto, el color de fondo se apaga; saturarlo y levantarlo un poco
//    devuelve la viveza. Esto es lo que diferencia este acabado del navbar
//    superior, que solo difumina.
//  - ELEVACIÓN DIFUSA, sin canto: sombra exterior amplia y un halo tenue.
//
// SIN BORDES MARCADOS, y esto incluye el reflejo interior: un `inset 0 1px` es
// justo lo que dibuja un filo de 1px en el borde superior de una píldora que
// flota sobre el contenido, que es lo que delata la pieza como una caja pegada
// encima. El volumen lo da el degradado del propio fondo (from-white/[0.16]),
// que se apaga hacia dentro en vez de trazar una línea.
export const LIQUID_GLASS_BAR =
  "bg-black/25 bg-gradient-to-b from-white/[0.16] via-white/[0.04] to-black/25 backdrop-blur-[72px] backdrop-saturate-[200%] backdrop-brightness-[1.08] shadow-[0_16px_40px_-8px_rgba(0,0,0,0.75),0_0_32px_rgba(255,255,255,0.06)]";



