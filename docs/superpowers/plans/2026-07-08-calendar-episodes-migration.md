# Calendar Episodes Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Trakt-powered "Episodios de tus series" list on the `/calendar` page with our own TMDb+Postgres backend, supporting the Día/Semana/Mes date ranges, so the page no longer depends on Trakt or shows the "Conecta Trakt" card.

**Architecture:** The backend already derives upcoming episodes from TMDb (`next_episode_to_air` + season `air_date`) and personalizes with the user's Postgres favorites/watchlist/history (`backend/src/routes/calendar.js` → `GET /v1/calendar/episodes`, using `getCalendarShowDetails`/`buildUpcomingEpisodeEntries` in `backend/src/dashboard/pools.js`). We generalize the fixed calendar window into a caller-supplied date range and extend the endpoint to accept `start`/`days`. The `/calendar` page fetches this instead of `src/app/api/trakt/calendar/episodes/route.js`.

**Tech Stack:** Fastify 5, Drizzle ORM, PostgreSQL, TMDb, Node `node:test`, Next.js 16.

## Global Constraints

- **No Trakt:** the calendar path must not call Trakt at all (movies are already TMDb-only; episodes become TMDb+Postgres).
- **Range clamps:** `days` ∈ [1, 62] inclusive (matches the legacy route's clamp); `start` = `YYYY-MM-DD` (defaults to today, UTC).
- **Response shape (backend, camelCase):** `{ items: [ { id:"tv:{tmdbId}:{s}:{n}", show:{ tmdbId, title, posterPath, backdropPath }, episode:{ season, number, title, airDate }, sources:[...] } ] }` (already produced by `buildUpcomingEpisodeEntry`).
- **Anonymous vs auth:** endpoint keeps optional auth (`req.user?.id`); anonymous → popular base only (`sources: []`); auth → user shows prioritized. Do NOT add `requireAuth`.
- **Tests:** repo convention — `import { test } from 'node:test'; import assert from 'node:assert/strict';`, unit-test pure functions only. Run from `backend/`: `node --test src/dashboard/calendarRange.test.js`.
- **Poster host:** backend returns raw TMDB paths; the `/calendar` page already prefixes `https://image.tmdb.org/t/p/w342{poster_path}` — reuse for episode cards.

---

## File Structure

**Backend — create:**
- `backend/src/dashboard/calendarRange.js` — pure helpers: `parseCalendarRange({start,days})`, `withinRange(airDate, startMs, endMs)`.
- `backend/src/dashboard/calendarRange.test.js` — unit tests.

**Backend — modify:**
- `backend/src/dashboard/pools.js` — add `getShowEpisodesInRange(tmdbId, { startMs, endMs, max })` reusing `tmdbDetails`/`tmdbSeason`; export it. (Leave the existing 45-day window functions untouched for the home carousel.)
- `backend/src/routes/calendar.js` — accept `?start=&days=`; when a range is given, build entries with `getShowEpisodesInRange` instead of the fixed-window `getCalendarShowDetails`.

**Frontend — modify:**
- `src/lib/api/calendar.js` — `getTrackedEpisodesByDateRange(start, days)` fetches `/api/calendar/episodes-range?start=&days=` (new proxy) instead of the Trakt route.
- `src/app/api/calendar/episodes-range/route.js` — **create**: proxy to `/v1/calendar/episodes?start=&days=`.
- `src/app/calendar/page.jsx` — call the backend-backed helper; map camelCase entries to `EpisodeCard`; remove the "Conecta Trakt" card.
- Delete: `src/app/api/trakt/calendar/episodes/route.js` (after confirming no other caller).

---

## Task 1: Calendar range pure helpers

**Files:**
- Create: `backend/src/dashboard/calendarRange.js`
- Test: `backend/src/dashboard/calendarRange.test.js`

**Interfaces:**
- Produces:
  - `parseCalendarRange({ start, days })` → `{ startDate:'YYYY-MM-DD', days:number, startMs:number, endMs:number }` (clamps days 1..62; invalid/missing start → today UTC midnight)
  - `withinRange(airDate, startMs, endMs)` → boolean

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/calendarRange.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarRange, withinRange } from './calendarRange.js';

test('parses a valid range', () => {
  const r = parseCalendarRange({ start: '2026-07-06', days: 7 });
  assert.equal(r.startDate, '2026-07-06');
  assert.equal(r.days, 7);
  assert.equal(r.startMs, Date.UTC(2026, 6, 6));
  // endMs is inclusive end-of-window midnight: start + (days-1)
  assert.equal(r.endMs, Date.UTC(2026, 6, 12));
});

test('clamps days to [1,62]', () => {
  assert.equal(parseCalendarRange({ start: '2026-07-06', days: 999 }).days, 62);
  assert.equal(parseCalendarRange({ start: '2026-07-06', days: 0 }).days, 1);
  assert.equal(parseCalendarRange({ start: '2026-07-06', days: -5 }).days, 1);
});

test('invalid start falls back to a valid YYYY-MM-DD', () => {
  const r = parseCalendarRange({ start: 'nope', days: 3 });
  assert.match(r.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(r.days, 3);
});

test('withinRange is inclusive on both ends', () => {
  const startMs = Date.UTC(2026, 6, 6);
  const endMs = Date.UTC(2026, 6, 12);
  assert.equal(withinRange('2026-07-06', startMs, endMs), true);
  assert.equal(withinRange('2026-07-12', startMs, endMs), true);
  assert.equal(withinRange('2026-07-05', startMs, endMs), false);
  assert.equal(withinRange('2026-07-13', startMs, endMs), false);
  assert.equal(withinRange(null, startMs, endMs), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `node --test src/dashboard/calendarRange.test.js`
Expected: FAIL — cannot find module `./calendarRange.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/dashboard/calendarRange.js
const DAY_MS = 86400000;

function midnightUtcFromYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

function ymdFromMs(ms) {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function parseCalendarRange({ start, days } = {}) {
  const clampedDays = Math.min(Math.max(Math.trunc(Number(days) || 1), 1), 62);
  let startMs = midnightUtcFromYmd(start);
  if (startMs == null) {
    // today at UTC midnight (Date.now is allowed at runtime; tests pass explicit start)
    const now = new Date();
    startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }
  const endMs = startMs + (clampedDays - 1) * DAY_MS;
  return { startDate: ymdFromMs(startMs), days: clampedDays, startMs, endMs };
}

export function withinRange(airDate, startMs, endMs) {
  const t = midnightUtcFromYmd(airDate);
  if (t == null) return false;
  return t >= startMs && t <= endMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/dashboard/calendarRange.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/calendarRange.js backend/src/dashboard/calendarRange.test.js
git commit -m "feat(calendar): pure date-range helpers for episode calendar"
```

---

## Task 2: `getShowEpisodesInRange` in pools.js

**Files:**
- Modify: `backend/src/dashboard/pools.js`

**Interfaces:**
- Consumes: `tmdbDetails`, `tmdbSeason` (already imported in pools.js), `withinRange` from `calendarRange.js`, `buildUpcomingEpisodeEntry` (existing).
- Produces: `export async function getShowEpisodesInRange(tmdbId, { startMs, endMs, max = 6 })` → episode entry array `[{ id, show, episode, sources:[] }]` (sources filled by the route).

- [ ] **Step 1: Implement the range-based show fetch**

Add near `getCalendarShowDetails` in `pools.js` (reuse its season-reading approach but filter by the supplied range instead of the fixed window):

```js
import { withinRange } from './calendarRange.js';

// Próximos episodios de una serie DENTRO de un rango arbitrario (para /calendar,
// vistas Día/Semana/Mes). No usa el caché de ventana fija de getCalendarShowDetails
// porque el rango es variable; sí reutiliza tmdbDetails/tmdbSeason.
export async function getShowEpisodesInRange(tmdbId, { startMs, endMs, max = 6 }) {
  const details = await tmdbDetails('tv', tmdbId);
  if (!details) return [];
  const show = {
    tmdbId: Number(tmdbId),
    title: details.name || null,
    posterPath: details.poster_path || null,
    backdropPath: details.backdrop_path || null,
  };
  const nextEp = details.next_episode_to_air || null;
  const seasonNum = Number(nextEp?.season_number);
  const out = [];
  if (Number.isFinite(seasonNum)) {
    const season = await tmdbSeason(tmdbId, seasonNum);
    const eps = Array.isArray(season?.episodes) ? season.episodes : [];
    for (const e of eps) {
      if (!e?.air_date || !withinRange(e.air_date, startMs, endMs)) continue;
      const entry = buildUpcomingEpisodeEntry(show, {
        season_number: Number.isFinite(Number(e.season_number)) ? Number(e.season_number) : seasonNum,
        episode_number: e.episode_number, air_date: e.air_date, name: e.name || null,
      }, []);
      if (entry) out.push(entry);
    }
  }
  // Fallback: the lone next_episode_to_air if the season yielded nothing but it fits.
  if (out.length === 0 && nextEp?.air_date && withinRange(nextEp.air_date, startMs, endMs)) {
    const entry = buildUpcomingEpisodeEntry(show, nextEp, []);
    if (entry) out.push(entry);
  }
  return out
    .sort((a, b) => (a.episode.airDate || '').localeCompare(b.episode.airDate || ''))
    .slice(0, max);
}
```

- [ ] **Step 2: Smoke-check the export**

Run (from `backend/`): `node -e "import('./src/dashboard/pools.js').then(m=>console.log(typeof m.getShowEpisodesInRange))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/dashboard/pools.js
git commit -m "feat(calendar): getShowEpisodesInRange (TMDb season, arbitrary window)"
```

---

## Task 3: Extend `/v1/calendar/episodes` with `start`/`days`

**Files:**
- Modify: `backend/src/routes/calendar.js`

**Interfaces:**
- When `?start`/`?days` are present, the route returns episodes within that range for the user's shows (auth) or popular shows (anon), instead of the fixed 45-day pool. Without the params, behavior is unchanged (home carousel keeps using the cached pool).

- [ ] **Step 1: Add the range branch to the `/episodes` handler**

Import the helpers and branch at the top of the handler:

```js
import { parseCalendarRange } from '../dashboard/calendarRange.js';
import { getShowEpisodesInRange } from '../dashboard/pools.js';

// inside fastify.get('/episodes', ...), before the existing pool logic:
    const hasRange = req.query?.start != null || req.query?.days != null;
    if (hasRange) {
      const { startMs, endMs } = parseCalendarRange({ start: req.query.start, days: req.query.days });
      const userId = req.user?.id || null;
      // Anonymous: popular base shows within range.
      if (!userId) {
        const base = await getPool('calendar_episodes', 'tv').catch(() => []);
        const baseIds = [...new Set(base.map((e) => Number(e?.show?.tmdbId)).filter(Boolean))].slice(0, 40);
        const items = (await mapLimit(baseIds, 6, (id) => getShowEpisodesInRange(id, { startMs, endMs })))
          .flat().sort(byAirDate).slice(0, MAX_ITEMS);
        reply.header('Cache-Control', 'public, max-age=300');
        return { items };
      }
      // Authenticated: the user's TV shows within range, prioritized by source.
      const sourcesByShow = await loadUserShowSources(userId);
      const userIds = [...sourcesByShow.entries()]
        .sort(([, a], [, b]) => sourceRank(a) - sourceRank(b))
        .map(([id]) => id).slice(0, MAX_USER_ENRICH);
      const items = dedupeById(
        (await mapLimit(userIds, 8, async (id) => {
          const eps = await getShowEpisodesInRange(id, { startMs, endMs });
          const src = orderSources(sourcesByShow.get(id));
          return eps.map((e) => ({ ...e, sources: src }));
        })).flat(),
      ).sort(byAirDate).slice(0, MAX_ITEMS);
      reply.header('Cache-Control', 'private, no-store');
      return { items };
    }
```

- [ ] **Step 2: Verify the range endpoint**

Restart backend. Anonymous:
`curl -s "http://localhost:3001/v1/calendar/episodes?start=2026-07-06&days=7" | head -c 300`
Expected: `{ "items": [ { "id":"tv:...", "show":{...}, "episode":{ "season":.., "number":.., "airDate":"2026-07-.." }, "sources":[] } ] }` — all airDates within the week.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/calendar.js
git commit -m "feat(calendar): /v1/calendar/episodes supports start/days range"
```

---

## Task 4: Next proxy + wire the `/calendar` page

**Files:**
- Create: `src/app/api/calendar/episodes-range/route.js`
- Modify: `src/lib/api/calendar.js` (`getTrackedEpisodesByDateRange`)
- Modify: `src/app/calendar/page.jsx`

**Interfaces:**
- Consumes: `backendFetchJson`, `hasBackendCredentials`, `setBackendAuthCookies` (auth pass-through so the user's shows are used).
- Produces: `/api/calendar/episodes-range?start=&days=` → `{ items }`.

- [ ] **Step 1: Write the proxy route (mirrors `upcoming-episodes/route.js`)**

```js
// src/app/api/calendar/episodes-range/route.js
import { NextResponse } from "next/server";
import { backendFetchJson, hasBackendCredentials, setBackendAuthCookies } from "@/lib/backend/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request) {
  const qs = request.nextUrl.search || "";
  const path = `/v1/calendar/episodes${qs}`;
  if (hasBackendCredentials(request)) {
    const backend = await backendFetchJson(request, path);
    if (backend.ok && Array.isArray(backend.json?.items)) {
      const res = NextResponse.json({ items: backend.json.items });
      setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    }
  }
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ items: [] }));
  return NextResponse.json({ items: json.items || [] }, { status: res.ok ? 200 : res.status });
}
```

- [ ] **Step 2: Repoint `getTrackedEpisodesByDateRange` in `src/lib/api/calendar.js`**

Replace its body so it calls the new proxy and returns entries mapped to what `EpisodeCard` in `page.jsx` expects. The backend entry is `{ id, show:{tmdbId,title,posterPath,backdropPath}, episode:{season,number,title,airDate}, sources:[] }`. Map to the page's item shape:

```js
export async function getTrackedEpisodesByDateRange(startDate, days) {
  const res = await fetch(`/api/calendar/episodes-range?start=${startDate}&days=${days}`, { cache: "no-store" });
  if (!res.ok) return { connected: true, items: [] };
  const json = await res.json();
  const items = (json.items || []).map((e) => ({
    id: e.id,
    type: "episode",
    source: e.sources || [],
    first_aired: e.episode?.airDate || null,
    show: {
      tmdbId: e.show?.tmdbId,
      title: e.show?.title,
      poster_path: e.show?.posterPath,
      backdrop_path: e.show?.backdropPath,
    },
    episode: { season: e.episode?.season, number: e.episode?.number, title: e.episode?.title },
  }));
  return { connected: true, items };
}
```

- [ ] **Step 3: Update `src/app/calendar/page.jsx`**

- Call `getTrackedEpisodesByDateRange(start, days)` for the current view's range (Día = 1 day, Semana = 7, Mes = days-in-month) instead of the Trakt route.
- Since the backend never returns `connected:false`, **remove the "Conecta Trakt para ver tus episodios" card** and its `connected === false` branch; always render the episodes section (empty state = "No hay episodios en este rango").

- [ ] **Step 4: Verify the calendar page**

Open `http://localhost:3000/calendar`. Switch Día/Semana/Mes.
Expected: "Episodios de tus series" shows episodes from TMDb for the selected range (logged in → your shows prioritized). No "Conecta Trakt" card. No `api.trakt.tv` calls in the Network tab.

- [ ] **Step 5: Delete the legacy Trakt calendar route**

Run: `grep -rn "trakt/calendar/episodes" src/` — if only `calendar.js`/`page.jsx` (now repointed) referenced it, delete `src/app/api/trakt/calendar/episodes/route.js`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/calendar/episodes-range/ src/lib/api/calendar.js src/app/calendar/page.jsx
git commit -m "feat(calendar): /calendar episodes from TMDb+Postgres, drop Trakt route"
```

---

## Self-Review (completed)

- **Spec coverage:** date-range helper (T1), TMDb range fetch (T2), endpoint `start/days` (T3), proxy + page rewire + remove "Conecta Trakt" + delete Trakt route (T4). Movies unchanged (already TMDb). No Trakt in the path.
- **Placeholder scan:** none — runnable code/commands throughout.
- **Type consistency:** `parseCalendarRange`/`withinRange` (T1) used in T2/T3; `getShowEpisodesInRange` (T2) used in T3; backend entry shape (T3) mapped in T4 Step 2. Consistent with existing `buildUpcomingEpisodeEntry` output.
