import { proxyWithSyncToken } from "../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buscador del título correcto en la corrección de la app.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 100);
  return proxyWithSyncToken(request, `/device/titles?q=${encodeURIComponent(q)}`);
}
