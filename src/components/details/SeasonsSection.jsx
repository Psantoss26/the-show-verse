"use client";

// Sección «Temporadas» de la ficha completa (DetailsClient), con dos vistas:
//   - Tarjetas: las tarjetas completas (SeasonCard) en rejilla, como máximo
//     dos filas (6 temporadas) y un botón para ver el resto.
//   - Pósters: solo el póster de cada temporada en fila horizontal, como los
//     carruseles de Reparto y Recomendaciones.
//
// La vista elegida y el desplegado viven AQUÍ y no en DetailsClient: cambiar
// de vista solo re-renderiza esta sección, no la ficha entera. La vista se
// recuerda en el navegador.
//
// Cambio de vista animado (Web Animations API, sin Framer: ver FadePresence):
// la vista actual se apaga, la sección pasa de su altura a la de la nueva
// vista sin saltos y las temporadas de la nueva entran en cascada. El selector
// cambia al momento; la vista pintada (`shownView`) cambia al terminar la
// salida. Con movimiento reducido el cambio es directo.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { SwiperSlide } from "swiper/react";
import { ChevronDown, ChevronUp, GalleryHorizontalEnd, Layers, LayoutGrid, Loader2 } from "lucide-react";
import DetailsArrowCarousel from "@/components/details/DetailsArrowCarousel";
import SectionTitle from "@/components/details/SectionTitle";
import SeasonCard, { SeasonPosterCard } from "@/components/details/SeasonCard";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_BAR } from "@/lib/ui/liquidGlass";

const VIEW_KEY = "showverse:details:seasonsView";
const VIEWS = [
  { id: "cards", label: "Tarjetas", icon: LayoutGrid },
  { id: "posters", label: "Pósters", icon: GalleryHorizontalEnd },
];
// Dos filas de la rejilla de escritorio (3 columnas).
const COLLAPSED_CARDS = 6;
const MOBILE_QUERY = "(max-width: 640px)";

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const EXIT_MS = 160;
const HEIGHT_MS = 360;
const ENTER_MS = 380;
const ENTER_STAGGER_MS = 35;
// Solo escalonan las primeras: las que quedan fuera de la fila o de la
// pantalla entran con la última, sin alargar el cambio.
const ENTER_STAGGER_MAX = 6;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function subscribeMobile(callback) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia(MOBILE_QUERY);
  if (media.addEventListener) {
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
  }
  media.addListener(callback);
  return () => media.removeListener(callback);
}

function getMobileSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function readSavedView() {
  try {
    const saved = window.localStorage.getItem(VIEW_KEY);
    return VIEWS.some((view) => view.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

export function computeDefaultSeasonsView(itemsCount, isMobile) {
  // Serie con 1 sola temporada: vista de recuadro ("cards") tanto en móvil como en escritorio.
  if (itemsCount === 1) return "cards";
  // Serie con 2 o 3 temporadas en escritorio: recuadros ("cards") para aprovechar el ancho horizontal.
  if (!isMobile && (itemsCount === 2 || itemsCount === 3)) return "cards";
  // En móvil con más de 1 temporada: por defecto carrusel de pósters ("posters").
  if (isMobile) return "posters";
  // Series de más de 3 temporadas en escritorio: preferencia guardada o pósters por defecto.
  const saved = readSavedView();
  return saved || "posters";
}

export default function SeasonsSection({
  items = [],
  loading = false,
  onOpenAll,
  phoneLayout = false,
  isMobile: isMobileProp,
}) {
  const isMobileViewport = useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    () => false,
  );
  const isMobile = Boolean(phoneLayout || isMobileProp || isMobileViewport);

  const [view, setView] = useState(() =>
    computeDefaultSeasonsView(items.length, isMobile),
  );
  // Vista pintada: va detrás de `view` mientras dura la salida de la anterior.
  const [shownView, setShownView] = useState(view);
  const [swapCount, setSwapCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef(null);
  const contentRef = useRef(null);
  // Cambio en curso: altura de partida y animaciones vivas (para cortarlas si
  // se vuelve a pulsar antes de que acabe).
  const transitionRef = useRef({ token: 0, fromHeight: null, animations: [] });

  const seriesSignature = items.map((s) => s.seasonId ?? s.seasonNumber ?? s.key).join(",");

  // Tras montar o cambiar de serie/viewport:
  // - Si tiene 1 temporada: vista de recuadro ("cards") en móvil y en escritorio.
  // - Si tiene 2 o 3 temporadas en escritorio: recuadros ("cards") para llenar las columnas.
  // - En móvil con más de 1 temporada: pósters en carrusel horizontal ("posters").
  // - Para series de más de 3 temporadas en escritorio: preferencia guardada o "posters".
  useEffect(() => {
    const next = computeDefaultSeasonsView(items.length, isMobile);
    // Vista por defecto (montaje, otra serie, otro viewport): sin animación.
    stopTransition();
    setView(next);
    setShownView(next);
  }, [isMobile, items.length, seriesSignature]);

  function stopTransition() {
    const current = transitionRef.current;
    current.token += 1;
    current.fromHeight = null;
    current.animations.forEach((animation) => animation.cancel());
    current.animations = [];
    if (wrapperRef.current) wrapperRef.current.style.overflow = "";
  }

  // Entrada de la vista nueva: corre antes de pintar, así que el primer
  // fotograma ya sale con las temporadas ocultas y la altura de partida.
  useLayoutEffect(() => {
    const current = transitionRef.current;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (current.fromHeight == null || !wrapper || !content) return;
    const fromHeight = current.fromHeight;
    current.fromHeight = null;
    // La salida dejó el contenido a opacidad 0 y la altura fija (`fill: forwards`).
    current.animations.forEach((animation) => animation.cancel());
    current.animations = [];

    const toHeight = content.getBoundingClientRect().height;
    const animations = [];
    if (Math.abs(toHeight - fromHeight) > 1) {
      // Mientras cambia de altura se recorta (el carrusel de pósters es
      // `overflow-visible`); al terminar vuelve a su altura natural.
      wrapper.style.overflow = "hidden";
      animations.push(
        wrapper.animate([{ height: `${fromHeight}px` }, { height: `${toHeight}px` }], {
          duration: HEIGHT_MS,
          easing: EASE_OUT,
        }),
      );
    }
    content.querySelectorAll("[data-season-item]").forEach((item, index) => {
      animations.push(
        item.animate(
          [
            { opacity: 0, transform: "translateY(10px) scale(0.96)", filter: "blur(4px)" },
            { opacity: 1, transform: "none", filter: "blur(0px)" },
          ],
          {
            duration: ENTER_MS,
            delay: Math.min(index, ENTER_STAGGER_MAX) * ENTER_STAGGER_MS,
            easing: EASE_OUT,
            fill: "backwards",
          },
        ),
      );
    });
    current.animations = animations;
    const token = current.token;
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        if (transitionRef.current.token !== token) return;
        transitionRef.current.animations = [];
        wrapper.style.overflow = "";
      })
      .catch(() => {
        // Cancelada por otro cambio: ese limpia.
      });
  }, [shownView, swapCount]);

  const chooseView = (next) => {
    // Ya es la vista elegida (pintada o entrando).
    if (next === view) return;
    setView(next);
    const content = contentRef.current;
    if (!content || !wrapperRef.current || prefersReducedMotion() || typeof content.animate !== "function") {
      stopTransition();
      setShownView(next);
    } else {
      // Salida: la vista actual (o la que estaba entrando) se apaga en su sitio.
      const wrapper = wrapperRef.current;
      const fromHeight = wrapper.getBoundingClientRect().height;
      stopTransition();
      wrapper.style.overflow = "hidden";
      const exit = content.animate(
        [
          { opacity: 1, transform: "none", filter: "blur(0px)" },
          { opacity: 0, transform: "scale(0.98)", filter: "blur(4px)" },
        ],
        { duration: EXIT_MS, easing: EASE_IN, fill: "forwards" },
      );
      // Durante la salida la altura no se mueve.
      const hold = wrapper.animate([{ height: `${fromHeight}px` }, { height: `${fromHeight}px` }], {
        duration: EXIT_MS,
        fill: "forwards",
      });
      const current = transitionRef.current;
      current.animations = [exit, hold];
      const token = current.token;
      exit.finished
        .then(() => {
          if (transitionRef.current.token !== token) return;
          // Altura de partida para la entrada. La salida (opacidad 0) y la
          // altura fija siguen aplicadas hasta que las cancele el efecto de
          // entrada, en el mismo fotograma en que pinta la vista nueva.
          transitionRef.current.fromHeight = fromHeight;
          setShownView(next);
          // Vuelta a la vista que se estaba apagando: no cambia `shownView`,
          // pero la entrada tiene que correr igual.
          setSwapCount((count) => count + 1);
        })
        .catch(() => {
          // Cancelada por otro cambio.
        });
    }
    // Solo guardamos en localStorage para series de más de 3 temporadas en escritorio,
    // garantizando que las series de 1-3 temporadas abran siempre en recuadros en escritorio.
    if (!isMobile && items.length > 3) {
      try {
        window.localStorage.setItem(VIEW_KEY, next);
      } catch {
        // Sin almacenamiento: la vista vale para esta visita.
      }
    }
  };

  const hiddenCount = Math.max(0, items.length - COLLAPSED_CARDS);
  const visibleCards = expanded ? items : items.slice(0, COLLAPSED_CARDS);

  return (
    <section className={`${phoneLayout ? "" : "mb-12"} group/section`}>
      <div className={`flex w-full items-start justify-between gap-3 ${phoneLayout ? "flex-wrap" : ""}`}>
        <SectionTitle
          title="Temporadas"
          icon={Layers}
          onOpen={onOpenAll}
          className={`!mb-5 sm:!mb-8 !w-auto flex-1 min-w-0 pr-4 sm:pr-6 ${phoneLayout ? "basis-64 [&>div:last-child]:overflow-hidden" : ""}`}
        />
        <div
          role="group"
          aria-label="Vista de las temporadas"
          className={`relative isolate flex shrink-0 items-center gap-1 self-start overflow-hidden rounded-full p-1 ${LIQUID_GLASS_BAR}`}
        >
          {/* Mismo selector solo de iconos que el de episodios de SeasonDetails. */}
          <LiquidGlassOpticalLayers />
          {VIEWS.map((option) => {
            const Icon = option.icon;
            const active = view === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseView(option.id)}
                aria-pressed={active}
                aria-label={`Vista ${option.label.toLowerCase()}`}
                title={`Vista ${option.label.toLowerCase()}`}
                className={[
                  "relative z-10 grid h-9 w-9 place-items-center rounded-full transition-[color,background-color,box-shadow,transform] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-300",
                  active
                    ? "bg-white/[0.16] text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.9)]"
                    : phoneLayout
                      ? "text-white/65"
                      : "text-white/65 hover:bg-white/[0.08] hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-white/50" aria-label="Cargando temporadas" />
        </div>
      ) : (
      <div ref={wrapperRef}>
      <div ref={contentRef}>
      {shownView === "posters" ? (
        <DetailsArrowCarousel
          spaceBetween={12}
          slidesPerView={3}
          breakpointsBase={phoneLayout ? "container" : "window"}
          showArrows={!phoneLayout}
          observeParents={!phoneLayout}
          breakpoints={phoneLayout ? { 480: { slidesPerView: 3, spaceBetween: 14 } } : {
            500: { slidesPerView: 3, spaceBetween: 14 },
            768: { slidesPerView: 4, spaceBetween: 16 },
            1024: { slidesPerView: 5, spaceBetween: 18 },
            1280: { slidesPerView: 6, spaceBetween: 20 },
          }}
          className={phoneLayout ? "pb-2" : "pb-8 !overflow-visible"}
        >
          {items.map(({ key, ...season }) => (
            <SwiperSlide key={key}>
              {/* Vista de teléfono del modal lateral: sin hover, como el
                  resto de secciones (el diseño que se replica es el táctil). */}
              <div data-season-item>
                <SeasonPosterCard {...season} enableHover={!phoneLayout} />
              </div>
            </SwiperSlide>
          ))}
        </DetailsArrowCarousel>
      ) : (
        <>
          <div className={`grid grid-cols-1 gap-4 ${phoneLayout ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {visibleCards.map(({ key, ...season }) => (
              <div key={key} data-season-item>
                <SeasonCard {...season} enableHover={!phoneLayout} />
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 px-5 text-sm font-bold text-zinc-200 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] backdrop-blur-[50px] transition ${phoneLayout ? "" : "hover:text-white"} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400`}
              >
                {expanded ? (
                  <>
                    Ver menos
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Ver {hiddenCount} {hiddenCount === 1 ? "temporada más" : "temporadas más"}
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
      </div>
      </div>
      )}
    </section>
  );
}
