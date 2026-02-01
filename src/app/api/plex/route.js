// src/app/api/plex/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/plex
 *
 * Verifica si una película o serie está disponible en tu servidor Plex local
 *
 * Query params:
 * - title: Título de la película o serie (requerido)
 * - type: 'movie' o 'tv' (requerido)
 * - year: Año de lanzamiento (opcional)
 * - imdbId: ID de IMDB (opcional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title");
    const type = searchParams.get("type") || "movie";
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year"))
      : null;
    const imdbId = searchParams.get("imdbId");

    // Validación
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

    // Configuración de Plex - Puedes poner estos valores en variables de entorno
    const PLEX_URL =
      process.env.PLEX_URL || "http://localhost:32400"; // URL de tu servidor Plex
    const PLEX_TOKEN = process.env.PLEX_TOKEN || ""; // Token de autenticación de Plex

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

    // Primero obtener el machineIdentifier del servidor
    let machineIdentifier = null;
    try {
      const serverInfoUrl = `${PLEX_URL}/?X-Plex-Token=${PLEX_TOKEN}`;
      const serverInfoResponse = await fetch(serverInfoUrl, {
        headers: {
          Accept: "application/json",
        },
      });
      
      if (serverInfoResponse.ok) {
        const serverData = await serverInfoResponse.json();
        machineIdentifier = serverData?.MediaContainer?.machineIdentifier;
      }
    } catch (err) {
      console.warn("Could not fetch server machine identifier:", err);
    }

    // Buscar en Plex
    const searchUrl = `${PLEX_URL}/search?query=${encodeURIComponent(title)}&X-Plex-Token=${PLEX_TOKEN}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const data = await response.json();

      // Buscar coincidencia en los resultados
      let matchedItem = null;

      if (data.MediaContainer?.Metadata) {
        for (const item of data.MediaContainer.Metadata) {
          // Verificar tipo (movie/show)
          const itemType =
            item.type === "movie" ? "movie" : item.type === "show" ? "tv" : null;
          if (itemType !== type) continue;

          // Verificar título
          const itemTitle = item.title?.toLowerCase();
          const searchTitle = title.toLowerCase();
          if (itemTitle !== searchTitle && !itemTitle?.includes(searchTitle))
            continue;

          // Verificar año si está disponible
          if (year && item.year && Math.abs(item.year - year) > 1) continue;

          // Verificar IMDB ID si está disponible
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

          // Si llegamos aquí, es una coincidencia razonable
          if (!matchedItem) {
            matchedItem = item;
          }
        }
      }

      if (matchedItem) {
        // Usar el machineIdentifier obtenido o el del item
        const serverMachineId = machineIdentifier || matchedItem.machineIdentifier;
        
        // Construir URL para abrir Plex Web
        // Para series, el key puede incluir /children, pero necesitamos la ruta base para detalles
        let metadataKey = matchedItem.key || `/library/metadata/${matchedItem.ratingKey}`;
        
        // Si es una serie y el key incluye /children, eliminarlo para acceder a los detalles
        if (type === 'tv' && metadataKey.endsWith('/children')) {
          console.log(`[Plex] Removing /children from key for TV show: ${metadataKey}`);
          metadataKey = metadataKey.replace('/children', '');
          console.log(`[Plex] Cleaned key: ${metadataKey}`);
        }
        
        // Codificar el key correctamente para la URL
        const encodedKey = encodeURIComponent(metadataKey);
        console.log(`[Plex] Encoded key: ${encodedKey}`);
        
        // URL para navegador web
        const plexWebUrl = `https://app.plex.tv/desktop/#!/server/${serverMachineId}/details?key=${encodedKey}`;
        
        // Intent URL para Android que abre la app si está instalada o el navegador como fallback
        const plexMobileUrl = `intent://server/${serverMachineId}/details?key=${encodedKey}#Intent;scheme=https;package=com.plexapp.android;S.browser_fallback_url=https://app.plex.tv/desktop/#!/server/${serverMachineId}/details?key=${encodedKey};end`;

        console.log(`[Plex] Match found for "${title}" (${type}):`, {
          title: matchedItem.title,
          type: matchedItem.type,
          ratingKey: matchedItem.ratingKey,
          originalKey: matchedItem.key,
          cleanedKey: metadataKey,
          encodedKey,
          plexWebUrl,
          plexMobileUrl,
        });

        return NextResponse.json(
          {
            available: true,
            plexUrl: plexWebUrl,
            plexMobileUrl: plexMobileUrl,
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
      }

      return NextResponse.json({
        available: false,
        plexUrl: null,
      });
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
      {
        error: "Failed to check Plex availability",
        available: false,
        plexUrl: null,
      },
      { status: 500 },
    );
  }
}
