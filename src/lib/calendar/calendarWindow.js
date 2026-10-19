// Piezas del Calendario que comparten la página de servidor (que entrega los
// datos ya en el RSC) y el cliente (que los pide al cambiar de periodo): la
// ventana de fechas de cada agrupación, la cuenta de títulos por día del panel
// lateral y los ajustes del menú guardados en cookie.

import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { parseAirDate, ymd } from "@/lib/api/calendar";

// Meses que se consultan por cada modo de agrupación: uno más que la unidad con
// la que se agrupa, para que cada grupo tenga hermanos con los que compararse.
// Agrupar por día sin más de un mes por delante no enseñaría nada nuevo.
export const RANGE_MONTHS = { day: 1, month: 12, year: 24 };

/** Ventana que se consulta: empieza en el mes de `date`. */
export function calendarWindow(date, groupBy) {
  const start = startOfMonth(date);
  const end = endOfMonth(addMonths(start, (RANGE_MONTHS[groupBy] || 12) - 1));
  return { start, end };
}

export function calendarWindowKey({ start, end }) {
  return `${ymd(start)}_${ymd(end)}`;
}

export function calendarMonthKey(date) {
  return format(date, "yyyy-MM");
}

// Días marcados del panel lateral: cuántos estrenos y episodios caen cada día.
export function countItemsByDay(movies, episodes) {
  const counts = {};
  const bump = (key) => {
    if (key) counts[key] = (counts[key] || 0) + 1;
  };
  for (const movie of Array.isArray(movies) ? movies : []) {
    const raw = movie?.release_date || movie?.first_air_date;
    // Las fechas de estreno ya vienen como "YYYY-MM-DD" sin hora.
    if (raw) bump(String(raw).slice(0, 10));
  }
  for (const item of Array.isArray(episodes) ? episodes : []) {
    const aired = parseAirDate(item?.first_aired);
    if (aired) bump(ymd(aired));
  }
  return counts;
}

// "Hoy" del visitante en su zona horaria (la guarda el cliente en una cookie;
// sin ella, la de España). El servidor corre en UTC: a medianoche no sería el
// mismo día —ni, el último día del mes, el mismo mes— que ve el navegador.
export const CALENDAR_TZ_COOKIE = "showverse_tz";
export const CALENDAR_DEFAULT_TZ = "Europe/Madrid";

export function todayYmdInTimeZone(timeZone) {
  const read = (tz) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  try {
    return read(timeZone || CALENDAR_DEFAULT_TZ);
  } catch {
    return read(CALENDAR_DEFAULT_TZ);
  }
}

/** "2026-10-19" → Date a medianoche local (o null). */
export function dateFromYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// AJUSTES DEL MENÚ EN COOKIE (además de localStorage), para que el servidor
// pinte ya la vista del usuario y pida la ventana de SU agrupación. Leídos solo
// en el cliente, la página nacía con los de por defecto y saltaba tras hidratar.
export const CALENDAR_SETTINGS = {
  typeFilter: ["all", "movies", "episodes"],
  groupBy: ["day", "month", "year"],
  sortBy: ["date-asc", "date-desc", "title-asc", "title-desc"],
  cardView: ["list", "compact", "grid"],
};

export function calendarSettingCookie(field) {
  return `showverse_calendar_${field}`;
}

/** { typeFilter, groupBy, sortBy, cardView } válidos de las cookies (o null). */
export function readCalendarSettings(cookieStore) {
  return Object.fromEntries(
    Object.entries(CALENDAR_SETTINGS).map(([field, allowed]) => {
      const value = cookieStore?.get?.(calendarSettingCookie(field))?.value;
      return [field, allowed.includes(value) ? value : null];
    }),
  );
}

export function writeCalendarSettingCookie(field, value) {
  if (typeof document === "undefined") return;
  if (!CALENDAR_SETTINGS[field]?.includes(value)) return;
  try {
    document.cookie = `${calendarSettingCookie(field)}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Sin cookies: queda localStorage.
  }
}

export function writeCalendarTimeZoneCookie() {
  if (typeof document === "undefined") return;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    document.cookie = `${CALENDAR_TZ_COOKIE}=${encodeURIComponent(tz)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Sin cookies: el servidor supone la hora de España.
  }
}
