import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recibe pings de progreso de reproducción desde la extensión del navegador o la
// app Android (contenido YA resuelto: tmdbId/mediaType/temporada/episodio +
// posición/duración). Es un proxy fino: reenvía al backend con el token
// revocable de Netflix (Bearer). El backend hace el upsert y, al 90%, marca
// como visto. No hay resolución de TMDb aquí (el cliente cachea el resultado del
// sync inicial), por lo que es barato de llamar cada ~30 s.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const authHeader = request.headers.get("authorization") || "";
    const syncToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!syncToken) {
      return NextResponse.json({ error: "Sync token is required" }, { status: 401 });
    }

    if (!Number.isInteger(body?.tmdbId) || body.tmdbId <= 0) {
      return NextResponse.json({ error: "tmdbId is required" }, { status: 400 });
    }

    const baseUrl = getBackendBaseUrl();
    if (!baseUrl) {
      return NextResponse.json({ error: "Backend base URL is not configured" }, { status: 503 });
    }

    const res = await fetch(`${baseUrl}/v1/auth/netflix/progress`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${syncToken}`,
      },
      cache: "no-store",
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!res) {
      return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
    }

    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
