import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import { mapImdbChunk, resolveImdbTitles } from "@/lib/imdb/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLES = 200;
const MAX_ENTRIES = 1000;

// POST /api/imdb/import
// Una tanda de las exportaciones de IMDb (la lee el navegador, ver
// lib/imdb/export): { titles, ratings, watchlist, watched, lists, markWatched,
// reset }.
// Resuelve los títulos con TMDb por su id de IMDb y pasa todo al backend.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const titles = Array.isArray(body?.titles) ? body.titles : null;
    const ratings = Array.isArray(body?.ratings) ? body.ratings : [];
    const watchlist = Array.isArray(body?.watchlist) ? body.watchlist : [];
    const watched = Array.isArray(body?.watched) ? body.watched : [];
    const lists = Array.isArray(body?.lists) ? body.lists : [];
    if (!titles) {
      return NextResponse.json({ error: "Faltan los títulos de la exportación." }, { status: 400 });
    }
    const listItems = lists.reduce((sum, list) => sum + (Array.isArray(list?.items) ? list.items.length : 0), 0);
    if (
      titles.length > MAX_TITLES ||
      [ratings.length, watchlist.length, watched.length, listItems].some((count) => count > MAX_ENTRIES)
    ) {
      return NextResponse.json({ error: "La tanda es demasiado grande." }, { status: 413 });
    }

    const { resolved, missing } = await resolveImdbTitles(titles);
    const payload = mapImdbChunk(
      { ratings, watchlist, watched, lists, markWatched: Boolean(body?.markWatched) },
      resolved,
    );

    const backend = await backendFetchJson(request, "/v1/import/imdb/data/chunk", {
      method: "POST",
      body: JSON.stringify({ ...payload, reset: Boolean(body?.reset) }),
    });

    // El refresco ha podido ROTAR el refresh token: se guarda también en los errores.
    const keepTokens = (response) =>
      setBackendAuthCookies(response, backend, { secure: getCookieSecure(request) });

    if (!backend.ok) {
      return keepTokens(
        NextResponse.json(
          { error: backend.error || "No se pudo importar desde IMDb." },
          { status: backend.status || 500 },
        ),
      );
    }

    return keepTokens(
      NextResponse.json({
        ok: true,
        titles: titles.length,
        resolved: resolved.size,
        missing,
        import: backend.json,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo importar desde IMDb." },
      { status: 500 },
    );
  }
}
