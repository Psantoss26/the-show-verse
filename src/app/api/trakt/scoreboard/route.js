import { NextResponse } from "next/server";
import {
  fetchTrakt,
  fetchTraktMaybe,
  normalizeType,
} from "@/lib/trakt/fetchWithCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Vercel: aumentado para dar más margen en producción

export async function GET(req) {
  // Timeout muy generoso para scoreboard (stats pueden ser muy lentas en Trakt)
  const timeoutMs = process.env.NODE_ENV === "production" ? 18000 : 15000;
  const ft = (path) => fetchTrakt(path, { timeoutMs });
  const ftm = (path) => fetchTraktMaybe(path, { timeoutMs });

  try {
    const { searchParams } = new URL(req.url);
    const type = normalizeType(searchParams.get("type")); // movie|show|season|episode
    const tmdbId = searchParams.get("tmdbId"); // para season/episode: TMDb ID del SHOW
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    console.log(
      `🎬 [Trakt Scoreboard] Request: type=${type}, tmdbId=${tmdbId}, season=${season}, episode=${episode}`,
    );

    if (!type || !tmdbId) {
      console.warn("⚠️ [Trakt Scoreboard] Missing required params:", {
        type,
        tmdbId,
      });
      return NextResponse.json(
        { error: "Missing type/tmdbId" },
        { status: 400 },
      );
    }

    // -------------------------
    // MOVIE/SHOW (igual que antes)
    // -------------------------
    if (type === "movie" || type === "show") {
      const safeType = type;
      const plural = safeType === "show" ? "shows" : "movies";

      const search = await ft(`/search/tmdb/${tmdbId}?type=${safeType}`);
      const hit = Array.isArray(search) ? search[0] : null;
      const item = hit?.[safeType];
      const ids = item?.ids;

      if (!ids?.trakt) return NextResponse.json({ found: false });

      const traktId = ids.trakt;

      // Obtener stats (incluye rating/votes en algunos casos)
      const stats = await ft(`/${plural}/${traktId}/stats`);

      // Obtener summary solo si necesitamos rating/votes (no disponibles en stats)
      const summary = await ft(`/${plural}/${traktId}`);

      const slug = summary?.ids?.slug || ids?.slug || traktId;
      const traktUrl =
        type === "show"
          ? `https://trakt.tv/shows/${slug}`
          : `https://trakt.tv/movies/${slug}`;

      return NextResponse.json({
        found: true,
        ids: summary?.ids || ids,
        traktUrl,
        community: {
          rating: typeof summary?.rating === "number" ? summary.rating : null,
          votes: typeof summary?.votes === "number" ? summary.votes : null,
        },
        stats: {
          watchers: typeof stats?.watchers === "number" ? stats.watchers : null,
          plays: typeof stats?.plays === "number" ? stats.plays : null,
          collectors:
            typeof stats?.collectors === "number" ? stats.collectors : null,
          comments: typeof stats?.comments === "number" ? stats.comments : null,
          lists: typeof stats?.lists === "number" ? stats.lists : null,
          favorited:
            typeof stats?.favorited === "number" ? stats.favorited : null,
        },
        external: {
          rtAudience: null,
          justwatchRank: null,
          justwatchDelta: null,
          justwatchCountry: "ES",
        },
      });
    }

    // -------------------------
    // SEASON / EPISODE (nuevo)
    // tmdbId = TMDb ID del show
    // -------------------------
    const seasonNumber = season != null ? Number(season) : null;
    const episodeNumber = episode != null ? Number(episode) : null;

    if (
      !Number.isFinite(seasonNumber) ||
      (type === "episode" && !Number.isFinite(episodeNumber))
    ) {
      return NextResponse.json(
        { error: "Missing season/episode params" },
        { status: 400 },
      );
    }

    // 1) resolver SHOW en Trakt por TMDb showId (con timeout más largo)
    const searchShow = await ft(`/search/tmdb/${tmdbId}?type=show`);
    const showHit = Array.isArray(searchShow) ? searchShow[0] : null;
    const showItem = showHit?.show;
    const showIds = showItem?.ids;

    if (!showIds?.trakt) return NextResponse.json({ found: false });

    const traktShowId = showIds.trakt;
    const showSlug = showIds?.slug || traktShowId;

    if (type === "season") {
      // 2) temporadas del show para conseguir ids/rating/votes de temporada
      const seasons = await ft(`/shows/${traktShowId}/seasons?extended=full`);
      const seasonObj = Array.isArray(seasons)
        ? seasons.find((s) => Number(s?.number) === Number(seasonNumber))
        : null;

      if (!seasonObj?.ids?.trakt) return NextResponse.json({ found: false });

      const seasonIds = seasonObj.ids;
      const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}`;

      // 3) stats (intentar dos endpoints en paralelo con timeout más largo)
      const [stats1, stats2] = await Promise.all([
        ftm(`/seasons/${seasonIds.trakt}/stats`),
        ftm(`/shows/${traktShowId}/seasons/${seasonNumber}/stats`),
      ]);
      const stats = stats1 || stats2 || null;

      return NextResponse.json({
        found: true,
        ids: seasonIds,
        traktUrl,
        community: {
          rating:
            typeof seasonObj?.rating === "number" ? seasonObj.rating : null,
          votes: typeof seasonObj?.votes === "number" ? seasonObj.votes : null,
        },
        stats: stats
          ? {
              watchers:
                typeof stats?.watchers === "number" ? stats.watchers : null,
              plays: typeof stats?.plays === "number" ? stats.plays : null,
              collectors:
                typeof stats?.collectors === "number" ? stats.collectors : null,
              comments:
                typeof stats?.comments === "number" ? stats.comments : null,
              lists: typeof stats?.lists === "number" ? stats.lists : null,
              favorited:
                typeof stats?.favorited === "number" ? stats.favorited : null,
            }
          : {
              watchers: null,
              plays: null,
              collectors: null,
              comments: null,
              lists: null,
              favorited: null,
            },
        external: {
          rtAudience: null,
          justwatchRank: null,
          justwatchDelta: null,
          justwatchCountry: "ES",
        },
      });
    }

    // EPISODE - optimizar con Promise.all para cargar datos en paralelo
    const ep = await ft(
      `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}?extended=full`,
    );
    const epIds = ep?.ids;
    if (!epIds?.trakt) return NextResponse.json({ found: false });

    const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}/episodes/${episodeNumber}`;

    // Intentar obtener stats de dos endpoints en paralelo con timeout más largo
    const [stats1, stats2] = await Promise.all([
      ftm(`/episodes/${epIds.trakt}/stats`),
      ftm(
        `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}/stats`,
      ),
    ]);
    const stats = stats1 || stats2 || null;

    return NextResponse.json({
      found: true,
      ids: epIds,
      traktUrl,
      community: {
        rating: typeof ep?.rating === "number" ? ep.rating : null,
        votes: typeof ep?.votes === "number" ? ep.votes : null,
      },
      stats: stats
        ? {
            watchers:
              typeof stats?.watchers === "number" ? stats.watchers : null,
            plays: typeof stats?.plays === "number" ? stats.plays : null,
            collectors:
              typeof stats?.collectors === "number" ? stats.collectors : null,
            comments:
              typeof stats?.comments === "number" ? stats.comments : null,
            lists: typeof stats?.lists === "number" ? stats.lists : null,
            favorited:
              typeof stats?.favorited === "number" ? stats.favorited : null,
          }
        : {
            watchers: null,
            plays: null,
            collectors: null,
            comments: null,
            lists: null,
            favorited: null,
          },
      external: {
        rtAudience: null,
        justwatchRank: null,
        justwatchDelta: null,
        justwatchCountry: "ES",
      },
    });
  } catch (e) {
    const isTimeout =
      e?.isTimeout ||
      e?.message?.includes("timeout") ||
      e?.name === "AbortError";
    const isRateLimit =
      e?.status === 429 || /rate limit/i.test(e?.message || "");
    const isMissingEnv = e?.message?.includes("TRAKT_CLIENT_ID");
    const isNotFound = e?.status === 404;
    const isServerError = e?.status >= 500 && e?.status < 600;

    // Log detallado del error para debugging
    console.error("❌ [Trakt Scoreboard] Error:", {
      message: e?.message,
      status: e?.status,
      path: e?.path,
      type: e?.name,
      isTimeout,
      isRateLimit,
      isMissingEnv,
      isNotFound,
      stack: e?.stack?.split("\n").slice(0, 3).join("\n"),
    });

    // Degradación graciosa: timeouts, rate limits, errores 500
    if (isTimeout || isRateLimit || isServerError) {
      console.warn(
        "⚠️ [Trakt Scoreboard] Unavailable (degradación graciosa):",
        e.message,
      );
      return NextResponse.json({ found: false });
    }

    // Variable de entorno faltante: error crítico
    if (isMissingEnv) {
      console.error(
        "❌ CRÍTICO: Variable de entorno TRAKT_CLIENT_ID no configurada en producción",
      );
      return NextResponse.json(
        {
          error: "Server configuration error",
          found: false,
        },
        { status: 500 },
      );
    }

    // 404: el contenido no existe en Trakt (normal)
    if (isNotFound) {
      console.log("ℹ️ [Trakt Scoreboard] Content not found in Trakt");
      return NextResponse.json({ found: false });
    }

    // Otros errores: devolver found=false para no romper la UI
    console.error("❌ [Trakt Scoreboard] Unexpected error:", e.message);
    return NextResponse.json({ found: false });
  }
}
