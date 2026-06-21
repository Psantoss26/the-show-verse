// src/lib/netflix/ingest.js
// Ingesta de actividad de visionado de Netflix autenticada por syncToken.
// Resuelve los títulos a TMDb y los reenvía al backend (batch) con dedup.
// Compartido por la extensión (/api/netflix/extension-import) y el bookmarklet
// (/api/netflix/bookmarklet-sync).

import { getBackendBaseUrl } from "@/lib/backend/server";
import { resolveNetflixItems } from "@/lib/netflix/resolve";

const MAX_ITEMS = 1000;

/**
 * @param {string} syncToken  Token revocable de Netflix del usuario.
 * @param {Array<{title:string,date?:string,watchedAt?:string}>} rawItems
 * @returns {Promise<{ok:boolean,status?:number,error?:string,fetched?:number,resolved?:number,imported?:number,duplicates?:number,skipped?:number,limited?:boolean}>}
 */
export async function ingestNetflixActivity(syncToken, rawItems, { maxItems = MAX_ITEMS } = {}) {
  if (!syncToken) {
    return { ok: false, status: 401, error: "Netflix sync token is required" };
  }

  const rows = (Array.isArray(rawItems) ? rawItems : [])
    .slice(0, maxItems)
    .map((item) => ({
      title: item?.title || "",
      date: item?.date || item?.watchedAt || "",
    }))
    .filter((row) => row.title);

  if (!rows.length) {
    return { ok: true, fetched: 0, resolved: 0, imported: 0, skipped: 0 };
  }

  const { resolved, skipped, limited } = await resolveNetflixItems(rows, { maxRows: maxItems });

  if (!resolved.length) {
    return { ok: true, fetched: rows.length, resolved: 0, imported: 0, skipped: skipped.length, limited };
  }

  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return { ok: false, status: 503, error: "Backend base URL is not configured" };
  }

  const res = await fetch(`${baseUrl}/v1/auth/netflix/sync/batch`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${syncToken}`,
    },
    cache: "no-store",
    body: JSON.stringify({ items: resolved }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status || 500, error: json?.error || `Backend HTTP ${res.status}` };
  }

  return {
    ok: true,
    fetched: rows.length,
    resolved: resolved.length,
    imported: Number(json?.imported || 0),
    duplicates: Number(json?.duplicates || 0),
    skipped: skipped.length,
    limited,
  };
}
