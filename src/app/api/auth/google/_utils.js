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
export function buildAndroidOauthHandoffUrl(origin, { code, state, error, claim } = {}) {
  // Con `claim`, la app no tiene que reprocesar nada: solo volver al login, que
  // recogerá la sesión ya preparada en el servidor.
  const destino = claim
    ? new URL(`/login?google_claim=${encodeURIComponent(claim)}`, origin)
    : (() => {
        const callbackUrl = new URL("/api/auth/google/callback", origin);
        if (code) callbackUrl.searchParams.set("code", code);
        if (state) callbackUrl.searchParams.set("state", state);
        if (error) callbackUrl.searchParams.set("error", error);
        callbackUrl.searchParams.set("app_handoff", "1");
        return callbackUrl;
      })();

  const appUrl = new URL("theshowverse://open");
  appUrl.searchParams.set("url", destino.toString());
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
export function buildAndroidHandoffPage(deepLink, opciones = {}) {
  const { claim = "", mensaje = "", textoBoton = "Abrir The Show Verse" } = opciones;
  const seguro = escaparHtml(deepLink);
  const enApp = claim
    ? `/login?google_claim=${encodeURIComponent(claim)}`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>The Show Verse</title>
<style>
  html,body { height:100%; }
  body { margin:0; display:flex; flex-direction:column; align-items:center;
         justify-content:center; gap:1.5rem; background:#000; color:#fff;
         font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  img { width:112px; height:112px; object-fit:contain;
        animation:latido 1.6s ease-in-out infinite; }
  @keyframes latido { 0%,100% { opacity:.85 } 50% { opacity:.35 } }
  @media (prefers-reduced-motion: reduce) { img { animation:none } }
  p { margin:0; color:#71717a; font-size:.85rem; }
  a.boton { display:none; padding:.85rem 1.4rem; border-radius:1rem;
            background:#eab308; color:#000; font-weight:800; text-decoration:none; }
  a.boton.visible { display:inline-block; }
</style>
</head>
<body>
  <img src="/logo-final-sinFondo.png" alt="">
  ${mensaje ? `<p>${escaparHtml(mensaje)}</p>` : ""}
  <a class="boton" id="volver" href="${seguro}">${escaparHtml(textoBoton)}</a>
  <script>
    // 1) Dentro de la app: a por la sesión y listo.
    if (navigator.userAgent.indexOf("TheShowVerseApp/") !== -1 && ${JSON.stringify(enApp)}) {
      location.replace(${JSON.stringify(enApp)});
    } else {
      // 2) En el navegador: intento de salto a la app. Si Chrome lo bloquea —lo
      //    hace cuando no nace de un gesto— la app se trae al frente sola en
      //    cuanto detecta que la sesión está lista; el botón solo aparece si eso
      //    tampoco ocurre, para no dejar a nadie sin salida.
      // El "<" va escapado: JSON.stringify no protege dentro de un <script>.
      setTimeout(function () { location.replace(${JSON.stringify(deepLink).replace(/</g, "\\u003C")}); }, 60);
      setTimeout(function () {
        var b = document.getElementById("volver");
        if (b) b.className = "boton visible";
      }, 4000);
    }
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
