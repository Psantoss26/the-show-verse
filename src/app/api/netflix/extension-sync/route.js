import { NextResponse } from "next/server";
import { backendFetchJson, getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Prefijo de plataforma que algunas pestañas anteponen al título.
const PLATFORM_PREFIX_RE =
  /^\s*(prime video|amazon prime video|amazon|netflix|max|hbo max|hbo|disney\s*\+|disney plus|star\s*\+|plex)\s*[:\-|–·]\s*/i;

// Normaliza el título para buscar en TMDb: quita el prefijo de la plataforma y
// los descriptores de temporada/episodio del final ("- Temporada 1", ": S2 E4").
function cleanSearchTitle(raw) {
  let t = String(raw || "").trim();
  t = t.replace(PLATFORM_PREFIX_RE, "");
  t = t.replace(/\s*[-:|–·]\s*(temporada|season|saison|staffel)\s*\.?\s*\d+.*$/i, "");
  t = t.replace(/\s*[-:|–·]\s*(episodio|episode|cap[ií]tulo|chapter|folge|ep)\s*\.?\s*\d+.*$/i, "");
  t = t.replace(/\s*[-:|–·]\s*[TS]\s*\d+\s*[:x]\s*E?\s*\d+.*$/i, "");
  return t.trim();
}

export async function POST(request) {
  try {
    const {
      mainTitle,
      subTitle,
      videoId,
      platform = "netflix",
      season: seasonIn,
      episode: episodeIn,
    } = await request.json().catch(() => ({}));
    const authHeader = request.headers.get("authorization") || "";
    const syncToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!mainTitle) {
      return NextResponse.json({ error: "mainTitle is required" }, { status: 400 });
    }

    console.log(`[Extension Sync] ${platform} watch detected: "${mainTitle}" - "${subTitle}" (Content ID: ${videoId})`);

    // 1. Detectar temporada/episodio. La extensión puede enviarlos ya parseados;
    // si no, los inferimos del título completo (main + subtítulo) en varios
    // formatos: "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 Episode 1".
    const combined = `${mainTitle} ${subTitle || ""}`;
    let isTv = false;
    let season = null;
    let episode = null;
    let seriesWithoutEpisode = false;

    if (Number.isInteger(episodeIn) && episodeIn > 0) {
      isTv = true;
      episode = episodeIn;
      season = Number.isInteger(seasonIn) && seasonIn > 0 ? seasonIn : 1;
    } else {
      const sMatch = combined.match(/(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i);
      const eMatch = combined.match(/(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i);

      if (eMatch) {
        isTv = true;
        season = sMatch ? parseInt(sMatch[1], 10) : 1; // por defecto temporada 1
        episode = parseInt(eMatch[1], 10);
      } else if (sMatch) {
        // Serie con temporada pero sin episodio identificable.
        seriesWithoutEpisode = true;
        season = parseInt(sMatch[1], 10);
      }
    }

    // 2. Limpiar el título para la búsqueda en TMDb.
    const query = cleanSearchTitle(mainTitle);
    if (!query) {
      return NextResponse.json({ error: "Empty title after cleanup" }, { status: 422 });
    }

    // Sin episodio identificable no podemos fijar una entrada de historial de
    // episodio fiable: omitimos en vez de registrar datos incorrectos.
    if (seriesWithoutEpisode) {
      console.log(`[Extension Sync] Serie sin episodio identificable, omitida: "${query}" (T${season})`);
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "series_without_episode",
        title: query,
        season,
      });
    }

    let tmdbId = null;
    let mediaType = isTv ? "tv" : "movie";
    let resolvedTitle = "";
    let posterPath = "";

    // 3. Search TMDb
    if (isTv) {
      const searchRes = await backendFetchJson(request, `/v1/tmdb/search?q=${encodeURIComponent(query)}&type=tv`);
      console.log("[Extension Sync] TV Search result:", { query, ok: searchRes.ok, status: searchRes.status, count: searchRes.json?.results?.length });
      if (searchRes.ok && searchRes.json?.results?.length > 0) {
        const show = searchRes.json.results[0];
        tmdbId = show.id;
        resolvedTitle = show.name;
        posterPath = show.poster_path;

        // Fetch episode name if possible
        if (TMDB_API_KEY) {
          try {
            const epUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=es-ES`;
            const epRes = await fetch(epUrl);
            if (epRes.ok) {
              const epData = await epRes.json();
              if (epData.name) {
                resolvedTitle = `${show.name}: ${epData.name}`;
              }
            }
          } catch (e) {
            console.error("[Extension Sync] Failed to fetch episode name:", e);
          }
        }
      }
    } else {
      const searchRes = await backendFetchJson(request, `/v1/tmdb/search?q=${encodeURIComponent(query)}&type=movie`);
      console.log("[Extension Sync] Movie Search result:", { query, ok: searchRes.ok, status: searchRes.status, count: searchRes.json?.results?.length });
      if (searchRes.ok && searchRes.json?.results?.length > 0) {
        const movie = searchRes.json.results[0];
        tmdbId = movie.id;
        resolvedTitle = movie.title;
        posterPath = movie.poster_path;
      } else {
        // No es película: puede ser una serie detectada solo por título (sin
        // temporada/episodio visibles, p. ej. en Plex). Si TMDb la conoce como
        // serie, la omitimos limpiamente en vez de devolver un 404 de resolución.
        const tvRes = await backendFetchJson(request, `/v1/tmdb/search?q=${encodeURIComponent(query)}&type=tv`);
        if (tvRes.ok && tvRes.json?.results?.length > 0) {
          console.log(`[Extension Sync] Serie reconocida sin episodio identificable, omitida: "${query}"`);
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: "series_without_episode",
            title: query,
          });
        }
      }
    }

    if (!tmdbId) {
      console.error("[Extension Sync] Could not resolve TMDb entity for:", query);
      return NextResponse.json({ error: `Could not resolve TMDb entity for: ${query}` }, { status: 404 });
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

    console.log("[Extension Sync] Submitting Netflix sync body to backend:", JSON.stringify({
      ...body,
      netflixVideoId: videoId || null,
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
          netflixVideoId: videoId || undefined,
          netflixTitle: mainTitle,
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
        duplicate: Boolean(historyRes.json?.duplicate),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
