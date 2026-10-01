"use client";

// Vista previa del resumen anual para el lateral del propio Perfil: una
// "story" en miniatura cuyos fotogramas se van turnando (tiempo total, serie
// del año, top de series, película del año, género, cara más vista y perfil de
// espectador; solo los que tienen datos), con las barras de las stories. Al
// pulsarla se abre /recap, que reutiliza la misma petición (recapCache).
//
// Solo pide datos cuando el bloque llega a verse, y solo rota mientras se ve y
// sin prefers-reduced-motion.

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";

import { fetchRecap, getCachedRecap } from "@/lib/recap/recapCache";
import { backgroundArt, formatNumber, tmdbImg } from "@/lib/recap/recapModel";
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
  // Solo pósters sin idioma (fondo decorativo).
  const posters = (recap.posterWall || []).filter((poster) => poster.textlessPosterPath).slice(0, 12);
  // Dos columnas que suben y bajan (como el muro de la portada), con pósters
  // pequeños: en la tarjeta compacta una sola columna dejaba UN póster enorme.
  const columns = posters.length >= 2
    ? [posters.filter((_, i) => i % 2 === 0), posters.filter((_, i) => i % 2 === 1)]
    : [];
  return (
    <div className="absolute inset-0 bg-[#c6f432] text-[#0b0b0b]">
      {columns.length ? (
        <div aria-hidden="true" className="absolute -right-2 -top-8 -bottom-8 flex w-[40%] rotate-[8deg] gap-1.5">
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex-1 overflow-hidden">
              <div className={`flex flex-col gap-1.5 ${columnIndex ? styles.columnDown : styles.columnUp}`}>
                {[...column, ...column].map((poster, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${poster.key}-${index}`}
                    src={tmdbImg(poster.textlessPosterPath, "w154")}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="aspect-[2/3] w-full rounded-[5px] object-cover"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="absolute inset-y-0 left-0 flex w-[66%] flex-col justify-end p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Tu {recap.year}</p>
        <p className={`${DISPLAY} mt-0.5 text-[34px]`} style={ANTON}>{formatNumber(recap.totals.minutes)}</p>
        <p className="text-xs font-bold">minutos viendo películas y series</p>
      </div>
    </div>
  );
}

function Kicker({ children, className = "" }) {
  return (
    <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </p>
  );
}

// Fotograma de UN título sobre su arte de fondo, siempre SIN idioma. La
// tarjeta es apaisada, así que aquí manda el fondo (backdrop) textless; el
// póster textless queda de respaldo. (La experiencia completa, vertical,
// prefiere el póster: backgroundArt.)
function TitleFrame({ card, kicker, detail }) {
  const art = card?.textlessBackdropPath
    ? { kind: "backdrop", path: card.textlessBackdropPath }
    : backgroundArt(card);
  const src = art ? tmdbImg(art.path, art.kind === "poster" ? "w500" : "w780") : null;
  return (
    <div className="absolute inset-0 bg-[#050505] text-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" draggable={false} className={`absolute inset-0 h-full w-full object-cover ${art?.kind === "poster" ? "object-[50%_22%]" : ""} ${styles.kenBurns}`} />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 p-3.5 pr-14">
        <Kicker className="text-[#ffd23f]">{kicker}</Kicker>
        <p className="mt-0.5 line-clamp-1 text-[26px] uppercase leading-[1.1]" style={ANTON}>{card.title}</p>
        {detail ? <p className="mt-0.5 text-xs font-bold text-white/75">{detail}</p> : null}
      </div>
    </div>
  );
}

function ShowFrame({ recap }) {
  const show = recap.shows.top[0];
  return (
    <TitleFrame
      card={show}
      kicker="Tu serie del año"
      detail={`${formatNumber(show.episodes)} episodios · ${formatNumber(Math.round(show.minutes / 60))} h`}
    />
  );
}

function MovieFrame({ recap }) {
  const movie = recap.movies.top[0];
  const detail = [
    movie.rating ? `★ ${movie.rating}` : null,
    movie.year,
    movie.plays > 1 ? `${movie.plays} veces` : null,
  ].filter(Boolean).join(" · ");
  return <TitleFrame card={movie} kicker="Tu película del año" detail={detail} />;
}

// Tu top 5 de series: los pósters en fila con su número, estilo ranking.
function TopShowsFrame({ recap }) {
  const shows = recap.shows.top.slice(0, 5);
  return (
    <div className="absolute inset-0 bg-[#0c1846] px-3.5 pb-3.5 pt-7 text-white">
      <Kicker className="text-[#ff4fa3]">Tus series más vistas</Kicker>
      <ol className="mt-2 grid grid-cols-5 gap-1.5 pr-10">
        {shows.map((show, index) => (
          <li key={show.key} className="relative">
            {show.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tmdbImg(show.posterPath, "w154")} alt="" draggable={false} className="aspect-[2/3] w-full rounded-[5px] object-cover shadow-lg" />
            ) : (
              <div className="aspect-[2/3] w-full rounded-[5px] bg-white/10" />
            )}
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -left-0.5 text-[24px] leading-none"
              style={{ ...ANTON, color: index ? "#ffffff" : "#ff4fa3", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
            >
              {index + 1}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Tu género: el nombre en grande y sus pósters en abanico.
function GenreFrame({ recap }) {
  const genre = recap.genres.top[0];
  const covers = (genre.covers || []).filter((cover) => cover.posterPath).slice(0, 4);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#ff4fa3] text-[#1a0010]">
      <div aria-hidden="true" className="absolute -right-2 top-5 h-[150px] w-[46%]">
        {covers.map((cover, index) => {
          const offset = index - (covers.length - 1) / 2;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={cover.key}
              src={tmdbImg(cover.posterPath, "w154")}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-2 w-[52%] rounded-[6px] object-cover shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)]"
              style={{ transform: `translateX(calc(-50% + ${offset * 30}%)) rotate(${offset * 9}deg)`, zIndex: 10 - Math.abs(Math.round(offset)) }}
            />
          );
        })}
      </div>
      <div className="absolute inset-y-0 left-0 flex w-[58%] flex-col justify-end p-3.5">
        <Kicker>Tu género del año</Kicker>
        <p className="mt-0.5 line-clamp-2 break-words text-[30px] uppercase leading-[1.05]" style={ANTON}>{genre.name}</p>
        <p className="text-xs font-bold">El {formatNumber(genre.share)} % de tu tiempo</p>
      </div>
    </div>
  );
}

// Tu cara más vista: retrato completo a la derecha.
function PeopleFrame({ recap }) {
  const star = recap.people.actors[0];
  const src = tmdbImg(star.profilePath, "w185");
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#08080c] text-white">
      <div aria-hidden="true" className="absolute -left-10 -top-14 h-40 w-40 rounded-full bg-[#c6f432]/20 blur-2xl" />
      {src ? (
        // Retrato COMPLETO: caja 2:3 de tamaño fijo (el formato de las fotos de
        // TMDb) entre las barras de arriba y el borde inferior.
        <div aria-hidden="true" className="absolute right-14 top-[26px] h-[122px] w-[81px] overflow-hidden rounded-[8px] shadow-[0_14px_30px_-10px_rgba(0,0,0,0.8)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} className="block h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="absolute inset-y-0 left-0 flex w-[58%] flex-col justify-end p-3.5">
        <Kicker className="text-[#c6f432]">Tu cara más vista</Kicker>
        <p className="mt-0.5 line-clamp-2 text-[24px] uppercase leading-[1.05]" style={ANTON}>{star.name}</p>
        <p className="text-xs font-bold text-white/75">{star.titles} títulos juntos</p>
      </div>
    </div>
  );
}

function PersonaFrame({ recap }) {
  const persona = recap.persona;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#ff4fa3] text-[#1a0010]">
      <div aria-hidden="true" className={`absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 ${styles.aura}`}>
        <div className="h-full w-full rounded-full opacity-80 blur-[28px]" style={{ background: "conic-gradient(from 0deg, #ffe14d, #5b2bff, #ff6b1a, #ffe14d)" }} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 pt-3 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">En {recap.year} fuiste</p>
        <p className={`${DISPLAY} mt-0.5 text-[28px]`} style={ANTON}>{persona.name}</p>
        <p className="mt-0.5 line-clamp-1 text-xs font-bold">{persona.tagline}</p>
      </div>
    </div>
  );
}

/** Fotogramas con datos suficientes, en el orden de la experiencia completa. */
function buildFrames(recap) {
  if (!recap || recap.empty) return [];
  return [
    { id: "minutes", Component: MinutesFrame },
    recap.shows?.top?.[0] ? { id: "show", Component: ShowFrame } : null,
    recap.shows?.top?.length >= 3 ? { id: "topShows", Component: TopShowsFrame } : null,
    recap.movies?.top?.[0] ? { id: "movie", Component: MovieFrame } : null,
    recap.genres?.top?.[0] ? { id: "genre", Component: GenreFrame } : null,
    recap.people?.actors?.[0] ? { id: "people", Component: PeopleFrame } : null,
    recap.persona ? { id: "persona", Component: PersonaFrame } : null,
  ].filter(Boolean);
}

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

  const frames = useMemo(() => buildFrames(recap), [recap]);
  const playing = inView && !reduce && !hovered && frames.length > 1;
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setFrame((value) => (value + 1) % frames.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, frames.length]);

  // Sin datos del año (o sin sesión), el bloque no aparece.
  if (failed || recap?.empty) return null;

  const Frame = frames[frame % Math.max(frames.length, 1)]?.Component || MinutesFrame;
  const year = recap?.year || new Date().getFullYear();

  return (
    <section ref={ref}>
      {renderHeader?.(year)}
      <Link
        href={recap?.year ? `/recap/${recap.year}` : "/recap"}
        aria-label={`Ver tu ${year} en The Show Verse`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="group relative block h-40 w-full overflow-hidden rounded-2xl bg-white/[0.03] transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300/80"
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
            <div aria-hidden="true" className="absolute inset-x-3 top-2.5 flex gap-1">
              {frames.map((item, index) => (
                <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/40">
                  <span
                    key={index === frame ? `active-${frame}` : `idle-${index}`}
                    className={`block h-full origin-left rounded-full bg-white ${index === frame && playing ? styles.previewFill : ""}`}
                    style={{ transform: `scaleX(${index < frame || (index === frame && !playing) ? 1 : 0})` }}
                  />
                </span>
              ))}
            </div>

            <span aria-hidden="true" className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#0b0b0b] text-[#c6f432] shadow-lg transition-transform duration-300 group-hover:scale-110">
              <Play className="h-4 w-4 translate-x-px fill-current" />
            </span>
          </>
        ) : (
          <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />
        )}
      </Link>
    </section>
  );
}
