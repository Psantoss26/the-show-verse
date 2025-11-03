module.exports = {

"[project]/src/lib/api/tmdb.js [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "fetchFeaturedMovies": (()=>fetchFeaturedMovies),
    "fetchGenres": (()=>fetchGenres),
    "fetchMoviesByGenre": (()=>fetchMoviesByGenre),
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
"[project]/src/components/MainDashboard.jsx [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>MainDashboard)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-react.js [app-ssr] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/swiper/react/swiper-slide.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$swiper$2e$esm$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/swiper.esm.js [app-ssr] (ecmascript) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/modules/navigation/navigation.js [app-ssr] (ecmascript) <export default as Navigation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$autoplay$2f$autoplay$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Autoplay$3e$__ = __turbopack_context__.i("[project]/node_modules/swiper/modules/autoplay/autoplay.js [app-ssr] (ecmascript) <export default as Autoplay>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api/tmdb.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
(()=>{
    const e = new Error("Cannot find module 'next/font/google/target.css'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
'use client';
;
;
;
;
;
;
;
;
function MainDashboard() {
    const [ready, setReady] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [dashboardData, setDashboardData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        featuredMovies: [],
        genreFilters: [],
        filterMovies: {}
    });
    const prevRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const nextRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const loadData = async ()=>{
            try {
                // Cargar películas destacadas y géneros en paralelo
                const [movies, genres] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchFeaturedMovies"])(),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchGenres"])()
                ]);
                // Cargar logos en paralelo
                const moviesWithLogos = await Promise.all(movies.map(async (movie)=>{
                    const logoPath = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getLogos"])('movie', movie.id);
                    return {
                        ...movie,
                        logo_path: logoPath
                    };
                }));
                // Cargar películas por género en paralelo
                const genreMoviePairs = await Promise.all(genres.map(async (genre)=>{
                    const movies = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["fetchMoviesByGenre"])(genre.id);
                    return [
                        genre.name,
                        movies
                    ];
                }));
                const genreMoviesObj = Object.fromEntries(genreMoviePairs);
                // Almacenar todo junto
                setDashboardData({
                    featuredMovies: moviesWithLogos,
                    genreFilters: genres,
                    filterMovies: genreMoviesObj
                });
                setReady(true);
            } catch (err) {
                console.error("Error cargando dashboard:", err);
            }
        };
        loadData();
    }, []);
    if (!ready) return null;
    const { featuredMovies, genreFilters, filterMovies } = dashboardData;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "p-8 text-white bg-black",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative group",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Swiper"], {
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
                        // Reparar refs dinámicos
                        swiper.params.navigation.prevEl = prevRef.current;
                        swiper.params.navigation.nextEl = nextRef.current;
                        swiper.navigation.init();
                        swiper.navigation.update();
                    },
                    modules: [
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__["Navigation"],
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$autoplay$2f$autoplay$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Autoplay$3e$__["Autoplay"]
                    ],
                    className: "h-full group relative",
                    children: [
                        featuredMovies.map((movie)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: `/details/movie/${movie.id}`,
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "relative cursor-pointer",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                src: `https://image.tmdb.org/t/p/original${movie.backdrop_path}`,
                                                alt: movie.title,
                                                className: "w-full h-full object-cover rounded-lg"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/MainDashboard.jsx",
                                                lineNumber: 109,
                                                columnNumber: 19
                                            }, this),
                                            movie.logo_path && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                src: `https://image.tmdb.org/t/p/w200${movie.logo_path}`,
                                                alt: `${movie.title} logo`,
                                                className: "absolute bottom-2 right-4 h-18 max-w-[340px] object-contain"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/MainDashboard.jsx",
                                                lineNumber: 115,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                        lineNumber: 108,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/MainDashboard.jsx",
                                    lineNumber: 107,
                                    columnNumber: 15
                                }, this)
                            }, movie.id, false, {
                                fileName: "[project]/src/components/MainDashboard.jsx",
                                lineNumber: 106,
                                columnNumber: 13
                            }, this)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        }, void 0, false, {
                            fileName: "[project]/src/components/MainDashboard.jsx",
                            lineNumber: 127,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        }, void 0, false, {
                            fileName: "[project]/src/components/MainDashboard.jsx",
                            lineNumber: 128,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/MainDashboard.jsx",
                    lineNumber: 85,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/MainDashboard.jsx",
                lineNumber: 84,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-12 space-y-12",
                children: genreFilters.map((genre)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative group",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: `text-3xl tracking-wide text-white mb-4 ${bebas.className} uppercase`,
                                children: genre.name
                            }, void 0, false, {
                                fileName: "[project]/src/components/MainDashboard.jsx",
                                lineNumber: 136,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Swiper"], {
                                spaceBetween: 20,
                                slidesPerView: 10,
                                navigation: {
                                    prevEl: prevRef.current,
                                    nextEl: nextRef.current
                                },
                                onInit: (swiper)=>{
                                    // Reparar refs dinámicos
                                    swiper.params.navigation.prevEl = prevRef.current;
                                    swiper.params.navigation.nextEl = nextRef.current;
                                    swiper.navigation.init();
                                    swiper.navigation.update();
                                },
                                modules: [
                                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$modules$2f$navigation$2f$navigation$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Navigation$3e$__["Navigation"]
                                ],
                                className: "mt-6 group relative",
                                breakpoints: {
                                    640: {
                                        slidesPerView: 2,
                                        spaceBetween: 10
                                    },
                                    768: {
                                        slidesPerView: 4,
                                        spaceBetween: 10
                                    },
                                    1024: {
                                        slidesPerView: 10,
                                        spaceBetween: 20
                                    }
                                },
                                children: [
                                    (filterMovies[genre.name] || []).map((movie)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swiper$2f$react$2f$swiper$2d$slide$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SwiperSlide"], {
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                                href: `/details/movie/${movie.id}`,
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "cursor-pointer",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                                        src: `https://image.tmdb.org/t/p/w300${movie.poster_path}`,
                                                        alt: movie.title,
                                                        className: "w-full h-full object-cover rounded-lg"
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                                        lineNumber: 168,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/components/MainDashboard.jsx",
                                                    lineNumber: 167,
                                                    columnNumber: 21
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/MainDashboard.jsx",
                                                lineNumber: 166,
                                                columnNumber: 19
                                            }, this)
                                        }, movie.id, false, {
                                            fileName: "[project]/src/components/MainDashboard.jsx",
                                            lineNumber: 165,
                                            columnNumber: 17
                                        }, this)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                        lineNumber: 179,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/MainDashboard.jsx",
                                        lineNumber: 180,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/MainDashboard.jsx",
                                lineNumber: 142,
                                columnNumber: 13
                            }, this)
                        ]
                    }, genre.id, true, {
                        fileName: "[project]/src/components/MainDashboard.jsx",
                        lineNumber: 135,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/MainDashboard.jsx",
                lineNumber: 133,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/MainDashboard.jsx",
        lineNumber: 82,
        columnNumber: 5
    }, this);
}
}}),

};

//# sourceMappingURL=src_d718f39d._.js.map