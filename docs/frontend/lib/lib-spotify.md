---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/spotify

> OAuth de Spotify por usuario (cada usuario conecta su propia cuenta) para dar prioridad a Spotify al buscar bandas sonoras.

## Responsabilidad

Implementa el flujo OAuth completo de Spotify a nivel de usuario individual (no una cuenta global de la app): construcción de la URL de autorización, intercambio del código por tokens, refresco automático, almacenamiento en cookies `httpOnly` y una caché en memoria de access tokens por hash del refresh token (para no refrescar en cada petición).

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `server.js` | `SPOTIFY_SCOPES` (email, perfil, playlists en lectura); `getRequestOrigin(req)` (deriva el origin real desde el header `Host`, evitando que Next normalice `127.0.0.1`→`localhost` y rompa las cookies); `getSpotifyClientCreds()`; `resolveSpotifyRedirectUri(origin)`; `buildSpotifyAuthorizeUrl`; `exchangeSpotifyCode({code, redirectUri})`; `refreshSpotifyToken(refreshToken)`; `getUserSpotifyAccessToken(req)` (lee cookies de acceso/refresco/expiración, refresca si hace falta, cachea el access token en memoria por hash SHA-256 del refresh token); `isSpotifyConnected(req)`; `fetchSpotifyProfile(accessToken)`; `setSpotifyCookies`/`clearSpotifyCookies` (cookies `spotify_access_token`, `spotify_refresh_token`, `spotify_expires_at`, 1 año de vida para el refresh token). |

## Cómo se usa

Consumido por las rutas de auth de Spotify (`src/app/api/spotify/{login,callback,auth/status,auth/disconnect}/route.js`) para el flujo de conexión/desconexión, y por `src/app/api/soundtrack/route.js`, que llama a `getUserSpotifyAccessToken(req)` para intentar resolver la banda sonora vía Spotify **antes** de caer al fallback de iTunes/Deezer (`searchFallback` en [[lib-api]]).

## Dependencias

- API externa: Spotify Accounts API (`accounts.spotify.com`) y Web API (`api.spotify.com/v1`).
- `node:crypto` para el hash del refresh token.
- Complementa a [[lib-api]] (`soundtrack-fallback.js`, `soundtrack-utils.js`) en la cadena Spotify → iTunes → Deezer de `/api/soundtrack`.

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
