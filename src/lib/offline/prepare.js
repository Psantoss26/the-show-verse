import { loadProfileCharts } from "@/lib/profile/loadProfileCharts";
import { workerMessage, saveOfflineRoute, PREPARATION_EVENT } from "./client";

export const USER_ROUTES = [
  "/", "/favorites", "/watchlist", "/history", "/in-progress", "/completed",
  "/continue-watching", "/lists", "/recommendations", "/calendar", "/biblioteca",
  "/profile", "/profile/settings", ...["level", "statistics", "activity", "watched", "reviews", "favorites", "watchlist", "ratings", "lists", "social"].map((section) => `/profile/${section}`),
];
const SECTIONS = ["activity", "watched", "reviews", "favorites", "watchlist", "ratings", "lists", "followers", "following"];
const READS = [
  "/api/auth/me", "/api/user/preferences", "/api/trakt/auth/status",
  "/api/tmdb/account/favorite", "/api/tmdb/account/watchlist", "/api/trakt/ratings?limit=1000",
  "/api/trakt/history?type=all&page=1&limit=all&extended=full&enrich=0",
  "/api/trakt/history?type=all&page=1&limit=all&extended=full&enrich=1",
  "/api/trakt/history?type=all&limit=all&enrich=0",
  "/api/trakt/show/in-progress", "/api/trakt/show/completed", "/api/progress",
  "/api/profile?posters=0", "/api/lists", "/api/auth/connections",
  "/api/community/lists/discover?sort=items_desc&limit=30",
  "/api/recommendations?type=all&limit=40", "/api/recommendations?type=movie&limit=40", "/api/recommendations?type=tv&limit=40",
];

export async function prepareOfflineAccount(user, { signal, onProgress = () => {} } = {}) {
  const userPath = `/api/users/${encodeURIComponent(user.username)}`;
  const failures = [];
  let completed = 0;
  const progress = (phase) => {
    const state = { phase, completed, failures: failures.length, updatedAt: Date.now() };
    onProgress(state);
    window.dispatchEvent(new CustomEvent(PREPARATION_EVENT, { detail: state }));
  };
  async function read(path, init = {}) {
    signal?.throwIfAborted();
    const response = await fetch(path, { ...init, cache: "no-store", priority: "low", signal });
    if (!response.ok || response.headers.get("X-Showverse-Offline") === "1") throw new Error(`Snapshot unavailable: ${path}`);
    return response.json();
  }
  async function attempt(path, fn) {
    signal?.throwIfAborted();
    try { await fn(); } catch (error) { if (signal?.aborted) throw error; failures.push(path); }
    completed += 1;
    progress("preparing");
  }
  // Confirm the account before saving any private reads or pages.
  const auth = await read("/api/auth/me");
  if (!auth.authenticated || String(auth.user?.id) !== String(user.id)) return;
  await workerMessage({ type: "OFFLINE_PREPARE_BEGIN" });
  progress("preparing");
  // Documents first. They only need HTML plus static assets, and after a deploy
  // any route not yet refreshed keeps opening offline with the previous build's
  // code (old banner, old fixes). Waiting for the data sweep below could leave
  // that window open for minutes.
  let documentsComplete = true;
  const savedRoutes = new Set();
  async function saveRoutes(paths) {
    for (const path of paths) {
      if (savedRoutes.has(path)) continue;
      savedRoutes.add(path);
      await attempt(path, async () => {
        const result = await saveOfflineRoute(path);
        if (!result?.ok) { documentsComplete = false; throw new Error("Document unavailable"); }
      });
    }
  }
  const saved = await workerMessage({ type: "OFFLINE_ROUTES" });
  await saveRoutes([...USER_ROUTES, `/u/${encodeURIComponent(user.username)}/followers`, `/u/${encodeURIComponent(user.username)}/following`, ...(saved?.paths || [])]);
  await attempt(`${userPath}/profile`, () => read(`${userPath}/profile`));
  await attempt(`${userPath}/level`, () => read(`${userPath}/level`));
  const entities = new Map();
  const listIds = new Set();
  for (const path of READS) await attempt(path, async () => {
    const payload = await read(path);
    if (path === "/api/lists") for (const item of payload.results || []) if (item.id) listIds.add(item.id);
    if (path.startsWith("/api/community/lists/discover")) {
      for (const item of payload.results || []) {
        const id = item.list?.id;
        if (id) await attempt(`community-list:${id}`, () => read(`/api/community/lists/${encodeURIComponent(id)}?limit=12`));
      }
    }
  });
  // Exhaust pagination, including sections the user has not opened. Record a
  // complete collection only when every page succeeded (never a partial empty).
  for (const section of SECTIONS) {
    await attempt(section, async () => {
      const items = [];
      let offset = 0;
      let more = true;
      const limit = ["followers", "following"].includes(section) ? 30 : 60;
      while (more) {
        const payload = await read(`${userPath}/${section}?limit=${limit}&offset=${offset}`);
        const rows = payload.items || payload.users || [];
        items.push(...rows);
        for (const item of rows) {
          if (item.tmdbId && ["movie", "tv"].includes(item.mediaType)) entities.set(`${item.mediaType}:${item.tmdbId}`, { tmdbId: item.tmdbId, mediaType: item.mediaType });
          if (section === "lists" && item.id) listIds.add(item.id);
        }
        more = Boolean(payload.hasMore);
        const next = Number(payload.offset) || offset + rows.length;
        if (more && (!rows.length || next <= offset)) throw new Error("Incomplete pagination");
        offset = next;
      }
      const result = await workerMessage({ type: "OFFLINE_COLLECTION", owner: String(user.id), path: `${userPath}/${section}`, items });
      if (!result?.ok) throw new Error("Collection was not saved");
    });
  }
  for (const id of listIds) {
    await attempt(`list:${id}`, () => read(`/api/lists/${encodeURIComponent(id)}`));
  }
  // Complete action states for all titles in the library, independent of the
  // batch used later by profile cards, grids or a previously visited detail.
  const titles = [...entities.values()];
  for (let start = 0; start < titles.length; start += 100) {
    await attempt(`states:${start}`, () => read("/api/backend/items/states", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: titles.slice(start, start + 100) }),
    }));
  }
  await saveRoutes([...listIds].map((id) => `/lists/${encodeURIComponent(id)}`));
  // Profile charts are lazy modules. Prepare them before the origin disappears.
  await attempt("profile-charts", loadProfileCharts);
  const storage = await workerMessage({ type: "OFFLINE_STATUS" });
  if (storage?.storageFull) failures.push("storage-full");
  // Keep previous build assets until every known document has its replacement.
  if (documentsComplete && !failures.length) await workerMessage({ type: "PRUNE_BUILDS" });
  progress(failures.length ? "partial" : "ready");
  return { completed, failures, updatedAt: Date.now() };
}
