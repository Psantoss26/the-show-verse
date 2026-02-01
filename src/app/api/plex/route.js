// src/app/api/plex/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title");
    const type = searchParams.get("type") || "movie";
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year"), 10)
      : null;
    const imdbId = searchParams.get("imdbId");

    if (!title) {
      return NextResponse.json(
        { error: "Title parameter is required" },
        { status: 400 }
      );
    }

    if (!["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 }
      );
    }

    const PLEX_URL = process.env.PLEX_URL || "http://localhost:32400";
    const PLEX_TOKEN = process.env.PLEX_TOKEN || "";

    if (!PLEX_TOKEN) {
      console.warn("PLEX_TOKEN no configurado.");
      return NextResponse.json({
        available: false,
        plexUrl: null,
        message: "Plex no configurado",
      });
    }

    // 1) machineIdentifier fiable desde /identity
    // (machineIdentifier es el ID usado en URLs tipo /server/<id>/...) :contentReference[oaicite:1]{index=1}
    let machineIdentifier = null;
    try {
      const identityUrl = `${PLEX_URL}/identity?X-Plex-Token=${encodeURIComponent(
        PLEX_TOKEN
      )}`;
      const identityRes = await fetch(identityUrl, {
        headers: { Accept: "application/xml,text/xml,*/*" },
      });

      if (identityRes.ok) {
        const xml = await identityRes.text();
        const m = xml.match(/machineIdentifier="([^"]+)"/);
        if (m?.[1]) machineIdentifier = m[1];
      }
    } catch (err) {
      console.warn("Could not fetch server machine identifier:", err);
    }

    // 2) Buscar en Plex
    const searchUrl = `${PLEX_URL}/search?query=${encodeURIComponent(
      title
    )}&X-Plex-Token=${encodeURIComponent(PLEX_TOKEN)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error(`Plex API error: ${response.status}`);

      const data = await response.json();

      let matchedItem = null;

      if (data.MediaContainer?.Metadata) {
        for (const item of data.MediaContainer.Metadata) {
          const itemType =
            item.type === "movie" ? "movie" : item.type === "show" ? "tv" : null;
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

      if (matchedItem) {
        const serverMachineId = machineIdentifier || matchedItem.machineIdentifier;

        // metadataKey base (sin /children)
        let metadataKey =
          matchedItem.key || `/library/metadata/${matchedItem.ratingKey}`;
        if (type === "tv" && metadataKey.endsWith("/children")) {
          metadataKey = metadataKey.replace("/children", "");
        }

        // Web: aquí SÍ conviene encodeURIComponent
        const encodedKeyForWeb = encodeURIComponent(metadataKey);
        const plexWebUrl = `https://app.plex.tv/desktop/#!/server/${serverMachineId}/details?key=${encodedKeyForWeb}`;

        // Mobile deep links:
        // OJO: NO encodear metadataKey en plex://... (Plex móvil suele fallar y cae a Home)
        // y para preplay añade metadataType (1=movie, 2=show). :contentReference[oaicite:2]{index=2}
        const metadataType = type === "movie" ? 1 : 2;

        const plexMobileUrl = `plex://preplay/?metadataKey=${metadataKey}&metadataType=${metadataType}&server=${serverMachineId}`;
        const plexMobilePlayUrl = `plex://play/?metadataKey=${metadataKey}&server=${serverMachineId}`;

        return NextResponse.json(
          {
            available: true,
            plexUrl: plexWebUrl,
            plexMobileUrl,
            plexMobilePlayUrl,
            title: matchedItem.title,
            year: matchedItem.year,
            ratingKey: matchedItem.ratingKey,
            thumb: matchedItem.thumb
              ? `${PLEX_URL}${matchedItem.thumb}?X-Plex-Token=${encodeURIComponent(
                  PLEX_TOKEN
                )}`
              : null,
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
            },
          }
        );
      }

      return NextResponse.json({ available: false, plexUrl: null });
    } catch (plexError) {
      console.error("Error connecting to Plex:", plexError);
      return NextResponse.json({
        available: false,
        plexUrl: null,
        error: "No se pudo conectar con Plex",
      });
    }
  } catch (error) {
    console.error("Error in Plex API:", error);
    return NextResponse.json(
      { error: "Failed to check Plex availability", available: false, plexUrl: null },
      { status: 500 }
    );
  }
}