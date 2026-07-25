import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Solo se proxyan estas secciones del perfil (Phase 2). Cualquier otro segmento
// (profile/follow/followers/following) lo sirven sus rutas estáticas hermanas,
// que tienen prioridad; el resto se rechaza para no reenviar rutas arbitrarias.
const ALLOWED = new Set([
  "reviews",
  "watched",
  "watchlist",
  "favorites",
  "ratings",
  "lists",
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
  for (const key of ["limit", "offset"]) {
    const v = searchParams.get(key);
    if (v) qs.set(key, v);
  }
  const backend = await backendFetchJson(
    request,
    `/v1/users/${encodeURIComponent(username)}/${section}?${qs.toString()}`,
  );
  return respond(request, backend);
}
