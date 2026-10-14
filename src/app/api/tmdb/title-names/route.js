// Nombres en inglés, en español y original de cada título, para el buscador
// de las páginas de usuario (lib/search/titleNames). Ruta pública del backend:
// no viajan credenciales, así que tampoco hay sesión que refrescar.
import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const keys = request.nextUrl.searchParams.get("keys") || "";
  const baseUrl = getBackendBaseUrl();
  if (!keys || !baseUrl) return NextResponse.json({ names: {} });

  try {
    const res = await fetch(`${baseUrl}/v1/tmdb/title-names?keys=${encodeURIComponent(keys)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const json = await res.json().catch(() => null);
    return NextResponse.json(json?.names ? { names: json.names } : { names: {} }, {
      status: res.ok ? 200 : res.status,
      // Los nombres de un id no cambian: el navegador puede reutilizarlos.
      headers: res.ok ? { "Cache-Control": "private, max-age=86400" } : undefined,
    });
  } catch {
    return NextResponse.json({ names: {} }, { status: 502 });
  }
}
