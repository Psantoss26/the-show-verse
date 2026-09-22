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

// UMBRAL DE LAS CINCO INSIGNIAS (40rem = 640px de barra).
//
// Por debajo, el container query de `DetailsScoreboardPanel.module.css` retira
// Rotten Tomatoes y Metacritic. En ESCRITORIO el arrastre se para justo antes:
// ahí hay sitio de sobra, y perder dos puntuaciones por estrechar es una
// degradación que no hace falta ofrecer.
export const SCOREBOARD_FIVE_SCORES_PX = 640;

// UMBRAL DE LAS ESTADÍSTICAS EN UNA SOLA FILA.
//
// La fila de seguidores/reproducciones/listas/favoritos envuelve cuando sus
// cuatro insignias no caben (`sm:flex-wrap`), y al hacerlo el panel crece de
// alto. En TABLET el arrastre se para ahí: es el último ancho en el que el
// marcador se lee de una pasada.
//
// ESTIMADO, no medido en navegador como sí lo fue `SCOREBOARD_MIN_CONTENT_PX`:
// las cuatro insignias (~113 + ~138 + ~78 + ~98px, donde "REPRODUCCIONES" es la
// más larga) más tres huecos de 16px y el relleno lateral de 44px, redondeado
// al alza porque el ancho de cada etiqueta depende de la cifra que muestre.
export const SCOREBOARD_STATS_ONE_ROW_PX = 500;

// Mínimo de ESCRITORIO: se para antes de que se oculten las dos puntuaciones.
export const DRAWER_MIN_PX =
  SCOREBOARD_FIVE_SCORES_PX + MODAL_CONTENT_PADDING_PX;

// Mínimo de TABLET: llega más abajo —ahí la pantalla no da para tanto— y se
// para cuando las estadísticas están a punto de partirse en dos filas. Las
// puntuaciones opcionales sí se retiran por el camino, que es lo que permite
// bajar hasta aquí.
export const DRAWER_TABLET_MIN_PX =
  SCOREBOARD_STATS_ONE_ROW_PX + MODAL_CONTENT_PADDING_PX;

// `SCOREBOARD_MIN_CONTENT_PX` y `CAST_ROW_SIX_CARDS_PX` siguen documentando los
// umbrales de la barra con los botones SIN compactar y de las seis tarjetas de
// Reparto, pero ya no fijan el mínimo: por debajo de ellos el panel no se
// rompe, solo se reorganiza.

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

  // TABLET: medio viewport es un tope DURO, no preferido.
  //
  // El "rescate" de abajo existe para que en un portátil estrecho el cajón
  // pueda pasar de medio viewport y alcanzar así un ancho usable. En una
  // tablet ese rescate se comía hasta el 70% de la pantalla y dejaba la página
  // reducida a una franja, que es peor que un cajón algo justo. Aquí el mínimo
  // ya cede por su cuenta (ver `DRAWER_TABLET_MIN_PX`), así que no hace falta
  // robarle sitio a la página.
  if (tablet) {
    const maxTablet = medioViewport;
    const minTablet = Math.min(
      DRAWER_TABLET_MIN_PX,
      maxTablet - DRAWER_MIN_TRAVEL_PX,
    );
    return Math.max(minTablet, Math.min(Math.round(width || 0), maxTablet));
  }

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
  const min = Math.min(DRAWER_MIN_PX, max);
  return Math.max(min, Math.min(Math.round(width || 0), max));
}

// Proporción de un teléfono vertical moderno (ancho / alto).
export const MOBILE_DETAILS_ASPECT_RATIO = 9 / 19.5;

// ANCHO MÍNIMO de la ficha de teléfono. No es un número a ojo: es el ancho por
// debajo del cual el marcador se degrada, MEDIDO en el navegador sobre el panel
// real (17 títulos de los destacados de Películas y Series, sesión sin Trakt).
//
// 1) Las tres puntuaciones (TMDb, IMDb y Trakt) se parten en dos filas por
//    debajo de 393px: en la barra estrecha las insignias ENVUELVEN, que es su
//    forma de no recortarse.
export const PHONE_RATINGS_ONE_ROW_PX = 393;

// 2) La fila de seguidores/reproducciones/listas/favoritos es un carril con
//    scroll horizontal, y por debajo de 431px deja parte fuera. El ancho que
//    necesita depende de las CIFRAS de cada título ("312.2K REPRODUCCIONES" es
//    de las más largas), así que este es el peor caso de la muestra.
export const PHONE_STATS_NO_SCROLL_PX = 431;

// Margen sobre la medida: las cifras crecen con el tiempo y una fuente puede
// medir un pelo distinto. Lo justo para no quedarse al filo.
export const PHONE_MIN_SAFETY_MARGIN_PX = 9;

// Manda el mayor de los dos, que hoy es el de las estadísticas. Con este ancho
// caben de sobra la fila de acciones del hero (tráiler, soundtrack, vistos,
// puntuar, favorito, pendientes y listas), que necesita ~295px y era el motivo
// anterior de este mínimo.
export const MOBILE_DETAILS_MIN_PX =
  Math.max(PHONE_RATINGS_ONE_ROW_PX, PHONE_STATS_NO_SCROLL_PX) +
  PHONE_MIN_SAFETY_MARGIN_PX;

// La ficha conserva la proporción móvil mientras quepa en alto. En pantallas
// anchas y bajas (tablets en horizontal, portátiles de poca altura) ese ancho
// saldría por debajo del mínimo, así que el ancho NUNCA baja de
// `MOBILE_DETAILS_MIN_PX`: ahí el panel se limita al alto de la ventana (ver
// `max-h-full` en DetailModal) y queda algo más ancho que un teléfono; la
// portada es `object-cover`, así que hace zoom y lo cubre pegada a los bordes.
// El 60% del viewport sigue siendo el techo para dejar sitio a la página.
export function clampMobileDetailsWidth(width, viewportWidth, viewportHeight = Infinity) {
  const min = Math.min(MOBILE_DETAILS_MIN_PX, Math.floor(viewportWidth * 0.6));
  const max = Math.max(
    min,
    Math.min(
      639,
      Math.floor(viewportWidth * 0.6),
      Math.floor(viewportHeight * MOBILE_DETAILS_ASPECT_RATIO),
    ),
  );
  return Math.max(min, Math.min(Math.round(width ?? max), max));
}

// ESCALA DEL CONTENIDO DE LA FICHA DE TELÉFONO en escritorio.
//
// El panel crece con la pantalla (su ancho sale del alto de la ventana), pero
// puntuaciones, estadísticas, pestañas y tarjetas están en píxeles: en una
// pantalla 2K el panel mide ~600px y esos bloques se veían tan pequeños como en
// un panel de ~440px (FullHD). Se escalan con el ancho, con FullHD como
// referencia (escala 1).
//
// NO en proporción directa: con escala = ancho / 440, en 2K salía ×1,37 y se
// veía demasiado grande. Se aplica solo una parte del crecimiento del panel
// (`PHONE_CONTENT_GROWTH`), así que en 2K queda en ~×1,22, y con un techo más
// bajo para pantallas enormes.
export const PHONE_CONTENT_REFERENCE_WIDTH = 440;
export const PHONE_CONTENT_GROWTH = 0.6;
export const PHONE_CONTENT_MAX_SCALE = 1.3;

export function phoneContentScale(panelWidth) {
  const width = Number(panelWidth) || 0;
  const growth = width / PHONE_CONTENT_REFERENCE_WIDTH - 1;
  const scale = 1 + Math.max(0, growth) * PHONE_CONTENT_GROWTH;
  return Math.round(Math.min(PHONE_CONTENT_MAX_SCALE, scale) * 1000) / 1000;
}
