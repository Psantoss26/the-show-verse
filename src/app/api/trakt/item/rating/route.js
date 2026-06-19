import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  backendFetchJson,
  mediaTypeToBackend,
  setBackendAuthCookies,
} from "@/lib/backend/server";

const TRAKT_BASE = "https://api.trakt.tv";
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

async function getTraktAccessTokenOrNull() {
  const store = await cookies();
  return store.get("trakt_access_token")?.value || null;
}

function traktHeaders(token) {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": TRAKT_CLIENT_ID,
    Authorization: `Bearer ${token}`,
  };
}

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

    let backendResult = null;
    try {
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

      if (backend.ok) {
        backendResult = backend;
      } else if (!backend.skipped && backend.status !== 401) {
        console.warn("Backend rating failed; falling back to Trakt", backend.error);
      }
    } catch (e) {
      console.warn("Backend rating failed; falling back to Trakt", e);
    }

    const token = await getTraktAccessTokenOrNull();
    const payloadKey = normalizedType === "movie" ? "movies" : "shows";

    if (token) {
      try {
        if (rating == null) {
          await fetch(`${TRAKT_BASE}/sync/ratings/remove`, {
            method: "POST",
            headers: traktHeaders(token),
            body: JSON.stringify({ [payloadKey]: [{ ids: { tmdb: id } }] }),
          });
        } else {
          const safe = normalizeRating(rating);
          if (safe) {
            await fetch(`${TRAKT_BASE}/sync/ratings`, {
              method: "POST",
              headers: traktHeaders(token),
              body: JSON.stringify({
                [payloadKey]: [{ ids: { tmdb: id }, rating: safe }],
              }),
            });
          }
        }
      } catch (traktErr) {
        console.warn("Failed to sync rating to Trakt:", traktErr);
      }
    }

    if (backendResult) {
      const res = NextResponse.json({
        ok: true,
        rating: rating == null ? null : normalizeRating(rating),
        source: "backend",
      });
      setBackendAuthCookies(res, backendResult, { secure: req.nextUrl?.protocol === "https:" });
      return res;
    }

    if (!token)
      return NextResponse.json({ error: "Not connected" }, { status: 401 });

    if (rating == null) {
      return NextResponse.json({ ok: true, rating: null });
    }

    const safe = normalizeRating(rating);
    if (!safe)
      return NextResponse.json({ error: "Bad rating" }, { status: 400 });

    return NextResponse.json({ ok: true, rating: safe });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Trakt rating error" },
      { status: 500 },
    );
  }
}
