// /src/app/api/links/wikipedia/route.js
// GET /api/links/wikipedia?wikidata=Q83495&imdb=tt0133093&type=movie&tmdb=603
// Artículo de Wikipedia de un título: en español y, si no tiene, en inglés.
// Se busca por su entidad de Wikidata (TMDb la da en external_ids.wikidata_id)
// y, si TMDb no la tiene, por el id de IMDb (P345) o el de TMDb (P4947
// película, P4983 serie) en Wikidata. Responde { url } (null si no hay).
import { NextResponse } from "next/server";
import { pickWikipediaUrl } from "@/lib/details/titleExternalLinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
// Wikimedia pide identificar a quien llama.
const USER_AGENT = "TheShowVerse/1.0 (https://theshowverse.com; external links)";
const REVALIDATE_SECONDS = 60 * 60 * 24 * 7;
const CACHE_TTL_MS = REVALIDATE_SECONDS * 1000;
const CACHE_MAX = 2000;
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.url;
}

function cacheSet(key, url) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), url });
}

async function wikidata(params) {
  const url = new URL(WIKIDATA_API);
  for (const [key, value] of Object.entries({ format: "json", ...params })) url.searchParams.set(key, value);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function findEntity(statement) {
  const json = await wikidata({ action: "query", list: "search", srsearch: `haswbstatement:${statement}`, srlimit: "1" });
  const title = json?.query?.search?.[0]?.title;
  return /^Q\d+$/.test(String(title || "")) ? title : null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wikidataParam = String(searchParams.get("wikidata") || "").trim();
  const imdb = String(searchParams.get("imdb") || "").trim();
  const tmdb = Number(searchParams.get("tmdb"));
  const type = searchParams.get("type") === "tv" ? "tv" : "movie";

  const validWikidata = /^Q\d+$/.test(wikidataParam) ? wikidataParam : null;
  const validImdb = /^tt\d{5,10}$/.test(imdb) ? imdb : null;
  const validTmdb = Number.isInteger(tmdb) && tmdb > 0 ? tmdb : null;
  if (!validWikidata && !validImdb && !validTmdb) {
    return NextResponse.json({ error: "Falta el id del título." }, { status: 400 });
  }

  const key = validWikidata || validImdb || `${type}:${validTmdb}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return NextResponse.json({ url: cached });

  try {
    let entityId = validWikidata;
    if (!entityId && validImdb) entityId = await findEntity(`P345=${validImdb}`);
    if (!entityId && validTmdb) entityId = await findEntity(`${type === "tv" ? "P4983" : "P4947"}=${validTmdb}`);

    let url = null;
    if (entityId) {
      const json = await wikidata({
        action: "wbgetentities",
        ids: entityId,
        props: "sitelinks/urls",
        sitefilter: "eswiki|enwiki",
      });
      url = pickWikipediaUrl(json?.entities?.[entityId]);
    }
    cacheSet(key, url);
    return NextResponse.json({ url });
  } catch {
    // Wikidata caída: sin enlace, pero sin recordarlo (se reintentará).
    return NextResponse.json({ url: null });
  }
}
