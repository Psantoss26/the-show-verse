import { proxyWithSyncToken } from "../../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  return proxyWithSyncToken(request, `/device/detections/${encodeURIComponent(id)}`);
}
