"use client";

// /src/components/preview/DetailPeekLayout.jsx
// La TARJETA FLOTANTE de la vista previa de pulsación larga (ver
// MobileTitlePeek): portada, fila de botones y marcador, con la página
// difuminada detrás. La rellenan la ficha rápida (DetailModal en modo `peek`,
// películas, series y episodios) y la vista previa de temporada (SeasonPeek).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, usePresence, useReducedMotion } from "framer-motion";

import { LIQUID_GLASS_DETAIL_SURFACE } from "@/lib/ui/liquidGlass";
import {
  MOBILE_POSTER_OVERSCAN,
  MobileHeroCover,
} from "@/components/details/MobileDetailsHero";
import { morphPeekCard, peekHrefKeepsParts } from "@/lib/navigation/peekHandoff";
import { useRouter } from "@/lib/offline/useOfflineRouter";

/* ======================= VISTA PREVIA (PULSACIÓN LARGA) ======================= */
// Ancho de la tarjeta: lo que da el teléfono menos 6px por lado, sin pasar de
// 440px; alrededor se sigue viendo la página difuminada. Dentro, la fila de
// botones y el marcador dejan 10px a cada lado: así miden lo mismo que en la
// ficha móvil (DetailsClient, ancho de pantalla menos 32px) y se ven iguales,
// con los mismos botones, letras y separaciones. La portada se queda en 2:3 mientras quepa y, en pantallas
// bajas, se recorta por arriba y por abajo para dejar sitio a botones y
// marcador: la tarjeta nunca ocupa la pantalla entera.
const PEEK_MAX_WIDTH = 440;
const PEEK_SIDE_GUTTER = 6;
// Alto que se reserva para la fila de botones, el marcador y el aire de arriba
// y abajo.
const PEEK_CHROME_HEIGHT = 300;
// Con el marcador compacto (solo puntuaciones, sin la fila de estadísticas;
// ver `compactScoreboard`): botones (~70px con su aire), marcador compacto
// (~75px), separaciones y el margen de la tarjeta a la pantalla. Con 300 la
// portada de una temporada se quedaba por debajo de 2:3 en un 390×844 y
// perdía el borde superior.
const PEEK_COMPACT_CHROME_HEIGHT = 220;
// La tarjeta no crece hasta tener la portada cargada (ver DetailPeekLayout);
// si tarda más que esto, se abre igualmente con el esqueleto. La portada se
// pide ya al apoyar el dedo (`prewarmModalHeroPoster`), así que casi siempre
// está al cumplirse la pulsación y esto es solo el tope: más espera se lee
// como que la pulsación no ha funcionado.
const PEEK_ART_MAX_WAIT_MS = 450;

// Ancho mínimo de la tarjeta al estrecharla para que quepa la portada entera
// (`fitPoster`): por debajo, los botones y las tres puntuaciones no caben.
const PEEK_FIT_MIN_WIDTH = 280;

function peekGeometry(chromeHeight = PEEK_CHROME_HEIGHT, fitPoster = false) {
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height || window.innerHeight;
  let width = Math.min(PEEK_MAX_WIDTH, vw - PEEK_SIDE_GUTTER * 2);
  // `fitPoster` (temporadas, con el título impreso arriba y abajo): en
  // pantallas bajas la tarjeta se estrecha para que la portada siga en 2:3
  // en vez de recortarse.
  if (fitPoster) {
    width = Math.min(
      width,
      Math.max(PEEK_FIT_MIN_WIDTH, Math.floor((vh - chromeHeight) / 1.5)),
    );
  }
  const posterHeight = Math.max(
    180,
    Math.min(Math.round(width * 1.5), vh - chromeHeight),
  );
  return { vw, vh, width, posterHeight };
}

// La tarjeta crece desde la tarjeta pulsada y vuelve a ella al cerrarse. Como
// queda centrada en la pantalla, basta con el desplazamiento entre los dos
// centros y la proporción entre los dos anchos.
function peekOriginTransform(origin, geometry) {
  if (!origin || !geometry) return { x: 0, y: 24, scale: 0.9 };
  return {
    x: origin.left + origin.width / 2 - geometry.vw / 2,
    y: origin.top + origin.height / 2 - geometry.vh / 2,
    scale: Math.max(0.2, Math.min(1, origin.width / geometry.width)),
  };
}

// ANIMACIÓN DE LA TARJETA EN EL COMPOSITOR. Con framer, el muelle de `x`,
// `y` y `scale` se calcula en el hilo principal fotograma a fotograma, y la
// ficha rápida renderiza justo entonces (llegan sus datos: ~12 renders en
// los 700 ms de la apertura medidos con la CPU a ×4): la tarjeta se frenaba
// a mitad al abrir y al cerrar. Con la API de animaciones y solo `transform`
// y `opacity`, el navegador la mueve en el compositor aunque React esté
// ocupado. El muelle es el de antes (rigidez 380, amortiguación 32, masa
// 0,9), muestreado en una curva `linear()`.
const PEEK_SPRING = { stiffness: 380, damping: 32, mass: 0.9 };
const PEEK_OPACITY_IN_MS = 140;
// Cierre: vuelve a la tarjeta pulsada frenando al llegar (sale rápido del
// centro y se posa en su sitio), y se desvanece en la segunda mitad del
// recorrido, ya cerca de ella. Antes aceleraba hasta el final (`ease-in`) y se
// fundía desde el primer fotograma: parecía que se esfumaba a mitad de camino
// y llegaba de golpe.
const PEEK_EXIT_MS = 320;
const PEEK_EXIT_EASING = "cubic-bezier(0.3, 0.7, 0.1, 1)";
const PEEK_EXIT_FADE_DELAY_MS = 110;
const PEEK_FALLBACK_EASING = "cubic-bezier(0.2, 0.9, 0.25, 1)";

function sampleSpring({ stiffness, damping, mass }) {
  const dt = 1 / 120;
  let x = 0;
  let v = 0;
  const points = [0];
  let t = 0;
  while (t < 2) {
    const a = (stiffness * (1 - x) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    points.push(x);
    if (Math.abs(1 - x) < 0.0005 && Math.abs(v) < 0.01) break;
  }
  points[points.length - 1] = 1;
  // Uno de cada dos puntos (60 por segundo) basta para que no se note el
  // tramo recto entre ellos.
  const stops = points.filter(
    (_, index) => index % 2 === 0 || index === points.length - 1,
  );
  return {
    duration: Math.round(t * 1000),
    easing: `linear(${stops.map((value) => value.toFixed(4)).join(", ")})`,
  };
}

let peekSpringCache = null;
function peekSpring() {
  if (peekSpringCache) return peekSpringCache;
  const spring = sampleSpring(PEEK_SPRING);
  const supported =
    typeof CSS !== "undefined" &&
    CSS.supports?.("transition-timing-function", "linear(0, 1)");
  peekSpringCache = supported
    ? spring
    : { duration: spring.duration, easing: PEEK_FALLBACK_EASING };
  return peekSpringCache;
}

const peekTransformCss = ({ x, y, scale }) =>
  `translate(${x}px, ${y}px) scale(${scale})`;

export default function DetailPeekLayout({
  title,
  origin,
  posterLowSrc,
  posterSrc,
  // Portada compuesta en lugar de una imagen (las bandas de un episodio, ver
  // EpisodeStillStack); `coverReady` dice cuándo está descargada.
  cover = null,
  coverReady = false,
  // Portada como la de la ficha móvil (temporadas): MobileHeroCover de fondo
  // de toda la tarjeta, con el póster entero, la prolongación difuminada de
  // su borde y, detrás de botones y marcador, su reflejo difuminado y el
  // oscurecido adaptativo, en vez del fundido a la tarjeta.
  phoneCover = false,
  // El marcador que se pasa es el compacto (sin fila de estadísticas): se
  // reserva menos alto y la portada queda siempre en 2:3, sin recortes (en
  // pantallas bajas, estrechando la tarjeta; ver `peekGeometry`).
  compactScoreboard = false,
  logo,
  actions,
  scoreboard,
  onBackdropPointerDown,
  onBackdropPointerCancel,
  onBackdropClick,
  onOpenFull,
  // Ficha a la que lleva la portada: se precarga al abrirse la vista previa
  // para que, al tocarla, la navegación entre ya sin esperar al servidor.
  prefetchHref = null,
  scrollRef,
  children,
}) {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [geometry] = useState(() =>
    peekGeometry(
      compactScoreboard ? PEEK_COMPACT_CHROME_HEIGHT : PEEK_CHROME_HEIGHT,
      compactScoreboard,
    ),
  );
  useEffect(() => {
    if (prefetchHref) router.prefetch(prefetchHref);
  }, [router, prefetchHref]);
  const from = reduceMotion
    ? { x: 0, y: 0, scale: 0.96 }
    : peekOriginTransform(origin, geometry);
  // PORTADA ANTES QUE TARJETA. La tarjeta pulsada suele enseñar otra imagen
  // (una backdrop, otro póster), así que no se usa de relleno: enseñarla y
  // cambiarla después se veía como dos imágenes seguidas. La tarjeta flotante
  // espera, transparente y en el sitio de la pulsada, a que la portada esté
  // descargada y decodificada, y entonces crece ya con ella. Primero la w342
  // (la que precarga useDetailModalData) y la w780 entra encima al llegar:
  // es la misma imagen, solo cambia la nitidez.
  const [lowReady, setLowReady] = useState(null);
  const [posterLoaded, setPosterLoaded] = useState(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setWaitedTooLong(true),
      PEEK_ART_MAX_WAIT_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);
  const artReady = cover
    ? coverReady
    : (posterLowSrc && lowReady === posterLowSrc) ||
      (posterSrc && posterLoaded === posterSrc);
  const shown = artReady || waitedTooLong;
  const markLoaded = (setter, src) => (event) => {
    const img = event.currentTarget;
    const done = () => setter(src);
    if (typeof img.decode === "function") img.decode().then(done, done);
    else done();
  };

  // La tarjeta nace invisible en el sitio de la pulsada (estilo en línea) y
  // crece con la API de animaciones cuando `shown`, en el mismo commit que
  // le pone el estilo final. Al cerrarse, AnimatePresence
  // espera (`usePresence`) a que vuelva a la tarjeta pulsada. `cardRef` es
  // el contenedor de scroll de la ficha (ver `ref` de la tarjeta).
  const cardRef = scrollRef;
  const fromCss = peekTransformCss(from);
  const openedRef = useRef(false);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!shown || openedRef.current || !card) return;
    openedRef.current = true;
    if (typeof card.animate !== "function") return;
    const spring = reduceMotion
      ? { duration: 150, easing: "ease-out" }
      : peekSpring();
    card.animate([{ transform: fromCss }, { transform: "none" }], {
      duration: spring.duration,
      easing: spring.easing,
    });
    card.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: reduceMotion ? 150 : PEEK_OPACITY_IN_MS,
      easing: "linear",
    });
  }, [cardRef, shown, fromCss, reduceMotion]);

  const [isPresent, safeToRemove] = usePresence();
  useEffect(() => {
    if (isPresent) return undefined;
    const card = cardRef.current;
    if (!card || !openedRef.current || typeof card.animate !== "function") {
      safeToRemove?.();
      return undefined;
    }
    card.style.pointerEvents = "none";
    // Desde donde esté ahora (también si se cierra a mitad de la apertura).
    const current = window.getComputedStyle(card);
    card.getAnimations().forEach((animation) => animation.cancel());
    const exitMs = reduceMotion ? 120 : PEEK_EXIT_MS;
    const fadeDelay = reduceMotion ? 0 : PEEK_EXIT_FADE_DELAY_MS;
    card.animate(
      [{ transform: current.transform }, { transform: fromCss }],
      { duration: exitMs, easing: PEEK_EXIT_EASING, fill: "forwards" },
    );
    const exit = card.animate(
      [{ opacity: current.opacity }, { opacity: 0 }],
      {
        duration: exitMs - fadeDelay,
        delay: fadeDelay,
        easing: "cubic-bezier(0.4, 0, 0.6, 1)",
        fill: "both",
      },
    );
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      safeToRemove?.();
    };
    exit.finished.then(finish, finish);
    return undefined;
  }, [cardRef, isPresent, safeToRemove, fromCss, reduceMotion]);

  // IR A LA FICHA: en el mismo fotograma del toque la tarjeta empieza a
  // convertirse en la cabecera de la ficha (ver lib/navigation/peekHandoff) y
  // luego se navega. Si la ficha es la de una película o serie, logo, fila de
  // botones y marcador no se desvanecen: vuelan a los suyos de la ficha, que
  // los pinta iguales y sin animación de entrada. Las demás (temporadas,
  // episodios) traen otros, que entran con su animación: los de aquí se
  // desvanecen.
  const coverRef = useRef(null);
  const logoRef = useRef(null);
  const logoShadeRef = useRef(null);
  const actionsRef = useRef(null);
  const scoreboardRef = useRef(null);
  const handleOpenFull = () => {
    const pieces = [logoRef.current, actionsRef.current, scoreboardRef.current];
    const keepParts = peekHrefKeepsParts(prefetchHref);
    morphPeekCard(cardRef.current, coverRef.current, {
      parts: keepParts ? pieces : [],
      fadeNodes: keepParts ? [logoShadeRef.current] : [logoShadeRef.current, ...pieces],
      overscan: MOBILE_POSTER_OVERSCAN,
      fullPoster: !cover,
      reduceMotion,
    });
    onOpenFull?.();
  };

  return (
    <div
      className="fixed inset-0 z-[9999]"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Vista previa de ${title}` : "Vista previa"}
    >
      {/* Fondo: la página se queda a la vista, difuminada y algo apagada. */}
      <motion.div
        className="fixed inset-0 bg-black/35 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.24, ease: "easeOut" }}
        onPointerDown={onBackdropPointerDown}
        onPointerCancel={onBackdropPointerCancel}
        onClick={onBackdropClick}
      />

      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div
          // El `useScroll` de la ficha necesita su contenedor montado: aquí
          // es la tarjeta, que es lo que se desplaza en pantallas bajas.
          ref={cardRef}
          data-peek-card=""
          className={`pointer-events-auto relative max-h-[calc(100svh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-[1.75rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${LIQUID_GLASS_DETAIL_SURFACE}`}
          style={{
            width: geometry.width,
            transformOrigin: "50% 50%",
            // Estado final en cuanto se muestra: la animación de entrada
            // (ver el efecto de arriba) parte de la tarjeta pulsada.
            transform: shown ? "none" : fromCss,
            opacity: shown ? 1 : 0,
            ...(phoneCover
              ? { "--mobile-cover-h": `${geometry.posterHeight}px` }
              : null),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* `phoneCover`: la portada de la ficha móvil (MobileHeroCover en
              modo panel) de fondo de toda la tarjeta, recortada a ella. Va
              detrás de la portada (que queda como zona táctil), los botones
              y el marcador. */}
          {phoneCover && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              {!artReady && (
                <div
                  className="absolute inset-x-0 top-0 animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900"
                  style={{
                    height: geometry.posterHeight,
                    WebkitMaskImage: "var(--sv-poster-fade)",
                    maskImage: "var(--sv-poster-fade)",
                  }}
                />
              )}
              <MobileHeroCover
                inPanel
                lowSrc={posterLowSrc}
                src={posterSrc}
                onLoad={markLoaded(setLowReady, posterLowSrc)}
                ready={!!artReady}
                animate={false}
                collage={null}
                blurredUnderlay
                adaptiveContrast
              />
            </div>
          )}

          {/* Portada con su logo. Tocarla abre la ficha completa. */}
          <button
            ref={coverRef}
            data-peek-cover=""
            data-peek-full-poster={cover ? undefined : ""}
            type="button"
            onClick={handleOpenFull}
            aria-label={title ? `Abrir la ficha de ${title}` : "Abrir la ficha"}
            className="relative block w-full overflow-hidden bg-transparent text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-yellow-400"
            style={{ height: geometry.posterHeight }}
          >
            {/* El pie se funde con el cristal de la tarjeta con una máscara
                (`sv-preview-fade`, la curva del hero de la ficha rápida), no
                con un velo negro: el velo acababa en negro sobre un cristal
                que no lo es y el corte se veía. La máscara va en cada capa
                (esqueleto, imágenes y velo del logo), no en un envoltorio: en
                un envoltorio dentro de esta tarjeta Chrome no la pintaba y la
                imagen llegaba nítida hasta el borde. */}
            <div className="absolute inset-0">
              {!artReady && !phoneCover && (
                <div className="sv-preview-fade absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />
              )}
              {/* La portada compuesta trae su propio fundido (ver `fade` en
                  EpisodeStillStack). */}
              {cover && <div className="absolute inset-0">{cover}</div>}
              {!cover && !phoneCover && posterLowSrc && (
                <img
                  key={posterLowSrc}
                  src={posterLowSrc}
                  alt=""
                  aria-hidden="true"
                  className="sv-preview-fade absolute inset-0 h-full w-full object-cover"
                  onLoad={markLoaded(setLowReady, posterLowSrc)}
                  draggable={false}
                  loading="eager"
                  fetchPriority="high"
                />
              )}
              {!cover && !phoneCover && posterSrc && (
                <img
                  key={posterSrc}
                  src={posterSrc}
                  alt={title}
                  className={`sv-preview-fade absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${
                    posterLoaded === posterSrc ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={markLoaded(setPosterLoaded, posterSrc)}
                  draggable={false}
                  loading="eager"
                  fetchPriority="high"
                />
              )}
              {logo && (
                <div
                  ref={logoShadeRef}
                  className="sv-preview-fade pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.6),rgba(0,0,0,0.25)_20%,transparent_40%)]"
                />
              )}
            </div>
            {logo && (
              <div
                ref={logoRef}
                data-peek-part="logo"
                className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-5 pb-3 text-center"
              >
                {logo}
              </div>
            )}
          </button>

          {/* Fila y marcador como en la ficha móvil: mismo ancho y 20px
              entre los dos. */}
          <div className="relative px-2.5 pb-2.5 pt-3">
            <div ref={actionsRef} data-peek-part="actions">
              {actions}
            </div>
            <div ref={scoreboardRef} data-peek-part="scoreboard" className="mt-5">
              {scoreboard}
            </div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
