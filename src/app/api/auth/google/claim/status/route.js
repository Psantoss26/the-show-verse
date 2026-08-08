import { NextResponse } from "next/server";
import { estadoEntrega } from "../../handoffStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/google/claim/status?app=<id> — ¿ha terminado ya el login?
//
// La consulta la hace el NATIVO mientras el usuario está en el navegador, para
// saber cuándo traer la app al frente. Por eso NO consume la entrega ni escribe
// cookies: si las escribiera, acabarían en el cliente HTTP de la app en vez de
// en el WebView, que es donde tiene que vivir la sesión. Consumir sigue siendo
// cosa de /claim, desde el WebView.
export async function GET(request) {
  const appId = request.nextUrl.searchParams.get("app")?.trim() || "";
  if (!appId) {
    return NextResponse.json({ error: "missing_app" }, { status: 400 });
  }

  const estado = estadoEntrega(appId);
  return NextResponse.json(
    { status: estado },
    { headers: { "cache-control": "no-store" } },
  );
}
