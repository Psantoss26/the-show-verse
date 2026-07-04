// Sección "Calendario" del home: carga próximos episodios desde la BBDD propia
// + TMDB y reutiliza el carrusel horizontal de "Continuar viendo" para que
// tarjeta, expansión, tráiler y navegación tengan exactamente el mismo patrón.
"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";

import ContinueWatchingSection from "@/components/ContinueWatchingSection";
import { fetchUpcomingEpisodes } from "@/lib/api/calendarEpisodes";

const EMPTY_ARRAY = [];
const CALENDAR_CACHE_KEY = "showverse:dashboard:calendar:v2";
const CALENDAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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
    // Modo privado o cuota agotada: la sección sigue funcionando sin caché.
  }
}

function calendarMeta(airDate, season, episode) {
  if (!airDate) {
    return {
      countdown: "Próximamente",
      isPremiere: season === 1 && episode === 1,
    };
  }

  const target = new Date(`${airDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return {
      countdown: "Próximamente",
      isPremiere: season === 1 && episode === 1,
    };
  }

  const days = differenceInCalendarDays(target, new Date());
  let countdown;
  if (days === 0) countdown = "Hoy";
  else if (days === 1) countdown = "Mañana";
  else if (days === 2) countdown = "Pasado mañana";
  else if (days === -1) countdown = "Ayer";
  else if (days < 0) countdown = `Hace ${Math.abs(days)} días`;
  else if (days < 14) countdown = `Dentro de ${days} días`;
  else {
    const weeks = Math.round(days / 7);
    countdown = `Dentro de ${weeks} semana${weeks === 1 ? "" : "s"}`;
  }

  return {
    countdown,
    isPremiere: season === 1 && episode === 1,
  };
}

function toLandscapeShow(item) {
  const show = item?.show || {};
  const episode = item?.episode || {};
  const id = Number(show.tmdbId);
  const season = Number(episode.season);
  const number = Number(episode.number);
  if (!Number.isFinite(id)) return null;

  return {
    id,
    title: show.title || "Serie",
    backdrop_path: show.backdropPath || null,
    poster_path: show.posterPath || null,
    overview: null,
    genres: EMPTY_ARRAY,
    nextEpisode:
      Number.isFinite(season) && Number.isFinite(number)
        ? {
            season,
            number,
            title: episode.title || null,
            airDate: episode.airDate || null,
          }
        : null,
    calendar: {
      ...calendarMeta(episode.airDate, season, number),
      sources: Array.isArray(item?.sources) ? item.sources : EMPTY_ARRAY,
    },
  };
}

function DashboardCalendarSection({ isMobile, hydrated }) {
  const [items, setItems] = useState(EMPTY_ARRAY);

  useEffect(() => {
    const cached = readCalendarCache();
    if (cached?.length) setItems(cached);

    const controller = new AbortController();
    fetchUpcomingEpisodes({ signal: controller.signal })
      .then((next) => {
        const safeItems = Array.isArray(next) ? next : EMPTY_ARRAY;
        setItems(safeItems);
        writeCalendarCache(safeItems);
      })
      .catch(() => {
        // Conservamos la caché ya pintada si la revalidación falla.
      });

    return () => controller.abort();
  }, []);

  const shows = useMemo(
    () => items.map(toLandscapeShow).filter(Boolean),
    [items],
  );

  if (shows.length === 0) return null;

  return (
    <ContinueWatchingSection
      isMobile={isMobile}
      hydrated={hydrated}
      externalShows={shows}
      mode="calendar"
    />
  );
}

export default memo(DashboardCalendarSection);
