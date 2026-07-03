# Universal Streaming Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser-extension streaming sync detect the playing title on any streaming site and reliably record it to watch history, including a show-level fallback when the exact episode is unknown.

**Architecture:** Media-Session-first generic detection in the extension emits a normalized `PlaybackSignal`; optional per-host enhancers only sharpen fields (fail-safe). A hardened backend resolver turns the signal into a `Resolution` with a confidence level, recording show-level low-confidence rows instead of dropping views. Coverage comes from a broad curated manifest match list plus a user-add flow (optional permissions + dynamic content scripts).

**Tech Stack:** Manifest V3 extension (buildless, CommonJS `.js`), Next.js App Router proxy routes, Fastify + Drizzle + Postgres backend, TMDb search, `node:test` for unit tests.

## Global Constraints

- NEVER use Trakt for history/dashboard data. History = local `watch_history` (Drizzle/Postgres) only.
- Spanish-Spain (es-ES) is the primary language; TMDb searches must include es-ES + en-US + original.
- Extension is buildless — no bundler. Shared pure code uses a UMD pattern usable both as a content script (`self.X`) and by `node:test` (`module.exports`). The extension dir is CommonJS (root `package.json` has no `"type"`).
- DB migrations are additive and safe (no destructive changes, no backfill required).
- Auth for sync = existing revocable `tsv_netflix_*` token in `connected_accounts` (unchanged).
- Backend tests run with `node --test`; frontend/proxy tests are `.test.mjs` run with `node --test path`.
- Only structured signals + tab title leave the browser — never a page-DOM dump.

## Data Contracts

`PlaybackSignal` (extension → proxy `POST /api/netflix/extension-sync` body, superset of today's payload):
```
{ platform, host, url, contentId?, mainTitle, subTitle?,
  showName?, episodeName?, movieTitle?, season?, episode?,
  seasonEpisodeText?, tabTitle?, artworkUrl?, durationSec?, positionSec? }
```
(`mainTitle`/`subTitle` kept for backward compatibility with the current route.)

`Resolution` (resolver v2 output):
```
{ kind: 'resolved'|'show_level'|'not_found',
  mediaType: 'movie'|'tv', tmdbId, season?, episode?,
  title, posterPath, confidence: 'high'|'medium'|'low' }
```

---

### Task 1: Backend resolver v2 — confidence + episode-by-name + show-level fallback

**Files:**
- Modify: `src/lib/netflix/streamingResolve.js`
- Test: `src/lib/netflix/streamingResolve.test.mjs`

**Interfaces:**
- Consumes: existing `pickTmdbResult(results, query, mediaType, {exactOnly})`, `resolveStreamingEntity({query, preferTv, expectedMediaType, search})` returning `{kind, mediaType, entity}` where `kind ∈ {resolved, series_without_episode, not_found}`.
- Produces: `resolveStreamingEntity` extended to return `confidence` and a `show_level` kind; new pure helper `matchEpisodeByName({episodeName, seasonEpisodes})` → `{season, episode}|null`; new pure helper `scoreConfidence({exactTitle, episodeSource})` → `'high'|'medium'|'low'`. All accept injected data (no network in unit tests).

- [ ] **Step 1: Write failing tests** in `streamingResolve.test.mjs` for the new helpers and behaviors:
```js
import { matchEpisodeByName, scoreConfidence, resolveStreamingEntity } from "./streamingResolve.js";

test("matchEpisodeByName finds S/E by normalized episode title", () => {
  const eps = [
    { season_number: 1, episode_number: 1, name: "Piloto" },
    { season_number: 2, episode_number: 3, name: "El Regreso" },
  ];
  assert.deepEqual(matchEpisodeByName({ episodeName: "el regreso", seasonEpisodes: eps }), { season: 2, episode: 3 });
  assert.equal(matchEpisodeByName({ episodeName: "no existe", seasonEpisodes: eps }), null);
});

test("scoreConfidence: exact title + episode number => high", () => {
  assert.equal(scoreConfidence({ exactTitle: true, episodeSource: "number" }), "high");
  assert.equal(scoreConfidence({ exactTitle: true, episodeSource: "name" }), "high");
  assert.equal(scoreConfidence({ exactTitle: false, episodeSource: "heuristic" }), "medium");
  assert.equal(scoreConfidence({ exactTitle: true, episodeSource: "none" }), "low");
});

test("resolveStreamingEntity returns show_level/low when episode unknown", async () => {
  const result = await resolveStreamingEntity({
    query: "Peaky Blinders", preferTv: true,
    search: async (mt) => (mt === "tv" ? [{ id: 60574, name: "Peaky Blinders", original_name: "Peaky Blinders" }] : []),
  });
  assert.equal(result.kind, "show_level");
  assert.equal(result.confidence, "low");
  assert.equal(result.entity.id, 60574);
});
```
- [ ] **Step 2: Run tests, verify they fail**
Run: `node --test src/lib/netflix/streamingResolve.test.mjs`
Expected: FAIL (`matchEpisodeByName`/`scoreConfidence` not exported; old code returns `series_without_episode`, not `show_level`).
- [ ] **Step 3: Implement.** In `streamingResolve.js`:
  - Reuse the existing `normalizeText` (or the normalizer already used by `pickTmdbResult`). Add:
    ```js
    export function matchEpisodeByName({ episodeName, seasonEpisodes }) {
      if (!episodeName || !Array.isArray(seasonEpisodes)) return null;
      const q = normalizeText(episodeName);
      if (!q) return null;
      const hit = seasonEpisodes.find((e) => normalizeText(e?.name) === q);
      return hit ? { season: hit.season_number, episode: hit.episode_number } : null;
    }
    export function scoreConfidence({ exactTitle, episodeSource }) {
      if (episodeSource === "number" || episodeSource === "name") return exactTitle ? "high" : "medium";
      if (episodeSource === "heuristic") return "medium";
      return exactTitle ? "low" : "low";
    }
    ```
  - Change the branch that currently returns `{ kind: "series_without_episode", entity }`: keep it internal, but the top-level resolve should map "series but no episode" to `{ kind: "show_level", mediaType: "tv", entity, confidence: "low" }`. Attach `confidence` to the `resolved` kind too via `scoreConfidence`.
  - Keep the existing DI `search(mediaType)` signature so tests inject data.
- [ ] **Step 4: Run tests, verify pass**
Run: `node --test src/lib/netflix/streamingResolve.test.mjs`
Expected: PASS (all, incl. pre-existing tests — update any pre-existing assertion that expected `series_without_episode` to expect `show_level`).
- [ ] **Step 5: Commit**
```bash
git add src/lib/netflix/streamingResolve.js src/lib/netflix/streamingResolve.test.mjs
git commit -m "feat(sync): resolver v2 — confidence + episode-by-name + show-level fallback"
```

---

### Task 2: Schema + write path — confidence column, episode-less tv, show-level dedup

**Files:**
- Modify: `backend/src/db/schema.js` (add `confidence` to `watchHistory`)
- Create: `backend/src/db/migrations/<generated>.sql` (via `drizzle-kit generate`)
- Modify: `backend/src/routes/auth.js` (`netflixSyncSchema` + `POST /v1/auth/netflix/sync` dedup)
- Modify: `src/app/api/netflix/extension-sync/route.js` (record show-level instead of skipping; pass confidence)
- Test: `backend/src/routes/netflixSync.dedup.test.js` (new — pure dedup-key helper)

**Interfaces:**
- Consumes: Task 1 `Resolution` (`kind: 'show_level'` ⇒ `episode = null`, `confidence`).
- Produces: `watch_history.confidence` column; a pure `syncDedupKey({tmdbId, mediaType, season, episode, watchedAt})` used by the batch/sync dedup → episode-level within 12h, show-level (episode null) by day.

- [ ] **Step 1: Write failing test** `backend/src/routes/netflixSync.dedup.test.js`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { syncDedupKey } from "./netflixSyncDedup.js";

test("episode-level key includes season+episode+12h bucket", () => {
  const a = syncDedupKey({ tmdbId: 1, mediaType: "tv", season: 1, episode: 2, watchedAt: "2026-07-03T10:00:00Z" });
  const b = syncDedupKey({ tmdbId: 1, mediaType: "tv", season: 1, episode: 2, watchedAt: "2026-07-03T15:00:00Z" });
  assert.equal(a, b); // same 12h bucket
});
test("show-level (episode null) key buckets by day", () => {
  const a = syncDedupKey({ tmdbId: 9, mediaType: "tv", season: null, episode: null, watchedAt: "2026-07-03T01:00:00Z" });
  const b = syncDedupKey({ tmdbId: 9, mediaType: "tv", season: null, episode: null, watchedAt: "2026-07-03T23:00:00Z" });
  assert.equal(a, b);
  assert.ok(a.includes("show"));
});
```
- [ ] **Step 2: Run test, verify fail**
Run: `node --test backend/src/routes/netflixSync.dedup.test.js`
Expected: FAIL (module `./netflixSyncDedup.js` missing).
- [ ] **Step 3: Implement** `backend/src/routes/netflixSyncDedup.js`:
```js
export function syncDedupKey({ tmdbId, mediaType, season, episode, watchedAt }) {
  const t = new Date(watchedAt || Date.now());
  if (episode == null) {
    const day = t.toISOString().slice(0, 10);
    return `show:${mediaType}:${tmdbId}:${day}`;
  }
  const bucket = Math.floor(t.getTime() / (12 * 60 * 60 * 1000));
  return `ep:${mediaType}:${tmdbId}:${season}:${episode}:${bucket}`;
}
```
- [ ] **Step 4: Run test, verify pass**
Run: `node --test backend/src/routes/netflixSync.dedup.test.js`
Expected: PASS.
- [ ] **Step 5: Schema + migration.** In `backend/src/db/schema.js` add to `watchHistory`:
```js
confidence: text('confidence').default('high'),
```
Generate migration:
```bash
cd backend && npm run db:generate
```
Expected: a new SQL file under `backend/src/db/migrations/` adding the `confidence` column. (`season`/`episode` are already nullable — no change needed.)
- [ ] **Step 6: Relax validation + wire dedup + confidence.**
  - `backend/src/routes/auth.js` `netflixSyncSchema`: make `episode` optional for `tv` (remove the "require season+episode for tv" refinement, or allow `episode` null), add `confidence: z.enum(['high','medium','low']).optional()`. Persist `confidence` on insert (default `'high'`). Replace the inline dedup with `syncDedupKey(...)` from `./netflixSyncDedup.js` for both `/sync` and `/sync/batch`.
  - `src/app/api/netflix/extension-sync/route.js`: when the resolver returns `kind: 'show_level'`, DO NOT skip — forward `{ tmdbId, mediaType:'tv', season:null, episode:null, confidence:'low', title, posterPath, ... }`. Pass `confidence` through on the `resolved` path too. Accept the new `PlaybackSignal` fields (map `showName`/`episodeName`/`seasonEpisodeText` into the existing clean/parse logic; keep `mainTitle` fallback).
- [ ] **Step 7: Verify** the backend boots and migration applies against a dev DB:
```bash
cd backend && node --check src/routes/auth.js && npm run db:migrate
```
Expected: no syntax errors; migration reports the `confidence` column added.
- [ ] **Step 8: Commit**
```bash
git add backend/src/db/schema.js backend/src/db/migrations backend/src/routes/auth.js backend/src/routes/netflixSyncDedup.js backend/src/routes/netflixSync.dedup.test.js src/app/api/netflix/extension-sync/route.js
git commit -m "feat(sync): confidence column, episode-less tv rows, show-level recording + dedup"
```

---

### Task 3: Extension — extract pure `detection-core.js` (UMD) + unit tests

**Files:**
- Create: `netflix-extension/detection-core.js` (UMD: `self.TSVDetection` + `module.exports`)
- Create: `netflix-extension/detection-core.test.js` (`node:test`, CommonJS `require`)
- Modify: `netflix-extension/content.js` (remove the moved pure helpers; call `TSVDetection`)

**Interfaces:**
- Produces: `TSVDetection = { parseSeasonEpisode(text)→{season,episode}|null, stripPlatformPrefix(title, platform)→string, findSeasonEpisodeBadge(doc)→{season,episode,text}|null, buildPlaybackSignal(inputs)→PlaybackSignal }`.
- Consumes: nothing (pure; DOM passed in as args for testability).

- [ ] **Step 1: Write failing tests** `netflix-extension/detection-core.test.js`:
```js
const assert = require("node:assert/strict");
const test = require("node:test");
const D = require("./detection-core.js");

test("parseSeasonEpisode multi-language", () => {
  assert.deepEqual(D.parseSeasonEpisode("Temporada 4: Episodio 1"), { season: 4, episode: 1 });
  assert.deepEqual(D.parseSeasonEpisode("S2 E10"), { season: 2, episode: 10 });
  assert.deepEqual(D.parseSeasonEpisode("Capítulo 5"), { season: 1, episode: 5 });
  assert.equal(D.parseSeasonEpisode("no numbers here"), null);
});

test("buildPlaybackSignal prefers Media Session names", () => {
  const sig = D.buildPlaybackSignal({
    host: "www.crunchyroll.com", url: "https://www.crunchyroll.com/watch/abc",
    mediaSession: { title: "El Regreso", artist: "Peaky Blinders", artwork: [{ src: "u", sizes: "512x512" }] },
    tabTitle: "Peaky Blinders - Watch on Crunchyroll", seasonEpisodeText: "T2 E3",
  });
  assert.equal(sig.showName, "Peaky Blinders");
  assert.equal(sig.episodeName, "El Regreso");
  assert.equal(sig.season, 2);
  assert.equal(sig.episode, 3);
  assert.equal(sig.artworkUrl, "u");
});
```
- [ ] **Step 2: Run tests, verify fail**
Run: `node --test netflix-extension/detection-core.test.js`
Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `netflix-extension/detection-core.js` with the UMD wrapper; move `parseSeasonEpisode`, prefix/suffix stripping, and `findSeasonEpisodeBadge` out of `content.js` verbatim (they already exist), and add `buildPlaybackSignal(inputs)` that assembles the `PlaybackSignal` (Media-Session-first, then badge text, then tab title):
```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TSVDetection = api;
})(typeof self !== "undefined" ? self : this, function () {
  function parseSeasonEpisode(text) { /* moved from content.js, unchanged regex */ }
  function stripPlatformPrefix(title, platform) { /* moved */ }
  function findSeasonEpisodeBadge(doc) { /* moved, takes doc arg */ }
  function largestArtwork(list) { /* pick max sizes src */ }
  function buildPlaybackSignal(i) {
    const se = parseSeasonEpisode(i.seasonEpisodeText || "") || parseSeasonEpisode(i.tabTitle || "") || {};
    const ms = i.mediaSession || {};
    return {
      host: i.host, url: i.url, contentId: i.contentId,
      showName: ms.artist || ms.album || undefined,
      episodeName: (ms.artist || ms.album) ? ms.title : undefined,
      movieTitle: (ms.artist || ms.album) ? undefined : (ms.title || undefined),
      season: se.season, episode: se.episode,
      seasonEpisodeText: i.seasonEpisodeText, tabTitle: i.tabTitle,
      artworkUrl: largestArtwork(ms.artwork), durationSec: i.durationSec, positionSec: i.positionSec,
    };
  }
  return { parseSeasonEpisode, stripPlatformPrefix, findSeasonEpisodeBadge, buildPlaybackSignal };
});
```
- [ ] **Step 4: Run tests, verify pass**
Run: `node --test netflix-extension/detection-core.test.js`
Expected: PASS.
- [ ] **Step 5: Rewire `content.js`** to reference `TSVDetection.*` for the moved helpers (delete the now-duplicated definitions). No behavior change yet beyond delegation.
- [ ] **Step 6: Commit**
```bash
git add netflix-extension/detection-core.js netflix-extension/detection-core.test.js netflix-extension/content.js
git commit -m "refactor(ext): extract testable detection-core (UMD) + unit tests"
```

---

### Task 4: Extension — Media-Session-first engine + enhancers + richer payload

**Files:**
- Create: `netflix-extension/platform-enhancers.js` (UMD: `self.TSVEnhancers`)
- Modify: `netflix-extension/content.js` (Media-Session-first flow, build `PlaybackSignal`, send superset payload)
- Modify: `netflix-extension/background.js` (forward the superset payload to `POST /api/netflix/extension-sync`)

**Interfaces:**
- Consumes: `TSVDetection.buildPlaybackSignal`, `TSVDetection.findSeasonEpisodeBadge`.
- Produces: `TSVEnhancers.enhance(host, signal, doc)` → returns a shallow-merged signal with sharpened `contentId`/`season`/`episode`/`showName`; each per-host refiner wrapped in try/catch (never throws).

- [ ] **Step 1: Implement `platform-enhancers.js`** — a registry keyed by host regex; port the existing per-platform `contentId()`/selectors from `content.js` ADAPTERS as *optional refiners* (Netflix `/watch/<id>`, Prime `gti`, Plex S/E, Max/Disney title selectors). `enhance()` iterates, applies the first matching refiner inside try/catch, and returns `{...signal, ...refined}`; on any throw returns `signal` unchanged.
- [ ] **Step 2: Rewire `content.js` tick():**
  - Read `navigator.mediaSession.metadata` → `mediaSession` input; read main video `duration`/`currentTime`; read `TSVDetection.findSeasonEpisodeBadge(document)` → `seasonEpisodeText`; `document.title` → `tabTitle`.
  - `let signal = TSVDetection.buildPlaybackSignal(inputs); signal = TSVEnhancers.enhance(location.hostname, signal, document);`
  - Keep the 15s/size gating and dedup-by-content-key (`signal.contentId || signal.showName+signal.episodeName`).
  - Send `chrome.runtime.sendMessage({ action: "syncWatch", ...signal, mainTitle: signal.showName || signal.movieTitle || signal.tabTitle, subTitle: signal.episodeName })` (keep `mainTitle`/`subTitle` for backward compat).
- [ ] **Step 3: Update `background.js`** `syncWatch` handler to POST the full superset body (spread all signal fields) to `${origin}/api/netflix/extension-sync` with the existing Bearer token. No auth change.
- [ ] **Step 4: Manual verify** (no unit test — DOM/runtime integration):
  - Load unpacked extension; open DevTools console on a Netflix and a Crunchyroll watch page.
  - Confirm `content.js` logs a built `PlaybackSignal` with `showName`/`episodeName`/`season`/`episode` populated, and that a `syncWatch` message is sent after 15s.
  - Confirm the proxy receives the superset body (Network tab on the app origin, or a temporary `console.log` in the route).
Expected: signal populated on both platforms; sync POST fires.
- [ ] **Step 5: Commit**
```bash
git add netflix-extension/platform-enhancers.js netflix-extension/content.js netflix-extension/background.js
git commit -m "feat(ext): Media-Session-first detection + fail-safe enhancers + richer payload"
```

---

### Task 5: Extension — broaden coverage (curated manifest match list)

**Files:**
- Modify: `netflix-extension/manifest.json`

**Interfaces:**
- Consumes: `content.js`, `detection-core.js`, `platform-enhancers.js`.
- Produces: content-script injection on the curated streaming domain list; the new script files loaded before `content.js`.

- [ ] **Step 1:** In `manifest.json`:
  - Add `detection-core.js` and `platform-enhancers.js` to the `content_scripts[].js` array **before** `content.js` (order matters — they set `self.TSVDetection`/`self.TSVEnhancers`).
  - Expand the streaming `matches` to the curated list: Netflix, Prime/Amazon, Max/HBO, Disney+, **Movistar+ (`*.movistarplus.es`)**, **Crunchyroll (`*.crunchyroll.com`)**, **Apple TV+ (`tv.apple.com`)**, **Filmin (`*.filmin.es`)**, **SkyShowtime (`*.skyshowtime.com`)**, **Pluto (`*.pluto.tv`)**, **Rakuten (`*.rakuten.tv`)**, **Atresplayer (`*.atresplayer.com`)**, **RTVE (`*.rtve.es`)**, Plex.
  - Add `"scripting"` to `permissions` and add an `"optional_host_permissions": ["*://*/*"]` entry (used by Task 6 for user-added sites).
  - Bump `version` (e.g. `1.9` → `2.0`).
- [ ] **Step 2: Verify manifest loads** — reload the unpacked extension; Chrome shows no manifest errors; open a Crunchyroll and a Movistar+ page and confirm `content.js` runs (console log).
Expected: no errors; content script active on the new domains.
- [ ] **Step 3: Commit**
```bash
git add netflix-extension/manifest.json
git commit -m "feat(ext): broaden coverage to curated streaming domain list"
```

---

### Task 6: Extension — "Add this site" user-add flow (optional perms + dynamic scripts)

**Files:**
- Modify: `netflix-extension/popup.html`, `netflix-extension/popup.js`
- Modify: `netflix-extension/background.js` (register/persist dynamic content scripts)

**Interfaces:**
- Consumes: `chrome.permissions`, `chrome.scripting.registerContentScripts`, `chrome.storage.local`.
- Produces: on user action, the same 3 content-script files run on the added origin permanently; added origins persisted under `chrome.storage.local.customSites`; re-registered on SW startup.

- [ ] **Step 1:** In `popup.html` add an "Add this site" button + a list of added sites. In `popup.js`, on click: get the active tab origin, `chrome.permissions.request({ origins: [origin + "/*"] })`; on grant, `chrome.runtime.sendMessage({ action: "registerSite", origin })`.
- [ ] **Step 2:** In `background.js`:
  - `registerSite` handler → `chrome.scripting.registerContentScripts([{ id: "tsv-"+hash(origin), matches:[origin+"/*"], js:["detection-core.js","platform-enhancers.js","content.js"], runAt:"document_idle", allFrames:true }])`, then persist origin to `customSites`.
  - On SW startup (`chrome.runtime.onStartup` / `onInstalled`), re-register all `customSites` (guard against duplicate-id errors).
  - Add an `unregisterSite` handler for removing a site (unregister + drop from storage + `chrome.permissions.remove`).
- [ ] **Step 3: Manual verify:** open a streaming site NOT in the curated list; click "Add this site"; accept the permission; reload the page; confirm `content.js` runs and sync fires. Reload the browser; confirm the site still works (re-registration on startup).
Expected: user-added site detects + syncs; persists across restart.
- [ ] **Step 4: Commit**
```bash
git add netflix-extension/popup.html netflix-extension/popup.js netflix-extension/background.js
git commit -m "feat(ext): add-this-site flow (optional permissions + dynamic content scripts)"
```

---

### Task 7: End-to-end verification across platforms

**Files:** none (verification only).

- [ ] **Step 1:** With the app + backend running (`npm run dev`; `cd backend && npm run dev`) and the extension connected (existing settings connect flow), play ≥15s on: Netflix, one of Prime/Max/Disney+, Crunchyroll (new), and one **user-added** site.
- [ ] **Step 2:** For each, verify a `watch_history` row is created with the correct `tmdbId`/`mediaType` and a sensible `confidence`; confirm an episode-unknown case records a `show_level` row (`episode = null`, `confidence = 'low'`) instead of being dropped.
```bash
# spot-check most recent rows (adjust connection as needed)
cd backend && node -e "import('./src/db/index.js').then(async ({db})=>{const {watchHistory}=await import('./src/db/schema.js');const r=await db.select().from(watchHistory).limit(10);console.log(r);process.exit(0)})"
```
- [ ] **Step 3:** Confirm no regression in the existing Netflix history backfill (30-min alarm path still imports).
- [ ] **Step 4:** Final commit if any verification tweaks were needed; otherwise done.

---

## Self-Review

- **Spec coverage:** coverage/user-add (Tasks 5,6) ✓; Media-Session-first + enhancers (Tasks 3,4) ✓; resolver v2 confidence + episode ladder + show-level (Task 1) ✓; schema/validation/dedup (Task 2) ✓; privacy — signals only, no DOM dump (Task 4 payload) ✓; testing (Tasks 1,2,3 unit; 7 e2e) ✓; additive migration (Task 2) ✓; no-Trakt (all writes go to `watch_history`) ✓. No gaps.
- **Type consistency:** `PlaybackSignal` fields identical across Tasks 3/4/2; `Resolution.kind ∈ {resolved, show_level, not_found}` used consistently in Tasks 1/2; `confidence ∈ {high,medium,low}` in Tasks 1/2; `syncDedupKey` signature identical in Tasks 2 test/impl/usage.
- **Placeholders:** none — each code step provides concrete code or an exact edit + verify command.

## Out of Scope

Mobile companion (sub-project B), dedicated review/correction UI, per-platform authenticated history backfill beyond Netflix.
