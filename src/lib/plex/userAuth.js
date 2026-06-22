// src/lib/plex/userAuth.js
// Conexión de Plex POR USUARIO mediante el flujo PIN de Plex (OAuth de Plex).
// Cada usuario autoriza su propia cuenta y se descubre su servidor local
// automáticamente vía plex.tv, sin tokens ni claves en variables de entorno.
// El X-Plex-Client-Identifier es público (identifica la app, no es un secreto).

const PLEX_TV = "https://plex.tv/api/v2";
const PLEX_AUTH_APP = "https://app.plex.tv/auth";

export const PLEX_PRODUCT = "The Show Verse";
// Identificador estable de la app (público). Permite usar PLEX_CLIENT_IDENTIFIER
// si existe, pero NO es obligatorio: hay un valor por defecto.
export const PLEX_CLIENT_ID =
  process.env.PLEX_CLIENT_IDENTIFIER?.trim() || "the-show-verse-web";

export const PLEX_TOKEN_COOKIE = "plex_user_token";
export const PLEX_PIN_COOKIE = "plex_pin";

export function plexHeaders(token) {
  const headers = {
    Accept: "application/json",
    "X-Plex-Product": PLEX_PRODUCT,
    "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
    "X-Plex-Version": "1.0",
    "X-Plex-Platform": "Web",
    "X-Plex-Device": "The Show Verse",
  };
  if (token) headers["X-Plex-Token"] = token;
  return headers;
}

// Origin REAL de la petición (header Host). El flujo se mantiene en el host del
// usuario para que la cookie del PIN y la sesión coincidan.
export function getRequestOrigin(req) {
  try {
    const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
      .split(",")[0]
      .trim();
    if (host) {
      const proto =
        (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() ||
        (req.nextUrl?.protocol ? req.nextUrl.protocol.replace(":", "") : "") ||
        "http";
      return `${proto}://${host}`;
    }
  } catch {
    // ignore
  }
  return req?.nextUrl?.origin || new URL(req.url).origin;
}

// 1. Crea un PIN fuerte en plex.tv.
export async function createPlexPin() {
  const res = await fetch(`${PLEX_TV}/pins?strong=true`, {
    method: "POST",
    headers: plexHeaders(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id || !json?.code) {
    throw new Error(json?.error || `Plex PIN HTTP ${res.status}`);
  }
  return { id: json.id, code: json.code };
}

// 2. URL de autorización de Plex (el usuario inicia sesión y autoriza la app).
export function buildPlexAuthUrl({ code, forwardUrl }) {
  const params = new URLSearchParams({
    clientID: PLEX_CLIENT_ID,
    code,
    forwardUrl,
    "context[device][product]": PLEX_PRODUCT,
    "context[device][version]": "1.0",
    "context[device][platform]": "Web",
    "context[device][device]": "The Show Verse",
  });
  // Plex usa una URL con fragmento (#?...).
  return `${PLEX_AUTH_APP}#?${params.toString()}`;
}

// 3. Consulta el PIN para obtener el authToken una vez autorizado.
export async function pollPlexPin(id, code) {
  const url = `${PLEX_TV}/pins/${encodeURIComponent(id)}${
    code ? `?code=${encodeURIComponent(code)}` : ""
  }`;
  const res = await fetch(url, { headers: plexHeaders(), cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.authToken || null;
}

export function getUserPlexToken(req) {
  return req?.cookies?.get?.(PLEX_TOKEN_COOKIE)?.value || "";
}

export function isPlexConnected(req) {
  return Boolean(getUserPlexToken(req));
}

// Cuenta de Plex del usuario (para mostrar quién está conectado).
export async function getPlexAccount(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${PLEX_TV}/user`, {
      headers: plexHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json?.uuid && !json?.username) return null;
    return {
      username: json.username || json.title || json.friendlyName || "Plex",
      email: json.email || null,
      thumb: json.thumb || null,
    };
  } catch {
    return null;
  }
}

// Descubre el servidor Plex del usuario vía plex.tv (funciona desde el servidor,
// plex.tv es público). Devuelve nombre, machineIdentifier y conexiones.
export async function discoverUserPlexServer(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${PLEX_TV}/resources?includeHttps=1&includeRelay=1`, {
      headers: plexHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const devices = await res.json().catch(() => null);
    if (!Array.isArray(devices)) return null;

    const servers = devices.filter((d) =>
      String(d?.provides || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .includes("server"),
    );
    if (servers.length === 0) return null;

    // Prioriza un servidor propio del usuario.
    const server = servers.find((s) => s.owned) || servers[0];
    const connections = Array.isArray(server.connections)
      ? server.connections.map((c) => ({
          uri: c.uri || null,
          address: c.address || null,
          local: !!c.local,
          relay: !!c.relay,
          protocol: c.protocol || null,
        }))
      : [];

    return {
      name: server.name || "Servidor Plex",
      machineIdentifier: server.clientIdentifier || null,
      product: server.product || "Plex Media Server",
      owned: !!server.owned,
      hasLocal: connections.some((c) => c.local),
      connections,
    };
  } catch {
    return null;
  }
}

export function setPlexTokenCookie(res, token, { secure = true } = {}) {
  res.cookies.set(PLEX_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // los tokens de Plex son de larga duración
  });
  return res;
}

export function clearPlexTokenCookie(res, { secure = true } = {}) {
  res.cookies.set(PLEX_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  return res;
}
