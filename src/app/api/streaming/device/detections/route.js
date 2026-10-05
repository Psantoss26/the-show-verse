import { proxyWithSyncToken } from "../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detecciones del móvil (registro de la app Android / The Show Verse Sync).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Number.parseInt(searchParams.get("days") || "7", 10) || 7;
  return proxyWithSyncToken(
    request,
    `/device/detections?days=${Math.min(30, Math.max(1, days))}`,
  );
}
