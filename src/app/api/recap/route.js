import { NextResponse } from "next/server";
import {
  backendFetchJson,
  getCookieSecure,
  setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Tu año en The Show Verse": el cálculo vive en el backend
// (backend/src/lib/yearInReview.js). Aquí solo se valida la consulta y se
// reenvían las cookies de sesión renovadas.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const year = searchParams.get("year");
  if (year) {
    if (!/^\d{4}$/.test(year)) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }
    qs.set("year", year);
  }
  if (searchParams.get("refresh") === "1") qs.set("refresh", "1");

  const backend = await backendFetchJson(request, `/v1/stats/year-in-review?${qs.toString()}`);
  const res = NextResponse.json(backend.json || { error: backend.error }, {
    status: backend.ok ? 200 : backend.status || 500,
    headers: { "Cache-Control": "private, no-store" },
  });
  setBackendAuthCookies(res, backend, { secure: getCookieSecure(request) });
  return res;
}
