// src/app/api/tv/[id]/ratings/route.js
import { NextResponse } from "next/server";
import { getEpisodeRatings } from "@/lib/api/ratingsHelper";

const RATINGS_REVALIDATE_SECONDS = 60 * 60 * 24 * 30; // 30 días

// 👇 IMPORTANTE: params es asíncrono, hay que hacerle await
export async function GET(request, context) {
  const { params } = context;
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Falta el parámetro id de la serie." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const excludeSpecials = url.searchParams.get("excludeSpecials") === "true";

  try {
    const payload = await getEpisodeRatings(id, excludeSpecials);

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=${RATINGS_REVALIDATE_SECONDS}, stale-while-revalidate=${RATINGS_REVALIDATE_SECONDS}`,
      },
    });
  } catch (err) {
    console.error("Error en /api/tv/[id]/ratings:", err);

    const status = err.status || 500;

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            "Se ha alcanzado el límite de peticiones a TMDb al obtener las puntuaciones por episodio. Inténtalo de nuevo más tarde.",
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        error:
          err?.message ||
          "Error general al procesar la solicitud de puntuaciones por episodio.",
      },
      { status },
    );
  }
}
