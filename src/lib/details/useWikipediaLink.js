"use client";

import { useEffect, useMemo, useState } from "react";
import { appendWikipediaLink } from "./titleExternalLinks.js";

// Artículo de Wikipedia de un título (ver /api/links/wikipedia). Se recuerda
// por título durante la sesión: volver a una ficha no repite la consulta.
const resolved = new Map();
const pending = new Map();

function wikipediaKey({ wikidataId, imdbId, type, tmdbId }) {
  if (wikidataId) return wikidataId;
  if (imdbId) return imdbId;
  const id = Number(tmdbId);
  return Number.isInteger(id) && id > 0 ? `${type === "tv" ? "tv" : "movie"}:${id}` : null;
}

function fetchWikipediaUrl(key, { wikidataId, imdbId, type, tmdbId }) {
  if (!pending.has(key)) {
    const qs = new URLSearchParams();
    if (wikidataId) qs.set("wikidata", wikidataId);
    if (imdbId) qs.set("imdb", imdbId);
    if (tmdbId) qs.set("tmdb", String(tmdbId));
    qs.set("type", type === "tv" ? "tv" : "movie");
    const request = fetch(`/api/links/wikipedia?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const url = typeof json?.url === "string" ? json.url : null;
        resolved.set(key, url);
        return url;
      })
      .catch(() => null)
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return pending.get(key);
}

/** URL del artículo (español o, si no, inglés) o null mientras no se sepa / si no hay. */
export default function useWikipediaLink({ wikidataId = null, imdbId = null, type = "movie", tmdbId = null } = {}) {
  const key = wikipediaKey({ wikidataId, imdbId, type, tmdbId });
  const [state, setState] = useState(() => ({ key, url: key ? resolved.get(key) ?? null : null }));

  useEffect(() => {
    if (!key) return undefined;
    if (resolved.has(key)) {
      setState({ key, url: resolved.get(key) });
      return undefined;
    }
    let alive = true;
    fetchWikipediaUrl(key, { wikidataId, imdbId, type, tmdbId }).then((url) => {
      if (alive) setState({ key, url });
    });
    return () => {
      alive = false;
    };
  }, [key, wikidataId, imdbId, type, tmdbId]);

  return state.key === key ? state.url : null;
}

/**
 * Los enlaces con Wikipedia al final cuando se resuelve. Lo usan los que PINTAN
 * los enlaces (ExternalLinksModal, el marcador) y no la ficha: la respuesta
 * llega a mitad de la entrada y volver a pintar DetailsClient entero la
 * dejaba a tirones. `query` null = sin Wikipedia.
 */
export function useLinksWithWikipedia(links, query) {
  const url = useWikipediaLink(query || {});
  return useMemo(() => appendWikipediaLink(links, url), [links, url]);
}
