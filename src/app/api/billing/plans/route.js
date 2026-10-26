import { NextResponse } from "next/server";
import { backendFetchPublicJson } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/plans — catálogo y si la facturación está activa (público).
export async function GET(request) {
  const backend = await backendFetchPublicJson(request, "/v1/billing/plans");
  return NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.status || 503,
  });
}
