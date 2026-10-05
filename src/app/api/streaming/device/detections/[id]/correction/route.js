import { NextResponse } from "next/server";
import { proxyWithSyncToken } from "../../../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corrección desde la app: «no había ninguna ficha» o «el título es otro».
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  return proxyWithSyncToken(
    request,
    `/device/detections/${encodeURIComponent(id)}/correction`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
