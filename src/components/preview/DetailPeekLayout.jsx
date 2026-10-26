"use client";

// /src/components/preview/DetailPeekLayout.jsx
// La TARJETA FLOTANTE de la vista previa de pulsación larga (ver
// MobileTitlePeek): portada, fila de botones y marcador, con la página
// difuminada detrás. La rellenan la ficha rápida (DetailModal en modo `peek`,
// películas, series y episodios) y la vista previa de temporada (SeasonPeek).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, usePresence, useReducedMotion } from "framer-motion";

import { LIQUID_GLASS_DETAIL_SURFACE } from "@/lib/ui/liquidGlass";

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
// La tarjeta no crece hasta tener la portada cargada (ver DetailPeekLayout);
// si tarda más que esto, se abre igualmente con el esqueleto.
const PEEK_ART_MAX_WAIT_MS = 1500;

function peekGeometry() {
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height || window.innerHeight;
  const width = Math.min(PEEK_MAX_WIDTH, vw - PEEK_SIDE_GUTTER * 2);
  const posterHeight = Math.max(
    180,
    Math.min(Math.round(width * 1.5), vh - PEEK_CHROME_HEIGHT),
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
const PEEK_EXIT_MS = 220;
const PEEK_EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";
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
  logo,
  actions,
  scoreboard,
  onBackdropPointerDown,
  onBackdropPointerCancel,
  onBackdropClick,
  onOpenFull,
  scrollRef,
  children,
}) {
  const reduceMotion = useReducedMotion();
  const [geometry] = useState(peekGeometry);
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
    const exit = card.animate(
      [
        { transform: current.transform, opacity: current.opacity },
        { transform: fromCss, opacity: 0 },
      ],
      {
        duration: reduceMotion ? 120 : PEEK_EXIT_MS,
        easing: PEEK_EXIT_EASING,
        fill: "forwards",
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
          className={`pointer-events-auto relative max-h-[calc(100svh-2rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-[1.75rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${LIQUID_GLASS_DETAIL_SURFACE}`}
          style={{
            width: geometry.width,
            transformOrigin: "50% 50%",
            // Estado final en cuanto se muestra: la animación de entrada
            // (ver el efecto de arriba) parte de la tarjeta pulsada.
            transform: shown ? "none" : fromCss,
            opacity: shown ? 1 : 0,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Portada con su logo. Tocarla abre la ficha completa. */}
          <button
            type="button"
            onClick={onOpenFull}
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
              {!artReady && (
                <div className="sv-preview-fade absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />
              )}
              {/* La portada compuesta trae su propio fundido (ver `fade` en
                  EpisodeStillStack). */}
              {cover && <div className="absolute inset-0">{cover}</div>}
              {!cover && posterLowSrc && (
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
              {!cover && posterSrc && (
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
                <div className="sv-preview-fade pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.6),rgba(0,0,0,0.25)_20%,transparent_40%)]" />
              )}
            </div>
            {logo && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-5 pb-3 text-center">
                {logo}
              </div>
            )}
          </button>

          {/* Fila y marcador como en la ficha móvil: mismo ancho y 20px
              entre los dos. */}
          <div className="px-2.5 pb-2.5 pt-3">
            {actions}
            <div className="mt-5">{scoreboard}</div>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
