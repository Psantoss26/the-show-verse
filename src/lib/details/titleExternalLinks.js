// Enlaces de un título que salen de sus ids externos de TMDb (`external_ids`)
// y de los propios ids: Instagram oficial, IMDb, TMDb, Trakt y Wikipedia. Se
// suman a los que ya montaba cada ficha (web oficial, JustWatch, Letterboxd,
// SeriesGraph, FilmAffinity). Facebook y X/Twitter se ignoran a propósito.
//
// Mismo formato de enlace que el resto: { id, label, title, icon, href }.

const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const IMDB_ID = /^tt\d{5,10}$/;
const WIKIDATA_ID = /^Q\d+$/;

// `key` además de `id`: el marcador (DetailsScoreboardPanel) usa `key`.
function link(id, label, icon, href) {
  return { id, key: id, label, title: label, icon, href };
}

/** Ids útiles de `external_ids` de TMDb (lo demás, fuera). */
export function pickExternalIds(externalIds) {
  const instagram = String(externalIds?.instagram_id || "").trim().replace(/^@/, "");
  const imdb = String(externalIds?.imdb_id || "").trim();
  const wikidata = String(externalIds?.wikidata_id || "").trim();
  return {
    instagramId: INSTAGRAM_HANDLE.test(instagram) ? instagram : null,
    imdbId: IMDB_ID.test(imdb) ? imdb : null,
    wikidataId: WIKIDATA_ID.test(wikidata) ? wikidata : null,
  };
}

export function instagramLink(instagramId) {
  const handle = String(instagramId || "").trim().replace(/^@/, "");
  if (!INSTAGRAM_HANDLE.test(handle)) return null;
  return link("ig", "Instagram", "/instagram.png", `https://www.instagram.com/${handle}/`);
}

/**
 * IMDb, TMDb, Trakt y Wikipedia de una película o serie. Trakt abre por el id
 * de TMDb (su búsqueda redirige a la ficha). Wikipedia solo si ya se resolvió
 * el artículo (ver /api/links/wikipedia).
 */
export function referenceLinks({ type, tmdbId, imdbId, wikipediaUrl }) {
  const mediaType = type === "tv" ? "tv" : "movie";
  const id = Number(tmdbId);
  const validTmdb = Number.isInteger(id) && id > 0;
  const items = [];
  if (IMDB_ID.test(String(imdbId || ""))) {
    items.push(link("imdb", "IMDb", "/logo-IMDb.png", `https://www.imdb.com/title/${imdbId}/`));
  }
  if (validTmdb) {
    items.push(link("tmdb", "TMDb", "/logo-TMDb.png", `https://www.themoviedb.org/${mediaType}/${id}`));
    items.push(
      link(
        "trakt",
        "Trakt",
        "/logo-Trakt.png",
        `https://trakt.tv/search/tmdb/${id}?id_type=${mediaType === "tv" ? "show" : "movie"}`,
      ),
    );
  }
  const wiki = wikipediaLink(wikipediaUrl);
  if (wiki) items.push(wiki);
  return items;
}

/** Enlace a un artículo de Wikipedia (solo URLs de wikipedia.org). */
export function wikipediaLink(url) {
  if (typeof url !== "string" || !/^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\//.test(url)) return null;
  return link("wiki", "Wikipedia", "/wikipedia.png", url);
}

/** Añade Wikipedia al final si se resolvió y no estaba ya. */
export function appendWikipediaLink(links, url) {
  const base = Array.isArray(links) ? links : [];
  const wiki = wikipediaLink(url);
  if (!wiki || base.some((item) => (item?.id ?? item?.key) === "wiki")) return base;
  return [...base, wiki];
}

/**
 * Une los enlaces de la ficha con los nuevos: Instagram junto a la web oficial
 * (los dos son del propio título) y las referencias al final. Sin duplicados
 * por id.
 */
export function withTitleExternalLinks(baseLinks, { instagramId, ...reference } = {}) {
  const base = Array.isArray(baseLinks) ? baseLinks : [];
  const instagram = instagramLink(instagramId);
  const result = [];
  const webIndex = base.findIndex((item) => item?.id === "web");
  base.forEach((item, index) => {
    result.push(item);
    if (index === webIndex && instagram) result.push(instagram);
  });
  if (webIndex < 0 && instagram) result.unshift(instagram);
  const seen = new Set(result.map((item) => item?.id));
  for (const item of referenceLinks(reference)) {
    if (!seen.has(item.id)) result.push(item);
  }
  return result;
}

/**
 * URL del artículo de una entidad de Wikidata (respuesta de wbgetentities con
 * sitelinks/urls): la de la Wikipedia en español y, si no hay, la inglesa.
 */
export function pickWikipediaUrl(entity) {
  const sitelinks = entity?.sitelinks || {};
  for (const site of ["eswiki", "enwiki"]) {
    const url = sitelinks[site]?.url;
    if (typeof url === "string" && url.startsWith("https://")) return url;
  }
  return null;
}
