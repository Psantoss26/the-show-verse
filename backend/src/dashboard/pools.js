// backend/src/dashboard/pools.js
import { db } from '../db/client.js';
import { dashboardPools } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { tmdbDiscover, tmdbList, tmdbDetails, tmdbSeason, MOVIE_GENRES, TV_GENRES } from './tmdb.js';
import { rankAnticipatedMovies, rankNewReleaseMovies } from './score.js';
import {
  balanceSoftLimitedContent,
  excludeKidsReality,
  capAsian,
  hasReliablePublicSignal,
  localePriorityWeight,
  TV_WITHOUT_GENRES,
} from './filters.js';

// ─── TTLs (ms) ────────────────────────────────────────────────────────────────
const TTL_12H  = 12 * 60 * 60 * 1000;
const TTL_24H  = 24 * 60 * 60 * 1000;
const TTL_7D   =  7 * 24 * 60 * 60 * 1000;
const TTL_30D  = 30 * 24 * 60 * 60 * 1000;

// ─── dedupeCards ──────────────────────────────────────────────────────────────
export function dedupeCards(cards) {
  const seen = new Set();
  const out = [];
  for (const c of cards || []) {
    if (!c) continue;
    const k = `${c.mediaType}:${c.tmdbId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// ─── Filtros de calidad ───────────────────────────────────────────────────────
// Piso de votos por tipo para listas amplias. Después se aplica también
// hasReliablePublicSignal(), que combina votos + nota y endurece animación,
// documental y anime para evitar títulos con muestras demasiado pequeñas.
const MIN_VOTES = { movie: 500, tv: 180 };

// Umbrales de vote_count por tipo para cada categoría discover.
const GENRE_VOTES = { movie: 500, tv: 150 };
const DECADE_VOTES = { movie: 800, tv: 150 };
const ACCLAIMED_VOTES = { movie: 3000, tv: 400 };
const BLOCKBUSTER_VOTES = { movie: 5000, tv: 800 };
const GEM_VOTES = {
  movie: { gte: 800, lte: 6000 },
  tv: { gte: 300, lte: 2500 },
};

// Pisos de votos por sección, para afinar "lo conocido/representativo":
// - Tendencias: piso modesto (refleja lo que sube ahora sin colar basura).
// - Populares: piso alto (solo títulos populares realmente reconocibles).
// - Top en España: piso moderado (contenido reciente tiene menos votos).
const TRENDING_VOTES = { movie: 500, tv: 180 };
const POPULAR_VOTES = { movie: 500, tv: 200 };
const REGION_VOTES = { movie: 500, tv: 180 };
const CURATED_VOTES = {
  drama: { movie: 700, tv: 180 },
  actionAdventure: { movie: 900, tv: 220 },
  nostalgia: { movie: 1200, tv: 280 },
};

// Fecha YYYY-MM-DD desplazada `days` respecto a hoy (para ventanas de estrenos
// y de "lo reciente" del Top en España). Se recalcula en cada rebuild del pool.
function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Dedup + reglas de contenido (sin infantil/reality, anime/asiático no
// predominante) + piso de votos (descarta lo poco representativo).
function refine(cards, mediaType, floor) {
  const min = floor ?? MIN_VOTES[mediaType] ?? 0;
  const cleaned = excludeKidsReality(dedupeCards(cards)).filter(
    (c) => (c?.voteCount || 0) >= min && hasReliablePublicSignal(c),
  );
  return balanceSoftLimitedContent(capAsian(cleaned));
}

function shouldRefineCachedPool(poolKey) {
  // Estrenos incluye próximos lanzamientos sin votos: no se debe filtrar por
  // señal pública hasta que estén estrenados. `calendar_episodes` guarda
  // ENTRADAS DE EPISODIO (no "cards"): refine() las descartaría.
  return (
    poolKey !== 'new_releases' &&
    poolKey !== 'anticipated' &&
    poolKey !== 'calendar_episodes'
  );
}

// Ejecuta `mapper` sobre `items` con concurrencia acotada. Preserva el orden.
export async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return out;
}

// Parámetros de discover por tipo: en TV excluimos géneros no deseados
// (infantil/reality/talk/news) ya en la propia petición.
function discoverParams(mediaType, params) {
  return mediaType === 'tv'
    ? { without_genres: TV_WITHOUT_GENRES, ...params }
    : params;
}

// ─── Helper: discover across N pages ─────────────────────────────────────────
async function discoverPages(mediaType, params, pages) {
  // Páginas en paralelo (antes en serie): construir un pool baja de N×latencia
  // a ~1×latencia. Es un único pool, así que la concurrencia con TMDB es acotada.
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      tmdbDiscover({ mediaType, params: { ...params, page: i + 1 } }).catch(() => []),
    ),
  );
  return results.flat();
}

// ─── POOL_DEFS ────────────────────────────────────────────────────────────────
// Map keyed by `${poolKey}:${mediaType}`
export const POOL_DEFS = new Map();

function addPool(poolKey, mediaType, ttlMs, build) {
  POOL_DEFS.set(`${poolKey}:${mediaType}`, { poolKey, mediaType, ttlMs, build });
}

// trending (12h) — pool profundo (5 págs): las tendencias de TV en TMDB traen
// mucho anime/reality; tras filtrar contenido y limitar el asiático necesitamos
// margen para conservar >= 15 tras la deduplicación cruzada.
for (const mediaType of ['movie', 'tv']) {
  addPool('trending', mediaType, TTL_12H, async () =>
    refine(
      await tmdbList({ path: `/trending/${mediaType}/week`, mediaType, pages: 5 }),
      mediaType,
      TRENDING_VOTES[mediaType],
    )
  );
}

// popular (24h) — pool profundo: trending/region_top/popular se solapan mucho,
// así que necesitamos suficientes títulos únicos para que tras la deduplicación
// "Populares" conserve >= 15 elementos.
for (const mediaType of ['movie', 'tv']) {
  addPool('popular', mediaType, TTL_24H, async () =>
    refine(
      await tmdbList({ path: `/${mediaType}/popular`, mediaType, pages: 7 }),
      mediaType,
      POPULAR_VOTES[mediaType],
    )
  );
}

// top_rated (7d)
for (const mediaType of ['movie', 'tv']) {
  addPool('top_rated', mediaType, TTL_7D, async () =>
    refine(await tmdbList({ path: `/${mediaType}/top_rated`, mediaType, pages: 3 }), mediaType)
  );
}

// acclaimed (7d) — vote_average alto + muchos votos
for (const mediaType of ['movie', 'tv']) {
  addPool('acclaimed', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, discoverParams(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': ACCLAIMED_VOTES[mediaType],
    }), 3), mediaType, ACCLAIMED_VOTES[mediaType])
  );
}

// blockbusters (7d) — populares con muchísimos votos
for (const mediaType of ['movie', 'tv']) {
  addPool('blockbusters', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, discoverParams(mediaType, {
      sort_by: 'popularity.desc',
      'vote_count.gte': BLOCKBUSTER_VOTES[mediaType],
    }), 3), mediaType, BLOCKBUSTER_VOTES[mediaType])
  );
}

// hidden_gems (7d) — bien valoradas con votos suficientes pero no masivos
for (const mediaType of ['movie', 'tv']) {
  addPool('hidden_gems', mediaType, TTL_7D, async () =>
    refine(await discoverPages(mediaType, discoverParams(mediaType, {
      sort_by: 'vote_average.desc',
      'vote_average.gte': 7.5,
      'vote_count.gte': GEM_VOTES[mediaType].gte,
      'vote_count.lte': GEM_VOTES[mediaType].lte,
    }), 3), mediaType, GEM_VOTES[mediaType].gte)
  );
}

// new_releases (24h) — PRÓXIMOS estrenos ordenados por popularidad (hype): los
// más esperados/importantes primero. El contenido sin estrenar no tiene votos,
// así que NO hay piso de votos y NO aplicamos el re-ranking por calidad (que se
// apoya en votos). Solo reglas de contenido (sin infantil/reality, asiático no
// predominante) preservando el orden de popularidad. La fila no rota
// (rotate:false en surfaces.js) para que se vean los más esperados primero.
function upcomingContentRules(cards) {
  const cleaned = capAsian(excludeKidsReality(dedupeCards(cards)));
  // Re-ranking SOLO por afinidad de idioma/país (en/es y US/ES arriba),
  // preservando el orden de popularidad dentro de cada nivel. No usamos el
  // re-ranking por calidad (se apoya en votos y los no estrenados no los tienen).
  // Así los estrenos relevantes para España encabezan y el cine regional
  // (turco, polaco, panyabí, urdu…) que capAsian no cubre baja de posición.
  return cleaned
    .map((card, index) => ({
      card,
      index,
      weightedRank: (cleaned.length - index) * localePriorityWeight(card),
    }))
    .sort((a, b) => b.weightedRank - a.weightedRank || a.index - b.index)
    .map(({ card }) => card);
}
// "Estrenos y novedades" (películas): ventana de recién estrenadas + próximas y
// ranking compuesto (popularidad + presupuesto + recaudación + proximidad de
// estreno) para que los títulos MÁS IMPORTANTES encabecen. Presupuesto/recaudación
// no vienen en discover: se enriquecen los candidatos más populares con detalles
// de TMDB. La fila no rota (NON_ROTATING_POOLS): se respeta este orden.
const NEW_RELEASES_ENRICH_LIMIT = 50;

async function enrichMoviesWithFinancials(cards, limit = NEW_RELEASES_ENRICH_LIMIT) {
  const head = await mapLimit(cards.slice(0, limit), 8, async (card) => {
    const details = await tmdbDetails('movie', card.tmdbId);
    if (!details) return card;
    return {
      ...card,
      budget: typeof details.budget === 'number' ? details.budget : 0,
      revenue: typeof details.revenue === 'number' ? details.revenue : 0,
      isFranchise: !!details.belongs_to_collection,
      // La fecha del detalle (estreno principal) es más fiable que la regional.
      releaseDate: details.release_date || card.releaseDate || null,
    };
  });
  return [...head, ...cards.slice(limit)];
}

addPool('new_releases', 'movie', TTL_24H, async () => {
  const cleaned = capAsian(excludeKidsReality(dedupeCards(
    await discoverPages('movie', {
      sort_by: 'popularity.desc',
      'primary_release_date.gte': dateOffset(-60),    // recién estrenadas…
      'primary_release_date.lte': dateOffset(120),    // …y próximas (~4 meses)
    }, 4),
  )));
  const enriched = await enrichMoviesWithFinancials(cleaned);
  return rankNewReleaseMovies(enriched);
});
addPool('new_releases', 'tv', TTL_24H, async () =>
  upcomingContentRules(await discoverPages('tv', discoverParams('tv', {
    sort_by: 'popularity.desc',
    'first_air_date.gte': dateOffset(-30),           // novedades muy recientes + próximas
    'first_air_date.lte': dateOffset(275),
  }), 4))
);

// anticipated (24h) — películas que TODAVÍA no se han estrenado. Es la
// alternativa propia a "anticipated" de Trakt: TMDB popularity funciona como
// señal de demanda, y los detalles aportan escala (presupuesto) y saga. La
// ventana amplia incluye grandes títulos anunciados para el próximo año sin
// mezclar ninguno ya estrenado.
addPool('anticipated', 'movie', TTL_24H, async () => {
  const future = upcomingContentRules(
    await discoverPages('movie', {
      sort_by: 'popularity.desc',
      'primary_release_date.gte': dateOffset(1),
      'primary_release_date.lte': dateOffset(550),
    }, 6),
  );
  const enriched = await enrichMoviesWithFinancials(future, 70);
  return rankAnticipatedMovies(enriched)
    .map((card) => ({
      ...card,
      anticipatedScore: card.anticipatedScore * localePriorityWeight(card),
    }))
    .sort((a, b) => b.anticipatedScore - a.anticipatedScore);
});

// ─── Calendario: próximos episodios de series ─────────────────────────────────
// Ventana de emisión del calendario: desde hace 2 días (recién emitidos) hasta
// 45 días vista. La ventana amplia capta también estrenos de nueva temporada a
// 3-6 semanas (los "estrenos" que interesan), no solo los episodios inminentes.
export const CALENDAR_PAST_DAYS = 2;
export const CALENDAR_AHEAD_DAYS = 45;

export function withinCalendarWindow(airDate, now = Date.now()) {
  if (!airDate) return false;
  const t = new Date(`${airDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(t)) return false;
  // Diferencia en DÍAS DE CALENDARIO (ambos a medianoche UTC): así los bordes son
  // exactos e independientes de la hora del día de `now` (air_date es date-only).
  const d = new Date(now);
  const todayMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((t - todayMidnight) / 86400000);
  return days >= -CALENDAR_PAST_DAYS && days <= CALENDAR_AHEAD_DAYS;
}

// Detalles mínimos de una serie para el calendario (título, imágenes y su
// next_episode_to_air), cacheados en memoria y COMPARTIDOS entre el build del pool
// base y las peticiones de /calendar del usuario, para no repetir GET /tv/{id}.
const CALENDAR_SHOW_TTL_MS = 60 * 60 * 1000; // 1h
const calendarShowCache = new Map(); // tmdbId -> { ts, value }

// Máximo de próximos episodios por serie: evita que una serie diaria (o con
// muchos episodios programados) inunde el calendario. Se muestran los N más
// cercanos por fecha.
export const MAX_EPISODES_PER_SHOW = 4;

export async function getCalendarShowDetails(tmdbId) {
  if (!tmdbId) return null;
  const cached = calendarShowCache.get(tmdbId);
  if (cached && Date.now() - cached.ts < CALENDAR_SHOW_TTL_MS) return cached.value;

  const details = await tmdbDetails('tv', tmdbId);
  if (!details) {
    calendarShowCache.set(tmdbId, { ts: Date.now(), value: null });
    return null;
  }

  const nextEp = details.next_episode_to_air || null;

  // Varios próximos episodios: se lee la temporada del next_episode_to_air y se
  // filtran los que caen dentro de la ventana del calendario (ordenados por fecha
  // y acotados por serie). Fallback al episodio suelto si la temporada no ayuda.
  let upcomingEpisodes = [];
  const seasonNum = Number(nextEp?.season_number);
  if (nextEp?.air_date && Number.isFinite(seasonNum)) {
    const season = await tmdbSeason(tmdbId, seasonNum);
    const eps = Array.isArray(season?.episodes) ? season.episodes : [];
    upcomingEpisodes = eps
      .filter((e) => e?.air_date && withinCalendarWindow(e.air_date))
      .map((e) => ({
        season_number: Number.isFinite(Number(e.season_number))
          ? Number(e.season_number)
          : seasonNum,
        episode_number: e.episode_number,
        air_date: e.air_date,
        name: e.name || null,
      }))
      .sort((a, b) => (a.air_date || '').localeCompare(b.air_date || ''))
      .slice(0, MAX_EPISODES_PER_SHOW);

    if (upcomingEpisodes.length === 0 && withinCalendarWindow(nextEp.air_date)) {
      upcomingEpisodes = [
        {
          season_number: seasonNum,
          episode_number: nextEp.episode_number,
          air_date: nextEp.air_date,
          name: nextEp.name || null,
        },
      ];
    }
  }

  const value = {
    tmdbId: Number(tmdbId),
    title: details.name || null,
    posterPath: details.poster_path || null,
    backdropPath: details.backdrop_path || null,
    nextEpisode: nextEp,
    upcomingEpisodes,
  };

  calendarShowCache.set(tmdbId, { ts: Date.now(), value });
  return value;
}

// Construye una entrada de episodio próximo (forma consumida por el cliente).
export function buildUpcomingEpisodeEntry(show, nextEp, sources = []) {
  if (!show?.tmdbId || !nextEp?.air_date) return null;
  const season = Number(nextEp.season_number);
  const number = Number(nextEp.episode_number);
  if (!Number.isFinite(season) || !Number.isFinite(number)) return null;
  return {
    id: `tv:${show.tmdbId}:${season}:${number}`,
    show: {
      tmdbId: Number(show.tmdbId),
      title: show.title || null,
      posterPath: show.posterPath || null,
      backdropPath: show.backdropPath || null,
    },
    episode: {
      season,
      number,
      title: nextEp.name || null,
      airDate: nextEp.air_date,
    },
    sources,
  };
}

// Construye TODAS las entradas de próximos episodios de una serie (varias por
// serie) a partir de sus detalles de calendario (details.upcomingEpisodes).
export function buildUpcomingEpisodeEntries(details, show = null, sources = []) {
  if (!details?.upcomingEpisodes?.length) return [];
  const showObj = {
    tmdbId: details.tmdbId ?? show?.tmdbId,
    title: details.title || show?.title || null,
    posterPath: details.posterPath || show?.posterPath || null,
    backdropPath: details.backdropPath || show?.backdropPath || null,
  };
  return details.upcomingEpisodes
    .map((ep) => buildUpcomingEpisodeEntry(showObj, ep, sources))
    .filter(Boolean);
}

// Tamaño máximo del pool base del calendario. Con varios episodios por serie hay
// más entradas; se acota tras ordenar por fecha para no crecer sin límite.
const CALENDAR_POOL_MAX = 80;

const byEntryAirDate = (a, b) =>
  (a?.episode?.airDate || '').localeCompare(b?.episode?.airDate || '');

// calendar_episodes (12h) — base ANÓNIMA: próximos episodios de las series más
// populares (popular ∪ trending ∪ top España), dentro de la ventana del calendario,
// VARIOS por serie y ordenados por fecha de emisión.
addPool('calendar_episodes', 'tv', TTL_12H, async () => {
  const [popular, trending, region] = await Promise.all([
    getPool('popular', 'tv').catch(() => []),
    getPool('trending', 'tv').catch(() => []),
    getPool('region_top', 'tv').catch(() => []),
  ]);

  const shows = dedupeCards([...popular, ...trending, ...region])
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 40);

  const entries = (
    await mapLimit(shows, 8, async (show) => {
      const details = await getCalendarShowDetails(show.tmdbId);
      return buildUpcomingEpisodeEntries(details, show, []);
    })
  ).flat();

  return entries.sort(byEntryAirDate).slice(0, CALENDAR_POOL_MAX);
});

// region_top (24h) — "Top hoy en España": lo más popular AHORA en streaming en
// España, RECIENTE (no histórico). Antes usaba popularidad GLOBAL con region=ES,
// lo que colaba clásicos muy conocidos y antiguos. Ahora filtramos por
// disponibilidad de streaming en ES (watch_region) y por recencia.
addPool('region_top', 'movie', TTL_24H, async () =>
  refine(await discoverPages('movie', {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate|free|ads',
    sort_by: 'popularity.desc',
    'primary_release_date.gte': dateOffset(-900),    // ~2,5 años (excluye histórico)
    'primary_release_date.lte': dateOffset(0),
    'vote_count.gte': REGION_VOTES.movie,
  }, 4), 'movie', REGION_VOTES.movie)
);
addPool('region_top', 'tv', TTL_24H, async () =>
  refine(await discoverPages('tv', discoverParams('tv', {
    watch_region: 'ES',
    with_watch_monetization_types: 'flatrate|free|ads',
    sort_by: 'popularity.desc',
    'first_air_date.gte': dateOffset(-1095),         // ~3 años
    'vote_count.gte': REGION_VOTES.tv,
  }), 4), 'tv', REGION_VOTES.tv)
);

// curated rows (7d) — filas editoriales inspiradas en plataformas de streaming:
// temas amplios, reconocibles y con suficiente validación social para que sean
// útiles como recomendación general, no solo como clasificación por género.
addPool('curated:drama', 'movie', TTL_7D, async () =>
  refine(await discoverPages('movie', {
    with_genres: 18,
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.6,
    'vote_count.gte': CURATED_VOTES.drama.movie,
  }, 4), 'movie', CURATED_VOTES.drama.movie)
);
addPool('curated:drama', 'tv', TTL_7D, async () =>
  refine(await discoverPages('tv', discoverParams('tv', {
    with_genres: 18,
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.8,
    'vote_count.gte': CURATED_VOTES.drama.tv,
  }), 4), 'tv', CURATED_VOTES.drama.tv)
);

addPool('curated:action_adventure', 'movie', TTL_7D, async () =>
  refine(dedupeCards([
    ...(await discoverPages('movie', {
      with_genres: 28,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.4,
      'vote_count.gte': CURATED_VOTES.actionAdventure.movie,
    }, 3)),
    ...(await discoverPages('movie', {
      with_genres: 12,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.4,
      'vote_count.gte': CURATED_VOTES.actionAdventure.movie,
    }, 3)),
  ]), 'movie', CURATED_VOTES.actionAdventure.movie)
);
addPool('curated:action_adventure', 'tv', TTL_7D, async () =>
  refine(dedupeCards([
    ...(await discoverPages('tv', discoverParams('tv', {
      with_genres: 10759,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.7,
      'vote_count.gte': CURATED_VOTES.actionAdventure.tv,
    }), 3)),
    ...(await discoverPages('tv', discoverParams('tv', {
      with_genres: 10765,
      sort_by: 'popularity.desc',
      'vote_average.gte': 6.7,
      'vote_count.gte': CURATED_VOTES.actionAdventure.tv,
    }), 3)),
  ]), 'tv', CURATED_VOTES.actionAdventure.tv)
);

addPool('curated:nostalgia_millennial', 'movie', TTL_30D, async () =>
  refine(await discoverPages('movie', {
    'primary_release_date.gte': '1995-01-01',
    'primary_release_date.lte': '2012-12-31',
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.6,
    'vote_count.gte': CURATED_VOTES.nostalgia.movie,
  }, 5), 'movie', CURATED_VOTES.nostalgia.movie)
);
addPool('curated:nostalgia_millennial', 'tv', TTL_30D, async () =>
  refine(await discoverPages('tv', discoverParams('tv', {
    'first_air_date.gte': '1995-01-01',
    'first_air_date.lte': '2012-12-31',
    sort_by: 'popularity.desc',
    'vote_average.gte': 6.8,
    'vote_count.gte': CURATED_VOTES.nostalgia.tv,
  }), 5), 'tv', CURATED_VOTES.nostalgia.tv)
);

// genre pools (7d) — por género en MOVIE_GENRES y TV_GENRES.
// Pool más profundo (4 págs): tras limitar el contenido asiático (p. ej. el
// género Animación es mayoritariamente anime) necesitamos margen para >= 15.
for (const { id } of MOVIE_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'movie', TTL_7D, async () =>
    refine(await discoverPages('movie', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': GENRE_VOTES.movie,
    }, 4), 'movie', GENRE_VOTES.movie)
  );
}
for (const { id } of TV_GENRES) {
  const poolKey = `genre:${id}`;
  addPool(poolKey, 'tv', TTL_7D, async () =>
    refine(await discoverPages('tv', discoverParams('tv', {
      with_genres: id,
      sort_by: 'popularity.desc',
      'vote_count.gte': GENRE_VOTES.tv,
    }), 4), 'tv', GENRE_VOTES.tv)
  );
}

// decade pools (30d) — 1980, 1990, 2000, 2010, 2020 × movie + tv
const DECADES = [1980, 1990, 2000, 2010, 2020];
for (const year of DECADES) {
  const poolKey = `decade:${year}`;
  const dateGte = `${year}-01-01`;
  const dateLte = `${year + 9}-12-31`;

  // Pool profundo (5 págs): las décadas recientes (2010/2020) se solapan mucho
  // con tendencias/populares/géneros, así que necesitan títulos suficientes para
  // que tras la deduplicación conserven >= 15 elementos.
  addPool(poolKey, 'movie', TTL_30D, async () =>
    refine(await discoverPages('movie', {
      'primary_release_date.gte': dateGte,
      'primary_release_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': DECADE_VOTES.movie,
    }, 5), 'movie', DECADE_VOTES.movie)
  );

  addPool(poolKey, 'tv', TTL_30D, async () =>
    refine(await discoverPages('tv', discoverParams('tv', {
      'first_air_date.gte': dateGte,
      'first_air_date.lte': dateLte,
      sort_by: 'popularity.desc',
      'vote_count.gte': DECADE_VOTES.tv,
    }), 5), 'tv', DECADE_VOTES.tv)
  );
}

// ─── getPool ──────────────────────────────────────────────────────────────────
// Reconstrucciones en curso por pool: si varias peticiones (o el precalentado y
// un usuario) piden el MISMO pool frío a la vez, solo se reconstruye una vez y el
// resto espera esa promesa. Evita trabajo duplicado y ráfagas a TMDB.
const inFlightBuilds = new Map(); // defKey -> Promise<items>

// Caché en MEMORIA de los items de cada pool. Los pools son grandes (jsonb de
// decenas de KB) y cambian como mucho cada 12h-30d, pero se leían de Postgres en
// CADA request (20-40 lecturas por carga de dashboard) → muchísimo egress. Con
// una TTL corta en RAM servimos casi todo sin tocar la BD. Se invalida sola al
// caducar y se refresca al reconstruir el pool.
const POOL_MEM_TTL_MS = Number(
  process.env.DASHBOARD_POOL_MEM_TTL_MS ?? 5 * 60 * 1000,
);
const poolMemCache = new Map(); // defKey -> { items, dbExpiresAt: Date, memExpiresAt: number }

function poolMemGet(defKey) {
  const entry = poolMemCache.get(defKey);
  if (!entry) return null;
  const now = Date.now();
  // Inválido si venció la TTL de memoria o si el pool de BD ya caducó.
  if (entry.memExpiresAt <= now || entry.dbExpiresAt.getTime() <= now) {
    poolMemCache.delete(defKey);
    return null;
  }
  return entry.items;
}

function poolMemSet(defKey, items, dbExpiresAt) {
  poolMemCache.set(defKey, {
    items,
    dbExpiresAt,
    memExpiresAt: Date.now() + POOL_MEM_TTL_MS,
  });
}

export async function getPool(poolKey, mediaType) {
  const defKey = `${poolKey}:${mediaType}`;
  const def = POOL_DEFS.get(defKey);
  if (!def) return [];

  // 1) Caché en memoria (sin egress).
  const cached = poolMemGet(defKey);
  if (cached) return cached;

  // 2) Leer de la BD SOLO las columnas necesarias (no todo el row).
  const [row] = await db
    .select({ items: dashboardPools.items, expiresAt: dashboardPools.expiresAt })
    .from(dashboardPools)
    .where(and(eq(dashboardPools.poolKey, poolKey), eq(dashboardPools.mediaType, mediaType)))
    .limit(1);

  // Return cached if still fresh
  if (row && row.expiresAt > new Date()) {
    const items = shouldRefineCachedPool(poolKey)
      ? refine(row.items, mediaType)
      : row.items;
    poolMemSet(defKey, items, row.expiresAt);
    return items;
  }

  // ¿Ya hay una reconstrucción en curso para este pool? Reutilízala.
  const existing = inFlightBuilds.get(defKey);
  if (existing) return existing;

  const build = (async () => {
    try {
      const items = await def.build();
      const builtAt = new Date();
      const expiresAt = new Date(Date.now() + def.ttlMs);

      await db
        .insert(dashboardPools)
        .values({ poolKey, mediaType, items, builtAt, expiresAt })
        .onConflictDoUpdate({
          target: [dashboardPools.poolKey, dashboardPools.mediaType],
          set: { items, builtAt, expiresAt },
        });

      poolMemSet(defKey, items, expiresAt); // cachea lo recién construido
      return items;
    } catch {
      // On error return stale data if available, else []
      return row ? row.items : [];
    } finally {
      inFlightBuilds.delete(defKey);
    }
  })();

  inFlightBuilds.set(defKey, build);
  return build;
}

// ─── refreshAllPools ──────────────────────────────────────────────────────────
export async function refreshAllPools() {
  let built = 0;

  // Solo necesitamos las claves y la caducidad para saber qué reconstruir; NO
  // traemos la columna `items` (jsonb grande) de todas las filas.
  const rows = await db
    .select({
      poolKey: dashboardPools.poolKey,
      mediaType: dashboardPools.mediaType,
      expiresAt: dashboardPools.expiresAt,
    })
    .from(dashboardPools);
  const rowMap = new Map();
  for (const row of rows) {
    rowMap.set(`${row.poolKey}:${row.mediaType}`, row);
  }

  const now = new Date();
  const stale = [];
  for (const [key, def] of POOL_DEFS) {
    const row = rowMap.get(key);
    if (!row || row.expiresAt <= now) stale.push(def);
  }

  // Reconstruimos en lotes paralelos (concurrencia acotada) para calentar rápido
  // sin saturar TMDB.
  const BATCH = 4;
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH);
    await Promise.all(batch.map((def) => getPool(def.poolKey, def.mediaType).catch(() => [])));
    built += batch.length;
  }

  return { built };
}
