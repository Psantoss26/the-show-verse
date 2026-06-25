// src/app/api/backend/item/status/route.js
// Estado (favorito / pendiente / visto) de un título LEÍDO ÚNICAMENTE del
// backend/BBDD propio. A diferencia de /api/trakt/item/status, NUNCA consulta
// Trakt: si no hay backend o sesión, devuelve estado vacío.
import { NextResponse } from "next/server";
import {
  backendFetchJson,
  mediaTypeToBackend,
  normalizeBackendStatus,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

const EMPTY = {
  connected: false,
  found: false,
  favorite: false,
  watchlist: false,
  inWatchlist: false,
  watched: false,
  source: "backend",
};

function noCache(response) {
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function GET(request) {
  const type = request.nextUrl.searchParams.get("type"); // movie | tv | show
  const tmdbId = request.nextUrl.searchParams.get("tmdbId");

  if (!tmdbId || !type) {
    return NextResponse.json(
      { error: "Missing tmdbId or type" },
      { status: 400 },
    );
  }

  // normalizeBackendStatus espera "movie" | "show"; aceptamos también "tv".
  const backendType = type === "tv" ? "show" : type;

  try {
    const backend = await backendFetchJson(
      request,
      `/v1/items/${encodeURIComponent(tmdbId)}/${mediaTypeToBackend(backendType)}/status`,
    );
    if (backend.ok) {
      const res = NextResponse.json(
        normalizeBackendStatus(backend.json, backendType),
      );
      setBackendAuthCookies(res, backend, {
        secure: request.nextUrl.protocol === "https:",
      });
      return noCache(res);
    }
  } catch {
    // Silencio: sin backend devolvemos estado vacío (jamás Trakt).
  }

  return noCache(NextResponse.json(EMPTY));
}
