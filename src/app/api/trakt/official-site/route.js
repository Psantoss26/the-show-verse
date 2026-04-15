import { NextResponse } from "next/server";
import { fetchTrakt } from "@/lib/trakt/fetchWithCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20; // Aumentado para producción

function normalizeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  return s.startsWith("http://") || s.startsWith("https://")
    ? s
    : `https://${s}`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tmdbId = searchParams.get("tmdbId");
  const type = searchParams.get("type");

  if (!tmdbId) {
    return NextResponse.json({ error: "Missing tmdbId" }, { status: 400 });
  }

  const traktType = type === "tv" ? "show" : "movie";
  const plural = traktType === "show" ? "shows" : "movies";
  const timeoutMs = process.env.NODE_ENV === "production" ? 10000 : 6000;

  try {
    // Compartir cache con stats/scoreboard/community para evitar duplicar llamadas
    const search = await fetchTrakt(
      `/search/tmdb/${encodeURIComponent(tmdbId)}?type=${traktType}`,
      { timeoutMs, cacheTTL: 10 * 60 * 1000 },
    );

    const first = Array.isArray(search) ? search[0] : null;
    const item = first?.[traktType];
    const traktId = item?.ids?.trakt;

    if (!traktId) {
      return NextResponse.json({ url: null });
    }

    const details = await fetchTrakt(
      `/${plural}/${encodeURIComponent(String(traktId))}?extended=full`,
      { timeoutMs, cacheTTL: 24 * 60 * 60 * 1000 },
    );

    const homepage = normalizeUrl(details?.homepage || null);
    const res = NextResponse.json({ url: homepage || null });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800",
    );
    return res;
  } catch (e) {
    const isExpected =
      e?.status === 403 ||
      e?.status === 404 ||
      e?.status === 429 ||
      /rate limit|timeout|forbidden/i.test(e?.message || "");
    if (!isExpected) {
      console.warn("Trakt official-site error:", e?.message);
    }
    return NextResponse.json({ url: null });
  }
}
