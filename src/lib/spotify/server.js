// src/lib/spotify/server.js
// OAuth por usuario para Spotify. Cada usuario autoriza su propia cuenta y los
// tokens se guardan en cookies httpOnly del navegador (igual que Trakt), sin
// necesidad de un refresh token global en .env.

import crypto from "node:crypto";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_API = "https://api.spotify.com/v1";

// Permisos mínimos para identificar la cuenta y leer sus playlists.
export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export const SPOTIFY_ACCESS_COOKIE = "spotify_access_token";
export const SPOTIFY_REFRESH_COOKIE = "spotify_refresh_token";
export const SPOTIFY_EXPIRES_COOKIE = "spotify_expires_at";

export function getSpotifyClientCreds() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

export function resolveSpotifyRedirectUri(origin) {
  const configured = String(process.env.SPOTIFY_REDIRECT_URI || "").trim();
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/+$/, "");
  return `${String(origin || "").replace(/\/+$/, "")}/api/spotify/callback`;
}

export function buildSpotifyAuthorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SPOTIFY_SCOPES,
    show_dialog: "true",
  });
  return `${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(creds) {
  return "Basic " + Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
}

export async function exchangeSpotifyCode({ code, redirectUri }) {
  const creds = getSpotifyClientCreds();
  if (!creds) throw new Error("Missing Spotify credentials");

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(creds),
      "content-type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    const err = new Error(json?.error_description || json?.error || `Spotify token HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json; // { access_token, refresh_token, expires_in, ... }
}

export async function refreshSpotifyToken(refreshToken) {
  const creds = getSpotifyClientCreds();
  if (!creds || !refreshToken) return null;

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(creds),
      "content-type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) return null;
  return json; // puede incluir un nuevo refresh_token
}

// Caché en memoria de access tokens por refresh token (hash) para no refrescar en
// cada petición. Seguro entre usuarios: la clave es el hash del refresh token.
const g = globalThis;
g.__svSpotifyUserTokens = g.__svSpotifyUserTokens ?? new Map();

function refreshKey(refreshToken) {
  return crypto.createHash("sha256").update(refreshToken).digest("hex");
}

/**
 * Devuelve un access token válido del usuario conectado (desde sus cookies),
 * refrescándolo si hace falta. Devuelve null si no hay sesión de Spotify.
 */
export async function getUserSpotifyAccessToken(req) {
  const access = req?.cookies?.get?.(SPOTIFY_ACCESS_COOKIE)?.value || "";
  const refresh = req?.cookies?.get?.(SPOTIFY_REFRESH_COOKIE)?.value || "";
  const expiresAt = Number(req?.cookies?.get?.(SPOTIFY_EXPIRES_COOKIE)?.value || 0);

  if (access && expiresAt > Date.now() + 30_000) return access;
  if (!refresh) return null;

  const key = refreshKey(refresh);
  const cached = g.__svSpotifyUserTokens.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const fresh = await refreshSpotifyToken(refresh);
  if (!fresh?.access_token) return null;

  g.__svSpotifyUserTokens.set(key, {
    token: fresh.access_token,
    expiresAt: Date.now() + Number(fresh.expires_in || 3600) * 1000,
  });
  return fresh.access_token;
}

export function isSpotifyConnected(req) {
  return Boolean(req?.cookies?.get?.(SPOTIFY_REFRESH_COOKIE)?.value);
}

export async function fetchSpotifyProfile(accessToken) {
  try {
    const res = await fetch(`${SPOTIFY_API}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json?.id) return null;
    return {
      id: json.id,
      displayName: json.display_name || json.id,
      email: json.email || null,
      product: json.product || null,
      image: Array.isArray(json.images) && json.images[0]?.url ? json.images[0].url : null,
    };
  } catch {
    return null;
  }
}

export function setSpotifyCookies(res, tokens, { secure = true } = {}) {
  const { access_token, refresh_token, expires_in } = tokens || {};
  const base = { httpOnly: true, sameSite: "lax", secure, path: "/" };
  const lifetime = Number(expires_in || 3600);

  if (access_token) {
    res.cookies.set(SPOTIFY_ACCESS_COOKIE, access_token, { ...base, maxAge: lifetime });
    res.cookies.set(SPOTIFY_EXPIRES_COOKIE, String(Date.now() + lifetime * 1000), {
      ...base,
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  if (refresh_token) {
    res.cookies.set(SPOTIFY_REFRESH_COOKIE, refresh_token, { ...base, maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export function clearSpotifyCookies(res, { secure = true } = {}) {
  const base = { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 };
  res.cookies.set(SPOTIFY_ACCESS_COOKIE, "", base);
  res.cookies.set(SPOTIFY_REFRESH_COOKIE, "", base);
  res.cookies.set(SPOTIFY_EXPIRES_COOKIE, "", base);
  return res;
}
