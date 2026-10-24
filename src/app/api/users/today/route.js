import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_RE = /^(today|yesterday|week|\d{4}-\d{2}-\d{2})$/;

// GET /api/users/today?scope=following|community&day=today|yesterday|week|YYYY-MM-DD
//
// Página Hoy. Proxy directo del backend (mismo criterio que /api/users/feed):
// se reenvían las cookies rotadas y un fallo del backend llega con su estado
// real, para que la página no lo pinte como "nadie ha hecho nada".
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "community" ? "community" : "following";
  const rawDay = searchParams.get("day") || "today";
  const day = DAY_RE.test(rawDay) ? rawDay : "today";

  const backend = await backendFetchJson(
    request,
    `/v1/users/today?scope=${scope}&day=${encodeURIComponent(day)}`,
  );

  const res = NextResponse.json(
    backend.ok ? backend.json : { actions: [], days: [], forYou: [], error: backend.error },
    { status: backend.ok ? 200 : backend.status || 503 },
  );
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
