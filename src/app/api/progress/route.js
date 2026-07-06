import { NextResponse } from "next/server";
import { backendFetchJson } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lectura del contenido en curso ("Continuar viendo") del usuario con sesión.
// Reenvía al backend (/v1/progress) usando las credenciales de la petición.
export async function GET(request) {
  const res = await backendFetchJson(request, "/v1/progress", { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ results: [] }, { status: res.status || 200 });
  }
  return NextResponse.json(res.json || { results: [] });
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
  return NextResponse.json(res.json || {}, { status: res.status || 200 });
}
