import { NextResponse } from "next/server";

import { fetchTitleRecommendations } from "@/lib/details/titleRecommendations.server";

// RECOMENDACIONES DE UN TÍTULO (GET ?type=movie|tv&id=…) para el cliente
// (DetailModal y la ficha embebida, que no las traen del SSR): Trakt
// «relacionados» + dos páginas de TMDb, ordenadas y filtradas. Ver
// lib/details/titleRecommendations.server.js.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = Number(searchParams.get("id"));
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ results: [] }, { status: 400 });
  }
  const data = await fetchTitleRecommendations(type, id);
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
