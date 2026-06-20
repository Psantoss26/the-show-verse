import { NextResponse } from "next/server";
import {
  backendFetchJson,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/trakt/history/remove
 *
 * Body: { ids: string[] }  — UUIDs del historial propio (backend)
 *
 * - 1 ID  → DELETE /v1/history/:id
 * - N IDs → DELETE /v1/history/bulk  con body { ids }
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const ids = Array.isArray(body?.ids)
    ? body.ids.map((x) => String(x)).filter(Boolean)
    : [];

  if (!ids.length) {
    return NextResponse.json(
      { error: "ids debe ser un array con al menos un history id" },
      { status: 400 },
    );
  }

  // Usar el endpoint bulk si hay más de 1 ID; si no, DELETE individual
  const isBulk = ids.length > 1;
  const path = isBulk
    ? "/v1/history/bulk"
    : `/v1/history/${encodeURIComponent(ids[0])}`;

  const init = isBulk
    ? { method: "DELETE", body: JSON.stringify({ ids }), headers: { "Content-Type": "application/json" } }
    : { method: "DELETE" };

  const result = await backendFetchJson(req, path, init);

  if (result.skipped) {
    return NextResponse.json(
      { error: "Backend no disponible o no autenticado", code: "BACKEND_UNAVAILABLE" },
      { status: 503 },
    );
  }

  if (!result.ok) {
    const status = result.status === 404 ? 404 : result.status >= 400 ? result.status : 500;
    return NextResponse.json(
      { error: result.error || "Error al eliminar del historial" },
      { status },
    );
  }

  const res = NextResponse.json({ ok: true, deleted: ids });
  setBackendAuthCookies(res, result, { secure: req.nextUrl.protocol === "https:" });
  return res;
}
