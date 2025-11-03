const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

async function fetchFromTMDb(endpoint) {
  try {
    // Verificar que la clave de la API está configurada correctamente
    if (!API_KEY) {
      console.error("API key is missing!");
      return null;
    }

    const response = await fetch(`${BASE_URL}${endpoint}?api_key=${API_KEY}&language=es-ES`);

    // Verificar si la respuesta fue exitosa
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`Error fetching data from TMDb: ${response.statusText}`, errorData);
      return null; // Regresar null si la respuesta no es OK
    }

    // Parsear la respuesta en formato JSON
    const data = await response.json();

    // Verificar si los datos son válidos
    if (!data || Object.keys(data).length === 0) {
      console.warn(`No data returned for endpoint: ${endpoint}`);
      return null; // Regresar null si no hay datos
    }

    return data;
  } catch (error) {
    // Manejo de errores en caso de que falle la petición
    console.error(`Error with ${endpoint}:`, error);
    return null; // Regresar null en caso de error
  }
}

export async function fetchTopRatedMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES`);
  const data = await res.json();
  return data.results;
}

export async function fetchTrendingMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`);
  const data = await res.json();
  return data.results;
}

export async function fetchPopularMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES`);
  const data = await res.json();
  return data.results;
}

export async function fetchRecommendedMovies(sessionId) {
  const res = await fetch(`https://api.themoviedb.org/3/account/0/recommendations?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&session_id=${sessionId}&language=es-ES`);
  const data = await res.json();
  return data.results;
}

export async function fetchDramaMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&with_genres=18&sort_by=vote_average.desc&vote_count.gte=100`);
  const data = await res.json();
  return data.results;
}

export async function fetchCultClassics() {
  const res = await fetch(`https://api.themoviedb.org/3/list/8146?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`);
  const data = await res.json();
  return data.items || [];
}

export async function fetchPopularInCountry(countryCode) {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&region=${countryCode}&sort_by=popularity.desc`);
  const data = await res.json();
  return data.results;
}

// 1. Mejores películas de acción
export async function fetchTopActionMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&with_genres=28&sort_by=vote_average.desc&vote_count.gte=200&language=es-ES`)
  const data = await res.json()
  return data.results
}

// 2. Películas con guion complejo (plot twist)
export async function fetchMindBendingMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&with_keywords=2343&sort_by=vote_average.desc&vote_count.gte=100&language=es-ES`)
  const data = await res.json()
  return data.results
}

// 3. Populares a nivel internacional (EE.UU.)
export async function fetchPopularInUS() {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&region=US&sort_by=popularity.desc&language=es-ES`)
  const data = await res.json()
  return data.results
}

// 4. Infravaloradas (pocas valoraciones pero buena nota)
export async function fetchUnderratedMovies() {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&sort_by=vote_average.desc&vote_count.lte=200&vote_average.gte=7.0&language=es-ES`)
  const data = await res.json()
  return data.results
}

// 5. Películas que están mejorando su puntuación
export async function fetchRisingMovies() {
  const currentYear = new Date().getFullYear()
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&primary_release_year=${currentYear}&sort_by=vote_average.asc&vote_count.gte=50&language=es-ES`)
  const data = await res.json()
  return data.results
}

export async function fetchFeaturedMovies() {
  try {
    const response = await fetch(`${BASE_URL}/movie/popular?api_key=${API_KEY}&language=es-ES&page=1`);
    if (!response.ok) {
      throw new Error('Error fetching featured movies');
    }
    const data = await response.json();
    return data.results; // Regresa las películas populares
  } catch (error) {
    console.error('Error fetching data from TMDb: ', error);
    return []; // Regresa un array vacío si hay un error
  }
}

export async function fetchGenres() {
  try {
    const response = await fetch(`${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=es-ES`);
    if (!response.ok) {
      throw new Error('Error fetching genres');
    }
    const data = await response.json();
    return data.genres; // Regresa los géneros
  } catch (error) {
    console.error('Error fetching data from TMDb: ', error);
    return []; // Regresa un array vacío si hay un error
  }
}

export async function fetchMoviesByGenre(genreId) {
  try {
    const response = await fetch(`${BASE_URL}/discover/movie?api_key=${API_KEY}&language=es-ES&with_genres=${genreId}`);
    if (!response.ok) {
      throw new Error(`Error fetching movies for genre ${genreId}`);
    }
    const data = await response.json();
    return data.results; // Regresa las películas filtradas por género
  } catch (error) {
    console.error('Error fetching data from TMDb: ', error);
    return []; // Regresa un array vacío si hay un error
  }
}

// Funciones específicas para obtener datos de la API
export async function getDetails(type, id) {
  const res = await fetch(
    `https://api.themoviedb.org/3/${type}/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&append_to_response=external_ids`
  );  
  const data = await res.json();

  if (type === 'tv') {
    data.imdb_id = data.external_ids?.imdb_id || null;
  }

  return data;
}

export async function getLogos(type, id) {
  const res = await fetch(
    `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`
  );
  const data = await res.json();

  // Filtrar logos en español o inglés
  const filtered = data.logos.filter(
    (logo) => logo.iso_639_1 === 'es' || logo.iso_639_1 === 'en'
  );

  if (filtered.length === 0) return null;

  // Intentar obtener el que más votos tenga
  const voted = filtered.filter((logo) => logo.vote_count > 0);

  const bestLogo = (voted.length > 0
    ? voted
    : filtered // fallback si ninguno tiene votos
  ).reduce((max, logo) => {
    return (logo.vote_count || 0) > (max.vote_count || 0) ? logo : max;
  });

  return bestLogo?.file_path || null;
}



export async function getRecommendations(type, id) {
  if (!type || !id) {
    console.error("Invalid parameters for getRecommendations");
    return null;
  }
  return await fetchFromTMDb(`/${type}/${id}/recommendations`);
}

export async function getCredits(type, id) {
  if (!type || !id) {
    console.error("Invalid parameters for getCredits");
    return null;
  }
  return await fetchFromTMDb(`/${type}/${id}/credits`);
}

export async function getProviders(type, id) {
  if (!type || !id) {
    console.error("Invalid parameters for getProviders");
    return null;
  }
  return await fetchFromTMDb(`/${type}/${id}/watch/providers`);
}

export async function getReviews(type, id) {
  if (!type || !id) {
    console.error("Invalid parameters for getReviews");
    return null;
  }
  return await fetchFromTMDb(`/${type}/${id}/reviews`);
}

// Función para obtener detalles del actor
export async function getActorDetails(id) {
    try {
      const response = await fetch(`${BASE_URL}/person/${id}?api_key=${API_KEY}`);
      if (!response.ok) throw new Error('Error fetching actor details');
      return await response.json();
    } catch (error) {
      console.error('Error fetching actor details:', error);
      return null;
    }
  }
  
// Función para obtener películas en las que ha trabajado el actor
export async function getActorMovies(id) {
    try {
      const response = await fetch(`${BASE_URL}/person/${id}/movie_credits?api_key=${API_KEY}`);
      if (!response.ok) throw new Error('Error fetching actor movies');
      return await response.json();
    } catch (error) {
      console.error('Error fetching actor movies:', error);
      return { cast: [] };  // Devolver un array vacío si hay error
    }
  }

// Función para obtener ratings por episodio de una serie de TV
export async function getTvEpisodeRatings(tmdbId, { excludeSpecials = true } = {}) {
  const res = await fetch(
    `/api/tv/${tmdbId}/ratings?excludeSpecials=${excludeSpecials ? 'true' : 'false'}`
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'No se pudo obtener ratings');
  return json;
}
