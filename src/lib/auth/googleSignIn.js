// Inicio de sesión con Google: piezas comunes de la web y de la app de Android.
//
// WEB. Botón PROPIO con el diseño del formulario que, al pulsarlo, abre la
// ventana emergente oficial de Google para elegir cuenta sin salir de la página
// (Google Identity Services, flujo de código OAuth). El código se canjea en
// /api/auth/google/native, y la sesión entra en el contexto ANTES de navegar:
// así no se ve la web sin sesión un instante. La redirección clásica
// (/api/auth/google/start) queda de respaldo si el script de Google no carga o
// la ventana no se puede abrir.
//
// APP DE ANDROID. Login en el navegador con la recogida de sesión de siempre
// (googleRedirectHref con `app`); no se usa el selector nativo de cuentas.

export const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Parámetro con el que el callback por redirección vuelve a /login. */
export const GOOGLE_SESSION_PARAM = "google_session";

export function sanitizeNextPath(value) {
  const next = typeof value === "string" && value ? value : "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}

/**
 * Opciones de `google.accounts.oauth2.initCodeClient`: el botón es propio y, al
 * pulsarlo, abre la ventana emergente OFICIAL de Google para elegir cuenta.
 * Google devuelve un código de un solo uso que el servidor canjea con el
 * secreto del cliente (`redirect_uri = "postmessage"`); el idToken resultante
 * sigue el mismo camino que el resto de logins con Google.
 */
export function googleCodeClientOptions({ clientId, mode = "login" } = {}) {
  return {
    client_id: clientId,
    scope: "openid email profile",
    ux_mode: "popup",
    // Al crear cuenta, Google siempre pregunta qué cuenta usar.
    ...(mode === "register" ? { prompt: "select_account" } : {}),
  };
}

/**
 * Qué hacer cuando la ventana de Google no devuelve un código:
 * - "stay": el usuario la cerró; no se hace nada.
 * - "redirect": no se pudo abrir (bloqueador de ventanas); se entra por la
 *   página de Google, que no necesita ventana.
 * - "error": Google respondió con un error; se explica en el formulario.
 */
export function googlePopupNextStep(failure) {
  const type = failure?.type || failure?.error || "";
  if (type === "popup_closed" || type === "access_denied") return "stay";
  if (type === "popup_failed_to_open") return "redirect";
  return "error";
}

/** Código de error estable a partir de la respuesta del backend. */
export function normalizeBackendGoogleError(error, status = 0) {
  const message = String(error || "").toLowerCase();
  if (status === 404 || message.includes("backend http 404")) {
    return "backend_route_not_found";
  }
  if (message.includes("cors origin not allowed")) return "backend_cors_origin";
  if (message.includes("google_client_id")) return "backend_google_config";
  if (message.includes("audience")) return "google_audience_mismatch";
  if (message.includes("invalid value") || message.includes("invalid google token")) {
    return "google_token_rejected";
  }
  if (message.includes("email is not verified")) return "google_email_not_verified";
  if (status >= 500) return "backend_server_error";
  if (message.includes("backend api is not configured")) return "backend_missing_config";
  return "backend_auth_failed";
}

/** Login de Google por redirección (respaldo de la web y camino de la app). */
export function googleRedirectHref(next, { app } = {}) {
  const params = new URLSearchParams({ next: sanitizeNextPath(next) });
  if (app) params.set("app", app);
  return `/api/auth/google/start?${params.toString()}`;
}

let gisPromise = null;

/**
 * Carga el script de Google una sola vez y resuelve `google.accounts.oauth2`.
 * Rechaza si no se puede cargar.
 */
export function loadGoogleIdentityScript({ timeoutMs = 8000 } = {}) {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const done = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2);
      else reject(new Error("gis_unavailable"));
    };
    let script = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const timer = window.setTimeout(() => reject(new Error("gis_timeout")), timeoutMs);
    script.addEventListener("load", () => {
      window.clearTimeout(timer);
      done();
    });
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("gis_load_failed"));
    });
  }).catch((error) => {
    // Permite reintentar en la siguiente visita al formulario.
    gisPromise = null;
    throw error;
  });

  return gisPromise;
}
