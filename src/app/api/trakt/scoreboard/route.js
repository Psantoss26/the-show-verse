import { NextResponse } from "next/server";
import {
  fetchTrakt,
  fetchTraktMaybe,
  normalizeType,
} from "@/lib/trakt/fetchWithCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15; // Vercel: máximo tiempo de la función serverless

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = normalizeType(searchParams.get("type")); // movie|show|season|episode
    const tmdbId = searchParams.get("tmdbId"); // para season/episode: TMDb ID del SHOW
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if (!type || !tmdbId) {
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

      const search = await fetchTrakt(
        `/search/tmdb/${tmdbId}?type=${safeType}`,
      );
      const hit = Array.isArray(search) ? search[0] : null;
      const item = hit?.[safeType];
      const ids = item?.ids;

      if (!ids?.trakt) return NextResponse.json({ found: false });

      const traktId = ids.trakt;

      const [summary, stats] = await Promise.all([
        fetchTrakt(`/${plural}/${traktId}?extended=full`),
        fetchTrakt(`/${plural}/${traktId}/stats`),
      ]);

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
    const searchShow = await fetchTrakt(
      `/search/tmdb/${tmdbId}?type=show`,
      8000,
    );
    const showHit = Array.isArray(searchShow) ? searchShow[0] : null;
    const showItem = showHit?.show;
    const showIds = showItem?.ids;

    if (!showIds?.trakt) return NextResponse.json({ found: false });

    const traktShowId = showIds.trakt;
    const showSlug = showIds?.slug || traktShowId;

    if (type === "season") {
      // 2) temporadas del show para conseguir ids/rating/votes de temporada
      const seasons = await fetchTrakt(
        `/shows/${traktShowId}/seasons?extended=full`,
        8000,
      );
      const seasonObj = Array.isArray(seasons)
        ? seasons.find((s) => Number(s?.number) === Number(seasonNumber))
        : null;

      if (!seasonObj?.ids?.trakt) return NextResponse.json({ found: false });

      const seasonIds = seasonObj.ids;
      const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}`;

      // 3) stats (intentar dos endpoints en paralelo con timeout más largo)
      const [stats1, stats2] = await Promise.all([
        fetchTraktMaybe(`/seasons/${seasonIds.trakt}/stats`, 6000),
        fetchTraktMaybe(
          `/shows/${traktShowId}/seasons/${seasonNumber}/stats`,
          6000,
        ),
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
    const ep = await fetchTrakt(
      `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}?extended=full`,
      8000,
    );
    const epIds = ep?.ids;
    if (!epIds?.trakt) return NextResponse.json({ found: false });

    const traktUrl = `https://trakt.tv/shows/${showSlug}/seasons/${seasonNumber}/episodes/${episodeNumber}`;

    // Intentar obtener stats de dos endpoints en paralelo con timeout más largo
    const [stats1, stats2] = await Promise.all([
      fetchTraktMaybe(`/episodes/${epIds.trakt}/stats`, 6000),
      fetchTraktMaybe(
        `/shows/${traktShowId}/seasons/${seasonNumber}/episodes/${episodeNumber}/stats`,
        6000,
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
    console.error("Trakt scoreboard error:", e);

    // Diferenciar entre timeout y otros errores
    if (e?.message === "Trakt request timeout" || e?.name === "AbortError") {
      return NextResponse.json(
        {
          error: "Trakt request timeout",
          found: false,
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error: e?.message || "Error",
        found: false,
      },
      { status: 500 },
    );
  }
}
