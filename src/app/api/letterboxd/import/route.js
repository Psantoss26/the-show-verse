import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import { mapLetterboxdChunk, resolveLetterboxdFilms } from "@/lib/letterboxd/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILMS = 200;
const MAX_ENTRIES = 1000;

// POST /api/letterboxd/import
// Una tanda de la exportación de Letterboxd (la lee el navegador, ver
// lib/letterboxd/export): { films, history, ratings, favorites, watchlist,
// reviews, reset }. Resuelve las películas con TMDb y pasa todo al backend.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const films = Array.isArray(body?.films) ? body.films : null;
    const history = Array.isArray(body?.history) ? body.history : [];
    const ratings = Array.isArray(body?.ratings) ? body.ratings : [];
    const favorites = Array.isArray(body?.favorites) ? body.favorites : [];
    const watchlist = Array.isArray(body?.watchlist) ? body.watchlist : [];
    const reviews = Array.isArray(body?.reviews) ? body.reviews : [];
    if (!films) {
      return NextResponse.json({ error: "Faltan las películas de la exportación." }, { status: 400 });
    }
    if (
      films.length > MAX_FILMS ||
      [history, ratings, favorites, watchlist, reviews].some((list) => list.length > MAX_ENTRIES)
    ) {
      return NextResponse.json({ error: "La tanda es demasiado grande." }, { status: 413 });
    }

    const { resolved, missing } = await resolveLetterboxdFilms(films);
    const payload = mapLetterboxdChunk({ history, ratings, favorites, watchlist, reviews }, resolved);

    const backend = await backendFetchJson(request, "/v1/import/letterboxd/data/chunk", {
      method: "POST",
      body: JSON.stringify({ ...payload, reset: Boolean(body?.reset) }),
    });

    // El refresco ha podido ROTAR el refresh token: se guarda también en los errores.
    const keepTokens = (response) =>
      setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });

    if (!backend.ok) {
      return keepTokens(
        NextResponse.json(
          { error: backend.error || "No se pudo importar desde Letterboxd." },
          { status: backend.status || 500 },
        ),
      );
    }

    return keepTokens(
      NextResponse.json({
        ok: true,
        films: films.length,
        resolved: resolved.size,
        missing: missing.map((film) => ({ name: film.name, year: film.year ?? null })),
        import: backend.json,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo importar desde Letterboxd." },
      { status: 500 },
    );
  }
}
