import { unstable_cache } from "next/cache";
import { getTraktScoreboardData } from "@/lib/trakt/scoreboard";

const getCachedScoreboard = unstable_cache(
  async (type, tmdbId, season = "", episode = "") => {
    return getTraktScoreboardData({
      type,
      tmdbId,
      season: season || undefined,
      episode: episode || undefined,
    });
  },
  ["trakt-scoreboard-public"],
  // 5 min: si el primer intento devuelve stats nulas (timeout de Trakt en cold
  // start), el resultado parcial no queda cacheado 30 min. El cliente tiene
  // su propio fallback a /api/trakt/stats para el caso de cache HIT con stats nulas.
  { revalidate: 300 },
);

export async function getCachedTraktScoreboardData({
  type,
  tmdbId,
  season,
  episode,
} = {}) {
  return getCachedScoreboard(
    String(type || ""),
    String(tmdbId || ""),
    season == null ? "" : String(season),
    episode == null ? "" : String(episode),
  );
}
