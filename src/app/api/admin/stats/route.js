import { backendFetchJson } from "@/lib/backend/server";
import { rangeParam, respondFromBackend } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estadísticas de peticiones (solo administradores). Ver backend routes/admin.js.
export async function GET(request) {
  const backend = await backendFetchJson(
    request,
    `/v1/admin/stats?range=${rangeParam(request)}`,
    { cache: "no-store" },
  );
  return respondFromBackend(request, backend);
}
