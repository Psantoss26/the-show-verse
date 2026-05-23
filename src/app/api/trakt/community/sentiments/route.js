// src/app/api/trakt/community/sentiments/route.js
import { NextResponse } from "next/server";
import {
  resolveTraktIdFromTmdb,
  traktHeaders,
  safeTraktBody,
  buildTraktErrorMessage,
} from "../_utils";
import { translateEnglishToSpanish } from "@/lib/server/translateText";

export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

function normalizeSentimentItems(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      sentiment: String(item?.sentiment || "").trim(),
      comment_ids: Array.isArray(item?.comment_ids) ? item.comment_ids : [],
    }))
    .filter((item) => item.sentiment);
}

async function translateSentimentItems(items) {
  return Promise.all(
    normalizeSentimentItems(items).map(async (item) => ({
      ...item,
      sentiment_es: await translateEnglishToSpanish(item.sentiment),
    })),
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "").toLowerCase(); // movie | show
    const tmdbId = searchParams.get("tmdbId");

    if (!tmdbId)
      return NextResponse.json({ error: "Falta tmdbId" }, { status: 400 });
    if (type !== "movie" && type !== "show")
      return NextResponse.json(
        { error: "type debe ser movie o show" },
        { status: 400 },
      );

    const { traktId } = await resolveTraktIdFromTmdb({ type, tmdbId });
    const headers = await traktHeaders({ includeAuth: false });
    const base = type === "movie" ? "movies" : "shows";
    const url = `https://api.trakt.tv/${base}/${traktId}/sentiments`;

    const res = await fetch(url, { headers, cache: "no-store" });
    const { json, text } = await safeTraktBody(res);

    if (!res.ok) {
      const msg = buildTraktErrorMessage({
        res,
        json,
        text,
        fallback: "Error cargando sentimientos",
      });
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const [good, bad] = await Promise.all([
      translateSentimentItems(json?.good),
      translateSentimentItems(json?.bad),
    ]);

    return NextResponse.json(
      {
        good,
        bad,
        analyzed_at: json?.analyzed_at || null,
        comment_count: Number(json?.comment_count || 0) || 0,
      },
      { headers: cacheHeaders },
    );
  } catch (e) {
    const isExpected =
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 429 ||
      /rate limit|timeout|no se encontr|forbidden/i.test(e?.message || "");
    if (!isExpected) console.warn("Trakt sentiments error:", e?.message);
    return NextResponse.json(
      { good: [], bad: [], analyzed_at: null, comment_count: 0 },
      { headers: cacheHeaders },
    );
  }
}
