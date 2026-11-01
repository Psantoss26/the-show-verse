// /src/app/api/streaming/route.js
import { NextResponse } from "next/server";
import { getStreamingProviders } from "@/lib/api/justwatch";
import { pickSpainTheatricalDate } from "@/lib/streaming/cinema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fecha de estreno en cines en España (TMDb). Decide si las ofertas de cine de
// JustWatch son cartelera o preventa (ver lib/streaming/cinema.js).
async function fetchSpainTheatricalDate(tmdbId) {
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!apiKey || !/^\d+$/.test(String(tmdbId || ""))) return null;
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${apiKey}`,
      { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return pickSpainTheatricalDate(json?.results);
  } catch {
    return null;
  }
}

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
 * - tmdbId: ID de TMDB (opcional): elige el título exacto en JustWatch y es
 *   obligatorio para devolver `cinema` (películas en cines o en preventa)
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

    const tmdbId = searchParams.get("tmdbId");

    // Obtener datos de JustWatch
    const { cinemaChains = [], ...result } = await getStreamingProviders(
      title,
      type,
      year,
      { tmdbId },
    );

    // JustWatch no respondió: 503 sin caché. Con un 200 vacío, el service
    // worker y la caché de la ficha lo guardaban como «sin plataformas».
    if (result.degraded) {
      return NextResponse.json(
        { providers: [], justwatchUrl: null, cinema: null, degraded: true },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    // El estado (en cines / preventa) lo calcula el cliente con la fecha de
    // hoy, para que no quede desfasado en cachés.
    const cinema =
      cinemaChains.length > 0
        ? { chains: cinemaChains, releaseDate: await fetchSpainTheatricalDate(tmdbId) }
        : null;

    // Cache por 24 horas; 6 horas si está en cines (la cartelera cambia cada
    // semana y una película puede salir de ella).
    return NextResponse.json(
      { ...result, cinema },
      {
        status: 200,
        headers: {
          "Cache-Control": cinema
            ? "public, s-maxage=21600, stale-while-revalidate=43200"
            : "public, s-maxage=86400, stale-while-revalidate=172800",
        },
      },
    );
  } catch (error) {
    console.error("Error in streaming API:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch streaming providers",
        providers: [],
        justwatchUrl: null,
        cinema: null,
        degraded: true,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
