// src/app/api/trakt/community/seasons/route.js
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY =
  process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Lista de temporadas de una serie — desde TMDb (no Trakt). La ficha solo usa el
// NÚMERO de temporada de aquí (los detalles/episodios los obtiene de TMDb aparte).
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tmdbId = searchParams.get("tmdbId");
    if (!tmdbId)
      return NextResponse.json({ error: "Falta tmdbId" }, { status: 400 });
    if (!TMDB_API_KEY) return NextResponse.json({ items: [] });

    const url = `${TMDB_API}/tv/${encodeURIComponent(tmdbId)}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return NextResponse.json({ items: [] });

    const json = await res.json();
    const seasons = Array.isArray(json?.seasons) ? json.seasons : [];
    const items = seasons
      .map((s) => {
        const number = Number(s?.season_number);
        if (!Number.isFinite(number)) return null;
        return {
          number,
          season_number: number,
          title: s?.name || `Temporada ${number}`,
          episode_count: Number(s?.episode_count) || 0,
          ids: { tmdb: Number(tmdbId) },
        };
      })
      .filter(Boolean);

    return NextResponse.json({ items });
  } catch (e) {
    if (e?.name === "AbortError") {
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
