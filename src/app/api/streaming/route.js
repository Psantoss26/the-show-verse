// /src/app/api/streaming/route.js
import { NextResponse } from "next/server";
import { getStreamingProviders } from "@/lib/api/justwatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/streaming
 *
 * Obtiene las plataformas de streaming disponibles desde JustWatch
 *
 * Query params:
 * - title: Título de la película o serie (requerido)
 * - type: 'movie' o 'tv' (requerido)
 * - year: Año de lanzamiento (opcional)
 * - imdbId: ID de IMDB (opcional, no usado actualmente pero útil para futuro)
 * - tmdbId: ID de TMDB (opcional, no usado actualmente pero útil para futuro)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title");
    const type = searchParams.get("type") || "movie";
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year"))
      : null;

    // Validación
    if (!title) {
      return NextResponse.json(
        { error: "Title parameter is required" },
        { status: 400 },
      );
    }

    if (!["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 },
      );
    }

    // Obtener datos de JustWatch
    const result = await getStreamingProviders(title, type, year);

    // Cache por 24 horas
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control":
          "public, s-maxage=86400, stale-while-revalidate=172800",
      },
    });
  } catch (error) {
    console.error("Error in streaming API:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch streaming providers",
        providers: [],
        justwatchUrl: null,
      },
      { status: 500 },
    );
  }
}
