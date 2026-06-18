import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";

const NONCE_URL = "https://clients.plex.tv/api/v2/auth/nonce";
const TOKEN_URL = "https://clients.plex.tv/api/v2/auth/token";
const REGISTER_JWK_URL = "https://clients.plex.tv/api/v2/auth/jwk";

const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
const DEFAULT_SCOPE = "username,email,friendly_name";

const state = {
  token: "",
  tokenExpMs: 0,
  refreshPromise: null,
  jwkRegistered: false,
  signer: null,
};

function normalizeMultilineEnv(value) {
  return String(value || "")
    .trim()
    .replace(/\\n/g, "\n");
}

function parseJwtExpMs(token) {
  if (!token || typeof token !== "string") return 0;
  const parts = token.split(".");
  if (parts.length !== 3) return 0;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    const exp = Number(payload?.exp || 0);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function tokenNeedsRefresh(expMs) {
  if (!expMs) return true;
  return Date.now() + TOKEN_REFRESH_SKEW_MS >= expMs;
}

async function fetchPlexJson(
  url,
  { method = "GET", headers = {}, body, timeoutMs = 5000 } = {},
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const err = new Error(`Plex auth request failed (${response.status})`);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data ?? {};
  } finally {
    clearTimeout(timeoutId);
  }
}

function getSignerFromEnv() {
  if (state.signer) return state.signer;

  const privateKeyPem = normalizeMultilineEnv(process.env.PLEX_JWT_PRIVATE_KEY);
  if (!privateKeyPem) return null;

  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const publicJwk = publicKey.export({ format: "jwk" });

  const keyType = privateKey.asymmetricKeyType;
  const alg =
    keyType === "ed25519" ? "EdDSA" : keyType === "rsa" ? "RS256" : null;

  if (!alg) {
    throw new Error(
      `PLEX_JWT_PRIVATE_KEY usa un tipo no soportado: ${String(keyType)}`,
    );
  }

  const kid =
    process.env.PLEX_JWT_KID?.trim() ||
    createHash("sha256")
      .update([publicJwk.kty, publicJwk.crv, publicJwk.x, publicJwk.n, publicJwk.e].filter(Boolean).join("."))
      .digest("base64url")
      .slice(0, 43);

  const jwk =
    publicJwk.kty === "OKP"
      ? {
          kty: "OKP",
          crv: publicJwk.crv,
          x: publicJwk.x,
          kid,
          use: "sig",
          alg,
        }
      : {
          kty: "RSA",
          n: publicJwk.n,
          e: publicJwk.e,
          kid,
          use: "sig",
          alg,
        };

  state.signer = { privateKey, kid, alg, jwk };
  return state.signer;
}

function signDeviceJwt({ nonce, scope, clientIdentifier, signer }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = {
    kid: signer.kid,
    alg: signer.alg,
    typ: "JWT",
  };
  const payload = {
    nonce,
    scope,
    aud: "plex.tv",
    iss: clientIdentifier,
    iat: nowSec,
    exp: nowSec + 5 * 60,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = sign(
    signer.alg === "RS256" ? "RSA-SHA256" : null,
    Buffer.from(signingInput),
    signer.privateKey,
  );

  return `${signingInput}.${signature.toString("base64url")}`;
}

async function registerJwkIfPossible({ signer, clientIdentifier, seedToken }) {
  if (!seedToken || state.jwkRegistered) return;

  try {
    await fetchPlexJson(REGISTER_JWK_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Plex-Client-Identifier": clientIdentifier,
        "X-Plex-Token": seedToken,
      },
      body: { jwk: signer.jwk },
    });
  } catch (err) {
    if (err?.status !== 409 && err?.status !== 422) {
      throw err;
    }
  }

  state.jwkRegistered = true;
}

async function refreshJwtToken({ signer, clientIdentifier, scope }) {
  const nonceData = await fetchPlexJson(NONCE_URL, {
    headers: {
      Accept: "application/json",
      "X-Plex-Client-Identifier": clientIdentifier,
    },
  });

  const nonce = nonceData?.nonce;
  if (!nonce || typeof nonce !== "string") {
    throw new Error("Plex nonce inválido o ausente");
  }

  const deviceJwt = signDeviceJwt({
    nonce,
    scope,
    clientIdentifier,
    signer,
  });

  const tokenData = await fetchPlexJson(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Plex-Client-Identifier": clientIdentifier,
    },
    body: { jwt: deviceJwt },
  });

  const token = tokenData?.auth_token || tokenData?.authToken || "";
  if (!token || typeof token !== "string") {
    throw new Error("Plex no devolvió auth_token en el refresh JWT");
  }

  state.token = token;
  state.tokenExpMs = parseJwtExpMs(token);
  state.jwkRegistered = true;

  return token;
}

function getConfig() {
  const seedToken = process.env.PLEX_TOKEN?.trim() || "";
  const clientIdentifier =
    process.env.PLEX_CLIENT_IDENTIFIER?.trim() || "the-show-verse";
  const scope = process.env.PLEX_JWT_SCOPE?.trim() || DEFAULT_SCOPE;
  const signer = getSignerFromEnv();

  return {
    seedToken,
    clientIdentifier,
    scope,
    signer,
    jwtEnabled: Boolean(signer),
  };
}

export async function getPlexAccessToken() {
  const config = getConfig();

  if (!config.jwtEnabled) {
    return config.seedToken;
  }

  if (state.token && !tokenNeedsRefresh(state.tokenExpMs)) {
    return state.token;
  }

  if (state.refreshPromise) {
    return state.refreshPromise;
  }

  state.refreshPromise = (async () => {
    try {
      return await refreshJwtToken(config);
    } catch (refreshErr) {
      if (!config.seedToken) throw refreshErr;

      try {
        await registerJwkIfPossible(config);
        return await refreshJwtToken(config);
      } catch {
        // Fallback seguro para no romper la API si falla el refresh JWT.
        return config.seedToken;
      }
    }
  })().finally(() => {
    state.refreshPromise = null;
  });

  return state.refreshPromise;
}

// ====== PLEX SERVER DYNAMIC CONNECTION DISCOVERY & CACHING ======

let cachedActiveServer = null; // { baseUrl, machineIdentifier }
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

function isPrivateOrLocalHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase();
  if (host === "localhost") return true;
  if (host.endsWith(".local")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

function normalizeBaseUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const cleanPath =
      parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname.replace(/\/+$/, "")
        : "";
    return `${parsed.protocol}//${parsed.host}${cleanPath}`;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...opts,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyPlexUrl(url, token, timeoutMs) {
  try {
    const res = await fetchWithTimeout(
      `${url}/identity?X-Plex-Token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } },
      timeoutMs
    );
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const machineIdentifier = body?.MediaContainer?.machineIdentifier || res.headers.get("x-plex-machine-identifier") || null;
      return { ok: true, machineIdentifier };
    }
  } catch {
    // try fallback to root
  }

  try {
    const res = await fetchWithTimeout(
      `${url}/?X-Plex-Token=${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } },
      timeoutMs
    );
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const machineIdentifier = body?.MediaContainer?.machineIdentifier || res.headers.get("x-plex-machine-identifier") || null;
      return { ok: true, machineIdentifier };
    }
  } catch {
    // ignore
  }

  return { ok: false, machineIdentifier: null };
}

async function getPlexUrlCandidates(token) {
  const candidates = new Set();
  const urlToMachineId = new Map();

  // 1. Environment variables
  const envUrls = [
    process.env.PLEX_URL,
    ...(process.env.PLEX_URLS || "").split(","),
  ]
    .map((val) => normalizeBaseUrl(val))
    .filter(Boolean);

  for (const url of envUrls) {
    candidates.add(url);
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && isPrivateOrLocalHost(parsed.hostname)) {
        candidates.add(`http://${parsed.host}`);
      }
    } catch {
      // ignore
    }
  }

  // 2. Fetch from plex.tv resources
  try {
    const clientIdentifier = process.env.PLEX_CLIENT_IDENTIFIER || 'the-show-verse';
    const res = await fetchWithTimeout(
      `https://plex.tv/api/v2/resources?includeHttps=1&X-Plex-Token=${encodeURIComponent(token)}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Plex-Client-Identifier': clientIdentifier,
          'X-Plex-Product': 'The Show Verse',
          'X-Plex-Version': '1.0'
        }
      },
      3000
    );

    if (res.ok) {
      const devices = await res.json();
      if (Array.isArray(devices)) {
        for (const device of devices) {
          const isServer = device.provides && device.provides.split(',').map(s => s.trim().toLowerCase()).includes('server');
          if (isServer) {
            const machineId = device.clientIdentifier;
            if (device.connections && Array.isArray(device.connections)) {
              for (const conn of device.connections) {
                if (conn.uri) {
                  const normalized = normalizeBaseUrl(conn.uri);
                  if (normalized) {
                    candidates.add(normalized);
                    if (machineId) {
                      urlToMachineId.set(normalized, machineId);
                    }
                    // If local connection is HTTPS, also add HTTP fallback
                    try {
                      const parsed = new URL(normalized);
                      if (parsed.protocol === "https:" && isPrivateOrLocalHost(parsed.hostname)) {
                        const httpFallback = `http://${parsed.host}`;
                        candidates.add(httpFallback);
                        if (machineId) {
                          urlToMachineId.set(httpFallback, machineId);
                        }
                      }
                    } catch {
                      // ignore
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Plex] Failed to fetch resources from plex.tv:", err);
  }

  // Fallback default
  if (candidates.size === 0) {
    candidates.add("http://localhost:32400");
  }

  return {
    urls: Array.from(candidates),
    urlToMachineId
  };
}

async function findFirstResponsiveServer(urls, urlToMachineId, token) {
  const promises = urls.map(async (url) => {
    const { ok, machineIdentifier } = await verifyPlexUrl(url, token, 1500);
    if (ok) {
      return {
        baseUrl: url,
        machineIdentifier: machineIdentifier || urlToMachineId.get(url) || null
      };
    }
    throw new Error(`Connection to ${url} failed`);
  });

  try {
    return await Promise.any(promises);
  } catch {
    return null;
  }
}

export async function getActivePlexServer(providedToken = null) {
  const token = providedToken || (await getPlexAccessToken());
  if (!token) return null;

  const now = Date.now();
  if (cachedActiveServer && (now - cacheTimestamp < CACHE_DURATION_MS)) {
    // Quick verify of the cached server (500ms timeout)
    const { ok } = await verifyPlexUrl(cachedActiveServer.baseUrl, token, 500);
    if (ok) {
      return cachedActiveServer;
    }
    // Cached server is dead, clear and rediscover
    cachedActiveServer = null;
  }

  // Discover and test candidate URLs
  const { urls, urlToMachineId } = await getPlexUrlCandidates(token);
  if (urls.length === 0) return null;

  const activeServer = await findFirstResponsiveServer(urls, urlToMachineId, token);
  if (activeServer) {
    cachedActiveServer = activeServer;
    cacheTimestamp = Date.now();
    return activeServer;
  }

  return null;
}
