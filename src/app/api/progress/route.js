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
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  if (search) {
    const res = await backendFetchJson(
      request,
      `/v1/tmdb/search?q=${encodeURIComponent(search)}&type=multi&page=1`,
      { cache: "no-store" },
    );
    return respond(request, res, { results: [] }, res.status || 200);
  }

  const res = await backendFetchJson(request, "/v1/progress", { cache: "no-store" });
  if (!res.ok) {
    return respond(request, res, { results: [] }, res.status || 200);
  }
  return respond(request, res, { results: [] });
}

// Añadir manualmente una película o serie a "Continuar viendo".
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const res = await backendFetchJson(request, "/v1/progress", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return respond(request, res, {}, res.status || 200);
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
