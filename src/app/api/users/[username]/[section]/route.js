import { NextResponse } from "next/server";
import {
  backendFetchJson,
  backendFetchPublicJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Solo se proxyan estas secciones del perfil (Phase 2). Cualquier otro segmento
// (profile/follow/followers/following) lo sirven sus rutas estáticas hermanas,
// que tienen prioridad; el resto se rechaza para no reenviar rutas arbitrarias.
const ALLOWED = new Set([
  "level",
  "reviews",
  "watched",
  "watchlist",
  "favorites",
  "ratings",
  "lists",
  "activity",
]);

function respond(request, backend, successStatus = 200) {
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? successStatus : backend.status || 500,
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}

export async function GET(request, { params }) {
  const { username, section } = await params;
  if (!ALLOWED.has(section)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  for (const key of ["limit", "offset", "refresh"]) {
    const v = searchParams.get(key);
    if (v) qs.set(key, v);
  }
  // `activity` y `level` son públicos en el backend: el nivel de un miembro se ve
  // desde su perfil sin sesión, así que no pueden pasar por la variante que exige
  // credenciales o un visitante anónimo recibiría un 401.
  const isPublicSection = section === "activity" || section === "level";
  const path = section === "activity"
    ? `/v1/users/public/${encodeURIComponent(username)}/activity?${qs.toString()}`
    : `/v1/users/${encodeURIComponent(username)}/${section}?${qs.toString()}`;
  const fetchBackend = isPublicSection ? backendFetchPublicJson : backendFetchJson;
  const backend = await fetchBackend(request, path);
  return respond(request, backend);
}
