import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getValidTraktToken,
  setTraktCookies,
  clearTraktCookies,
} from "@/lib/trakt/server";

const TRAKT_API = "https://api.trakt.tv";
const TMDB_API = "https://api.themoviedb.org/3";

function traktHeaders(accessToken = null) {
  const key = process.env.TRAKT_CLIENT_ID;
  if (!key) throw new Error("Missing TRAKT_CLIENT_ID env var");

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": key,
    "User-Agent":
      process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js; Trakt user-stats)",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  return headers;
}

async function getTMDbDetails(tmdbId, type) {
  try {
    const endpoint = type === "movie" ? "movie" : "tv";
    const res = await fetch(
      `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES`,
      { next: { revalidate: 86400 } },
    );

    if (res.ok) {
      const data = await res.json();
      return {
        title: type === "movie" ? data.title : data.name,
        poster_path: data.poster_path || null,
        backdrop_path: data.backdrop_path || null,
        year:
          (type === "movie" ? data.release_date : data.first_air_date)?.slice(
            0,
            4,
          ) || null,
        vote_average: data.vote_average || null,
        genres: data.genres || [],
      };
    }
  } catch (err) {
    console.error(`Error fetching TMDb details for ${type} ${tmdbId}:`, err);
  }
  return null;
}

async function getTMDbCredits(tmdbId, type) {
  try {
    const endpoint = type === "movie" ? "movie" : "tv";
    const res = await fetch(
      `${TMDB_API}/${endpoint}/${tmdbId}/credits?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES`,
      { next: { revalidate: 86400 } },
    );

    if (res.ok) {
      const data = await res.json();
      return {
        cast: data.cast || [],
        crew: data.crew || [],
      };
    }
  } catch (err) {
    console.error(`Error fetching TMDb credits for ${type} ${tmdbId}:`, err);
  }
  return { cast: [], crew: [] };
}

export async function GET(request) {
  try {
    const searchParams = request?.nextUrl?.searchParams || new URLSearchParams();
    const includePeople = searchParams.get("includePeople") !== "0";
    const peopleOnly = searchParams.get("peopleOnly") === "1";
    const localizeTitles = searchParams.get("localizeTitles") !== "0";
    const historyLimitRaw = Number(searchParams.get("historyLimit") || 10000);
    const historyLimit = Number.isFinite(historyLimitRaw)
      ? Math.max(0, Math.min(10000, Math.floor(historyLimitRaw)))
      : 10000;

    const cookieStore = await cookies();

    // ✅ AUTH: Usar la lógica centralizada que refresca tokens si es necesario
    const { token, refreshedTokens, shouldClear } =
      await getValidTraktToken(cookieStore);

    if (!token) {
      const res = NextResponse.json(
        { error: "No Trakt access token found", notConnected: true },
        { status: 401 },
      );
      if (shouldClear) clearTraktCookies(res);
      return res;
    }

    const accessToken = token;

    // Obtener información del usuario
    const userRes = await fetch(`${TRAKT_API}/users/settings`, {
      headers: traktHeaders(accessToken),
    });

    if (!userRes.ok) {
      const res = NextResponse.json(
        { error: "Failed to fetch user info", notConnected: true },
        { status: userRes.status },
      );
      // Si 401 (token revocado/inválido), limpiar
      if (userRes.status === 401) clearTraktCookies(res);
      return res;
    }

    const userInfo = await userRes.json();
    const username = userInfo.user?.ids?.slug;

    if (!username) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const headers = traktHeaders(accessToken);
    const statsPromise = peopleOnly
      ? Promise.resolve(null)
      : fetch(`${TRAKT_API}/users/${username}/stats`, { headers });
    const watchedMoviesPromise = fetch(
      `${TRAKT_API}/users/${username}/watched/movies?extended=full`,
      { headers },
    );
    const watchedShowsPromise = peopleOnly
      ? Promise.resolve(null)
      : fetch(`${TRAKT_API}/users/${username}/watched/shows?extended=full`, {
          headers,
        });
    const historyPromise =
      peopleOnly || historyLimit <= 0
        ? Promise.resolve(null)
        : fetch(
            `${TRAKT_API}/users/${username}/history?limit=${historyLimit}`,
            { headers },
          );

    const [statsRes, watchedMoviesRes, watchedShowsRes, historyRes] =
      await Promise.all([
        statsPromise,
        watchedMoviesPromise,
        watchedShowsPromise,
        historyPromise,
      ]);

    if (!peopleOnly && !statsRes?.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user stats" },
        { status: statsRes?.status || 500 },
      );
    }

    const [stats, watchedMovies, watchedShows, history] = await Promise.all([
      statsRes?.ok ? statsRes.json() : Promise.resolve(null),
      watchedMoviesRes.ok ? watchedMoviesRes.json() : Promise.resolve([]),
      watchedShowsRes?.ok ? watchedShowsRes.json() : Promise.resolve([]),
      historyRes?.ok ? historyRes.json() : Promise.resolve([]),
    ]);

    const moviesWithSpanishTitles = localizeTitles
      ? await Promise.all(
          watchedMovies.slice(0, 20).map(async (item) => {
            const tmdbId = item.movie?.ids?.tmdb;
            if (tmdbId) {
              const tmdb = await getTMDbDetails(tmdbId, "movie");
              if (tmdb) {
                return {
                  ...item,
                  movie: {
                    ...item.movie,
                    title: tmdb.title || item.movie?.title,
                    year: tmdb.year || item.movie?.year,
                    poster_path: tmdb.poster_path,
                    backdrop_path: tmdb.backdrop_path,
                    vote_average: tmdb.vote_average,
                    genres: tmdb.genres,
                  },
                };
              }
            }
            return item;
          }),
        )
      : watchedMovies.slice(0, 20);

    const showsWithSpanishTitles = localizeTitles
      ? await Promise.all(
          watchedShows.slice(0, 20).map(async (item) => {
            const tmdbId = item.show?.ids?.tmdb;
            if (tmdbId) {
              const tmdb = await getTMDbDetails(tmdbId, "tv");
              if (tmdb) {
                return {
                  ...item,
                  show: {
                    ...item.show,
                    title: tmdb.title || item.show?.title,
                    year: tmdb.year || item.show?.year,
                    poster_path: tmdb.poster_path,
                    backdrop_path: tmdb.backdrop_path,
                    vote_average: tmdb.vote_average,
                    genres: tmdb.genres,
                  },
                };
              }
            }
            return item;
          }),
        )
      : watchedShows.slice(0, 20);

    // Calcular estadísticas de géneros a partir de todo el historial visto
    const genreCounts = {};

    watchedMovies.forEach((item) => {
      const genres = item.movie?.genres || [];
      genres.forEach((genre) => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    });

    watchedShows.forEach((item) => {
      const genres = item.show?.genres || [];
      genres.forEach((genre) => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    });

    // Obtener créditos (actores y directores) de las películas más vistas
    const actorCount = {};
    const directorCount = {};

    if (includePeople) {
      const creditsPromises = watchedMovies.slice(0, 50).map(async (item) => {
        const tmdbId = item.movie?.ids?.tmdb;
        if (tmdbId) {
          const credits = await getTMDbCredits(tmdbId, "movie");

          // Contar actores (top 5 de cada película)
          credits.cast.slice(0, 5).forEach((actor) => {
            if (actor.name) {
              actorCount[actor.id] = {
                name: actor.name,
                profile_path: actor.profile_path,
                count: (actorCount[actor.id]?.count || 0) + 1,
              };
            }
          });

          // Contar directores
          credits.crew
            .filter((member) => member.job === "Director")
            .forEach((director) => {
              if (director.name) {
                directorCount[director.id] = {
                  name: director.name,
                  profile_path: director.profile_path,
                  count: (directorCount[director.id]?.count || 0) + 1,
                };
              }
            });
        }
      });

      await Promise.all(creditsPromises);
    }

    const topActors = Object.entries(actorCount)
      .map(([id, data]) => ({ id: parseInt(id), ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const topDirectors = Object.entries(directorCount)
      .map(([id, data]) => ({ id: parseInt(id), ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const payload = peopleOnly
      ? { username, topActors, topDirectors }
      : {
          username,
          stats,
          genres: genreCounts,
          watchedMovies: moviesWithSpanishTitles,
          watchedShows: showsWithSpanishTitles,
          history,
          historyLimit,
          topActors,
          topDirectors,
        };

    const response = NextResponse.json(payload);

    if (refreshedTokens) {
      setTraktCookies(response, refreshedTokens);
    }

    return response;
  } catch (e) {
    console.error("Error in user-stats route:", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
