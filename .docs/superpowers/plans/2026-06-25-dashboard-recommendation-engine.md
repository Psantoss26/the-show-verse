# Dashboard Recommendation & Rotating-Generic Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repetitive generic rows on the Home/Movies/Series dashboards with one backend engine that serves personalized recommendations (from the user's DB library) + rotating generic content (from TMDB), all cross-deduplicated, with no Trakt.

**Architecture:** Fastify backend hosts two new Drizzle/Postgres tables (`dashboard_pools`, `user_recommendations`), a TMDB pool builder, a hybrid recommendation engine, and a single assembly endpoint `GET /v1/dashboard/:surface`. Next.js proxies it at `/api/dashboard/:surface` and the three dashboard pages render its `rows`. TTL on-read caching + a daily date-seed drive rotation.

**Tech Stack:** Backend — Node 20 ESM, Fastify 5, Drizzle ORM, Postgres (Neon), `node --test`. Frontend — Next.js (App Router), React 19.

## Global Constraints

- **No Trakt anywhere** in the new engine or rewired rows. TMDB + backend DB only.
- Backend is **ESM** (`type: module`); imports use explicit `.js` extensions.
- DB access via `import { db } from '../db/client.js'` and Drizzle query builder (see `src/routes/items.js` for the pattern). Migrations: define in `src/db/schema.js` → `npm run db:generate` → `npm run db:migrate`.
- Routes: `export default async function xRoutes(fastify) {…}`, registered in `src/server.js` under `/v1` with a prefix. Authed routes use `fastify.addHook('preHandler', fastify.requireAuth)`. The dashboard route must work **logged-out**, so it uses optional auth (resolve user if a valid token is present, else treat as anonymous).
- Tests use `node:test` + `node:assert/strict`, files named `*.test.js` next to the unit. Run with `node --test <file>`.
- **Card item shape** (used everywhere, jsonb + API):
  ```
  { tmdbId:number, mediaType:'movie'|'tv', title:string, posterPath:string|null,
    backdropPath:string|null, voteAverage:number, year:number|null,
    genreIds:number[], popularity:number }
  ```
- **Rec item shape:** card + `{ score:number, reasons:[{type:string, seedTmdbId:number|null, seedTitle:string|null}] }`.
- **Row shape:** `{ key:string, title:string, reason:string|null, mediaType:'movie'|'tv'|'mixed', items: card[] }`.
- **Endpoint response:** `{ surface:'home'|'movies'|'series', personalized:boolean, generatedAt:string(ISO), rows: row[] }`.
- All new backend modules live under `backend/src/dashboard/`. Frontend proxy under `src/app/api/dashboard/`.

---

## Phase 1 — Data layer

### Task 1: Add `dashboard_pools` and `user_recommendations` tables

**Files:**
- Modify: `backend/src/db/schema.js` (append two `pgTable` definitions near the other tables)
- Create (generated): `backend/drizzle/XXXX_dashboard_engine.sql`

**Interfaces:**
- Produces: Drizzle table objects `dashboardPools`, `userRecommendations` importable from `../db/schema.js`.

- [ ] **Step 1: Add tables to schema.js**

Append (match existing import of `pgTable, uuid, text, integer, jsonb, timestamp, index, real, unique` — add any missing to the existing `drizzle-orm/pg-core` import):

```js
export const dashboardPools = pgTable('dashboard_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  poolKey: text('pool_key').notNull(),          // 'trending','popular','top_rated','acclaimed','blockbusters','hidden_gems','new_releases','region_top','genre:28','decade:1990'
  mediaType: text('media_type').notNull(),       // 'movie' | 'tv'
  items: jsonb('items').notNull().default([]),    // card item array
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  keyTypeUq: unique('uq_dashboard_pools_key_type').on(t.poolKey, t.mediaType),
  expiresIdx: index('idx_dashboard_pools_expires').on(t.expiresAt),
}));

export const userRecommendations = pgTable('user_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaType: text('media_type').notNull(),       // 'movie' | 'tv'
  items: jsonb('items').notNull().default([]),    // rec item array
  basisHash: text('basis_hash').notNull().default(''),
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  userTypeUq: unique('uq_user_rec_user_type').on(t.userId, t.mediaType),
  userIdx: index('idx_user_rec_user').on(t.userId),
}));
```

- [ ] **Step 2: Generate migration**

Run: `cd backend && npm run db:generate`
Expected: a new file `backend/drizzle/XXXX_*.sql` containing `CREATE TABLE "dashboard_pools"` and `"user_recommendations"`.

- [ ] **Step 3: Apply migration**

Run: `cd backend && npm run db:migrate`
Expected: log shows the migration applied with no error (uses `DATABASE_URL_UNPOOLED`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.js backend/drizzle/
git commit -m "feat(backend): add dashboard_pools and user_recommendations tables"
```

---

## Phase 2 — Generic pools

### Task 2: TMDB fetch helpers (backend)

**Files:**
- Create: `backend/src/dashboard/tmdb.js`
- Test: `backend/src/dashboard/tmdb.test.js`

**Interfaces:**
- Produces:
  - `toCard(raw, mediaType) -> card|null` — normalize a TMDB result to the card shape; returns null if no `id`/`poster_path` AND no `backdrop_path`.
  - `async tmdbDiscover({ mediaType, params }) -> card[]` — GET `/discover/{movie|tv}` with `params` merged over defaults (`include_adult=false`, `language=es-ES`, `page`), returns mapped cards.
  - `async tmdbList({ path, mediaType, pages=1 }) -> card[]` — GET an arbitrary list path (e.g. `/trending/movie/week`, `/movie/popular`, `/movie/upcoming`, `/tv/on_the_air`), concatenating `pages`.
  - `MOVIE_GENRES`, `TV_GENRES` — `{id:number,label:string}[]` arrays (copy the genre maps already used in the frontend `TV_GENRES` and the movie genre list).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/tmdb.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCard } from './tmdb.js';

test('toCard maps a TMDB movie result to the card shape', () => {
  const card = toCard({
    id: 27205, title: 'Inception', poster_path: '/p.jpg', backdrop_path: '/b.jpg',
    vote_average: 8.4, release_date: '2010-07-15', genre_ids: [28, 878], popularity: 50.1,
  }, 'movie');
  assert.deepEqual(card, {
    tmdbId: 27205, mediaType: 'movie', title: 'Inception', posterPath: '/p.jpg',
    backdropPath: '/b.jpg', voteAverage: 8.4, year: 2010, genreIds: [28, 878], popularity: 50.1,
  });
});

test('toCard maps a TV result (name/first_air_date) and drops itemless entries', () => {
  const card = toCard({ id: 1399, name: 'GoT', poster_path: '/g.jpg', first_air_date: '2011-04-17', vote_average: 8.4, genre_ids: [18] }, 'tv');
  assert.equal(card.tmdbId, 1399);
  assert.equal(card.title, 'GoT');
  assert.equal(card.year, 2011);
  assert.equal(toCard({ id: 5, title: 'X' }, 'movie'), null); // no poster nor backdrop
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && node --test src/dashboard/tmdb.test.js`
Expected: FAIL (cannot find `./tmdb.js` / `toCard`).

- [ ] **Step 3: Implement `tmdb.js`**

```js
// backend/src/dashboard/tmdb.js
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

export const MOVIE_GENRES = [
  { id: 28, label: 'Acción' }, { id: 12, label: 'Aventura' }, { id: 16, label: 'Animación' },
  { id: 35, label: 'Comedia' }, { id: 80, label: 'Crimen' }, { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familia' }, { id: 14, label: 'Fantasía' }, { id: 27, label: 'Terror' },
  { id: 9648, label: 'Misterio' }, { id: 10749, label: 'Romance' }, { id: 878, label: 'Ciencia ficción' },
  { id: 53, label: 'Thriller' }, { id: 10752, label: 'Bélica' },
];
export const TV_GENRES = [
  { id: 10759, label: 'Acción y aventura' }, { id: 16, label: 'Animación' }, { id: 35, label: 'Comedia' },
  { id: 80, label: 'Crimen' }, { id: 18, label: 'Drama' }, { id: 10751, label: 'Familia' },
  { id: 9648, label: 'Misterio' }, { id: 10765, label: 'Ciencia ficción y fantasía' }, { id: 37, label: 'Western' },
];

export function toCard(raw, mediaType) {
  if (!raw || !raw.id) return null;
  const posterPath = raw.poster_path || null;
  const backdropPath = raw.backdrop_path || null;
  if (!posterPath && !backdropPath) return null;
  const dateStr = raw.release_date || raw.first_air_date || '';
  const year = dateStr ? Number(dateStr.slice(0, 4)) || null : null;
  return {
    tmdbId: Number(raw.id),
    mediaType,
    title: raw.title || raw.name || raw.original_title || raw.original_name || '',
    posterPath,
    backdropPath,
    voteAverage: typeof raw.vote_average === 'number' ? raw.vote_average : 0,
    year,
    genreIds: Array.isArray(raw.genre_ids) ? raw.genre_ids : [],
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
  };
}

async function tmdbGet(path, params = {}) {
  if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured');
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('language', params.language || 'es-ES');
  for (const [k, v] of Object.entries(params)) {
    if (k === 'language' || v == null) continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

export async function tmdbDiscover({ mediaType, params = {} }) {
  const json = await tmdbGet(`/discover/${mediaType}`, { include_adult: false, ...params });
  return (json?.results || []).map((r) => toCard(r, mediaType)).filter(Boolean);
}

export async function tmdbList({ path, mediaType, pages = 1 }) {
  const all = [];
  for (let page = 1; page <= pages; page += 1) {
    const json = await tmdbGet(path, { page });
    for (const r of json?.results || []) {
      const c = toCard(r, mediaType);
      if (c) all.push(c);
    }
  }
  return all;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && node --test src/dashboard/tmdb.test.js`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/tmdb.js backend/src/dashboard/tmdb.test.js
git commit -m "feat(backend): TMDB fetch helpers + card normalizer for dashboard"
```

---

### Task 3: Rotation utility (pure, TDD)

**Files:**
- Create: `backend/src/dashboard/rotation.js`
- Test: `backend/src/dashboard/rotation.test.js`

**Interfaces:**
- Produces:
  - `dayNumber(date=new Date()) -> number` — integer epoch-day (UTC).
  - `seededShuffle(array, seed) -> newArray` — deterministic shuffle (mulberry32 + Fisher–Yates), pure (no mutation).
  - `rotateWindow(array, seed, size) -> card[]` — seeded-shuffle then take first `size`.
  - `pickRotating(list, seed, count) -> item[]` — deterministically pick `count` distinct items from `list` (for choosing which genre/decade rows to show today).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/rotation.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededShuffle, rotateWindow, pickRotating, dayNumber } from './rotation.js';

test('seededShuffle is deterministic per seed and a permutation', () => {
  const a = [1,2,3,4,5,6,7,8];
  const s1 = seededShuffle(a, 42);
  const s2 = seededShuffle(a, 42);
  assert.deepEqual(s1, s2);
  assert.deepEqual([...s1].sort((x,y)=>x-y), a);
  assert.deepEqual(a, [1,2,3,4,5,6,7,8]); // input not mutated
  assert.notDeepEqual(seededShuffle(a, 43), s1);
});

test('rotateWindow returns size items and changes with the seed', () => {
  const a = Array.from({length: 50}, (_,i)=>i);
  const w1 = rotateWindow(a, 100, 20);
  assert.equal(w1.length, 20);
  assert.notDeepEqual(rotateWindow(a, 101, 20), w1);
});

test('pickRotating picks count distinct items deterministically', () => {
  const g = ['a','b','c','d','e'];
  const p = pickRotating(g, 7, 3);
  assert.equal(p.length, 3);
  assert.equal(new Set(p).size, 3);
  assert.deepEqual(pickRotating(g, 7, 3), p);
});

test('dayNumber increments by 1 across a UTC day', () => {
  const d0 = dayNumber(new Date('2026-06-25T10:00:00Z'));
  const d1 = dayNumber(new Date('2026-06-26T10:00:00Z'));
  assert.equal(d1 - d0, 1);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && node --test src/dashboard/rotation.test.js` → FAIL (module missing).

- [ ] **Step 3: Implement `rotation.js`**

```js
// backend/src/dashboard/rotation.js
export function dayNumber(date = new Date()) {
  return Math.floor(date.getTime() / 86400000);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(array, seed) {
  const out = [...array];
  const rand = mulberry32((seed >>> 0) || 1);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rotateWindow(array, seed, size) {
  return seededShuffle(array, seed).slice(0, size);
}

export function pickRotating(list, seed, count) {
  return seededShuffle(list, seed).slice(0, Math.min(count, list.length));
}
```

- [ ] **Step 4: Run test, verify it passes** → `node --test src/dashboard/rotation.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/rotation.js backend/src/dashboard/rotation.test.js
git commit -m "feat(backend): deterministic daily rotation utilities"
```

---

### Task 4: Pool builder + cache

**Files:**
- Create: `backend/src/dashboard/pools.js`
- Test: `backend/src/dashboard/pools.test.js` (tests the pure `POOL_DEFS` selection + `dedupeCards` only; network/db functions are integration-verified in Task 10)

**Interfaces:**
- Consumes: `tmdbDiscover`, `tmdbList`, `MOVIE_GENRES`, `TV_GENRES` (Task 2); `db`, `dashboardPools` (Task 1).
- Produces:
  - `dedupeCards(cards) -> card[]` — dedupe by `mediaType:tmdbId`, preserving order.
  - `POOL_DEFS` — `{ poolKey, mediaType, ttlMs, build:async()=>card[] }[]` covering: `trending`(week), `popular`, `top_rated`, `acclaimed`(vote_avg≥7.5 & vote_count≥2000), `blockbusters`(vote_count≥4000 sorted popularity), `hidden_gems`(vote_avg≥7.5 & 500≤vote_count≤3000), `new_releases`(movie `/movie/upcoming`, tv `/tv/on_the_air`), `region_top`(discover region=ES popularity desc), plus per-genre `genre:<id>` for each entry in MOVIE_GENRES/TV_GENRES, plus per-decade `decade:<year>` for 1980/1990/2000/2010/2020. TTLs: trending 12h, popular/new_releases/region_top 24h, top_rated/acclaimed/blockbusters/hidden_gems/genre 7d, decade 30d.
  - `async getPool(poolKey, mediaType) -> card[]` — read from `dashboardPools`; if missing or `expiresAt<now`, rebuild via the matching `POOL_DEFS.build`, upsert (`onConflictDoUpdate` on the unique key) with `expiresAt=now+ttl`, return items. On TMDB failure, return the stale cached items if any, else `[]`.
  - `async refreshAllPools() -> {built:number}` — iterate POOL_DEFS, rebuild expired ones (used optionally; the endpoint relies on lazy `getPool`).

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/pools.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeCards } from './pools.js';

test('dedupeCards removes duplicate mediaType:tmdbId keeping first', () => {
  const a = { tmdbId: 1, mediaType: 'movie', title: 'A' };
  const b = { tmdbId: 1, mediaType: 'movie', title: 'A2' };
  const c = { tmdbId: 1, mediaType: 'tv', title: 'C' };
  assert.deepEqual(dedupeCards([a, b, c]).map((x) => x.title), ['A', 'C']);
});
```

- [ ] **Step 2: Run test, verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement `pools.js`**

Implement `dedupeCards`, `POOL_DEFS` (each `build` calls `tmdbList`/`tmdbDiscover` per the TMDB endpoints above, fetching ~2–3 pages and `dedupeCards`-ing), and `getPool`/`refreshAllPools` using Drizzle:
```js
import { db } from '../db/client.js';
import { dashboardPools } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { tmdbDiscover, tmdbList, MOVIE_GENRES, TV_GENRES } from './tmdb.js';

export function dedupeCards(cards) {
  const seen = new Set(); const out = [];
  for (const c of cards || []) {
    if (!c) continue;
    const k = `${c.mediaType}:${c.tmdbId}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(c);
  }
  return out;
}
// POOL_DEFS: build a Map keyed by `${poolKey}:${mediaType}`; see TTL/endpoint table above.
// getPool(poolKey, mediaType): select row; if fresh return items; else rebuild+upsert; on error return stale||[].
```
Use `db.insert(dashboardPools).values({…}).onConflictDoUpdate({ target: [dashboardPools.poolKey, dashboardPools.mediaType], set: { items, builtAt: new Date(), expiresAt } })`. The full `POOL_DEFS` map and `getPool`/`refreshAllPools` bodies are written here per the interface (no placeholders — implement each `build`).

- [ ] **Step 4: Run test, verify it passes** → `node --test src/dashboard/pools.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/pools.js backend/src/dashboard/pools.test.js
git commit -m "feat(backend): TMDB generic pool builder with TTL cache"
```

---

## Phase 3 — Recommendation engine

### Task 5: Library load + seed-set + fingerprint

**Files:**
- Create: `backend/src/dashboard/library.js`
- Test: `backend/src/dashboard/library.test.js`

**Interfaces:**
- Consumes: `db`; `favorites, watchlist, watchHistory, userRatings` from `../db/schema.js`.
- Produces:
  - `buildSeeds({ favorites, ratings, history, watchlist }) -> { tmdbId, mediaType, weight }[]` — pure. Weights: rating≥8 → 5, favorite → 4, rating 7 → 3, recent history (distinct title) → 2, watchlist → 1. Merge duplicates by max-sum; sort desc; cap 25.
  - `libraryBasisHash({ favorites, ratings, history, watchlist }) -> string` — pure; stable hash (e.g. FNV-1a over sorted `type:id:weightbucket`) so it changes when the library changes.
  - `async loadLibrary(userId) -> { favorites, ratings, history, watchlist }` — Drizzle selects (favorites all; ratings all; history distinct `tmdbId,mediaType` most-recent 100; watchlist all). Each row `{ tmdbId, mediaType, rating? }`.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/library.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeeds, libraryBasisHash } from './library.js';

test('buildSeeds weights and caps to 25', () => {
  const seeds = buildSeeds({
    favorites: [{ tmdbId: 1, mediaType: 'movie' }],
    ratings: [{ tmdbId: 1, mediaType: 'movie', rating: 9 }, { tmdbId: 2, mediaType: 'tv', rating: 7 }],
    history: [{ tmdbId: 3, mediaType: 'movie' }],
    watchlist: [{ tmdbId: 4, mediaType: 'movie' }],
  });
  const m1 = seeds.find((s) => s.tmdbId === 1 && s.mediaType === 'movie');
  assert.ok(m1.weight >= 9); // favorite(4)+rating9(5)
  assert.ok(seeds[0].weight >= seeds[seeds.length - 1].weight); // sorted desc
  assert.ok(seeds.length <= 25);
});

test('libraryBasisHash changes when library changes', () => {
  const base = { favorites: [{ tmdbId: 1, mediaType: 'movie' }], ratings: [], history: [], watchlist: [] };
  const h1 = libraryBasisHash(base);
  const h2 = libraryBasisHash({ ...base, favorites: [...base.favorites, { tmdbId: 2, mediaType: 'tv' }] });
  assert.notEqual(h1, h2);
  assert.equal(libraryBasisHash(base), h1);
});
```

- [ ] **Step 2: Run test, verify it fails** → FAIL.

- [ ] **Step 3: Implement `library.js`** (pure helpers + the Drizzle `loadLibrary`). FNV-1a hash; weight merge as specified.

- [ ] **Step 4: Run test, verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/library.js backend/src/dashboard/library.test.js
git commit -m "feat(backend): user library load, seed-set and basis hash"
```

---

### Task 6: Candidate aggregation + scoring (pure, TDD)

**Files:**
- Create: `backend/src/dashboard/score.js`
- Test: `backend/src/dashboard/score.test.js`

**Interfaces:**
- Produces:
  - `aggregateCandidates({ seeds, fetchSimilar }) -> Promise<recItem[]>` — for each seed, `await fetchSimilar(seed)` returns `{ recommendations: card[], similar: card[] }`; accumulate score per candidate = Σ `seed.weight × sourceWeight × positionDecay` where sourceWeight rec=1.0/similar=0.6, positionDecay = `1/(1+index*0.15)`; collect `reasons` (type `'because'`, seedTmdbId, seedTitle from a `seedTitleOf` map passed in). Returns rec items sorted by score desc.
  - `excludeSeen(recItems, seenSet) -> recItem[]` — drop items whose `mediaType:tmdbId` ∈ seenSet.
  - `mergeGenreFill(recItems, fillCards, weight=0.5) -> recItem[]` — append discover-fill cards (reason `'based_on_genres'`) that aren't already present, with a flat `score=weight`.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/score.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCandidates, excludeSeen } from './score.js';

const card = (id) => ({ tmdbId: id, mediaType: 'movie', title: `M${id}` });

test('aggregateCandidates scores recommendations above similar and aggregates seeds', async () => {
  const seeds = [{ tmdbId: 1, mediaType: 'movie', weight: 5, title: 'S1' }, { tmdbId: 2, mediaType: 'movie', weight: 2, title: 'S2' }];
  const fetchSimilar = async (s) => s.tmdbId === 1
    ? { recommendations: [card(10), card(11)], similar: [card(20)] }
    : { recommendations: [card(10)], similar: [] };
  const out = await aggregateCandidates({ seeds, fetchSimilar });
  const c10 = out.find((c) => c.tmdbId === 10);
  const c20 = out.find((c) => c.tmdbId === 20);
  assert.ok(c10.score > c20.score);                 // appears for 2 seeds, rec source
  assert.ok(c10.reasons.some((r) => r.seedTmdbId === 1)); // tracks contributing seed
  assert.ok(out[0].score >= out[out.length - 1].score);   // sorted desc
});

test('excludeSeen removes library items', () => {
  const items = [card(10), card(11)];
  assert.deepEqual(excludeSeen(items, new Set(['movie:11'])).map((c) => c.tmdbId), [10]);
});
```

- [ ] **Step 2: Run test, verify it fails** → FAIL.

- [ ] **Step 3: Implement `score.js`** exactly per the interface (Map keyed `mediaType:tmdbId`, accumulate score + reasons, sort).

- [ ] **Step 4: Run test, verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/score.js backend/src/dashboard/score.test.js
git commit -m "feat(backend): recommendation candidate scoring (pure)"
```

---

### Task 7: Recommendation builder + cache

**Files:**
- Create: `backend/src/dashboard/recommendations.js`
- (no new unit test — composed of tested units; integration-verified in Task 10)

**Interfaces:**
- Consumes: `loadLibrary, buildSeeds, libraryBasisHash` (Task 5); `aggregateCandidates, excludeSeen, mergeGenreFill` (Task 6); `tmdbList, tmdbDiscover, toCard` (Task 2); `db, userRecommendations` (Task 1).
- Produces:
  - `async getUserRecommendations(userId, mediaType) -> recItem[]` — read `userRecommendations` row; if fresh (`expiresAt>now`) and `basisHash` matches current library hash, return items; else rebuild:
    - `loadLibrary` → `buildSeeds` (filter to `mediaType`) → `fetchSimilar(seed)` = `tmdbList('/{type}/{id}/recommendations')` + `tmdbList('/{type}/{id}/similar')` (cache per seed in-memory for the request) → `aggregateCandidates` → `excludeSeen` (seen = history+favorites+watchlist+seeds) → genre-affinity `tmdbDiscover` fill (top 2 genres, `vote_count.gte=800`, sort popularity) via `mergeGenreFill` → cap 80 → upsert with `basisHash`, `expiresAt=now+24h`. Returns items. Empty seeds → store `[]`.

- [ ] **Step 1: Implement `recommendations.js`** per interface.
- [ ] **Step 2: Smoke-run** a tiny script or rely on Task 10 endpoint test. Run: `cd backend && node -e "import('./src/dashboard/recommendations.js').then(m=>console.log(typeof m.getUserRecommendations))"` → prints `function`.
- [ ] **Step 3: Commit**

```bash
git add backend/src/dashboard/recommendations.js
git commit -m "feat(backend): hybrid recommendation builder with TTL cache"
```

---

## Phase 4 — Assembly endpoint

### Task 8: Surface row definitions

**Files:**
- Create: `backend/src/dashboard/surfaces.js`
- Test: `backend/src/dashboard/surfaces.test.js`

**Interfaces:**
- Produces: `SURFACES` — `{ home, movies, series }`, each `{ mediaTypes:('movie'|'tv')[], genericRows: rowDef[] }` where `rowDef = { key, title, mediaType, source:{ kind:'pool', poolKey } | { kind:'genreRotating', count } | { kind:'decadeRotating', count } }`. Home `mediaTypes=['movie','tv']` and mixes; movies `['movie']`; series `['tv']`. Generic rows per the spec taxonomy (Tendencias→trending, Populares→popular, Mejor valoradas→top_rated/acclaimed, Estrenos→new_releases, Joyas ocultas→hidden_gems, Taquillazos→blockbusters, Top 10 ES→region_top, plus rotating genre + decade rows).
- `personalizedRowDefs(recItems, mediaTypeLabel) -> rowDef-with-items[]` — builds Para ti / Porque viste {seedTitle} (top 1–2 seeds) / Más {género} para ti from the rec items' reasons.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/surfaces.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES } from './surfaces.js';

test('each surface defines media types and generic rows', () => {
  for (const key of ['home', 'movies', 'series']) {
    const s = SURFACES[key];
    assert.ok(Array.isArray(s.mediaTypes) && s.mediaTypes.length >= 1);
    assert.ok(s.genericRows.length >= 4);
    for (const r of s.genericRows) assert.ok(r.key && r.title && r.source?.kind);
  }
  assert.deepEqual(SURFACES.movies.mediaTypes, ['movie']);
  assert.deepEqual(SURFACES.series.mediaTypes, ['tv']);
});
```

- [ ] **Step 2: Run, verify fail** → FAIL.
- [ ] **Step 3: Implement `surfaces.js`** with the full row taxonomy + `personalizedRowDefs`.
- [ ] **Step 4: Run, verify pass** → PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/surfaces.js backend/src/dashboard/surfaces.test.js
git commit -m "feat(backend): dashboard surface row definitions"
```

---

### Task 9: Assembly + cross-dedup (pure, TDD)

**Files:**
- Create: `backend/src/dashboard/assemble.js`
- Test: `backend/src/dashboard/assemble.test.js`

**Interfaces:**
- Produces: `assembleRows({ rowSpecs, rotationSeed, perRow=20, excludeIds=new Set() }) -> row[]` where each `rowSpec = { key, title, reason, mediaType, items: card[], rotate:boolean }`. Behavior: maintain a `usedIds` Set seeded from `excludeIds`; iterate rowSpecs in order; for a `rotate` row apply `rotateWindow(items, rotationSeed, items.length)` first; take items skipping `usedIds`, up to `perRow`; mark taken ids used; drop rows that end with 0 items.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/dashboard/assemble.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleRows } from './assemble.js';

const card = (id) => ({ tmdbId: id, mediaType: 'movie', title: `M${id}` });

test('assembleRows cross-dedupes across rows in order', () => {
  const rows = assembleRows({
    perRow: 2, rotationSeed: 1,
    rowSpecs: [
      { key: 'a', title: 'A', reason: null, mediaType: 'movie', items: [card(1), card(2), card(3)], rotate: false },
      { key: 'b', title: 'B', reason: null, mediaType: 'movie', items: [card(2), card(3), card(4)], rotate: false },
    ],
  });
  assert.deepEqual(rows[0].items.map((c) => c.tmdbId), [1, 2]);
  assert.deepEqual(rows[1].items.map((c) => c.tmdbId), [3, 4]); // 2 already used
});

test('assembleRows drops empty rows and honors excludeIds', () => {
  const rows = assembleRows({
    perRow: 5, rotationSeed: 1, excludeIds: new Set(['movie:1']),
    rowSpecs: [{ key: 'a', title: 'A', reason: null, mediaType: 'movie', items: [card(1)], rotate: false }],
  });
  assert.equal(rows.length, 0);
});
```

- [ ] **Step 2: Run, verify fail** → FAIL.
- [ ] **Step 3: Implement `assemble.js`** (imports `rotateWindow` from `./rotation.js`).
- [ ] **Step 4: Run, verify pass** → PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/src/dashboard/assemble.js backend/src/dashboard/assemble.test.js
git commit -m "feat(backend): row assembly with cross-row dedup"
```

---

### Task 10: `GET /v1/dashboard/:surface` route + optional auth

**Files:**
- Create: `backend/src/routes/dashboard.js`
- Modify: `backend/src/server.js` (import + `app.register(dashboardRoutes, { prefix: '/dashboard' })` near line 197)
- Possibly modify: the auth plugin to expose `fastify.optionalAuth` (check `src/plugins`/auth registration at server.js:100; if no optional-auth decorator exists, add one that sets `req.user` if a valid bearer/cookie token is present and never 401s).

**Interfaces:**
- Consumes: `SURFACES, personalizedRowDefs` (Task 8); `getPool` (Task 4); `getUserRecommendations` (Task 7); `assembleRows` (Task 9); `dayNumber` (Task 3); `loadLibrary` (Task 5) for the watched-exclude set.
- Produces: HTTP `GET /v1/dashboard/:surface` → `{ surface, personalized, generatedAt, rows }`.

- [ ] **Step 1: Implement the route**

```js
// backend/src/routes/dashboard.js
import { SURFACES, personalizedRowDefs } from '../dashboard/surfaces.js';
import { getPool } from '../dashboard/pools.js';
import { getUserRecommendations } from '../dashboard/recommendations.js';
import { assembleRows } from '../dashboard/assemble.js';
import { dayNumber } from '../dashboard/rotation.js';
import { loadLibrary } from '../dashboard/library.js';
import { MOVIE_GENRES, TV_GENRES } from '../dashboard/tmdb.js';
import { pickRotating } from '../dashboard/rotation.js';

export default async function dashboardRoutes(fastify) {
  fastify.addHook('preHandler', fastify.optionalAuth); // never 401

  fastify.get('/:surface', async (req, reply) => {
    const surfaceKey = req.params.surface;
    const surface = SURFACES[surfaceKey];
    if (!surface) return reply.status(404).send({ error: 'Unknown surface' });

    const seed = dayNumber();
    const userId = req.user?.id || null;

    // 1) Resolve generic row specs (resolve pools + rotating genre/decade picks)
    const genericSpecs = [];
    for (const def of surface.genericRows) {
      // pool | genreRotating | decadeRotating → push { ...def, items, rotate:true }
    }

    // 2) Personalized specs (authed)
    let personalized = false;
    let personalSpecs = [];
    let excludeIds = new Set();
    if (userId) {
      const recsByType = {};
      for (const mt of surface.mediaTypes) recsByType[mt] = await getUserRecommendations(userId, mt);
      personalSpecs = personalizedRowDefs(recsByType, surface);
      personalized = personalSpecs.length > 0;
      const lib = await loadLibrary(userId);
      for (const r of [...lib.history, ...lib.favorites]) excludeIds.add(`${r.mediaType}:${r.tmdbId}`);
    }

    // 3) Assemble: personalized first, then generic; cross-dedup; rotation
    const rows = assembleRows({
      rowSpecs: [...personalSpecs, ...genericSpecs],
      rotationSeed: seed, perRow: 20, excludeIds,
    });

    reply.header('Cache-Control', 'private, max-age=300');
    return { surface: surfaceKey, personalized, generatedAt: new Date().toISOString(), rows };
  });
}
```
Fill the loops fully (no placeholder): pool rows call `getPool(poolKey, mt)`; `genreRotating` uses `pickRotating(genres, seed, count)` then `getPool('genre:<id>', mt)`; `decadeRotating` similar with `['1980','1990','2000','2010','2020']`. For `home`, merge movie+tv pool items and tag `mediaType:'mixed'`.

- [ ] **Step 2: Register the route** in `server.js` (add import at top with the others, and `app.register(dashboardRoutes, { prefix: '/dashboard' });` inside the `apiV1` plugin near the other registrations). If `fastify.optionalAuth` does not exist, add it in the auth plugin (decorate with a handler that verifies the token like `requireAuth` but calls `done()`/returns without error when absent/invalid).

- [ ] **Step 3: Integration check (live)**

Run backend: `cd backend && npm run dev` (separate shell). Then:
Run: `curl -s "http://localhost:3001/v1/dashboard/movies" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('rows',j.rows.length,'personalized',j.personalized);const ids=j.rows.flatMap(r=>r.items.map(i=>i.mediaType+':'+i.tmdbId));console.log('dup?',ids.length-new Set(ids).size)})"`
Expected: `rows` ≥ 5, `personalized false` (anon), `dup? 0` (no cross-row duplicates).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/dashboard.js backend/src/server.js backend/src/plugins/
git commit -m "feat(backend): GET /v1/dashboard/:surface assembly endpoint"
```

---

## Phase 5 — Frontend

### Task 11: Next.js proxy `/api/dashboard/:surface`

**Files:**
- Create: `src/app/api/dashboard/[surface]/route.js`
- Test: manual curl (integration)

**Interfaces:**
- Consumes: `backendFetchJson`, `setBackendAuthCookies` from `@/lib/backend/server` (forwards auth cookies; works anon).
- Produces: `GET /api/dashboard/:surface` → passes through the backend `{ surface, personalized, generatedAt, rows }`. Never 500s on backend failure → returns `{ surface, personalized:false, rows:[] }`.

- [ ] **Step 1: Implement the route** (model on `src/app/api/backend/item/status/route.js`): validate `surface ∈ {home,movies,series}`; `const backend = await backendFetchJson(request, \`/v1/dashboard/${surface}\`)`; if ok return its json (+ `setBackendAuthCookies`); else return empty-rows fallback. `dynamic = 'force-dynamic'`, `revalidate = 0`.
- [ ] **Step 2: Integration check** — `curl -s localhost:3000/api/dashboard/movies | head -c 200` → JSON with `rows`.
- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard
git commit -m "feat(web): /api/dashboard/:surface proxy to backend engine"
```

---

### Task 12: Generic rows renderer

**Files:**
- Create: `src/components/dashboard/EngineRows.jsx`
- Modify: none yet

**Interfaces:**
- Consumes: the existing row/preview card components used by the dashboards (reuse `MovieRow`/`InlinePreviewCard`-style components — read `MainDashboardClient.jsx` to find the row component and the card item fields it expects: `id`, `media_type`, `title/name`, `poster_path`, `backdrop_path`, `vote_average`, `genre_ids`).
- Produces: `<EngineRows rows={rows} isMobile hydrated />` — maps each engine `row` to a dashboard row component, converting engine card shape → the component's expected TMDB shape via `toTmdbShape(card)` (`{ id: card.tmdbId, media_type: card.mediaType, title: card.title, name: card.title, poster_path: card.posterPath, backdrop_path: card.backdropPath, vote_average: card.voteAverage, genre_ids: card.genreIds, release_date: card.year? \`${card.year}-01-01\`:undefined }`). Each row uses `row.title` as the heading and `row.reason` as the sublabel.

- [ ] **Step 1: Implement `EngineRows.jsx`** reusing the existing row component (the same one used for the current generic rows), passing converted items. Keep the existing hover-preview behavior.
- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/EngineRows.jsx
git commit -m "feat(web): EngineRows renderer for engine-built dashboard rows"
```

---

### Task 13: Rewire Home dashboard

**Files:**
- Modify: `src/app/page.jsx` (server) — fetch `/api/dashboard/home` (or call `backendFetchJson` directly server-side) for `rows`; keep `featured` + continue-watching data; **remove** the Trakt fetches (anticipated/recommended/trending/popular/played/watched/collected) and the TMDB generic fetches now served by the engine.
- Modify: `src/components/MainDashboardClient.jsx` — replace the block of generic `<MovieRow>`/`<RowWith…>`/`<AnticipatedSection>`/`<RecommendedSection>` (the rows enumerated in the design's "Generic rows" list) with `<EngineRows rows={dashboardData.rows} … />`. Keep `<FeaturedHero>` and `<ContinueWatchingSection>`.

**Interfaces:**
- Consumes: `/api/dashboard/home` rows; `EngineRows` (Task 12).

- [ ] **Step 1:** In `src/app/page.jsx`, add an SSR fetch of the engine rows (server-side via `backendFetchJson(... '/v1/dashboard/home')` so cookies/auth flow, with a try/catch → `rows: []`). Pass `rows` into `MainDashboardClient`. Remove the now-unused Trakt/TMDB generic fetches + their imports.
- [ ] **Step 2:** In `MainDashboardClient.jsx`, delete the generic row JSX (lines rendering Mejor valoradas…Más coleccionadas) and render `<EngineRows rows={rows} isMobile={isMobile} hydrated={hydrated} />` in their place. Keep Featured + Continue watching. Remove now-dead Trakt client loaders (`/api/trakt/dashboard/*` effects).
- [ ] **Step 3: Verify** — `npm run dev`, open `/`, confirm: Featured + Continue watching unchanged; engine rows render; no console errors; no `api/trakt/dashboard/*` requests in the Network tab.
- [ ] **Step 4: Commit**

```bash
git add src/app/page.jsx src/components/MainDashboardClient.jsx
git commit -m "feat(web): home dashboard uses engine rows; remove Trakt generic rows"
```

---

### Task 14: Rewire Movies dashboard

**Files:**
- Modify: `src/app/movies/page.jsx` — fetch `/v1/dashboard/movies` rows server-side; remove the deferred TMDB generic section fetches now served by the engine; keep Featured.
- Modify: `src/app/movies/MoviesPageClient.jsx` — replace the generic `<MovieRow>` list (lines ~1648–1696) with `<EngineRows rows={rows} … />`; keep Featured.

- [ ] **Step 1:** Add SSR engine fetch (`backendFetchJson('/v1/dashboard/movies')`), pass `rows`; remove the deferred generic fetchers/imports superseded by the engine.
- [ ] **Step 2:** Swap the generic rows JSX for `<EngineRows rows={rows} …/>`. Keep Featured.
- [ ] **Step 3: Verify** `/movies` renders engine rows, Featured intact, no errors.
- [ ] **Step 4: Commit**

```bash
git add src/app/movies/page.jsx src/app/movies/MoviesPageClient.jsx
git commit -m "feat(web): movies dashboard uses engine rows"
```

---

### Task 15: Rewire Series dashboard

**Files:**
- Modify: `src/app/series/page.jsx` — fetch `/v1/dashboard/series` rows server-side; remove superseded generic fetches; keep Featured.
- Modify: `src/app/series/SeriesPageClient.jsx` — replace the generic rows list (lines ~1601–1650) with `<EngineRows rows={rows} … />`; keep Featured.

- [ ] **Step 1:** SSR engine fetch (`'/v1/dashboard/series'`), pass `rows`; remove superseded fetchers.
- [ ] **Step 2:** Swap generic rows for `<EngineRows rows={rows} …/>`.
- [ ] **Step 3: Verify** `/series` renders engine rows, Featured intact, no errors.
- [ ] **Step 4: Commit**

```bash
git add src/app/series/page.jsx src/app/series/SeriesPageClient.jsx
git commit -m "feat(web): series dashboard uses engine rows"
```

---

### Task 16: End-to-end verification

- [ ] **Step 1:** Backend tests green: `cd backend && npm test` → all `node:test` files pass.
- [ ] **Step 2:** Lint: `cd .. && npx eslint src/app/api/dashboard src/components/dashboard src/app/page.jsx src/app/movies/MoviesPageClient.jsx src/app/series/SeriesPageClient.jsx` → 0 errors.
- [ ] **Step 3:** Manual: for each surface, hit `/api/dashboard/<surface>` and assert **0 cross-row duplicate ids** (the dedup check command from Task 10 step 3). Repeat with a logged-in cookie and confirm `personalized:true` and that "Para ti"/"Porque viste …" rows appear and exclude already-watched titles.
- [ ] **Step 4:** Confirm rotation: note the first item ids of a generic row, then re-run with a stubbed next-day seed (temporary `?day=` override during dev, or change system date) → the visible items differ while staying in-pool.
- [ ] **Step 5: Commit** any fixes.

```bash
git commit -am "test: end-to-end verification of dashboard engine"
```

---

## Self-Review

**Spec coverage:** tables (T1) ✓ · TMDB pools + rotation (T2–T4) ✓ · hybrid rec engine: seeds/score/build (T5–T7) ✓ · assembly + dedup + endpoint + optional-auth (T8–T10) ✓ · no-Trakt + remove Trakt rows (T13–T15) ✓ · proxy + 3 dashboards rewired (T11–T15) ✓ · cold-start/onboarding handled in `personalizedRowDefs` + generic rows (T8) ✓ · daily rotation (T3 used in T9/T10) ✓ · exclude-watched for authed generic rows (T10 `excludeIds`) ✓.

**Placeholder scan:** Tasks 4, 7, 8, 10 describe full bodies via explicit interfaces with the exact functions/SQL/loops to implement (the executing agent writes the complete body — these are not "TODO later"; the algorithm and signatures are fully specified). Pure-logic tasks (2,3,5,6,9) carry complete code + tests.

**Type consistency:** card shape, rec item (card+score+reasons), row shape, and endpoint response are fixed in Global Constraints and reused verbatim across tasks. `getPool(poolKey, mediaType)`, `getUserRecommendations(userId, mediaType)`, `assembleRows({rowSpecs, rotationSeed, perRow, excludeIds})`, `seededShuffle/rotateWindow/pickRotating/dayNumber` names are consistent across producer/consumer blocks.
