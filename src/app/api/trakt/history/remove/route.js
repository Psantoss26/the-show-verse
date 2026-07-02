import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  backendFetchJson,
  setBackendAuthCookies,
} from "@/lib/backend/server";
import {
  clearTraktCookies,
  getValidTraktToken,
  setTraktCookies,
  traktRemoveHistoryEntries,
} from "@/lib/trakt/server";
import { classifyHistoryEntryIds } from "@/lib/trakt/historyEntryIds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/trakt/history/remove
 *
 * Body: { ids: string[] }
 *
 * - UUIDs propios → backend PostgreSQL
 * - IDs numéricos → historial de Trakt (fallback legacy)
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const classified = classifyHistoryEntryIds(body?.ids);

  if (classified.kind === "empty") {
    return NextResponse.json(
      { error: "ids debe ser un array con al menos un history id" },
      { status: 400 },
    );
  }

  if (classified.kind === "invalid") {
    return NextResponse.json(
      { error: "Todos los history ids deben ser UUIDs o IDs numéricos del mismo origen" },
      { status: 400 },
    );
  }

  if (classified.kind === "trakt") {
    const cookieStore = await cookies();

    try {
      const { token, refreshedTokens, shouldClear } =
        await getValidTraktToken(cookieStore);
      if (!token) {
        const res = NextResponse.json(
          { error: "Trakt no está conectado" },
          { status: 401 },
        );
        if (shouldClear) clearTraktCookies(res);
        return res;
      }

      const trakt = await traktRemoveHistoryEntries(token, {
        ids: classified.ids,
      });
      const res = NextResponse.json({
        ok: true,
        deleted: classified.ids,
        source: "trakt",
        trakt,
      });
      if (refreshedTokens) setTraktCookies(res, refreshedTokens);
      return res;
    } catch (error) {
      return NextResponse.json(
        { error: error?.message || "Error al eliminar del historial de Trakt" },
        { status: error?.status || 500 },
      );
    }
  }

  const ids = classified.ids;

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
