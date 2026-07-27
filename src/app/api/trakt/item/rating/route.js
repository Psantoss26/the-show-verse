import { NextResponse } from "next/server";
import {
  backendFetchJson,
  mediaTypeToBackend,
  setBackendAuthCookies,
} from "@/lib/backend/server";

function normalizeRating(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(10, Math.max(1, n));
  const normalized = Math.round(clamped * 10) / 10;
  return normalized >= 1 && normalized <= 10 ? normalized : null;
}

export async function POST(req) {
  try {
    const { type, tmdbId, rating, title, posterPath } = await req.json();
    const normalizedType = type === "tv" ? "show" : type;
    if (!["movie", "show"].includes(normalizedType))
      return NextResponse.json({ error: "Bad type" }, { status: 400 });

    const id = Number(tmdbId);
    if (!Number.isFinite(id))
      return NextResponse.json({ error: "Bad tmdbId" }, { status: 400 });

    const mediaType = mediaTypeToBackend(normalizedType);
    const backend =
      rating == null
        ? await backendFetchJson(req, `/v1/ratings/${encodeURIComponent(id)}/${mediaType}`, {
            method: "DELETE",
          })
        : await backendFetchJson(req, "/v1/ratings", {
            method: "POST",
            body: JSON.stringify({
              tmdbId: id,
              mediaType,
              rating: normalizeRating(rating),
              title: title || undefined,
              posterPath: posterPath || undefined,
            }),
          });

    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.error || "No se pudo guardar la puntuación" },
        { status: backend.status || 502 },
      );
    }

    const res = NextResponse.json({
      ok: true,
      rating: rating == null ? null : normalizeRating(rating),
      source: "backend",
      item: backend.json?.item || null,
    });
    setBackendAuthCookies(res, backend, {
      secure: req.nextUrl?.protocol === "https:",
    });
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Rating error" },
      { status: 500 },
    );
  }
}
