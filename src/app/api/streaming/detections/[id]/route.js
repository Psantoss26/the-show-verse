import { backendFetchJson } from "@/lib/backend/server";
import { respondFromBackend } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const backend = await backendFetchJson(
    request,
    `/v1/streaming/detections/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  return respondFromBackend(request, backend);
}
