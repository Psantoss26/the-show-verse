import { unstable_cache } from "next/cache";
import { getTraktScoreboardData } from "@/lib/trakt/scoreboard";

const getCachedScoreboardQuick = unstable_cache(
  async (type, tmdbId, traktId = "", season = "", episode = "") => {
    return getTraktScoreboardData({
      type,
      tmdbId,
      traktId: traktId || undefined,
      season: season || undefined,
      episode: episode || undefined,
      includeStats: false,
    });
  },
  ["trakt-scoreboard-public-quick"],
  { revalidate: 1800 },
);

const getCachedScoreboardFull = unstable_cache(
  async (type, tmdbId, traktId = "", season = "", episode = "") => {
    return getTraktScoreboardData({
      type,
      tmdbId,
      traktId: traktId || undefined,
      season: season || undefined,
      episode: episode || undefined,
      includeStats: true,
    });
  },
  ["trakt-scoreboard-public-full"],
  // 2 min: evita que un timeout puntual en stats deje un resultado parcial
  // "pegado" demasiado tiempo en SSR. El cliente sigue teniendo fallback.
  { revalidate: 120 },
);

export async function getCachedTraktScoreboardData({
  type,
  tmdbId,
  traktId,
  includeStats = true,
  season,
  episode,
} = {}) {
  const args = [
    String(type || ""),
    String(tmdbId || ""),
    traktId == null ? "" : String(traktId),
    season == null ? "" : String(season),
    episode == null ? "" : String(episode),
  ];

  return includeStats
    ? getCachedScoreboardFull(...args)
    : getCachedScoreboardQuick(...args);
}
