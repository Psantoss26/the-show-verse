import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

const LIMIT = 500;
let pendingSnapshot;

async function buildSnapshot() {
  const key = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
  if (!key) throw new Error("TMDB unavailable");
  // A single deadline bounds the entire refresh, including all five batches.
  const signal = AbortSignal.timeout(15000);
  const ranks = {};
  let approximate = false;
  for (let start = 1; start <= LIMIT / 20; start += 5) {
    const pages = await Promise.all(
      Array.from({ length: 5 }, async (_, offset) => {
        const page = start + offset;
        const url = new URL("https://api.themoviedb.org/3/person/popular");
        url.searchParams.set("api_key", key);
        url.searchParams.set("page", String(page));
        url.searchParams.set("language", "es-ES");
        const response = await fetch(url, { cache: "no-store", signal });
        if (!response.ok) throw new Error("TMDB ranking unavailable");
        const data = await response.json();
        if (data.page !== page || !Array.isArray(data.results) || data.results.length !== 20) {
          throw new Error("Incomplete TMDB ranking");
        }
        return { page, results: data.results };
      }),
    );
    for (const { page, results } of pages) {
      results.forEach((person, index) => {
        if (!Number.isSafeInteger(person.id) || person.id <= 0) {
          throw new Error("Inconsistent TMDB ranking");
        }
        // TMDB's independently cached pages can overlap. Keep the first
        // published position instead of rejecting an otherwise valid response.
        if (ranks[person.id]) {
          approximate = true;
          return;
        }
        ranks[person.id] = (page - 1) * 20 + index + 1;
      });
    }
  }
  return { ranks, limit: LIMIT, approximate, updatedAt: new Date().toISOString() };
}

const readSnapshot = unstable_cache(
  () => {
    // Share cold-cache and refresh work between concurrent actor page visits.
    if (!pendingSnapshot) {
      pendingSnapshot = buildSnapshot().finally(() => { pendingSnapshot = null; });
    }
    return pendingSnapshot;
  },
  ["tmdb-people-popularity-top-500-v2"],
  { revalidate: 3600 },
);

export async function GET() {
  try {
    return NextResponse.json(await readSnapshot(), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
    });
  } catch {
    // Never turn a partial/failed ranking into an 'outside top 500' result.
    return NextResponse.json({ error: "Ranking no disponible" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
