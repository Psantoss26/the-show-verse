import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since") || "";
    const backend = await backendFetchJson(
      request,
      `/v1/import/netflix/poll?since=${encodeURIComponent(since)}`,
    );

    if (!backend.ok) {
      return NextResponse.json(
        { error: backend.error || "No se pudo consultar la actividad de Netflix." },
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
