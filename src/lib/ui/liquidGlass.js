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

// Variante para BARRAS FLOTANTES (la barra inferior de móvil).
//
// Se diferencia de LIQUID_GLASS_PANEL en dos cosas, y ambas son deliberadas:
//
//  1. SIN BORDES MARCADOS. El panel lleva un reflejo interior superior
//     (`inset 0 1px 1.5px`) que en un modal recorta bien contra el fondo oscuro,
//     pero en una píldora que flota sobre el contenido dibuja un filo que la
//     delata como una caja pegada encima. Aquí no hay reflejo, ni aro, ni borde:
//     la pieza se separa del fondo solo por el desenfoque y una sombra amplia.
//  2. DESENFOQUE MÁS PROFUNDO y saturación aplicada al FONDO
//     (`backdrop-saturate`, no `saturate`): un filtro normal satura el propio
//     contenido de la barra —los iconos—, mientras que el del cristal real actúa
//     sobre lo que se ve a través. Con más blur, el color de debajo se funde en
//     una mancha suave en vez de dejar ver formas reconocibles.
export const LIQUID_GLASS_BAR =
  "bg-black/[0.32] backdrop-blur-[30px] backdrop-saturate-[180%] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.75)]";
