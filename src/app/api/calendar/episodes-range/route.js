// src/app/api/calendar/episodes-range/route.js
// Episodios de series para un rango de fechas de la página "Calendario".
// Proxy al backend `/v1/calendar/episodes` (BBDD propia + TMDB, SIN Trakt):
//   - Con sesión → llamada autenticada: prioriza las series del usuario
//     (en progreso, favoritos, pendientes).
//   - Anónimo → base pública de series populares (fetch sin auth, porque
//     backendFetchJson corta cuando no hay token).
import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getBackendBaseUrl,
  hasBackendCredentials,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

function emptyItems() {
  return NextResponse.json({ items: [] });
}

// Con `ranges=` (varios trozos en una petición) el backend responde
// `{ ranges: [...] }`; sin él, `{ items }`. Se reenvía la forma que toque. Un
// backend que aún no entienda `ranges` contesta `{ items }` y el cliente cae a
// pedir los trozos uno a uno.
function pickPayload(json) {
  if (Array.isArray(json?.ranges)) return { ranges: json.ranges };
  if (Array.isArray(json?.items)) return { items: json.items };
  return null;
}

export async function GET(request) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) return emptyItems();

  const qs = request.nextUrl.search || "";
  const path = `/v1/calendar/episodes${qs}`;

  try {
    // Con sesión → endpoint autenticado (prioriza las series del usuario).
    if (hasBackendCredentials(request)) {
      const backend = await backendFetchJson(request, path);
      const payload = backend.ok ? pickPayload(backend.json) : null;
      if (payload) {
        const res = NextResponse.json(payload);
        setBackendAuthCookies(res, backend, {
          secure: request.nextUrl.protocol === "https:",
        });
        res.headers.set("Cache-Control", "private, no-store");
        return res;
      }
    }

    // Anónimo (o fallo del autenticado) → base pública de series populares.
    const anon = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (anon.ok) {
      const json = await anon.json().catch(() => null);
      const payload = pickPayload(json);
      if (payload) {
        const res = NextResponse.json(payload);
        res.headers.set("Cache-Control", "public, max-age=300");
        return res;
      }
    }
  } catch {
    // Silencio: devolvemos base vacía y la sección se oculta.
  }

  return emptyItems();
}
