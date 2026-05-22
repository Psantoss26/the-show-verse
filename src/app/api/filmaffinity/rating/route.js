import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = new Map();
const TTL = 1000 * 60 * 60 * 24;
const MAX_CANDIDATES = 8;

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL) {
    CACHE.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  CACHE.set(key, { ts: Date.now(), data });
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value = "") {
  return decodeHtml(String(value).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value = "") {
  return stripTags(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(the|a|an|el|la|los|las|un|una|unos|unas)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumber(value) {
  if (value == null) return null;
  const normalized = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

async function safeFetch(url) {
  return fetch(url, {
    redirect: "follow",
    cache: "no-store",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "es-ES,es;q=0.9,en;q=0.8",
    },
  });
}

function extractCandidateUrls(html) {
  const urls = [];
  const seen = new Set();
  const re =
    /href=["']([^"']*(?:\/(?:es|en|us)\/film\d+\.html\/?|\/film\d+\.html\/?|film\d+\.html\/?))["']/gi;
  let match;
  while ((match = re.exec(html)) && urls.length < MAX_CANDIDATES) {
    const href = decodeHtml(match[1]);
    const path = href.startsWith("film") ? `/es/${href}` : href;
    const url = path.startsWith("http")
      ? path
      : `https://www.filmaffinity.com${path.startsWith("/") ? "" : "/"}${path}`;
    const normalized = url.replace(/\/$/, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  }
  return urls;
}

function parseDetail(html, url) {
  const ratingMatch =
    html.match(/id=["']movie-rat-avg["'][^>]*content=["']([\d.,]+)["']/i) ||
    html.match(/id=["']movie-rat-avg["'][^>]*>([\s\S]*?)<\/div>/i);
  const rating = parseNumber(stripTags(ratingMatch?.[1] || ""));

  const votesMatch =
    html.match(/id=["']movie-count-rat["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
    html.match(/itemprop=["']ratingCount["'][^>]*content=["']([\d.,]+)["']/i);
  const votes = parseNumber(stripTags(votesMatch?.[1] || ""));

  const titleMatch =
    html.match(/<h1[^>]*id=["']main-title["'][^>]*>[\s\S]*?<span[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i) ||
    html.match(/<h1[^>]*id=["']main-title["'][^>]*>([\s\S]*?)<\/h1>/i);
  const title = stripTags(titleMatch?.[1] || "");

  const originalTitleMatch =
    html.match(/<dt>\s*(?:T[íi]tulo original|Original title)\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i) ||
    html.match(/<span[^>]*class=["'][^"']*original-title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const originalTitle = stripTags(originalTitleMatch?.[1] || "");

  const yearMatch =
    html.match(/<dt>\s*(?:A[ñn]o|Year)\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i) ||
    html.match(/itemprop=["']datePublished["'][^>]*content=["'](\d{4})/i);
  const year = Number(String(stripTags(yearMatch?.[1] || "")).match(/\d{4}/)?.[0]);

  const plain = stripTags(html).toLowerCase();
  const isTv =
    /\b(serie de tv|tv series|tv miniseries|miniserie de tv)\b/i.test(plain);

  if (rating == null && !title) return null;
  return {
    title,
    originalTitle,
    year: Number.isFinite(year) ? year : null,
    rating,
    votes: Number.isFinite(votes) ? votes : null,
    url,
    isTv,
  };
}

function scoreCandidate(candidate, wanted) {
  const wantedTitles = unique([wanted.title, wanted.originalTitle]).map(
    normalizeTitle,
  );
  const candidateTitles = unique([
    candidate.title,
    candidate.originalTitle,
  ]).map(normalizeTitle);

  let score = 0;
  for (const wantedTitle of wantedTitles) {
    if (!wantedTitle) continue;
    for (const candidateTitle of candidateTitles) {
      if (!candidateTitle) continue;
      if (candidateTitle === wantedTitle) score = Math.max(score, 90);
      else if (
        candidateTitle.includes(wantedTitle) ||
        wantedTitle.includes(candidateTitle)
      )
        score = Math.max(score, 60);
    }
  }

  // Strong bonus when candidate's originalTitle matches exactly — the most
  // reliable signal for international films with different localized titles
  // (e.g. "Inception" original title on a film listed as "Origen" in Spain)
  const wantedOrigNorm = normalizeTitle(wanted.originalTitle);
  const candidateOrigNorm = normalizeTitle(candidate.originalTitle);
  if (wantedOrigNorm && candidateOrigNorm && wantedOrigNorm === candidateOrigNorm) {
    score += 55;
  }

  const wantedYear = Number(wanted.year);
  if (wantedYear && candidate.year) {
    const delta = Math.abs(candidate.year - wantedYear);
    if (delta === 0) score += 45;
    else if (delta === 1) score += 10;
    else if (delta <= 3) score -= 15;
    else score -= Math.min(60, delta * 5);
  }

  if (wanted.type === "tv" && candidate.isTv) score += 15;
  if (wanted.type === "movie" && candidate.isTv) score -= 30;
  if (candidate.rating != null) score += 10;
  if (candidate.votes != null) score += Math.min(8, Math.log10(candidate.votes + 1));

  return score;
}

async function searchFilmAffinity({ title, originalTitle, year, type }) {
  const normTitle = normalizeTitle(title);
  const normOrig = normalizeTitle(originalTitle);
  const hasDistinctOriginal = !!(normOrig && normOrig !== normTitle);

  // FA's text search does not reliably filter by year in the query string —
  // e.g. "Inception 2010" may return no results because the Spanish title is "Origen".
  // Strategy:
  //   - When the original title differs (e.g. "Inception" ≠ "Origen"):
  //       1. Search by originalTitle alone — FA indexes original titles and often
  //          redirects directly to the correct film page.
  //       2. Search by localized title alone as a broader fallback.
  //   - When title == originalTitle (e.g. "Breaking Bad"):
  //       1. Try title + year — works well for common titles in the same language.
  //       2. Title alone as fallback.
  //   Year is used ONLY in scoring, never in the query string for distinct-original films.
  const rawQueries = hasDistinctOriginal
    ? [originalTitle, title]
    : unique([year ? `${title} ${year}` : title, title]);

  const queries = unique(rawQueries.filter(Boolean));

  const candidateUrls = [];
  const seen = new Set();

  for (const query of queries) {
    if (!query) continue;
    const url = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(query)}&stype=title`;
    const res = await safeFetch(url);
    if (!res.ok) continue;
    if (/\/film\d+\.html\/?$/i.test(res.url || "")) {
      // FA redirected straight to a film page — add it and skip HTML extraction
      // (the page body contains related-film links, not search results)
      const directUrl = res.url.replace(/\/$/, "");
      if (!seen.has(directUrl)) {
        seen.add(directUrl);
        candidateUrls.push(directUrl);
      }
      continue;
    }
    const html = await res.text();
    for (const candidateUrl of extractCandidateUrls(html)) {
      if (!seen.has(candidateUrl)) {
        seen.add(candidateUrl);
        candidateUrls.push(candidateUrl);
      }
      if (candidateUrls.length >= MAX_CANDIDATES) break;
    }
  }

  const candidates = (
    await Promise.all(
      candidateUrls.slice(0, MAX_CANDIDATES).map(async (candidateUrl) => {
        try {
          const res = await safeFetch(candidateUrl);
          if (!res.ok) return null;
          const html = await res.text();
          return parseDetail(html, candidateUrl);
        } catch {
          return null;
        }
      }),
    )
  ).filter(Boolean);

  if (!candidates.length) return null;

  const wanted = { title, originalTitle, year, type };
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(candidate, wanted),
    }))
    .sort((a, b) => b.score - a.score)[0];
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();
  const originalTitle = searchParams.get("originalTitle")?.trim();
  const year = searchParams.get("year")?.trim();
  const type = searchParams.get("type") === "tv" ? "tv" : "movie";

  if (!title && !originalTitle) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const key = JSON.stringify({ title, originalTitle, year, type });
  const hit = cacheGet(key);
  if (hit) return NextResponse.json(hit);

  try {
    const match = await searchFilmAffinity({
      title,
      originalTitle,
      year,
      type,
    });

    const payload =
      match?.rating != null
        ? {
            rating: match.rating,
            votes: match.votes,
            url: match.url,
            title: match.title,
            year: match.year,
          }
        : { rating: null, votes: null, url: null };

    cacheSet(key, payload);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    const payload = { rating: null, votes: null, url: null };
    cacheSet(key, payload);
    return NextResponse.json(payload);
  }
}
