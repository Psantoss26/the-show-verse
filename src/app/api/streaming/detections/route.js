import { backendFetchJson } from "@/lib/backend/server";
import { respondFromBackend } from "./respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detecciones recientes de la extensión y la app Android (para corregirlas
// aunque su notificación ya no esté). Ver backend routes/streamingDetections.js.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const days = Number.parseInt(searchParams.get("days") || "7", 10) || 7;
  const backend = await backendFetchJson(
    request,
    `/v1/streaming/detections?days=${Math.min(30, Math.max(1, days))}`,
    { cache: "no-store" },
  );
  return respondFromBackend(request, backend, { results: [] });
}
