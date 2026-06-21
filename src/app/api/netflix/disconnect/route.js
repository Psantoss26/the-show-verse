import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const backend = await backendFetchJson(request, "/v1/auth/netflix/disconnect", {
      method: "POST",
    });

    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.error || "No se pudo desconectar la cuenta de Netflix." },
        { status: backend.status || 500 },
      );
    }

    const response = NextResponse.json(backend.json);
    setBackendAuthCookies(response, backend, {
      secure: getCookieSecure(request),
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Error interno del servidor." },
      { status: 500 },
    );
  }
}
