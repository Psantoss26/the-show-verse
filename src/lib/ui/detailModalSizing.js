// Tamaño del cajón lateral de DetailModal.
//
// Vive fuera del componente para poder comprobarse: el mínimo NO es un número
// elegido a ojo, sino una consecuencia del ancho que necesita la barra del
// DetailsScoreboardPanel, y conviene que un test lo vigile.

// ANCHO INTRÍNSECO de la barra del scoreboard. Por debajo, sus dos mitades —las
// puntuaciones a la izquierda; los enlaces externos y compartir a la derecha—
// dejan de caber. La barra es `sm:overflow-visible`, así que no recorta: se
// SOLAPAN.
//
// MEDIDO sobre el modal real, con el caso más exigente: cinco insignias (TMDb,
// Trakt, IMDb, Rotten Tomatoes y Metacritic) MÁS los iconos de plataformas y el
// botón de compartir. Con el cajón a 876px quedaban 41px entre ambas mitades,
// así que se tocan a 836px de cajón → 780px de barra.
//
// OJO al medirlo de nuevo: la barra de la FICHA (`/details/...`) no lleva los
// iconos de plataformas y su umbral es bastante menor (~623px). El que manda es
// el del modal, que es donde caben más cosas.
export const SCOREBOARD_MIN_CONTENT_PX = 780;

// Relleno horizontal de la columna de contenido del modal (`p-5 sm:p-7`).
export const MODAL_CONTENT_PADDING_PX = 56;

// Margen sobre el umbral para no dejarlo al filo.
export const SCOREBOARD_SAFETY_MARGIN_PX = 44;

// SEGUNDA RESTRICCIÓN: la fila de Reparto.
//
// Su Swiper usa `breakpointsBase="container"` con `840: { slidesPerView: 6 }`,
// así que por debajo de 840px de contenedor pasa de 6 tarjetas a 5. Redimensionar
// el cajón no debe reorganizar esa fila delante del usuario.
export const CAST_ROW_SIX_CARDS_PX = 840;

// ANCHO DE LA BARRA YA COMPACTADA: tres insignias (TMDb, Trakt, IMDb) y los
// botones de plataformas, enlaces y compartir reducidos a iconos redondos.
//
// Es el suelo REAL de la barra, y el que manda ahora que el panel sabe ceder
// por partes: al estrecharse, primero los botones pierden su etiqueta
// (`detail-score-actions`) y después se retiran Rotten Tomatoes y Metacritic
// (`.optionalScore`), las dos puntuaciones sin recuento de votos. Ver
// `DetailsScoreboardPanel.module.css`.
//
// Desglose: 3 insignias (~78px) + 2 huecos (20px) + los botones en su mínimo
// (9rem, el `min-inline-size` de `.actionsViewport`) + el hueco de la barra
// (16px) + su relleno lateral (44px).
export const SCOREBOARD_COMPACT_MIN_CONTENT_PX = 478;

// `SCOREBOARD_MIN_CONTENT_PX` y `CAST_ROW_SIX_CARDS_PX` siguen documentando los
// umbrales de la barra COMPLETA y de las seis tarjetas de Reparto, pero ya no
// fijan el mínimo: por debajo de ellos el panel no se rompe, solo se reorganiza
// —la barra suelta lo prescindible y el Reparto pasa a cinco tarjetas—, y eso
// es preferible a impedir que el panel se estreche.
export const DRAWER_MIN_PX =
  SCOREBOARD_COMPACT_MIN_CONTENT_PX + MODAL_CONTENT_PADDING_PX;

// Techo del "rescate": el cajón puede pasar de medio viewport para alcanzar su
// mínimo seguro, pero nunca comerse más de esta fracción de la ventana. Sin
// este tope, en un portátil de 1024px el cajón ocuparía el 86% de la pantalla,
// que es peor remedio que la enfermedad.
export const DRAWER_MAX_VIEWPORT_SHARE = 0.7;

// Recorrido mínimo del tirador allí donde la pantalla lo permita: un rango de
// cero equivale a un control que no responde.
export const DRAWER_MIN_TRAVEL_PX = 120;

export function clampDrawerWidth(width, viewportWidth, { tablet = false } = {}) {
  const vw = viewportWidth || 1280;
  const medioViewport = Math.round(vw * 0.5);
  const techo = Math.round(vw * DRAWER_MAX_VIEWPORT_SHARE);

  // Medio viewport sigue siendo el tope PREFERIDO, y manda en cuanto la pantalla
  // da de sí. Pero en ventanas de menos de ~1792px ese tope cae por debajo del
  // mínimo: subirlo solo hasta el mínimo dejaría el rango en CERO y el tirador
  // no haría nada —exactamente el fallo por el que en su día se bajó este mínimo
  // a 560—. Por eso se garantiza un recorrido mínimo, sin pasar del techo de
  // pantalla.
  const max = Math.min(
    techo,
    Math.max(medioViewport, DRAWER_MIN_PX + DRAWER_MIN_TRAVEL_PX),
  );

  // Se sigue acotando por si el máximo cayera por debajo del mínimo (ventanas
  // estrechas): ahí el cajón queda fijo al máximo en lugar de romperse.
  //
  // Tablet usa el MISMO mínimo que escritorio, garantizando además el recorrido
  // del tirador. Antes tenía uno propio de 560px, más alto que el de
  // escritorio: se escribió cuando el de escritorio eran 896 y hacía falta un
  // atajo para que en una tablet el cajón no naciera bloqueado. Ahora que el
  // mínimo general baja de esa cifra, ese atajo dejaría a la tablet como la
  // MENOS capaz de estrecharse, que es lo contrario de lo que busca.
  const min = tablet
    ? Math.min(DRAWER_MIN_PX, max - DRAWER_MIN_TRAVEL_PX)
    : Math.min(DRAWER_MIN_PX, max);
  return Math.max(min, Math.min(Math.round(width || 0), max));
}

// Proporción de un teléfono vertical moderno (ancho / alto).
export const MOBILE_DETAILS_ASPECT_RATIO = 9 / 19.5;

// La ficha conserva tanto la proporción móvil como espacio para la página.
// El límite por altura impide que el teléfono se salga de la pantalla.
export function clampMobileDetailsWidth(width, viewportWidth, viewportHeight = Infinity) {
  const max = Math.min(
    639,
    Math.floor(viewportWidth * 0.6),
    Math.floor(viewportHeight * MOBILE_DETAILS_ASPECT_RATIO),
  );
  const min = Math.min(320, max);
  return Math.max(min, Math.min(Math.round(width ?? max), max));
}
