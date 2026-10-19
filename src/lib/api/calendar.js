// Fecha en hora LOCAL para las consultas.
//
// `toISOString()` pasa a UTC, y en horario de verano español eso retrocede un
// día: el 1 de agosto a las 00:00 locales se envía como "2026-07-31". La ventana
// arrancaba un día antes de la cuenta y colaba el mes anterior como primer grupo
// del listado.
export function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// LA FECHA QUE DEVUELVE `discover` NO ES LA QUE SE HA FILTRADO.
//
// Con `region=ES`, TMDB selecciona las películas por sus fechas de estreno EN
// ESPAÑA —y le vale CUALQUIER tipo: première, cines, digital…— pero cada
// resultado trae en `release_date` su fecha PRIMARIA, que suele ser otra.
// Pidiendo agosto de 2026 vuelven títulos fechados en octubre de 2025, y
// agrupar por esa fecha desparrama la lista en meses que no se han pedido.
//
// Ejemplo real: "Backrooms" entra en agosto de 2026 por su première española
// (01-08-2026), pero su `release_date` es 05-06-2026, su estreno en cines.
// Ojo, entonces: la fecha buena NO es la del estreno en cines, sino la que cae
// DENTRO de la ventana consultada, que es la razón por la que TMDB la devuelve.
//
// Y hay ruido de verdad: títulos sin ninguna fecha española en la ventana
// ("Yes", solo 31-10-2025). Esos no pertenecen al periodo y se descartan; si no,
// aparecen como un grupo suelto de un mes que nadie ha pedido.
const spanishReleasesCache = new Map();

// `fetchInit`: opciones de `fetch` del que llama. En el servidor (página del
// Calendario) van con la caché de datos de Next; en el navegador, sin nada.
async function fetchSpanishReleases(movieId, fetchInit) {
  if (spanishReleasesCache.has(movieId)) return spanishReleasesCache.get(movieId);

  let dates = [];
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
      fetchInit,
    );
    if (res.ok) {
      const json = await res.json();
      const spain = (json?.results || []).find((r) => r?.iso_3166_1 === "ES");
      dates = (spain?.release_dates || [])
        .map((entry) => String(entry?.release_date || "").slice(0, 10))
        .filter(Boolean)
        .sort();
    }
  } catch {
    // Sin red o ficha incompleta: se queda como estaba y decide el que llama.
  }

  spanishReleasesCache.set(movieId, dates);
  return dates;
}

async function applySpanishReleaseDates(movies, start, end, fetchInit) {
  const inRange = (date) => date && date >= start && date <= end;
  const needsFix = movies.filter((movie) => !inRange(movie?.release_date));
  if (needsFix.length === 0) return movies;

  // En tandas: cada película descuadrada es una petición y un mes cargado puede
  // traer veinte. Todas a la vez y TMDB empieza a cortar.
  const batchSize = 8;
  const resolved = new Map();
  for (let i = 0; i < needsFix.length; i += batchSize) {
    const batch = needsFix.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((movie) => fetchSpanishReleases(movie.id, fetchInit)),
    );
    batch.forEach((movie, index) => {
      resolved.set(movie.id, results[index].find(inRange) || null);
    });
  }

  return movies.reduce((acc, movie) => {
    if (inRange(movie?.release_date)) {
      acc.push(movie);
    } else if (resolved.get(movie.id)) {
      acc.push({ ...movie, release_date: resolved.get(movie.id) });
    }
    // Sin fecha española en la ventana: fuera, no es de este periodo.
    return acc;
  }, []);
}

export async function getMoviesByDateRange(startDate, endDate, { fetchInit } = {}) {
  const formattedStart = ymd(startDate);
  const formattedEnd = ymd(endDate);
  let page = 1;
  let totalPages = 1;
  const movies = [];

  do {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&sort_by=release_date.asc&release_date.gte=${formattedStart}&release_date.lte=${formattedEnd}&region=ES&page=${page}`;

    const res = await fetch(url, fetchInit);
    const data = await res.json();

    if (data?.results?.length > 0) {
      movies.push(...data.results);
    }

    totalPages = data.total_pages || 1;
    page++;
  } while (page <= totalPages && page <= 5); // Limitar a 5 páginas para rangos amplios

  return applySpanishReleaseDates(movies, formattedStart, formattedEnd, fetchInit);
}

// Una consulta a `discover` se corta en 5 páginas (100 películas) y viene
// ordenada por fecha ascendente, así que en una ventana de dos años las 100 se
// agotan dentro del primero y del segundo no llega nada: agrupar por año
// enseñaba un único grupo. Partiendo la ventana por años naturales, cada año
// gasta su propio presupuesto de páginas.
export async function getMoviesByWindow(startDate, endDate, options = {}) {
  const segments = [];
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const yearEnd = new Date(cursor.getFullYear(), 11, 31);
    const segmentEnd = yearEnd < endDate ? yearEnd : endDate;
    segments.push([new Date(cursor), segmentEnd]);
    cursor = new Date(cursor.getFullYear() + 1, 0, 1);
  }

  const results = await Promise.all(
    segments.map(([from, to]) => getMoviesByDateRange(from, to, options)),
  );

  // Un estreno puede aparecer en dos segmentos si tiene fechas en ambos.
  const byId = new Map();
  for (const movies of results) {
    for (const movie of movies) {
      if (!byId.has(movie.id)) byId.set(movie.id, movie);
    }
  }
  return [...byId.values()];
}

// El backend acota `days` a 62 (ver backend/src/dashboard/calendarRange.js), así
// que una ventana larga se pide a trozos y se junta. Sin esto, agrupar por mes o
// por año enseñaría episodios solo de los dos primeros meses, en silencio.
const MAX_DAYS_PER_REQUEST = 62;
const MAX_CHUNKS = 12;

// Trozos de la ventana [startDate, endDate]: [inicio, días] de hasta 62 días.
export function episodeWindowChunks(startDate, endDate) {
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays =
    Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / dayMs)) +
    1;
  const chunkCount = Math.min(
    MAX_CHUNKS,
    Math.ceil(totalDays / MAX_DAYS_PER_REQUEST),
  );

  return Array.from({ length: chunkCount }, (_, index) => {
    const chunkStart = new Date(
      startDate.getTime() + index * MAX_DAYS_PER_REQUEST * dayMs,
    );
    const remaining = totalDays - index * MAX_DAYS_PER_REQUEST;
    return [chunkStart, Math.min(MAX_DAYS_PER_REQUEST, remaining)];
  });
}

// Episodios de los trozos que ya han llegado ([{ items }], en orden), juntos.
export function mergeEpisodeChunks(results) {
  // Un episodio puede repetirse si dos trozos se rozan: gana el primero.
  const byId = new Map();
  for (const result of results) {
    for (const item of result?.items || []) {
      const key = String(item?.id ?? `${item?.show?.tmdbId}-${item?.first_aired}`);
      if (!byId.has(key)) byId.set(key, item);
    }
  }
  return { connected: true, items: [...byId.values()] };
}

// `ranges=AAAA-MM-DD:días,…`: varios trozos en UNA petición. El backend lee
// cada serie una vez para todos (antes, una por trozo, y atendía los trozos en
// fila: ~0,6-1,9 s la ventana de 12 meses frente a ~0,2 s).
export function episodeRangesParam(chunks) {
  return chunks.map(([start, days]) => `${ymd(start)}:${days}`).join(",");
}

// Todos los trozos por la ruta de la API en una petición. `null` si el backend
// no entiende `ranges` (aún sin desplegar): el que llama los pide uno a uno.
export async function getTrackedEpisodesByRanges(chunks) {
  const params = new URLSearchParams({ ranges: episodeRangesParam(chunks) });
  const res = await fetch(`/api/calendar/episodes-range?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return mapEpisodeRanges(await res.json(), chunks.length);
}

// `{ ranges: [{ items }] }` → [{ items }] con la forma de la página (o null).
export function mapEpisodeRanges(json, expected) {
  const ranges = Array.isArray(json?.ranges) ? json.ranges : null;
  if (!ranges || ranges.length !== expected) return null;
  return ranges.map((range) => mapEpisodeRangeItems(range));
}

// `fetchRanges(chunks)` pide todos los trozos de una vez; por defecto, la ruta
// de la API desde el navegador. La página del Calendario pasa la suya para
// pedirlo en el servidor directamente al backend. Si no puede (null), se
// piden uno a uno con `fetchRange(start, days)`.
export async function getTrackedEpisodesByWindow(
  startDate,
  endDate,
  {
    fetchRanges = getTrackedEpisodesByRanges,
    fetchRange = getTrackedEpisodesByDateRange,
  } = {},
) {
  const chunks = episodeWindowChunks(startDate, endDate);
  const batched = await fetchRanges(chunks).catch(() => null);
  if (batched) return mergeEpisodeChunks(batched);
  return mergeEpisodeChunks(
    await Promise.all(chunks.map(([start, days]) => fetchRange(start, days))),
  );
}

export async function getTrackedEpisodesByDateRange(startDate, days) {
  const formattedStart = ymd(startDate);
  const params = new URLSearchParams({
    start: formattedStart,
    days: String(days),
  });

  const res = await fetch(`/api/calendar/episodes-range?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) return { connected: true, items: [] };

  return mapEpisodeRangeItems(await res.json());
}

// Respuesta de /v1/calendar/episodes (o de su ruta proxy) → forma de la página.
export function mapEpisodeRangeItems(json) {
  const items = (json?.items || []).map((e) => ({
    id: e.id,
    type: "episode",
    source: e.sources || [],
    first_aired: e.episode?.airDate || null,
    show: {
      tmdbId: e.show?.tmdbId,
      title: e.show?.title,
      poster_path: e.show?.posterPath,
      backdrop_path: e.show?.backdropPath,
    },
    episode: {
      season: e.episode?.season,
      number: e.episode?.number,
      title: e.episode?.title,
    },
  }));

  return { connected: true, items };
}

// Fecha de emisión → Date. El backend la da como día sin hora ("2026-10-01"):
// `new Date("2026-10-01")` es la medianoche UTC, que al oeste de Greenwich cae
// el día anterior y, además, cambia según la zona horaria de quien la pinta
// (servidor y navegador no coincidirían al hidratar). Como día que es, se toma
// a medianoche LOCAL, igual que las fechas de estreno.
export function parseAirDate(value) {
  if (!value) return null;
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}
