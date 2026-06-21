import { NextResponse } from "next/server";
import { backendFetchJson, getBackendBaseUrl } from "@/lib/backend/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

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

    // 1. Determine TV details. La extensión puede enviar season/episode ya
    // parseados; si no, los inferimos del subtítulo en varios formatos.
    let isTv = false;
    let season = null;
    let episode = null;

    if (Number.isInteger(episodeIn) && episodeIn > 0) {
      isTv = true;
      episode = episodeIn;
      season = Number.isInteger(seasonIn) && seasonIn > 0 ? seasonIn : 1;
    } else if (subTitle) {
      // Patrones: "T4:E1", "S4 E1", "Temporada 4: Episodio 1", "Season 4 Episode 1", "Ep. 1".
      const sMatch = subTitle.match(/(?:^|[^a-z])(?:T|S|Temporada|Season|Saison|Staffel)\s*\.?\s*(\d{1,3})/i);
      const eMatch = subTitle.match(/(?:E|Ep|Episodio|Episode|Cap[ií]tulo|Chapter|Folge)\s*\.?\s*(\d{1,3})/i);

      if (eMatch) {
        isTv = true;
        season = sMatch ? parseInt(sMatch[1], 10) : 1; // Default to season 1 if not specified
        episode = parseInt(eMatch[1], 10);
      }
    }

    let tmdbId = null;
    let mediaType = isTv ? "tv" : "movie";
    let resolvedTitle = "";
    let posterPath = "";

    // 2. Search TMDb
    if (isTv) {
      const searchRes = await backendFetchJson(request, `/v1/tmdb/search?q=${encodeURIComponent(mainTitle)}&type=tv`);
      console.log("[Extension Sync] TV Search result:", { ok: searchRes.ok, status: searchRes.status, count: searchRes.json?.results?.length });
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
      const searchRes = await backendFetchJson(request, `/v1/tmdb/search?q=${encodeURIComponent(mainTitle)}&type=movie`);
      console.log("[Extension Sync] Movie Search result:", { ok: searchRes.ok, status: searchRes.status, count: searchRes.json?.results?.length });
      if (searchRes.ok && searchRes.json?.results?.length > 0) {
        const movie = searchRes.json.results[0];
        tmdbId = movie.id;
        resolvedTitle = movie.title;
        posterPath = movie.poster_path;
      }
    }

    if (!tmdbId) {
      console.error("[Extension Sync] Could not resolve TMDb entity for:", mainTitle);
      return NextResponse.json({ error: `Could not resolve TMDb entity for: ${mainTitle}` }, { status: 404 });
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

      const res = await fetch(`${baseUrl}/v1/auth/netflix/sync`, {
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
