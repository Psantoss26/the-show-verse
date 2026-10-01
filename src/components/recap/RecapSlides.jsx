"use client";

// Pantallas de "Tu año en The Show Verse". Cada una recibe el resumen del año
// (backend/src/lib/yearInReviewCore.js) y su paleta, y se monta de nuevo cada
// vez que se muestra, así que sus animaciones de entrada se repiten al volver.

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Award,
  CalendarDays,
  Clapperboard,
  Download,
  Flame,
  Globe2,
  Heart,
  ListVideo,
  MessageSquare,
  Moon,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  ThumbsUp,
  Trophy,
  Tv,
  UserPlus,
  Volume2,
  VolumeX,
} from "lucide-react";

import {
  criticLine,
  flagEmoji,
  formatDay,
  formatDecimal,
  formatHours,
  formatNumber,
  milestoneTiles,
  minutesEquivalences,
  previousYearLine,
  tmdbImg,
} from "@/lib/recap/recapModel";
import {
  ANTON,
  BackdropFill,
  CountUp,
  EASE_OUT,
  Kicker,
  PersonPhoto,
  Poster,
  Reveal,
  Shapes,
  Stars,
  WordsReveal,
  fitDisplaySize,
  recapStyles as styles,
} from "./recapUi";

const BODY = "text-[clamp(14px,4.2cqw,19px)] leading-snug";
const SMALL = "text-[clamp(12px,3.4cqw,15px)] leading-snug";
const DISPLAY = "uppercase leading-[0.88] tracking-[-0.005em]";

function SlideBody({ children, className = "", style }) {
  return (
    <div
      className={`absolute inset-0 flex flex-col px-[7cqw] pb-[max(7cqh,env(safe-area-inset-bottom))] pt-[15cqh] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function Pill({ children, theme, inverted = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[clamp(11px,3.2cqw,14px)] font-bold ${className}`}
      style={inverted ? { background: theme.fg, color: theme.bg } : { background: `${theme.fg}1f`, color: theme.fg }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────
// 1. Portada
// ─────────────────────────────────────────────

function PosterWall({ posters }) {
  const list = posters?.length ? posters : [];
  if (list.length < 6) return null;
  const columns = [0, 1, 2, 3].map((column) => list.filter((_, index) => index % 4 === column));
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute -inset-[20%] flex rotate-[-10deg] gap-[2.4cqw]">
        {columns.map((column, index) => {
          const items = column.length ? column : list;
          return (
            <div key={index} className="flex-1 overflow-hidden">
              <div className={`flex flex-col gap-[2.4cqw] ${index % 2 ? styles.columnDown : styles.columnUp}`}>
                {[...items, ...items, ...items, ...items].map((poster, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${poster.key}-${i}`}
                    src={tmdbImg(poster.posterPath, "w185")}
                    alt=""
                    draggable={false}
                    loading={i < 6 ? "eager" : "lazy"}
                    className="aspect-[2/3] w-full rounded-[8px] object-cover"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,8,12,0.55)_0%,rgba(8,8,12,0.88)_62%,#08080c_100%)]" />
    </div>
  );
}

export function IntroSlide({ recap, theme, started, onStart, muted, onToggleMute }) {
  const reduce = useReducedMotion();
  const years = (recap.availableYears || []).filter((y) => y.plays >= 5).slice(0, 6);
  return (
    <>
      <PosterWall posters={recap.posterWall} />
      <SlideBody className="items-center justify-center text-center">
        <Kicker color={theme.accent}>The Show Verse · Resumen anual</Kicker>
        <div className="relative mt-[4cqh]">
          <WordsReveal as="h1" text="Tu año" delay={0.15} className={`${DISPLAY} text-[17cqw]`} style={ANTON} />
          <motion.p
            aria-hidden="true"
            initial={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0, rotate: -6 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1, rotate: -3 }}
            transition={{ duration: 0.9, delay: 0.45, ease: EASE_OUT }}
            className={`${DISPLAY} text-[34cqw]`}
            style={{ ...ANTON, color: theme.accent, textShadow: `0.035em 0.035em 0 ${theme.accent2}` }}
          >
            {recap.year}
          </motion.p>
        </div>
        <Reveal delay={0.8} className={`mt-[3cqh] max-w-[78cqw] ${BODY}`} style={{ color: theme.muted }}>
          {recap.isCurrentYear
            ? "Lo que has visto, repetido y devorado este año, hasta hoy. Prepara las palomitas."
            : "Lo que viste, lo que repetiste y lo que no pudiste dejar. Prepara las palomitas."}
        </Reveal>
        <Reveal delay={1.05} className="mt-[5cqh] flex flex-col items-center gap-3">
          {!started ? (
            <button
              type="button"
              data-recap-interactive
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-full px-[8cqw] py-[1.8cqh] text-[clamp(15px,4.6cqw,20px)] font-bold shadow-[0_12px_30px_-8px_rgba(198,244,50,0.55)] transition-transform hover:scale-[1.04] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 active:scale-95"
              style={{ background: theme.accent, color: "#0b0b0b" }}
            >
              <Play aria-hidden="true" className="h-5 w-5 fill-current" />
              Empezar
            </button>
          ) : (
            <p className={SMALL} style={{ color: theme.muted }}>Toca a la derecha para seguir →</p>
          )}
          <button
            type="button"
            data-recap-interactive
            onClick={onToggleMute}
            aria-pressed={!muted}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[clamp(11px,3.2cqw,14px)] font-bold transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ color: theme.muted }}
          >
            {muted ? <VolumeX aria-hidden="true" className="h-4 w-4" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
            {muted ? "Sin banda sonora" : "Con banda sonora"}
          </button>
        </Reveal>
        {years.length > 1 ? (
          <Reveal delay={1.25} className="mt-[4cqh] flex flex-wrap justify-center gap-2" data-recap-interactive>
            <nav aria-label="Otros años" className="flex flex-wrap justify-center gap-2">
              {years.map((item) => (
                <Link
                  key={item.year}
                  href={`/recap/${item.year}`}
                  aria-current={item.year === recap.year ? "page" : undefined}
                  className="rounded-full px-3 py-1 text-[clamp(11px,3.2cqw,14px)] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  style={
                    item.year === recap.year
                      ? { background: theme.fg, color: theme.bg }
                      : { background: "rgba(255,255,255,0.12)", color: theme.fg }
                  }
                >
                  {item.year}
                </Link>
              ))}
            </nav>
          </Reveal>
        ) : null}
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 2. Tiempo total
// ─────────────────────────────────────────────

export function MinutesSlide({ recap, theme }) {
  const minutes = recap.totals.minutes;
  const equivalences = minutesEquivalences(minutes).slice(0, 2);
  const previous = previousYearLine(recap);
  const digits = formatNumber(minutes).length;
  return (
    <>
      <Shapes variant={0} accent={theme.accent} accent2={theme.accent2} />
      <SlideBody>
        <Kicker color={theme.accent}>Tiempo de pantalla</Kicker>
        <WordsReveal text={`En ${recap.year} le diste al play durante`} delay={0.15} className={`mt-[6cqh] ${DISPLAY} text-[9.5cqw]`} style={ANTON} />
        <Reveal delay={0.55} y={40} className="mt-[3cqh]">
          <CountUp value={minutes} delay={0.6} className={`${DISPLAY} block`} style={{ ...ANTON, fontSize: `${Math.min(30, 150 / Math.max(digits, 4))}cqw` }} />
          <p className={`mt-1 font-bold ${BODY}`}>minutos</p>
        </Reveal>
        <div className="mt-auto space-y-2.5">
          {equivalences.map((item, index) => (
            <Reveal key={item.id} delay={1.6 + index * 0.25} className={`flex items-baseline gap-3 ${BODY}`}>
              <span className={`${DISPLAY} text-[9cqw]`} style={{ ...ANTON, color: theme.accent }}>
                {item.value >= 10 ? formatNumber(item.value) : formatDecimal(item.value, 1)}
              </span>
              <span>{item.label}</span>
            </Reveal>
          ))}
          {previous ? (
            <Reveal delay={2.2}>
              <Pill theme={theme} inverted>{previous}</Pill>
            </Reveal>
          ) : null}
          {recap.community ? (
            <Reveal delay={2.45} className={`${SMALL} font-bold`}>
              Estás en el top {recap.community.topPercent} % de la comunidad de The Show Verse.
            </Reveal>
          ) : null}
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 3. Películas y series
// ─────────────────────────────────────────────

export function SplitSlide({ recap, theme }) {
  const { totals } = recap;
  const movieShare = totals.minutes ? totals.movies.minutes / totals.minutes : 0;
  const blocks = [
    {
      id: "movies",
      icon: Clapperboard,
      value: totals.movies.unique,
      label: totals.movies.unique === 1 ? "película" : "películas",
      detail: `${formatNumber(totals.movies.plays)} sesiones · ${formatHours(totals.movies.minutes)} h`,
    },
    {
      id: "episodes",
      icon: Tv,
      value: totals.episodes.plays,
      label: totals.episodes.plays === 1 ? "episodio" : "episodios",
      detail: `de ${formatNumber(totals.shows.unique)} ${totals.shows.unique === 1 ? "serie" : "series"} · ${formatHours(totals.episodes.minutes)} h`,
    },
  ];
  return (
    <>
      <Shapes variant={2} accent={theme.accent2} accent2={theme.accent} />
      <SlideBody>
        <Kicker color={theme.accent}>Películas y series</Kicker>
        <WordsReveal text="Así se repartió tu año" delay={0.1} className={`mt-[4cqh] ${DISPLAY} text-[11cqw]`} style={ANTON} />
        <div className="mt-[5cqh] space-y-[4cqh]">
          {blocks.map((block, index) => (
            <Reveal key={block.id} delay={0.45 + index * 0.35} y={34} className="flex items-end gap-4">
              <block.icon aria-hidden="true" className="mb-[1.6cqh] h-[9cqw] w-[9cqw] shrink-0" style={{ color: theme.accent }} />
              <div>
                <p className={`${DISPLAY} text-[24cqw]`} style={ANTON}>
                  <CountUp value={block.value} delay={0.5 + index * 0.35} />
                </p>
                <p className={`font-bold ${BODY}`}>{block.label}</p>
                <p className={SMALL} style={{ color: theme.muted }}>{block.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={1.4} className="mt-auto">
          <div className="flex h-[3.2cqh] overflow-hidden rounded-full" style={{ background: `${theme.fg}26` }}>
            <div className={`h-full ${styles.growX}`} style={{ width: `${Math.max(4, movieShare * 100)}%`, background: theme.accent, animationDelay: "1.5s" }} />
          </div>
          <div className={`mt-2 flex justify-between font-bold ${SMALL}`}>
            <span>Cine {formatNumber(movieShare * 100)} %</span>
            <span>Series {formatNumber((1 - movieShare) * 100)} %</span>
          </div>
          <p className={`mt-3 ${SMALL}`} style={{ color: theme.muted }}>
            {formatNumber(totals.titles)} títulos distintos en {formatNumber(totals.activeDays)} días con actividad.
          </p>
        </Reveal>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 4. Primero y último
// ─────────────────────────────────────────────

function episodeLabel(card) {
  return card?.season && card?.episode ? `T${card.season} · E${card.episode}` : null;
}

export function BookendsSlide({ recap, theme }) {
  const first = recap.firstOfYear;
  const last = recap.lastOfYear;
  return (
    <>
      <Shapes variant={1} accent={`${theme.accent}33`} accent2={theme.accent2} />
      <SlideBody>
        <Kicker color={theme.accent}>Principio y final</Kicker>
        <WordsReveal text="Abriste el año con…" delay={0.1} className={`mt-[4cqh] ${DISPLAY} text-[10cqw]`} style={ANTON} />
        <div className="relative mt-[3cqh] flex flex-1 flex-col">
          <Reveal delay={0.45} y={30} className="flex items-center gap-4">
            <Poster path={first.posterPath} title={first.title} className="w-[30cqw] rotate-[-4deg]" priority />
            <div className="min-w-0">
              <p className={`${DISPLAY} line-clamp-3 text-[7.5cqw]`} style={ANTON}>{first.title}</p>
              <p className={`mt-1 font-bold ${SMALL}`} style={{ color: theme.accent }}>{formatDay(first.date)}</p>
              {episodeLabel(first) ? <p className={SMALL} style={{ color: theme.muted }}>{episodeLabel(first)}</p> : null}
            </div>
          </Reveal>
          <WordsReveal text="…y lo cerraste con" delay={1.6} className={`mt-[4cqh] ${DISPLAY} text-[10cqw]`} style={ANTON} as="p" />
          <Reveal delay={2} y={30} className="mt-[2.5cqh] flex flex-row-reverse items-center gap-4 text-right">
            <Poster path={last.posterPath} title={last.title} className="w-[30cqw] rotate-[4deg]" />
            <div className="min-w-0">
              <p className={`${DISPLAY} line-clamp-3 text-[7.5cqw]`} style={ANTON}>{last.title}</p>
              <p className={`mt-1 font-bold ${SMALL}`} style={{ color: theme.accent }}>{formatDay(last.date)}</p>
              {episodeLabel(last) ? <p className={SMALL} style={{ color: theme.muted }}>{episodeLabel(last)}</p> : null}
            </div>
          </Reveal>
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 5. Géneros
// ─────────────────────────────────────────────

export function GenresSlide({ recap, theme }) {
  const top = recap.genres.top;
  const first = top[0];
  const covers = (first.covers || []).filter((c) => c.posterPath).slice(0, 5);
  return (
    <>
      <SlideBody>
        <Kicker color={theme.accent2}>Tu género del año</Kicker>
        <Reveal delay={0.15} y={40}>
          <h2 className={`mt-[3cqh] ${DISPLAY}`} style={{ ...ANTON, fontSize: fitDisplaySize(first.name, { max: 20, base: 9 }) }}>
            {first.name}
          </h2>
        </Reveal>
        <Reveal delay={0.3} className={`${BODY} font-bold`}>
          El {formatNumber(first.share)} % de tu tiempo · {formatNumber(first.titles)} títulos
        </Reveal>
        {covers.length ? (
          <div aria-hidden="true" className="relative mx-auto mt-[3cqh] h-[34cqw] w-full">
            {covers.map((cover, index) => {
              const offset = index - (covers.length - 1) / 2;
              return (
                <motion.div
                  key={cover.key}
                  className="absolute left-1/2 top-0 w-[24cqw]"
                  initial={{ x: "-50%", y: 40, rotate: 0, opacity: 0 }}
                  animate={{ x: `calc(-50% + ${offset * 15}cqw)`, y: Math.abs(offset) * 10, rotate: offset * 7, opacity: 1 }}
                  transition={{ duration: 0.9, delay: 0.5 + index * 0.08, ease: EASE_OUT }}
                  style={{ zIndex: 10 - Math.abs(Math.round(offset)) }}
                >
                  <Poster path={cover.posterPath} title={cover.title} />
                </motion.div>
              );
            })}
          </div>
        ) : null}
        <ol className="mt-auto space-y-[1.4cqh]">
          {top.slice(0, 5).map((genre, index) => (
            <Reveal key={genre.name} as="li" delay={1 + index * 0.12} y={14} className="grid grid-cols-[6cqw_1fr_auto] items-center gap-3">
              <span className={`${DISPLAY} text-[6cqw]`} style={ANTON}>{index + 1}</span>
              <span className="min-w-0">
                <span className={`block truncate font-bold ${SMALL}`}>{genre.name}</span>
                <span className="mt-1 block h-[1.1cqh] overflow-hidden rounded-full" style={{ background: `${theme.fg}26` }}>
                  <span
                    className={`block h-full rounded-full ${styles.growX}`}
                    style={{ width: `${Math.max(6, (genre.share / top[0].share) * 100)}%`, background: theme.fg, animationDelay: `${1.1 + index * 0.12}s` }}
                  />
                </span>
              </span>
              <span className={`font-bold tabular-nums ${SMALL}`}>{formatNumber(genre.share)} %</span>
            </Reveal>
          ))}
        </ol>
        {recap.genres.distinct > 5 ? (
          <Reveal delay={1.8} className={`mt-[2cqh] ${SMALL}`} style={{ color: theme.muted }}>
            Probaste {recap.genres.distinct} géneros distintos.
          </Reveal>
        ) : null}
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 6-9. Serie y película del año, y sus tops
// ─────────────────────────────────────────────

function Teaser({ text, theme, until = 1.9 }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(!reduce);
  useEffect(() => {
    if (reduce) return undefined;
    const timer = setTimeout(() => setVisible(false), until * 1000);
    return () => clearTimeout(timer);
  }, [reduce, until]);
  return (
    <motion.div
      aria-hidden="true"
      initial={false}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-[9cqw] text-center"
      style={{ background: theme.bg }}
    >
      <WordsReveal as="p" text={text} delay={0.1} stagger={0.09} className={`${DISPLAY} text-[11cqw]`} style={ANTON} />
    </motion.div>
  );
}

export function TopShowSlide({ recap, theme }) {
  const show = recap.shows.top[0];
  const badges = [
    show.completedThisYear ? "La terminaste este año" : null,
    show.isNew ? "Nueva para ti" : show.rewatchedEpisodes > 0 ? "Volviste a ella" : null,
  ].filter(Boolean);
  const share = recap.totals.minutes ? Math.round((show.minutes / recap.totals.minutes) * 100) : 0;
  return (
    <>
      <BackdropFill path={show.backdropPath} fallbackPoster={show.posterPath} tint="#050505" />
      <Teaser text="Hubo una serie que no pudiste soltar…" theme={theme} />
      <SlideBody className="justify-end">
        <Reveal delay={2} className="mb-[3cqh] flex items-end gap-4">
          <Poster path={show.posterPath} title={show.title} className="w-[26cqw]" priority />
          <div className="flex flex-wrap gap-1.5 pb-1">
            {show.rating ? <Pill theme={theme} inverted><Stars value={show.rating} /> tu nota</Pill> : null}
            {badges.map((badge) => <Pill key={badge} theme={theme}>{badge}</Pill>)}
          </div>
        </Reveal>
        <Kicker color={theme.accent} className="!mb-2">Tu serie del año</Kicker>
        <WordsReveal text={show.title} delay={2.15} className={DISPLAY} style={{ ...ANTON, fontSize: fitDisplaySize(show.title, { max: 17, base: 8 }) }} />
        <Reveal delay={2.6} className="mt-[3cqh] grid grid-cols-3 gap-3">
          {[
            [formatNumber(show.episodes), show.episodes === 1 ? "episodio" : "episodios"],
            [formatHours(show.minutes), "horas"],
            [show.seasons.length ? formatNumber(show.seasons.length) : "—", show.seasons.length === 1 ? "temporada" : "temporadas"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className={`${DISPLAY} text-[11cqw]`} style={{ ...ANTON, color: theme.accent }}>{value}</p>
              <p className={`${SMALL} font-bold`}>{label}</p>
            </div>
          ))}
        </Reveal>
        {share >= 5 ? (
          <Reveal delay={2.9} className={`mt-[2cqh] ${SMALL}`} style={{ color: theme.muted }}>
            Se llevó el {share} % de todo tu tiempo de pantalla.
          </Reveal>
        ) : null}
      </SlideBody>
    </>
  );
}

export function TopMovieSlide({ recap, theme }) {
  const movie = recap.movies.top[0];
  const reason = movie.rating
    ? movie.rating >= 9
      ? "La que mejor puntuaste"
      : "Tu nota más alta del año"
    : movie.plays > 1
      ? "La que más repetiste"
      : "La que más te marcó";
  return (
    <>
      <BackdropFill path={movie.backdropPath} fallbackPoster={movie.posterPath} tint="#050505" />
      <Teaser text="Y una película que se quedó contigo…" theme={theme} />
      <SlideBody className="justify-end">
        <Reveal delay={2} className="mb-[3cqh] flex items-end gap-4">
          <Poster path={movie.posterPath} title={movie.title} className="w-[26cqw]" priority />
          <div className="flex flex-wrap gap-1.5 pb-1">
            <Pill theme={theme} inverted>{reason}</Pill>
            {movie.rewatch ? <Pill theme={theme}><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> {movie.plays > 1 ? `${movie.plays} veces este año` : "Volviste a verla"}</Pill> : null}
          </div>
        </Reveal>
        <Kicker color={theme.accent} className="!mb-2">Tu película del año</Kicker>
        <WordsReveal text={movie.title} delay={2.15} className={DISPLAY} style={{ ...ANTON, fontSize: fitDisplaySize(movie.title, { max: 17, base: 8 }) }} />
        <Reveal delay={2.6} className="mt-[3cqh] grid grid-cols-3 gap-3">
          {[
            [movie.rating ? formatDecimal(movie.rating, movie.rating % 1 ? 1 : 0) : "—", "tu nota"],
            [movie.voteAverage ? formatDecimal(movie.voteAverage, 1) : "—", "TMDb"],
            [movie.runtime ? `${movie.runtime}′` : "—", "duración"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className={`${DISPLAY} text-[11cqw]`} style={{ ...ANTON, color: theme.accent }}>{value}</p>
              <p className={`${SMALL} font-bold`}>{label}</p>
            </div>
          ))}
        </Reveal>
        {movie.year ? (
          <Reveal delay={2.9} className={`mt-[2cqh] ${SMALL}`} style={{ color: theme.muted }}>
            Estrenada en {movie.year}. Vista por primera vez este año el {formatDay(movie.firstWatched)}.
          </Reveal>
        ) : null}
      </SlideBody>
    </>
  );
}

function RankList({ items, theme, detail }) {
  return (
    <ol className="mt-[2.5cqh] flex min-h-0 flex-1 flex-col justify-center gap-[1.4cqh]">
      {items.map((item, index) => (
        <Reveal key={item.key} as="li" delay={0.35 + index * 0.16} y={22} className="flex items-center gap-[4cqw]">
          <span className={`w-[10cqw] shrink-0 text-center ${DISPLAY} text-[11cqw] ${index ? styles.outline : ""}`} style={{ ...ANTON, color: index ? theme.fg : theme.accent }}>
            {index + 1}
          </span>
          <Poster path={item.posterPath} title={item.title} className="w-[12.5cqw] shrink-0" rounded="rounded-[6px]" priority={index < 2} />
          <div className="min-w-0">
            <p className={`truncate font-bold ${index === 0 ? "text-[clamp(16px,5cqw,22px)]" : BODY}`}>{item.title}</p>
            <p className={SMALL} style={{ color: theme.muted }}>{detail(item)}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}

export function TopShowsSlide({ recap, theme }) {
  return (
    <>
      <Shapes variant={3} accent={`${theme.accent}22`} accent2={theme.accent2} />
      <SlideBody>
        <Kicker color={theme.accent}>Tus series más vistas</Kicker>
        <WordsReveal text="Las que te tuvieron enganchado" delay={0.1} className={`mt-[3cqh] ${DISPLAY} text-[10cqw]`} style={ANTON} />
        <RankList
          items={recap.shows.top}
          theme={theme}
          detail={(show) => `${formatNumber(show.episodes)} ep. · ${formatHours(show.minutes)} h${show.rating ? ` · ★ ${formatDecimal(show.rating, show.rating % 1 ? 1 : 0)}` : ""}`}
        />
        <Reveal delay={1.3} className={SMALL} style={{ color: theme.muted }}>
          {formatNumber(recap.shows.total)} series vistas este año.
        </Reveal>
      </SlideBody>
    </>
  );
}

export function TopMoviesSlide({ recap, theme }) {
  return (
    <>
      <Shapes variant={1} accent={`${theme.accent}30`} accent2={`${theme.fg}22`} />
      <SlideBody>
        <Kicker color={theme.accent}>Tus películas del año</Kicker>
        <WordsReveal text="Tu top de cartelera" delay={0.1} className={`mt-[3cqh] ${DISPLAY} text-[11cqw]`} style={ANTON} />
        <RankList
          items={recap.movies.top}
          theme={theme}
          detail={(movie) =>
            [
              movie.rating ? `★ ${formatDecimal(movie.rating, movie.rating % 1 ? 1 : 0)}` : null,
              movie.year,
              movie.plays > 1 ? `${movie.plays} veces` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          }
        />
        {recap.movies.longest ? (
          <Reveal delay={1.3} className={SMALL} style={{ color: theme.muted }}>
            La más larga: {recap.movies.longest.title} ({recap.movies.longest.runtime} min).
          </Reveal>
        ) : null}
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 10. Maratón
// ─────────────────────────────────────────────

export function BingeSlide({ recap, theme }) {
  const binge = recap.binge;
  if (!binge) {
    const day = recap.calendar.busiestDay;
    return (
      <>
        <Shapes variant={4} accent={theme.accent} accent2={theme.accent2} />
        <SlideBody>
          <Kicker color={theme.accent2}>Tu día más intenso</Kicker>
          <Reveal delay={0.2} y={40} className="mt-[8cqh]">
            <p className={`${DISPLAY} text-[30cqw]`} style={ANTON}><CountUp value={day.minutes} /></p>
            <p className={`font-bold ${BODY}`}>minutos en un solo día</p>
          </Reveal>
          <Reveal delay={0.9} className={`mt-auto ${BODY}`}>
            Fue el <strong>{formatDay(day.date, { weekday: true })}</strong>: {formatNumber(day.plays)} {day.plays === 1 ? "título" : "títulos"} seguidos.
          </Reveal>
        </SlideBody>
      </>
    );
  }
  return (
    <>
      <Shapes variant={4} accent={theme.accent} accent2={theme.accent2} />
      <SlideBody>
        <Kicker color={theme.accent2}>Tu maratón más épico</Kicker>
        <Reveal delay={0.2} y={40} className="mt-[4cqh]">
          <p className={`${DISPLAY} text-[42cqw]`} style={ANTON}><CountUp value={binge.episodes} duration={1.2} /></p>
          <p className={`${DISPLAY} mt-[1.5cqh] text-[12cqw]`} style={ANTON}>{binge.episodes === 1 ? "episodio" : "episodios"}</p>
        </Reveal>
        <Reveal delay={0.8} className={`mt-[2cqh] ${BODY}`}>
          de <strong>{binge.title}</strong> en un solo día. Fue el {formatDay(binge.date, { weekday: true })}.
        </Reveal>
        <div className="mt-auto flex items-end justify-between gap-4">
          <Reveal delay={1.1} className={`${BODY} font-bold`}>
            {formatHours(binge.minutes)} horas del tirón.
            <span className={`block font-normal ${SMALL}`} style={{ color: theme.muted }}>«Solo uno más», dijiste.</span>
          </Reveal>
          <div aria-hidden="true" className="relative h-[40cqw] w-[30cqw] shrink-0">
            {[0, 1, 2].map((index) => (
              <motion.div
                key={index}
                className="absolute inset-0"
                initial={{ rotate: 0, y: 30, opacity: 0 }}
                animate={{ rotate: (index - 1) * 9, y: 0, opacity: 1 }}
                transition={{ duration: 0.8, delay: 1 + index * 0.12, ease: EASE_OUT }}
              >
                <Poster path={binge.posterPath} title={binge.title} />
              </motion.div>
            ))}
          </div>
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 11. Cuándo ves
// ─────────────────────────────────────────────

const SLOT_COPY = {
  madrugada: { title: "Eres de madrugada", icon: Moon },
  manana: { title: "Eres de mañanas", icon: Sunrise },
  tarde: { title: "Eres de tarde", icon: Sun },
  noche: { title: "Eres de noche", icon: Sunset },
};

function HourClock({ hours, peakHour, theme }) {
  const max = Math.max(1, ...hours);
  const center = 100;
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Visionados por hora. Hora punta: las ${peakHour}:00.`}>
      <circle cx={center} cy={center} r="44" fill="none" stroke={`${theme.fg}22`} strokeWidth="1" />
      {hours.map((count, hour) => {
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        const length = 6 + (count / max) * 46;
        const x1 = center + Math.cos(angle) * 50;
        const y1 = center + Math.sin(angle) * 50;
        const x2 = center + Math.cos(angle) * (50 + length);
        const y2 = center + Math.sin(angle) * (50 + length);
        return (
          <motion.line
            key={hour}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={hour === peakHour ? theme.accent : theme.fg}
            strokeOpacity={hour === peakHour ? 1 : 0.55}
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, delay: 0.5 + hour * 0.03, ease: EASE_OUT }}
          />
        );
      })}
      {[0, 6, 12, 18].map((hour) => {
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        return (
          <text key={hour} x={center + Math.cos(angle) * 34} y={center + Math.sin(angle) * 34 + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={theme.fg} fillOpacity="0.7">
            {hour}h
          </text>
        );
      })}
    </svg>
  );
}

export function RhythmSlide({ recap, theme }) {
  const rhythm = recap.rhythm;
  const slot = rhythm.topSlot ? SLOT_COPY[rhythm.topSlot.id] : null;
  const maxDay = Math.max(1, ...rhythm.weekdays.map((d) => d.count));
  const SlotIcon = slot?.icon || CalendarDays;
  return (
    <>
      <SlideBody>
        <Kicker color={theme.accent}>Tu reloj</Kicker>
        <WordsReveal
          text={slot ? slot.title : `Tu día es el ${rhythm.peakWeekday}`}
          delay={0.1}
          className={`mt-[3cqh] ${DISPLAY} text-[13cqw]`}
          style={ANTON}
        />
        {rhythm.reliable ? (
          <>
            <Reveal delay={0.35} className={`${BODY}`}>
              <SlotIcon aria-hidden="true" className="mr-1.5 inline h-[1.1em] w-[1.1em] align-[-0.15em]" style={{ color: theme.accent }} />
              El {formatNumber(rhythm.topSlot.share)} % de lo que viste fue {rhythm.topSlot.label.toLowerCase()}. Hora punta: las {rhythm.peakHour}:00.
            </Reveal>
            <div className="mx-auto mt-[2cqh] aspect-square w-[66cqw]">
              <HourClock hours={rhythm.hours} peakHour={rhythm.peakHour} theme={theme} />
            </div>
          </>
        ) : null}
        <div className="mt-auto">
          <Reveal delay={1} className={`mb-2 font-bold ${SMALL}`}>
            {rhythm.peakWeekday ? `Tu día favorito: el ${rhythm.peakWeekday}` : "Por días de la semana"}
            {rhythm.weekendShare ? <span className="font-normal" style={{ color: theme.muted }}> · {formatNumber(rhythm.weekendShare)} % en fin de semana</span> : null}
          </Reveal>
          <div className={`flex items-end gap-[2cqw] ${rhythm.reliable ? "h-[13cqh]" : "h-[30cqh]"}`} role="img" aria-label="Visionados por día de la semana">
            {rhythm.weekdays.map((day, index) => (
              <div key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div
                  className={`w-full rounded-t-[6px] ${styles.growY}`}
                  style={{
                    height: `${Math.max(4, (day.count / maxDay) * 100)}%`,
                    background: day.day === rhythm.peakWeekday ? theme.accent : `${theme.fg}55`,
                    animationDelay: `${1 + index * 0.06}s`,
                  }}
                />
                <span className="text-[clamp(10px,3cqw,13px)] font-bold uppercase">{day.day.slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 12. Calendario: meses, mapa de calor y racha
// ─────────────────────────────────────────────

function Heatmap({ perDay, year, theme }) {
  const max = Math.max(1, ...perDay);
  const firstWeekday = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const cells = [...Array(firstWeekday).fill(null), ...perDay];
  const columns = Math.ceil(cells.length / 7);
  return (
    <div
      role="img"
      aria-label={`Mapa de actividad de ${year}: ${perDay.filter(Boolean).length} días con algo visto.`}
      className="grid gap-[0.5cqw]"
      style={{ gridTemplateRows: "repeat(7, 1fr)", gridAutoFlow: "column", gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {cells.map((count, index) => {
        if (count === null) return <span key={index} aria-hidden="true" />;
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
        const column = Math.floor(index / 7);
        return (
          <span
            key={index}
            aria-hidden="true"
            className={`aspect-square rounded-[1px] ${styles.cell}`}
            style={{
              background: level === 0 ? `${theme.fg}14` : theme.accent,
              opacity: level === 0 ? 1 : 0.35 + level * 0.16,
              animationDelay: `${0.9 + column * 0.018}s`,
            }}
          />
        );
      })}
    </div>
  );
}

export function CalendarSlide({ recap, theme }) {
  const { monthly, calendar } = recap;
  const maxMinutes = Math.max(1, ...monthly.months.map((m) => m.minutes));
  const streak = calendar.longestStreak;
  return (
    <>
      <SlideBody>
        <Kicker color={theme.accent}>Tu año, día a día</Kicker>
        <WordsReveal text={`Tu mes fuerte: ${monthly.peak.label}`} delay={0.1} className={`mt-[3cqh] ${DISPLAY} text-[11.5cqw]`} style={ANTON} />
        <Reveal delay={0.35} className={BODY}>
          {formatHours(monthly.peak.minutes)} horas en un solo mes.
        </Reveal>
        <div className="mt-[3cqh] flex h-[16cqh] items-end gap-[1.4cqw]" role="img" aria-label="Horas vistas por mes">
          {monthly.months.map((month, index) => (
            <div key={month.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className={`w-full rounded-t-[5px] ${styles.growY}`}
                style={{
                  height: `${Math.max(3, (month.minutes / maxMinutes) * 100)}%`,
                  background: month.month === monthly.peak.month ? theme.accent : `${theme.fg}50`,
                  animationDelay: `${0.4 + index * 0.05}s`,
                }}
              />
              <span className="text-[clamp(9px,2.6cqw,12px)] font-bold uppercase">{month.label.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <Reveal delay={0.8} className="mt-[3cqh]">
          <Heatmap perDay={calendar.perDay} year={recap.year} theme={theme} />
        </Reveal>
        <div className="mt-auto grid grid-cols-2 gap-4">
          <Reveal delay={1.6}>
            <p className={`${DISPLAY} flex items-center gap-1 text-[13cqw]`} style={ANTON}>
              <Flame aria-hidden="true" className="h-[0.8em] w-[0.8em]" style={{ color: theme.accent }} />
              {formatNumber(streak.length)}
            </p>
            <p className={`font-bold ${SMALL}`}>{streak.length === 1 ? "día de racha" : "días de racha seguidos"}</p>
            {streak.length > 1 ? <p className={SMALL} style={{ color: theme.muted }}>{formatDay(streak.start)} – {formatDay(streak.end)}</p> : null}
          </Reveal>
          <Reveal delay={1.8}>
            <p className={`${DISPLAY} text-[13cqw]`} style={ANTON}>{formatNumber(calendar.activeDays)}</p>
            <p className={`font-bold ${SMALL}`}>días con actividad</p>
            <p className={SMALL} style={{ color: theme.muted }}>el {formatNumber(calendar.activeShare)} % {recap.isCurrentYear ? "de lo que va de año" : "del año"}</p>
          </Reveal>
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 13. Notas
// ─────────────────────────────────────────────

export function RatingsSlide({ recap, theme }) {
  const ratings = recap.ratings;
  const max = Math.max(1, ...ratings.distribution.map((d) => d.count));
  const critic = criticLine(ratings.compared >= 3 ? ratings.vsTmdb : null);
  const controversial = ratings.controversial;
  return (
    <>
      <Shapes variant={2} accent={`${theme.accent}55`} accent2={`${theme.fg}18`} />
      <SlideBody>
        <Kicker color={theme.accent}>Tu lado crítico</Kicker>
        <div className="mt-[3cqh] flex items-end gap-3">
          <Reveal delay={0.15} y={36}>
            <p className={`${DISPLAY} text-[34cqw]`} style={ANTON}><CountUp value={ratings.average} decimals={1} /></p>
          </Reveal>
          <Reveal delay={0.45} className={`pb-[3cqh] ${BODY} font-bold`}>
            de nota media en {formatNumber(ratings.count)} {ratings.count === 1 ? "nota" : "notas"}
          </Reveal>
        </div>
        <div className="flex h-[12cqh] items-end gap-[1.2cqw]" role="img" aria-label="Reparto de tus notas del 1 al 10">
          {ratings.distribution.map((bucket, index) => (
            <div key={bucket.score} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className={`w-full rounded-t-[4px] ${styles.growY}`}
                style={{ height: `${Math.max(3, (bucket.count / max) * 100)}%`, background: bucket.score >= 9 ? theme.accent : `${theme.fg}60`, animationDelay: `${0.6 + index * 0.05}s` }}
              />
              <span className="text-[clamp(9px,2.6cqw,12px)] font-bold">{bucket.score}</span>
            </div>
          ))}
        </div>
        {critic ? <Reveal delay={1.1} className={`mt-[3cqh] ${BODY} font-bold`}>{critic}</Reveal> : null}
        <div className="mt-auto">
          {controversial ? (
            <Reveal delay={1.5} className="flex items-center gap-4 rounded-[16px] p-3" style={{ background: `${theme.fg}14` }}>
              <Poster path={controversial.posterPath} title={controversial.title} className="w-[17cqw] shrink-0" rounded="rounded-[6px]" />
              <div className="min-w-0">
                <p className={`text-[clamp(10px,3cqw,13px)] font-bold uppercase tracking-[0.18em]`} style={{ color: theme.muted }}>
                  {controversial.diff > 0 ? "Tu defensa más apasionada" : "Tu opinión impopular"}
                </p>
                <p className={`truncate font-bold ${BODY}`}>{controversial.title}</p>
                <p className={SMALL}>
                  Tú: <strong>{formatDecimal(controversial.rating, controversial.rating % 1 ? 1 : 0)}</strong> · TMDb: {formatDecimal(controversial.voteAverage, 1)}
                </p>
              </div>
            </Reveal>
          ) : ratings.perfectScores ? (
            <Reveal delay={1.5} className={`${BODY}`}>
              Repartiste <strong>{ratings.perfectScores}</strong> {ratings.perfectScores === 1 ? "diez" : "dieces"}.
            </Reveal>
          ) : null}
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 14. Épocas
// ─────────────────────────────────────────────

export function ErasSlide({ recap, theme }) {
  const eras = recap.eras;
  const max = Math.max(1, ...eras.decades.map((d) => d.count));
  return (
    <>
      <SlideBody>
        <Kicker color={theme.accent}>Viaje en el tiempo</Kicker>
        <WordsReveal text={`Tu década: los ${eras.topDecade.label}`} delay={0.1} className={`mt-[3cqh] ${DISPLAY} text-[12cqw]`} style={ANTON} />
        <Reveal delay={0.35} className={BODY}>
          El año medio de lo que viste es <strong>{eras.averageYear}</strong>.
        </Reveal>
        <div className="mt-[3cqh] space-y-[1.1cqh]" role="img" aria-label="Títulos por década de estreno">
          {eras.decades.map((decade, index) => (
            <div key={decade.decade} className="grid grid-cols-[11cqw_1fr_8cqw] items-center gap-2">
              <span className={`${DISPLAY} text-[5.5cqw]`} style={ANTON}>{decade.label}</span>
              <span className="h-[2.2cqh] overflow-hidden rounded-full" style={{ background: `${theme.fg}14` }}>
                <span
                  className={`block h-full rounded-full ${styles.growX}`}
                  style={{ width: `${Math.max(4, (decade.count / max) * 100)}%`, background: decade.decade === eras.topDecade.decade ? theme.accent : theme.fg, animationDelay: `${0.5 + index * 0.08}s` }}
                />
              </span>
              <span className={`text-right font-bold tabular-nums ${SMALL}`}>{decade.count}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto grid grid-cols-[auto_1fr] items-center gap-4">
          <Reveal delay={1.2}>
            <Poster path={eras.oldest.posterPath} title={eras.oldest.title} className="w-[22cqw] rotate-[-3deg] sepia-[0.35]" />
          </Reveal>
          <Reveal delay={1.4}>
            <p className={`text-[clamp(10px,3cqw,13px)] font-bold uppercase tracking-[0.18em]`} style={{ color: theme.muted }}>Lo más antiguo</p>
            <p className={`font-bold ${BODY}`}>{eras.oldest.title}</p>
            <p className={`${DISPLAY} text-[10cqw]`} style={{ ...ANTON, color: theme.accent }}>{eras.oldest.year}</p>
            {eras.releasesThisYear ? (
              <p className={SMALL} style={{ color: theme.muted }}>
                Y viste {eras.releasesThisYear} {eras.releasesThisYear === 1 ? "estreno" : "estrenos"} de {recap.year}.
              </p>
            ) : null}
          </Reveal>
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 15. Idiomas y países
// ─────────────────────────────────────────────

export function WorldSlide({ recap, theme }) {
  const world = recap.world;
  return (
    <>
      <Shapes variant={3} accent={`${theme.accent2}33`} accent2={theme.accent} />
      <SlideBody>
        <Kicker color={theme.accent}>La vuelta al mundo</Kicker>
        <Reveal delay={0.15} y={40} className="mt-[3cqh] flex items-end gap-3">
          <p className={`${DISPLAY} text-[30cqw]`} style={ANTON}><CountUp value={world.distinctCountries} duration={1.2} /></p>
          <p className={`pb-[2.5cqh] font-bold ${BODY}`}>{world.distinctCountries === 1 ? "país" : "países"} en tu pantalla</p>
        </Reveal>
        <ul className="mt-[2cqh] grid grid-cols-2 gap-x-4 gap-y-[1.4cqh]">
          {world.countries.slice(0, 6).map((country, index) => (
            <Reveal key={country.code} as="li" delay={0.5 + index * 0.08} y={12} className="flex items-center gap-2">
              <span aria-hidden="true" className="text-[7cqw] leading-none">{flagEmoji(country.code) || <Globe2 className="h-6 w-6" />}</span>
              <span className="min-w-0">
                <span className={`block truncate font-bold ${SMALL}`}>{country.name}</span>
                <span className="block text-[clamp(10px,2.9cqw,13px)]" style={{ color: theme.muted }}>{country.titles} {country.titles === 1 ? "título" : "títulos"}</span>
              </span>
            </Reveal>
          ))}
        </ul>
        <div className="mt-auto">
          <Reveal delay={1.2} className={`mb-2 font-bold ${SMALL}`}>{world.distinctLanguages} idiomas originales</Reveal>
          <Reveal delay={1.3} className="flex flex-wrap gap-1.5">
            {world.languages.map((language, index) => (
              <Pill key={language.code} theme={theme} inverted={index === 0}>
                {language.name} · {formatNumber(language.share)} %
              </Pill>
            ))}
          </Reveal>
          {world.discovery ? (
            <Reveal delay={1.6} className={`mt-[2.5cqh] ${BODY}`}>
              Tu idioma descubrimiento: <strong style={{ color: theme.accent }}>{world.discovery.name}</strong>, con {world.discovery.titles} {world.discovery.titles === 1 ? "título" : "títulos"}.
            </Reveal>
          ) : null}
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 16. Personas
// ─────────────────────────────────────────────

export function PeopleSlide({ recap, theme }) {
  const { actors = [], directors = [] } = recap.people;
  const star = actors[0] || null;
  return (
    <>
      <Shapes variant={2} accent={`${theme.accent}40`} accent2={`${theme.accent2}55`} />
      <SlideBody>
        <Kicker color={theme.accent}>Las caras de tu año</Kicker>
        {star ? (
          <>
            <Reveal delay={0.2} y={30} className="mt-[4cqh] flex items-center gap-[5cqw]">
              <div className="relative shrink-0">
                <PersonPhoto path={star.profilePath} name={star.name} className="h-[34cqw] w-[34cqw] ring-4" />
                <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-[10cqw] w-[10cqw] items-center justify-center rounded-full text-[5cqw] font-bold" style={{ background: theme.accent, color: "#0b0b0b" }}>1</span>
              </div>
              <div className="min-w-0">
                <p className={`text-[clamp(10px,3cqw,13px)] font-bold uppercase tracking-[0.18em]`} style={{ color: theme.muted }}>Tu cara más vista</p>
                <p className={`${DISPLAY} text-[10cqw]`} style={ANTON}>{star.name}</p>
                <p className={`font-bold ${SMALL}`}>{star.titles} títulos juntos · {formatHours(star.minutes)} h</p>
              </div>
            </Reveal>
            {actors.length > 1 ? (
              <ul className="mt-[4cqh] grid grid-cols-5 gap-2">
                {actors.slice(1, 6).map((person, index) => (
                  <Reveal key={person.id} as="li" delay={0.7 + index * 0.1} y={16} className="flex flex-col items-center text-center">
                    <PersonPhoto path={person.profilePath} name={person.name} className="aspect-square w-full" />
                    <span className="mt-1 line-clamp-2 text-[clamp(10px,2.8cqw,12px)] font-bold leading-tight">{person.name}</span>
                    <span className="text-[clamp(9px,2.6cqw,11px)]" style={{ color: theme.muted }}>{person.titles} tít.</span>
                  </Reveal>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
        {directors.length ? (
          <div className="mt-auto">
            <Reveal delay={1.3} className={`mb-2 font-bold uppercase tracking-[0.18em] text-[clamp(10px,3cqw,13px)]`} style={{ color: theme.muted }}>
              Detrás de la cámara
            </Reveal>
            <ul className="space-y-2">
              {directors.slice(0, 3).map((person, index) => (
                <Reveal key={person.id} as="li" delay={1.4 + index * 0.12} y={12} className="flex items-center gap-3">
                  <PersonPhoto path={person.profilePath} name={person.name} className="h-[11cqw] w-[11cqw] shrink-0" />
                  <span className={`min-w-0 flex-1 truncate font-bold ${BODY}`}>{person.name}</span>
                  <span className={`shrink-0 ${SMALL}`} style={{ color: theme.muted }}>{person.titles} títulos</span>
                </Reveal>
              ))}
            </ul>
          </div>
        ) : null}
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 17. Hitos
// ─────────────────────────────────────────────

const TILE_ICONS = {
  completed: Trophy,
  newShows: Tv,
  newMovies: Clapperboard,
  rewatch: RotateCcw,
  favorites: Heart,
  watchlist: ListVideo,
  lists: ListVideo,
  comments: MessageSquare,
  followers: UserPlus,
  likes: ThumbsUp,
  achievements: Award,
};

const RARITY_COLORS = { comun: "#a1a1aa", raro: "#38bdf8", epico: "#c084fc", legendario: "#facc15" };

export function MilestonesSlide({ recap, theme }) {
  const tiles = milestoneTiles(recap).slice(0, 6);
  const completed = recap.milestones.completedShows || [];
  const achievements = recap.milestones.achievements || [];
  return (
    <>
      <SlideBody>
        <Kicker color={theme.accent}>Tus hitos</Kicker>
        <WordsReveal text="Un año de récords" delay={0.1} className={`mt-[3cqh] ${DISPLAY} text-[12cqw]`} style={ANTON} />
        <ul className="mt-[3cqh] grid grid-cols-2 gap-[2.5cqw]">
          {tiles.map((tile, index) => {
            const Icon = TILE_ICONS[tile.id] || Sparkles;
            return (
              <Reveal
                key={tile.id}
                as="li"
                delay={0.3 + index * 0.1}
                y={20}
                className="rounded-[16px] p-[3.5cqw]"
                style={{ background: index % 3 === 0 ? theme.fg : `${theme.fg}14`, color: index % 3 === 0 ? theme.bg : theme.fg }}
              >
                <Icon aria-hidden="true" className="h-[5.5cqw] w-[5.5cqw]" />
                <p className={`${DISPLAY} mt-1 text-[11cqw]`} style={ANTON}><CountUp value={tile.value} delay={0.35 + index * 0.1} duration={1.2} /></p>
                <p className={`font-bold ${SMALL}`}>{tile.label}</p>
              </Reveal>
            );
          })}
        </ul>
        <div className="mt-auto">
          {completed.length ? (
            <Reveal delay={1.2}>
              <p className={`mb-2 font-bold ${SMALL}`}>Series que cerraste</p>
              <div className="flex gap-2 overflow-hidden">
                {completed.slice(0, 6).map((show) => (
                  <Poster key={show.key} path={show.posterPath} title={show.title} className="w-[13cqw] shrink-0" rounded="rounded-[5px]" size="w185" />
                ))}
              </div>
            </Reveal>
          ) : achievements.length ? (
            <Reveal delay={1.2} className="flex flex-wrap gap-1.5">
              {achievements.slice(0, 6).map((achievement) => (
                <span key={achievement.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[clamp(11px,3.1cqw,13px)] font-bold" style={{ background: "#0b0b0b", color: RARITY_COLORS[achievement.rarity] || "#fff" }}>
                  <Award aria-hidden="true" className="h-3.5 w-3.5" />
                  {achievement.name}
                </span>
              ))}
            </Reveal>
          ) : null}
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 18. Perfil de espectador
// ─────────────────────────────────────────────

export function PersonaSlide({ recap, theme }) {
  const persona = recap.persona;
  const traits = persona.traits.filter((trait) => trait.score > 0.05).slice(0, 4);
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <div className={`absolute left-1/2 top-[30%] h-[120cqw] w-[120cqw] -translate-x-1/2 -translate-y-1/2 ${styles.aura}`}>
          <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(from 0deg, ${theme.accent}, ${theme.accent2}, #ff6b1a, ${theme.accent})`, filter: "blur(40px)", opacity: 0.85 }} />
        </div>
      </div>
      <SlideBody>
        <Kicker color={theme.fg}>Tu perfil de espectador</Kicker>
        <Reveal delay={0.2} y={30} className="mt-[6cqh] text-center">
          <p className={`${SMALL} font-bold uppercase tracking-[0.2em]`}>En {recap.year} fuiste</p>
          <h2 className={`${DISPLAY} mt-2`} style={{ ...ANTON, fontSize: fitDisplaySize(persona.name, { max: 18, base: 8.5 }) }}>
            {persona.name}
          </h2>
        </Reveal>
        <Reveal delay={0.6} className={`mx-auto mt-[2cqh] max-w-[80cqw] text-center ${BODY} font-bold`}>
          {persona.tagline}
        </Reveal>
        <Reveal delay={0.85} className={`mx-auto mt-[1.5cqh] max-w-[80cqw] text-center ${SMALL}`}>
          {persona.description}
          {persona.secondary ? <> Con un toque de <strong>{persona.secondary.name.replace(/^El /, "")}</strong>.</> : null}
        </Reveal>
        <div className="mt-auto space-y-[1.3cqh] rounded-[18px] p-[4cqw]" style={{ background: "rgba(11,11,11,0.86)", color: "#fff" }}>
          {traits.map((trait, index) => (
            <Reveal key={trait.id} delay={1.2 + index * 0.12} y={10} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span className={`font-bold ${SMALL}`}>{trait.name.replace(/^El /, "")}</span>
              <span className={`tabular-nums ${SMALL}`}>{formatNumber(trait.score * 100)}</span>
              <span className="col-span-2 h-[0.9cqh] overflow-hidden rounded-full bg-white/15">
                <span className={`block h-full rounded-full ${styles.growX}`} style={{ width: `${Math.max(4, trait.score * 100)}%`, background: index === 0 ? theme.accent : "#fff", animationDelay: `${1.3 + index * 0.12}s` }} />
              </span>
            </Reveal>
          ))}
        </div>
      </SlideBody>
    </>
  );
}

// ─────────────────────────────────────────────
// 19. Resumen para compartir
// ─────────────────────────────────────────────

export function SummarySlide({ recap, theme, user, onReplay, onShare, shareState }) {
  const shows = recap.shows.top.slice(0, 5);
  const movies = recap.movies.top.slice(0, 5);
  const genre = recap.genres.top[0]?.name;
  const strip = [...shows.slice(0, 3), ...movies.slice(0, 3)].filter((item) => item.posterPath).slice(0, 5);
  const listItem = "flex gap-2 text-[clamp(12px,3.7cqw,16px)] font-bold leading-tight";
  return (
    <SlideBody className="!pt-[12cqh]">
      <Reveal
        delay={0.05}
        y={20}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] p-[5cqw]"
        style={{ background: theme.accent, color: "#0b0b0b" }}
      >
        <p className="text-[clamp(10px,3cqw,13px)] font-bold uppercase tracking-[0.2em]">The Show Verse</p>
        <p className={`${DISPLAY} text-[16cqw]`} style={ANTON}>Mi {recap.year}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`font-bold ${SMALL}`}>@{user?.username || "yo"}</span>
          {recap.persona ? (
            <span className="rounded-full bg-[#0b0b0b] px-2.5 py-0.5 text-[clamp(11px,3.2cqw,14px)] font-bold" style={{ color: theme.accent }}>
              {recap.persona.name}
            </span>
          ) : null}
        </div>

        {strip.length ? (
          <div aria-hidden="true" className="mt-[3cqw] grid grid-cols-5 gap-[1.6cqw]">
            {strip.map((item, index) => (
              <motion.div
                key={item.key}
                initial={{ y: 24, rotate: 0, opacity: 0 }}
                animate={{ y: 0, rotate: index % 2 ? 3 : -3, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.25 + index * 0.07, ease: EASE_OUT }}
              >
                <Poster path={item.posterPath} title={item.title} rounded="rounded-[6px]" size="w185" />
              </motion.div>
            ))}
          </div>
        ) : null}

        <div className="mt-[4cqw] grid grid-cols-2 gap-[4cqw]">
          {[["Series", shows], ["Películas", movies]].map(([label, list]) => (
            <div key={label} className="min-w-0">
              <p className="text-[clamp(10px,3cqw,13px)] font-bold uppercase tracking-[0.16em]">Top {label.toLowerCase()}</p>
              <ol className="mt-1.5 space-y-1">
                {list.map((item, index) => (
                  <li key={item.key} className={listItem}>
                    <span className="w-3 shrink-0">{index + 1}</span>
                    <span className="truncate">{item.title}</span>
                  </li>
                ))}
                {!list.length ? <li className={listItem}>—</li> : null}
              </ol>
            </div>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-black/20 pt-[3cqw]">
          {[
            [formatNumber(recap.totals.minutes), "minutos"],
            [formatNumber(recap.totals.titles), "títulos"],
            [genre || "—", "género top"],
          ].map(([value, label]) => (
            <div key={label} className="min-w-0">
              <p
                className={`${DISPLAY} ${label === "género top" ? "line-clamp-2 break-words text-[6.5cqw]" : "truncate text-[9cqw]"}`}
                style={ANTON}
              >
                {value}
              </p>
              <p className="text-[clamp(10px,2.9cqw,12px)] font-bold">{label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.4} className="mt-[2.5cqh] grid grid-cols-2 gap-2" data-recap-interactive>
        <button
          type="button"
          data-recap-interactive
          onClick={() => onShare("share")}
          disabled={shareState === "working"}
          className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-[clamp(13px,3.8cqw,16px)] font-bold transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-60"
          style={{ background: theme.fg, color: theme.bg }}
        >
          <Share2 aria-hidden="true" className="h-4 w-4" /> Compartir
        </button>
        <button
          type="button"
          data-recap-interactive
          onClick={() => onShare("download")}
          disabled={shareState === "working"}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/12 px-4 py-3 text-[clamp(13px,3.8cqw,16px)] font-bold transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-60"
        >
          <Download aria-hidden="true" className="h-4 w-4" /> Descargar
        </button>
        <button
          type="button"
          data-recap-interactive
          onClick={onReplay}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/12 px-4 py-3 text-[clamp(13px,3.8cqw,16px)] font-bold transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" /> Ver de nuevo
        </button>
        <Link
          href="/profile/statistics"
          data-recap-interactive
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/12 px-4 py-3 text-[clamp(13px,3.8cqw,16px)] font-bold transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          <Sparkles aria-hidden="true" className="h-4 w-4" /> Estadísticas
        </Link>
      </Reveal>
      <p role="status" className={`mt-2 min-h-[1.4em] text-center ${SMALL}`} style={{ color: theme.muted }}>
        {shareState === "working" ? "Preparando tu imagen…" : shareState === "done" ? "¡Listo!" : shareState === "error" ? "No se pudo generar la imagen." : ""}
      </p>
    </SlideBody>
  );
}

export const SLIDE_COMPONENTS = {
  intro: IntroSlide,
  minutes: MinutesSlide,
  split: SplitSlide,
  bookends: BookendsSlide,
  genres: GenresSlide,
  topShow: TopShowSlide,
  topShows: TopShowsSlide,
  topMovie: TopMovieSlide,
  topMovies: TopMoviesSlide,
  binge: BingeSlide,
  rhythm: RhythmSlide,
  calendar: CalendarSlide,
  ratings: RatingsSlide,
  eras: ErasSlide,
  world: WorldSlide,
  people: PeopleSlide,
  milestones: MilestonesSlide,
  persona: PersonaSlide,
  summary: SummarySlide,
};
