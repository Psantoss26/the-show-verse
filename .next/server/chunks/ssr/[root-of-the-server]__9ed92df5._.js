module.exports = {

"[project]/src/lib/api/tmdb.js [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "fetchCultClassics": (()=>fetchCultClassics),
    "fetchDramaMovies": (()=>fetchDramaMovies),
    "fetchFeaturedMovies": (()=>fetchFeaturedMovies),
    "fetchGenres": (()=>fetchGenres),
    "fetchMindBendingMovies": (()=>fetchMindBendingMovies),
    "fetchMoviesByGenre": (()=>fetchMoviesByGenre),
    "fetchPopularInCountry": (()=>fetchPopularInCountry),
    "fetchPopularInUS": (()=>fetchPopularInUS),
    "fetchPopularMovies": (()=>fetchPopularMovies),
    "fetchRecommendedMovies": (()=>fetchRecommendedMovies),
    "fetchRisingMovies": (()=>fetchRisingMovies),
    "fetchTopActionMovies": (()=>fetchTopActionMovies),
    "fetchTopRatedMovies": (()=>fetchTopRatedMovies),
    "fetchTrendingMovies": (()=>fetchTrendingMovies),
    "fetchUnderratedMovies": (()=>fetchUnderratedMovies),
    "getActorDetails": (()=>getActorDetails),
    "getActorMovies": (()=>getActorMovies),
    "getCredits": (()=>getCredits),
    "getDetails": (()=>getDetails),
    "getLogos": (()=>getLogos),
    "getProviders": (()=>getProviders),
    "getRecommendations": (()=>getRecommendations),
    "getReviews": (()=>getReviews)
});
const API_KEY = ("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b");
const BASE_URL = 'https://api.themoviedb.org/3';
async function fetchFromTMDb(endpoint) {
    try {
        // Verificar que la clave de la API está configurada correctamente
        if ("TURBOPACK compile-time falsy", 0) {
            "TURBOPACK unreachable";
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
async function fetchTopRatedMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchTrendingMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}`);
    const data = await res.json();
    return data.results;
}
async function fetchPopularMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchRecommendedMovies(sessionId) {
    const res = await fetch(`https://api.themoviedb.org/3/account/0/recommendations?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&session_id=${sessionId}&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchDramaMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&with_genres=18&sort_by=vote_average.desc&vote_count.gte=100`);
    const data = await res.json();
    return data.results;
}
async function fetchCultClassics() {
    const res = await fetch(`https://api.themoviedb.org/3/list/8146?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}`);
    const data = await res.json();
    return data.items || [];
}
async function fetchPopularInCountry(countryCode) {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&region=${countryCode}&sort_by=popularity.desc`);
    const data = await res.json();
    return data.results;
}
async function fetchTopActionMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&with_genres=28&sort_by=vote_average.desc&vote_count.gte=200&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchMindBendingMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&with_keywords=2343&sort_by=vote_average.desc&vote_count.gte=100&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchPopularInUS() {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&region=US&sort_by=popularity.desc&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchUnderratedMovies() {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&sort_by=vote_average.desc&vote_count.lte=200&vote_average.gte=7.0&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchRisingMovies() {
    const currentYear = new Date().getFullYear();
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&primary_release_year=${currentYear}&sort_by=vote_average.asc&vote_count.gte=50&language=es-ES`);
    const data = await res.json();
    return data.results;
}
async function fetchFeaturedMovies() {
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
async function fetchGenres() {
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
async function fetchMoviesByGenre(genreId) {
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
async function getDetails(type, id) {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}&language=es-ES&append_to_response=external_ids`);
    const data = await res.json();
    if (type === 'tv') {
        data.imdb_id = data.external_ids?.imdb_id || null;
    }
    return data;
}
async function getLogos(type, id) {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}/images?api_key=${("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b")}`);
    const data = await res.json();
    // Filtrar logos en español o inglés
    const filtered = data.logos.filter((logo)=>logo.iso_639_1 === 'es' || logo.iso_639_1 === 'en');
    if (filtered.length === 0) return null;
    // Intentar obtener el que más votos tenga
    const voted = filtered.filter((logo)=>logo.vote_count > 0);
    const bestLogo = (voted.length > 0 ? voted : filtered // fallback si ninguno tiene votos
    ).reduce((max, logo)=>{
        return (logo.vote_count || 0) > (max.vote_count || 0) ? logo : max;
    });
    return bestLogo?.file_path || null;
}
async function getRecommendations(type, id) {
    if (!type || !id) {
        console.error("Invalid parameters for getRecommendations");
        return null;
    }
    return await fetchFromTMDb(`/${type}/${id}/recommendations`);
}
async function getCredits(type, id) {
    if (!type || !id) {
        console.error("Invalid parameters for getCredits");
        return null;
    }
    return await fetchFromTMDb(`/${type}/${id}/credits`);
}
async function getProviders(type, id) {
    if (!type || !id) {
        console.error("Invalid parameters for getProviders");
        return null;
    }
    return await fetchFromTMDb(`/${type}/${id}/watch/providers`);
}
async function getReviews(type, id) {
    if (!type || !id) {
        console.error("Invalid parameters for getReviews");
        return null;
    }
    return await fetchFromTMDb(`/${type}/${id}/reviews`);
}
async function getActorDetails(id) {
    try {
        const response = await fetch(`${BASE_URL}/person/${id}?api_key=${API_KEY}`);
        if (!response.ok) throw new Error('Error fetching actor details');
        return await response.json();
    } catch (error) {
        console.error('Error fetching actor details:', error);
        return null;
    }
}
async function getActorMovies(id) {
    try {
        const response = await fetch(`${BASE_URL}/person/${id}/movie_credits?api_key=${API_KEY}`);
        if (!response.ok) throw new Error('Error fetching actor movies');
        return await response.json();
    } catch (error) {
        console.error('Error fetching actor movies:', error);
        return {
            cast: []
        }; // Devolver un array vacío si hay error
    }
}
}}),
"[next]/internal/font/google/anton_e4e05db9.module.css [app-ssr] (css module)": ((__turbopack_context__) => {

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.v({
  "className": "anton_e4e05db9-module__x49lcG__className",
});
}}),
"[next]/internal/font/google/anton_e4e05db9.js [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>__TURBOPACK__default__export__)
});
var __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__ = __turbopack_context__.i("[next]/internal/font/google/anton_e4e05db9.module.css [app-ssr] (css module)");
;
const fontData = {
    className: __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].className,
    style: {
        fontFamily: "'Anton', 'Anton Fallback'",
        fontWeight: 400,
        fontStyle: "normal"
    }
};
if (__TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].variable != null) {
    fontData.variable = __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$ssr$5d$__$28$css__module$29$__["default"].variable;
}
const __TURBOPACK__default__export__ = fontData;
}}),
"[project]/src/components/MainDashboard.jsx [app-ssr] (ecmascript)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const e = new Error(`Could not parse module '[project]/src/components/MainDashboard.jsx'

Unexpected eof`);
e.code = 'MODULE_UNPARSEABLE';
throw e;}}),

};

//# sourceMappingURL=%5Broot-of-the-server%5D__9ed92df5._.js.map