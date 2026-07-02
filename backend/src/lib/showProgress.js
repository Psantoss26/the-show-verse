// backend/src/lib/showProgress.js
//
// Clasificación de progreso de una serie a partir de los "plays" de cada
// episodio en el historial (una fila de watch_history por play; los rewatches
// generan plays adicionales del mismo episodio).
//
// El rewatch NO se guarda en una tabla aparte: se DERIVA por "capas" de plays.
// Capa N = el N-ésimo play de cada episodio. Una serie está "completada N
// veces" cuando TODOS sus episodios emitidos tienen al menos N plays
// (minPlays = N). El "run" en curso es la capa minPlays+1: los episodios que ya
// tienen ese play forman el progreso del run actual (primer visionado si
// minPlays=0, o un rewatch si minPlays>=1).
//
// Con esto una serie completada y en pleno rewatch queda a la vez:
//   - "en progreso"/"continuar viendo" (runActive, con el progreso del run), y
//   - "completada" (baseComplete, porque el visionado base está completo).

/**
 * @param {Map<string, number>} playCounts  Mapa "season-episode" -> nº de plays
 *   (puede incluir episodios no emitidos; se filtran por seasonEpisodeCounts).
 * @param {Record<number, number>} seasonEpisodeCounts  season -> episodios emitidos.
 * @returns {{
 *   aired: number, hasKnownAired: boolean, distinctWatched: number,
 *   completedRuns: number, runCompleted: number, runPct: number,
 *   runNextEpisode: {season:number, number:number, title:null}|null,
 *   runActive: boolean, baseComplete: boolean, isRewatch: boolean,
 * }}
 */
export function computeShowProgress(playCounts, seasonEpisodeCounts) {
  const counts = playCounts instanceof Map ? playCounts : new Map();
  const seasons = Object.keys(seasonEpisodeCounts || {})
    .map(Number)
    .filter((s) => Number.isInteger(s) && s > 0)
    .sort((a, b) => a - b);

  const aired = seasons.reduce(
    (sum, s) => sum + Number(seasonEpisodeCounts[s] || 0),
    0,
  );
  const hasKnownAired = aired > 0;

  // Plays por episodio VÁLIDO (emitido). Si no conocemos los emitidos, usamos
  // los episodios vistos tal cual (comportamiento heredado, sin concepto de run).
  const validCounts = new Map();
  if (hasKnownAired) {
    for (const s of seasons) {
      const maxEp = Number(seasonEpisodeCounts[s] || 0);
      for (let e = 1; e <= maxEp; e += 1) {
        validCounts.set(`${s}-${e}`, Number(counts.get(`${s}-${e}`) || 0));
      }
    }
  } else {
    for (const [key, c] of counts) {
      validCounts.set(String(key), Number(c || 0));
    }
  }

  const distinctWatched = [...validCounts.values()].filter((c) => c >= 1).length;
  const baseComplete = hasKnownAired && distinctWatched >= aired;

  // minPlays = mínimo de plays entre TODOS los episodios emitidos = nº de veces
  // que la serie se ha completado por entero (0 si algún episodio no se ha visto).
  let minPlays = 0;
  if (hasKnownAired) {
    let min = Infinity;
    for (const [, c] of validCounts) {
      if (c < min) min = c;
      if (min === 0) break;
    }
    minPlays = Number.isFinite(min) ? min : 0;
  }

  // Run actual = capa minPlays+1. runCompleted = episodios que ya llegan a esa
  // capa; runNextEpisode = primer episodio (en orden) que aún no llega.
  const layer = minPlays + 1;
  let runCompleted = 0;
  let runNextEpisode = null;
  if (hasKnownAired) {
    for (const s of seasons) {
      const maxEp = Number(seasonEpisodeCounts[s] || 0);
      for (let e = 1; e <= maxEp; e += 1) {
        const c = Number(validCounts.get(`${s}-${e}`) || 0);
        if (c >= layer) {
          runCompleted += 1;
        } else if (!runNextEpisode) {
          runNextEpisode = { season: s, number: e, title: null };
        }
      }
    }
  } else {
    runCompleted = distinctWatched;
  }

  const runActive = hasKnownAired && runCompleted > 0 && runCompleted < aired;
  const runPct = hasKnownAired
    ? Math.min(100, Math.round((runCompleted / aired) * 100))
    : 0;
  const isRewatch = minPlays >= 1;

  return {
    aired,
    hasKnownAired,
    distinctWatched,
    completedRuns: minPlays,
    runCompleted,
    runPct,
    runNextEpisode,
    runActive,
    baseComplete,
    isRewatch,
  };
}
