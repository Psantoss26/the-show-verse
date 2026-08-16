// Fecha en hora LOCAL para las consultas.
//
// `toISOString()` pasa a UTC, y en horario de verano español eso retrocede un
// día: el 1 de agosto a las 00:00 locales se envía como "2026-07-31". La ventana
// arrancaba un día antes de la cuenta y colaba el mes anterior como primer grupo
// del listado.
function ymd(date) {
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

async function fetchSpanishReleases(movieId) {
  if (spanishReleasesCache.has(movieId)) return spanishReleasesCache.get(movieId);

  let dates = [];
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}/release_dates?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
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

async function applySpanishReleaseDates(movies, start, end) {
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
      batch.map((movie) => fetchSpanishReleases(movie.id)),
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

export async function getMoviesByDateRange(startDate, endDate) {
  const formattedStart = ymd(startDate);
  const formattedEnd = ymd(endDate);
  let page = 1;
  let totalPages = 1;
  const movies = [];

  do {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&sort_by=release_date.asc&release_date.gte=${formattedStart}&release_date.lte=${formattedEnd}&region=ES&page=${page}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data?.results?.length > 0) {
      movies.push(...data.results);
    }

    totalPages = data.total_pages || 1;
    page++;
  } while (page <= totalPages && page <= 5); // Limitar a 5 páginas para rangos amplios

  return applySpanishReleaseDates(movies, formattedStart, formattedEnd);
}

// Una consulta a `discover` se corta en 5 páginas (100 películas) y viene
// ordenada por fecha ascendente, así que en una ventana de dos años las 100 se
// agotan dentro del primero y del segundo no llega nada: agrupar por año
// enseñaba un único grupo. Partiendo la ventana por años naturales, cada año
// gasta su propio presupuesto de páginas.
export async function getMoviesByWindow(startDate, endDate) {
  const segments = [];
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    const yearEnd = new Date(cursor.getFullYear(), 11, 31);
    const segmentEnd = yearEnd < endDate ? yearEnd : endDate;
    segments.push([new Date(cursor), segmentEnd]);
    cursor = new Date(cursor.getFullYear() + 1, 0, 1);
  }

  const results = await Promise.all(
    segments.map(([from, to]) => getMoviesByDateRange(from, to)),
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

export async function getTrackedEpisodesByWindow(startDate, endDate) {
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays =
    Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / dayMs)) +
    1;
  const chunkCount = Math.min(
    MAX_CHUNKS,
    Math.ceil(totalDays / MAX_DAYS_PER_REQUEST),
  );

  const chunks = Array.from({ length: chunkCount }, (_, index) => {
    const chunkStart = new Date(
      startDate.getTime() + index * MAX_DAYS_PER_REQUEST * dayMs,
    );
    const remaining = totalDays - index * MAX_DAYS_PER_REQUEST;
    return getTrackedEpisodesByDateRange(
      chunkStart,
      Math.min(MAX_DAYS_PER_REQUEST, remaining),
    );
  });

  const results = await Promise.all(chunks);

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

  const json = await res.json();
  const items = (json.items || []).map((e) => ({
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
