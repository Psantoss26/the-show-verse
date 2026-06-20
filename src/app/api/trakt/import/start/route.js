import { NextResponse } from "next/server";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktFetch,
} from "@/lib/trakt/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TRAKT_IMPORT_LIMIT = 50;
const TRAKT_IMPORT_MAX_PAGES = 500;

function normalizeMode(value) {
  return value === "all" ? "all" : "history_ratings";
}

function appendPage(path, page, limit = TRAKT_IMPORT_LIMIT) {
  const url = new URL(path, "https://api.trakt.tv");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  return `${url.pathname}${url.search}`;
}

function withoutExtendedFull(path) {
  const url = new URL(path, "https://api.trakt.tv");
  if (url.searchParams.get("extended") !== "full") return null;
  url.searchParams.delete("extended");
  return `${url.pathname}${url.search}`;
}

async function fetchTraktPage(path, token, page) {
  const pagePath = appendPage(path, page);
  let response = await traktFetch(pagePath, {
    token,
    timeoutMs: 30000,
    retries: 1,
  });

  if (!response.ok && response.status === 403) {
    const fallbackPath = withoutExtendedFull(pagePath);
    if (fallbackPath) {
      response = await traktFetch(fallbackPath, {
        token,
        timeoutMs: 30000,
        retries: 1,
      });
    }
  }

  if (!response.ok) {
    const error = new Error(
      response?.json?.error_description ||
        response?.json?.error ||
        response?.json?.message ||
        `Trakt HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }

  return Array.isArray(response.json) ? response.json : [];
}

async function sendImportChunk(request, payload) {
  const backend = await backendFetchJson(request, "/v1/import/trakt/data/chunk", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (backend.status === 413) {
    const history = Array.isArray(payload.history) ? payload.history : [];
    const ratings = Array.isArray(payload.ratings) ? payload.ratings : [];
    if (history.length > 1) {
      const mid = Math.ceil(history.length / 2);
      const first = await sendImportChunk(request, { ...payload, history: history.slice(0, mid), ratings: [] });
      const second = await sendImportChunk(request, { ...payload, reset: false, history: history.slice(mid), ratings: [] });
      return second.ok ? second : first;
    }
    if (ratings.length > 1) {
      const mid = Math.ceil(ratings.length / 2);
      const first = await sendImportChunk(request, { ...payload, history: [], ratings: ratings.slice(0, mid) });
      const second = await sendImportChunk(request, { ...payload, reset: false, history: [], ratings: ratings.slice(mid) });
      return second.ok ? second : first;
    }
  }

  return backend;
}

async function importTraktPagesToBackend(request, token, path, target) {
  let lastBackend = null;
  for (let page = 1; page <= TRAKT_IMPORT_MAX_PAGES; page += 1) {
    const items = await fetchTraktPage(path, token, page);
    if (items.length > 0) {
      lastBackend = await sendImportChunk(request, {
        history: target === "history" ? items : [],
        ratings: target === "ratings" ? items : [],
      });
      if (!lastBackend.ok) return lastBackend;
    }
    if (items.length < TRAKT_IMPORT_LIMIT || items.length === 0) break;
  }

  return lastBackend;
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let traktAuth;
  try {
    traktAuth = await getValidTraktToken(request.cookies);
  } catch (error) {
    const res = NextResponse.json(
      {
        error: "No se pudo renovar la conexión con Trakt.",
        detail: error?.message || null,
        code: "TRAKT_REFRESH_FAILED",
      },
      { status: 409 },
    );
    clearTraktCookies(res);
    return res;
  }

  if (!traktAuth?.token) {
    return NextResponse.json(
      {
        error: "Conecta Trakt antes de importar tu historial.",
        code: "TRAKT_NOT_CONNECTED",
      },
      { status: 409 },
    );
  }

  let backend = null;
  try {
    backend = await sendImportChunk(request, {
      reset: true,
      mode: normalizeMode(body?.mode),
      history: [],
      ratings: [],
    });
    if (!backend.ok) throw Object.assign(new Error(backend.error), { status: backend.status });

    const imports = [
      ["/sync/history?extended=full", "history"],
      ["/sync/ratings/movies?extended=full", "ratings"],
      ["/sync/ratings/shows?extended=full", "ratings"],
      ["/sync/ratings/episodes?extended=full", "ratings"],
    ];

    for (const [path, target] of imports) {
      backend = await importTraktPagesToBackend(request, traktAuth.token, path, target);
      if (backend && !backend.ok) {
        throw Object.assign(new Error(backend.error), { status: backend.status });
      }
    }

    backend = await sendImportChunk(request, {
      done: true,
      history: [],
      ratings: [],
    });
  } catch (error) {
    const isForbidden = Number(error?.status) === 403;
    const res = NextResponse.json(
      {
        error: isForbidden
          ? "Trakt ha bloqueado temporalmente la lectura del historial. Prueba de nuevo en unos minutos."
          : error?.status === 413
            ? "El lote de importación es demasiado grande."
            : "No se pudieron importar los datos de Trakt.",
        detail: error?.message || null,
        code: isForbidden
          ? "TRAKT_FORBIDDEN"
          : error?.status === 413
            ? "IMPORT_PAYLOAD_TOO_LARGE"
            : "TRAKT_IMPORT_FAILED",
      },
      { status: isForbidden ? 403 : error?.status || 502 },
    );
    if (traktAuth.refreshedTokens) setTraktCookies(res, traktAuth.refreshedTokens);
    return res;
  }

  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 202 : backend.status || 500,
  });

  if (traktAuth.refreshedTokens) setTraktCookies(res, traktAuth.refreshedTokens);
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });

  return res;
}
