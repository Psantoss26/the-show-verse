(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([typeof document === "object" ? document.currentScript : undefined, {

"[next]/internal/font/google/anton_e4e05db9.module.css [app-client] (css module)": ((__turbopack_context__) => {

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.v({
  "className": "anton_e4e05db9-module__x49lcG__className",
});
}}),
"[next]/internal/font/google/anton_e4e05db9.js [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>__TURBOPACK__default__export__)
});
var __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__ = __turbopack_context__.i("[next]/internal/font/google/anton_e4e05db9.module.css [app-client] (css module)");
;
const fontData = {
    className: __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].className,
    style: {
        fontFamily: "'Anton', 'Anton Fallback'",
        fontWeight: 400,
        fontStyle: "normal"
    }
};
if (__TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].variable != null) {
    fontData.variable = __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$module$2e$css__$5b$app$2d$client$5d$__$28$css__module$29$__["default"].variable;
}
const __TURBOPACK__default__export__ = fontData;
}}),
"[project]/src/components/CarruselIndividual.jsx [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>CarruselIndividual)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-react.js [app-client] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-slide.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$swiper$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/swiper.esm.js [app-client] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/modules/navigation/navigation.js [app-client] (ecmascript) <export default as Navigation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
function CarruselIndividual({ movies = [], title = '', type = 'movie' }) {
    _s();
    const prevRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const nextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "relative group",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                className: "text-4xl font-[730] inline-block text-primary-text mb-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase",
                    children: title
                }, void 0, false, {
                    fileName: "[project]/src/components/CarruselIndividual.jsx",
                    lineNumber: 16,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/CarruselIndividual.jsx",
                lineNumber: 15,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Swiper"], {
                spaceBetween: 20,
                slidesPerView: 10,
                modules: [
                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__["Navigation"]
                ],
                navigation: {
                    prevEl: prevRef.current,
                    nextEl: nextRef.current
                },
                onInit: (swiper)=>{
                    swiper.params.navigation.prevEl = prevRef.current;
                    swiper.params.navigation.nextEl = nextRef.current;
                    swiper.navigation.init();
                    swiper.navigation.update();
                },
                className: "group relative",
                breakpoints: {
                    640: {
                        slidesPerView: 2
                    },
                    768: {
                        slidesPerView: 4
                    },
                    1024: {
                        slidesPerView: 10
                    }
                },
                children: movies.map((movie)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                            href: `/details/${type}/${movie.id}`,
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "cursor-pointer",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                    src: `https://image.tmdb.org/t/p/w300${movie.poster_path}`,
                                    alt: movie.title,
                                    className: "w-full h-full object-cover rounded-lg"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/CarruselIndividual.jsx",
                                    lineNumber: 46,
                                    columnNumber: 17
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/CarruselIndividual.jsx",
                                lineNumber: 45,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/components/CarruselIndividual.jsx",
                            lineNumber: 44,
                            columnNumber: 13
                        }, this)
                    }, movie.id, false, {
                        fileName: "[project]/src/components/CarruselIndividual.jsx",
                        lineNumber: 43,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/CarruselIndividual.jsx",
                lineNumber: 21,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: prevRef,
                className: "swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            }, void 0, false, {
                fileName: "[project]/src/components/CarruselIndividual.jsx",
                lineNumber: 57,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: nextRef,
                className: "swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            }, void 0, false, {
                fileName: "[project]/src/components/CarruselIndividual.jsx",
                lineNumber: 61,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/CarruselIndividual.jsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
_s(CarruselIndividual, "sCcRn+ZSKgDvFtwJgX0m//9rNHk=");
_c = CarruselIndividual;
var _c;
__turbopack_context__.k.register(_c, "CarruselIndividual");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
"[project]/src/lib/api/tmdb.js [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
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
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
"[project]/src/components/MainDashboard.jsx [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>MainDashboard)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$react$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-react.js [app-client] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-slide.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$swiper$2e$esm$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/swiper.esm.js [app-client] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/modules/navigation/navigation.js [app-client] (ecmascript) <export default as Navigation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$autoplay$2f$autoplay$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Autoplay$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/modules/autoplay/autoplay.js [app-client] (ecmascript) <export default as Autoplay>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[next]/internal/font/google/anton_e4e05db9.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$CarruselIndividual$2e$jsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/CarruselIndividual.jsx [app-client] (ecmascript)");
// Funciones API
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api/tmdb.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
;
;
;
;
;
;
;
function MainDashboard({ sessionId = null }) {
    _s();
    const [ready, setReady] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [dashboardData, setDashboardData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({});
    const prevRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const nextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "MainDashboard.useEffect": ()=>{
            const loadData = {
                "MainDashboard.useEffect.loadData": async ()=>{
                    try {
                        const [topRated, cult, mind, action, us, underrated, rising, trending, popular] = await Promise.all([
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchTopRatedMovies"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchCultClassics"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchMindBendingMovies"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchTopActionMovies"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchPopularInUS"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchUnderratedMovies"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchRisingMovies"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchTrendingMovies"])(),
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchPopularMovies"])()
                        ]);
                        const recommended = sessionId ? await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["fetchRecommendedMovies"])(sessionId) : [];
                        const topRatedWithLogos = await Promise.all(topRated.map({
                            "MainDashboard.useEffect.loadData": async (movie)=>{
                                const logo = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getLogos"])('movie', movie.id);
                                return {
                                    ...movie,
                                    logo_path: logo
                                };
                            }
                        }["MainDashboard.useEffect.loadData"]));
                        setDashboardData({
                            topRated: topRatedWithLogos,
                            cult,
                            mind,
                            action,
                            us,
                            underrated,
                            rising,
                            trending,
                            popular,
                            recommended
                        });
                        setReady(true);
                    } catch (err) {
                        console.error('Error cargando dashboard:', err);
                    }
                }
            }["MainDashboard.useEffect.loadData"];
            loadData();
        }
    }["MainDashboard.useEffect"], [
        sessionId
    ]);
    if (!ready) return null;
    const sections = [
        {
            title: 'Populares',
            key: 'popular'
        },
        {
            title: 'Tendencias Semanales',
            key: 'trending'
        },
        {
            title: 'Guiones Complejos',
            key: 'mind'
        },
        {
            title: 'Top Acción',
            key: 'action'
        },
        {
            title: 'Populares en EE.UU.',
            key: 'us'
        },
        {
            title: 'Películas de Culto',
            key: 'cult'
        },
        {
            title: 'Infravaloradas',
            key: 'underrated'
        },
        {
            title: 'En Ascenso',
            key: 'rising'
        },
        ...dashboardData.recommended?.length > 0 ? [
            {
                title: 'Recomendadas Para Ti',
                key: 'recommended'
            }
        ] : []
    ];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "px-8 py-2 text-white bg-black",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative group mb-10 sm:mb-14",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Swiper"], {
                    spaceBetween: 20,
                    slidesPerView: 3,
                    autoplay: {
                        delay: 5000
                    },
                    navigation: {
                        prevEl: prevRef.current,
                        nextEl: nextRef.current
                    },
                    onInit: (swiper)=>{
                        swiper.params.navigation.prevEl = prevRef.current;
                        swiper.params.navigation.nextEl = nextRef.current;
                        swiper.navigation.init();
                        swiper.navigation.update();
                    },
                    modules: [
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__["Navigation"],
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$autoplay$2f$autoplay$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Autoplay$3e$__["Autoplay"]
                    ],
                    className: "group relative",
                    breakpoints: {
                        0: {
                            slidesPerView: 1,
                            spaceBetween: 12
                        },
                        640: {
                            slidesPerView: 2,
                            spaceBetween: 16
                        },
                        1024: {
                            slidesPerView: 3,
                            spaceBetween: 20
                        }
                    },
                    children: [
                        dashboardData.topRated.map((movie)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                    href: `/details/movie/${movie.id}`,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "cursor-pointer overflow-hidden rounded-lg",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                src: `https://image.tmdb.org/t/p/original${movie.backdrop_path}`,
                                                alt: movie.title,
                                                className: "w-full h-full object-cover rounded-lg hover:scale-105 transition-transform duration-300"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/MainDashboard.jsx",
                                                lineNumber: 141,
                                                columnNumber: 19
                                            }, this),
                                            movie.logo_path && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                src: `https://image.tmdb.org/t/p/w200${movie.logo_path}`,
                                                alt: `${movie.title} logo`,
                                                className: "absolute bottom-4 left-1/2 -translate-x-1/2 h-18 object-contain max-w-[50%]"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/MainDashboard.jsx",
                                                lineNumber: 147,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                        lineNumber: 140,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/MainDashboard.jsx",
                                    lineNumber: 139,
                                    columnNumber: 15
                                }, this)
                            }, movie.id, false, {
                                fileName: "[project]/src/components/MainDashboard.jsx",
                                lineNumber: 138,
                                columnNumber: 13
                            }, this)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: prevRef,
                            className: "swiper-button-prev hidden sm:flex !text-white !w-8 !h-8 !items-center !justify-center group-hover:opacity-100 transition-opacity duration-300"
                        }, void 0, false, {
                            fileName: "[project]/src/components/MainDashboard.jsx",
                            lineNumber: 157,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            ref: nextRef,
                            className: "swiper-button-next hidden sm:flex !text-white !w-8 !h-8 !items-center !justify-center group-hover:opacity-100 transition-opacity duration-300"
                        }, void 0, false, {
                            fileName: "[project]/src/components/MainDashboard.jsx",
                            lineNumber: 162,
                            columnNumber: 1
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/MainDashboard.jsx",
                    lineNumber: 115,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/MainDashboard.jsx",
                lineNumber: 114,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-12",
                children: sections.map(({ title, key })=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative group",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text mb-4 sm:text-left",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: `bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${__TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$anton_e4e05db9$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].className}`,
                                    children: title
                                }, void 0, false, {
                                    fileName: "[project]/src/components/MainDashboard.jsx",
                                    lineNumber: 176,
                                    columnNumber: 15
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/components/MainDashboard.jsx",
                                lineNumber: 174,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Swiper"], {
                                spaceBetween: 20,
                                slidesPerView: 10,
                                navigation: {
                                    prevEl: prevRef.current,
                                    nextEl: nextRef.current
                                },
                                onInit: (swiper)=>{
                                    swiper.params.navigation.prevEl = prevRef.current;
                                    swiper.params.navigation.nextEl = nextRef.current;
                                    swiper.navigation.init();
                                    swiper.navigation.update();
                                },
                                modules: [
                                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__["Navigation"]
                                ],
                                className: "group relative",
                                breakpoints: {
                                    0: {
                                        slidesPerView: 3,
                                        spaceBetween: 12
                                    },
                                    480: {
                                        slidesPerView: 4,
                                        spaceBetween: 14
                                    },
                                    768: {
                                        slidesPerView: 6,
                                        spaceBetween: 16
                                    },
                                    1024: {
                                        slidesPerView: 8,
                                        spaceBetween: 18
                                    },
                                    1280: {
                                        slidesPerView: 10,
                                        spaceBetween: 20
                                    }
                                },
                                children: [
                                    dashboardData[key]?.map((movie)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"], {
                                                href: `/details/movie/${movie.id}`,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "cursor-pointer overflow-hidden rounded-lg",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: `https://image.tmdb.org/t/p/w300${movie.poster_path}`,
                                                        alt: movie.title,
                                                        className: "w-full h-full object-cover rounded-lg transform transition duration-300 ease-in-out hover:scale-105"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                                        lineNumber: 210,
                                                        columnNumber: 21
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/MainDashboard.jsx",
                                                    lineNumber: 209,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/MainDashboard.jsx",
                                                lineNumber: 208,
                                                columnNumber: 19
                                            }, this)
                                        }, movie.id, false, {
                                            fileName: "[project]/src/components/MainDashboard.jsx",
                                            lineNumber: 207,
                                            columnNumber: 17
                                        }, this)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        ref: prevRef,
                                        className: "swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                        lineNumber: 219,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        ref: nextRef,
                                        className: "swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                        lineNumber: 223,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/MainDashboard.jsx",
                                lineNumber: 183,
                                columnNumber: 13
                            }, this)
                        ]
                    }, title, true, {
                        fileName: "[project]/src/components/MainDashboard.jsx",
                        lineNumber: 173,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/MainDashboard.jsx",
                lineNumber: 171,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/MainDashboard.jsx",
        lineNumber: 112,
        columnNumber: 5
    }, this);
}
_s(MainDashboard, "2bsRXddtzUZ8RSWk+HNDbLdf20c=");
_c = MainDashboard;
var _c;
__turbopack_context__.k.register(_c, "MainDashboard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
}]);

//# sourceMappingURL=%5Broot-of-the-server%5D__af627b94._.js.map