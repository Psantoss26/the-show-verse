import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const TRAKT_BASE = "https://api.trakt.tv";
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;

function getTraktAccessTokenOrNull() {
  return cookies().get("trakt_access_token")?.value || null;
}

function traktHeaders(token) {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": TRAKT_CLIENT_ID,
    Authorization: `Bearer ${token}`,
  };
}

export async function POST(req) {
  try {
    const token = getTraktAccessTokenOrNull();
    if (!token)
      return NextResponse.json({ error: "Not connected" }, { status: 401 });

    const { type, tmdbId, rating } = await req.json();
    if (!["movie", "show"].includes(type))
      return NextResponse.json({ error: "Bad type" }, { status: 400 });

    const id = Number(tmdbId);
    if (!Number.isFinite(id))
      return NextResponse.json({ error: "Bad tmdbId" }, { status: 400 });

    const payloadKey = type === "movie" ? "movies" : "shows";

    // rating null => remove
    if (rating == null) {
      const res = await fetch(`${TRAKT_BASE}/sync/ratings/remove`, {
        method: "POST",
        headers: traktHeaders(token),
        body: JSON.stringify({ [payloadKey]: [{ ids: { tmdb: id } }] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        return NextResponse.json(
          { error: json?.error || "Trakt rating remove error", raw: json },
          { status: res.status },
        );
      return NextResponse.json({ ok: true, rating: null });
    }

    // Trakt rating suele ser 1..10 entero
    const r = Number(rating);
    const safe = Number.isFinite(r)
      ? Math.min(10, Math.max(1, Math.ceil(r)))
      : null;
    if (!safe)
      return NextResponse.json({ error: "Bad rating" }, { status: 400 });

    const res = await fetch(`${TRAKT_BASE}/sync/ratings`, {
      method: "POST",
      headers: traktHeaders(token),
      body: JSON.stringify({
        [payloadKey]: [{ ids: { tmdb: id }, rating: safe }],
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      return NextResponse.json(
        { error: json?.error || "Trakt rating error", raw: json },
        { status: res.status },
      );
    return NextResponse.json({ ok: true, rating: safe });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Trakt rating error" },
      { status: 500 },
    );
  }
}
