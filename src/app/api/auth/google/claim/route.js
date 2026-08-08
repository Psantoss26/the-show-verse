import { NextResponse } from "next/server";
import {
  clearBackendAuthCookies,
  getCookieSecure,
  setBackendTokenCookies,
} from "@/lib/backend/server";
import { reclamarEntrega } from "../handoffStore";
import { sanitizeNextPath } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/google/claim — la app recoge la sesión que dejó el navegador.
//
// Es la pieza que hace que el login funcione SIEMPRE. El navegador y el WebView
// no comparten cookies, así que en vez de depender de que el navegador devuelva
// el control —cosa que Chrome bloquea cuando la redirección no nace de un gesto—
// el WebView pregunta por su entrega, y las cookies de sesión se escriben EN
// ESTA RESPUESTA, que sí va a su almacén.
//
// La entrega es de un solo uso y caduca a los diez minutos.
export async function POST(request) {
  let appId = "";
  try {
    const body = await request.json();
    appId = typeof body?.app === "string" ? body.app.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!appId) {
    return NextResponse.json({ error: "missing_app" }, { status: 400 });
  }

  const entrega = reclamarEntrega(appId);

  // Todavía no ha vuelto del navegador: la app seguirá preguntando.
  if (entrega.estado === "pendiente") {
    return NextResponse.json({ status: "pending" });
  }
  if (entrega.estado === "desconocida") {
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }
  if (entrega.tokens?.error) {
    return NextResponse.json(
      { status: "error", error: entrega.tokens.error },
      { status: 400 },
    );
  }

  const response = NextResponse.json({
    status: "ready",
    next: sanitizeNextPath(entrega.next),
  });
  const secure = getCookieSecure(request);
  clearBackendAuthCookies(response, { secure });
  setBackendTokenCookies(response, entrega.tokens, { secure });
  return response;
}
