import { backendFetchJson } from "@/lib/backend/server";
import { respondFromBackend } from "../detections/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resumen por plataforma de la detección (resueltas, corregidas, descartadas).
// Ver backend routes/streamingDetections.js → GET /streaming/stats.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Number.parseInt(searchParams.get("days") || "7", 10) || 7;
  const origin = ["browser", "android"].includes(searchParams.get("origin")) ? searchParams.get("origin") : "all";
  const backend = await backendFetchJson(
    request,
    `/v1/streaming/stats?days=${Math.min(30, Math.max(1, days))}&origin=${origin}`,
    { cache: "no-store" },
  );
  return respondFromBackend(request, backend, { platforms: [], totals: null });
}
