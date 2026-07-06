import { NextResponse } from "next/server";
import { backendFetchJson, getBackendBaseUrl } from "@/lib/backend/server";
import {
  resolveStreamingEntity,
  searchTmdbCandidatesWithFallback,
  matchEpisodeByName,
} from "@/lib/netflix/streamingResolve";
import { buildQueryVariants } from "@/lib/netflix/queryVariants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_API = "https://api.themoviedb.org/3";

async function searchTmdbDirectLang(query, mediaType, language) {
  const url = new URL(`${TMDB_API}/search/${mediaType}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", language);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return [];

  const json = await response.json().catch(() => null);
  return Array.isArray(json?.results) ? json.results : [];
}

// Busca en TMDb en español E inglés y fusiona (sin duplicados por id). Los
// servicios de streaming suelen exponer el título ORIGINAL (a menudo en inglés)
// en la Media Session, y la búsqueda es-ES de una cadena inglesa suele no
// devolver nada: la causa nº1 del 404. Buscar también en en-US lo resuelve.
async function searchTmdbDirect(query, mediaType) {
  if (!TMDB_API_KEY) return [];
  const [es, en] = await Promise.all([
    searchTmdbDirectLang(query, mediaType, "es-ES"),
    searchTmdbDirectLang(query, mediaType, "en-US"),
  ]);
  const byId = new Map();
  for (const item of [...es, ...en]) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

async function searchTmdbCandidates(request, query, mediaType) {
  return searchTmdbCandidatesWithFallback({
    mediaType,
    backendSearch: async (type) => {
      const result = await backendFetchJson(
        request,
        `/v1/tmdb/search?q=${encodeURIComponent(query)}&type=${type}`,
      );
      if (!result.ok) {
        console.warn("[Extension Sync] Backend TMDb search unavailable:", {
          query,
          mediaType: type,
          status: result.status,
          error: result.error,
        });
        return [];
      }
      return Array.isArray(result.json?.results) ? result.json.results : [];
    },
    directSearch: (type) => searchTmdbDirect(query, type),
  });
}

export async function POST(request) {
  try {
    const {
      mainTitle,
      subTitle,
      videoId,
      contentId,
      platform = "netflix",
      season: seasonIn,
      episode: episodeIn,
      // Señales enriquecidas (PlaybackSignal) — opcionales, con retrocompat.
      showName,
      episodeName,
      seasonEpisodeText,
      // Título de la pestaña/app (p. ej. "Stranger Things - Netflix"): fuente más
      // fiable del nombre de la SERIE cuando la plataforma no expone artist/album.
      tabTitle,
      // Fuentes adicionales del nombre de la SERIE en Android: el título de la cola
      // de reproducción, el "album artist" y los EXTRAS de la notificación (algunas
      // apps —Netflix— no exponen la serie en la MediaSession pero sí en su
      // notificación) cuando `title` es el episodio.
      queueTitle,
      albumArtist,
      notifTitle,
      notifText,
      notifSubText,
      // Modo "solo resolver": para el indicador en la FICHA del título (navegando,
      // sin reproducir). Resuelve el título pero NO lo inserta en el historial.
      resolveOnly,
    } = await request.json().catch(() => ({}));
    const resolvedVideoId = videoId || contentId || null;
    const authHeader = request.headers.get("authorization") || "";
    const syncToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!mainTitle && !showName) {
      return NextResponse.json({ error: "mainTitle is required" }, { status: 400 });
    }

    console.log(`[Extension Sync] ${platform} watch detected: "${mainTitle}" - "${subTitle}" (Content ID: ${resolvedVideoId})`);

    // 1. Detectar temporada/episodio. La extensión puede enviarlos ya parseados;
    // si no, los inferimos del título completo (main + subtítulo) en varios
    // formatos: "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 Episode 1".
    const combined = `${mainTitle || showName || ""} ${subTitle || episodeName || ""} ${seasonEpisodeText || ""}`;
    let isTv = false;
    let season = null;
    let episode = null;

    const sMatch = combined.match(/(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i);
    const eMatch = combined.match(/(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i);
    const seasonFromText = sMatch ? parseInt(sMatch[1], 10) : null;

    if (Number.isInteger(episodeIn) && episodeIn > 0) {
      isTv = true;
      episode = episodeIn;
      // La temporada NUNCA se asume 1 (antes se registraba T1 al ver la T4): usa
      // la enviada por el cliente o la del texto; si no hay, queda null y más
      // abajo se decide (T1 solo si la serie tiene 1 temporada, o nivel serie).
      season = Number.isInteger(seasonIn) && seasonIn > 0 ? seasonIn : seasonFromText;
    } else if (eMatch) {
      isTv = true;
      episode = parseInt(eMatch[1], 10);
      season = seasonFromText;
    } else if (sMatch) {
      // Temporada sin episodio identificable: se resolverá a nivel serie.
      season = seasonFromText;
    }

    // 2. Construir variantes de consulta (nombre de serie/principal, nombre de la
    // serie extraído del título de la pestaña, parte antes de ":" para "Serie:
    // Episodio", y sin sufijos de edición) para maximizar la resolución. En series
    // se prioriza el nombre de la SERIE (no el del episodio) — clave para que los
    // episodios no fallen cuando la plataforma no expone artist/album.
    const isSeries = isTv || Boolean(episodeName) || Number.isInteger(seasonIn);
    const queryVariants = buildQueryVariants({
      showName,
      mainTitle,
      tabTitle,
      queueTitle,
      albumArtist,
      showCandidates: [notifTitle, notifText, notifSubText],
      isSeries,
    });
    if (!queryVariants.length) {
      return NextResponse.json({ error: "Empty title after cleanup" }, { status: 422 });
    }

    let tmdbId = null;
    let mediaType = isTv ? "tv" : "movie";
    let resolvedTitle = "";
    let posterPath = "";
    let confidence = null;
    let query = queryVariants[0];

    // 3. Resolver contra el proxy backend y, si falla o no devuelve resultados,
    // contra TMDb directamente (es-ES + en-US). Cuando no hay números de episodio
    // comparamos coincidencias exactas de película y serie para no confundir una
    // serie con una película derivada. Se prueban EN ORDEN las variantes de
    // consulta hasta que una resuelve, de la más específica a la más agresiva.
    let resolution = null;
    for (const variant of queryVariants) {
      resolution = await resolveStreamingEntity({
        query: variant,
        expectedMediaType: isTv ? "tv" : null,
        preferTv: Boolean(subTitle || episodeName || showName),
        search: (type) => searchTmdbCandidates(request, variant, type),
      });
      if (resolution) {
        query = variant;
        break;
      }
    }

    if (resolution?.kind === "resolved") {
      const entity = resolution.entity;
      tmdbId = entity.id;
      mediaType = resolution.mediaType;
      resolvedTitle =
        resolution.mediaType === "tv" ? entity.name : entity.title;
      posterPath = entity.poster_path;
      confidence = resolution.confidence || "high";
    } else if (resolution?.kind === "show_level") {
      // Serie reconocida sin episodio fijado: en vez de descartar, registramos
      // a nivel serie (confianza baja). Antes intentamos fijar el episodio por
      // NOMBRE contra los episodios de TMDb de la temporada detectada.
      const entity = resolution.entity;
      tmdbId = entity.id;
      mediaType = "tv";
      isTv = true;
      resolvedTitle = entity.name || entity.original_name || query;
      posterPath = entity.poster_path;
      episode = null;
      confidence = "low";

      if (episodeName && season && TMDB_API_KEY) {
        try {
          const seUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?api_key=${TMDB_API_KEY}&language=es-ES`;
          const seRes = await fetch(seUrl, { signal: AbortSignal.timeout(8000) });
          if (seRes.ok) {
            const seData = await seRes.json();
            const hit = matchEpisodeByName({
              episodeName,
              seasonEpisodes: seData?.episodes,
            });
            if (hit) {
              season = hit.season;
              episode = hit.episode;
              confidence = "medium";
              console.log(
                `[Extension Sync] Episodio fijado por nombre: "${episodeName}" → T${season}E${episode}`,
              );
            }
          }
        } catch (e) {
          console.warn("[Extension Sync] episode-by-name lookup failed:", e?.message);
        }
      }

      if (episode == null) {
        // Nivel serie puro: sin temporada/episodio concretos.
        season = null;
      }
    }

    // Serie con episodio pero SIN temporada conocida: NO inventamos T1 (antes se
    // registraba T1E5 al ver T4E5). Si la serie tiene UNA sola temporada, usamos
    // esa; si tiene varias y no sabemos cuál, registramos a nivel serie.
    if (isTv && tmdbId && episode != null && season == null && TMDB_API_KEY) {
      try {
        const showUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
        const showRes = await fetch(showUrl, { signal: AbortSignal.timeout(8000) });
        if (showRes.ok) {
          const showData = await showRes.json();
          const realSeasons = (Array.isArray(showData?.seasons) ? showData.seasons : [])
            .filter((s) => s && Number(s.season_number) > 0);
          if (realSeasons.length === 1) {
            season = Number(realSeasons[0].season_number) || 1;
          }
        }
      } catch (e) {
        console.warn("[Extension Sync] season lookup failed:", e?.message);
      }
      if (season == null) {
        console.warn(
          `[Extension Sync] Temporada desconocida para "${resolvedTitle || query}"; se registra a nivel serie.`,
        );
        episode = null;
        confidence = "low";
      }
    }

    // Fetch episode name if possible (solo con episodio concreto).
    if (isTv && tmdbId && episode != null && season != null && TMDB_API_KEY) {
      try {
        const epUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=es-ES`;
        const epRes = await fetch(epUrl);
        if (epRes.ok) {
          const epData = await epRes.json();
          if (epData.name) {
            resolvedTitle = `${resolvedTitle || query}: ${epData.name}`;
          }
        }
      } catch (e) {
        console.error("[Extension Sync] Failed to fetch episode name:", e);
      }
    }

    if (!tmdbId) {
      console.error("[Extension Sync] Could not resolve TMDb entity for:", query);
      return NextResponse.json({ error: `Could not resolve TMDb entity for: ${query}` }, { status: 404 });
    }

    // Modo "solo resolver" (indicador en la ficha, sin reproducir): devolvemos la
    // entidad resuelta SIN insertar nada en el historial.
    if (resolveOnly) {
      return NextResponse.json({
        success: true,
        resolveOnly: true,
        synced: {
          tmdbId,
          mediaType,
          season: isTv ? season : null,
          episode: isTv ? episode : null,
          title: resolvedTitle,
          posterPath,
        },
      });
    }

    // 3. Insert into history
    const body = {
      tmdbId,
      mediaType,
      watchedAt: new Date().toISOString(),
    };

    if (resolvedTitle) body.title = resolvedTitle;
    if (posterPath) body.posterPath = posterPath;
    if (isTv && season != null) body.season = season;
    if (isTv && episode != null) body.episode = episode;
    if (confidence) body.confidence = confidence;

    console.log("[Extension Sync] Submitting Netflix sync body to backend:", JSON.stringify({
      ...body,
      netflixVideoId: resolvedVideoId || null,
    }));

    let historyRes;
    if (syncToken) {
      const baseUrl = getBackendBaseUrl();
      if (!baseUrl) {
        return NextResponse.json({ error: "Backend base URL is not configured" }, { status: 503 });
      }

      const syncUrl = `${baseUrl}/v1/auth/netflix/sync`;
      console.log(`[Extension Sync] POST -> ${syncUrl}`);
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${syncToken}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          ...body,
          platform,
          netflixVideoId: resolvedVideoId || undefined,
          netflixTitle: mainTitle || showName || resolvedTitle,
        }),
      });
      const json = await res.json().catch(() => ({}));
      historyRes = {
        ok: res.ok,
        status: res.status,
        json,
        error: json?.error || json?.message || `Backend HTTP ${res.status}`,
      };
    } else {
      historyRes = await backendFetchJson(request, "/v1/history", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    if (!historyRes.ok) {
      console.error("[Extension Sync] Backend history insert failed:", {
        status: historyRes.status,
        error: historyRes.error,
        json: historyRes.json
      });
      return NextResponse.json({ 
        error: historyRes.error || "Failed to add history entry",
        issues: historyRes.json?.issues 
      }, { status: historyRes.status || 500 });
    }

    return NextResponse.json({
      success: true,
      synced: {
        tmdbId,
        mediaType,
        season,
        episode,
        title: resolvedTitle,
        posterPath,
        confidence,
        duplicate: Boolean(historyRes.json?.duplicate),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
