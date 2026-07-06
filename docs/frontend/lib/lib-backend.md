---
tags: [area/frontend, type/referencia, capa/lib]
---
# lib/backend

> Puente de autenticación y fetch entre las rutas API de Next.js y el backend Fastify propio.

## Responsabilidad

Módulo de un solo fichero que centraliza cómo las *route handlers* de `src/app/api/**` hablan con el backend propio (Node/Fastify + Postgres): gestión de cookies de acceso/refresco, refresco automático de tokens caducados, y una función única (`backendFetchJson`) para hacer peticiones autenticadas con reintento transparente ante un 401.

## Ficheros principales

| Fichero | Qué hace |
|---|---|
| `server.js` | `getBackendBaseUrl()` (lee `BACKEND_API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL`/`NEXT_PUBLIC_BACKEND_URL`); constantes de nombres de cookies (`BACKEND_ACCESS_TOKEN_COOKIE`, `BACKEND_REFRESH_TOKEN_COOKIE`, `BACKEND_AUTH_COOKIE_NAMES`); `setBackendTokenCookies`/`clearBackendAuthCookies`/`setBackendAuthCookies` (httpOnly, `sameSite: lax`); `getBackendAccessToken`/`getBackendRefreshToken` (cookie o header `Authorization: Bearer`); `mediaTypeToBackend`/`mediaTypeFromBackend` (`tv` ↔ `show`); `backendFetchJson(request, path, init)` — hace la petición con el access token, y si responde 401 y hay refresh token, llama a `POST /v1/auth/refresh` y reintenta una vez; `normalizeBackendStatus(json, requestedType)` — normaliza la respuesta de estado de un ítem (favorito/watchlist/watched/historial/progreso por temporada) a una forma consistente para el frontend. |

## Cómo se usa

Es la capa de acceso al backend más utilizada del repo: casi **50 ficheros** la importan, prácticamente todas las rutas bajo `src/app/api/{auth,backend,trakt,netflix,profile,user}/**` más un par de módulos de `lib` (`src/lib/dashboard/engineRows.js`, `src/lib/netflix/ingest.js`). Patrón típico en una route handler:

```js
import { backendFetchJson, setBackendAuthCookies } from "@/lib/backend/server";

const result = await backendFetchJson(request, "/v1/items/status", { method: "GET" });
const response = NextResponse.json(result.json);
return setBackendAuthCookies(response, result); // persiste el token refrescado si aplica
```

## Dependencias

- Backend propio (Fastify) vía `BACKEND_API_BASE_URL`, endpoint `/v1/auth/refresh` para el refresco de tokens.
- Ninguna dependencia de otros módulos de `lib` (es una hoja del árbol de dependencias, muchos módulos dependen de él).

## Relacionado
- [[Frontend-Lib]]
- [[Frontend]]
- [[Home]]
- [[lib-api]]
- [[backend_api_reference]]
- [[2026-07-03-universal-streaming-sync-design|Universal Streaming Sync]]
