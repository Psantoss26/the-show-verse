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

async function getTMDbTitle(tmdbId, type) {
  try {
    const endpoint = type === "movie" ? "movie" : "tv";
    const res = await fetch(
      `${TMDB_API}/${endpoint}/${tmdbId}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES`,
      { next: { revalidate: 86400 } },
    );

    if (res.ok) {
      const data = await res.json();
      return type === "movie" ? data.title : data.name;
    }
  } catch (err) {
    console.error(`Error fetching TMDb title for ${type} ${tmdbId}:`, err);
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

export async function GET() {
  try {
    const cookieStore = await cookies();

    // ✅ AUTH: Usar la lógica centralizada que refresca tokens si es necesario
    const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore);

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

    // Obtener estadísticas del usuario
    const statsRes = await fetch(`${TRAKT_API}/users/${username}/stats`, {
      headers: traktHeaders(accessToken),
    });

    if (!statsRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user stats" },
        { status: statsRes.status },
      );
    }

    const stats = await statsRes.json();

    // Obtener películas más vistas
    const watchedMoviesRes = await fetch(
      `${TRAKT_API}/users/${username}/watched/movies?extended=full`,
      {
        headers: traktHeaders(accessToken),
      },
    );

    const watchedMovies = watchedMoviesRes.ok
      ? await watchedMoviesRes.json()
      : [];

    // Enriquecer películas con títulos en español
    const moviesWithSpanishTitles = await Promise.all(
      watchedMovies.slice(0, 20).map(async (item) => {
        const tmdbId = item.movie?.ids?.tmdb;
        if (tmdbId) {
          const spanishTitle = await getTMDbTitle(tmdbId, "movie");
          if (spanishTitle) {
            return {
              ...item,
              movie: {
                ...item.movie,
                title: spanishTitle,
              },
            };
          }
        }
        return item;
      }),
    );

    // Obtener series más vistas
    const watchedShowsRes = await fetch(
      `${TRAKT_API}/users/${username}/watched/shows?extended=full`,
      {
        headers: traktHeaders(accessToken),
      },
    );

    const watchedShows = watchedShowsRes.ok ? await watchedShowsRes.json() : [];

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

    // Enriquecer series con títulos en español
    const showsWithSpanishTitles = await Promise.all(
      watchedShows.slice(0, 20).map(async (item) => {
        const tmdbId = item.show?.ids?.tmdb;
        if (tmdbId) {
          const spanishTitle = await getTMDbTitle(tmdbId, "tv");
          if (spanishTitle) {
            return {
              ...item,
              show: {
                ...item.show,
                title: spanishTitle,
              },
            };
          }
        }
        return item;
      }),
    );

    // Obtener historial reciente para análisis temporal
    const historyRes = await fetch(
      `${TRAKT_API}/users/${username}/history?limit=10000`,
      {
        headers: traktHeaders(accessToken),
      },
    );

    const history = historyRes.ok ? await historyRes.json() : [];

    // Obtener créditos (actores y directores) de las películas más vistas
    const actorCount = {};
    const directorCount = {};

    const creditsPromises = moviesWithSpanishTitles
      .slice(0, 50)
      .map(async (item) => {
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

    const topActors = Object.entries(actorCount)
      .map(([id, data]) => ({ id: parseInt(id), ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const topDirectors = Object.entries(directorCount)
      .map(([id, data]) => ({ id: parseInt(id), ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const response = NextResponse.json({
      username,
      stats,
      genres: genreCounts,
      watchedMovies: moviesWithSpanishTitles,
      watchedShows: showsWithSpanishTitles,
      history,
      topActors,
      topDirectors,
    });

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
