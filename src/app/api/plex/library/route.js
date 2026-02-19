import { NextResponse } from "next/server";
import { getPlexAccessToken } from "@/lib/plex/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOLUTION_ORDER = [
  "8K",
  "4K",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "576p",
  "480p",
  "SD",
];

const DEFAULT_RESPONSE_LIMIT = 2000;
const MAX_RESPONSE_LIMIT = 10000;
const PLEX_PAGE_SIZE = 200;
const MAX_PLEX_PAGES = 200;

function isPrivateOrLocalHost(hostname) {
  if (!hostname) return false;
  const host = String(hostname).toLowerCase();
  if (host === "localhost") return true;
  if (host.endsWith(".local")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

function normalizeBaseUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const cleanPath =
      parsed.pathname && parsed.pathname !== "/"
        ? parsed.pathname.replace(/\/+$/, "")
        : "";
    return `${parsed.protocol}//${parsed.host}${cleanPath}`;
  } catch {
    return null;
  }
}

function resolvePlexBaseUrls() {
  const configuredUrls = [process.env.PLEX_URL, ...(process.env.PLEX_URLS || "").split(",")]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const rawCandidates = configuredUrls.length
    ? configuredUrls
    : ["http://localhost:32400"];
  const expandedCandidates = [];

  for (const raw of rawCandidates) {
    const normalized = normalizeBaseUrl(raw);
    if (!normalized) continue;

    expandedCandidates.push(normalized);

    try {
      const parsed = new URL(normalized);
      if (parsed.protocol === "https:" && isPrivateOrLocalHost(parsed.hostname)) {
        expandedCandidates.push(`http://${parsed.host}`);
      }
    } catch {
      // ignore invalid candidate
    }
  }

  return Array.from(new Set(expandedCandidates));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPlexJson({ baseUrl, path, token, timeoutMs = 8000 }) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${baseUrl}${path}${separator}X-Plex-Token=${encodeURIComponent(token)}`;
  const response = await fetchWithTimeout(
    url,
    { headers: { Accept: "application/json" } },
    timeoutMs,
  );

  if (!response.ok) {
    const err = new Error(`Plex request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }

  const json = await response.json().catch(() => null);
  if (!json) {
    throw new Error("Invalid Plex JSON response");
  }

  return json;
}

function safeParseInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchAllPlexMetadata({
  baseUrl,
  path,
  token,
  timeoutMs = 12000,
  pageSize = PLEX_PAGE_SIZE,
}) {
  const allItems = [];
  let start = 0;

  for (let page = 0; page < MAX_PLEX_PAGES; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const paginatedPath =
      `${path}${separator}X-Plex-Container-Start=${start}` +
      `&X-Plex-Container-Size=${pageSize}`;

    const json = await fetchPlexJson({
      baseUrl,
      path: paginatedPath,
      token,
      timeoutMs,
    });

    const container = json?.MediaContainer || {};
    const metadata = Array.isArray(container.Metadata) ? container.Metadata : [];
    if (!metadata.length) break;

    allItems.push(...metadata);

    const offset = safeParseInt(container.offset, start);
    const totalSize = safeParseInt(container.totalSize || container.size, 0);
    const nextStart = offset + metadata.length;

    const reachedEndByTotal = totalSize > 0 && nextStart >= totalSize;
    const reachedEndByShortPage = metadata.length < pageSize;
    const invalidProgress = nextStart <= start;

    if (reachedEndByTotal || reachedEndByShortPage || invalidProgress) break;
    start = nextStart;
  }

  return allItems;
}

function extractMachineIdentifier(raw) {
  if (!raw) return null;
  const text = String(raw);

  const jsonMatch = text.match(/"machineIdentifier"\s*:\s*"([^"]+)"/i);
  if (jsonMatch?.[1]) return jsonMatch[1];

  const xmlMatch = text.match(/machineIdentifier="([^"]+)"/i);
  if (xmlMatch?.[1]) return xmlMatch[1];

  return null;
}

async function getMachineIdentifier({ baseUrl, token }) {
  const paths = ["/identity", "/"];

  for (const path of paths) {
    const separator = path.includes("?") ? "&" : "?";
    const url = `${baseUrl}${path}${separator}X-Plex-Token=${encodeURIComponent(token)}`;
    try {
      const response = await fetchWithTimeout(
        url,
        { headers: { Accept: "application/json,application/xml,*/*" } },
        5000,
      );
      if (!response.ok) continue;

      const fromHeader = response.headers.get("x-plex-machine-identifier");
      if (fromHeader) return fromHeader;

      const text = await response.text();
      const fromBody = extractMachineIdentifier(text);
      if (fromBody) return fromBody;
    } catch {
      // continue with next path
    }
  }

  return process.env.PLEX_MACHINE_IDENTIFIER?.trim() || null;
}

function normalizeResolutionToken(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;

  if (raw.includes("8k")) return "8K";
  if (raw.includes("4k")) return "4K";
  if (raw === "sd") return "SD";

  const numeric = Number.parseInt(raw.replace(/p$/i, ""), 10);
  if (Number.isFinite(numeric)) {
    if (numeric >= 4320) return "8K";
    if (numeric >= 2160) return "4K";
    if (numeric >= 1440) return "1440p";
    if (numeric >= 1080) return "1080p";
    if (numeric >= 720) return "720p";
    if (numeric >= 576) return "576p";
    if (numeric >= 480) return "480p";
    return `${numeric}p`;
  }

  return raw.toUpperCase();
}

function resolutionFromSize({ width, height }) {
  const h = Number(height || 0);
  const w = Number(width || 0);
  const maxSide = Math.max(h, w);
  if (!maxSide) return null;

  if (maxSide >= 4320) return "8K";
  if (maxSide >= 2160) return "4K";
  if (maxSide >= 1440) return "1440p";
  if (maxSide >= 1080) return "1080p";
  if (maxSide >= 720) return "720p";
  if (maxSide >= 576) return "576p";
  if (maxSide >= 480) return "480p";
  return "SD";
}

function sortResolutions(values) {
  const orderMap = new Map(RESOLUTION_ORDER.map((value, idx) => [value, idx]));
  return [...values].sort((a, b) => {
    const ia = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "es", { sensitivity: "base" });
  });
}

function extractResolutionsFromMedia(mediaList) {
  const out = new Set();
  if (!Array.isArray(mediaList)) return [];

  for (const media of mediaList) {
    const fromToken = normalizeResolutionToken(media?.videoResolution);
    if (fromToken) out.add(fromToken);

    const fromSize = resolutionFromSize({
      width: media?.width,
      height: media?.height,
    });
    if (fromSize) out.add(fromSize);
  }

  return sortResolutions(out);
}

function collectGuidValues(item) {
  const values = [];
  const push = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    values.push(trimmed);
  };

  push(item?.guid);

  const guidCandidates = [item?.Guid, item?.guids];
  for (const candidate of guidCandidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string") {
          push(entry);
          continue;
        }
        push(entry?.id);
        push(entry?.guid);
      }
      continue;
    }

    if (candidate && typeof candidate === "object") {
      push(candidate?.id);
      push(candidate?.guid);
    }
  }

  return values;
}

function extractTmdbIdFromItem(item) {
  const guidValues = collectGuidValues(item);
  if (!guidValues.length) return null;

  const patterns = [
    /tmdb:\/\/(\d+)/i,
    /themoviedb:\/\/(\d+)/i,
    /themoviedb\.org\/(?:movie|tv)\/(\d+)/i,
    /com\.plexapp\.agents\.themoviedb:\/\/(\d+)/i,
  ];

  for (const value of guidValues) {
    for (const pattern of patterns) {
      const match = value.match(pattern);
      const id = Number.parseInt(match?.[1] || "", 10);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }

  return null;
}

function getMetadataKey(item) {
  if (!item) return null;
  if (item.ratingKey) return `/library/metadata/${item.ratingKey}`;
  if (!item.key) return null;
  return String(item.key).replace(/\/children$/i, "");
}

function buildPlexItemLinks({
  item,
  machineIdentifier,
  baseUrl,
  itemType,
}) {
  const metadataKey = getMetadataKey(item);
  if (!metadataKey) return { web: null, mobile: null };

  const encodedKey = encodeURIComponent(metadataKey);
  const metadataType = itemType === "movie" ? 1 : 2;

  const web = machineIdentifier
    ? `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${encodedKey}`
    : `${baseUrl}/web/index.html#!/details?key=${encodedKey}`;

  const mobile = machineIdentifier
    ? `plex://preplay/?metadataKey=${encodedKey}&metadataType=${metadataType}&server=${machineIdentifier}`
    : null;

  return { web, mobile };
}

function toPlainCountObject(countMap) {
  const out = {};
  for (const [key, value] of countMap.entries()) {
    out[key] = value;
  }
  return out;
}

function incrementCounts(countMap, key, delta = 1) {
  if (!key) return;
  countMap.set(key, (countMap.get(key) || 0) + delta);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionFilter = searchParams.get("section");
    const maxItemsParam = Number.parseInt(searchParams.get("limit") || "", 10);
    const maxItems =
      Number.isFinite(maxItemsParam) && maxItemsParam > 0
        ? Math.min(maxItemsParam, MAX_RESPONSE_LIMIT)
        : DEFAULT_RESPONSE_LIMIT;

    const plexToken = await getPlexAccessToken();
    if (!plexToken) {
      return NextResponse.json(
        {
          available: false,
          message:
            "Plex no configurado. Define PLEX_TOKEN o PLEX_JWT_PRIVATE_KEY.",
        },
        { status: 503 },
      );
    }

    const plexUrls = resolvePlexBaseUrls();
    if (!plexUrls.length) {
      return NextResponse.json(
        {
          available: false,
          message: "No hay URLs de Plex configuradas.",
        },
        { status: 503 },
      );
    }

    let activePlexUrl = null;
    let sectionsData = null;

    for (const baseUrl of plexUrls) {
      try {
        const json = await fetchPlexJson({
          baseUrl,
          path: "/library/sections",
          token: plexToken,
          timeoutMs: 8000,
        });
        sectionsData = json;
        activePlexUrl = baseUrl;
        break;
      } catch {
        // try next URL
      }
    }

    if (!activePlexUrl || !sectionsData) {
      return NextResponse.json(
        {
          available: false,
          message: "No se pudo conectar con el servidor Plex.",
        },
        { status: 503 },
      );
    }

    const machineIdentifier = await getMachineIdentifier({
      baseUrl: activePlexUrl,
      token: plexToken,
    });

    const sectionsRaw = Array.isArray(sectionsData?.MediaContainer?.Directory)
      ? sectionsData.MediaContainer.Directory
      : [];

    const sections = sectionsRaw
      .filter((section) => section?.type === "movie" || section?.type === "show")
      .filter((section) =>
        sectionFilter ? String(section.key) === String(sectionFilter) : true,
      )
      .map((section) => ({
        key: String(section.key),
        title: section.title || `Seccion ${section.key}`,
        type: section.type === "movie" ? "movie" : "show",
      }));

    const allItems = [];
    const globalResolutionCounts = new Map();
    const sectionSummaries = [];
    let moviesCount = 0;
    let showsCount = 0;

    for (const section of sections) {
      let rawItems = [];
      try {
        rawItems = await fetchAllPlexMetadata({
          baseUrl: activePlexUrl,
          path: `/library/sections/${encodeURIComponent(section.key)}/all`,
          token: plexToken,
          timeoutMs: 12000,
        });
      } catch {
        sectionSummaries.push({
          key: section.key,
          title: section.title,
          type: section.type,
          count: 0,
          resolutionCounts: {},
        });
        continue;
      }

      let showResolutionMap = new Map();
      if (section.type === "show") {
        try {
          const episodes = await fetchAllPlexMetadata({
            baseUrl: activePlexUrl,
            path: `/library/sections/${encodeURIComponent(section.key)}/allLeaves`,
            token: plexToken,
            timeoutMs: 20000,
          });

          showResolutionMap = new Map();
          for (const episode of episodes) {
            const showKey = String(
              episode?.grandparentRatingKey || episode?.parentRatingKey || "",
            );
            if (!showKey) continue;

            const episodeResolutions = extractResolutionsFromMedia(episode?.Media);
            if (!episodeResolutions.length) continue;

            const current = showResolutionMap.get(showKey) || new Set();
            for (const resolution of episodeResolutions) {
              current.add(resolution);
            }
            showResolutionMap.set(showKey, current);
          }
        } catch {
          // keep empty map
        }
      }

      const sectionResolutionCounts = new Map();
      let sectionCount = 0;

      for (const rawItem of rawItems) {
        const itemType = rawItem?.type === "movie" ? "movie" : "show";
        const ratingKey = String(rawItem?.ratingKey || "");
        if (!ratingKey) continue;

        const directResolutions = extractResolutionsFromMedia(rawItem?.Media);
        const inheritedResolutions =
          itemType === "show" && showResolutionMap.has(ratingKey)
            ? sortResolutions(showResolutionMap.get(ratingKey))
            : [];

        const resolutionSet = new Set([
          ...directResolutions,
          ...inheritedResolutions,
        ]);
        const resolutions = sortResolutions(resolutionSet);

        const links = buildPlexItemLinks({
          item: rawItem,
          machineIdentifier,
          baseUrl: activePlexUrl,
          itemType,
        });

        const thumbPath = rawItem?.thumb || rawItem?.grandparentThumb || null;
        const thumb = thumbPath
          ? `${activePlexUrl}${thumbPath}?X-Plex-Token=${encodeURIComponent(plexToken)}`
          : null;

        const artPath = rawItem?.art || rawItem?.grandparentArt || null;
        const art = artPath
          ? `${activePlexUrl}${artPath}?X-Plex-Token=${encodeURIComponent(plexToken)}`
          : null;

        const item = {
          id: `${section.key}:${ratingKey}`,
          ratingKey,
          type: itemType,
          tmdbType: itemType === "movie" ? "movie" : "tv",
          tmdbId: extractTmdbIdFromItem(rawItem),
          title: rawItem?.title || rawItem?.grandparentTitle || "Sin titulo",
          year: rawItem?.year || null,
          addedAt: Number(rawItem?.addedAt || 0),
          durationMs: Number(rawItem?.duration || 0),
          leafCount: Number(rawItem?.leafCount || 0),
          childCount: Number(rawItem?.childCount || 0),
          sectionKey: section.key,
          sectionTitle: section.title,
          thumb,
          art,
          resolutions,
          primaryResolution: resolutions[0] || null,
          links,
        };

        for (const resolution of resolutions) {
          incrementCounts(globalResolutionCounts, resolution, 1);
          incrementCounts(sectionResolutionCounts, resolution, 1);
        }

        if (itemType === "movie") moviesCount += 1;
        else showsCount += 1;

        sectionCount += 1;
        allItems.push(item);
      }

      sectionSummaries.push({
        key: section.key,
        title: section.title,
        type: section.type,
        count: sectionCount,
        resolutionCounts: toPlainCountObject(sectionResolutionCounts),
      });
    }

    const sortedItems = [...allItems].sort((a, b) => {
      const diff = (b.addedAt || 0) - (a.addedAt || 0);
      if (diff !== 0) return diff;
      return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    });

    const truncated = sortedItems.length > maxItems;
    const items = truncated ? sortedItems.slice(0, maxItems) : sortedItems;

    return NextResponse.json(
      {
        available: true,
        server: {
          baseUrl: activePlexUrl,
          machineIdentifier: machineIdentifier || null,
        },
        summary: {
          sectionsCount: sectionSummaries.length,
          totalItems: allItems.length,
          moviesCount,
          showsCount,
          resolutionCounts: toPlainCountObject(globalResolutionCounts),
          truncated,
          maxItems,
        },
        sections: sectionSummaries,
        items,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    console.error("Error in Plex library API:", error);
    return NextResponse.json(
      {
        available: false,
        error: "Failed to fetch Plex library",
      },
      { status: 500 },
    );
  }
}
