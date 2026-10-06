// src/lib/neuralGraphCore.js
// Reglas PURAS de la vista neuronal del perfil (sin BD ni red), para poder
// probarlas con node:test. La consulta y la caché viven en neuralGraph.js.
//
// La vista es un grafo al estilo de la de Obsidian: cada título registrado por
// el usuario es un nodo, y se une a nodos "hub" de sus GÉNEROS y de su SAGA. Los
// títulos que comparten géneros acaban juntos y los grupos salen solos de la
// simulación de fuerzas; no hace falta clasificar nada a mano.

// Versión del formato: cambiarla invalida las cachés (servidor y cliente).
export const NEURAL_GRAPH_VERSION = 3;

// Flags de cada título (bits): qué registros tiene el usuario sobre él.
export const FLAG_WATCHED = 1;
export const FLAG_RATED = 2;
export const FLAG_FAVORITE = 4;
export const FLAG_WATCHLIST = 8;

// GÉNEROS UNIFICADOS. TMDb usa ids distintos para series y películas, y los de
// series mezclan dos géneros ("Action & Adventure", "Sci-Fi & Fantasy"). Sin
// unificarlos, una serie de ciencia ficción y una película de ciencia ficción
// caerían en grupos distintos. Se llevan todos al género de cine equivalente.
// "Película de TV" (10770) no dice nada del contenido: no forma grupo.
export const GENRE_NAMES = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia ficción',
  53: 'Suspense',
  10752: 'Bélica',
  37: 'Western',
  10763: 'Noticias',
  10764: 'Reality',
  10766: 'Telenovela',
  10767: 'Talk show',
};

const TV_GENRE_MAP = {
  10759: [28, 12], // Action & Adventure
  10762: [10751], // Kids
  10765: [878, 14], // Sci-Fi & Fantasy
  10768: [10752], // War & Politics
};

const DROPPED_GENRES = new Set([10770]);

/** Ids de género unificados de un título, sin repetir y en el orden de TMDb. */
export function unifyGenres(genres) {
  const out = [];
  for (const genre of Array.isArray(genres) ? genres : []) {
    const id = Number(typeof genre === 'object' ? genre?.id : genre);
    if (!Number.isInteger(id) || DROPPED_GENRES.has(id)) continue;
    for (const mapped of TV_GENRE_MAP[id] || [id]) {
      if (GENRE_NAMES[mapped] && !out.includes(mapped)) out.push(mapped);
    }
  }
  return out;
}

export function titleKey(mediaType, tmdbId) {
  return `${mediaType}:${Number(tmdbId)}`;
}

function laterDate(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return tb > ta ? b : a;
}

/**
 * Junta los registros del usuario en UN título por (tipo, id).
 * @param sources { history, ratings, favorites, watchlist }: filas con
 *   tmdbId, mediaType, title, posterPath y, según la fuente, plays/lastAt o rating.
 * @returns Map<key, { tmdbId, mediaType, title, posterPath, plays, rating, flags, lastAt }>
 */
export function mergeTitleRecords({ history = [], ratings = [], favorites = [], watchlist = [] } = {}) {
  const titles = new Map();
  const touch = (row, flag) => {
    const tmdbId = Number(row?.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !['movie', 'tv'].includes(row?.mediaType)) return null;
    const key = titleKey(row.mediaType, tmdbId);
    let title = titles.get(key);
    if (!title) {
      title = { tmdbId, mediaType: row.mediaType, title: null, posterPath: null, plays: 0, rating: 0, flags: 0, lastAt: null, months: [] };
      titles.set(key, title);
    }
    title.flags |= flag;
    if (!title.title && row.title) title.title = row.title;
    if (!title.posterPath && row.posterPath) title.posterPath = row.posterPath;
    title.lastAt = laterDate(title.lastAt, row.lastAt || row.at || null);
    return title;
  };

  for (const row of history) {
    const title = touch(row, FLAG_WATCHED);
    if (!title) continue;
    title.plays += Math.max(0, Number(row.plays) || 0);
    // Meses de visionado (AAAAMM), para agrupar por año y mes.
    for (const month of Array.isArray(row.months) ? row.months : []) {
      const value = Number(month);
      if (Number.isInteger(value) && value >= 190001 && value <= 299912 && !title.months.includes(value)) title.months.push(value);
    }
    title.months.sort((a, b) => a - b);
  }
  for (const row of ratings) {
    const title = touch(row, FLAG_RATED);
    if (title) title.rating = Number(row.rating) || 0;
  }
  for (const row of favorites) touch(row, FLAG_FAVORITE);
  for (const row of watchlist) touch(row, FLAG_WATCHLIST);
  return titles;
}

/**
 * Carga útil compacta del grafo. Los enlaces NO viajan: el cliente los deriva
 * de los índices de género y saga de cada título, así la respuesta crece con
 * los títulos y no con sus conexiones.
 *
 * @param titles  resultado de mergeTitleRecords.
 * @param metaByKey Map<key, { name, posterPath, date, genres, collection, budget, revenue, imdbId }>.
 * @param lists   listas del usuario y de la comunidad que ha guardado:
 *   [{ id, name, kind: 'own'|'community', keys: Set<key> }].
 * @returns {{
 *   genres: Array<[id, name]>,
 *   sagas: Array<[id, name]>,
 *   lists: Array<[id, name, kind]>,
 *   titles: Array<[tmdbId, isTv(0|1), title, posterPath, year, genreIdx[], sagaIdx, plays, rating, flags,
 *                  months[] (AAAAMM), listIdx[], budget, revenue, imdbId]>,
 *   missing: number,
 * }}
 */
export function packNeuralGraph(titles, metaByKey, lists = []) {
  const genreIndex = new Map();
  const genres = [];
  const sagaCounts = new Map();
  const sagaNames = new Map();
  let missing = 0;

  const rows = [];
  for (const [key, title] of titles) {
    const meta = metaByKey.get(key);
    if (!meta) missing += 1;
    const genreIds = unifyGenres(meta?.genres);
    const collection = title.mediaType === 'movie' ? meta?.collection : null;
    const sagaId = Number(collection?.id) || null;
    if (sagaId) {
      sagaCounts.set(sagaId, (sagaCounts.get(sagaId) || 0) + 1);
      if (!sagaNames.has(sagaId) && collection?.name) sagaNames.set(sagaId, collection.name);
    }
    rows.push({ title, meta, genreIds, sagaId });
  }

  // Una saga de la que el usuario solo tiene UNA película no agrupa nada: sería
  // un hub con un único enlace. Solo cuentan las que unen dos o más títulos.
  const sagaIndex = new Map();
  const sagas = [];
  for (const [id, count] of sagaCounts) {
    if (count < 2) continue;
    sagaIndex.set(id, sagas.length);
    sagas.push([id, String(sagaNames.get(id) || 'Saga').replace(/\s*-\s*Colecci[oó]n$/i, '').replace(/\s+Collection$/i, '')]);
  }

  // Listas: solo las que reúnen algún título del usuario.
  const listRows = [];
  const listsByKey = new Map();
  for (const list of Array.isArray(lists) ? lists : []) {
    const keys = [...(list?.keys || [])].filter((key) => titles.has(key));
    if (!keys.length || !list.id) continue;
    const index = listRows.length;
    listRows.push([String(list.id), String(list.name || 'Lista').slice(0, 80), list.kind === 'community' ? 'community' : 'own']);
    for (const key of keys) {
      if (!listsByKey.has(key)) listsByKey.set(key, []);
      listsByKey.get(key).push(index);
    }
  }

  const money = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };

  const packed = rows.map(({ title, meta, genreIds, sagaId }) => {
    const genreIdx = genreIds.map((id) => {
      if (!genreIndex.has(id)) {
        genreIndex.set(id, genres.length);
        genres.push([id, GENRE_NAMES[id]]);
      }
      return genreIndex.get(id);
    });
    const year = Number(String(meta?.date || '').slice(0, 4)) || 0;
    return [
      title.tmdbId,
      title.mediaType === 'tv' ? 1 : 0,
      meta?.name || title.title || '',
      title.posterPath || meta?.posterPath || '',
      year,
      genreIdx,
      sagaId && sagaIndex.has(sagaId) ? sagaIndex.get(sagaId) : -1,
      title.plays,
      Math.round((Number(title.rating) || 0) * 10) / 10,
      title.flags,
      title.months || [],
      listsByKey.get(titleKey(title.mediaType, title.tmdbId)) || [],
      // Presupuesto y recaudación solo existen en películas.
      title.mediaType === 'movie' ? money(meta?.budget) : 0,
      title.mediaType === 'movie' ? money(meta?.revenue) : 0,
      // Id de IMDb (tt…): el cliente pide la nota al dataset de IMDb solo al
      // agrupar por puntuaciones.
      imdbIdOf(meta?.imdbId),
    ];
  });

  return { genres, sagas, lists: listRows, titles: packed, missing };
}

/** Datos de TMDb que usa el grafo, de la ficha completa en caché. */
export function pickTitleMeta(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    name: data.title || data.name || null,
    posterPath: data.poster_path || null,
    date: data.release_date || data.first_air_date || null,
    genres: Array.isArray(data.genres) ? data.genres : [],
    collection: data.belongs_to_collection || null,
    budget: Number(data.budget) || 0,
    revenue: Number(data.revenue) || 0,
    // Las películas lo traen en la ficha; las series, en external_ids.
    imdbId: imdbIdOf(data.imdb_id || data.external_ids?.imdb_id),
  };
}

/** Id de IMDb normalizado (tt…), o '' si no lo es. */
export function imdbIdOf(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^tt\d+$/.test(id) ? id : '';
}
