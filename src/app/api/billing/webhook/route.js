import { NextResponse } from "next/server";
import { clientIpHeaders, getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/webhook — Stripe llama aquí (la URL pública de la app) y se
// reenvía al backend SIN tocar el cuerpo: la firma se calcula sobre los bytes
// exactos, y cualquier reserialización la invalida.
export async function POST(request) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return NextResponse.json({ error: "Backend not configured" }, { status: 503 });

  const body = await request.text();
  const res = await fetch(`${baseUrl}/v1/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": request.headers.get("stripe-signature") || "",
      ...clientIpHeaders(request),
    },
    body,
    cache: "no-store",
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
