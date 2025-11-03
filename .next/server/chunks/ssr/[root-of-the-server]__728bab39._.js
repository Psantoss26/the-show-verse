module.exports = {

"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}}),
"[project]/src/lib/tmdb.js [app-ssr] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "getCredits": (()=>getCredits),
    "getDetails": (()=>getDetails),
    "getProviders": (()=>getProviders),
    "getRecommendations": (()=>getRecommendations),
    "getReviews": (()=>getReviews)
});
const API_KEY = ("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b");
const BASE_URL = 'https://api.themoviedb.org/3';
async function getDetails(type, id) {
    const res = await fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}`);
    return res.json();
}
async function getRecommendations(type, id) {
    const res = await fetch(`${BASE_URL}/${type}/${id}/recommendations?api_key=${API_KEY}`);
    return res.json();
}
async function getCredits(type, id) {
    const res = await fetch(`${BASE_URL}/${type}/${id}/credits?api_key=${API_KEY}`);
    return res.json();
}
async function getProviders(type, id) {
    const res = await fetch(`${BASE_URL}/${type}/${id}/watch/providers?api_key=${API_KEY}`);
    return res.json();
}
async function getReviews(type, id) {
    const res = await fetch(`${BASE_URL}/${type}/${id}/reviews?api_key=${API_KEY}`);
    return res.json();
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2d$dom$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/react-router-dom/dist/index.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/tmdb.js [app-ssr] (ecmascript)");
(()=>{
    const e = new Error("Cannot find module './DetailsClient'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
'use client';
;
;
;
;
;
function DetailsPage() {
    const { type, id } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$react$2d$router$2d$dom$2f$dist$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useParams"])(); // Obtiene los parámetros de la URL
    const [data, setData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [recommendations, setRecommendations] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [castData, setCastData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [providers, setProviders] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [reviews, setReviews] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const fetchData = async ()=>{
            try {
                const [details, recommendationsData, credits, providersData, reviewsData] = await Promise.all([
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getDetails"])(type, id),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getRecommendations"])(type, id),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getCredits"])(type, id),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getProviders"])(type, id),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$tmdb$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getReviews"])(type, id)
                ]);
                setData(details);
                setRecommendations(recommendationsData);
                setCastData(credits);
                setProviders(providersData);
                setReviews(reviewsData);
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        };
        if (type && id) {
            fetchData();
        }
    }, [
        type,
        id
    ]);
    if (!data) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            children: "Loading..."
        }, void 0, false, {
            fileName: "[project]/src/app/details/[type]/[id]/page.jsx",
            lineNumber: 42,
            columnNumber: 12
        }, this);
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(DetailsClient, {
        type: type,
        id: id,
        data: data,
        recommendations: recommendations,
        castData: castData,
        providers: providers,
        reviews: reviews
    }, void 0, false, {
        fileName: "[project]/src/app/details/[type]/[id]/page.jsx",
        lineNumber: 46,
        columnNumber: 5
    }, this);
}
}}),

};

//# sourceMappingURL=%5Broot-of-the-server%5D__728bab39._.js.map