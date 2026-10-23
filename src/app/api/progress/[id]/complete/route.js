import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Marcar a mano como terminada una entrada de "Continuar viendo": el backend la
// quita de la lista y la apunta en el historial.
export async function POST(request, { params }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const res = await backendFetchJson(
    request,
    `/v1/progress/${encodeURIComponent(id)}/complete`,
    { method: "POST" },
  );
  const response = NextResponse.json(res.json || {}, { status: res.status || 200 });
  setBackendAuthCookies(response, res, { secure: getCookieSecure(request) });
  return response;
}
