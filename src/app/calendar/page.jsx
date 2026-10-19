import { cookies, headers } from "next/headers";
import { endOfMonth, startOfMonth } from "date-fns";
import CalendarClient from "./CalendarClient";
import {
  getMoviesByDateRange,
  getMoviesByWindow,
  episodeRangesParam,
  episodeWindowChunks,
  mapEpisodeRangeItems,
  mapEpisodeRanges,
  mergeEpisodeChunks,
  ymd,
} from "@/lib/api/calendar";
import {
  backendFetchPublicJson,
  getBackendAccessToken,
  getBackendRefreshToken,
} from "@/lib/backend/server";
import {
  CALENDAR_TZ_COOKIE,
  calendarMonthKey,
  calendarWindow,
  calendarWindowKey,
  countItemsByDay,
  dateFromYmd,
  readCalendarSettings,
  todayYmdInTimeZone,
} from "@/lib/calendar/calendarWindow";

export const metadata = {
  title: "Calendario",
};

// Lo que puede esperar el servidor a los datos antes de responder. Sin
// loading.jsx, la navegación espera al RSC con la página anterior a la vista.
// Si se pasa, la página llega sin ellos y los pide el cliente, como antes.
const SSR_BUDGET_MS = 2500;
// Estrenos (TMDb) con la caché de datos de Next: son públicos y cambian poco.
const TMDB_FETCH = { cache: "force-cache", next: { revalidate: 60 * 60 } };

// Solo lo que pinta la tarjeta: la respuesta de TMDb trae mucho más y todo
// viajaría en el HTML.
function slimMovie(movie) {
  return {
    id: movie.id,
    media_type: movie.media_type,
    title: movie.title,
    name: movie.name,
    release_date: movie.release_date,
    first_air_date: movie.first_air_date,
    poster_path: movie.poster_path || null,
    backdrop_path: movie.backdrop_path || null,
  };
}

function withBudget(promise) {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), SSR_BUDGET_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Los datos de la ventana por defecto (la de la agrupación guardada, desde el
// mes de hoy) y del mes del panel lateral, ya en el RSC.
//
// Los episodios van con el token de acceso de la cookie y NUNCA con el de
// refresco: un render no puede escribir cookies, así que refrescar aquí
// rotaría el token del usuario sin guardar el nuevo. Si solo queda el de
// refresco, los episodios serían los anónimos: no se entrega nada y lo pide
// el cliente por la ruta de la API, que sí refresca y guarda.
async function loadInitialCalendar({ today, groupBy, cookieStore, headerList }) {
  const accessCookies = {
    get: (name) => (/refresh/i.test(name) ? undefined : cookieStore.get(name)),
  };
  const request = { cookies: accessCookies, headers: headerList };
  if (
    !getBackendAccessToken(request) &&
    getBackendRefreshToken({ cookies: cookieStore })
  ) {
    return null;
  }

  const selected = dateFromYmd(today);
  const range = calendarWindow(selected, groupBy);
  const monthStart = startOfMonth(selected);
  const monthEnd = endOfMonth(selected);
  const sameAsMonth = groupBy === "day";

  const getEpisodes = async (path) => {
    const result = await backendFetchPublicJson(request, path, { method: "GET" });
    if (!result?.ok) throw new Error(result?.error || "Sin episodios");
    return result.json;
  };

  // Episodios de la ventana (sus trozos de 62 días) y del mes del panel, en
  // UNA petición (`ranges=`). Si el backend aún no la entiende, trozo a trozo.
  const loadEpisodes = async () => {
    const chunks = episodeWindowChunks(range.start, range.end);
    const all = sameAsMonth
      ? chunks
      : [...chunks, [monthStart, monthEnd.getDate()]];
    const batched = mapEpisodeRanges(
      await getEpisodes(
        `/v1/calendar/episodes?ranges=${encodeURIComponent(episodeRangesParam(all))}`,
      ),
      all.length,
    );
    const lists =
      batched ||
      (await Promise.all(
        all.map(async ([start, days]) => {
          const json = await getEpisodes(
            `/v1/calendar/episodes?start=${ymd(start)}&days=${days}`,
          );
          if (!Array.isArray(json?.items)) throw new Error("Sin episodios");
          return mapEpisodeRangeItems(json);
        }),
      ));
    return {
      window: mergeEpisodeChunks(lists.slice(0, chunks.length)),
      month: sameAsMonth ? null : lists[chunks.length],
    };
  };

  const load = async () => {
    const [movies, episodeData, monthMovies] = await Promise.all([
      getMoviesByWindow(range.start, range.end, { fetchInit: TMDB_FETCH }),
      loadEpisodes(),
      sameAsMonth
        ? null
        : getMoviesByDateRange(monthStart, monthEnd, { fetchInit: TMDB_FETCH }).catch(
            () => [],
          ),
    ]);
    const episodes = episodeData.window;
    const monthEpisodes = episodeData.month;
    return {
      today,
      windowKey: calendarWindowKey(range),
      movies: movies.map(slimMovie),
      episodes: episodes.items,
      monthKey: calendarMonthKey(monthStart),
      monthCounts: sameAsMonth
        ? countItemsByDay(movies, episodes.items)
        : countItemsByDay(monthMovies, monthEpisodes?.items),
    };
  };

  try {
    return await withBudget(load());
  } catch {
    return null;
  }
}

export default async function CalendarPage() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const settings = readCalendarSettings(cookieStore);
  let timeZone = "";
  try {
    timeZone = decodeURIComponent(cookieStore.get(CALENDAR_TZ_COOKIE)?.value || "");
  } catch {
    // Cookie mal formada: la zona por defecto.
  }
  const today = todayYmdInTimeZone(timeZone);
  const initialCalendar = await loadInitialCalendar({
    today,
    groupBy: settings.groupBy || "month",
    cookieStore,
    headerList,
  });

  return (
    <CalendarClient
      initialToday={today}
      initialCalendar={initialCalendar}
      initialSettings={settings}
    />
  );
}
