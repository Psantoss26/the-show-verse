import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(request, backend, fallback, status) {
  const response = NextResponse.json(backend.json || fallback, {
    status: status ?? backend.status ?? 200,
  });
  setBackendAuthCookies(response, backend, {
    secure: getCookieSecure(request),
  });
  return response;
}

// Lectura del contenido en curso ("Continuar viendo") del usuario con sesión.
// Reenvía al backend (/v1/progress) usando las credenciales de la petición.
export async function GET(request) {
  const res = await backendFetchJson(request, "/v1/progress", { cache: "no-store" });
  if (!res.ok) {
    return respond(request, res, { results: [] }, res.status || 200);
  }
  return respond(request, res, { results: [] });
}

// Descartar una entrada de "Continuar viendo".
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const res = await backendFetchJson(request, `/v1/progress/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return respond(request, res, {}, res.status || 200);
}
