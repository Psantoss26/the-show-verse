import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Textos que NO son títulos, aprendidos de las correcciones del usuario (y las
// globales con consenso), por plataforma. Los piden la extensión y la app
// Android con su token de sincronización para no tomar esos textos por una
// ficha. Proxy fino de /v1/streaming/rules/not-a-title.
export async function GET(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Sync token is required" }, { status: 401 });
  }
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "Backend base URL is not configured" }, { status: 503 });
  }
  const res = await fetch(`${baseUrl}/v1/streaming/rules/not-a-title`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json", Authorization: authHeader },
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
