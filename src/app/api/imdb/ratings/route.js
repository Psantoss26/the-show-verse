import { NextResponse } from "next/server";
import {
  getImdbRatingsDatasetStatus,
  lookupImdbRatings,
} from "@/lib/server/imdbRatingsDataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 86400;
export const maxDuration = 60;

const cacheHeaders = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

const errorCacheHeaders = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

function parseIds(searchParams) {
  const ids = [
    searchParams.get("i"),
    searchParams.get("id"),
    searchParams.get("ids"),
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(ids)].slice(0, 100);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = parseIds(searchParams);

    if (!ids.length) {
      return NextResponse.json(
        { error: "Missing IMDb id. Use ?i=tt0111161 or ?ids=tt...,tt..." },
        { status: 400, headers: errorCacheHeaders },
      );
    }

    const items = await lookupImdbRatings(ids, {
      force: searchParams.get("refresh") === "1",
    });

    const firstId = ids[0]?.toLowerCase();
    const first = firstId ? items[firstId] || null : null;

    return NextResponse.json(
      {
        id: firstId,
        rating: first?.rating ?? null,
        votes: first?.votes ?? null,
        source: first?.source ?? "imdb-dataset",
        items,
        meta: getImdbRatingsDatasetStatus(),
      },
      { headers: cacheHeaders },
    );
  } catch (error) {
    return NextResponse.json(
      {
        rating: null,
        votes: null,
        items: {},
        error: error?.message || "IMDb ratings dataset unavailable",
        meta: getImdbRatingsDatasetStatus(),
      },
      { status: 200, headers: errorCacheHeaders },
    );
  }
}
