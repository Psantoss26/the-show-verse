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
