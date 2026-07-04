// src/lib/api/calendarEpisodes.js
// Cliente de la sección "Calendario" del home: próximos episodios de series.
// Sin Trakt — el backend usa la BBDD propia + TMDB.

export async function fetchUpcomingEpisodes({ signal } = {}) {
  try {
    const res = await fetch("/api/calendar/upcoming-episodes", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return Array.isArray(json?.items) ? json.items : [];
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return [];
  }
}
