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
    "getReviews": (()=>getReviews),
    "getTvEpisodeRatings": (()=>getTvEpisodeRatings)
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
async function getTvEpisodeRatings(tmdbId, { excludeSpecials = true } = {}) {
    const res = await fetch(`/api/tv/${tmdbId}/ratings?excludeSpecials=${excludeSpecials ? 'true' : 'false'}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'No se pudo obtener ratings');
    return json;
}
}}),
"[project]/src/components/DetailsClient.jsx [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>DetailsClient)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-react.js [app-ssr] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-slide.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/calendar.js [app-ssr] (ecmascript) <export default as CalendarIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClockIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clock.js [app-ssr] (ecmascript) <export default as ClockIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$film$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FilmIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/film.js [app-ssr] (ecmascript) <export default as FilmIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__GlobeIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/globe.js [app-ssr] (ecmascript) <export default as GlobeIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__StarIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/star.js [app-ssr] (ecmascript) <export default as StarIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquareIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/message-square.js [app-ssr] (ecmascript) <export default as MessageSquareIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$dollar$2d$sign$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeDollarSignIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/badge-dollar-sign.js [app-ssr] (ecmascript) <export default as BadgeDollarSignIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LinkIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/link.js [app-ssr] (ecmascript) <export default as LinkIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$tag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TagIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/tag.js [app-ssr] (ecmascript) <export default as TagIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ImageIcon$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/image.js [app-ssr] (ecmascript) <export default as ImageIcon>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$image$2d$off$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ImageOff$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/image-off.js [app-ssr] (ecmascript) <export default as ImageOff>");
'use client';
;
;
;
;
;
function DetailsClient({ type, id, data, recommendations, castData, providers, reviews }) {
    const image = data.poster_path || data.profile_path;
    const title = data.title || data.name;
    const recRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])();
    const [reviewLimit, setReviewLimit] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(2);
    const [useBackdrop, setUseBackdrop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const scrollLeft = (ref)=>ref.current.scrollBy({
            left: -400,
            behavior: 'smooth'
        });
    const scrollRight = (ref)=>ref.current.scrollBy({
            left: 400,
            behavior: 'smooth'
        });
    const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(data.title || data.name)}`;
    // === NUEVO: ratings por episodio ===
    const [ratings, setRatings] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [ratingsError, setRatingsError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [ratingsLoading, setRatingsLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let ignore = false;
        async function load() {
            if (type !== 'tv') return;
            setRatingsLoading(true);
            setRatingsError(null);
            try {
                const res = await fetch(`/api/tv/${id}/ratings?excludeSpecials=true`);
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'No se pudo obtener ratings');
                if (!ignore) setRatings(json);
            } catch (e) {
                if (!ignore) setRatingsError(e.message);
            } finally{
                if (!ignore) setRatingsLoading(false);
            }
        }
        load();
        return ()=>{
            ignore = true;
        };
    }, [
        id,
        type
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative min-h-screen",
        children: [
            useBackdrop && data.backdrop_path ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-4 z-0 bg-cover bg-center blur-[10px]",
                        style: {
                            backgroundImage: `url(https://image.tmdb.org/t/p/original${data.backdrop_path})`
                        }
                    }, void 0, false, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 65,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-0 z-0"
                    }, void 0, false, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 71,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0 z-0 bg-black"
            }, void 0, false, {
                fileName: "[project]/src/components/DetailsClient.jsx",
                lineNumber: 74,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute top-4 right-4 z-20",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: ()=>setUseBackdrop((prev)=>!prev),
                    className: "p-2 rounded-full transition-colors",
                    "aria-label": "Alternar fondo",
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$image$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ImageIcon$3e$__["ImageIcon"], {
                        className: `w-6 h-6 ${useBackdrop ? 'text-blue-500 hover:text-blue-400' : 'text-gray-500 hover:text-gray-400'}`
                    }, void 0, false, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 84,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/components/DetailsClient.jsx",
                    lineNumber: 79,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/DetailsClient.jsx",
                lineNumber: 78,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0 z-0 bg-black/50"
            }, void 0, false, {
                fileName: "[project]/src/components/DetailsClient.jsx",
                lineNumber: 95,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative z-10 px-4 py-10 lg:py-16 max-w-6xl mx-auto text-white",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col lg:flex-row gap-8 mb-12",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "w-full lg:w-1/3 max-w-sm flex flex-col gap-4",
                                children: [
                                    image ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                        src: `https://image.tmdb.org/t/p/w500${image}`,
                                        alt: title,
                                        className: "rounded-lg shadow-lg w-full h-auto object-cover"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 104,
                                        columnNumber: 13
                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg shadow-lg",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$image$2d$off$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ImageOff$3e$__["ImageOff"], {
                                            size: 64,
                                            className: "text-gray-500"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                            lineNumber: 111,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 110,
                                        columnNumber: 13
                                    }, this),
                                    providers && providers.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "mt-2",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex flex-wrap gap-1",
                                            children: [
                                                providers.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "p-2 flex items-center",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                            src: `https://image.tmdb.org/t/p/original${p.logo_path}`,
                                                            alt: p.provider_name,
                                                            className: "w-10 h-10 object-contain rounded-lg transition-transform duration-300 ease-in-out hover:scale-110"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                            lineNumber: 121,
                                                            columnNumber: 21
                                                        }, this)
                                                    }, p.provider_id, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 120,
                                                        columnNumber: 19
                                                    }, this)),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                    href: `https://www.themoviedb.org/${type}/${id}/watch`,
                                                    target: "_blank",
                                                    className: "p-2 flex items-center",
                                                    rel: "noreferrer",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: "https://play-lh.googleusercontent.com/Riuz226TXAawu8ZXlL7wnsjtMHkTMTDh_RSRiozAdoKe2TyGG4cLp3rPB0CxQFEUzFc",
                                                        alt: "JustWatch",
                                                        className: "object-contain w-11 h-11 rounded-lg transition-transform duration-300 ease-in-out hover:scale-110"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 136,
                                                        columnNumber: 19
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/DetailsClient.jsx",
                                                    lineNumber: 130,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                            lineNumber: 118,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 117,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 102,
                                columnNumber: 9
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 flex flex-col gap-6",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                                className: "text-4xl font-bold mb-2 mt-2",
                                                children: title
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 149,
                                                columnNumber: 13
                                            }, this),
                                            data.tagline && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "italic text-gray-300 mb-4",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$tag$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__TagIcon$3e$__["TagIcon"], {
                                                        className: "inline w-4 h-4 mr-1"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 153,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    data.tagline
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 152,
                                                columnNumber: 15
                                            }, this),
                                            data.overview && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-gray-300 text-base leading-relaxed",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$message$2d$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MessageSquareIcon$3e$__["MessageSquareIcon"], {
                                                        className: "inline w-4 h-4 mr-1"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 159,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    data.overview
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 158,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 148,
                                        columnNumber: 11
                                    }, this),
                                    (data.homepage || data.imdb_id) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-4 items-center",
                                        children: [
                                            data.homepage && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: data.homepage,
                                                target: "_blank",
                                                className: "text-green-400 hover:underline inline-flex items-center gap-2",
                                                rel: "noreferrer",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LinkIcon$3e$__["LinkIcon"], {
                                                        className: "w-4 h-4 text-green-300"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 173,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Sitio web"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 174,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 167,
                                                columnNumber: 17
                                            }, this),
                                            data.imdb_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: `https://www.imdb.com/title/${data.imdb_id}`,
                                                        target: "_blank",
                                                        className: "text-yellow-400 hover:underline inline-flex items-center gap-2",
                                                        rel: "noreferrer",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LinkIcon$3e$__["LinkIcon"], {
                                                                className: "w-4 h-4 text-yellow-300"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 185,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "IMDb"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 186,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 179,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                        href: `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(title)}`,
                                                        target: "_blank",
                                                        rel: "noopener noreferrer",
                                                        className: "text-blue-400 hover:underline inline-flex items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LinkIcon$3e$__["LinkIcon"], {
                                                                className: "w-4 h-4 text-blue-300"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 195,
                                                                columnNumber: 21
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "FilmAffinity"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 196,
                                                                columnNumber: 21
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 189,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true),
                                            type === 'tv' && data.imdb_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: `https://tvcharts.co/show/${title.toLowerCase().split(' ').join('-')}-${data.imdb_id}`,
                                                target: "_blank",
                                                className: "text-pink-400 hover:underline inline-flex items-center gap-2",
                                                rel: "noreferrer",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__LinkIcon$3e$__["LinkIcon"], {
                                                        className: "w-4 h-4 text-pink-300"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 207,
                                                        columnNumber: 19
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "TV Charts"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 208,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 201,
                                                columnNumber: 17
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 165,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: data.genres?.map((genre)=>{
                                            // Definir un color para cada género
                                            const genreColors = {
                                                "Acción": "bg-red-500",
                                                "Aventura": "bg-amber-600",
                                                "Animación": "bg-orange-500",
                                                "Comedia": "bg-yellow-400",
                                                "Crimen": "bg-rose-700",
                                                "Documental": "bg-slate-500",
                                                "Drama": "bg-blue-500",
                                                "Familia": "bg-indigo-400",
                                                "Fantasía": "bg-fuchsia-600",
                                                "Historia": "bg-zinc-600",
                                                "Terror": "bg-purple-700",
                                                "Música": "bg-emerald-500",
                                                "Misterio": "bg-teal-700",
                                                "Romance": "bg-pink-500",
                                                "Ciencia ficción": "bg-cyan-600",
                                                "Película de TV": "bg-lime-600",
                                                "Suspense": "bg-green-500",
                                                "Bélica": "bg-gray-600",
                                                "Western": "bg-neutral-600"
                                            };
                                            // Determinar el color del género, si no existe se asigna un color predeterminado
                                            const genreColor = genreColors[genre.name] || "bg-gray-600";
                                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `${genreColor} text-white px-3 py-1.5 rounded-full text-sm`,
                                                children: genre.name
                                            }, genre.id, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 242,
                                                columnNumber: 17
                                            }, this);
                                        })
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 213,
                                        columnNumber: 11
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm text-gray-300 bg-gray-800 p-5 rounded-lg shadow-md space-y-1",
                                        children: [
                                            data.original_title && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$film$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FilmIcon$3e$__["FilmIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-blue-400"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 251,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Título original:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 251,
                                                        columnNumber: 76
                                                    }, this),
                                                    " ",
                                                    data.original_title
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 250,
                                                columnNumber: 15
                                            }, this),
                                            data.release_date && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarIcon$3e$__["CalendarIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-green-400"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 256,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Estreno:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 256,
                                                        columnNumber: 81
                                                    }, this),
                                                    " ",
                                                    data.release_date
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 255,
                                                columnNumber: 15
                                            }, this),
                                            data.runtime && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClockIcon$3e$__["ClockIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-yellow-400"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 261,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Duración:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 261,
                                                        columnNumber: 79
                                                    }, this),
                                                    " ",
                                                    data.runtime,
                                                    " min"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 260,
                                                columnNumber: 15
                                            }, this),
                                            data.original_language && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$globe$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__GlobeIcon$3e$__["GlobeIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-purple-400"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 266,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Idioma:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 266,
                                                        columnNumber: 79
                                                    }, this),
                                                    " ",
                                                    data.original_language
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 265,
                                                columnNumber: 15
                                            }, this),
                                            data.vote_average && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__StarIcon$3e$__["StarIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-yellow-300"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 271,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Nota media:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 271,
                                                        columnNumber: 78
                                                    }, this),
                                                    " ",
                                                    data.vote_average.toFixed(1)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 270,
                                                columnNumber: 15
                                            }, this),
                                            data.vote_count && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__StarIcon$3e$__["StarIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-yellow-300"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 276,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Votos:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 276,
                                                        columnNumber: 78
                                                    }, this),
                                                    " ",
                                                    data.vote_count
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 275,
                                                columnNumber: 15
                                            }, this),
                                            type === 'tv' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                children: [
                                                    data.first_air_date && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarIcon$3e$__["CalendarIcon"], {
                                                                className: "inline w-4 h-4 mr-2 text-green-400"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 283,
                                                                columnNumber: 21
                                                            }, this),
                                                            " ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Primera emisión:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 283,
                                                                columnNumber: 85
                                                            }, this),
                                                            " ",
                                                            data.first_air_date
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 282,
                                                        columnNumber: 19
                                                    }, this),
                                                    data.last_air_date && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$calendar$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CalendarIcon$3e$__["CalendarIcon"], {
                                                                className: "inline w-4 h-4 mr-2 text-red-400"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 288,
                                                                columnNumber: 21
                                                            }, this),
                                                            " ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Última emisión:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 288,
                                                                columnNumber: 83
                                                            }, this),
                                                            " ",
                                                            data.last_air_date
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 287,
                                                        columnNumber: 19
                                                    }, this),
                                                    data.number_of_seasons && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$film$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FilmIcon$3e$__["FilmIcon"], {
                                                                className: "inline w-4 h-4 mr-2 text-blue-300"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 293,
                                                                columnNumber: 21
                                                            }, this),
                                                            " ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Temporadas:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 293,
                                                                columnNumber: 80
                                                            }, this),
                                                            " ",
                                                            data.number_of_seasons
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 292,
                                                        columnNumber: 19
                                                    }, this),
                                                    data.number_of_episodes && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$film$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__FilmIcon$3e$__["FilmIcon"], {
                                                                className: "inline w-4 h-4 mr-2 text-blue-300"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 298,
                                                                columnNumber: 21
                                                            }, this),
                                                            " ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Episodios:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 298,
                                                                columnNumber: 80
                                                            }, this),
                                                            " ",
                                                            data.number_of_episodes
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 297,
                                                        columnNumber: 19
                                                    }, this),
                                                    data.episode_run_time?.[0] && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ClockIcon$3e$__["ClockIcon"], {
                                                                className: "inline w-4 h-4 mr-2 text-yellow-400"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 303,
                                                                columnNumber: 21
                                                            }, this),
                                                            " ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Duración por episodio:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 303,
                                                                columnNumber: 83
                                                            }, this),
                                                            " ",
                                                            data.episode_run_time[0],
                                                            " min"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 302,
                                                        columnNumber: 19
                                                    }, this),
                                                    data.status && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$star$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__StarIcon$3e$__["StarIcon"], {
                                                                className: "inline w-4 h-4 mr-2 text-gray-300"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 308,
                                                                columnNumber: 21
                                                            }, this),
                                                            " ",
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                                children: "Estado:"
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 308,
                                                                columnNumber: 80
                                                            }, this),
                                                            " ",
                                                            data.status
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 307,
                                                        columnNumber: 19
                                                    }, this)
                                                ]
                                            }, void 0, true),
                                            data.budget > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$dollar$2d$sign$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeDollarSignIcon$3e$__["BadgeDollarSignIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-green-500"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 315,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Presupuesto:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 315,
                                                        columnNumber: 88
                                                    }, this),
                                                    " $",
                                                    data.budget.toLocaleString()
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 314,
                                                columnNumber: 15
                                            }, this),
                                            data.revenue > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$badge$2d$dollar$2d$sign$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__BadgeDollarSignIcon$3e$__["BadgeDollarSignIcon"], {
                                                        className: "inline w-4 h-4 mr-2 text-green-500"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 320,
                                                        columnNumber: 17
                                                    }, this),
                                                    " ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: "Recaudación:"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 320,
                                                        columnNumber: 88
                                                    }, this),
                                                    " $",
                                                    data.revenue.toLocaleString()
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 319,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 248,
                                        columnNumber: 11
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 147,
                                columnNumber: 9
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 101,
                        columnNumber: 7
                    }, this),
                    type === 'tv' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "mt-10",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-2xl font-bold mb-4",
                                children: "Puntuaciones por episodio"
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 330,
                                columnNumber: 13
                            }, this),
                            ratingsLoading && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-sm text-gray-300",
                                children: "Cargando ratings…"
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 333,
                                columnNumber: 15
                            }, this),
                            ratingsError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "bg-red-600/20 border border-red-700 text-red-300 p-3 rounded-lg",
                                children: ratingsError
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 337,
                                columnNumber: 15
                            }, this),
                            ratings && ratings.seasons && ratings.seasons.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-8",
                                children: ratings.seasons.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "bg-gray-900/60 rounded-xl border border-gray-800 overflow-hidden",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "px-4 py-3 border-b border-gray-800",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                                    className: "text-lg font-semibold",
                                                    children: [
                                                        "Temporada ",
                                                        s.season_number,
                                                        " ",
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-gray-400 font-normal",
                                                            children: [
                                                                "— ",
                                                                s.name
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                            lineNumber: 348,
                                                            columnNumber: 53
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/DetailsClient.jsx",
                                                    lineNumber: 347,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 346,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "overflow-x-auto",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("table", {
                                                    className: "min-w-full text-sm",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("thead", {
                                                            className: "text-gray-400",
                                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                        className: "text-left p-3",
                                                                        children: "#"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                                        lineNumber: 356,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                        className: "text-left p-3",
                                                                        children: "Episodio"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                                        lineNumber: 357,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                        className: "text-left p-3",
                                                                        children: "TMDb"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                                        lineNumber: 358,
                                                                        columnNumber: 29
                                                                    }, this),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("th", {
                                                                        className: "text-left p-3",
                                                                        children: "IMDb"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                                        lineNumber: 359,
                                                                        columnNumber: 29
                                                                    }, this)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 355,
                                                                columnNumber: 27
                                                            }, this)
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                            lineNumber: 354,
                                                            columnNumber: 25
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tbody", {
                                                            children: s.episodes.map((ep)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("tr", {
                                                                    className: "border-t border-gray-800",
                                                                    children: [
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                            className: "p-3",
                                                                            children: ep.episode_number
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                                            lineNumber: 365,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                            className: "p-3",
                                                                            children: ep.name
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                                            lineNumber: 366,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                            className: "p-3",
                                                                            children: ep.tmdbRating ?? '—'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                                            lineNumber: 367,
                                                                            columnNumber: 31
                                                                        }, this),
                                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("td", {
                                                                            className: "p-3",
                                                                            children: ep.imdbRating ?? '—'
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                                            lineNumber: 368,
                                                                            columnNumber: 31
                                                                        }, this)
                                                                    ]
                                                                }, ep.episode_number, true, {
                                                                    fileName: "[project]/src/components/DetailsClient.jsx",
                                                                    lineNumber: 364,
                                                                    columnNumber: 29
                                                                }, this))
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                            lineNumber: 362,
                                                            columnNumber: 25
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/DetailsClient.jsx",
                                                    lineNumber: 353,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 352,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, s.season_number, true, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 345,
                                        columnNumber: 19
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 343,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 329,
                        columnNumber: 11
                    }, this),
                    castData && castData.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-12",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-2xl font-bold text-white mb-4",
                                children: "Reparto principal"
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 385,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Swiper"], {
                                spaceBetween: 20,
                                slidesPerView: 6,
                                breakpoints: {
                                    640: {
                                        slidesPerView: 1,
                                        spaceBetween: 10
                                    },
                                    768: {
                                        slidesPerView: 2,
                                        spaceBetween: 10
                                    },
                                    1024: {
                                        slidesPerView: 6,
                                        spaceBetween: 20
                                    }
                                },
                                children: castData.slice(0, 20).map((actor)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                                        className: "flex-shrink-0 text-center",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "relative",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: `/details/person/${actor.id}`,
                                                className: "block",
                                                children: [
                                                    actor.profile_path ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: `https://image.tmdb.org/t/p/w300${actor.profile_path}`,
                                                        alt: actor.name,
                                                        className: "w-full aspect-[2/3] object-cover rounded-lg"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 409,
                                                        columnNumber: 23
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$image$2d$off$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ImageOff$3e$__["ImageOff"], {
                                                            size: 48,
                                                            className: "text-gray-500"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                            lineNumber: 416,
                                                            columnNumber: 25
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 415,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-white p-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "font-semibold text-sm",
                                                                children: actor.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 421,
                                                                columnNumber: 23
                                                            }, this),
                                                            actor.character && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-xs text-gray-400",
                                                                children: actor.character
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 423,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 420,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 407,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                            lineNumber: 406,
                                            columnNumber: 17
                                        }, this)
                                    }, actor.id, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 405,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 386,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 384,
                        columnNumber: 9
                    }, this),
                    reviews && reviews.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-12",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex justify-between items-center mb-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "text-2xl font-bold text-white",
                                        children: "Críticas de usuarios"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 438,
                                        columnNumber: 13
                                    }, this),
                                    reviewLimit < reviews.length && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setReviewLimit(reviewLimit + 2),
                                        className: "px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm",
                                        children: "Ver más críticas"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 440,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 437,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "grid md:grid-cols-2 gap-6",
                                children: reviews.slice(0, reviewLimit).map((review)=>{
                                    const { author, content, created_at, id, url, author_details } = review;
                                    const avatar = author_details?.avatar_path?.includes('/https') ? author_details.avatar_path.slice(1) // quitar el primer slash si es URL completa
                                     : `https://image.tmdb.org/t/p/w45${author_details?.avatar_path}`;
                                    const rating = author_details?.rating;
                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "bg-gray-800 p-4 rounded-lg flex flex-col gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex items-center gap-3",
                                                children: [
                                                    author_details?.avatar_path && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: avatar,
                                                        alt: author,
                                                        className: "w-10 h-10 rounded-full object-cover border border-gray-600"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 461,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-white font-semibold",
                                                                children: author_details?.username || author
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 468,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-sm text-gray-400",
                                                                children: new Date(created_at).toLocaleDateString()
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 469,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 467,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 459,
                                                columnNumber: 19
                                            }, this),
                                            rating && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-yellow-400 text-sm mt-1",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                    children: [
                                                        rating,
                                                        " ⭐"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/components/DetailsClient.jsx",
                                                    lineNumber: 475,
                                                    columnNumber: 23
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 474,
                                                columnNumber: 21
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                className: "text-gray-300 whitespace-pre-wrap text-sm mb-2",
                                                dangerouslySetInnerHTML: {
                                                    __html: content.slice(0, 300) + '...'
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 479,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: `https://www.themoviedb.org/review/${id}`,
                                                target: "_blank",
                                                className: "text-blue-400 text-sm self-start",
                                                rel: "noreferrer",
                                                children: "Leer más →"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 486,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, id, true, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 458,
                                        columnNumber: 17
                                    }, this);
                                })
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 449,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 436,
                        columnNumber: 9
                    }, this),
                    recommendations && recommendations.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-12",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                className: "text-2xl font-bold text-white mb-4",
                                children: "Recomendaciones"
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 504,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Swiper"], {
                                spaceBetween: 20,
                                slidesPerView: 6,
                                breakpoints: {
                                    640: {
                                        slidesPerView: 1,
                                        spaceBetween: 10
                                    },
                                    768: {
                                        slidesPerView: 2,
                                        spaceBetween: 10
                                    },
                                    1024: {
                                        slidesPerView: 6,
                                        spaceBetween: 20
                                    }
                                },
                                children: recommendations.slice(0, 20).map((rec)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                                        className: "flex-shrink-0 text-center",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "relative",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("a", {
                                                href: `/details/${rec.media_type || type}/${rec.id}`,
                                                className: "block",
                                                children: [
                                                    rec.poster_path ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: `https://image.tmdb.org/t/p/w300${rec.poster_path}`,
                                                        alt: rec.title || rec.name,
                                                        className: "w-full h-full object-cover rounded-lg"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 529,
                                                        columnNumber: 23
                                                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg",
                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$image$2d$off$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ImageOff$3e$__["ImageOff"], {
                                                            size: 48,
                                                            className: "text-gray-500"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                                            lineNumber: 536,
                                                            columnNumber: 25
                                                        }, this)
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 535,
                                                        columnNumber: 23
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-white p-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "font-semibold text-sm",
                                                                children: rec.title || rec.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 541,
                                                                columnNumber: 23
                                                            }, this),
                                                            rec.vote_average && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                                className: "text-xs text-yellow-400",
                                                                children: [
                                                                    "⭐ ",
                                                                    rec.vote_average.toFixed(1)
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                                lineNumber: 543,
                                                                columnNumber: 25
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                                        lineNumber: 540,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/DetailsClient.jsx",
                                                lineNumber: 527,
                                                columnNumber: 19
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/DetailsClient.jsx",
                                            lineNumber: 525,
                                            columnNumber: 17
                                        }, this)
                                    }, rec.id, false, {
                                        fileName: "[project]/src/components/DetailsClient.jsx",
                                        lineNumber: 524,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/components/DetailsClient.jsx",
                                lineNumber: 505,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/DetailsClient.jsx",
                        lineNumber: 503,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/DetailsClient.jsx",
                lineNumber: 98,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/DetailsClient.jsx",
        lineNumber: 61,
        columnNumber: 5
    }, this);
}
}}),
"[project]/src/app/details/[type]/[id]/page.jsx [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>DetailsPage)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api/tmdb.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DetailsClient$2e$jsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/DetailsClient.jsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
function DetailsPage() {
    const { type, id } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useParams"])();
    const [renderReady, setRenderReady] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [propsToRender, setPropsToRender] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const fetchAll = async ()=>{
            if (!type || !id) return;
            try {
                const details = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDetails"])(type, id);
                if (type === 'person') {
                    const actorMovies = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getActorMovies"])(id);
                    setPropsToRender({
                        type,
                        id,
                        data: details,
                        castData: actorMovies?.cast || [],
                        recommendations: [],
                        providers: [],
                        reviews: []
                    });
                } else {
                    // Llamadas en paralelo
                    const [cast, recommendations, reviews, providers] = await Promise.all([
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCredits"])(type, id),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRecommendations"])(type, id),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getReviews"])(type, id),
                        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getProviders"])(type, id)
                    ]);
                    setPropsToRender({
                        type,
                        id,
                        data: details,
                        castData: cast?.cast || [],
                        recommendations: recommendations?.results || [],
                        reviews: reviews?.results || [],
                        providers: providers?.results?.ES?.flatrate || []
                    });
                }
                setRenderReady(true);
            } catch (err) {
                console.error('Error cargando detalles:', err);
            }
        };
        fetchAll();
    }, [
        type,
        id
    ]);
    // Hasta tener todo, no renderiza nada
    if (!renderReady) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$DetailsClient$2e$jsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
        ...propsToRender
    }, void 0, false, {
        fileName: "[project]/src/app/details/[type]/[id]/page.jsx",
        lineNumber: 70,
        columnNumber: 10
    }, this);
}
}}),

};

//# sourceMappingURL=src_a33e09bd._.js.map