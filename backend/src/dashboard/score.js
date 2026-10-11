/**
 * Pure scoring utilities for dashboard recommendation candidates.
 * No DB/network access — all data comes in as arguments.
 */

import { contentPriorityWeight } from './filters.js';
import { publicQuality } from './ranking.js';

/**
 * For each seed, fetch its similar/recommended candidates and accumulate
 * a weighted score. Returns rec items sorted by score descending.
 *
 * @param {{ seeds: Array, fetchSimilar: Function }} params
 * @returns {Promise<Array>} recItem[] sorted by score desc
 */
export async function aggregateCandidates({ seeds, fetchSimilar }) {
  // Map keyed `${mediaType}:${tmdbId}` -> { card, score, reasons }
  const candidateMap = new Map();

  // Build a set of seed keys to skip self-recommendation
  const seedKeys = new Set(
    seeds.map((s) => `${s.mediaType}:${s.tmdbId}`)
  );

  // Bounded concurrency, preserving seed order for deterministic results.
  const fetched = new Array(seeds.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, seeds.length) }, async () => {
    while (next < seeds.length) {
      const index = next++;
      fetched[index] = await fetchSimilar(seeds[index]).catch(() => ({}));
    }
  }));
  for (const [seedIndex, seed] of seeds.entries()) {
    const { recommendations = [], similar = [] } = fetched[seedIndex];
    const contributed = new Set();

    const sources = [
      { list: recommendations, sourceWeight: 1.0 },
      { list: similar, sourceWeight: 0.6 },
    ];

    for (const { list, sourceWeight } of sources) {
      list.forEach((card, index) => {
        const key = `${card.mediaType}:${card.tmdbId}`;

        // Skip the seed itself
        if (seedKeys.has(key) || contributed.has(key) || card.mediaType !== seed.mediaType) return;
        contributed.add(key);

        const positionDecay = 1 / (1 + index * 0.15);
        const contribution = seed.weight * sourceWeight * positionDecay *
          (0.75 + publicQuality(card) / 20) * contentPriorityWeight(card);

        if (!candidateMap.has(key)) {
          candidateMap.set(key, { ...card, score: 0, reasons: [] });
        }

        const item = candidateMap.get(key);
        item.score += contribution;

        // Solo las semillas que el usuario realmente disfrutó (strongPositive:
        // rating ≥ 8 o favorito) generan razón "porque viste…". El visionado
        // casual o los pendientes puntúan, pero no crean esas filas.
        if (seed.strongPositive) {
          const alreadyHasReason = item.reasons.some(
            (r) => r.seedTmdbId === seed.tmdbId && r.seedMediaType === seed.mediaType
          );
          if (!alreadyHasReason) {
            item.reasons.push({
              type: 'because',
              seedTmdbId: seed.tmdbId,
              seedMediaType: seed.mediaType,
              strength: contribution,
              seedTitle: seed.title ?? null,
            });
          }
        }
      });
    }
  }

  return Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Rankea películas de "Estrenos y novedades" por una puntuación compuesta que
 * combina popularidad, presupuesto, recaudación y proximidad de estreno, para que
 * los títulos más importantes (grandes producciones, éxitos de taquilla, estrenos
 * inminentes o muy recientes) aparezcan primero.
 *
 * Requisitos de cada card: `popularity`, `releaseDate` ('YYYY-MM-DD'|null) y —para
 * las enriquecidas— `budget` y `revenue` (USD). Las no enriquecidas cuentan como 0
 * en esos términos (una peli sin estrenar tiene recaudación 0 de forma natural).
 *
 * Normalización relativa AL CONJUNTO recibido:
 *   - popularidad: lineal (0..1) sobre el máximo del set.
 *   - presupuesto/recaudación: escala log10 (colas muy largas) sobre el máximo.
 *   - recencia: campana gaussiana centrada en HOY (premia por igual lo recién
 *     estrenado y lo inminente; decae con la lejanía).
 *
 * Pesos iniciales (ajustables): 0.40 pop · 0.20 presupuesto · 0.20 recaudación ·
 * 0.20 recencia.
 *
 * @param {Array}  cards
 * @param {{ now?: Date|string|number, recencySigmaDays?: number }} [opts]
 * @returns {Array} cards ordenadas desc con campo `newReleaseScore` añadido
 */
export function rankNewReleaseMovies(cards, { now, recencySigmaDays = 45 } = {}) {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const nowMs = now == null ? Date.now() : new Date(now).getTime();
  const numeric = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const maxPop = Math.max(0, ...cards.map((c) => numeric(c.popularity)));
  const maxLogBudget = Math.log10(1 + Math.max(0, ...cards.map((c) => numeric(c.budget))));
  const maxLogRevenue = Math.log10(1 + Math.max(0, ...cards.map((c) => numeric(c.revenue))));

  const norm = (v, max) => (max > 0 ? numeric(v) / max : 0);
  const logNorm = (v, maxLog) =>
    maxLog > 0 ? Math.log10(1 + Math.max(0, numeric(v))) / maxLog : 0;

  const recency = (releaseDate) => {
    if (!releaseDate) return 0;
    const t = new Date(`${releaseDate}T00:00:00Z`).getTime();
    if (!Number.isFinite(t)) return 0;
    const days = (t - nowMs) / 86400000;
    return Math.exp(-((days / recencySigmaDays) ** 2));
  };

  return cards
    .map((card) => ({
      ...card,
      newReleaseScore:
        0.4 * norm(card.popularity, maxPop) +
        0.2 * logNorm(card.budget, maxLogBudget) +
        0.2 * logNorm(card.revenue, maxLogRevenue) +
        0.2 * recency(card.releaseDate),
    }))
    .sort((a, b) => b.newReleaseScore - a.newReleaseScore);
}

/**
 * Prioriza el recuento público de listas de Trakt, disponible sin OAuth.
 * Los candidatos con demanda medida se ordenan por ese recuento (score > 1).
 * Los demás se añaden después con una aproximación TMDb (score <= 1):
 * popularidad 80%, escala 15%, proximidad 5%. Los votos de un título sin
 * estrenar NO miden intención de verlo y no deben influir en este ranking.
 *
 * La normalización es absoluta, no relativa al lote. Así las puntuaciones de
 * películas y series son comparables al juntarlas en Inicio; un catálogo con
 * un único título muy popular no infla artificialmente el resto.
 * Solo admite fechas POSTERIORES a hoy y limita el horizonte para evitar
 * anuncios con una fecha demasiado incierta.
 */
export function rankAnticipatedTitles(
  cards,
  { now, maxDaysAhead = 550 } = {},
) {
  if (!Array.isArray(cards) || cards.length === 0) return [];

  const nowDate = now == null ? new Date() : new Date(now);
  const todayMs = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
  );
  const numeric = (value) =>
    Number.isFinite(Number(value)) ? Number(value) : 0;

  const future = cards.filter((card) => {
    if (!card?.releaseDate) return false;
    const releaseMs = new Date(`${card.releaseDate}T00:00:00Z`).getTime();
    if (!Number.isFinite(releaseMs)) return false;
    const daysAhead = (releaseMs - todayMs) / 86400000;
    return daysAhead > 0 && daysAhead <= maxDaysAhead;
  });
  if (future.length === 0) return [];

  return future
    .map((card) => {
      const releaseMs = new Date(`${card.releaseDate}T00:00:00Z`).getTime();
      const daysAhead = Math.max(1, (releaseMs - todayMs) / 86400000);
      // Curvas con techo: un pico de popularidad no debe ocultar por completo
      // un lanzamiento con una comunidad grande y sostenida.
      const popularity = 1 - Math.exp(-Math.max(0, numeric(card.popularity)) / 120);
      const budget = Math.min(1, Math.log10(1 + Math.max(0, numeric(card.budget))) / 8.5);
      const eventScale = Math.max(budget, card.isFranchise ? 1 : 0);
      const proximity = Math.exp(-daysAhead / 420);

      return {
        ...card,
        anticipatedScore: numeric(card.anticipatedListCount) > 0
          ? 1 + Math.log1p(numeric(card.anticipatedListCount))
          : 0.80 * popularity + 0.15 * eventScale + 0.05 * proximity,
      };
    })
    .sort((a, b) => b.anticipatedScore - a.anticipatedScore || a.tmdbId - b.tmdbId);
}

// Nombre conservado para los consumidores existentes. La política ya no es
// exclusiva de películas: las series se ordenan con el mismo criterio.
export const rankAnticipatedMovies = rankAnticipatedTitles;

/**
 * Filter out items already in the user's library / seen set.
 *
 * @param {Array} recItems
 * @param {Set<string>} seenSet  Set of "mediaType:tmdbId" strings
 * @returns {Array}
 */
export function excludeSeen(recItems, seenSet) {
  return recItems.filter(
    (item) => !seenSet.has(`${item.mediaType}:${item.tmdbId}`)
  );
}

/**
 * Append genre-fill cards that aren't already in recItems.
 *
 * @param {Array} recItems  existing scored candidates
 * @param {Array} fillCards  raw cards from genre discover
 * @param {number} [weight=0.5]  score to assign fill items
 * @returns {Array}
 */
export function mergeGenreFill(recItems, fillCards, weight = 0.5) {
  const existingKeys = new Set(
    recItems.map((item) => `${item.mediaType}:${item.tmdbId}`)
  );

  const fills = fillCards
    .filter((card) => {
      const key = `${card.mediaType}:${card.tmdbId}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    })
    .map((card) => ({
      ...card,
      score: weight * contentPriorityWeight(card),
      reasons: [{ type: 'based_on_genres', seedTmdbId: null, seedTitle: null }],
    }));

  return [...recItems, ...fills];
}
