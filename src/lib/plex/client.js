// src/lib/plex/client.js
// Cliente de Plex DESDE EL NAVEGADOR. Un servidor local (192.168.x.x) no es
// accesible desde el servidor (Vercel), pero sí desde el navegador del usuario,
// que está en la misma red, usando las URLs *.plex.direct (HTTPS con cert válido
// → sin mixed-content desde una app HTTPS). Si no estás en la red local, cae a la
// conexión remota/relay automáticamente.
//
// Uso (en componentes "use client"):
//   const conn = await getPlexConnection();
//   const data = await plexFetch("/search?query=Matrix");

"use client";

const SESSION_KEY = "showverse:plex:conn:v1";
const SESSION_TTL_MS = 10 * 60 * 1000;

let inMemory = null;
let inFlight = null;

function readSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.baseUrl || !parsed?.token) return null;
    if (Date.now() - Number(parsed.t || 0) > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(conn) {
  if (typeof window === "undefined" || !conn) return;
  try {
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...conn, t: Date.now() }),
    );
  } catch {
    // ignore
  }
}

export function clearPlexConnectionCache() {
  inMemory = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }
}

async function ping(uri, token, timeoutMs = 4500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `${uri}/identity?X-Plex-Token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" },
    );
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// Ordena conexiones: primero LOCAL (más rápida), luego directa remota, luego relay.
function orderConnections(connections) {
  return [...(connections || [])]
    .filter((c) => c?.uri)
    .sort((a, b) => {
      const score = (c) => (c.local ? 0 : c.relay ? 2 : 1);
      return score(a) - score(b);
    });
}

/**
 * Resuelve la mejor conexión accesible DESDE EL NAVEGADOR al servidor del usuario.
 * @returns {Promise<{baseUrl, token, machineIdentifier, serverName, kind}|null>}
 */
export async function getPlexConnection({ force = false } = {}) {
  if (!force) {
    if (inMemory) return inMemory;
    const cached = readSession();
    if (cached) {
      inMemory = cached;
      return cached;
    }
    if (inFlight) return inFlight;
  }

  inFlight = (async () => {
    try {
      const res = await fetch("/api/plex/auth/connection", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.connected || !json?.token || !json?.server) return null;

      const token = json.token;
      const ordered = orderConnections(json.server.connections);

      for (const conn of ordered) {
        const ok = await ping(conn.uri, token);
        if (ok) {
          const resolved = {
            baseUrl: conn.uri,
            token,
            machineIdentifier: json.server.machineIdentifier || null,
            serverName: json.server.name || null,
            kind: conn.local ? "local" : conn.relay ? "relay" : "remote",
          };
          inMemory = resolved;
          writeSession(resolved);
          return resolved;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Llama a la API del servidor Plex del usuario desde el navegador.
 */
export async function plexFetch(path, { timeoutMs = 8000 } = {}) {
  const conn = await getPlexConnection();
  if (!conn) return null;
  const sep = path.includes("?") ? "&" : "?";
  const url = `${conn.baseUrl}${path}${sep}X-Plex-Token=${encodeURIComponent(conn.token)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res.json().catch(() => null);
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Conexión interactiva (flujo PIN DESDE EL NAVEGADOR).
// Hacer el PIN desde el navegador hace que plex.tv vea la IP/ubicación REAL del
// usuario (no la del servidor de Vercel), evitando la alerta con IP de EE. UU.
// ───────────────────────────────────────────────────────────────────────────
const PLEX_AUTH_APP = "https://app.plex.tv/auth";

async function plexTvFetch(url, init) {
  return fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers || {}) }, cache: "no-store" });
}

async function fetchPlexConfig() {
  const res = await fetch("/api/plex/auth/config", { cache: "no-store" });
  const json = await res.json().catch(() => null);
  return json?.clientIdentifier ? json : null;
}

async function createPin(clientId, product) {
  // X-Plex-* como query params para evitar preflight CORS (Accept está safelisted).
  const url =
    `https://plex.tv/api/v2/pins?strong=true` +
    `&X-Plex-Product=${encodeURIComponent(product)}` +
    `&X-Plex-Client-Identifier=${encodeURIComponent(clientId)}`;
  const res = await plexTvFetch(url, { method: "POST" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id || !json?.code) throw new Error("No se pudo crear el PIN de Plex");
  return { id: json.id, code: json.code };
}

async function pollPin(id, code, clientId) {
  const url =
    `https://plex.tv/api/v2/pins/${encodeURIComponent(id)}` +
    `?code=${encodeURIComponent(code)}` +
    `&X-Plex-Client-Identifier=${encodeURIComponent(clientId)}`;
  const res = await plexTvFetch(url);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.authToken || null;
}

function buildAuthUrl(clientId, product, code, forwardUrl) {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    forwardUrl,
    "context[device][product]": product,
    "context[device][platform]": "Web",
    "context[device][device]": "The Show Verse",
  });
  return `${PLEX_AUTH_APP}#?${params.toString()}`;
}

/**
 * Conecta Plex con el flujo PIN ejecutado en el navegador (popup).
 * Devuelve { ok, error?, account? }.
 */
export async function connectPlexInteractive() {
  if (typeof window === "undefined") return { ok: false, error: "no_window" };

  // Abrir el popup YA (dentro del gesto de click) para evitar bloqueadores.
  const popup = window.open("about:blank", "plex-auth", "width=620,height=780,noopener=no");
  if (!popup) {
    // Popup bloqueado → respaldo: flujo por servidor (redirección completa).
    window.location.href = "/api/plex/auth/start?next=/profile/settings";
    return { ok: false, error: "popup_blocked" };
  }

  try {
    const config = await fetchPlexConfig();
    if (!config) {
      popup.close();
      return { ok: false, error: "config" };
    }

    const { id, code } = await createPin(config.clientIdentifier, config.product);
    const forwardUrl = `${window.location.origin}/api/plex/auth/close`;
    const authUrl = buildAuthUrl(config.clientIdentifier, config.product, code, forwardUrl);
    popup.location.href = authUrl;

    // Sondear el PIN hasta ~3 min (o hasta obtener token).
    const deadline = Date.now() + 3 * 60 * 1000;
    let token = null;
    let closedTicks = 0;
    while (Date.now() < deadline && !token) {
      await new Promise((r) => setTimeout(r, 2000));
      token = await pollPin(id, code, config.clientIdentifier).catch(() => null);
      if (!token && popup.closed) {
        // El usuario cerró el popup: damos un margen corto por si autorizó justo antes.
        closedTicks += 1;
        if (closedTicks >= 2) break;
      }
    }

    if (!token) {
      try { popup.close(); } catch { /* ignore */ }
      return { ok: false, error: popup.closed ? "cancelled" : "timeout" };
    }

    // Guardar el token en cookie httpOnly vía el servidor (lo valida contra plex.tv).
    const res = await fetch("/api/plex/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    try { popup.close(); } catch { /* ignore */ }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || "session" };

    clearPlexConnectionCache();
    return { ok: true, account: json?.account || null };
  } catch (e) {
    try { popup.close(); } catch { /* ignore */ }
    return { ok: false, error: e?.message || "error" };
  }
}

/**
 * Busca un título en el servidor del usuario (para "disponible en tu Plex").
 */
export async function plexSearch(query) {
  if (!query) return [];
  const data = await plexFetch(`/search?query=${encodeURIComponent(query)}`);
  const items = data?.MediaContainer?.Metadata;
  return Array.isArray(items) ? items : [];
}
