import { NextResponse } from "next/server";
import { fetchTrakt, normalizeType } from "@/lib/trakt/fetchWithCache";

export const dynamic = "force-dynamic";
export const maxDuration = 15; // Vercel: máximo tiempo de la función serverless

export async function GET(req) {
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
      const search = await fetchTrakt(`/search/tmdb/${tmdbId}?type=${type}`);
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

      // 2) Obtener stats con cache
      const stats = await fetchTrakt(`/${path}/${traktId}/stats`);

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
    const searchShow = await fetchTrakt(`/search/tmdb/${tmdbId}?type=show`);
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
      const seasons = await fetchTrakt(
        `/shows/${traktShowId}/seasons?extended=full`,
      );
      const seasonObj = Array.isArray(seasons)
        ? seasons.find((s) => Number(s?.number) === seasonNumber)
        : null;

      if (!seasonObj?.ids?.trakt) {
        return NextResponse.json(
          { error: "Season not found" },
          { status: 404 },
        );
      }

      // 3) Intentar obtener stats (puede fallar)
      const stats = await fetchTrakt(
        `/seasons/${seasonObj.ids.trakt}/stats`,
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
    const ep = await fetchTrakt(
      `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}?extended=full`,
    );
    const epTraktId = ep?.ids?.trakt;

    if (!epTraktId) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    // 3) Intentar obtener stats del episodio
    const stats = await fetchTrakt(`/episodes/${epTraktId}/stats`).catch(
      () => null,
    );

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
    console.error("Trakt stats error:", e);
    if (e?.name === "AbortError" || e?.message === "Trakt request timeout") {
      return NextResponse.json(
        { error: "Trakt request timeout", found: false },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: e?.message || "Unexpected error", found: false },
      { status: 500 },
    );
  }
}
