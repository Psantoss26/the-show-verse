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
  { revalidate: 1800 },
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
