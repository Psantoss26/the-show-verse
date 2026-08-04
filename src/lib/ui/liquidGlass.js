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
//  - DIFUMINADO AGRESIVO DE 50PX (`backdrop-blur-[50px] backdrop-saturate-[190%]`).
//  - SIN BORDES MARCADOS: cero trazos o bordes duros (`border-none`).
//  - CRISTAL LÍQUIDO OSCURO (`bg-black/60 bg-gradient-to-b from-white/[0.14] via-white/[0.03] to-black/40`):
//    se distingue perfectamente sobre fondos negros (#000000) adoptando un tono carbón translúcido.
//  - REFLEJO DIFUSO Y ELEVACIÓN (`shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_16px_40px_-8px_rgba(0,0,0,0.9),0_0_32px_rgba(255,255,255,0.05)]`).
export const LIQUID_GLASS_BAR =
  "bg-black/60 bg-gradient-to-b from-white/[0.14] via-white/[0.03] to-black/40 backdrop-blur-[50px] backdrop-saturate-[190%] shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_16px_40px_-8px_rgba(0,0,0,0.9),0_0_32px_rgba(255,255,255,0.05)]";



