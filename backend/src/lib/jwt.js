// src/lib/jwt.js
// Gestión de JWT con jose (sin dependencias nativas)

import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_in_production_64chars'
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production_64chars'
);

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

/**
 * Genera un access token JWT (vida corta: 15 min).
 */
export async function signAccessToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .setIssuer('the-show-verse-api')
    .setAudience('the-show-verse-app')
    .sign(ACCESS_SECRET);
}

/**
 * Genera un refresh token JWT (vida larga: 30 días).
 *
 * IDENTIFICADOR ÚNICO (`jti`) — NO QUITAR.
 * Sin él, el contenido firmado es `{ sub, iat, exp, iss, aud }`, y `iat` tiene
 * resolución de SEGUNDOS: dos refrescos del MISMO usuario dentro del mismo
 * segundo producían un token IDÉNTICO byte a byte (HS256 es determinista) y, por
 * tanto, el mismo `token_hash`. Como `refresh_tokens.token_hash` es UNIQUE, el
 * segundo INSERT reventaba con violación de clave y /v1/auth/refresh devolvía
 * 500.
 *
 * Eso es exactamente lo que pasa al caducar el access token (15 min): la página
 * dispara decenas de peticiones a la vez, todas refrescan en el mismo segundo,
 * una gana y el resto recibe 500 → el proxy lo traduce a 401/503 → todas las
 * páginas de usuario se pintan vacías «como si se hubiese cerrado sesión», y
 * recargar repite la tormenta.
 */
export async function signRefreshToken(payload) {
  return new SignJWT({ ...payload, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .setIssuer('the-show-verse-api')
    .setAudience('the-show-verse-refresh')
    .sign(REFRESH_SECRET);
}

/**
 * Verifica y decodifica un access token.
 * @throws si el token es inválido o ha expirado.
 */
export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, ACCESS_SECRET, {
    issuer: 'the-show-verse-api',
    audience: 'the-show-verse-app',
  });
  return payload;
}

/**
 * Verifica y decodifica un refresh token.
 */
export async function verifyRefreshToken(token) {
  const { payload } = await jwtVerify(token, REFRESH_SECRET, {
    issuer: 'the-show-verse-api',
    audience: 'the-show-verse-refresh',
  });
  return payload;
}

/**
 * Genera un hash seguro de un refresh token para almacenar en la BD.
 * No almacenamos el token en claro.
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calcula la fecha de expiración de un refresh token.
 */
export function refreshTokenExpiresAt() {
  const days = parseInt(REFRESH_EXPIRY) || 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
