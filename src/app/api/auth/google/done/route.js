import { NextResponse } from "next/server";
import { buildAndroidHandoffPage, buildAndroidOauthHandoffUrl, getRequestOrigin } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/google/done?claim=<id> — última pantalla del login en el móvil.
//
// Aquí acaba el navegador tras completar el login de Google. Es una página
// MÍNIMA y negra a propósito: antes se redirigía a /login, que monta la web
// entera, y durante el segundo que tarda la app en traerse al frente se veía el
// sitio —a veces con la sesión del navegador ya iniciada—. Con esto lo único
// que se ve es negro con el logotipo, indistinguible de la transición de la app.
//
// Sigue siendo una URL https del dominio, así que con los App Links verificados
// Android la intercepta y ni siquiera llega a pintarse. Y si el WebView acaba
// cargándola, su propio script se encarga de saltar a /login?google_claim=… para
// recoger la sesión.
export function GET(request) {
  const claim = request.nextUrl.searchParams.get("claim")?.trim() || "";
  const origen = getRequestOrigin(request);
  const enlace = buildAndroidOauthHandoffUrl(origen, { claim }).toString();

  return new NextResponse(buildAndroidHandoffPage(enlace, { claim }), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
