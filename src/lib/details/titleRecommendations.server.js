// /src/lib/details/titleRecommendations.server.js
// Recomendaciones de una ficha, SOLO en servidor (necesita TRAKT_CLIENT_ID).
// Lo usan las páginas de /details en el SSR y /api/tmdb/recommendations para
// el cliente (DetailModal, ficha embebida). El orden y los filtros están en
// recommendationRanking.js.

import { resolveTraktEntityFromTmdb } from "@/lib/trakt/resolve";
import { rankRecommendations } from "@/lib/details/recommendationRanking";

const TMDB_API = "https://api.themoviedb.org/3";
const TRAKT_API = "https://api.trakt.tv";
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const DAY = 86_400;
const TRAKT_RELATED_LIMIT = 30;
const TIMEOUT_MS = 6000;
// Trakt (resolver el id + relacionados + fichas de TMDb que falten) no puede
// retrasar el SSR de la ficha: pasado este tiempo se sirve solo con TMDb.
const RELATED_BUDGET_MS = 2500;

async function fetchJson(url, init = {}) {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: DAY },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function tmdbUrl(path, params = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("api_key", TMDB_KEY || "");
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function tmdbRecommendationsPage(type, id, page) {
  const data = await fetchJson(tmdbUrl(`/${type}/${id}/recommendations`, { page }));
  return Array.isArray(data?.results) ? data.results : [];
}

// Ficha de TMDb → forma de un resultado de `/recommendations`.
function toRecommendationItem(details, type) {
  return {
    id: details.id,
    media_type: type,
    title: details.title,
    name: details.name,
    original_title: details.original_title,
    original_name: details.original_name,
    original_language: details.original_language,
    overview: details.overview,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    release_date: details.release_date,
    first_air_date: details.first_air_date,
    vote_average: details.vote_average,
    vote_count: details.vote_count,
    popularity: details.popularity,
    adult: details.adult,
    genre_ids: Array.isArray(details.genres)
      ? details.genres.map((genre) => genre.id)
      : [],
  };
}

// Relacionados de Trakt como TMDb ids, en su orden.
async function traktRelatedTmdbIds(type, id) {
  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) return [];
  const resolved = await resolveTraktEntityFromTmdb({ type, tmdbId: id }).catch(
    () => null,
  );
  if (!resolved?.traktId) return [];
  const kind = type === "tv" ? "shows" : "movies";
  const related = await fetchJson(
    `${TRAKT_API}/${kind}/${resolved.traktId}/related?limit=${TRAKT_RELATED_LIMIT}`,
    {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
        "User-Agent":
          process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js)",
      },
    },
  );
  return (Array.isArray(related) ? related : [])
    .map((item) => Number(item?.ids?.tmdb))
    .filter((tmdbId) => Number.isFinite(tmdbId) && tmdbId > 0);
}

/**
 * @param {"movie"|"tv"} type
 * @param {number|string} id
 * @returns {Promise<{ results: Array }>}
 */
export async function fetchTitleRecommendations(type, id) {
  if ((type !== "movie" && type !== "tv") || !id) return { results: [] };

  const tmdbPages = Promise.all([
    tmdbRecommendationsPage(type, id, 1),
    tmdbRecommendationsPage(type, id, 2),
  ]);
  const relatedItems = (async () => {
    const [relatedIds, pages] = await Promise.all([
      traktRelatedTmdbIds(type, id),
      tmdbPages,
    ]);
    // Los relacionados que ya trae TMDb no se vuelven a pedir.
    const known = new Map(pages.flat().map((item) => [Number(item.id), item]));
    const items = await Promise.all(
      relatedIds.map(async (tmdbId) => {
        if (known.has(tmdbId)) return known.get(tmdbId);
        const details = await fetchJson(tmdbUrl(`/${type}/${tmdbId}`));
        return details?.id ? toRecommendationItem(details, type) : null;
      }),
    );
    return items.filter(Boolean);
  })().catch(() => []);
  let budgetTimer = null;
  const [[page1, page2], related] = await Promise.all([
    tmdbPages,
    Promise.race([
      relatedItems,
      new Promise((resolve) => {
        budgetTimer = setTimeout(() => resolve([]), RELATED_BUDGET_MS);
      }),
    ]).finally(() => clearTimeout(budgetTimer)),
  ]);

  return {
    results: rankRecommendations({
      related,
      recommendationPages: [page1, page2],
      type,
      selfId: id,
    }),
  };
}
