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

function hasCommunityData(result) {
  return (
    typeof result?.community?.rating === "number" ||
    typeof result?.community?.votes === "number"
  );
}

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

  const cachedResult = await (includeStats
    ? getCachedScoreboardFull(...args)
    : getCachedScoreboardQuick(...args));

  if (cachedResult?.found && hasCommunityData(cachedResult)) {
    return cachedResult;
  }

  try {
    const freshResult = await getTraktScoreboardData({
      type,
      tmdbId,
      traktId,
      includeStats,
      season,
      episode,
    });

    if (freshResult?.found) {
      return freshResult;
    }

    return cachedResult || freshResult || { found: false };
  } catch {
    return cachedResult || { found: false };
  }
}
