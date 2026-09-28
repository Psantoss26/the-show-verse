import { NextResponse } from "next/server";
import { backendFetchPublicJson } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/push/config — clave pública VAPID y canales activos del backend.
export async function GET(request) {
  const backend = await backendFetchPublicJson(request, "/v1/push/config");
  return NextResponse.json(
    backend.ok ? backend.json : { webPushPublicKey: null, web: false, fcm: false },
    { status: backend.ok ? 200 : backend.status || 503 },
  );
}
