import { NextResponse } from "next/server";
import { backendFetchJson } from "@/lib/backend/server";
import { respondFromBackend } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corrección de una detección: «no había ninguna ficha» o «el título es otro».
export async function POST(request, { params }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const backend = await backendFetchJson(
    request,
    `/v1/streaming/detections/${encodeURIComponent(id)}/correction`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return respondFromBackend(request, backend);
}
