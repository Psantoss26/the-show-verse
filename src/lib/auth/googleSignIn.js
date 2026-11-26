// Inicio de sesión con Google: piezas comunes de la web y de la app de Android.
//
// WEB. Se usa el botón OFICIAL de Google Identity Services (GIS): lo pinta
// Google, con su diseño y su texto, y al pulsarlo abre la ventana de Google para
// elegir cuenta (FedCM en Chrome, ventana emergente en el resto) sin salir de la
// página. Devuelve un idToken que se canjea en /api/auth/google/native, y la
// sesión entra en el contexto ANTES de navegar: así no se ve la web sin sesión
// un instante. La redirección clásica (/api/auth/google/start) queda de
// respaldo si el script de Google no carga.
//
// APP DE ANDROID. El selector nativo de cuentas (Credential Manager) va
// primero; solo si falla de verdad —no si el usuario lo cierra— se abre el
// login en el navegador con la recogida de sesión de siempre.

export const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Parámetro con el que el callback por redirección vuelve a /login. */
export const GOOGLE_SESSION_PARAM = "google_session";

const BUTTON_MIN_WIDTH = 200; // límites que admite renderButton
const BUTTON_MAX_WIDTH = 400;
const BUTTON_DEFAULT_WIDTH = 320;

export function sanitizeNextPath(value) {
  const next = typeof value === "string" && value ? value : "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}

/** Opciones de `google.accounts.id.renderButton` para el tema oscuro de la web. */
export function googleButtonOptions({ width, mode = "login" } = {}) {
  const numeric = Number(width);
  const safeWidth = Number.isFinite(numeric)
    ? Math.round(Math.min(BUTTON_MAX_WIDTH, Math.max(BUTTON_MIN_WIDTH, numeric)))
    : BUTTON_DEFAULT_WIDTH;
  return {
    type: "standard",
    theme: "filled_black",
    size: "large",
    shape: "rectangular",
    text: mode === "register" ? "signup_with" : "continue_with",
    logo_alignment: "left",
    locale: "es",
    width: safeWidth,
  };
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

/**
 * Qué hacer en la app con el resultado del selector nativo:
 *   "exchange" → canjear el idToken; "stay" → el usuario lo cerró, no hacer
 *   nada; "browser" → caer al login en el navegador.
 */
export function appGoogleNextStep(result) {
  if (result?.ok && result?.idToken) return "exchange";
  if (result?.cancelled) return "stay";
  return "browser";
}

let gisPromise = null;

/** Carga el script de Google una sola vez. Rechaza si no se puede cargar. */
export function loadGoogleIdentityScript({ timeoutMs = 8000 } = {}) {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const done = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts.id);
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
