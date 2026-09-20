import { NextResponse } from "next/server";
import { isRatingLinksIdentity, resolveRatingLinks } from "@/lib/details/resolveRatingLinks";

export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const tmdbId = searchParams.get("tmdbId");
  if (!isRatingLinksIdentity(type, tmdbId)) {
    return NextResponse.json({ error: "Invalid type or TMDb id" }, { status: 400 });
  }
  try {
    const links = await resolveRatingLinks({ type, tmdbId });
    return NextResponse.json(links, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch {
    return NextResponse.json(
      { rt: null, mc: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
