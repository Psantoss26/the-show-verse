// src/app/api/trakt/history/show/route.js
import { NextResponse } from "next/server";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
} from "@/lib/trakt/server";

const TRAKT_BASE = "https://api.trakt.tv";

function traktUserAgent() {
  return (
    process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js; Trakt Sync)"
  );
}

export async function POST(request) {
  try {
    const cookieStore = request.cookies;
    const { token, refreshedTokens, shouldClear } =
      await getValidTraktToken(cookieStore);

    const respond = (payload, status = 200) => {
      const res = NextResponse.json(payload, { status });
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    };

    if (!token) {
      const res = NextResponse.json(
        {
          error: "No hay token de Trakt (no conectado).",
          code: "TRAKT_REAUTH_REQUIRED",
        },
        { status: 401 },
      );
      if (shouldClear) clearTraktCookies(res);
      return res;
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
      return respond(
        {
          error: `Trakt API error (${searchRes.status}): Respuesta no válida (esperaba JSON, recibió ${contentType})`,
        },
        searchRes.status || 500,
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
      return respond(
        {
          error:
            searchJson?.error ||
            searchJson?.message ||
            "Error buscando show en Trakt",
          ...(searchRes.status === 401 || searchRes.status === 403
            ? { code: "TRAKT_REAUTH_REQUIRED" }
            : {}),
        },
        searchRes.status,
      );
    }

    const show = searchJson?.[0]?.show;
    if (!show?.ids) {
      return respond(
        { error: "No se encontró el show en Trakt con ese TMDB id." },
        404,
      );
    }

    const isAdd = Boolean(watchedAt);

    // 2) Normaliza temporadas (solo requeridas para add)
    const cleanSeasonNumbers = (seasonNumbers || []).filter(
      (n) => typeof n === "number" && n > 0,
    );

    if (isAdd && cleanSeasonNumbers.length === 0) {
      return respond(
        {
          error:
            "No hay temporadas válidas (seasonNumbers vacío). Pasa seasons al modal/padre.",
        },
        400,
      );
    }

    // 3) Add o Remove
    const url = isAdd
      ? `${TRAKT_BASE}/sync/history`
      : `${TRAKT_BASE}/sync/history/remove`;

    let payload;
    if (isAdd) {
      const seasons = cleanSeasonNumbers.map((number) => ({
        number,
        watched_at: watchedAt,
      }));

      payload = {
        shows: [
          {
            title: show.title,
            year: show.year,
            ids: show.ids,
            seasons,
          },
        ],
      };
    } else {
      // Remove completo de la serie: evita payload grande por temporadas/episodios.
      payload = {
        shows: [
          {
            ids: show.ids,
          },
        ],
      };
    }

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
      return respond(
        {
          error: `Trakt sync error (${syncRes.status}): Respuesta no válida (esperaba JSON, recibió ${syncContentType})`,
        },
        syncRes.status || 500,
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
      return respond(
        {
          error:
            syncJson?.error ||
            syncJson?.message ||
            "Error sincronizando en Trakt",
          details: syncJson,
          ...(syncRes.status === 401 || syncRes.status === 403
            ? { code: "TRAKT_REAUTH_REQUIRED" }
            : {}),
        },
        syncRes.status,
      );
    }

    console.log("[history/show] Success:", syncJson);
    return respond(syncJson, 200);
  } catch (e) {
    console.error("[history/show] Unexpected error:", e);
    return NextResponse.json(
      {
        error: e?.message || "Error desconocido",
        stack: e?.stack,
        ...(e?.status === 401 || e?.status === 403
          ? { code: "TRAKT_REAUTH_REQUIRED" }
          : {}),
      },
      { status: 500 },
    );
  }
}
