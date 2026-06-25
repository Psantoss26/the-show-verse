// src/app/api/dashboard/[surface]/route.js
// Proxy a la engine de dashboards del backend (GET /v1/dashboard/:surface).
// Reenvía la autenticación si la hay (recomendaciones personalizadas); si el
// usuario es anónimo, llama al backend SIN auth para obtener el contenido
// genérico (la engine sirve filas genéricas a usuarios no autenticados).
import { NextResponse } from "next/server";
import {
  backendFetchJson,
  setBackendAuthCookies,
  getBackendBaseUrl,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const SURFACES = new Set(["home", "movies", "series"]);

function emptyPayload(surface) {
  return {
    surface,
    personalized: false,
    generatedAt: new Date().toISOString(),
    rows: [],
  };
}

function noStore(response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request, { params }) {
  const { surface } = await params;
  if (!SURFACES.has(surface)) {
    return noStore(NextResponse.json(emptyPayload(surface), { status: 200 }));
  }

  const path = `/v1/dashboard/${surface}`;

  // 1) Intento autenticado (maneja refresh de token). Si devuelve datos, los usamos.
  try {
    const backend = await backendFetchJson(request, path);
    if (backend.ok && Array.isArray(backend.json?.rows)) {
      const res = NextResponse.json(backend.json);
      setBackendAuthCookies(res, backend, {
        secure: request.nextUrl.protocol === "https:",
      });
      return noStore(res);
    }
    // 2) Anónimo (sin token → backendFetchJson "skipped"): llamamos sin auth
    //    para obtener el contenido genérico de la engine.
    if (backend.skipped) {
      const base = getBackendBaseUrl();
      if (base) {
        const r = await fetch(`${base}${path}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (r.ok) {
          const json = await r.json().catch(() => null);
          if (Array.isArray(json?.rows)) {
            return noStore(NextResponse.json(json));
          }
        }
      }
    }
  } catch {
    // cae al fallback vacío
  }

  return noStore(NextResponse.json(emptyPayload(surface), { status: 200 }));
}
