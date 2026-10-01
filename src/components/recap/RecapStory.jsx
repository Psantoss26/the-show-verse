"use client";

// Reproductor tipo "stories" de "Tu año en The Show Verse".
//
// Controles (los de Instagram/Wrapped, más teclado):
//   - tocar el tercio izquierdo / el resto del marco: anterior / siguiente;
//   - mantener pulsado: pausa mientras dure la pulsación;
//   - ← →, Espacio (pausa), M (sonido), Esc (cerrar).
// Con prefers-reduced-motion no hay avance automático: se pasa a mano.
//
// El progreso de la pantalla activa se pinta escribiendo el transform de la
// barra en cada fotograma, sin re-renderizar React 60 veces por segundo.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import useBodyScrollLock from "@/hooks/useBodyScrollLock";
import {
  RECAP_THEMES,
  backgroundArt,
  backgroundUrl,
  buildRecapSlides,
  soundtrackSubjects,
  tmdbImg,
} from "@/lib/recap/recapModel";
import { SLIDE_COMPONENTS } from "./RecapSlides";
import { ANTON, Equalizer, Grain, recapStyles as styles } from "./recapUi";
import useRecapSoundtrack from "./useRecapSoundtrack";

const HOLD_MS = 220;
const MUTE_KEY = "showverse:recap:muted";

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveMuted(value) {
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* almacenamiento bloqueado: se queda en memoria */
  }
}

function preload(urls) {
  for (const url of urls) {
    if (!url) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}

// Datos mínimos para la imagen compartible (/api/recap/card).
function cardPayload(recap, user) {
  const pick = (item) => ({ title: item.title, posterPath: item.posterPath || null });
  return {
    year: recap.year,
    username: user?.username || "",
    name: user?.name || user?.username || "",
    persona: recap.persona?.name || "",
    minutes: recap.totals.minutes,
    titles: recap.totals.titles,
    genre: recap.genres?.top?.[0]?.name || "",
    shows: recap.shows.top.slice(0, 5).map(pick),
    movies: recap.movies.top.slice(0, 5).map(pick),
    // Fondo de la cabecera: arte sin idioma del título del año.
    backgroundPath: backgroundArt(recap.topTitle)?.path || null,
  };
}

const slideVariants = {
  enter: (direction) => ({ x: `${direction * 14}%`, scale: 0.94, opacity: 0 }),
  center: { x: "0%", scale: 1, opacity: 1 },
  exit: (direction) => ({ x: `${direction * -14}%`, scale: 0.94, opacity: 0 }),
};

const reducedVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function RecapStory({ recap, user, onClose }) {
  const reduceMotion = useReducedMotion();
  const slides = useMemo(() => buildRecapSlides(recap), [recap]);
  const subjects = useMemo(() => soundtrackSubjects(recap, slides), [recap, slides]);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [started, setStarted] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [muted, setMuted] = useState(false);
  const [shareState, setShareState] = useState("idle");
  const [songOpen, setSongOpen] = useState(false);

  const slide = slides[index] || slides[0];
  const theme = RECAP_THEMES[slide?.theme] || RECAP_THEMES.night;
  const Component = SLIDE_COMPONENTS[slide?.id];
  const autoplay = started && !reduceMotion && Boolean(slide?.duration);
  const paused = userPaused || holding || hidden;

  const fillRef = useRef(null);
  const elapsed = useRef(0);
  const frameRef = useRef(null);
  const press = useRef(null);
  const closeRef = useRef(null);

  useBodyScrollLock(true);

  useEffect(() => {
    setMuted(readMuted());
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  // Precarga de lo que más pesa: fondos y pósters de los tops.
  useEffect(() => {
    preload([
      backgroundUrl(recap.shows?.top?.[0]),
      backgroundUrl(recap.movies?.top?.[0]),
      ...(recap.shows?.top || []).map((s) => tmdbImg(s.posterPath, "w342")),
      ...(recap.movies?.top || []).map((m) => tmdbImg(m.posterPath, "w342")),
    ]);
  }, [recap]);

  const { nowPlaying, playing, unlock } = useRecapSoundtrack({
    subjects,
    activeKey: slide?.sound || null,
    enabled: started,
    muted,
    upcomingKeys: slides.slice(index + 1, index + 3).map((item) => item.sound),
  });

  // La canción desplegada se recoge sola a los pocos segundos (y vuelve a
  // contar si cambia la canción mientras está abierta).
  useEffect(() => {
    if (!songOpen) return undefined;
    const timer = setTimeout(() => setSongOpen(false), 6000);
    return () => clearTimeout(timer);
  }, [songOpen, nowPlaying?.key]);

  const goTo = useCallback(
    (next) => {
      setIndex((current) => {
        const target = Math.max(0, Math.min(slides.length - 1, typeof next === "function" ? next(current) : next));
        if (target !== current) setDirection(target > current ? 1 : -1);
        return target;
      });
      elapsed.current = 0;
    },
    [slides.length],
  );

  const start = useCallback(() => {
    setStarted(true);
    unlock();
    goTo(1);
  }, [goTo, unlock]);

  const next = useCallback(() => {
    if (!started) {
      start();
      return;
    }
    goTo((current) => current + 1);
  }, [goTo, start, started]);

  const prev = useCallback(() => goTo((current) => current - 1), [goTo]);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      saveMuted(!value);
      return !value;
    });
  }, []);

  // Temporizador de la pantalla activa.
  useEffect(() => {
    const fill = fillRef.current;
    if (fill) {
      const shown = autoplay ? Math.min(1, elapsed.current / slide.duration) : index === 0 && !started ? 0 : 1;
      fill.style.transform = `scaleX(${shown})`;
    }
    if (!autoplay || paused) return undefined;
    let last = performance.now();
    const tick = (now) => {
      elapsed.current += now - last;
      last = now;
      const progress = Math.min(1, elapsed.current / slide.duration);
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
      if (progress >= 1) {
        if (index < slides.length - 1) goTo(index + 1);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [autoplay, paused, index, slide, slides.length, goTo, started]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Teclado.
  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      const onControl = tag === "BUTTON" || tag === "A";
      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          prev();
          break;
        case " ":
          if (onControl) return;
          event.preventDefault();
          if (!started) start();
          else setUserPaused((value) => !value);
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, start, started, toggleMute, onClose]);

  // Toques: izquierda/derecha y mantener pulsado.
  const isInteractive = (target) => Boolean(target?.closest?.("[data-recap-interactive], button, a, input"));

  const onPointerDown = (event) => {
    if (event.button !== 0 || isInteractive(event.target)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    press.current = {
      x: event.clientX - rect.left,
      width: rect.width,
      held: false,
      timer: setTimeout(() => {
        if (press.current) press.current.held = true;
        setHolding(true);
      }, HOLD_MS),
    };
  };

  const endPress = (event, cancelled = false) => {
    const current = press.current;
    press.current = null;
    if (!current) return;
    clearTimeout(current.timer);
    if (current.held) {
      setHolding(false);
      return;
    }
    if (cancelled || isInteractive(event?.target)) return;
    if (current.x < current.width * 0.3) prev();
    else next();
  };

  const onShare = useCallback(
    async (mode) => {
      setShareState("working");
      try {
        const res = await fetch("/api/recap/card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cardPayload(recap, user)),
        });
        if (!res.ok) throw new Error(`card ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], `mi-${recap.year}-the-show-verse.png`, { type: "image/png" });
        if (mode === "share" && navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Mi ${recap.year} en The Show Verse`,
            text: `Mi ${recap.year} en The Show Verse: ${recap.persona?.name || ""}`.trim(),
          });
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        setShareState("done");
      } catch (error) {
        setShareState(error?.name === "AbortError" ? "idle" : "error");
      }
    },
    [recap, user],
  );

  if (!slide || !Component) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tu ${recap.year} en The Show Verse`}
      className="fixed inset-0 z-[2147483000] flex items-center justify-center overflow-hidden bg-black text-white"
    >
      {/* Fondo ambiental del escritorio: el color de la pantalla activa. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-[background-color] duration-700"
        style={{ backgroundColor: theme.bg }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/55" />

      <div className="relative">
        {/* Flechas del escritorio, fuera del marco. */}
        <button
          type="button"
          onClick={prev}
          disabled={index === 0}
          aria-label="Pantalla anterior"
          className="absolute -left-20 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-0 sm:flex"
        >
          <ChevronLeft aria-hidden="true" className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={next}
          disabled={index === slides.length - 1}
          aria-label="Pantalla siguiente"
          className="absolute -right-20 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-0 sm:flex"
        >
          <ChevronRight aria-hidden="true" className="h-6 w-6" />
        </button>

        {/* Escritorio: el marco 9:16 ocupa el alto de la ventana (40 px de
            margen arriba y abajo) y, si la ventana es estrecha, el ancho que dejan libres las
            flechas laterales (100 px a cada lado). */}
        <div
          className={`${styles.frame} relative h-[100svh] w-screen touch-manipulation select-none overflow-hidden sm:h-[min(calc(100svh-80px),calc((100vw-200px)*16/9))] sm:w-[min(calc((100svh-80px)*9/16),calc(100vw-200px))] sm:rounded-[28px] sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]`}
          onPointerDown={onPointerDown}
          onPointerUp={(event) => endPress(event)}
          onPointerCancel={(event) => endPress(event, true)}
          onPointerLeave={(event) => press.current && endPress(event, true)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.section
              key={slide.id}
              custom={direction}
              variants={reduceMotion ? reducedVariants : slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduceMotion ? 0.2 : 0.55, ease: [0.22, 1, 0.36, 1] }}
              aria-roledescription="diapositiva"
              aria-label={`${index + 1} de ${slides.length}: ${slide.label}`}
              className="absolute inset-0 overflow-hidden"
              style={{ background: theme.bg, color: theme.fg }}
            >
              <Component
                recap={recap}
                theme={theme}
                user={user}
                started={started}
                onStart={start}
                muted={muted}
                onToggleMute={toggleMute}
                onReplay={() => goTo(1)}
                onShare={onShare}
                shareState={shareState}
              />
              <Grain />
            </motion.section>
          </AnimatePresence>

          {/* Cabecera: progreso, marca y controles. */}
          {/* En las pantallas claras la cabecera toma el color oscuro de la
              pantalla; en las oscuras, blanco sobre un velo. */}
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pb-6 pt-[max(10px,env(safe-area-inset-top))] transition-colors duration-500 ${theme.light ? "" : "bg-gradient-to-b from-black/40 to-transparent"}`}
            style={{ color: theme.light ? theme.fg : "#fff" }}
          >
            <div className="flex gap-1" aria-hidden="true">
              {slides.map((item, i) => (
                // La clave cambia con el estado del segmento: al volver atrás, el
                // segmento que el temporizador había pintado se monta de nuevo vacío.
                <span
                  key={`${item.id}-${i < index ? "done" : i === index ? "active" : "todo"}`}
                  className="h-[3px] flex-1 overflow-hidden rounded-full"
                  style={{ background: "color-mix(in srgb, currentColor 30%, transparent)" }}
                >
                  <span
                    ref={i === index ? fillRef : undefined}
                    className="block h-full origin-left rounded-full"
                    style={{ background: "currentColor", transform: `scaleX(${i < index ? 1 : 0})` }}
                  />
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <p className={`min-w-0 flex-1 truncate text-[13px] font-bold ${theme.light ? "" : "drop-shadow"}`}>
                <span style={ANTON} className="mr-1.5 text-[15px] uppercase tracking-wide">The Show Verse</span>
                <span className="opacity-80">{recap.year}</span>
              </p>
              {started && nowPlaying && !muted ? (
                // Solo el ecualizador animado; la canción se despliega al pulsarlo.
                <button
                  type="button"
                  onClick={() => setSongOpen((value) => !value)}
                  aria-expanded={songOpen}
                  aria-label={songOpen ? "Ocultar la canción que suena" : "Ver la canción que suena"}
                  className={`pointer-events-auto flex h-9 min-w-9 max-w-[min(58cqw,260px)] items-center justify-center gap-2 overflow-hidden rounded-full px-[11px] text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-current ${theme.light ? "bg-black/10 hover:bg-black/20" : "bg-black/30 hover:bg-black/50"}`}
                >
                  <Equalizer playing={playing && !paused} />
                  <AnimatePresence initial={false}>
                    {songOpen ? (
                      <motion.span
                        key={nowPlaying.key}
                        initial={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
                        animate={reduceMotion ? { opacity: 1 } : { width: "auto", opacity: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        className="min-w-0 truncate whitespace-nowrap text-left"
                      >
                        {nowPlaying.trackName}
                        <span className="font-normal opacity-75"> · {nowPlaying.titleName}</span>
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </button>
              ) : null}
              {started && slide.duration && !reduceMotion ? (
                <button
                  type="button"
                  onClick={() => setUserPaused((value) => !value)}
                  aria-label={userPaused ? "Reanudar" : "Pausar"}
                  aria-pressed={userPaused}
                  className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-current ${theme.light ? "bg-black/10 hover:bg-black/20" : "bg-black/30 hover:bg-black/50"}`}
                >
                  {userPaused ? <Play aria-hidden="true" className="h-4 w-4 fill-current" /> : <Pause aria-hidden="true" className="h-4 w-4 fill-current" />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? "Activar banda sonora" : "Silenciar banda sonora"}
                aria-pressed={muted}
                className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-current ${theme.light ? "bg-black/10 hover:bg-black/20" : "bg-black/30 hover:bg-black/50"}`}
              >
                {muted ? <VolumeX aria-hidden="true" className="h-4 w-4" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Cerrar resumen"
                className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-current ${theme.light ? "bg-black/10 hover:bg-black/20" : "bg-black/30 hover:bg-black/50"}`}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Pie: qué suena (móvil estrecho) y aviso de pausa. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(10px,env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
            <AnimatePresence>
              {paused && started && slide.duration && !hidden ? (
                <motion.span
                  key="paused"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0 }}
                  className="rounded-full bg-black/60 px-3 py-1 text-[12px] font-bold text-white"
                >
                  En pausa
                </motion.span>
              ) : started && reduceMotion && index < slides.length - 1 ? (
                <span key="manual" className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-bold text-white">
                  Toca o pulsa → para seguir
                </span>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="sr-only" aria-live="polite">{`${index + 1} de ${slides.length}: ${slide.label}`}</p>
        </div>
      </div>
    </div>
  );
}
