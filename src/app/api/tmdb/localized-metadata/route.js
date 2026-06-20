import { NextResponse } from "next/server";

import {
  getTmdbIncludeImageLanguage,
  normalizeLocale,
  pickBestImageByLocale,
} from "@/lib/localization";

const TMDB = "https://api.themoviedb.org/3";
const API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const MAX_ITEMS = 120;
const CONCURRENCY = 8;

function safeType(type) {
  if (type === "movie") return "movie";
  if (type === "tv" || type === "show") return "tv";
  return null;
}

function itemKey(type, id) {
  return `${type}:${id}`;
}

function yearFromDate(date) {
  return date ? String(date).slice(0, 4) : null;
}

async function fetchLocalizedItem({ type, id, locale }) {
  if (!API_KEY || !type || !id) return null;

  const url = new URL(`${TMDB}/${type}/${encodeURIComponent(id)}`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", locale);
  url.searchParams.set("append_to_response", "images");
  url.searchParams.set("include_image_language", getTmdbIncludeImageLanguage(locale));

  const res = await fetch(url, {
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data) return null;

  const isMovie = type === "movie";
  const releaseDate = isMovie ? data.release_date || null : null;
  const firstAirDate = isMovie ? null : data.first_air_date || null;
  const genres = Array.isArray(data.genres) ? data.genres : [];
  const genreIds = genres.map((genre) => genre?.id).filter(Boolean);
  const poster =
    pickBestImageByLocale(data.images?.posters, {
      locale,
      kind: "poster",
    })?.file_path || data.poster_path || null;
  const backdrop =
    pickBestImageByLocale(data.images?.backdrops, {
      locale,
      kind: "backdrop",
      minWidth: 1200,
    })?.file_path || data.backdrop_path || null;

  return {
    key: itemKey(type, id),
    media_type: type,
    id: Number(id),
    title: isMovie
      ? data.title || data.original_title || null
      : data.name || data.original_name || null,
    name: isMovie
      ? data.title || data.original_title || null
      : data.name || data.original_name || null,
    overview: data.overview || null,
    poster_path: poster,
    backdrop_path: backdrop,
    release_date: releaseDate,
    first_air_date: firstAirDate,
    year: yearFromDate(releaseDate || firstAirDate),
    genre_ids: genreIds,
    genres,
    vote_average: data.vote_average ?? null,
  };
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const locale = normalizeLocale(body?.language || body?.locale);
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const unique = [];
  const seen = new Set();

  for (const item of rawItems) {
    const type = safeType(item?.type || item?.media_type || item?.mediaType);
    const id = Number(item?.id || item?.tmdbId || item?.tmdb_id);
    if (!type || !Number.isFinite(id) || id <= 0) continue;
    const key = itemKey(type, id);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ type, id });
    if (unique.length >= MAX_ITEMS) break;
  }

  const results = {};
  let cursor = 0;
  const workerCount = Math.min(CONCURRENCY, unique.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < unique.length) {
        const current = unique[cursor];
        cursor += 1;
        const localized = await fetchLocalizedItem({
          ...current,
          locale,
        }).catch(() => null);
        if (localized?.key) results[localized.key] = localized;
      }
    }),
  );

  return NextResponse.json({ locale, results });
}
