"use client";

import { useEffect, useState } from "react";

const EMPTY = { rt: null, mc: null };
const cache = new Map();
const pending = new Map();

function loadLinks(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.links);
  if (pending.has(key)) return pending.get(key);
  const request = fetch(`/api/links/ratings?${key}`, { signal: AbortSignal.timeout(12_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error("Rating links unavailable");
      const links = await response.json();
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { links, expires: Date.now() + (links.rt || links.mc ? 3600000 : 300000) });
      return links;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export default function useRatingLinks({ type, tmdbId, enabled = true }) {
  const key = enabled && (type === "movie" || type === "tv") && tmdbId
    ? new URLSearchParams({ type, tmdbId: String(tmdbId) }).toString()
    : null;
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    loadLinks(key).then(
      (links) => { if (active) setResolved({ key, links }); },
      () => { if (active) setResolved({ key, links: EMPTY }); },
    );
    return () => { active = false; };
  }, [key]);
  // Never show the previous title's links while the next request is pending.
  return key && resolved?.key === key ? resolved.links : EMPTY;
}
