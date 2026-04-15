import { NextResponse } from "next/server";
import { getCachedSeasonImdbData } from "@/lib/api/ratingsCached";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 3600;
export const maxDuration = 15;

const cacheHeaders = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showId = Number(searchParams.get("showId"));
    const imdbId = searchParams.get("imdbId");
    const seasonNumber = Number(searchParams.get("season"));

    if (!Number.isFinite(showId) || !imdbId || !Number.isFinite(seasonNumber)) {
      return NextResponse.json(
        { error: "Missing showId/imdbId/season" },
        { status: 400, headers: cacheHeaders },
      );
    }

    const result = await getCachedSeasonImdbData({
      showId,
      imdbId,
      seasonNumber,
    });

    return NextResponse.json(result || {}, { headers: cacheHeaders });
  } catch (e) {
    const isRecoverable =
      e?.isTimeout ||
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 429 ||
      e?.name === "AbortError" ||
      (e?.status >= 500 && e?.status < 600) ||
      /timeout|rate limit|omdb/i.test(e?.message || "");

    if (isRecoverable) {
      return NextResponse.json({}, { headers: cacheHeaders });
    }

    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500, headers: cacheHeaders },
    );
  }
}
