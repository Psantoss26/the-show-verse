"use client";

// Vista previa del resumen anual para el lateral del propio Perfil: una
// "story" en miniatura con tres fotogramas que se van turnando (el tiempo
// total sobre un muro de pósters, la serie o película del año sobre su fondo y
// el perfil de espectador), con las barras de progreso de las stories. Al
// pulsarla se abre /recap, que reutiliza la misma petición (recapCache).
//
// Solo pide datos cuando el bloque llega a verse, y solo rota mientras se ve y
// sin prefers-reduced-motion.

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import { fetchRecap, getCachedRecap } from "@/lib/recap/recapCache";
import { formatNumber, tmdbImg } from "@/lib/recap/recapModel";
import { ANTON, recapStyles as styles } from "./recapUi";

// Debe coincidir con la duración de .previewFill en recap.module.css.
const FRAME_MS = 3800;
const DISPLAY = "uppercase leading-[0.88]";

function useInView(ref) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

function MinutesFrame({ recap }) {
  const posters = (recap.posterWall || []).slice(0, 12);
  const column = posters.length ? [...posters, ...posters] : [];
  return (
    <div className="absolute inset-0 bg-[#c6f432] text-[#0b0b0b]">
      {column.length ? (
        <div aria-hidden="true" className="absolute -right-3 -top-6 bottom-0 w-[38%] rotate-[8deg] overflow-hidden">
          <div className={`flex flex-col gap-1.5 ${styles.columnUp}`}>
            {column.map((poster, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${poster.key}-${index}`}
                src={tmdbImg(poster.posterPath, "w154")}
                alt=""
                loading="lazy"
                draggable={false}
                className="aspect-[2/3] w-full rounded-[5px] object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="absolute inset-y-0 left-0 flex w-[66%] flex-col justify-end p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Tu {recap.year}</p>
        <p className={`${DISPLAY} mt-1 text-[40px]`} style={ANTON}>{formatNumber(recap.totals.minutes)}</p>
        <p className="text-xs font-bold">minutos viendo películas y series</p>
      </div>
    </div>
  );
}

function TitleFrame({ recap }) {
  const show = recap.shows?.top?.[0];
  const movie = recap.movies?.top?.[0];
  const title = show || movie;
  if (!title) return <MinutesFrame recap={recap} />;
  const src = tmdbImg(title.backdropPath, "w780") || tmdbImg(title.posterPath, "w500");
  return (
    <div className="absolute inset-0 bg-[#050505] text-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} className={`absolute inset-0 h-full w-full object-cover ${styles.kenBurns}`} />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffd23f]">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {show ? "Tu serie del año" : "Tu película del año"}
        </p>
        <p className={`${DISPLAY} mt-1 line-clamp-2 text-[30px]`} style={ANTON}>{title.title}</p>
        {show ? (
          <p className="mt-0.5 text-xs font-bold text-white/75">
            {formatNumber(show.episodes)} episodios · {formatNumber(Math.round(show.minutes / 60))} h
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PersonaFrame({ recap }) {
  const persona = recap.persona;
  if (!persona) return <MinutesFrame recap={recap} />;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#ff4fa3] text-[#1a0010]">
      <div aria-hidden="true" className={`absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 ${styles.aura}`}>
        <div className="h-full w-full rounded-full opacity-80 blur-[28px]" style={{ background: "conic-gradient(from 0deg, #ffe14d, #5b2bff, #ff6b1a, #ffe14d)" }} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">En {recap.year} fuiste</p>
        <p className={`${DISPLAY} mt-1 text-[34px]`} style={ANTON}>{persona.name}</p>
        <p className="mt-1 text-xs font-bold">{persona.tagline}</p>
      </div>
    </div>
  );
}

const FRAMES = [MinutesFrame, TitleFrame, PersonaFrame];

export default function RecapPreviewCard({ renderHeader }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  const [recap, setRecap] = useState(() => getCachedRecap());
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!inView || recap || failed) return undefined;
    const controller = new AbortController();
    fetchRecap(null, { signal: controller.signal })
      .then(({ status, data }) => {
        if (status === 200 && data) setRecap(data);
        else setFailed(true);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [inView, recap, failed]);

  const playing = inView && !reduce && !hovered && Boolean(recap) && !recap?.empty;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setFrame((value) => (value + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [playing]);

  // Sin datos del año (o sin sesión), el bloque no aparece.
  if (failed || recap?.empty) return null;

  const Frame = FRAMES[frame];
  const year = recap?.year || new Date().getFullYear();

  return (
    <section ref={ref}>
      {renderHeader?.(year)}
      <Link
        href={recap?.year ? `/recap/${recap.year}` : "/recap"}
        aria-label={`Ver tu ${year} en The Show Verse`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="group relative block h-56 w-full overflow-hidden rounded-2xl bg-white/[0.03] transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300/80"
      >
        {recap ? (
          <>
            <AnimatePresence initial={false}>
              <motion.div
                key={frame}
                className="absolute inset-0"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <Frame recap={recap} />
              </motion.div>
            </AnimatePresence>

            {/* Barras de story: la activa se llena mientras dura su fotograma. */}
            <div aria-hidden="true" className="absolute inset-x-3 top-3 flex gap-1">
              {FRAMES.map((_, index) => (
                <span key={index} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/40">
                  <span
                    key={index === frame ? `active-${frame}` : `idle-${index}`}
                    className={`block h-full origin-left rounded-full bg-white ${index === frame && playing ? styles.previewFill : ""}`}
                    style={{ transform: `scaleX(${index < frame || (index === frame && !playing) ? 1 : 0})` }}
                  />
                </span>
              ))}
            </div>

            <span aria-hidden="true" className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#0b0b0b] text-[#c6f432] shadow-lg transition-transform duration-300 group-hover:scale-110">
              <Play className="h-4 w-4 translate-x-px fill-current" />
            </span>
          </>
        ) : (
          <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
        )}
      </Link>
      {recap ? (
        <p className="mt-2 text-center text-[11px] font-semibold text-zinc-500">
          {formatNumber(recap.totals.titles)} títulos · {recap.genres?.top?.[0]?.name || "—"} · con banda sonora
        </p>
      ) : null}
    </section>
  );
}
