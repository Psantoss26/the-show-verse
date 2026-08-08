import { randomBytes } from "crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "showverse_google_oauth_state";
export const GOOGLE_OAUTH_NEXT_COOKIE = "showverse_google_oauth_next";
export const ANDROID_APP_USER_AGENT_TOKEN = "TheShowVerseApp/";
export const ANDROID_OAUTH_STATE_PREFIX = "android.";

export function sanitizeNextPath(value) {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  if (next.startsWith("/auth/callback")) return "/";
  if (next.startsWith("/auth/tmdb/callback")) return "/";
  return next;
}

export function isAndroidAppUserAgent(userAgent) {
  return String(userAgent || "").includes(ANDROID_APP_USER_AGENT_TOKEN);
}

export function createOauthState({ android = false } = {}) {
  const token = randomBytes(32).toString("hex");
  return android ? `${ANDROID_OAUTH_STATE_PREFIX}${token}` : token;
}

export function isAndroidOauthState(value) {
  return new RegExp(`^${ANDROID_OAUTH_STATE_PREFIX}[a-f0-9]{64}$`).test(
    String(value || ""),
  );
}

/**
 * El navegador del proveedor no comparte cookies con el WebView. Devuelve el
 * código OAuth a la app mediante su esquema propio; WebAppActivity abrirá la
 * URL HTTPS interna en el WebView, donde sí vive la cookie `state` original.
 */
export function buildAndroidOauthHandoffUrl(origin, { code, state, error } = {}) {
  const callbackUrl = new URL("/api/auth/google/callback", origin);
  if (code) callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);
  if (error) callbackUrl.searchParams.set("error", error);
  callbackUrl.searchParams.set("app_handoff", "1");

  const appUrl = new URL("theshowverse://open");
  appUrl.searchParams.set("url", callbackUrl.toString());
  return appUrl;
}

/** Escapa para poder incrustar la URL en HTML y en un literal JS sin romperlos. */
function escaparHtml(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Página de vuelta a la app tras el login de Google.
 *
 * POR QUÉ NO BASTA UN 307 al esquema `theshowverse://`. Chrome bloquea los
 * saltos a otra aplicación que llegan como REDIRECCIÓN, sin que el usuario haya
 * tocado nada: es una protección suya contra webs que secuestran la navegación.
 * Resultado: la pestaña se quedaba en blanco y la sesión no volvía nunca — "elijo
 * mi cuenta y no pasa nada".
 *
 * Esta página intenta el salto automático igualmente (funciona en los
 * navegadores que sí lo permiten) y, si no ocurre, deja un BOTÓN: pulsarlo es un
 * gesto del usuario, y con gesto el navegador siempre abre la app.
 */
export function buildAndroidHandoffPage(deepLink) {
  const seguro = escaparHtml(deepLink);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Volviendo a The Show Verse…</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:flex; flex-direction:column;
         align-items:center; justify-content:center; gap:1.25rem; padding:2rem;
         background:#000; color:#fff; text-align:center;
         font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  p { margin:0; color:#a1a1aa; font-size:.95rem; line-height:1.5; }
  a.boton { display:inline-block; padding:.9rem 1.5rem; border-radius:1rem;
            background:linear-gradient(135deg,#f59e0b,#d97706); color:#000;
            font-weight:800; text-decoration:none; }
</style>
</head>
<body>
  <p>Sesión iniciada. Volviendo a The Show Verse…</p>
  <a class="boton" id="volver" href="${seguro}">Abrir The Show Verse</a>
  <script>
    // Salto automático; si el navegador lo bloquea, queda el botón de arriba.
    // El "<" va escapado: JSON.stringify NO protege dentro de un <script>, y un
    // "</script>" en el enlace cerraría la etiqueta. Los parámetros code y state
    // llegan por la URL: esto es la diferencia entre una página y un XSS.
    window.location.replace(${JSON.stringify(deepLink).replace(/</g, "\\u003C")});
  </script>
</body>
</html>`;
}

export function getRequestOrigin(request) {
  // Origen público forzado (autoalojado tras proxy/túnel, donde request.url usa
  // el HOSTNAME interno). En Vercel no se define → cae a las cabeceras.
  const forced = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (forced) return forced.replace(/\/+$/, "");
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) return `${proto || "https"}://${host}`;
  return request.nextUrl.origin;
}

export function getGoogleRedirectUri(request) {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${getRequestOrigin(request).replace(/\/+$/, "")}/api/auth/google/callback`
  );
}

export function clearGoogleOauthCookies(response, request) {
  const secure = request?.nextUrl?.protocol === "https:";
  for (const name of [GOOGLE_OAUTH_STATE_COOKIE, GOOGLE_OAUTH_NEXT_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
