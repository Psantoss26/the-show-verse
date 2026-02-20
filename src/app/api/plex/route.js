// src/app/api/plex/route.js
import { NextResponse } from "next/server";
import { getPlexAccessToken } from "@/lib/plex/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/plex
 *
 * Query params:
 * - title: string (required)
 * - type: 'movie' | 'tv' (required)
 * - year: number (optional)
 * - imdbId: string (optional, e.g. tt1234567)
 * - tmdbId: string|number (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title");
    const type = searchParams.get("type") || "movie";
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year"), 10)
      : null;

    const imdbId = searchParams.get("imdbId"); // e.g. tt1234567
    const tmdbId = searchParams.get("tmdbId"); // e.g. 550

    if (!title) {
      return NextResponse.json(
        { error: "Title parameter is required" },
        { status: 400 },
      );
    }

    if (!["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 },
      );
    }

    const configuredUrls = [
      process.env.PLEX_URL,
      ...(process.env.PLEX_URLS || "").split(","),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

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
        if (
          parsed.protocol === "https:" &&
          isPrivateOrLocalHost(parsed.hostname)
        ) {
          expandedCandidates.push(`http://${parsed.host}`);
        }
      } catch {
        // ignore invalid candidate
      }
    }

    const plexUrls = Array.from(new Set(expandedCandidates));
    const plexToken = await getPlexAccessToken();

    if (!plexToken) {
      console.warn(
        "Plex no configurado. Define PLEX_TOKEN (fallback) o PLEX_JWT_PRIVATE_KEY para refresh automatico.",
      );
      return NextResponse.json({
        available: false,
        plexUrl: null,
        message: "Plex no configurado",
      });
    }

    // Helper: intenta conseguir slug (para watch.plex.tv) vía metadata.provider.plex.tv
    async function getPlexSlug({ imdbId, tmdbId, type }) {
      const metadataType = type === "movie" ? 1 : 2; // 1 movie, 2 show
      const guid = imdbId
        ? `imdb://${imdbId}`
        : tmdbId
          ? `tmdb://${tmdbId}`
          : null;

      if (!guid) return null;

      const url = `https://metadata.provider.plex.tv/library/metadata/matches?guid=${encodeURIComponent(
        guid,
      )}&type=${metadataType}&X-Plex-Token=${encodeURIComponent(plexToken)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) return null;

      const data = await res.json();
      const slug = data?.MediaContainer?.Metadata?.[0]?.slug;
      return typeof slug === "string" && slug.trim() ? slug.trim() : null;
    }

    async function fetchWithTimeout(url, opts = {}, timeoutMs = 3000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, {
          ...opts,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    function extractMachineIdentifier(raw) {
      if (!raw) return null;
      const text = String(raw);

      // JSON: {"MediaContainer":{"machineIdentifier":"..."}}
      const jsonMatch = text.match(/"machineIdentifier"\s*:\s*"([^"]+)"/i);
      if (jsonMatch?.[1]) return jsonMatch[1];

      // XML: machineIdentifier="..."
      const xmlMatch = text.match(/machineIdentifier="([^"]+)"/i);
      if (xmlMatch?.[1]) return xmlMatch[1];

      return null;
    }

    async function getMachineIdentifier(baseUrl) {
      const paths = ["/identity", "/"];
      try {
        for (const path of paths) {
          const serverInfoUrl = `${baseUrl}${path}?X-Plex-Token=${plexToken}`;
          const serverInfoResponse = await fetchWithTimeout(serverInfoUrl, {
            headers: { Accept: "application/json,application/xml,*/*" },
          });

          if (!serverInfoResponse.ok) continue;

          const bodyText = await serverInfoResponse.text();
          const machineId = extractMachineIdentifier(bodyText);
          if (machineId) return machineId;
        }

        return null;
      } catch {
        return null;
      }
    }

    function pickBestMatch(data) {
      if (!data?.MediaContainer?.Metadata) return null;

      let bestMatch = null;
      for (const item of data.MediaContainer.Metadata) {
        const itemType =
          item.type === "movie" ? "movie" : item.type === "show" ? "tv" : null;
        if (itemType !== type) continue;

        const itemTitle = item.title?.toLowerCase();
        const searchTitle = title.toLowerCase();
        if (itemTitle !== searchTitle && !itemTitle?.includes(searchTitle)) {
          continue;
        }

        if (year && item.year && Math.abs(item.year - year) > 1) continue;

        if (imdbId) {
          const itemGuid = item.guid || "";
          if (
            itemGuid.includes("imdb://") &&
            itemGuid.includes(imdbId.replace("tt", ""))
          ) {
            return item;
          }
        }

        if (!bestMatch) bestMatch = item;
      }

      return bestMatch;
    }

    let matchedItem = null;
    let activePlexUrl = null;
    let machineIdentifier = null;

    for (const baseUrl of plexUrls) {
      const searchUrl = `${baseUrl}/search?query=${encodeURIComponent(
        title,
      )}&X-Plex-Token=${plexToken}`;

      try {
        const response = await fetchWithTimeout(searchUrl, {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          console.warn(`[Plex] Search failed on ${baseUrl}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const machineIdFromHeader =
          response.headers.get("x-plex-machine-identifier") || null;
        const machineIdFromContainer =
          data?.MediaContainer?.machineIdentifier || null;
        const candidate = pickBestMatch(data);
        if (!candidate) continue;

        matchedItem = candidate;
        activePlexUrl = baseUrl;
        machineIdentifier =
          machineIdFromHeader ||
          machineIdFromContainer ||
          candidate?.machineIdentifier ||
          (await getMachineIdentifier(baseUrl));
        break;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[Plex] Search error on ${baseUrl}: ${msg}`);
      }
    }

    if (!matchedItem) {
      return NextResponse.json({
        available: false,
        plexUrl: null,
      });
    }

    if (!activePlexUrl) {
      activePlexUrl = plexUrls[0];
    }

    try {
      const serverMachineId =
        machineIdentifier ||
        matchedItem.machineIdentifier ||
        process.env.PLEX_MACHINE_IDENTIFIER?.trim() ||
        null;

      // metadata key base
      let metadataKey = matchedItem?.ratingKey
        ? `/library/metadata/${matchedItem.ratingKey}`
        : matchedItem?.key || null;

      if (!metadataKey) {
        return NextResponse.json({
          available: false,
          plexUrl: null,
        });
      }

      // Si es serie y viene /children, limpiar para abrir ficha de la serie
      if (type === "tv" && metadataKey.endsWith("/children")) {
        metadataKey = metadataKey.replace("/children", "");
      }

      const encodedKey = encodeURIComponent(metadataKey);
      const encodedServerMachineId = serverMachineId
        ? encodeURIComponent(serverMachineId)
        : null;

      // Web (desktop)
      const plexWebUrl = serverMachineId
        ? `https://app.plex.tv/desktop/#!/server/${serverMachineId}/details?key=${encodedKey}`
        : `${activePlexUrl}/web/index.html#!/details?key=${encodedKey}`;

      // Deep link principal para app móvil (iOS/Android).
      const plexMobileUrl = serverMachineId
        ? `plex://preplay?metadataKey=${encodedKey}&server=${encodedServerMachineId}`
        : null;

      // Fallback legacy para clientes antiguos.
      const metadataType = type === "movie" ? 1 : 2;
      const plexMobileLegacyUrl = serverMachineId
        ? `plex://preplay/?metadataKey=${encodedKey}&metadataType=${metadataType}&server=${encodedServerMachineId}`
        : null;

      // Intent explícito para Android (mejor compatibilidad en algunos navegadores).
      const plexAndroidIntentUrl = serverMachineId
        ? `intent://preplay?metadataKey=${encodedKey}&server=${encodedServerMachineId}#Intent;scheme=plex;package=com.plexapp.android;end`
        : null;

      // Android universal link (watch.plex.tv)
      let plexUniversalUrl = null;
      try {
        const slug = await getPlexSlug({
          imdbId,
          tmdbId,
          type,
        });

        if (slug) {
          plexUniversalUrl =
            type === "movie"
              ? `https://watch.plex.tv/movie/${slug}`
              : `https://watch.plex.tv/show/${slug}`;
        }
      } catch (e) {
        console.warn("[Plex] Could not resolve watch.plex.tv slug:", e);
      }

      return NextResponse.json(
        {
          available: true,
          plexUrl: plexWebUrl,
          plexMobileUrl,
          plexMobileLegacyUrl,
          plexAndroidIntentUrl,
          plexUniversalUrl, // <- NUEVO (Android)
          title: matchedItem.title,
          year: matchedItem.year,
          ratingKey: matchedItem.ratingKey,
          thumb: matchedItem.thumb
            ? `${activePlexUrl}${matchedItem.thumb}?X-Plex-Token=${plexToken}`
            : null,
        },
        {
          status: 200,
          headers: {
            "Cache-Control":
              "public, s-maxage=3600, stale-while-revalidate=7200",
          },
        },
      );
    } catch {
      // Silently fail - Plex not available or timeout
      return NextResponse.json({
        available: false,
        plexUrl: null,
      });
    }
  } catch (error) {
    console.error("Error in Plex API:", error);
    return NextResponse.json(
      {
        error: "Failed to check Plex availability",
        available: false,
        plexUrl: null,
      },
      { status: 500 },
    );
  }
}
