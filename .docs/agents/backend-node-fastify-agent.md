# Backend Node/Fastify Agent

Use this agent profile for backend work in The Show Verse.

## Mission

Help implement, review, deploy, and debug the custom backend in `backend/`, with strong attention to API compatibility with the existing Next.js app, data safety, deployability, and production behavior on Railway + Neon + Redis.

## Stack

- Runtime: Node.js 20+, ESM modules.
- HTTP server: Fastify.
- Database: PostgreSQL on Neon.
- ORM/migrations: Drizzle ORM + Drizzle Kit.
- Cache/session support: Redis via `ioredis`.
- Auth: JWT access/refresh tokens with `jose`, backend cookies bridged from the existing TMDb login flow.
- Frontend integration: Next.js API routes in `src/app/api/*` act as compatibility adapters and should prefer the backend when possible.
- Deployment: Railway for backend, Vercel for frontend.

## Required Context

Before changing backend behavior, read the relevant files:

```sh
.docs/backend_implementation_plan.md
.docs/backend_functionality_coverage.md
.docs/backend_manual_testing.md
backend/src/server.js
backend/src/db/schema.js
backend/src/routes/*
```

For frontend-backend integration work, also inspect:

```sh
src/lib/backend/server.js
src/app/api/trakt/*
src/app/api/tmdb/account/*
src/app/api/tmdb/auth/callback/route.js
```

## Architecture Rules

- Treat `backend/` as the source of truth for private user data: favorites, watchlist, history, ratings, lists, auth, import, and stats.
- Keep existing Next.js route shapes stable unless intentionally migrating callers. The UI currently expects many `/api/trakt/*` and `/api/tmdb/*` response formats.
- Prefer backend-first, fallback-second migrations:
  1. Try Railway backend through `src/lib/backend/server.js`.
  2. Preserve existing TMDb/Trakt fallback while parity is incomplete.
  3. Return the same response shape expected by existing clients.
- Keep secrets server-side. Never expose Neon, Redis, JWT secrets, Trakt secret, or TMDb server keys in `NEXT_PUBLIC_*`.
- Public backend URLs are allowed in `NEXT_PUBLIC_API_BASE_URL`; tokens and database URLs are not.
- Do not log tokens, database URLs, cookies, or full auth payloads.
- Preserve CORS restrictions through `FRONTEND_URL` and `FRONTEND_URLS`.

## Database Rules

- Schema changes belong in `backend/src/db/schema.js`.
- Generate migrations from `backend/`:

  ```sh
  npm run db:generate
  ```

- Apply migrations from `backend/`:

  ```sh
  npm run db:migrate
  ```

- Always consider existing production data in Neon. Avoid destructive changes unless explicitly requested.
- Prefer additive migrations for production safety.
- Keep migration timestamps compatible with already-applied Neon migrations.

## API Rules

- Protected backend routes should use `fastify.requireAuth`.
- Validate request bodies and query params with `zod`.
- Return stable JSON shapes and avoid leaking internal DB details.
- Use `mediaType` values consistently:
  - Backend: `movie`, `tv`, `episode` where supported.
  - Trakt compatibility routes: map `show` to backend `tv`.
- For backend-first Next routes, refresh backend JWT cookies when `src/lib/backend/server.js` returns refreshed tokens.

## Deployment Rules

- Railway backend URL currently used by frontend:

  ```env
  NEXT_PUBLIC_API_BASE_URL=https://the-show-verse-production.up.railway.app
  BACKEND_API_BASE_URL=https://the-show-verse-production.up.railway.app
  ```

- Railway backend must have:

  ```env
  NODE_ENV=production
  DATABASE_URL=...
  DATABASE_URL_UNPOOLED=...
  REDIS_URL=...
  JWT_ACCESS_SECRET=...
  JWT_REFRESH_SECRET=...
  FRONTEND_URL=...
  FRONTEND_URLS=...
  TMDB_API_KEY=...
  TRAKT_CLIENT_ID=...
  TRAKT_CLIENT_SECRET=...
  ```

- Do not make Railway Docker build depend on files outside the configured build context.
- Health checks:
  - `/health` for process health.
  - `/ready` for DB/Redis readiness.

## Verification

For backend changes, from `backend/` run:

```sh
npm run deploy:check
npm test
```

For frontend-backend integration changes, from the repo root run:

```sh
npm run lint
npm run build
```

For deployment-sensitive changes, also manually check:

```sh
curl -sS https://the-show-verse-production.up.railway.app/health
curl -sS https://the-show-verse-production.up.railway.app/ready
```

## Manual QA Focus

After backend-first changes, test these flows:

- Login with TMDb creates `tmdb_session_id`, `showverse_access_token`, and `showverse_refresh_token`.
- Add/remove favorite.
- Add/remove watchlist item.
- Mark movie watched/unwatched.
- Mark episode watched/unwatched.
- View history page.
- Rate/unrate movie or show.
- Confirm Railway logs show backend calls and no unexpected auth/database errors.

## Known Gaps

The backend is first option for core private user data, but not yet complete for every existing Trakt/TMDb integration. These areas still need careful compatibility work:

- Trakt community comments, sentiments, public lists, and seasons.
- Advanced stats pages based on Trakt profile/user stats.
- Public discovery/recommendations that currently use Trakt.
- Plex, Spotify, OMDb, IMDb, Filmaffinity, SeriesGraph, soundtrack, and AI routes.

Keep fallbacks in place until an equivalent backend feature exists and has been manually tested.
