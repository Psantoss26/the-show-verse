import { NextResponse } from "next/server";
import { isRatingLinksIdentity } from "@/lib/details/resolveRatingLinks";
import { isRatingScoreSource, loadRatingScore, RATING_SCORE_SOURCES } from "@/lib/details/ratingScoresLoader";

export const runtime = "nodejs";

// Notas del público de Rotten Tomatoes (Popcornmeter), Metacritic (User Score)
// y Letterboxd (`lb`, solo películas: media 0–5 y valoraciones), ver
// lib/details/ratingScoresLoader.js.
//
// `source=rt|mc|lb` → { [source]: nota | null }: UNA fuente por petición, para
// que cada insignia llegue en cuanto responde su ficha (el cliente pide las
// tres a la vez, ver lib/details/useRatingLinks.js). Sin `source`, las tres
// juntas { rt, mc, lb } como antes.
const OK_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400" };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const tmdbId = searchParams.get("tmdbId");
  const source = searchParams.get("source");
  if (!isRatingLinksIdentity(type, tmdbId) || (source != null && !RATING_SCORE_SOURCES.includes(source))) {
    return NextResponse.json({ error: "Invalid type, TMDb id or source" }, { status: 400 });
  }
  const sources = source ? [source] : RATING_SCORE_SOURCES;
  try {
    const values = await Promise.all(sources.map((name) =>
      isRatingScoreSource(type, name) ? loadRatingScore({ type, tmdbId, source: name }) : null));
    return NextResponse.json(Object.fromEntries(sources.map((name, i) => [name, values[i]])), { headers: OK_HEADERS });
  } catch {
    return NextResponse.json(
      Object.fromEntries(sources.map((name) => [name, null])),
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
