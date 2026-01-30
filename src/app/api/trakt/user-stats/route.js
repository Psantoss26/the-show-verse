import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const TRAKT_API = "https://api.trakt.tv";
const TMDB_API = "https://api.themoviedb.org/3";

function traktHeaders(accessToken = null) {
  const key = process.env.TRAKT_CLIENT_ID;
  if (!key) throw new Error("Missing TRAKT_CLIENT_ID env var");

  const headers = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": key,
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
      { next: { revalidate: 86400 } }
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

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("trakt_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No Trakt access token found" },
        { status: 401 },
      );
    }

    // Obtener información del usuario
    const userRes = await fetch(`${TRAKT_API}/users/settings`, {
      headers: traktHeaders(accessToken),
    });

    if (!userRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch user info" },
        { status: userRes.status },
      );
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
      })
    );

    // Obtener series más vistas
    const watchedShowsRes = await fetch(
      `${TRAKT_API}/users/${username}/watched/shows?extended=full`,
      {
        headers: traktHeaders(accessToken),
      },
    );

    const watchedShows = watchedShowsRes.ok ? await watchedShowsRes.json() : [];

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
      })
    );

    // Obtener historial reciente para análisis temporal
    const historyRes = await fetch(
      `${TRAKT_API}/users/${username}/history?limit=10000`,
      {
        headers: traktHeaders(accessToken),
      },
    );

    const history = historyRes.ok ? await historyRes.json() : [];

    return NextResponse.json({
      username,
      stats,
      watchedMovies: moviesWithSpanishTitles,
      watchedShows: showsWithSpanishTitles,
      history,
    });
  } catch (e) {
    console.error("Error in user-stats route:", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
