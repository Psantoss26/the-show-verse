// Wikidata links are matched by TMDb identity, never by a guessed title slug.
// Properties: P4947 (movie), P4983 (series), P1258 (RT), P1712 (Metacritic),
// P6127 (Letterboxd film slug) and P345 (IMDb id, Letterboxd's /imdb/ fallback).
// Letterboxd only lists films: series never get a Letterboxd link.
const TMDB_PROPERTIES = { movie: "P4947", tv: "P4983" };

export function isRatingLinksIdentity(type, tmdbId) {
  return Object.hasOwn(TMDB_PROPERTIES, type) && /^[1-9]\d{0,9}$/.test(String(tmdbId));
}

function claimValues(entity, property) {
  const claims = (entity?.claims?.[property] || []).filter(
    (claim) => claim.rank !== "deprecated" && claim.mainsnak?.snaktype === "value",
  );
  const preferred = claims.filter((claim) => claim.rank === "preferred");
  return (preferred.length ? preferred : claims)
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter((value) => typeof value === "string");
}

export function pickRatingLinks(entities, { type, tmdbId }) {
  const empty = { rt: null, mc: null, lb: null };
  if (!isRatingLinksIdentity(type, tmdbId)) return empty;
  const matches = Object.values(entities || {}).filter((entity) =>
    claimValues(entity, TMDB_PROPERTIES[type]).includes(String(tmdbId)),
  );
  if (matches.length !== 1) return empty;
  const entity = matches[0];
  const rtPattern = type === "movie" ? /^m\/[\w.'-]+$/ : /^tv\/[\w.'-]+$/;
  const mcPattern = type === "movie" ? /^movie\/[\w.'-]+$/ : /^tv\/[\w.'-]+$/;
  const unique = (property, pattern) => {
    const values = [...new Set(claimValues(entity, property).filter((id) => pattern.test(id)))];
    return values.length === 1 ? values[0] : null;
  };
  const rt = unique("P1258", rtPattern);
  const mc = unique("P1712", mcPattern);
  const lbSlug = type === "movie" ? unique("P6127", /^[a-z0-9][a-z0-9-]*$/) : null;
  const imdb = type === "movie" && !lbSlug ? unique("P345", /^tt\d{7,10}$/) : null;
  return {
    rt: rt ? `https://www.rottentomatoes.com/${rt}` : null,
    mc: mc ? `https://www.metacritic.com/${mc}/` : null,
    lb: lbSlug
      ? `https://letterboxd.com/film/${lbSlug}/`
      : imdb ? `https://letterboxd.com/imdb/${imdb}/` : null,
  };
}

// UN solo viaje a Wikidata: la búsqueda por propiedad TMDb (generator=search)
// devuelve ya el contenido JSON de cada elemento (prop=revisions), con los
// claims en la misma forma que wbgetentities. Antes eran dos peticiones en
// serie (search → wbgetentities), ~150–300 ms más en frío.
export async function resolveRatingLinks({ type, tmdbId }, fetchImpl = fetch) {
  if (!isRatingLinksIdentity(type, tmdbId)) throw new Error("Invalid media identity");
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    format: "json", formatversion: "2", action: "query",
    generator: "search", gsrnamespace: "0", gsrlimit: "5",
    gsrsearch: `haswbstatement:${TMDB_PROPERTIES[type]}=${tmdbId}`,
    prop: "revisions", rvprop: "content", rvslots: "main",
  }).toString();
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "TheShowVerse/1.0 (https://theshowverse.com)", Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error("Rating links source unavailable");
  const data = await response.json();
  if (data.error) throw new Error("Rating links source rejected the request");
  // Sin resultados la API no trae `query`.
  if (data.query == null) return { rt: null, mc: null, lb: null };
  if (!Array.isArray(data.query.pages)) throw new Error("Invalid rating links response");
  const entities = {};
  for (const page of data.query.pages) {
    if (!/^Q\d+$/.test(page?.title || "")) continue;
    try {
      entities[page.title] = JSON.parse(page.revisions?.[0]?.slots?.main?.content);
    } catch { /* contenido ilegible: se ignora ese elemento */ }
  }
  return pickRatingLinks(entities, { type, tmdbId });
}
