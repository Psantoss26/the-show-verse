import { backendFetchJson } from "@/lib/backend/server";
import { rangeParam, respondFromBackend } from "../../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Actividad de un usuario (solo administradores). Ver backend routes/admin.js.
export async function GET(request, { params }) {
  const { id } = await params;
  const backend = await backendFetchJson(
    request,
    `/v1/admin/stats/users/${encodeURIComponent(id)}?range=${rangeParam(request)}`,
    { cache: "no-store" },
  );
  return respondFromBackend(request, backend);
}
