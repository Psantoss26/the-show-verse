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
// DESENFOQUE Y TINTE CONTENIDOS, a propósito: para que la pieza parezca vidrio
// y no una placa esmerilada, lo de detrás tiene que seguir siendo RECONOCIBLE.
// Con 72px de desenfoque y un velo oscuro alto no pasaba nada de fondo.
//
// SOBRE LA REFRACCIÓN REAL: se intentó deformar el fondo con un filtro SVG
// (`feDisplacementMap`), que es lo único capaz de desplazar píxeles. Medido en
// Chromium: aplicado con `filter` sobre una imagen normal deforma con fuerza
// (diferencia máxima 153/255), pero aplicado con `backdrop-filter` no hace nada
// apreciable (13/255). Los navegadores no aplican filtros SVG al backdrop, así
// que la ondulación del cristal de iOS NO es reproducible hoy en web; la
// sensación de vidrio la dan el canto que refracta y el reflejo (ver Navbar).
// Variante PLANA para franjas fijas a lo ancho de la ventana (la barra
// superior). Mismo cristal que LIQUID_GLASS_BAR —igual tinte, desenfoque y
// saturación, así que lo de detrás se ve igual— pero SIN el degradado de luz.
// En una píldora que flota, ese degradado da volumen; en una franja pegada al
// borde superior cae justo arriba y se lee como una banda clara cruzando lo alto
// de la página. Sin él el acabado queda uniforme de lado a lado.
export const LIQUID_GLASS_BAR_FLAT =
  "bg-black/15 backdrop-blur-[7px] backdrop-saturate-[190%] backdrop-brightness-[1.06]";

// Variante para TARJETAS que van en grupo (las de información de
// DetailsInfoTabs). Mismo cristal que LIQUID_GLASS_BAR pero SIN SOMBRA.
//
// La sombra de la barra (`0 16px 40px -8px rgba(0,0,0,0.75)` más un halo blanco
// de 32px) está pensada para UNA pieza que flota sola. Puestas varias tarjetas
// en fila, esas sombras se solapan entre sí y con el fondo y forman una banda
// oscura difuminada detrás de todo el grupo: deja de leerse como cristal sobre
// la imagen y parece un panel con fondo propio. Sin sombra, cada tarjeta se
// sostiene por su propio cristal y entre ellas se ve la imagen limpia.
export const LIQUID_GLASS_CARD =
  "bg-black/15 bg-gradient-to-b from-white/[0.14] via-white/[0.03] to-black/15 backdrop-blur-[7px] backdrop-saturate-[190%] backdrop-brightness-[1.06]";

// Variante para superficies que llevan OTRAS piezas translúcidas ENCIMA (hoy, la
// sección de Comentarios: un panel de cristal con una tarjeta por comentario).
//
// El cristal normal está calculado para verse contra la imagen de la página. Al
// apilar encima otra pieza translúcida los dos aclarados se suman, y sobre un
// backdrop claro y de poco contraste el bloque entero se va a gris claro: medido
// en La comunidad del anillo, el panel solo aclaraba el fondo +15.2 de
// luminancia y la zona con tarjeta +28.1 (x1.60). Ahí el texto blanco deja de
// leerse.
//
// Es el MISMO vidrio, un punto menos encendido:
//   - SIN `backdrop-brightness`: es lo que se multiplica al apilar.
//   - Tinte 15% -> 22% y luz superior 0.14 -> 0.10: la superficie sostiene el
//     texto en vez de competir con él.
//   - Saturación 190% -> 175%, lo justo para que el color de detrás siga
//     atravesando sin encenderse.
// El desenfoque no se toca: es el que hace que siga siendo vidrio.
export const LIQUID_GLASS_HOST =
  "bg-black/22 bg-gradient-to-b from-white/[0.10] via-white/[0.02] to-black/[0.18] backdrop-blur-[7px] backdrop-saturate-[175%]";

// La ELEVACIÓN de la familia, suelta: sombra amplia hacia abajo más un halo
// blanco tenue alrededor. Ese halo es la mitad de la firma —es lo que separa la
// pieza del fondo sin dibujarle un borde—, así que quien quiera parecerse a la
// barra lo necesita. Va aparte porque hay superficies que toman el cristal SIN
// la elevación (las tarjetas en grupo) y otras que la quieren sobre una forma
// propia (los botones de acción, redondos).
export const LIQUID_GLASS_ELEVATION =
  "shadow-[0_16px_40px_-8px_rgba(0,0,0,0.75),0_0_32px_rgba(255,255,255,0.06)]";

// BAR = CARD + ELEVATION. Antes eran dos cadenas literales con el mismo cristal
// escrito dos veces; componerla evita que una se quede atrás al tocar la otra.
export const LIQUID_GLASS_BAR = `${LIQUID_GLASS_CARD} ${LIQUID_GLASS_ELEVATION}`;
// ENVOLTURA del acabado de barra: las clases que SIEMPRE acompañan a
// LIQUID_GLASS_BAR, extraídas de DetailsSectionMenu, que es la pieza de
// referencia de la ficha.
//
// Cada una está por un motivo concreto, y ninguna es decorativa:
//   - `relative isolate`: posiciona las capas ópticas y aísla el interior. OJO,
//     `isolate` convierte al elemento en BACKDROP ROOT, así que el
//     `backdrop-filter` tiene que ir en ESTE elemento, nunca en un hijo: medido
//     en Chromium, un hijo con `backdrop-filter: invert(1)` bajo un padre con
//     `isolate` no invierte nada.
//   - `overflow-hidden`: recorta las capas ópticas al radio de la pieza.
//   - `transform-gpu`: viene de DetailsSectionMenu, donde está para promover la
//     capa. OJO: en este Tailwind v4 esa utilidad NO genera ninguna regla
//     —medido en el CSS servido: 0 reglas con ese selector, y el `transform`
//     computado de las piezas que la llevan es `none`—, así que hoy no hace
//     nada. Se mantiene para que la lista de clases sea LITERALMENTE la misma
//     que la de la pieza de referencia; si algún día se sustituye por algo que
//     sí promueva, cambia aquí para todas a la vez.
//
// El RADIO no entra aquí: es forma, y la pone cada superficie (todas las de la
// ficha usan `rounded-2xl`). Las capas ópticas tampoco, porque son un elemento:
// hay que pintar <LiquidGlassOpticalLayers /> como primer hijo.
export const LIQUID_GLASS_SURFACE = `relative isolate overflow-hidden transform-gpu ${LIQUID_GLASS_BAR}`;

// La MISMA envoltura, sobre el cristal sin sombra: para tarjetas que van en
// GRUPO (las de metadatos de la ficha, temporada, episodio y el modal del
// dashboard). Tinte, desenfoque, saturación y capas ópticas idénticos a
// LIQUID_GLASS_SURFACE; lo único que cambia es la elevación, y no por gusto:
// apiladas en columna con 12px de separación, las sombras de cada tarjeta
// rellenan los huecos y el grupo deja de leerse como piezas sueltas sobre el
// cartel para parecer un panel oscuro con separadores (verificado en la columna
// móvil de la ficha). Es el mismo motivo por el que existe LIQUID_GLASS_CARD.
export const LIQUID_GLASS_SURFACE_CARD = `relative isolate overflow-hidden transform-gpu ${LIQUID_GLASS_CARD}`;
