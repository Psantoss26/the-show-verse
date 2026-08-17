// backend/src/level/streaks.js
// Rachas de días con actividad. Módulo puro.
//
// Se calculan a partir de las fechas distintas de watch_history. Un día "cuenta"
// en UTC, igual que el resto de los agregados del perfil, para que la racha no
// dependa del huso del visitante.

const MS_PER_DAY = 86_400_000;

/** Normaliza una fecha (Date o cadena) a 'YYYY-MM-DD' en UTC, o null. */
function toDayKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  // Las fechas que devuelve Postgres como texto ya vienen en ISO; para el resto
  // se delega en Date y se descarta lo que no parsee.
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(text);
  if (iso) return iso[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Días enteros entre dos claves 'YYYY-MM-DD' (b − a). */
function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * Racha actual, racha máxima y días activos.
 *
 * La racha actual admite un día de gracia: si la última actividad fue ayer sigue
 * viva, porque consultar el perfil por la mañana no debería romper una racha que
 * se alimenta viendo cosas por la noche.
 *
 * @param {Array<string|Date>} dates fechas con actividad (pueden repetirse y venir desordenadas)
 * @param {{ today?: string|Date }} [options] día de referencia; por defecto, hoy en UTC
 */
export function computeStreaks(dates, options = {}) {
  const today = toDayKey(options.today ?? new Date()) ?? new Date().toISOString().slice(0, 10);

  const days = [...new Set((Array.isArray(dates) ? dates : []).map(toDayKey).filter(Boolean))].sort();

  if (days.length === 0) {
    return { current: 0, longest: 0, activeDays: 0, lastActiveDate: null };
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    run = dayDiff(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // La racha actual solo existe si el último día activo es hoy o ayer. Fechas por
  // delante de hoy (imports con datos sucios) no abren una racha desde el futuro.
  const lastActiveDate = days.at(-1);
  const distanceToToday = dayDiff(lastActiveDate, today);
  let current = 0;
  if (distanceToToday === 0 || distanceToToday === 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i -= 1) {
      if (dayDiff(days[i - 1], days[i]) !== 1) break;
      current += 1;
    }
  }

  return { current, longest, activeDays: days.length, lastActiveDate };
}
