import { NextResponse } from "next/server";
import { normalizeType } from "@/lib/trakt/fetchWithCache";
import { getCachedTraktScoreboardData } from "@/lib/trakt/scoreboardCached";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 12;

const cacheHeaders = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = normalizeType(searchParams.get("type"));
    const tmdbId = searchParams.get("tmdbId");
    const traktId = searchParams.get("traktId");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if (!type || (!tmdbId && !traktId)) {
      return NextResponse.json(
        { found: false, error: "Missing type/tmdbId/traktId" },
        { status: 400, headers: cacheHeaders },
      );
    }

    const result = await getCachedTraktScoreboardData({
      type,
      tmdbId,
      traktId,
      season: season ?? undefined,
      episode: episode ?? undefined,
    });

    return NextResponse.json(result || { found: false }, {
      headers: cacheHeaders,
    });
  } catch (e) {
    const isRecoverable =
      e?.isTimeout ||
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 405 ||
      e?.status === 429 ||
      e?.name === "AbortError" ||
      (e?.status >= 500 && e?.status < 600) ||
      /timeout|rate limit|forbidden/i.test(e?.message || "");

    if (isRecoverable) {
      return NextResponse.json({ found: false }, { headers: cacheHeaders });
    }

    return NextResponse.json(
      {
        found: false,
        error: e?.message || "Unexpected error",
      },
      { status: 500, headers: cacheHeaders },
    );
  }
}
