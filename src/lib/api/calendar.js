export async function getMoviesByDate(selectedDate) {
  const formattedDate = selectedDate.toISOString().split("T")[0];
  let page = 1;
  let totalPages = 1;
  const movies = [];

  do {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&sort_by=release_date.asc&release_date.gte=${formattedDate}&release_date.lte=${formattedDate}&region=ES&page=${page}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data?.results?.length > 0) {
      movies.push(...data.results);
    }

    totalPages = data.total_pages || 1;
    page++;
  } while (page <= totalPages);

  return movies;
}

export async function getMoviesByDateRange(startDate, endDate) {
  const formattedStart = startDate.toISOString().split("T")[0];
  const formattedEnd = endDate.toISOString().split("T")[0];
  let page = 1;
  let totalPages = 1;
  const movies = [];

  do {
    const url = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&sort_by=release_date.asc&release_date.gte=${formattedStart}&release_date.lte=${formattedEnd}&region=ES&page=${page}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data?.results?.length > 0) {
      movies.push(...data.results);
    }

    totalPages = data.total_pages || 1;
    page++;
  } while (page <= totalPages && page <= 5); // Limitar a 5 páginas para rangos amplios

  return movies;
}
