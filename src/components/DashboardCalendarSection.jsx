// src/components/DashboardCalendarSection.jsx
// Sección "Calendario" del home: carrusel de próximos episodios de series.
// Muestra series populares por defecto y, con sesión, prioriza las series del
// usuario (en progreso, favoritos, pendientes) — datos de la BBDD propia, SIN
// Trakt. Patrón de carga igual que ContinueWatchingSection (SWR + se oculta vacía).
"use client";

import { useEffect, useRef, useState, memo } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import NextImage from "next/image";
import { differenceInCalendarDays } from "date-fns";
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Heart,
  Bookmark,
  Play,
  ImageOff,
} from "lucide-react";

import { fetchUpcomingEpisodes } from "@/lib/api/calendarEpisodes";
import { buildImg } from "@/lib/dashboard/media";
import { useScrollRevealProps } from "@/lib/hooks/useHasScrolled";

const EMPTY_ARRAY = [];
const CALENDAR_CACHE_KEY = "showverse:dashboard:calendar:v1";
const CALENDAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ---------- Caché stale-while-revalidate (localStorage) ---------- */
function readCalendarCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CALENDAR_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);
    if (
      !savedAt ||
      Date.now() - savedAt > CALENDAR_CACHE_TTL_MS ||
      !Array.isArray(parsed?.items) ||
      parsed.items.length === 0
    ) {
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCalendarCache(items) {
  if (typeof window === "undefined") return;
  try {
    if (Array.isArray(items) && items.length > 0) {
      window.localStorage.setItem(
        CALENDAR_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), items }),
      );
    } else {
      window.localStorage.removeItem(CALENDAR_CACHE_KEY);
    }
  } catch {
    // modo privado / cuota: ignorar
  }
}

/* ---------- Etiqueta de cuenta atrás en español ---------- */
function relativeAirLabel(airDate) {
  if (!airDate) return "";
  const target = new Date(`${airDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return "";
  const days = differenceInCalendarDays(target, new Date());
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === 2) return "Pasado mañana";
  if (days === -1) return "Ayer";
  if (days < 0) return `Hace ${Math.abs(days)} días`;
  if (days < 14) return `Dentro de ${days} días`;
  const weeks = Math.round(days / 7);
  return `Dentro de ${weeks} semana${weeks === 1 ? "" : "s"}`;
}

function isImminent(airDate) {
  if (!airDate) return false;
  const target = new Date(`${airDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return false;
  const days = differenceInCalendarDays(target, new Date());
  return days <= 1 && days >= -2;
}

/* ---------- Icono de origen (serie del usuario) ---------- */
function SourceIcon({ sources }) {
  const list = Array.isArray(sources) ? sources : EMPTY_ARRAY;
  if (list.includes("in_progress")) {
    return {
      Icon: Play,
      className: "bg-emerald-500/20 border-emerald-500/30 text-emerald-300",
      label: "En progreso",
    };
  }
  if (list.includes("favorite")) {
    return {
      Icon: Heart,
      className: "bg-rose-500/20 border-rose-500/30 text-rose-300",
      label: "Favorito",
    };
  }
  if (list.includes("watchlist")) {
    return {
      Icon: Bookmark,
      className: "bg-sky-500/20 border-sky-500/30 text-sky-300",
      label: "Pendiente",
    };
  }
  return null;
}

/* ====================================================================
 * Tarjeta de episodio (backdrop 16:9 + cuenta atrás + metadatos)
 * ==================================================================== */
function CalendarEpisodeCard({ item, eager }) {
  const [imgError, setImgError] = useState(false);
  const show = item?.show || {};
  const ep = item?.episode || {};
  const season = Number(ep?.season);
  const number = Number(ep?.number);
  const hasEpisode =
    Number.isFinite(season) && season > 0 && Number.isFinite(number) && number > 0;

  const href = hasEpisode
    ? `/details/tv/${show.tmdbId}/season/${season}/episode/${number}`
    : `/details/tv/${show.tmdbId}`;

  const backdrop = show.backdropPath || show.posterPath || null;
  const bgSrc = backdrop && !imgError ? buildImg(backdrop, "w780") : null;

  const isPremiere = season === 1 && number === 1;
  const countdown = relativeAirLabel(ep?.airDate);
  const soon = isImminent(ep?.airDate);
  const source = SourceIcon({ sources: item?.sources });

  return (
    <Link
      href={href}
      prefetch={false}
      className="group relative block h-full w-full overflow-hidden rounded-lg bg-neutral-900 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] transition-transform duration-300 hover:scale-[1.02]"
    >
      {bgSrc ? (
        <NextImage
          src={bgSrc}
          alt={show.title || "Episodio"}
          fill
          sizes="(min-width:1280px) 338px, (min-width:768px) 300px, 240px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          loading={eager ? "eager" : "lazy"}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-700">
          <ImageOff className="h-8 w-8 opacity-50" />
        </div>
      )}

      {/* Degradado inferior para legibilidad del texto */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/10" />

      {/* Esquina superior izquierda: origen + estreno */}
      <div className="absolute left-0 top-0 z-10 flex items-center gap-1.5 p-2">
        {source && (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide backdrop-blur-md ${source.className}`}
          >
            <source.Icon className="h-3 w-3" />
          </span>
        )}
        {isPremiere && (
          <span className="inline-flex items-center rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-black shadow">
            Estreno
          </span>
        )}
      </div>

      {/* Overlay inferior: cuenta atrás + título + episodio */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-3">
        {countdown && (
          <span
            className={`mb-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md ${
              soon
                ? "bg-amber-500/25 text-amber-200 border border-amber-500/30"
                : "bg-black/50 text-zinc-200 border border-white/10"
            }`}
          >
            {countdown}
          </span>
        )}
        <h3 className="line-clamp-1 text-sm font-black leading-tight text-white drop-shadow-md">
          {show.title || "Serie"}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-zinc-300">
          T{hasEpisode ? season : "?"} · E{hasEpisode ? number : "?"}
          {ep?.title ? ` - ${ep.title}` : " - TBA"}
        </p>
      </div>
    </Link>
  );
}

const MemoCard = memo(CalendarEpisodeCard);

/* ====================================================================
 * Sección Calendario
 * ==================================================================== */
function DashboardCalendarSection({ isMobile }) {
  const revealProps = useScrollRevealProps();
  // IMPORTANTE: se inicializa VACÍO (no se lee localStorage aquí). El servidor y
  // el primer render del cliente deben coincidir; leer la caché en el inicializar
  // daría [] en SSR y datos en cliente → error de hidratación. La caché se lee en
  // el efecto, ya montado.
  const [items, setItems] = useState(EMPTY_ARRAY);
  const swiperRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    // 1) Pinta al instante lo cacheado (stale-while-revalidate), ya en cliente.
    const cached = readCalendarCache();
    if (cached && cached.length) setItems(cached);

    // 2) Refresca desde el backend.
    const controller = new AbortController();
    (async () => {
      try {
        const next = await fetchUpcomingEpisodes({ signal: controller.signal });
        setItems(Array.isArray(next) ? next : EMPTY_ARRAY);
        writeCalendarCache(next);
      } catch {
        // AbortError u otros: conservamos la caché ya pintada.
      }
    })();
    return () => controller.abort();
  }, []);

  const updateNav = (swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
  };

  const slide = (dir) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const swiper = swiperRef.current;
    if (!swiper) return;
    const count = isMobile ? 1 : 3;
    for (let i = 0; i < count; i += 1) {
      if (dir === "prev") swiper.slidePrev();
      else swiper.slideNext();
    }
  };

  // Sin episodios (aún cargando sin caché, o ya cargada y vacía) → no se pinta
  // nada, evitando ruido y saltos de layout (igual que "Continuar viendo").
  if (items.length === 0) return null;

  return (
    <motion.div {...revealProps} variants={fadeInUp} className="relative group">
      <div className="mb-5 px-1 sm:px-0">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-px w-8 bg-amber-500" />
          <span className="text-amber-400 font-bold uppercase tracking-widest text-[10px]">
            Próximos episodios
          </span>
        </div>
        <Link
          href="/calendar"
          className="group/title inline-flex w-fit items-center gap-1.5 text-xl sm:text-2xl md:text-3xl font-black tracking-tighter bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-transparent transition hover:from-amber-100 hover:via-white hover:to-amber-200"
          aria-label="Ver el calendario completo"
        >
          <CalendarDays className="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" />
          <span>Calendario</span>
          <span className="text-amber-500">.</span>
          <ChevronRight className="h-5 w-5 translate-x-[-4px] text-amber-400 opacity-0 transition duration-200 group-hover/title:translate-x-0 group-hover/title:opacity-100 sm:h-6 sm:w-6" />
        </Link>
      </div>

      <div className="relative">
        <Swiper
          modules={[Navigation, FreeMode]}
          freeMode={{ enabled: true, momentum: true }}
          slidesPerView="auto"
          spaceBetween={isMobile ? 12 : 18}
          onSwiper={(s) => {
            swiperRef.current = s;
            updateNav(s);
          }}
          onSlideChange={updateNav}
          onResize={updateNav}
          className="!overflow-visible"
        >
          {items.map((item, index) => (
            <SwiperSlide
              key={item.id}
              className="!w-[240px] sm:!w-[268px] md:!w-[300px] xl:!w-[338px]"
            >
              <div className="aspect-video w-full">
                <MemoCard item={item} eager={index < (isMobile ? 2 : 4)} />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        <AnimatePresence>
          {!isMobile && canPrev && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={slide("prev")}
              aria-label="Anterior"
              className="absolute left-0 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/60 p-2 text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 sm:flex"
            >
              <ChevronLeft className="h-6 w-6" />
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!isMobile && canNext && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={slide("next")}
              aria-label="Siguiente"
              className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full bg-black/60 p-2 text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 sm:flex"
            >
              <ChevronRight className="h-6 w-6" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default memo(DashboardCalendarSection);
