// src/app/api/plex/route.js
import { NextResponse } from "next/server";

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

    const PLEX_URL = process.env.PLEX_URL || "http://localhost:32400";
    const PLEX_TOKEN = process.env.PLEX_TOKEN || "";

    if (!PLEX_TOKEN) {
      console.warn(
        "PLEX_TOKEN no configurado. Configura la variable de entorno PLEX_TOKEN.",
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
      )}&type=${metadataType}&X-Plex-Token=${encodeURIComponent(PLEX_TOKEN)}`;

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

    // machineIdentifier del servidor (para URLs tipo app.plex.tv)
    let machineIdentifier = null;
    try {
      const serverInfoUrl = `${PLEX_URL}/?X-Plex-Token=${PLEX_TOKEN}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const serverInfoResponse = await fetch(serverInfoUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (serverInfoResponse.ok) {
        const serverData = await serverInfoResponse.json();
        machineIdentifier =
          serverData?.MediaContainer?.machineIdentifier ?? null;
      }
    } catch (err) {
      // Silently fail - Plex not available
    }

    // Buscar en Plex
    const searchUrl = `${PLEX_URL}/search?query=${encodeURIComponent(
      title,
    )}&X-Plex-Token=${PLEX_TOKEN}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const data = await response.json();

      let matchedItem = null;

      if (data.MediaContainer?.Metadata) {
        for (const item of data.MediaContainer.Metadata) {
          const itemType =
            item.type === "movie"
              ? "movie"
              : item.type === "show"
                ? "tv"
                : null;
          if (itemType !== type) continue;

          const itemTitle = item.title?.toLowerCase();
          const searchTitle = title.toLowerCase();
          if (itemTitle !== searchTitle && !itemTitle?.includes(searchTitle))
            continue;

          if (year && item.year && Math.abs(item.year - year) > 1) continue;

          if (imdbId) {
            const itemGuid = item.guid || "";
            if (
              itemGuid.includes("imdb://") &&
              itemGuid.includes(imdbId.replace("tt", ""))
            ) {
              matchedItem = item;
              break;
            }
          }

          if (!matchedItem) matchedItem = item;
        }
      }

      if (!matchedItem) {
        return NextResponse.json({ available: false, plexUrl: null });
      }

      const serverMachineId =
        machineIdentifier || matchedItem.machineIdentifier;

      // metadata key base
      let metadataKey =
        matchedItem.key || `/library/metadata/${matchedItem.ratingKey}`;

      // Si es serie y viene /children, limpiar para abrir ficha de la serie
      if (type === "tv" && metadataKey.endsWith("/children")) {
        metadataKey = metadataKey.replace("/children", "");
      }

      const encodedKey = encodeURIComponent(metadataKey);

      // Web (desktop)
      const plexWebUrl = `https://app.plex.tv/desktop/#!/server/${serverMachineId}/details?key=${encodedKey}`;

      // iOS deep link (preplay). Añadimos metadataType para máxima compatibilidad.
      const metadataType = type === "movie" ? 1 : 2;
      const plexMobileUrl = `plex://preplay/?metadataKey=${encodedKey}&metadataType=${metadataType}&server=${serverMachineId}`;

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
          plexUniversalUrl, // <- NUEVO (Android)
          title: matchedItem.title,
          year: matchedItem.year,
          ratingKey: matchedItem.ratingKey,
          thumb: matchedItem.thumb
            ? `${PLEX_URL}${matchedItem.thumb}?X-Plex-Token=${PLEX_TOKEN}`
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
    } catch (plexError) {
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
