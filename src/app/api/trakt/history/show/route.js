// src/app/api/trakt/history/show/route.js
import { NextResponse } from "next/server";

const TRAKT_BASE = "https://api.trakt.tv";

function traktUserAgent() {
  return (
    process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js; Trakt Sync)"
  );
}

function pickTraktToken(cookieStore) {
  // cookieStore: request.cookies
  return (
    cookieStore.get("trakt_access_token")?.value ||
    cookieStore.get("trakt_token")?.value ||
    cookieStore.get("access_token")?.value ||
    null
  );
}

export async function POST(request) {
  try {
    const token = pickTraktToken(request.cookies);
    if (!token) {
      return NextResponse.json(
        { error: "No hay token de Trakt (no conectado)." },
        { status: 401 },
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[history/show] Error parsing request body:", parseError);
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const { tmdbId, seasonNumbers = [], watchedAt } = body;

    if (!tmdbId) {
      return NextResponse.json({ error: "tmdbId requerido" }, { status: 400 });
    }

    const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
    if (!TRAKT_CLIENT_ID) {
      return NextResponse.json(
        { error: "Falta TRAKT_CLIENT_ID en el servidor." },
        { status: 500 },
      );
    }

    const traktHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      "User-Agent": traktUserAgent(),
    };

    // 1) Lookup del show por TMDB ID
    console.log("[history/show] Searching for show with TMDB ID:", tmdbId);
    const searchRes = await fetch(
      `${TRAKT_BASE}/search/tmdb/${tmdbId}?type=show`,
      {
        headers: traktHeaders,
        cache: "no-store",
      },
    );

    console.log("[history/show] Search response status:", searchRes.status);
    console.log(
      "[history/show] Search response content-type:",
      searchRes.headers.get("content-type"),
    );

    // Verificar si la respuesta es JSON antes de parsear
    const contentType = searchRes.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const textResponse = await searchRes.text();
      console.error(
        "[history/show] Trakt returned non-JSON response:",
        textResponse.substring(0, 300),
      );
      return NextResponse.json(
        {
          error: `Trakt API error (${searchRes.status}): Respuesta no válida (esperaba JSON, recibió ${contentType})`,
        },
        { status: searchRes.status || 500 },
      );
    }

    let searchJson;
    try {
      searchJson = await searchRes.json();
    } catch (jsonError) {
      console.error("[history/show] Error parsing search response:", jsonError);
      return NextResponse.json(
        { error: "Error parsing Trakt search response" },
        { status: 500 },
      );
    }

    if (!searchRes.ok) {
      return NextResponse.json(
        {
          error:
            searchJson?.error ||
            searchJson?.message ||
            "Error buscando show en Trakt",
        },
        { status: searchRes.status },
      );
    }

    const show = searchJson?.[0]?.show;
    if (!show?.ids) {
      return NextResponse.json(
        { error: "No se encontró el show en Trakt con ese TMDB id." },
        { status: 404 },
      );
    }

    // 2) Normaliza temporadas
    const cleanSeasonNumbers = (seasonNumbers || []).filter(
      (n) => typeof n === "number" && n > 0,
    );

    if (cleanSeasonNumbers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No hay temporadas válidas (seasonNumbers vacío). Pasa seasons al modal/padre.",
        },
        { status: 400 },
      );
    }

    const seasons = cleanSeasonNumbers.map((number) =>
      watchedAt ? { number, watched_at: watchedAt } : { number },
    );

    // 3) Add o Remove
    const url = watchedAt
      ? `${TRAKT_BASE}/sync/history`
      : `${TRAKT_BASE}/sync/history/remove`;
    const payload = {
      shows: [
        {
          title: show.title,
          year: show.year,
          ids: show.ids,
          seasons,
        },
      ],
    };

    console.log("[history/show] Syncing to Trakt:", { url, payload });
    const syncRes = await fetch(url, {
      method: "POST",
      headers: traktHeaders,
      body: JSON.stringify(payload),
    });

    console.log("[history/show] Sync response status:", syncRes.status);
    console.log(
      "[history/show] Sync response content-type:",
      syncRes.headers.get("content-type"),
    );

    // Verificar content-type antes de parsear
    const syncContentType = syncRes.headers.get("content-type") || "";
    if (!syncContentType.includes("application/json")) {
      const textResponse = await syncRes.text();
      console.error(
        "[history/show] Trakt sync returned non-JSON response:",
        textResponse.substring(0, 300),
      );
      return NextResponse.json(
        {
          error: `Trakt sync error (${syncRes.status}): Respuesta no válida (esperaba JSON, recibió ${syncContentType})`,
        },
        { status: syncRes.status || 500 },
      );
    }

    let syncJson;
    try {
      syncJson = await syncRes.json();
    } catch (jsonError) {
      console.error("[history/show] Error parsing sync response:", jsonError);
      syncJson = {};
    }

    if (!syncRes.ok) {
      return NextResponse.json(
        {
          error:
            syncJson?.error ||
            syncJson?.message ||
            "Error sincronizando en Trakt",
          details: syncJson,
        },
        { status: syncRes.status },
      );
    }

    console.log("[history/show] Success:", syncJson);
    return NextResponse.json(syncJson, { status: 200 });
  } catch (e) {
    console.error("[history/show] Unexpected error:", e);
    return NextResponse.json(
      { error: e?.message || "Error desconocido", stack: e?.stack },
      { status: 500 },
    );
  }
}
