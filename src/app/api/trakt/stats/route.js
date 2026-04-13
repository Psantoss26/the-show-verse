import { NextResponse } from "next/server";
import { fetchTrakt, normalizeType } from "@/lib/trakt/fetchWithCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25; // Vercel: aumentado para producción

export async function GET(req) {
  // Timeout para búsqueda TMDb->Trakt (rápido)
  const searchTimeoutMs = process.env.NODE_ENV === "production" ? 10000 : 8000;
  // Timeout para stats (más margen para cold starts)
  const statsTimeoutMs = process.env.NODE_ENV === "production" ? 12000 : 10000;
  const ft = (path) => fetchTrakt(path, { timeoutMs: searchTimeoutMs });
  const ftStats = (path) => fetchTrakt(path, { timeoutMs: statsTimeoutMs });

  try {
    const { searchParams } = new URL(req.url);
    const rawType = searchParams.get("type"); // 'movie' | 'show' | 'season' | 'episode'
    const type = normalizeType(rawType) || rawType;
    const tmdbId = searchParams.get("tmdbId");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if (!tmdbId || !type) {
      return NextResponse.json(
        { error: "Missing/invalid type or tmdbId" },
        { status: 400 },
      );
    }

    // ===============================
    // MOVIE / SHOW
    // ===============================
    if (type === "movie" || type === "show") {
      // 1) Mapear TMDb -> Trakt con cache
      const search = await ft(`/search/tmdb/${tmdbId}?type=${type}`);
      const item = search?.[0]?.[type];
      const ids = item?.ids;

      if (!ids?.trakt) {
        return NextResponse.json(
          { error: "Trakt item not found" },
          { status: 404 },
        );
      }

      const traktId = ids.trakt;
      const path = type === "movie" ? "movies" : "shows";

      // 2) Obtener stats con cache (timeout más alto para cold starts)
      const stats = await ftStats(`/${path}/${traktId}/stats`);

      // Devolver formato consistente con datos completos
      return NextResponse.json({
        found: true,
        traktId,
        ids,
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
      });
    }

    // ===============================
    // SEASON / EPISODE
    // ===============================
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

    // 1) Resolver SHOW en Trakt por TMDb ID
    const searchShow = await ft(`/search/tmdb/${tmdbId}?type=show`);
    const showItem = searchShow?.[0]?.show;
    const traktShowId = showItem?.ids?.trakt;

    if (!traktShowId) {
      return NextResponse.json(
        { error: "Trakt show not found" },
        { status: 404 },
      );
    }

    if (type === "season") {
      // 2) Obtener todas las temporadas
      const seasons = await ft(`/shows/${traktShowId}/seasons?extended=full`);
      const seasonObj = Array.isArray(seasons)
        ? seasons.find((s) => Number(s?.number) === seasonNumber)
        : null;

      if (!seasonObj?.ids?.trakt) {
        return NextResponse.json(
          { error: "Season not found" },
          { status: 404 },
        );
      }

      // 3) Intentar obtener stats usando el endpoint correcto
      const stats = await ftStats(
        `/shows/${traktShowId}/seasons/${seasonNumber}/stats`,
      ).catch(() => null);

      return NextResponse.json({
        found: true,
        traktId: seasonObj.ids.trakt,
        ids: seasonObj.ids,
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
      });
    }

    // EPISODE
    // 2) Obtener el episodio específico
    const ep = await ft(
      `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}?extended=full`,
    );
    const epTraktId = ep?.ids?.trakt;

    if (!epTraktId) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // 3) Intentar obtener stats del episodio usando el endpoint correcto
    const stats = await ftStats(
      `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}/stats`,
    ).catch(() => null);

    return NextResponse.json({
      found: true,
      traktId: epTraktId,
      ids: ep.ids,
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
    });
  } catch (e) {
    const isTimeout =
      e?.isTimeout ||
      e?.name === "AbortError" ||
      /timeout/i.test(e?.message || "");
    const isRateLimit =
      e?.status === 429 || /rate limit/i.test(e?.message || "");
    const isNotFound = e?.status === 404;
    const isServerError = e?.status >= 500 && e?.status < 600;

    // Log para debugging
    console.error("❌ [Trakt Stats] Error:", {
      message: e?.message,
      status: e?.status,
      path: e?.path,
      isTimeout,
      isRateLimit,
      isNotFound,
      isServerError,
    });

    // Degradación graciosa: timeout, rate limit, errores 500 de Trakt
    if (isTimeout || isRateLimit || isNotFound || isServerError) {
      console.warn(
        `⚠️ [Trakt Stats] Unavailable (${isTimeout ? "timeout" : isRateLimit ? "rate-limit" : isServerError ? "server-error" : "not-found"}):`,
        e.message,
      );
      // Devolver stats vacías pero válidas (UI mostrará 0 o '-')
      return NextResponse.json({
        found: false,
        stats: {
          watchers: null,
          plays: null,
          collectors: null,
          comments: null,
          lists: null,
          favorited: null,
        },
      });
    }

    // Otros errores: devolver found=false para no romper la UI
    console.error("❌ [Trakt Stats] Unexpected error:", e.message);
    return NextResponse.json({ found: false, stats: null });
  }
}
