import { backendFetchJson } from "@/lib/backend/server";
import { respondFromBackend } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ¿La sesión actual es de un administrador? Ver backend routes/admin.js.
export async function GET(request) {
  const backend = await backendFetchJson(request, "/v1/admin/me", { cache: "no-store" });
  return respondFromBackend(request, backend, { admin: false });
}
