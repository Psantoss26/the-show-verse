import { json } from "@/app/api/tmdb/utils";

const TMDB_WEB_BASE = "https://www.themoviedb.org";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const g = globalThis;
g.__tmdbAwardsCache = g.__tmdbAwardsCache || new Map();
g.__tmdbAwardsInflight = g.__tmdbAwardsInflight || new Map();

const cache = g.__tmdbAwardsCache;
const inflight = g.__tmdbAwardsInflight;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absolutizeTmdbWebUrl(value) {
  const src = decodeHtml(value || "").trim();
  if (!src) return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/")) return `${TMDB_WEB_BASE}${src}`;
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

function useOriginalTmdbImageSize(value) {
  const url = absolutizeTmdbWebUrl(value);
  if (!url) return null;
  return url.replace(/\/t\/p\/[^/]+\//, "/t/p/original/");
}

function extractImageUrl(html) {
  const matches = [
    ...String(html || "").matchAll(
      /<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi,
    ),
  ];
  if (!matches.length) return null;

  const preferred = matches.find((match) => {
    const tag = match[0].toLowerCase();
    const src = String(match[1] || "").toLowerCase();
    return (
      !tag.includes("avatar") &&
      !tag.includes("profile") &&
      !src.includes("gravatar")
    );
  });

  return useOriginalTmdbImageSize(preferred?.[1] || matches[0]?.[1]);
}

function normalizeResult(result) {
  if (result === "Winner") return "winner";
  if (result === "Nominee") return "nominee";
  return "unknown";
}

function buildSummary(wins, nominations, itemCount) {
  if (wins || nominations) {
    if (!wins) {
      return `${nominations} ${
        nominations === 1 ? "nominacion" : "nominaciones"
      }`;
    }
    if (!nominations) {
      return `${wins} ${wins === 1 ? "premio" : "premios"}`;
    }
    const winPart = `${wins} ${wins === 1 ? "premio" : "premios"}`;
    const nominationPart = `${nominations} ${
      nominations === 1 ? "nominacion" : "nominaciones"
    }`;
    return `${winPart} y ${nominationPart}`;
  }

  if (itemCount) {
    return `${itemCount} ${
      itemCount === 1 ? "reconocimiento" : "reconocimientos"
    } registrados en TMDb`;
  }

  return null;
}

function parseAwardsHtml(html) {
  const summaryText = stripHtml(html);
  const nominationFirst = summaryText.match(
    /\b(\d+)\s+Nominations?,\s+(\d+)\s+Wins?\b/i,
  );
  const winFirst = summaryText.match(
    /\b(\d+)\s+Wins?,\s+(\d+)\s+Nominations?\b/i,
  );
  const nominationOnly = summaryText.match(/\b(\d+)\s+Nominations?\b/i);
  const winOnly = summaryText.match(/\b(\d+)\s+Wins?\b/i);
  const wins = nominationFirst
    ? Number(nominationFirst[2])
    : winFirst
      ? Number(winFirst[1])
      : winOnly
        ? Number(winOnly[1])
        : 0;
  const nominations = nominationFirst
    ? Number(nominationFirst[1])
    : winFirst
      ? Number(winFirst[2])
      : nominationOnly
        ? Number(nominationOnly[1])
        : 0;

  const awardsStart = html.indexOf('<div class="space-y-12">');
  const awardsEnd =
    awardsStart >= 0 ? html.indexOf("</section>", awardsStart) : -1;
  const awardsHtml =
    awardsStart >= 0 && awardsEnd > awardsStart
      ? html.slice(awardsStart, awardsEnd)
      : html;

  const groups = [];

  const groupHeaderRe =
    /<div class="font-semibold leading-9 text-xl">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>\s*<\/div>/g;
  const headers = [...awardsHtml.matchAll(groupHeaderRe)];

  headers.forEach((header, index) => {
    const groupName = stripHtml(header[1]);
    if (!groupName) return;

    const nextHeader = headers[index + 1];
    const groupHtml = awardsHtml.slice(
      header.index + header[0].length,
      nextHeader?.index ?? awardsHtml.length,
    );
    const groupIntroHtml = awardsHtml.slice(
      Math.max(0, header.index - 1200),
      header.index + header[0].length,
    );

    const group = {
      name: groupName,
      imageUrl: extractImageUrl(groupIntroHtml),
      wins: 0,
      nominations: 0,
      items: [],
    };

    const rowRe =
      /<div id="[^"]+"\s+class="flex flex-row p-3 sm:p-6">([\s\S]*?)(?=<div id="[^"]+"\s+class="flex flex-row p-3 sm:p-6">|$)/g;
    const rows = [...groupHtml.matchAll(rowRe)];

    rows.forEach((rowMatch) => {
      const row = rowMatch[1];
      const eventMatch = row.match(
        /<a[^>]*href="\/award\/[^"]+\/ceremony\/[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/,
      );
      const resultMatch = row.match(
        /<span[^>]*>\s*(Winner|Nominee)\s*<\/span>\s*<a[^>]*href="\/award\/[^"]+\/category\/[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/,
      );
      const yearMatch = row.match(
        /<p class="md:text-right font-bold">\s*(\d{4})\s*<\/p>/,
      );

      if (!resultMatch) return;

      const people = [...row.matchAll(/<a class="font-light!\s*text-black!"[^>]*>\s*([\s\S]*?)\s*<\/a>/g)]
        .map((match) => stripHtml(match[1]))
        .filter(Boolean);
      const result = normalizeResult(stripHtml(resultMatch[1]));

      group.items.push({
        category: stripHtml(resultMatch[2]),
        people,
        awardType: null,
        result,
        resultText: stripHtml(resultMatch[1]),
        year: yearMatch?.[1] || null,
        event: eventMatch ? stripHtml(eventMatch[1]) : null,
      });

      if (result === "winner") group.wins += 1;
      if (result === "nominee") group.nominations += 1;
    });

    if (group.items.length) {
      groups.push(group);
    }
  });

  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const computedWins = wins || groups.reduce((sum, group) => sum + group.wins, 0);
  const computedNominations =
    nominations || groups.reduce((sum, group) => sum + group.nominations, 0);

  return {
    wins: computedWins,
    nominations: computedNominations,
    total: itemCount,
    summary: buildSummary(computedWins, computedNominations, itemCount),
    groups,
    hasAwards: itemCount > 0 || computedWins > 0 || computedNominations > 0,
  };
}

async function fetchAwards(type, id) {
  const cacheKey = `v3:${type}:${id}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.t < CACHE_TTL_MS) return cached.data;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const promise = (async () => {
    const url = `${TMDB_WEB_BASE}/${type}/${encodeURIComponent(
      id,
    )}/awards?language=en-US`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "TheShowVerse/1.0 (+https://www.themoviedb.org)",
      },
    });

    if (res.status === 404) {
      return {
        wins: 0,
        nominations: 0,
        total: 0,
        summary: null,
        groups: [],
        hasAwards: false,
      };
    }

    if (!res.ok) {
      throw new Error(`TMDb awards page failed with ${res.status}`);
    }

    const html = await res.text();
    const parsed = parseAwardsHtml(html);
    const data = {
      source: "tmdb",
      sourceUrl: url,
      type,
      id: String(id),
      ...parsed,
    };
    cache.set(cacheKey, { t: now, data });
    return data;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, promise);
  return promise;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") === "tv" ? "tv" : "movie";
    const id = searchParams.get("id");

    if (!id || !/^\d+$/.test(id)) {
      return json({ error: "Missing or invalid TMDb id" }, 400);
    }

    const data = await fetchAwards(type, id);
    return json(data);
  } catch (e) {
    console.error("[TMDb awards] failed", e);
    return json(
      {
        source: "tmdb",
        wins: 0,
        nominations: 0,
        total: 0,
        summary: null,
        groups: [],
        hasAwards: false,
        error: "TMDb awards unavailable",
      },
      502,
    );
  }
}
