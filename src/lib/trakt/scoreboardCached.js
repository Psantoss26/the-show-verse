import { unstable_cache } from "next/cache";
import { getTraktScoreboardData } from "@/lib/trakt/scoreboard";

const getCachedScoreboard = unstable_cache(
  async (type, tmdbId, traktId = "", season = "", episode = "") => {
    return getTraktScoreboardData({
      type,
      tmdbId,
      traktId: traktId || undefined,
      season: season || undefined,
      episode: episode || undefined,
    });
  },
  ["trakt-scoreboard-public"],
  // 2 min: evita que un timeout puntual en stats deje un resultado parcial
  // "pegado" demasiado tiempo en SSR. El cliente sigue teniendo fallback.
  { revalidate: 120 },
);

export async function getCachedTraktScoreboardData({
  type,
  tmdbId,
  traktId,
  season,
  episode,
} = {}) {
  return getCachedScoreboard(
    String(type || ""),
    String(tmdbId || ""),
    traktId == null ? "" : String(traktId),
    season == null ? "" : String(season),
    episode == null ? "" : String(episode),
  );
}
