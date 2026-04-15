// src/app/api/trakt/community/_utils.js
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { fetchTrakt as fetchTraktWithCache } from "@/lib/trakt/fetchWithCache";

const TRAKT_BASE = "https://api.trakt.tv";

export function traktClientId() {
  const id =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    "";
  if (!id) {
    console.error(
      "❌ TRAKT_CLIENT_ID no configurada. Variables disponibles:",
      Object.keys(process.env).filter((k) => k.includes("TRAKT")),
    );
  }
  return id;
}

function traktUserAgent() {
  return (
    process.env.TRAKT_USER_AGENT ||
    "TheShowVerse/1.0 (Next.js; Trakt Community)"
  );
}

export async function traktHeaders({ includeAuth = false } = {}) {
  const clientId = traktClientId();

  const h = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    "User-Agent": traktUserAgent(),
  };

  if (!includeAuth) return h;

  // ✅ Next (dynamic APIs): cookies() puede ser Promise -> hay que await
  const c = await cookies();

  const token =
    c.get("trakt_access_token")?.value ||
    c.get("traktAccessToken")?.value ||
    c.get("trakt_token")?.value ||
    "";

  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function safeTraktBody(res) {
  const raw = await res.text().catch(() => "");
  if (!raw) return { json: null, text: "" };
  try {
    return { json: JSON.parse(raw), text: raw };
  } catch {
    return { json: null, text: raw };
  }
}

export function buildTraktErrorMessage({ res, json, text, fallback }) {
  const isCloudflare =
    Number(res?.status) === 403 &&
    /cloudflare|attention required/i.test(String(text || ""));
  if (isCloudflare) {
    return "Trakt/Cloudflare bloqueó temporalmente la petición de comunidad";
  }
  return json?.error || json?.message || fallback;
}

// Cache cross-instancia (Vercel KV/filesystem) para resolver TMDb→Trakt ID.
// Múltiples rutas llaman a este endpoint en paralelo; sin cache compartido
// cada instancia de función hace su propia petición a Trakt y las peticiones
// concurrentes activan el rate-limit (403). Con unstable_cache, el primer
// resolve se comparte entre todas las instancias durante 1 hora.
const _resolveIdCached = unstable_cache(
  async (type, tmdbIdStr) => {
    const timeoutMs = process.env.NODE_ENV === "production" ? 8000 : 6000;
    const json = await fetchTraktWithCache(
      `/search/tmdb/${tmdbIdStr}?type=${type}`,
      {
        timeoutMs,
        maxRetries: 0,
        cacheTTL: 60 * 60 * 1000, // 1h en cache de módulo
      },
    );

    const first = Array.isArray(json) ? json[0] : null;
    const item = first?.[type] || null;
    const traktId = item?.ids?.trakt || null;
    const slug = item?.ids?.slug || null;

    if (!traktId)
      throw new Error("No se encontró el item en Trakt para ese TMDb ID");
    return { traktId, slug };
  },
  ["trakt-tmdb-resolve"],
  { revalidate: 3600 }, // 1h en cache persistente cross-instancia
);

export async function resolveTraktIdFromTmdb({ type, tmdbId }) {
  return _resolveIdCached(String(type), String(tmdbId));
}

export function readPaginationHeaders(res) {
  const itemCount = Number(res.headers.get("x-pagination-item-count") || 0);
  const pageCount = Number(res.headers.get("x-pagination-page-count") || 0);
  const page = Number(res.headers.get("x-pagination-page") || 1);
  const limit = Number(res.headers.get("x-pagination-limit") || 0);
  return {
    itemCount: Number.isFinite(itemCount) ? itemCount : 0,
    pageCount: Number.isFinite(pageCount) ? pageCount : 0,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 0,
  };
}
