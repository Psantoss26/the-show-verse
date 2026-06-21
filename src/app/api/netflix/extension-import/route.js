import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend/server";
import { resolveNetflixItems } from "@/lib/netflix/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tope defensivo de filas por petición. La extensión pagina la actividad de
// visionado de Netflix y envía lotes; evitamos resolver miles de títulos contra
// TMDb en una sola llamada.
const MAX_ITEMS = 400;

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const syncToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!syncToken) {
      return NextResponse.json(
        { error: "Netflix sync token is required" },
        { status: 401 },
      );
    }

    const { items } = await request.json().catch(() => ({}));
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: true, fetched: 0, resolved: 0, imported: 0, skipped: 0 });
    }

    const rows = items.slice(0, MAX_ITEMS).map((item) => ({
      title: item?.title || "",
      date: item?.date || item?.watchedAt || "",
    }));

    const { resolved, skipped, limited } = await resolveNetflixItems(rows, { maxRows: MAX_ITEMS });

    if (!resolved.length) {
      return NextResponse.json({
        ok: true,
        fetched: rows.length,
        resolved: 0,
        imported: 0,
        skipped: skipped.length,
        limited,
      });
    }

    const baseUrl = getBackendBaseUrl();
    if (!baseUrl) {
      return NextResponse.json(
        { error: "Backend base URL is not configured" },
        { status: 503 },
      );
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
      return NextResponse.json(
        { error: json?.error || `Backend HTTP ${res.status}` },
        { status: res.status || 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      fetched: rows.length,
      resolved: resolved.length,
      imported: Number(json?.imported || 0),
      duplicates: Number(json?.duplicates || 0),
      skipped: skipped.length,
      limited,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
