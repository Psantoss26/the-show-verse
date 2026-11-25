// src/lib/details/communityRatings.js
// Puntuaciones de los usuarios de The Show Verse para un título (modal de
// puntuación de la ficha). El backend devuelve 10 barras (1–10; las medias
// notas van a su entero inferior) y la media exacta.

export const COMMUNITY_RATING_SCORES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const toCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function normalizeCommunityRatings(json) {
  const counts = new Map(COMMUNITY_RATING_SCORES.map((score) => [score, 0]));
  const histogram = Array.isArray(json?.histogram) ? json.histogram : [];
  for (const item of histogram) {
    const score = Number(item?.score);
    if (counts.has(score)) counts.set(score, counts.get(score) + toCount(item?.count));
  }

  const summed = [...counts.values()].reduce((acc, n) => acc + n, 0);
  const count = toCount(json?.count) || summed;
  const max = Math.max(0, ...counts.values());
  const average = Number(json?.average);

  return {
    count,
    average: count > 0 && Number.isFinite(average) ? average : null,
    bars: COMMUNITY_RATING_SCORES.map((score) => {
      const n = counts.get(score);
      return {
        score,
        count: n,
        share: summed > 0 ? n / summed : 0,
        ratio: max > 0 ? n / max : 0,
      };
    }),
  };
}

// Barra en la que cae una nota de 1–10 con medias notas (la del deslizador).
export function ratingBucket(value) {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.floor(n)));
}

export function formatCommunityAverage(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "–";
  // Un decimal con punto, como la nota del deslizador y los demás marcadores,
  // salvo que la media redondeada sea entera: «9», no «9.0».
  return String(Math.round(value * 10) / 10);
}

const compact = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });

export function formatVoteCount(n) {
  const count = toCount(n);
  const text = count >= 10000 ? compact.format(count) : String(count);
  return `${text} ${count === 1 ? "voto" : "votos"}`;
}

export function formatShare(share) {
  const pct = (Number(share) || 0) * 100;
  if (pct > 0 && pct < 1) return "<1 %";
  return `${Math.round(pct)} %`;
}

// Copia en memoria por título: el modal pinta la última al abrirse y la
// renueva en segundo plano (la respuesta no se cachea en el servidor).
const cache = new Map();
const inflight = new Map();

export function getCachedCommunityRatings(type, tmdbId) {
  return cache.get(`${type}:${tmdbId}`) || null;
}

export function fetchCommunityRatings(type, tmdbId) {
  const key = `${type}:${tmdbId}`;
  if (inflight.has(key)) return inflight.get(key);
  const promise = fetch(
    `/api/community/${encodeURIComponent(type)}/${encodeURIComponent(tmdbId)}/ratings`,
    { cache: "no-store" },
  )
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const data = normalizeCommunityRatings(json);
      cache.set(key, data);
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
