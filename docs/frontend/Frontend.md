---
tags: [area/frontend, type/indice]
---
# Frontend (Next.js App Router)

> Mapa de contenidos del frontend web de The Show Verse: la app Next.js que sirve páginas, API routes y toda la UI.

## Visión general

El frontend es una única app **Next.js 16** (`^16.2.7`, App Router) con **React 19** (`^19.2.1`), en `src/app` y `src/components`. Sirve tanto las páginas (React Server/Client Components) como las API routes internas (`src/app/api/**`), que actúan de BFF hacia TMDb, Trakt, Plex, JustWatch, Spotify, IMDb/OMDb y el backend propio (`backend/`, Node/Fastify, ver [[backend_api_reference]]).

Puntos clave de la configuración (`next.config.ts`):
- `output: "standalone"` para poder autoalojar en Docker/NAS además de Vercel (ver [[03-nas-selfhosting]], [[02-docker]]).
- Optimización de imágenes de Vercel **desactivada** (`images.unoptimized: true`): los pósters/backdrops ya llegan pre-dimensionados desde el CDN de TMDb (`image.tmdb.org`), así que se sirven directos vía `<img>`/`OptimizedImage` en vez de pasar por `/_next/image` (ahorro de coste en Vercel).

`middleware.js` (raíz del repo) aplica, en este orden, a casi toda ruta de página y API:
1. **Gate de acceso privado**: si `SHOWVERSE_PRIVATE_ACCESS_KEY` está definida (y el host coincide con `SHOWVERSE_PRIVATE_ACCESS_HOSTS` o no estamos en Vercel), exige una cookie `showverse_device_access` válida; si no, responde 404. Las rutas de la extensión Netflix (`/api/netflix/extension-sync`, `/api/netflix/extension-import`) y auth básicas quedan exentas porque se autentican con Bearer token propio.
2. **Rewrite para bots/crawlers** (WhatsApp, Facebook, Twitter, Slack, Discord, Telegram, LinkedIn, Google, Bing): `/details/{movie|tv|person}/[id]` se reescribe a `/s/{movie|tv|person}/[id]` (ver [[app-router-pages]]) para servirles HTML con metadatos OG/Twitter sin cargar el bundle de React completo.

## Organización de `src/`

- **`src/app`** — rutas del App Router: páginas públicas/privadas y `src/app/api/**` (route handlers). Detalle completo en [[app-router-pages]].
- **`src/components`** — componentes de UI compartidos (layout, dashboard, fichas de detalle, listas, integración Trakt...). Detalle completo en [[components]].
- **`src/context/AuthContext.jsx`** — único contexto React global de la app. Expone `useAuth()` con `user`, `authenticated`, `hydrated`, `login/register/logout`, `refreshMe` y preferencias de usuario (`preferences`, `updatePreference`). Usa un caché *stale-while-revalidate* en `localStorage` (`showverse:auth:user:v1`) para pintar el avatar del `Navbar` al instante sin esperar a `/api/auth/me`, con reintentos ante condiciones de carrera al refrescar el token.
- **`src/hooks`** — hooks genéricos de UI a nivel de app; por ejemplo `useBodyScrollLock.js` (bloqueo de scroll del `<body>` con contador global, para modales anidados). Los hooks específicos de dominio (Trakt, dashboard, listas TMDb...) viven junto a su lib en `src/lib/hooks` y `src/components/dashboard/useEngineRows.js`.
- **`src/lib`** — toda la lógica de negocio, clientes de API externas (TMDb, Trakt, Plex, Spotify, JustWatch...), utilidades de dashboard/streaming/caché, etc. No se documenta aquí en profundidad: ver el índice [[Frontend-Lib]].

## Rendering y datos

La mayoría de páginas de catálogo (`/`, `/movies`, `/series`, `/details/**`) son **Server Components** que hacen fetch a TMDb/Trakt en el servidor (con `revalidate` de minutos/horas) y delegan la interactividad a un `*Client.jsx` (`"use client"`) — patrón repetido en casi toda ruta con estado (favoritos, watchlist, filtros, modales). Las páginas fuertemente interactivas o dependientes de sesión (calendario, listas, diagnóstico Trakt) son enteramente cliente.

## Autenticación e integraciones

- Sesión propia (email/password + Google OAuth) vía `src/app/api/auth/**`, consumida por `AuthContext`.
- Integraciones externas con flujos OAuth/token propios bajo `src/app/api/{trakt,plex,spotify,tmdb,netflix}/**`: Trakt (device code + OAuth), Plex (PIN flow), Spotify (OAuth), TMDb (request token/session, cuenta v4), Netflix (sync por extensión de navegador y notificaciones móviles).

## Relacionado
- [[Home]]
- [[app-router-pages]]
- [[components]]
- [[Frontend-Lib]]
- [[dashboards-implementation|Implementación de dashboards]]
- [[RESUMEN_TECNICO]]
- [[README_MODULOS_FUNCIONALES]]
- [[nextjs-web-agent]]
- [[backend_api_reference]]
