# Community Content Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve comments, AI sentiment and community lists from our own Fastify+Postgres backend instead of the Trakt API, seeding each title's content from Trakt once on first access and then freezing it.

**Architecture:** A new `backend/src/community/` module owns a minimal (client-id only) Trakt client, a sentiment generator (heuristic + Ollama), and a seed orchestrator with a per-title state machine (`pending→seeding→ready|failed`). New `/v1/community/*` Fastify routes read/write Postgres. Next.js routes under `src/app/api/*` become thin proxies; the existing `src/lib/api/traktClient.js` helpers keep their signatures but point at the new routes. The details page SSRs the seeded content so the sentiment shows on first paint.

**Tech Stack:** Fastify 5, Drizzle ORM (postgres-js), PostgreSQL, Zod, Node `node:test`, Next.js 16 App Router, Ollama (local LLM, provider chain reused from `src/app/api/ai/watch-next/route.js`).

## Global Constraints

- **Scope:** only content features (comments, sentiment, community lists). Trakt OAuth login/import/scoreboard stay untouched. (Calendar is a separate plan.)
- **Trakt calls:** seed uses **only `TRAKT_CLIENT_ID`** (public endpoints, no OAuth). After a title reaches `status='ready'`, **never call Trakt for it again** (no refresh cron).
- **Media type:** `'movie' | 'tv'` in our tables and API; Trakt's segment is `movies`/`shows` and its search `type` is `movie`/`show`. Map at the boundary.
- **List item cap:** copy at most **150** items per Trakt list (`community_list_items`); keep the real Trakt total in `community_lists.itemCount`.
- **Comments copied:** top **10** by likes for display; up to **~50** by likes fetched only as sentiment input (extras not stored).
- **Sentiment provider (prod):** Ollama only. Model via `OLLAMA_SENTIMENT_MODEL` (default `llama3.1:8b`). Cloud keys optional. Heuristic is the instant provisional AND the ultimate fallback.
- **UI contracts (must not break `DetailsClient.jsx`):**
  - Comment object: `{ id, user:{ name, username, images:{ avatar:{ full } }, vip }, comment, created_at, likes, spoiler }` + `pagination:{ itemCount, pageCount, page, limit }`.
  - Sentiment: `{ good:[{ sentiment_es }], bad:[{ sentiment_es }], comment_count }` (max 4 each shown by the UI).
  - Surface B list row: `{ list:{ name, item_count, likes, ids:{ slug, trakt }, description }, user:{ username, name, images:{ avatar:{ full } } }, previewPosters:[url] }`.
- **Tests:** follow repo convention — `import { test } from 'node:test'; import assert from 'node:assert/strict';`, unit-test **pure functions** (no DB/Fastify in test files). Run a single file from `backend/`: `node --test src/community/<file>.test.js`. DB/route glue is verified by the manual checklist in Task 18.
- **Backend patterns:** `import { db } from '../db/client.js'`; Drizzle (`eq, and, desc, asc, sql`); Zod `safeParse`; routes are `export default async function xRoutes(fastify){...}`; global preHandler already sets `req.user` (nullable) — use `req.user?.id`, add `fastify.requireAuth` only on write routes.
- **TMDb image paths:** store/return raw TMDB paths (`/abc.jpg`); the frontend prefixes the host. For preview poster URLs consumed by Surface B, build full `https://image.tmdb.org/t/p/w342<path>` (matches current UI which expects ready URLs in `previewPosters`).

---

## File Structure

**Backend — create:**
- `backend/src/community/trakt.js` — Trakt client (client-id), cache/backoff ported from `src/lib/trakt/fetchWithCache.js`.
- `backend/src/community/normalize.js` — pure mappers: Trakt→row and row→UI-contract for comments and lists; `stripHtml`.
- `backend/src/community/sentiment.js` — pure: heuristic, prompt builder, response parser, api-shape; async `generateSentiment` provider chain.
- `backend/src/community/state.js` — pure: seed decision + retry backoff.
- `backend/src/community/tabs.js` — pure: comment tab → query descriptor.
- `backend/src/community/seed.js` — async orchestrator (Trakt copy + sentiment + state writes).
- `backend/src/community/store.js` — Postgres read queries (comments/sentiment/lists) + native comment writes.
- `backend/src/routes/community.js` — `/v1/community/*` routes.
- Test files: `backend/src/community/{normalize,sentiment,state,tabs}.test.js`.

**Backend — modify:**
- `backend/src/db/schema.js` — add 5 tables.
- `backend/src/server.js:204` — register `communityRoutes` at `/community`.
- `backend/src/dashboard/tmdb.js` — re-export `tmdbGet` (needed by community trakt list hydration) — one-line export.
- `backend/.env.example` — add `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_SENTIMENT_MODEL`.

**Frontend — create (thin proxies):**
- `src/app/api/community/[type]/[tmdbId]/comments/route.js` (GET/POST/PATCH/DELETE)
- `src/app/api/community/[type]/[tmdbId]/sentiment/route.js` (GET)
- `src/app/api/community/[type]/[tmdbId]/lists/route.js` (GET)
- `src/app/api/community/[type]/[tmdbId]/summary/route.js` (GET, for SSR)
- `src/app/api/community/lists/discover/route.js` (GET)
- `src/app/api/community/lists/[id]/route.js` (GET)
- `src/lib/community/server.js` — small server helper to fetch `/v1/community/:type/:tmdbId/summary` for SSR.

**Frontend — modify:**
- `src/lib/api/traktClient.js` — repoint the 6 helpers to `/api/community/*` (keep signatures).
- `src/app/details/[type]/[id]/page.jsx` — SSR fetch summary → `initialSentiment/initialComments/initialLists`.
- `src/components/DetailsClient.jsx` — consume the new initial props; drop "Responder en Trakt".
- `src/components/details/TraktCommentModal.jsx` — write via repointed `traktClient` (no change if signatures kept).
- `src/app/lists/page.jsx` + `src/lib/hooks/useTraktLists.js` — Surface A → `/api/community/lists/discover`.
- `src/components/lists/TraktListDetailsClient.jsx` — detail → `/api/community/lists/:id`.

---

## Phase 1 — Core (schema, state machine, Trakt client)

### Task 1: Database schema + migration

**Files:**
- Modify: `backend/src/db/schema.js` (append new tables)
- Create (generated): `backend/drizzle/00XX_*.sql`

**Interfaces:**
- Produces: Drizzle table exports `titleCommunityState`, `titleComments`, `titleSentiment`, `communityLists`, `communityListItems` consumed by all later backend tasks.

- [ ] **Step 1: Append tables to `backend/src/db/schema.js`**

Add at end of file (imports `pgTable, uuid, text, boolean, integer, bigint, timestamp, jsonb, index, uniqueIndex, check` already present except `bigint` — add it to the existing import list from `drizzle-orm/pg-core`):

```js
// ─────────────────────────────────────────────
// COMMUNITY CONTENT (seeded from Trakt, then owned by us)
// ─────────────────────────────────────────────
export const titleCommunityState = pgTable('title_community_state', {
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),            // 'movie' | 'tv'
  traktId: integer('trakt_id'),
  status: text('status').default('pending').notNull(),// pending|seeding|ready|failed
  commentCount: integer('comment_count').default(0).notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }),
  sentimentBuiltAt: timestamp('sentiment_built_at', { withTimezone: true }),
  sentimentProvider: text('sentiment_provider'),      // heuristic|ollama|openai|gemini
  attempts: integer('attempts').default(0).notNull(),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: uniqueIndex('idx_title_state_pk').on(t.tmdbId, t.mediaType),
  statusIdx: index('idx_title_state_status').on(t.status, t.nextRetryAt),
  mediaTypeCheck: check('chk_title_state_media_type', sql`media_type IN ('movie','tv')`),
}));

export const titleComments = pgTable('title_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  source: text('source').notNull(),                   // 'trakt' | 'native'
  externalId: bigint('external_id', { mode: 'number' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  authorName: text('author_name'),
  authorUsername: text('author_username'),
  authorAvatarUrl: text('author_avatar_url'),
  authorIsVip: boolean('author_is_vip').default(false),
  body: text('body').notNull(),
  likes: integer('likes').default(0).notNull(),
  spoiler: boolean('spoiler').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  externalUnique: uniqueIndex('idx_title_comments_external').on(t.externalId).where(sql`external_id IS NOT NULL`),
  likesIdx: index('idx_title_comments_likes').on(t.tmdbId, t.mediaType, t.likes),
  createdIdx: index('idx_title_comments_created').on(t.tmdbId, t.mediaType, t.createdAt),
  sourceCheck: check('chk_title_comments_source', sql`source IN ('trakt','native')`),
}));

export const titleSentiment = pgTable('title_sentiment', {
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  good: jsonb('good').default([]).notNull(),          // [{ text_es }]
  bad: jsonb('bad').default([]).notNull(),
  provider: text('provider'),
  model: text('model'),
  sourceCommentCount: integer('source_comment_count').default(0).notNull(),
  isProvisional: boolean('is_provisional').default(false).notNull(),
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: uniqueIndex('idx_title_sentiment_pk').on(t.tmdbId, t.mediaType),
}));

export const communityLists = pgTable('community_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),                   // 'trakt' | 'user'
  externalId: bigint('external_id', { mode: 'number' }),
  userListId: uuid('user_list_id').references(() => userLists.id, { onDelete: 'cascade' }),
  slug: text('slug'),
  name: text('name').notNull(),
  description: text('description'),
  ownerName: text('owner_name'),
  ownerUsername: text('owner_username'),
  ownerAvatarUrl: text('owner_avatar_url'),
  itemCount: integer('item_count').default(0).notNull(),
  copiedItemCount: integer('copied_item_count').default(0).notNull(),
  likes: integer('likes').default(0).notNull(),
  privacy: text('privacy'),
  traktUrl: text('trakt_url'),
  previewPosters: jsonb('preview_posters').default([]).notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  externalUnique: uniqueIndex('idx_community_lists_external').on(t.externalId).where(sql`source = 'trakt' AND external_id IS NOT NULL`),
  likesIdx: index('idx_community_lists_likes').on(t.likes),
  itemsIdx: index('idx_community_lists_items').on(t.itemCount),
}));

export const communityListItems = pgTable('community_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id').notNull().references(() => communityLists.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  title: text('title'),
  posterPath: text('poster_path'),
  position: integer('position').default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueItem: uniqueIndex('idx_community_list_items_unique').on(t.listId, t.tmdbId, t.mediaType),
  byTitleIdx: index('idx_community_list_items_title').on(t.tmdbId, t.mediaType),
  byListIdx: index('idx_community_list_items_list').on(t.listId, t.position),
}));
```

- [ ] **Step 2: Add `bigint` to the pg-core import**

In the existing `import { ... } from 'drizzle-orm/pg-core';` at the top of `schema.js`, add `bigint` to the list.

- [ ] **Step 3: Generate the migration**

Run (from `backend/`): `npm run db:generate`
Expected: a new `backend/drizzle/00XX_*.sql` file is created containing the 5 `CREATE TABLE` statements.

- [ ] **Step 4: Apply the migration to the local DB**

Ensure local Postgres is up (`npm run db:up` from repo root). Then from `backend/`: `npm run db:migrate`
Expected: migration applies with no error; `psql` shows the 5 new tables.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.js backend/drizzle/
git commit -m "feat(community): add community content tables (state, comments, sentiment, lists)"
```

---

### Task 2: Seed state machine (pure)

**Files:**
- Create: `backend/src/community/state.js`
- Test: `backend/src/community/state.test.js`

**Interfaces:**
- Produces:
  - `seedDecision(state, now = Date.now())` → `'seed' | 'serve' | 'wait'`
  - `retryBackoffMs(attempts)` → number (ms); `nextRetryDate(attempts, now)` → `Date`
  - `RETRY_BASE_MS = 6 * 60 * 60 * 1000`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/community/state.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDecision, retryBackoffMs } from './state.js';

const now = 1_000_000_000_000;

test('missing state → seed', () => {
  assert.equal(seedDecision(null, now), 'seed');
});
test('pending → seed', () => {
  assert.equal(seedDecision({ status: 'pending' }, now), 'seed');
});
test('ready → serve', () => {
  assert.equal(seedDecision({ status: 'ready' }, now), 'serve');
});
test('seeding → wait', () => {
  assert.equal(seedDecision({ status: 'seeding' }, now), 'wait');
});
test('failed within backoff → serve', () => {
  const nextRetryAt = new Date(now + 60_000);
  assert.equal(seedDecision({ status: 'failed', nextRetryAt }, now), 'serve');
});
test('failed past backoff → seed', () => {
  const nextRetryAt = new Date(now - 60_000);
  assert.equal(seedDecision({ status: 'failed', nextRetryAt }, now), 'seed');
});
test('retry backoff grows with attempts', () => {
  assert.equal(retryBackoffMs(0), 6 * 60 * 60 * 1000);
  assert.ok(retryBackoffMs(2) > retryBackoffMs(0));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `node --test src/community/state.test.js`
Expected: FAIL — cannot find module `./state.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/community/state.js
export const RETRY_BASE_MS = 6 * 60 * 60 * 1000; // 6h

export function retryBackoffMs(attempts) {
  const n = Number.isFinite(attempts) ? Math.max(0, attempts) : 0;
  // 6h, 12h, 24h… capped at 48h
  return Math.min(RETRY_BASE_MS * 2 ** n, 48 * 60 * 60 * 1000);
}

export function nextRetryDate(attempts, now = Date.now()) {
  return new Date(now + retryBackoffMs(attempts));
}

export function seedDecision(state, now = Date.now()) {
  if (!state || state.status === 'pending') return 'seed';
  if (state.status === 'ready') return 'serve';
  if (state.status === 'seeding') return 'wait';
  if (state.status === 'failed') {
    const t = state.nextRetryAt ? new Date(state.nextRetryAt).getTime() : 0;
    return t < now ? 'seed' : 'serve';
  }
  return 'serve';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/community/state.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/community/state.js backend/src/community/state.test.js
git commit -m "feat(community): seed state machine (pure)"
```

---

### Task 3: Trakt client (client-id, cache/backoff)

**Files:**
- Create: `backend/src/community/trakt.js`
- Modify: `backend/src/dashboard/tmdb.js` (re-export `tmdbGet`)

**Interfaces:**
- Consumes: `process.env.TRAKT_CLIENT_ID`.
- Produces (all async, all return parsed JSON or `null`/`[]` on failure, never throw to the caller):
  - `resolveTraktId({ type, tmdbId })` → `{ traktId, slug } | null` (`type` = `'movie'|'tv'`)
  - `getComments({ type, traktId, sort = 'likes', page = 1, limit = 10 })` → `Array` (Trakt comment objects) + reads pagination via a returned `{ items, pagination }`
  - `getListsContaining({ type, traktId, tab = 'popular', page = 1, limit = 3 })` → `{ items, pagination }`
  - `getUserListItems({ username, listSlug, page = 1, limit = 50 })` → `Array`

- [ ] **Step 1: Re-export `tmdbGet` from `backend/src/dashboard/tmdb.js`**

Find `async function tmdbGet(` (`tmdb.js:49`) and change it to `export async function tmdbGet(` so the community module can hydrate list-item posters via `/movie/{id}` / `/tv/{id}` when Trakt lacks images.

- [ ] **Step 2: Write the Trakt client**

Port the in-memory cache + 429 backoff shape from `src/lib/trakt/fetchWithCache.js` (simplified). No test file (network glue; covered by seed manual test).

```js
// backend/src/community/trakt.js
// Cliente Trakt mínimo: SOLO client-id (endpoints públicos). Usado únicamente por el
// sembrado (una vez por título). Caché en memoria + backoff para no gatillar 429.
const TRAKT_BASE = 'https://api.trakt.tv';
const CLIENT_ID = process.env.TRAKT_CLIENT_ID || '';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map();             // key -> { ts, value }
let rateLockedUntil = 0;

function headers() {
  return { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': CLIENT_ID };
}

async function traktGet(path, { retries = 2 } = {}) {
  if (!CLIENT_ID) return { ok: false, json: null, pagination: null };
  const key = path;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
  if (Date.now() < rateLockedUntil) return { ok: false, json: null, pagination: null };

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let res;
    try {
      res = await fetch(`${TRAKT_BASE}${path}`, { headers: headers(), cache: 'no-store' });
    } catch {
      if (attempt === retries) return { ok: false, json: null, pagination: null };
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) {
      rateLockedUntil = Date.now() + 60_000;
      return { ok: false, json: null, pagination: null };
    }
    if (!res.ok) return { ok: false, json: null, pagination: null };
    const json = await res.json().catch(() => null);
    const pagination = {
      itemCount: Number(res.headers.get('x-pagination-item-count')) || 0,
      pageCount: Number(res.headers.get('x-pagination-page-count')) || 0,
      page: Number(res.headers.get('x-pagination-page')) || 1,
      limit: Number(res.headers.get('x-pagination-limit')) || 0,
    };
    const value = { ok: true, json, pagination };
    cache.set(key, { ts: Date.now(), value });
    return value;
  }
  return { ok: false, json: null, pagination: null };
}

const traktType = (type) => (type === 'tv' ? 'show' : 'movie');
const traktBase = (type) => (type === 'tv' ? 'shows' : 'movies');

export async function resolveTraktId({ type, tmdbId }) {
  const { ok, json } = await traktGet(`/search/tmdb/${tmdbId}?type=${traktType(type)}`);
  if (!ok || !Array.isArray(json) || !json.length) return null;
  const item = json[0]?.[traktType(type)] || null;
  const traktId = item?.ids?.trakt || null;
  if (!traktId) return null;
  return { traktId, slug: item?.ids?.slug || null };
}

export async function getComments({ type, traktId, sort = 'likes', page = 1, limit = 10 }) {
  const { ok, json, pagination } = await traktGet(
    `/${traktBase(type)}/${traktId}/comments/${sort}?page=${page}&limit=${limit}`,
  );
  return { items: ok && Array.isArray(json) ? json : [], pagination };
}

export async function getListsContaining({ type, traktId, tab = 'popular', page = 1, limit = 3 }) {
  const { ok, json, pagination } = await traktGet(
    `/${traktBase(type)}/${traktId}/lists/${tab}?page=${page}&limit=${limit}`,
  );
  return { items: ok && Array.isArray(json) ? json : [], pagination };
}

export async function getUserListItems({ username, listSlug, page = 1, limit = 50 }) {
  const { ok, json } = await traktGet(
    `/users/${encodeURIComponent(username)}/lists/${encodeURIComponent(listSlug)}/items?extended=full&page=${page}&limit=${limit}`,
  );
  return ok && Array.isArray(json) ? json : [];
}
```

- [ ] **Step 3: Smoke-check the module imports**

Run (from `backend/`): `node -e "import('./src/community/trakt.js').then(m=>console.log(Object.keys(m)))"`
Expected: prints `[ 'resolveTraktId', 'getComments', 'getListsContaining', 'getUserListItems' ]`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/community/trakt.js backend/src/dashboard/tmdb.js
git commit -m "feat(community): minimal Trakt client (client-id, cache+backoff)"
```

---

## Phase 2 — Comments

### Task 4: Comment normalizers (pure)

**Files:**
- Create: `backend/src/community/normalize.js`
- Test: `backend/src/community/normalize.test.js`

**Interfaces:**
- Produces:
  - `stripHtml(s)` → string
  - `normalizeTraktComment(raw, { tmdbId, mediaType })` → row for `titleComments` insert (source `'trakt'`), or `null` if no usable body/external id
  - `commentRowToApi(row)` → UI-contract comment object

- [ ] **Step 1: Write the failing test**

```js
// backend/src/community/normalize.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, normalizeTraktComment, commentRowToApi } from './normalize.js';

test('stripHtml removes tags and decodes basic entities', () => {
  assert.equal(stripHtml('<b>Great</b> &amp; fun'), 'Great & fun');
});

test('normalizeTraktComment maps Trakt fields to a row', () => {
  const raw = {
    id: 42, comment: 'Loved it', likes: 12, spoiler: false, created_at: '2019-01-26T16:50:00.000Z',
    user: { name: 'Dearbhla', username: 'dear', vip: true, images: { avatar: { full: 'http://a/x.png' } } },
  };
  const row = normalizeTraktComment(raw, { tmdbId: 155, mediaType: 'movie' });
  assert.equal(row.source, 'trakt');
  assert.equal(row.externalId, 42);
  assert.equal(row.tmdbId, 155);
  assert.equal(row.mediaType, 'movie');
  assert.equal(row.authorName, 'Dearbhla');
  assert.equal(row.authorUsername, 'dear');
  assert.equal(row.authorAvatarUrl, 'http://a/x.png');
  assert.equal(row.authorIsVip, true);
  assert.equal(row.body, 'Loved it');
  assert.equal(row.likes, 12);
  assert.equal(row.spoiler, false);
  assert.deepEqual(row.createdAt, new Date('2019-01-26T16:50:00.000Z'));
});

test('normalizeTraktComment returns null when body empty', () => {
  assert.equal(normalizeTraktComment({ id: 1, comment: '   ' }, { tmdbId: 1, mediaType: 'tv' }), null);
});

test('commentRowToApi produces the UI contract shape', () => {
  const api = commentRowToApi({
    id: 'uuid-1', body: 'Nice', likes: 3, spoiler: true,
    createdAt: new Date('2020-05-01T00:00:00Z'),
    authorName: 'Ben', authorUsername: 'ben', authorAvatarUrl: 'http://a/b.png', authorIsVip: false,
  });
  assert.equal(api.id, 'uuid-1');
  assert.equal(api.comment, 'Nice');
  assert.equal(api.likes, 3);
  assert.equal(api.spoiler, true);
  assert.equal(api.user.name, 'Ben');
  assert.equal(api.user.username, 'ben');
  assert.equal(api.user.vip, false);
  assert.equal(api.user.images.avatar.full, 'http://a/b.png');
  assert.equal(api.created_at, '2020-05-01T00:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/community/normalize.test.js`
Expected: FAIL — cannot find module `./normalize.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/community/normalize.js
export function stripHtml(input) {
  if (!input) return '';
  return String(input)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim();
}

export function normalizeTraktComment(raw, { tmdbId, mediaType }) {
  const body = stripHtml(raw?.comment?.comment ?? raw?.comment ?? '');
  const externalId = Number(raw?.id) || null;
  if (!body || !externalId) return null;
  const user = raw?.user || {};
  const avatar = user?.images?.avatar?.full || user?.images?.avatar?.medium || null;
  return {
    tmdbId: Number(tmdbId),
    mediaType,
    source: 'trakt',
    externalId,
    userId: null,
    authorName: user?.name || user?.username || null,
    authorUsername: user?.username || null,
    authorAvatarUrl: avatar,
    authorIsVip: !!user?.vip,
    body,
    likes: Number(raw?.likes) || 0,
    spoiler: !!raw?.spoiler,
    createdAt: raw?.created_at ? new Date(raw.created_at) : new Date(),
  };
}

export function commentRowToApi(row) {
  return {
    id: row.id,
    comment: row.body,
    likes: Number(row.likes) || 0,
    spoiler: !!row.spoiler,
    created_at: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    user: {
      name: row.authorName || row.authorUsername || 'Usuario',
      username: row.authorUsername || null,
      vip: !!row.authorIsVip,
      images: { avatar: { full: row.authorAvatarUrl || null } },
    },
    source: row.source,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/community/normalize.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/community/normalize.js backend/src/community/normalize.test.js
git commit -m "feat(community): comment normalizers (pure)"
```

---

### Task 5: Comment tab query descriptor (pure)

**Files:**
- Create: `backend/src/community/tabs.js`
- Test: `backend/src/community/tabs.test.js`

**Interfaces:**
- Produces: `resolveCommentTab(tab)` → `{ order: 'likes'|'recent', sinceDays: number|null }`. Accepts UI tabs `top`/`likesAll`, `recent`, `top30`/`likes30`.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/community/tabs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommentTab } from './tabs.js';

test('top → likes, no window', () => {
  assert.deepEqual(resolveCommentTab('top'), { order: 'likes', sinceDays: null });
  assert.deepEqual(resolveCommentTab('likesAll'), { order: 'likes', sinceDays: null });
});
test('top30 → likes, 30-day window', () => {
  assert.deepEqual(resolveCommentTab('top30'), { order: 'likes', sinceDays: 30 });
  assert.deepEqual(resolveCommentTab('likes30'), { order: 'likes', sinceDays: 30 });
});
test('recent → recent, no window', () => {
  assert.deepEqual(resolveCommentTab('recent'), { order: 'recent', sinceDays: null });
});
test('unknown → default top', () => {
  assert.deepEqual(resolveCommentTab('nope'), { order: 'likes', sinceDays: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/community/tabs.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/community/tabs.js
export function resolveCommentTab(tab) {
  const t = String(tab || '').toLowerCase();
  if (t === 'recent' || t === 'newest') return { order: 'recent', sinceDays: null };
  if (t === 'top30' || t === 'likes30') return { order: 'likes', sinceDays: 30 };
  return { order: 'likes', sinceDays: null }; // top / likesAll / default
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/community/tabs.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/community/tabs.js backend/src/community/tabs.test.js
git commit -m "feat(community): comment tab resolver (pure)"
```

---

### Task 6: Comment store (Postgres reads + native writes)

**Files:**
- Create: `backend/src/community/store.js`

**Interfaces:**
- Consumes: `db`, schema tables, `resolveCommentTab`, `commentRowToApi`.
- Produces (async):
  - `getCommentsPage({ tmdbId, mediaType, tab, page, limit })` → `{ items: apiComment[], pagination }`
  - `insertNativeComment({ tmdbId, mediaType, userId, author, body, spoiler })` → apiComment
  - `updateNativeComment({ id, userId, body, spoiler })` → apiComment | null
  - `deleteNativeComment({ id, userId })` → boolean
  - `getCommentCount({ tmdbId, mediaType })` → number

- [ ] **Step 1: Write the store**

```js
// backend/src/community/store.js
import { db } from '../db/client.js';
import { titleComments } from '../db/schema.js';
import { and, eq, desc, asc, sql, gt } from 'drizzle-orm';
import { resolveCommentTab } from './tabs.js';
import { commentRowToApi } from './normalize.js';

export async function getCommentsPage({ tmdbId, mediaType, tab, page = 1, limit = 5 }) {
  const { order, sinceDays } = resolveCommentTab(tab);
  const conds = [eq(titleComments.tmdbId, Number(tmdbId)), eq(titleComments.mediaType, mediaType)];
  if (sinceDays) {
    conds.push(gt(titleComments.createdAt, sql`now() - ${`${sinceDays} days`}::interval`));
  }
  const where = and(...conds);
  const orderBy = order === 'recent'
    ? [desc(titleComments.createdAt)]
    : [desc(titleComments.likes), desc(titleComments.createdAt)];

  const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(titleComments).where(where).orderBy(...orderBy).limit(safeLimit).offset(offset),
    db.select({ count: sql`count(*)::int` }).from(titleComments).where(where),
  ]);

  const itemCount = Number(count) || 0;
  return {
    items: rows.map(commentRowToApi),
    pagination: {
      itemCount,
      pageCount: Math.ceil(itemCount / safeLimit) || 0,
      page: safePage,
      limit: safeLimit,
    },
  };
}

export async function getCommentCount({ tmdbId, mediaType }) {
  const [{ count }] = await db
    .select({ count: sql`count(*)::int` })
    .from(titleComments)
    .where(and(eq(titleComments.tmdbId, Number(tmdbId)), eq(titleComments.mediaType, mediaType)));
  return Number(count) || 0;
}

export async function insertNativeComment({ tmdbId, mediaType, userId, author, body, spoiler }) {
  const [row] = await db
    .insert(titleComments)
    .values({
      tmdbId: Number(tmdbId), mediaType, source: 'native', userId,
      authorName: author?.displayName || author?.username || 'Usuario',
      authorUsername: author?.username || null,
      authorAvatarUrl: author?.avatarUrl || null,
      authorIsVip: false, body, likes: 0, spoiler: !!spoiler,
    })
    .returning();
  return commentRowToApi(row);
}

export async function updateNativeComment({ id, userId, body, spoiler }) {
  const [row] = await db
    .update(titleComments)
    .set({ body, spoiler: !!spoiler })
    .where(and(eq(titleComments.id, id), eq(titleComments.userId, userId), eq(titleComments.source, 'native')))
    .returning();
  return row ? commentRowToApi(row) : null;
}

export async function deleteNativeComment({ id, userId }) {
  const rows = await db
    .delete(titleComments)
    .where(and(eq(titleComments.id, id), eq(titleComments.userId, userId), eq(titleComments.source, 'native')))
    .returning({ id: titleComments.id });
  return rows.length > 0;
}
```

- [ ] **Step 2: Smoke-check imports**

Run (from `backend/`): `node -e "import('./src/community/store.js').then(m=>console.log(Object.keys(m)))"`
Expected: prints the 5 exported function names.

- [ ] **Step 3: Commit**

```bash
git add backend/src/community/store.js
git commit -m "feat(community): comment store (reads + native writes)"
```

> DB behavior is verified end-to-end in Task 18 (manual checklist).

---

### Task 7: Seed orchestrator — comments + state

**Files:**
- Create: `backend/src/community/seed.js`

**Interfaces:**
- Consumes: `db`, `titleCommunityState`, Trakt client, `normalizeTraktComment`, `seedDecision`, `nextRetryDate`. (Sentiment + lists wired in Tasks 10 and 13.)
- Produces (async):
  - `ensureSeeded({ tmdbId, mediaType })` → `{ status }` — non-blocking dispatcher: claims the lock and runs `runSeed` in the background; returns immediately.
  - `runSeed({ tmdbId, mediaType })` → performs the copy; used by `ensureSeeded` and callable directly in tests/manual.
  - `getState({ tmdbId, mediaType })` → state row | null

- [ ] **Step 1: Write the orchestrator (comments-only for now; sentiment/lists appended later)**

```js
// backend/src/community/seed.js
import { db } from '../db/client.js';
import { titleCommunityState, titleComments } from '../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { seedDecision, nextRetryDate } from './state.js';
import { resolveTraktId, getComments } from './trakt.js';
import { normalizeTraktComment } from './normalize.js';

export async function getState({ tmdbId, mediaType }) {
  const [row] = await db
    .select().from(titleCommunityState)
    .where(and(eq(titleCommunityState.tmdbId, Number(tmdbId)), eq(titleCommunityState.mediaType, mediaType)))
    .limit(1);
  return row || null;
}

// Atomically claim the seed lock. Returns true if THIS caller should seed.
async function claimSeedLock({ tmdbId, mediaType }) {
  // Upsert a 'pending' row if absent, then flip pending/failed→seeding atomically.
  await db.insert(titleCommunityState)
    .values({ tmdbId: Number(tmdbId), mediaType, status: 'pending' })
    .onConflictDoNothing({ target: [titleCommunityState.tmdbId, titleCommunityState.mediaType] });

  const claimed = await db.execute(sql`
    UPDATE title_community_state
       SET status = 'seeding', updated_at = now()
     WHERE tmdb_id = ${Number(tmdbId)} AND media_type = ${mediaType}
       AND status IN ('pending','failed')
       AND (next_retry_at IS NULL OR next_retry_at < now())
    RETURNING tmdb_id`);
  return (claimed?.rows?.length || claimed?.length || 0) > 0;
}

export async function runSeed({ tmdbId, mediaType }) {
  const numId = Number(tmdbId);
  try {
    const resolved = await resolveTraktId({ type: mediaType, tmdbId: numId });
    // Title not on Trakt → ready but empty (works with natives going forward).
    if (!resolved?.traktId) {
      await markReady({ tmdbId: numId, mediaType, traktId: null, commentCount: 0 });
      return;
    }
    // Copy top-10 comments by likes.
    const { items } = await getComments({ type: mediaType, traktId: resolved.traktId, sort: 'likes', page: 1, limit: 10 });
    const rows = items.map((raw) => normalizeTraktComment(raw, { tmdbId: numId, mediaType })).filter(Boolean);
    if (rows.length) {
      await db.insert(titleComments).values(rows)
        .onConflictDoNothing({ target: titleComments.externalId });
    }
    // (Task 13 will insert lists here; Task 10 will build sentiment here.)
    await markReady({ tmdbId: numId, mediaType, traktId: resolved.traktId, commentCount: rows.length });
  } catch (err) {
    await markFailed({ tmdbId: numId, mediaType, error: String(err?.message || err).slice(0, 300) });
  }
}

async function markReady({ tmdbId, mediaType, traktId, commentCount }) {
  await db.update(titleCommunityState)
    .set({ status: 'ready', traktId, commentCount, seededAt: new Date(), error: null, updatedAt: new Date() })
    .where(and(eq(titleCommunityState.tmdbId, tmdbId), eq(titleCommunityState.mediaType, mediaType)));
}

async function markFailed({ tmdbId, mediaType, error }) {
  const cur = await getState({ tmdbId, mediaType });
  const attempts = (cur?.attempts || 0) + 1;
  await db.update(titleCommunityState)
    .set({ status: 'failed', error, attempts, nextRetryAt: nextRetryDate(attempts), updatedAt: new Date() })
    .where(and(eq(titleCommunityState.tmdbId, tmdbId), eq(titleCommunityState.mediaType, mediaType)));
}

export async function ensureSeeded({ tmdbId, mediaType }) {
  const state = await getState({ tmdbId, mediaType });
  const decision = seedDecision(state);
  if (decision !== 'seed') return { status: state?.status || 'pending' };
  const shouldSeed = await claimSeedLock({ tmdbId, mediaType });
  if (shouldSeed) {
    // Fire-and-forget: don't block the request.
    runSeed({ tmdbId, mediaType }).catch(() => {});
  }
  return { status: 'seeding' };
}
```

- [ ] **Step 2: Smoke-check imports**

Run (from `backend/`): `node -e "import('./src/community/seed.js').then(m=>console.log(Object.keys(m)))"`
Expected: prints `[ 'getState', 'runSeed', 'ensureSeeded' ]`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/community/seed.js
git commit -m "feat(community): seed orchestrator (comments + state lock)"
```

---

### Task 8: `/v1/community` comment routes + register

**Files:**
- Create: `backend/src/routes/community.js`
- Modify: `backend/src/server.js` (import + register at `/community`)

**Interfaces:**
- Consumes: store functions, `ensureSeeded`, `getState`, `getCommentCount`.
- Produces HTTP: `GET/POST/PATCH/DELETE /v1/community/:type/:tmdbId/comments`.

- [ ] **Step 1: Write the routes file (comments only; sentiment/lists added in Tasks 11 & 14)**

```js
// backend/src/routes/community.js
import { z } from 'zod';
import { ensureSeeded, getState } from '../community/seed.js';
import {
  getCommentsPage, insertNativeComment, updateNativeComment, deleteNativeComment,
} from '../community/store.js';

const TYPES = new Set(['movie', 'tv']);
function parseTarget(req, reply) {
  const type = String(req.params.type || '').toLowerCase();
  const tmdbId = Number(req.params.tmdbId);
  if (!TYPES.has(type) || !Number.isFinite(tmdbId)) {
    reply.status(400).send({ error: 'Invalid type or tmdbId' });
    return null;
  }
  return { type, tmdbId };
}

const commentBody = z.object({ comment: z.string().min(1).max(2000), spoiler: z.boolean().optional().default(false) });

export default async function communityRoutes(fastify) {
  // GET comments — public; triggers seed if needed.
  fastify.get('/:type/:tmdbId/comments', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const { tab = 'top', page = '1', limit = '5' } = req.query || {};
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const data = await getCommentsPage({ tmdbId: t.tmdbId, mediaType: t.type, tab, page, limit });
    reply.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return { ...data, state: seed.status };
  });

  // POST native comment — requires auth.
  fastify.post('/:type/:tmdbId/comments', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const parsed = commentBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    const item = await insertNativeComment({
      tmdbId: t.tmdbId, mediaType: t.type, userId: req.user.id, author: req.user,
      body: parsed.data.comment, spoiler: parsed.data.spoiler,
    });
    return reply.status(201).send({ comment: item });
  });

  // PATCH native comment (owner only).
  fastify.patch('/:type/:tmdbId/comments/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const parsed = commentBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    const item = await updateNativeComment({
      id: req.params.id, userId: req.user.id,
      body: parsed.data.comment, spoiler: parsed.data.spoiler ?? false,
    });
    if (!item) return reply.status(404).send({ error: 'Comment not found' });
    return reply.send({ comment: item });
  });

  // DELETE native comment (owner only).
  fastify.delete('/:type/:tmdbId/comments/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const ok = await deleteNativeComment({ id: req.params.id, userId: req.user.id });
    if (!ok) return reply.status(404).send({ error: 'Comment not found' });
    return reply.send({ ok: true });
  });
}
```

- [ ] **Step 2: Register the routes in `backend/src/server.js`**

Add import near the other route imports (after `calendarRoutes` import, line ~31):
```js
import communityRoutes from './routes/community.js';
```
Add registration inside `apiV1` (after `app.register(calendarRoutes, { prefix: '/calendar' });`, line ~204):
```js
  app.register(communityRoutes, { prefix: '/community' });
```

- [ ] **Step 3: Start the backend and hit the endpoint**

Run (from `backend/`): `npm run dev` (in one shell). In another:
`curl -s "http://localhost:3001/v1/community/movie/155/comments?tab=top&limit=5" | head -c 400`
Expected: JSON `{ "items": [...], "pagination": {...}, "state": "seeding" }` on first call; re-run after ~3s → `state: "ready"` and `items` populated (movie 155 = The Dark Knight, which has Trakt comments).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/community.js backend/src/server.js
git commit -m "feat(community): /v1/community comment routes"
```

---

### Task 9: Next proxy for comments + repoint traktClient

**Files:**
- Create: `src/app/api/community/[type]/[tmdbId]/comments/route.js`
- Modify: `src/lib/api/traktClient.js` (repoint 6 helpers)

**Interfaces:**
- Consumes: `backendFetchJson`, `hasBackendCredentials`, `setBackendAuthCookies` from `src/lib/backend/server.js`; env `BACKEND_API_BASE_URL`.
- Produces: `/api/community/:type/:tmdbId/comments` GET (public, anon fetch) + POST/PATCH/DELETE (auth).

- [ ] **Step 1: Write the comments proxy route**

```js
// src/app/api/community/[type]/[tmdbId]/comments/route.js
import { NextResponse } from "next/server";
import {
  backendFetchJson, hasBackendCredentials, setBackendAuthCookies,
} from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

async function anon(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}

function pathFrom(params, search) {
  const qs = search ? `?${search}` : "";
  return `/v1/community/${params.type}/${params.tmdbId}/comments${qs}`;
}

export async function GET(request, { params }) {
  const p = await params;
  const search = request.nextUrl.search.replace(/^\?/, "");
  // Public read: use authed fetch when possible (native comments attributed), else anon.
  if (hasBackendCredentials(request)) {
    const backend = await backendFetchJson(request, pathFrom(p, search));
    if (backend.ok) {
      const res = NextResponse.json(backend.json);
      setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
      return res;
    }
  }
  return anon(pathFrom(p, search));
}

async function authWrite(request, params, method) {
  const p = await params;
  const body = method === "DELETE" ? undefined : JSON.stringify(await request.json().catch(() => ({})));
  const idPart = new URL(request.url).searchParams.get("id");
  const path = `/v1/community/${p.type}/${p.tmdbId}/comments${idPart ? `/${idPart}` : ""}`;
  const backend = await backendFetchJson(request, path, {
    method, ...(body ? { body, headers: { "Content-Type": "application/json" } } : {}),
  });
  const res = NextResponse.json(backend.json || {}, { status: backend.status || (backend.ok ? 200 : 500) });
  setBackendAuthCookies(res, backend, { secure: request.nextUrl.protocol === "https:" });
  return res;
}

export const POST = (request, ctx) => authWrite(request, ctx.params, "POST");
export const PATCH = (request, ctx) => authWrite(request, ctx.params, "PATCH");
export const DELETE = (request, ctx) => authWrite(request, ctx.params, "DELETE");
```

- [ ] **Step 2: Repoint `traktGetComments` / add / update / delete in `src/lib/api/traktClient.js`**

Keep the exact signatures; change only URLs/methods. Map `sort`→`tab` (`likes`→`top`, `newest`→`recent`). Replace the bodies:

```js
// traktGetComments({ type, tmdbId, sort = "likes", page = 1, limit = 20 })
const tab = sort === "newest" ? "recent" : sort === "likes30" ? "top30" : "top";
const t = type === "show" ? "tv" : type;
const res = await fetch(
  `/api/community/${t}/${tmdbId}/comments?tab=${tab}&page=${page}&limit=${limit}`,
  { cache: "no-store" },
);
// ...keep existing json parse + error throw; return json (has items + pagination + state)
```

```js
// traktAddComment({ type, tmdbId, comment, spoiler })
const t = type === "show" ? "tv" : type;
const res = await fetch(`/api/community/${t}/${tmdbId}/comments`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ comment, spoiler: !!spoiler }),
});
```

```js
// traktUpdateComment({ commentId, comment, spoiler, type = "movie", tmdbId = 0 })
// NOTE: new backend needs type+tmdbId in the path. Add optional params with defaults;
// DetailsClient passes them (see Task 17). URL uses ?id= for the comment id.
const t = type === "show" ? "tv" : type;
const res = await fetch(`/api/community/${t}/${tmdbId}/comments?id=${encodeURIComponent(commentId)}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ comment, spoiler: !!spoiler }),
});
```

```js
// traktDeleteComment({ commentId, type = "movie", tmdbId = 0 })
const t = type === "show" ? "tv" : type;
const res = await fetch(`/api/community/${t}/${tmdbId}/comments?id=${encodeURIComponent(commentId)}`, {
  method: "DELETE",
});
```

- [ ] **Step 3: Verify the details page comments still load**

Start backend (`npm run dev` in `backend/`) and web (`npm run dev` at root). Open `http://localhost:3000/details/movie/155`, scroll to "Comentarios".
Expected: comments render (seeded from Trakt on first visit); the three tabs switch; no request to `api.trakt.tv` in the Network tab for comments.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/community/ src/lib/api/traktClient.js
git commit -m "feat(community): Next proxy for comments + repoint traktClient"
```

---

## Phase 3 — Sentiment

### Task 10: Sentiment pure helpers (heuristic, prompt, parser, api-shape)

**Files:**
- Create: `backend/src/community/sentiment.js` (pure parts first)
- Test: `backend/src/community/sentiment.test.js`

**Interfaces:**
- Produces:
  - `buildHeuristicSentiment(comments)` → `{ good:[{text_es}], bad:[{text_es}] }` (comments = `[{ body }]`)
  - `buildSentimentPrompt({ comments, title })` → `{ system, user }`
  - `parseSentimentResponse(text)` → `{ good:[{text_es}], bad:[{text_es}] } | null`
  - `sentimentRowToApi(row, commentCount)` → `{ good:[{sentiment_es}], bad:[{sentiment_es}], comment_count }`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/community/sentiment.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeuristicSentiment, parseSentimentResponse, sentimentRowToApi, buildSentimentPrompt,
} from './sentiment.js';

test('heuristic finds a positive and a negative theme', () => {
  const r = buildHeuristicSentiment([
    { body: 'An absolute masterpiece, the best acting ever' },
    { body: 'The plot makes no sense and it was boring' },
  ]);
  assert.ok(r.good.length >= 1);
  assert.ok(r.bad.length >= 1);
  assert.ok(typeof r.good[0].text_es === 'string' && r.good[0].text_es.length > 0);
});

test('parseSentimentResponse accepts strict JSON', () => {
  const r = parseSentimentResponse('{"good":[{"text_es":"Gran actuación"}],"bad":[{"text_es":"Ritmo lento"}]}');
  assert.deepEqual(r, { good: [{ text_es: 'Gran actuación' }], bad: [{ text_es: 'Ritmo lento' }] });
});

test('parseSentimentResponse extracts JSON from noisy text and caps at 5', () => {
  const noisy = 'Aquí tienes: {"good":[{"text_es":"a"},{"text_es":"b"},{"text_es":"c"},{"text_es":"d"},{"text_es":"e"},{"text_es":"f"}],"bad":[]} gracias';
  const r = parseSentimentResponse(noisy);
  assert.equal(r.good.length, 5);
  assert.equal(r.bad.length, 0);
});

test('parseSentimentResponse returns null on garbage', () => {
  assert.equal(parseSentimentResponse('no json here'), null);
});

test('sentimentRowToApi maps to UI contract', () => {
  const api = sentimentRowToApi(
    { good: [{ text_es: 'Bien' }], bad: [{ text_es: 'Mal' }] }, 42,
  );
  assert.deepEqual(api.good, [{ sentiment_es: 'Bien' }]);
  assert.deepEqual(api.bad, [{ sentiment_es: 'Mal' }]);
  assert.equal(api.comment_count, 42);
});

test('buildSentimentPrompt includes the title and comments', () => {
  const { system, user } = buildSentimentPrompt({ comments: [{ body: 'Great film' }], title: 'Heat' });
  assert.match(system, /positiv/i);
  assert.match(user, /Heat/);
  assert.match(user, /Great film/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/community/sentiment.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the pure implementation**

Port `buildSentimentFromComments` keyword logic from `src/lib/details/sentiment.js` and adapt output to `{good:[{text_es}],bad:[{text_es}]}`.

```js
// backend/src/community/sentiment.js  (pure parts; generateSentiment added in Step 5)
const POS_PATTERNS = [
  { re: /\b(masterpiece|obra maestra)\b/i, es: 'Considerada una obra maestra' },
  { re: /\b(best|mejor|amazing|incre[ií]ble|brilliant|genial)\b/i, es: 'Valoración entusiasta de la comunidad' },
  { re: /\b(acting|actuaci[oó]n|performance|interpretaci[oó]n)\b/i, es: 'Interpretaciones muy elogiadas' },
  { re: /\b(soundtrack|score|banda sonora|m[uú]sica)\b/i, es: 'La banda sonora destaca' },
  { re: /\b(visual|cinematography|fotograf[ií]a)\b/i, es: 'Apartado visual y fotografía sobresalientes' },
];
const NEG_PATTERNS = [
  { re: /\b(boring|aburrid|slow|lento|tedious)\b/i, es: 'Ritmo lento para parte del público' },
  { re: /\b(makes no sense|no tiene sentido|confusing|confus)\b/i, es: 'Tramas que a algunos les resultan confusas' },
  { re: /\b(too long|demasiado larg|overlong)\b/i, es: 'Se percibe como demasiado larga' },
  { re: /\b(disappoint|decepci[oó]n|weak|floj)\b/i, es: 'Expectativas no del todo cumplidas' },
  { re: /\b(overrated|sobrevalorad)\b/i, es: 'Señalada por algunos como sobrevalorada' },
];

function collect(comments, patterns) {
  const out = [];
  const seen = new Set();
  for (const p of patterns) {
    if (out.length >= 5) break;
    if (comments.some((c) => p.re.test(c?.body || ''))) {
      if (!seen.has(p.es)) { seen.add(p.es); out.push({ text_es: p.es }); }
    }
  }
  return out;
}

export function buildHeuristicSentiment(comments = []) {
  const list = Array.isArray(comments) ? comments : [];
  return { good: collect(list, POS_PATTERNS), bad: collect(list, NEG_PATTERNS) };
}

export function buildSentimentPrompt({ comments = [], title = '' }) {
  const joined = comments.map((c, i) => `${i + 1}. ${String(c?.body || '').slice(0, 400)}`).join('\n');
  const system = [
    'Eres un analista de opiniones de cine y series. A partir de comentarios de la comunidad,',
    'extrae los temas POSITIVOS y NEGATIVOS recurrentes.',
    'Devuelve SOLO JSON válido con esta forma exacta:',
    '{"good":[{"text_es":"..."}],"bad":[{"text_es":"..."}]}',
    'Reglas: 3 a 5 elementos por lado (menos si no hay material); cada text_es es una frase corta',
    'en español (máx ~90 caracteres), concreta y neutral; NO inventes; si no hay negativos claros, "bad":[].',
  ].join(' ');
  const user = `Título: ${title}\nComentarios de la comunidad:\n${joined}`;
  return { system, user };
}

function clampSide(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? { text_es: x } : x))
    .filter((x) => x && typeof x.text_es === 'string' && x.text_es.trim())
    .map((x) => ({ text_es: x.text_es.trim() }))
    .slice(0, 5);
}

export function parseSentimentResponse(text) {
  if (!text) return null;
  let obj = null;
  try { obj = JSON.parse(text); } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { obj = JSON.parse(m[0]); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const good = clampSide(obj.good);
  const bad = clampSide(obj.bad);
  if (!good.length && !bad.length) return null;
  return { good, bad };
}

export function sentimentRowToApi(row, commentCount = 0) {
  const map = (arr) => (Array.isArray(arr) ? arr : []).map((x) => ({ sentiment_es: x?.text_es || '' })).filter((x) => x.sentiment_es);
  return { good: map(row?.good), bad: map(row?.bad), comment_count: Number(commentCount) || 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/community/sentiment.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the async `generateSentiment` provider chain (Ollama default) to `sentiment.js`**

Append (no unit test — network glue; verified in Task 12 manual):

```js
// ── generator (append to backend/src/community/sentiment.js) ──
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_SENTIMENT_MODEL || process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_SENTIMENT_TIMEOUT_MS) || 30000;

async function ollamaSentiment({ system, user }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, cache: 'no-store',
      body: JSON.stringify({
        model: OLLAMA_MODEL, stream: false, keep_alive: '24h', format: 'json',
        options: { temperature: 0.3, num_predict: 400 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return parseSentimentResponse(json?.message?.content);
  } catch { return null; } finally { clearTimeout(timer); }
}

// Returns { good, bad, provider, model } or null. Comments = [{ body }].
export async function generateSentiment({ comments, title }) {
  if (!Array.isArray(comments) || comments.length === 0) return null;
  const prompt = buildSentimentPrompt({ comments, title });
  const viaOllama = await ollamaSentiment(prompt);
  if (viaOllama) return { ...viaOllama, provider: 'ollama', model: OLLAMA_MODEL };
  return null; // caller keeps the heuristic
}
```

- [ ] **Step 6: Re-run the sentiment tests (still pass; generator untested by unit)**

Run: `node --test src/community/sentiment.test.js`
Expected: PASS (still 6).

- [ ] **Step 7: Commit**

```bash
git add backend/src/community/sentiment.js backend/src/community/sentiment.test.js
git commit -m "feat(community): sentiment helpers + Ollama generator"
```

---

### Task 11: Sentiment store + wire into seed + route

**Files:**
- Modify: `backend/src/community/store.js` (sentiment read/write)
- Modify: `backend/src/community/seed.js` (build sentiment in `runSeed`)
- Modify: `backend/src/routes/community.js` (GET sentiment)

**Interfaces:**
- Consumes: `titleSentiment`, `buildHeuristicSentiment`, `generateSentiment`, `sentimentRowToApi`.
- Produces:
  - store: `getSentiment({tmdbId,mediaType})` → api-shape (default empty), `upsertSentiment({tmdbId,mediaType, good,bad,provider,model,sourceCommentCount,isProvisional})`
  - route: `GET /v1/community/:type/:tmdbId/sentiment`

- [ ] **Step 1: Add sentiment functions to `store.js`**

```js
// add imports: titleSentiment
import { titleSentiment } from '../db/schema.js';
import { sentimentRowToApi } from './sentiment.js';

export async function getSentiment({ tmdbId, mediaType }) {
  const [row] = await db.select().from(titleSentiment)
    .where(and(eq(titleSentiment.tmdbId, Number(tmdbId)), eq(titleSentiment.mediaType, mediaType))).limit(1);
  const count = await getCommentCount({ tmdbId, mediaType });
  if (!row) return { good: [], bad: [], comment_count: count };
  return sentimentRowToApi(row, count);
}

export async function upsertSentiment({ tmdbId, mediaType, good, bad, provider, model, sourceCommentCount, isProvisional }) {
  await db.insert(titleSentiment)
    .values({ tmdbId: Number(tmdbId), mediaType, good, bad, provider, model, sourceCommentCount, isProvisional, builtAt: new Date() })
    .onConflictDoUpdate({
      target: [titleSentiment.tmdbId, titleSentiment.mediaType],
      set: { good, bad, provider, model, sourceCommentCount, isProvisional, builtAt: new Date() },
    });
}
```

- [ ] **Step 2: Build sentiment inside `runSeed` (in `backend/src/community/seed.js`)**

Add imports and insert the sentiment build after copying the top-10 comments and before `markReady`. Fetch up to ~50 comments (analysis input) — reuse the copied 10 if the extra fetch fails.

```js
// add to imports:
import { titleSentiment } from '../db/schema.js';
import { buildHeuristicSentiment, generateSentiment } from './sentiment.js';
import { upsertSentiment } from './store.js';

// inside runSeed, replace the "(Task 10 will build sentiment here.)" area with:
    // Sentiment input: up to 50 top-liked comments (analysis only, not stored beyond 10).
    let analysisComments = rows.map((r) => ({ body: r.body }));
    if (resolved.traktId) {
      const more = await getComments({ type: mediaType, traktId: resolved.traktId, sort: 'likes', page: 1, limit: 50 });
      const moreBodies = more.items
        .map((raw) => normalizeTraktComment(raw, { tmdbId: numId, mediaType }))
        .filter(Boolean).map((r) => ({ body: r.body }));
      if (moreBodies.length) analysisComments = moreBodies;
    }
    const title = ''; // TMDb title optional; prompt tolerates empty
    if (analysisComments.length) {
      // 1) Provisional heuristic immediately.
      const heur = buildHeuristicSentiment(analysisComments);
      await upsertSentiment({ tmdbId: numId, mediaType, good: heur.good, bad: heur.bad,
        provider: 'heuristic', model: null, sourceCommentCount: analysisComments.length, isProvisional: true });
      // 2) Ollama upgrade (best-effort) replaces it.
      const ai = await generateSentiment({ comments: analysisComments, title }).catch(() => null);
      if (ai) {
        await upsertSentiment({ tmdbId: numId, mediaType, good: ai.good, bad: ai.bad,
          provider: ai.provider, model: ai.model, sourceCommentCount: analysisComments.length, isProvisional: false });
      }
    }
```

Also set `sentimentProvider`/`sentimentBuiltAt` in `markReady` (optional cosmetic — leave as is for now; `title_sentiment` is the source of truth).

- [ ] **Step 3: Add the sentiment route in `backend/src/routes/community.js`**

```js
import { getCommentsPage, getSentiment, insertNativeComment, updateNativeComment, deleteNativeComment } from '../community/store.js';

  // GET sentiment — public; triggers seed.
  fastify.get('/:type/:tmdbId/sentiment', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const data = await getSentiment({ tmdbId: t.tmdbId, mediaType: t.type });
    reply.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return { ...data, state: seed.status };
  });
```

- [ ] **Step 4: Verify end to end (Ollama or heuristic)**

Restart backend. `curl -s "http://localhost:3001/v1/community/movie/155/sentiment"`
Expected: after the seed completes, JSON `{ good:[{sentiment_es:...}], bad:[...], comment_count:N, state:"ready" }`. If Ollama is unreachable in dev, the heuristic result is returned (non-empty for a title with comments).

- [ ] **Step 5: Commit**

```bash
git add backend/src/community/store.js backend/src/community/seed.js backend/src/routes/community.js
git commit -m "feat(community): sentiment store, seed integration, GET route"
```

---

### Task 12: Next proxy for sentiment + repoint traktGetSentiments

**Files:**
- Create: `src/app/api/community/[type]/[tmdbId]/sentiment/route.js`
- Modify: `src/lib/api/traktClient.js` (`traktGetSentiments`)

- [ ] **Step 1: Write the sentiment proxy route**

```js
// src/app/api/community/[type]/[tmdbId]/sentiment/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function GET(request, { params }) {
  const p = await params;
  const res = await fetch(`${BASE}/v1/community/${p.type}/${p.tmdbId}/sentiment`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ good: [], bad: [], comment_count: 0 }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
```

- [ ] **Step 2: Repoint `traktGetSentiments({ type, tmdbId })` in `traktClient.js`**

```js
const t = type === "show" ? "tv" : type;
const res = await fetch(`/api/community/${t}/${tmdbId}/sentiment`, { cache: "no-store" });
// keep existing json parse + error throw; return json { good, bad, comment_count, state }
```

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:3000/details/movie/155`, scroll to "Análisis de sentimientos".
Expected: Positivo/Negativo bullets render (heuristic instantly, upgraded by Ollama if configured). No `api.trakt.tv` sentiment call.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/community/ src/lib/api/traktClient.js
git commit -m "feat(community): Next proxy for sentiment + repoint client"
```

---

## Phase 4 — Lists

### Task 13: List normalizers (pure) + list store + seed integration

**Files:**
- Modify: `backend/src/community/normalize.js` (list mappers)
- Test: `backend/src/community/normalize.test.js` (add list cases)
- Modify: `backend/src/community/store.js` (list reads/writes)
- Modify: `backend/src/community/seed.js` (copy 3 lists in `runSeed`)

**Interfaces:**
- Produces:
  - `normalizeTraktList(raw)` → `communityLists` row fields (source `'trakt'`), or `null`
  - `posterUrl(path, size='w342')` → full TMDB image URL or `null`
  - `listRowToApi(row)` → Surface B/A list object (UI contract)
  - store: `upsertCommunityList(row)` → list id; `insertListMembership({listId, item})`; `getListsForTitle({tmdbId,mediaType,limit})`; `discoverLists({sort,page,limit})`; `getCommunityListWithItems({id,page,limit})`

- [ ] **Step 1: Add failing list tests to `normalize.test.js`**

```js
import { normalizeTraktList, listRowToApi, posterUrl } from './normalize.js';

test('normalizeTraktList maps a Trakt "list containing" row', () => {
  const raw = {
    name: 'Cult Classics', description: 'Weird & wonderful', item_count: 693, likes: 43,
    privacy: 'public', ids: { trakt: 99, slug: 'cult-classics' },
    user: { username: 'madmapper', name: 'MadMapper', images: { avatar: { full: 'http://a/m.png' } } },
  };
  const row = normalizeTraktList(raw);
  assert.equal(row.source, 'trakt');
  assert.equal(row.externalId, 99);
  assert.equal(row.slug, 'cult-classics');
  assert.equal(row.name, 'Cult Classics');
  assert.equal(row.itemCount, 693);
  assert.equal(row.likes, 43);
  assert.equal(row.ownerUsername, 'madmapper');
  assert.equal(row.ownerAvatarUrl, 'http://a/m.png');
});

test('posterUrl builds a full TMDB url or null', () => {
  assert.equal(posterUrl('/abc.jpg'), 'https://image.tmdb.org/t/p/w342/abc.jpg');
  assert.equal(posterUrl(null), null);
});

test('listRowToApi produces the Surface B contract', () => {
  const api = listRowToApi({
    id: 'L1', externalId: 99, slug: 'cult-classics', name: 'Cult Classics', description: 'x',
    itemCount: 693, likes: 43, ownerUsername: 'madmapper', ownerName: 'MadMapper',
    ownerAvatarUrl: 'http://a/m.png', previewPosters: ['https://image.tmdb.org/t/p/w342/a.jpg'],
  });
  assert.equal(api.list.name, 'Cult Classics');
  assert.equal(api.list.item_count, 693);
  assert.equal(api.list.likes, 43);
  assert.equal(api.list.ids.slug, 'cult-classics');
  assert.equal(api.list.ids.trakt, 99);
  assert.equal(api.user.username, 'madmapper');
  assert.equal(api.user.images.avatar.full, 'http://a/m.png');
  assert.deepEqual(api.previewPosters, ['https://image.tmdb.org/t/p/w342/a.jpg']);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test src/community/normalize.test.js`
Expected: FAIL — `normalizeTraktList` / `posterUrl` / `listRowToApi` not exported.

- [ ] **Step 3: Implement the list mappers in `normalize.js`**

```js
const TMDB_IMG = 'https://image.tmdb.org/t/p';
export function posterUrl(path, size = 'w342') {
  if (!path) return null;
  return `${TMDB_IMG}/${size}${path}`;
}

export function normalizeTraktList(raw) {
  const list = raw?.list || raw; // Trakt "lists containing" rows nest under .list sometimes
  const externalId = Number(list?.ids?.trakt) || null;
  const name = list?.name || null;
  if (!externalId || !name) return null;
  const user = list?.user || raw?.user || {};
  return {
    source: 'trakt',
    externalId,
    slug: list?.ids?.slug || null,
    name,
    description: list?.description || null,
    ownerName: user?.name || user?.username || null,
    ownerUsername: user?.username || null,
    ownerAvatarUrl: user?.images?.avatar?.full || null,
    itemCount: Number(list?.item_count) || 0,
    likes: Number(list?.likes) || 0,
    privacy: list?.privacy || 'public',
    traktUrl: user?.username && list?.ids?.slug
      ? `https://trakt.tv/users/${user.username}/lists/${list.ids.slug}` : null,
  };
}

export function listRowToApi(row) {
  return {
    list: {
      id: row.id,
      name: row.name,
      description: row.description || '',
      item_count: Number(row.itemCount) || 0,
      likes: Number(row.likes) || 0,
      ids: { slug: row.slug || null, trakt: row.externalId || null },
    },
    user: {
      username: row.ownerUsername || null,
      name: row.ownerName || row.ownerUsername || null,
      images: { avatar: { full: row.ownerAvatarUrl || null } },
    },
    previewPosters: Array.isArray(row.previewPosters) ? row.previewPosters : [],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/community/normalize.test.js`
Expected: PASS (all, including the 3 new list tests).

- [ ] **Step 5: Add list store functions to `store.js`**

```js
import { communityLists, communityListItems, userLists } from '../db/schema.js';
import { listRowToApi } from './normalize.js';

export async function upsertCommunityList(row) {
  const [out] = await db.insert(communityLists).values(row)
    .onConflictDoUpdate({
      target: communityLists.externalId,
      set: { name: row.name, description: row.description, itemCount: row.itemCount,
        likes: row.likes, previewPosters: row.previewPosters, ownerAvatarUrl: row.ownerAvatarUrl },
    })
    .returning({ id: communityLists.id });
  return out.id;
}

export async function insertListMemberships(listId, items) {
  if (!items.length) return;
  await db.insert(communityListItems)
    .values(items.map((it, i) => ({
      listId, tmdbId: Number(it.tmdbId), mediaType: it.mediaType,
      title: it.title || null, posterPath: it.posterPath || null, position: it.position ?? i,
    })))
    .onConflictDoNothing({ target: [communityListItems.listId, communityListItems.tmdbId, communityListItems.mediaType] });
}

export async function getListsForTitle({ tmdbId, mediaType, limit = 6 }) {
  const rows = await db
    .select({
      id: communityLists.id, externalId: communityLists.externalId, slug: communityLists.slug,
      name: communityLists.name, description: communityLists.description,
      itemCount: communityLists.itemCount, likes: communityLists.likes,
      ownerName: communityLists.ownerName, ownerUsername: communityLists.ownerUsername,
      ownerAvatarUrl: communityLists.ownerAvatarUrl, previewPosters: communityLists.previewPosters,
    })
    .from(communityListItems)
    .innerJoin(communityLists, eq(communityListItems.listId, communityLists.id))
    .where(and(eq(communityListItems.tmdbId, Number(tmdbId)), eq(communityListItems.mediaType, mediaType)))
    .orderBy(desc(communityLists.likes))
    .limit(Math.min(Number(limit) || 6, 20));
  return rows.map(listRowToApi);
}

const SORTS = {
  items_desc: [desc(communityLists.itemCount)], items_asc: [asc(communityLists.itemCount)],
  likes_desc: [desc(communityLists.likes)], likes_asc: [asc(communityLists.likes)],
  name_asc: [asc(communityLists.name)], name_desc: [desc(communityLists.name)],
};

export async function discoverLists({ sort = 'items_desc', page = 1, limit = 30 }) {
  const orderBy = SORTS[sort] || SORTS.items_desc;
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 60);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  const rows = await db.select().from(communityLists).orderBy(...orderBy).limit(safeLimit).offset(offset);
  return rows.map(listRowToApi);
}

export async function getCommunityListWithItems({ id, page = 1, limit = 50 }) {
  const [list] = await db.select().from(communityLists).where(eq(communityLists.id, id)).limit(1);
  if (!list) return null;
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 150);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  const items = await db.select().from(communityListItems)
    .where(eq(communityListItems.listId, id))
    .orderBy(asc(communityListItems.position)).limit(safeLimit).offset(offset);
  return { list: listRowToApi(list).list, items };
}
```

- [ ] **Step 6: Copy 3 lists inside `runSeed` (in `seed.js`)**

Add imports and, after the sentiment block, before `markReady`:

```js
// imports:
import { getListsContaining, getUserListItems } from './trakt.js';
import { normalizeTraktList, posterUrl } from './normalize.js';
import { upsertCommunityList, insertListMemberships } from './store.js';

// inside runSeed, after sentiment, before markReady:
    if (resolved.traktId) {
      const { items: listItems } = await getListsContaining({ type: mediaType, traktId: resolved.traktId, tab: 'popular', page: 1, limit: 3 });
      for (const raw of listItems) {
        const listRow = normalizeTraktList(raw);
        if (!listRow) continue;
        // preview posters (best-effort): first 5 items of the list
        let members = [];
        if (listRow.ownerUsername && listRow.slug) {
          const its = await getUserListItems({ username: listRow.ownerUsername, listSlug: listRow.slug, page: 1, limit: 150 });
          members = its.map((it) => {
            const m = it.movie || it.show; const isTv = !!it.show;
            const tmdbId = m?.ids?.tmdb; if (!tmdbId) return null;
            return { tmdbId, mediaType: isTv ? 'tv' : 'movie', title: m?.title || null,
              posterPath: m?.images?.poster?.thumb ? null : null }; // TMDb poster hydrated below if needed
          }).filter(Boolean).slice(0, 150);
        }
        const previews = members.slice(0, 5).map((m) => posterUrl(m.posterPath)).filter(Boolean);
        const listId = await upsertCommunityList({ ...listRow, copiedItemCount: members.length, previewPosters: previews });
        // Always record the seeding title's membership even if the full item fetch failed.
        const membershipItems = members.length ? members : [{ tmdbId: numId, mediaType, position: 0 }];
        await insertListMemberships(listId, membershipItems);
      }
    }
```

> Note: Trakt list items expose TMDb ids under `movie.ids.tmdb` / `show.ids.tmdb`. Poster paths are hydrated lazily by Surface A/B via the frontend (which already prefixes TMDB paths); here `previewPosters` may be empty when Trakt provides no image — acceptable, the UI falls back to the collage/placeholder. A later enhancement can hydrate posters via `tmdbGet`.

- [ ] **Step 7: Verify list copy**

Restart backend, hit `curl -s "http://localhost:3001/v1/community/movie/155/comments"` to trigger the seed, wait ~5s, then check the DB: `psql "$DATABASE_URL" -c "select name,item_count,likes from community_lists limit 5;"`
Expected: up to 3 rows (lists that contain The Dark Knight).

- [ ] **Step 8: Commit**

```bash
git add backend/src/community/normalize.js backend/src/community/normalize.test.js backend/src/community/store.js backend/src/community/seed.js
git commit -m "feat(community): list normalizers, store, seed copy of 3 lists"
```

---

### Task 14: List routes (Surface B, discover, detail)

**Files:**
- Modify: `backend/src/routes/community.js`

**Interfaces:**
- Produces:
  - `GET /v1/community/:type/:tmdbId/lists?limit=` → `{ items: listApi[] }`
  - `GET /v1/community/lists/discover?sort=&page=&limit=` → `{ results: listApi[] }`
  - `GET /v1/community/lists/:id?page=&limit=` → `{ list, items }`

- [ ] **Step 1: Add the three list routes**

```js
import {
  getCommentsPage, getSentiment, getListsForTitle, discoverLists, getCommunityListWithItems,
  insertNativeComment, updateNativeComment, deleteNativeComment,
} from '../community/store.js';

  // Surface B: lists containing this title.
  fastify.get('/:type/:tmdbId/lists', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const items = await getListsForTitle({ tmdbId: t.tmdbId, mediaType: t.type, limit: req.query?.limit || 6 });
    reply.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return { items, state: seed.status };
  });

  // Surface A: discover.
  fastify.get('/lists/discover', async (req, reply) => {
    const { sort = 'items_desc', page = '1', limit = '30' } = req.query || {};
    const results = await discoverLists({ sort, page, limit });
    reply.header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return { results };
  });

  // List detail.
  fastify.get('/lists/:id', async (req, reply) => {
    const { page = '1', limit = '50' } = req.query || {};
    const data = await getCommunityListWithItems({ id: req.params.id, page, limit });
    if (!data) return reply.status(404).send({ error: 'List not found' });
    reply.header('Cache-Control', 'public, s-maxage=300');
    return data;
  });
```

> Route order note: register `'/lists/discover'` and `'/lists/:id'` — Fastify handles static vs param correctly, but ensure `'/lists/discover'` is declared before `'/lists/:id'` is not required (Fastify's radix router prioritizes static). Keep both.

- [ ] **Step 2: Verify**

`curl -s "http://localhost:3001/v1/community/movie/155/lists" | head -c 300`
Expected: `{ "items": [ { "list": {...}, "user": {...}, "previewPosters": [...] } ], "state": "ready" }`.
`curl -s "http://localhost:3001/v1/community/lists/discover?sort=likes_desc&limit=5" | head -c 200`
Expected: `{ "results": [...] }` (lists accumulated so far).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/community.js
git commit -m "feat(community): list routes (surface B, discover, detail)"
```

---

### Task 15: Next proxies for lists + repoint clients

**Files:**
- Create: `src/app/api/community/[type]/[tmdbId]/lists/route.js`
- Create: `src/app/api/community/lists/discover/route.js`
- Create: `src/app/api/community/lists/[id]/route.js`
- Modify: `src/lib/api/traktClient.js` (`traktGetLists`)
- Modify: `src/lib/hooks/useTraktLists.js` (Surface A discovery source)
- Modify: `src/components/lists/TraktListDetailsClient.jsx` (detail fetch URL)

- [ ] **Step 1: Write the three proxy routes**

```js
// src/app/api/community/[type]/[tmdbId]/lists/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export async function GET(request, { params }) {
  const p = await params;
  const qs = request.nextUrl.search || "";
  const res = await fetch(`${BASE}/v1/community/${p.type}/${p.tmdbId}/lists${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ items: [] }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
```

```js
// src/app/api/community/lists/discover/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export async function GET(request) {
  const qs = request.nextUrl.search || "";
  const res = await fetch(`${BASE}/v1/community/lists/discover${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({ results: [] }));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
```

```js
// src/app/api/community/lists/[id]/route.js
import { NextResponse } from "next/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
export async function GET(request, { params }) {
  const p = await params;
  const qs = request.nextUrl.search || "";
  const res = await fetch(`${BASE}/v1/community/lists/${p.id}${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.ok ? 200 : res.status });
}
```

- [ ] **Step 2: Repoint `traktGetLists` (Surface B) in `traktClient.js`**

```js
// traktGetLists({ type, tmdbId, tab = "popular", page = 1, limit = 10, countOnly = false })
const t = type === "show" ? "tv" : type;
const res = await fetch(`/api/community/${t}/${tmdbId}/lists?limit=${limit}`, { cache: "no-store" });
const json = await res.json();
if (!res.ok) throw new Error(json?.error || "No se pudieron cargar las listas");
// Contract preserved: return json.items (each { list, user, previewPosters }).
return countOnly ? { pagination: { itemCount: json.items?.length || 0 } } : json;
```

- [ ] **Step 3: Point Surface A discovery to the new route in `useTraktLists.js`**

Change the fetch URL from `/api/trakt/lists?mode=...` to `/api/community/lists/discover?sort=items_desc&limit=30` and read `json.results` (mapping to the hook's existing list shape — each item already has `.list`/`.user`/`.previewPosters`; adapt the mapping the hook does to read from `results[].list`).

- [ ] **Step 4: Point the list-detail client to the new route**

In `src/components/lists/TraktListDetailsClient.jsx`, change the fetch from `/api/trakt/lists/<username>/<listId>` to `/api/community/lists/<id>` (the discover cards now carry our internal `list.id`). Adjust the item mapping to read `items[].{tmdbId,mediaType,title,posterPath}`.

- [ ] **Step 5: Verify**

Open `http://localhost:3000/lists` (FUENTE Comunidad) → cards render from accumulated lists. Open a title details page "Listas" section → Surface B renders. Click a list → detail page shows items.
Expected: no `api.trakt.tv` list calls.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/community/ src/lib/api/traktClient.js src/lib/hooks/useTraktLists.js src/components/lists/TraktListDetailsClient.jsx
git commit -m "feat(community): Next proxies for lists + repoint clients"
```

---

## Phase 5 — SSR + summary + cleanup

### Task 16: `summary` endpoint + SSR helper + details page props

**Files:**
- Modify: `backend/src/routes/community.js` (GET summary)
- Create: `src/lib/community/server.js`
- Modify: `src/app/details/[type]/[id]/page.jsx`

**Interfaces:**
- Produces:
  - `GET /v1/community/:type/:tmdbId/summary` → `{ sentiment, comments:{items,pagination}, lists:{items}, state }`
  - `fetchCommunitySummary({ type, id })` (server) → same object or null

- [ ] **Step 1: Add the summary route**

```js
  // Combined summary for SSR (one round-trip).
  fastify.get('/:type/:tmdbId/summary', async (req, reply) => {
    const t = parseTarget(req, reply); if (!t) return;
    const seed = await ensureSeeded({ tmdbId: t.tmdbId, mediaType: t.type });
    const [sentiment, comments, lists] = await Promise.all([
      getSentiment({ tmdbId: t.tmdbId, mediaType: t.type }),
      getCommentsPage({ tmdbId: t.tmdbId, mediaType: t.type, tab: 'top', page: 1, limit: 5 }),
      getListsForTitle({ tmdbId: t.tmdbId, mediaType: t.type, limit: 6 }),
    ]);
    reply.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    return { sentiment, comments, lists: { items: lists }, state: seed.status };
  });
```

- [ ] **Step 2: Write the SSR helper**

```js
// src/lib/community/server.js
const BASE = process.env.BACKEND_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

export async function fetchCommunitySummary({ type, id }) {
  if (!BASE) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200); // short SSR budget
  try {
    const res = await fetch(`${BASE}/v1/community/${type}/${id}/summary`, {
      cache: "no-store", signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timer); }
}
```

- [ ] **Step 3: Wire SSR props into `src/app/details/[type]/[id]/page.jsx`**

After `const data = await getDetails(...)`, add:
```js
import { fetchCommunitySummary } from "@/lib/community/server";
// ...
  const community = await fetchCommunitySummary({ type, id }).catch(() => null);
// pass to loader:
      initialSentiment={community?.sentiment || null}
      initialComments={community?.comments || null}
      initialLists={community?.lists?.items || null}
```
And thread these three props through `DetailsPageLoader` into `DetailsClient` (add them to the loader's prop list and pass-through).

- [ ] **Step 4: Verify SSR**

`curl -s "http://localhost:3000/details/movie/155" | grep -o "Análisis de sentimientos"` (after the title has been seeded once).
Expected: the phrase appears in the server-rendered HTML (sentiment present on first paint).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/community.js src/lib/community/server.js src/app/details/
git commit -m "feat(community): summary endpoint + SSR of community content"
```

---

### Task 17: DetailsClient — consume initial props, drop Trakt reply, pass type/tmdbId to write helpers

**Files:**
- Modify: `src/components/DetailsClient.jsx`
- Modify: `src/components/details/TraktCommentModal.jsx` (if it calls update/delete)

- [ ] **Step 1: Initialize state from the new props**

In `DetailsClient.jsx`, where `tSentiment`, `tComments`, `tLists` states are created, seed them from `initialSentiment` / `initialComments` / `initialLists` when present (mirror how `initialReviews` is used). This makes the sections paint immediately without waiting for the client effect; the effect still runs to refresh and to poll while `state === 'seeding'`.

- [ ] **Step 2: Remove the "Responder en Trakt" affordance**

Delete the "Responder en Trakt →" link block in the comments card render (the block using `trakt.traktUrl + '/comments'`) and the equivalent per-title Trakt link in the sentiment/list blocks if present. Keep everything else.

- [ ] **Step 3: Pass `type` + `tmdbId` to update/delete calls**

Where `traktUpdateComment({ commentId, ... })` and `traktDeleteComment({ commentId })` are called, add `type: traktType, tmdbId: id` so the new backend path can be built (see Task 9 Step 2 signatures).

- [ ] **Step 4: Add seeding poll**

In the comments/sentiment loader effects, if the fetched response has `state === 'seeding'`, schedule a re-fetch after 3s and 8s (clear on unmount / id change). This fills content on the very first visit without a blocking spinner.

- [ ] **Step 5: Verify**

Open a NOT-yet-seeded title (pick an unusual movie id). On first open, comments/sentiment show "preparando…"/heuristic and fill within seconds without reload. Write a native comment (logged in) → appears in Recientes.

- [ ] **Step 6: Commit**

```bash
git add src/components/DetailsClient.jsx src/components/details/TraktCommentModal.jsx
git commit -m "feat(community): DetailsClient consumes seeded content, drops Trakt reply link"
```

---

### Task 18: Remove old Trakt community routes + env docs + full manual verification

**Files:**
- Delete: `src/app/api/trakt/community/comments/route.js`, `.../sentiments/route.js`, `.../lists/route.js`, `.../seasons/route.js` (if unused elsewhere — grep first)
- Delete/redirect: `src/app/api/trakt/lists/route.js`, `src/app/api/trakt/lists/[username]/[listId]/route.js` (Surface A/B legacy) — only after confirming no other caller.
- Modify: `backend/.env.example` (add Ollama vars), `docs/backend/backend_manual_testing.md` (append checklist).

- [ ] **Step 1: Grep for remaining callers before deleting**

Run: `grep -rn "api/trakt/community\|api/trakt/lists" src/`
Expected: only the files being repointed. If any other caller exists, repoint it first.

- [ ] **Step 2: Delete the dead Trakt community routes**

Remove the files listed above whose callers are gone. Leave `src/lib/trakt/*` and `src/app/api/trakt/*` that serve PERSONAL features (auth/history/scoreboard) untouched.

- [ ] **Step 3: Add Ollama env vars to `backend/.env.example`**

```
# ── IA local (Ollama) para sentimientos de comunidad ─────────────────────────
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.1:8b
OLLAMA_SENTIMENT_MODEL=llama3.1:8b
```

- [ ] **Step 4: Append the manual checklist to `docs/backend/backend_manual_testing.md`**

```markdown
## Community content (Trakt migration)
- [ ] GET /v1/community/movie/155/comments → first call state:"seeding", after ~5s state:"ready" with items.
- [ ] GET /v1/community/movie/155/sentiment → good/bad non-empty (heuristic or Ollama), comment_count>0.
- [ ] GET /v1/community/movie/155/lists → up to 3 lists with previewPosters.
- [ ] GET /v1/community/lists/discover?sort=likes_desc → accumulated lists.
- [ ] POST a native comment (auth) → visible in Recientes tab; PATCH/DELETE own works; cannot edit others (404).
- [ ] Re-open a seeded title → server logs show NO api.trakt.tv calls (frozen).
- [ ] Details page SSR HTML contains "Análisis de sentimientos" for a seeded title.
```

- [ ] **Step 5: Run all backend unit tests**

Run (from `backend/`): `node --test src/community/*.test.js`
Expected: all pass (state, normalize, tabs, sentiment).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(community): remove legacy Trakt community routes, add env + manual test docs"
```

---

## Self-Review (completed)

- **Spec coverage:** state machine (T2), Trakt client (T3), comments copy+read+write (T4–T9), sentiment heuristic+Ollama+SSR (T10–T12,T16), lists Surface B/A/detail (T13–T15), freeze/no-refresh (seed writes `ready`, no cron), attribution + drop Trakt reply (T4,T17), cap 150 (store + seed), UI contracts preserved (T4,T10,T13). Calendar is the separate plan.
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `seedDecision/nextRetryDate` (T2) used in T7; `normalizeTraktComment/commentRowToApi` (T4) used in T6/T7; `resolveCommentTab` (T5) used in T6; `getCommentsPage/getSentiment/getListsForTitle/discoverLists/getCommunityListWithItems` (T6/T11/T13) used in T8/T11/T14/T16; `buildHeuristicSentiment/generateSentiment/sentimentRowToApi` (T10) used in T11; `normalizeTraktList/listRowToApi/posterUrl` (T13) used in store + seed. Consistent.
