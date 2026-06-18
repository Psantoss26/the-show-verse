import { NextResponse } from "next/server";
import {
  fetchMediaByGenre,
  fetchMediaByKeyword,
  fetchMovieSections,
  fetchTVSections,
  fetchMindBendingMovies,
  discoverMovies,
  discoverTV,
  fetchRomanceSeriesWithGoodReviews,
} from "@/lib/api/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sortByVotes = (list = []) =>
  [...list].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

function curateList(
  list,
  { minVotes = 0, minRating = 0, minSize = 20, maxSize = 60 } = {},
) {
  if (!Array.isArray(list)) return [];

  const sorted = sortByVotes(list);

  const applyFilter = (minV, minR) =>
    sorted.filter((m) => {
      const votes = m?.vote_count || 0;
      const rating = typeof m?.vote_average === "number" ? m.vote_average : 0;
      return votes >= minV && rating >= minR;
    });

  let current = applyFilter(minVotes, minRating);
  if (current.length >= minSize) return current.slice(0, maxSize);

  const steps = [
    { factorV: 0.7, deltaR: -0.3 },
    { factorV: 0.5, deltaR: -0.6 },
    { factorV: 0.3, deltaR: -1.0 },
    { factorV: 0.1, deltaR: -1.5 },
  ];

  let mv = minVotes;
  let mr = minRating;

  for (const step of steps) {
    mv = Math.max(0, Math.round(mv * step.factorV));
    mr = Math.max(0, mr + step.deltaR);
    current = applyFilter(mv, mr);
    if (current.length >= minSize) return current.slice(0, maxSize);
  }

  if (sorted.length === 0) return [];
  const size = Math.min(sorted.length, Math.max(minSize, maxSize));
  return sorted.slice(0, size);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const topImdbIdsParam = searchParams.get("topImdbIds") || "";
  const topImdbIds = topImdbIdsParam
    ? topImdbIdsParam.split(",").map((id) => parseInt(id, 10))
    : [];

  const lang = "es-ES";

  try {
    if (type === "movie") {
      const [
        action,
        scifi,
        thrillers,
        romance,
        vengeance,
        mind,
        blockbustersP1,
        blockbustersP2,
        blockbustersP3,
        baseSections,
      ] = await Promise.all([
        fetchMediaByGenre({
          type: "movie",
          genreId: 28,
          minVotes: 1000,
          language: lang,
        }),
        fetchMediaByGenre({
          type: "movie",
          genreId: 878,
          minVotes: 1000,
          language: lang,
        }),
        fetchMediaByGenre({
          type: "movie",
          genreId: 53,
          minVotes: 1000,
          language: lang,
        }),
        fetchMediaByGenre({
          type: "movie",
          genreId: 10749,
          minVotes: 1000,
          language: lang,
        }),
        fetchMediaByKeyword({
          type: "movie",
          keywordId: 9715,
          minVotes: 500,
          language: lang,
        }),
        fetchMindBendingMovies(),
        discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 1 }),
        discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 2 }),
        discoverMovies({ "vote_count.gte": 4000, sort_by: "popularity.desc", page: 3 }),
        fetchMovieSections
          ? fetchMovieSections({ language: lang })
          : Promise.resolve({}),
      ]);

      const curatedAction = curateList(action, {
        minVotes: 2000,
        minRating: 6.2,
        minSize: 25,
        maxSize: 70,
      });

      const curatedScifi = curateList(scifi, {
        minVotes: 1500,
        minRating: 6.3,
        minSize: 20,
        maxSize: 60,
      });

      const curatedThrillers = curateList(thrillers, {
        minVotes: 1500,
        minRating: 6.3,
        minSize: 20,
        maxSize: 60,
      });

      const curatedRomance = curateList(romance, {
        minVotes: 1500,
        minRating: 6.2,
        minSize: 20,
        maxSize: 60,
      });

      const curatedVengeance = curateList(vengeance, {
        minVotes: 800,
        minRating: 6.0,
        minSize: 20,
        maxSize: 50,
      });

      const curatedBaseSections = {};
      for (const [key, list] of Object.entries(baseSections || {})) {
        if (!Array.isArray(list)) continue;

        if (key === "Top 10 hoy en España") {
          continue;
        }

        let params;
        if (key === "Premiadas") {
          params = {
            minVotes: 1200,
            minRating: 6.8,
            minSize: 20,
            maxSize: 60,
          };
        } else if (key === "Superéxito") {
          params = {
            minVotes: 3000,
            minRating: 6.5,
            minSize: 25,
            maxSize: 60,
          };
        } else if (key.startsWith("Década de")) {
          params = {
            minVotes: 800,
            minRating: 6.2,
            minSize: 15,
            maxSize: 60,
          };
        } else if (key === "Por género") {
          continue;
        } else {
          params = {
            minVotes: 700,
            minRating: 6.0,
            minSize: 20,
            maxSize: 60,
          };
        }

        curatedBaseSections[key] = curateList(list, params);
      }

      const curatedByGenre = {};
      const byGenreRaw = baseSections?.["Por género"] || {};
      for (const [gname, list] of Object.entries(byGenreRaw)) {
        if (!Array.isArray(list) || list.length === 0) continue;
        curatedByGenre[gname] = curateList(list, {
          minVotes: 600,
          minRating: 6.0,
          minSize: 15,
          maxSize: 50,
        });
      }
      if (Object.keys(curatedByGenre).length > 0) {
        curatedBaseSections["Por género"] = curatedByGenre;
      }

      const blockbustersRaw = [...blockbustersP1, ...blockbustersP2, ...blockbustersP3];
      curatedBaseSections["Superéxito"] = curateList(blockbustersRaw, {
        minVotes: 4000,
        minRating: 6.5,
        minSize: 25,
        maxSize: 80,
      });

      const imdbIdSet = new Set(topImdbIds);
      if (curatedBaseSections["Más votadas"]) {
        curatedBaseSections["Más votadas"] = curatedBaseSections[
          "Más votadas"
        ].filter((m) => !imdbIdSet.has(m.id));
      }
      const seenAfterMostVoted = new Set([
        ...imdbIdSet,
        ...(curatedBaseSections["Más votadas"] || []).map((m) => m.id),
      ]);
      if (curatedBaseSections["Superéxito"]) {
        curatedBaseSections["Superéxito"] = curatedBaseSections[
          "Superéxito"
        ].filter((m) => !seenAfterMostVoted.has(m.id));
      }

      return NextResponse.json({
        mind,
        action: curatedAction,
        scifi: curatedScifi,
        thrillers: curatedThrillers,
        romance: curatedRomance,
        vengeance: curatedVengeance,
        ...curatedBaseSections,
      });
    } else if (type === "tv") {
      const [
        drama,
        scifi_fantasy,
        crime,
        romance,
        animation,
        kDrama,
        baseSections,
      ] = await Promise.all([
        fetchMediaByGenre({
          type: "tv",
          genreId: 18,
          minVotes: 800,
          language: lang,
        }),
        fetchMediaByGenre({
          type: "tv",
          genreId: 10765,
          minVotes: 800,
          language: lang,
        }),
        fetchMediaByGenre({
          type: "tv",
          genreId: 80,
          minVotes: 800,
          language: lang,
        }),
        fetchRomanceSeriesWithGoodReviews({
          language: lang,
          pages: 1,
        }),
        fetchMediaByGenre({
          type: "tv",
          genreId: 16,
          minVotes: 400,
          language: lang,
        }),
        discoverTV({
          with_original_language: "ko",
          sort_by: "popularity.desc",
          "vote_count.gte": 300,
        }),
        fetchTVSections
          ? fetchTVSections({ language: lang })
          : Promise.resolve({}),
      ]);

      const curatedDrama = curateList(drama, {
        minVotes: 1000,
        minRating: 6.5,
        minSize: 25,
        maxSize: 70,
      });

      const curatedScifiFantasy = curateList(scifi_fantasy, {
        minVotes: 800,
        minRating: 6.4,
        minSize: 20,
        maxSize: 60,
      });

      const curatedCrime = curateList(crime, {
        minVotes: 800,
        minRating: 6.4,
        minSize: 20,
        maxSize: 60,
      });

      const curatedRomance = curateList(romance, {
        minVotes: 50,
        minRating: 6.0,
        minSize: 20,
        maxSize: 60,
      });

      const curatedAnimation = curateList(animation, {
        minVotes: 400,
        minRating: 6.2,
        minSize: 20,
        maxSize: 60,
      });

      const curatedKDrama = curateList(kDrama, {
        minVotes: 300,
        minRating: 6.0,
        minSize: 20,
        maxSize: 60,
      });

      const curatedBaseSections = {};
      const curatedByGenre = {};

      for (const [key, list] of Object.entries(baseSections || {})) {
        if (!Array.isArray(list)) continue;

        if (key === "Top 10 hoy en España") {
          continue;
        }

        let params;
        if (key === "Premiadas") {
          params = {
            minVotes: 800,
            minRating: 7.2,
            minSize: 20,
            maxSize: 60,
          };
        } else if (key === "Superéxito") {
          params = {
            minVotes: 1500,
            minRating: 6.5,
            minSize: 20,
            maxSize: 60,
          };
        } else if (key === "Más votadas") {
          params = {
            minVotes: 600,
            minRating: 6.2,
            minSize: 20,
            maxSize: 60,
          };
        } else if (key.startsWith("Década de")) {
          params = {
            minVotes: 600,
            minRating: 6.2,
            minSize: 15,
            maxSize: 60,
          };
        } else if (key === "Por género") {
          continue;
        } else {
          params = {
            minVotes: 500,
            minRating: 6.0,
            minSize: 20,
            maxSize: 60,
          };
        }

        curatedBaseSections[key] = curateList(list, params);
      }

      const byGenreRaw = baseSections?.["Por género"] || {};
      for (const [gname, list] of Object.entries(byGenreRaw)) {
        if (!Array.isArray(list) || list.length === 0) continue;
        curatedByGenre[gname] = curateList(list, {
          minVotes: 400,
          minRating: 6.0,
          minSize: 15,
          maxSize: 50,
        });
      }
      if (Object.keys(curatedByGenre).length > 0) {
        curatedBaseSections["Por género"] = curatedByGenre;
      }

      return NextResponse.json({
        drama: curatedDrama,
        scifi_fantasy: curatedScifiFantasy,
        crime: curatedCrime,
        kDrama: curatedKDrama,
        romance: curatedRomance,
        animation: curatedAnimation,
        ...curatedBaseSections,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error(`Error loading deferred data for ${type}:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
