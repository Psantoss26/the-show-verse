// src/lib/ui/liquidGlass.js
//
// Única fuente de verdad del acabado "liquid glass".
//
// La referencia es el navbar inferior de móvil: fondo muy translúcido, un
// degradado diagonal que simula la luz sobre el cristal, desenfoque contenido
// (16px) con saturación realzada, y una sombra con reflejo interior superior.
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
