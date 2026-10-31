import { NextResponse } from "next/server";

import { normalizeArtworkKey } from "@/lib/tmdb/artworkPicks";
import { hasTmdbKey, resolveArtworkPicks } from "@/lib/tmdb/artworkPicks.server";

// ARTE DE VARIOS TÍTULOS EN UNA PETICIÓN (POST { items: ["movie:603", …] }).
//
// Las tarjetas de las listas y las vistas previas del índice elegían su póster
// inglés pidiendo /images a TMDb DESDE EL NAVEGADOR, una petición por título:
// una ficha de 48 títulos eran 48 peticiones y el índice de colecciones, cientos
// (TMDb respondía 429 y había que reintentar). Aquí se piden desde el servidor,
// con concurrencia limitada y reintentos, y quedan cacheadas UN DÍA para todos
// los usuarios: la segunda vez es instantáneo. Los criterios de elección son
// los mismos (lib/tmdb/artworkPicks).
//
// Se piden la FICHA (aporta `original_language`, que la escalera necesita
// para su escalón «idioma original») y la galería `/images` sin filtro de
// idioma, que trae el arte de todos los idiomas. NO `append_to_response=images`:
// pedido desde el servidor, TMDb lo devuelve a veces filtrado solo al inglés
// (medido: «Ley y orden: UVE», 39 de 130 pósters y ninguno de los 30 sin
// idioma), y la portada y el fondo de las listas salían con el póster con
// título aunque hubiera uno sin texto.
//
// También admite TEMPORADAS ("season:1396:2", tarjetas de «Temporadas» de la
// ficha): su galería sin filtro de idioma más la ficha de la serie, que aporta
// el idioma original (y es la misma petición cacheada que "tv:1396").

const MAX_ITEMS = 60;

export async function POST(request) {
  if (!hasTmdbKey()) return NextResponse.json({ error: "Missing TMDb key" }, { status: 500 });
  const body = await request.json().catch(() => null);
  const keys = [
    ...new Set(
      (Array.isArray(body?.items) ? body.items : [])
        .map(normalizeArtworkKey)
        .filter(Boolean),
    ),
  ].slice(0, MAX_ITEMS);

  const entries = await Promise.all(
    keys.map(async (key) => [key, await resolveArtworkPicks(key)]),
  );

  return NextResponse.json(
    { ok: true, artwork: Object.fromEntries(entries) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
