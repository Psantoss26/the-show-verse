module.exports = {

"[project]/.next-internal/server/app/api/tv/[id]/ratings/route/actions.js [app-rsc] (server actions loader, ecmascript)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
}}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}}),
"[project]/src/app/api/tv/[id]/ratings/route.js [app-route] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "GET": (()=>GET)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com/';
async function tmdb(path, params = {}) {
    const apiKey = ("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b");
    if ("TURBOPACK compile-time falsy", 0) {
        "TURBOPACK unreachable";
    }
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'es-ES');
    Object.entries(params).forEach(([k, v])=>{
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url, {
        next: {
            revalidate: 120
        }
    });
    if (!res.ok) throw new Error(`TMDb ${res.status}: ${await res.text()}`);
    return res.json();
}
async function omdb(params = {}) {
    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) throw new Error('Falta OMDB_API_KEY');
    const url = new URL(OMDB_BASE);
    url.searchParams.set('apikey', apiKey);
    Object.entries(params).forEach(([k, v])=>{
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url, {
        next: {
            revalidate: 300
        }
    });
    if (!res.ok) throw new Error(`OMDb ${res.status}: ${await res.text()}`);
    return res.json();
}
async function GET(req, { params }) {
    const { id } = params; // TMDb tv id
    const { searchParams } = new URL(req.url);
    const excludeSpecials = searchParams.get('excludeSpecials') === 'true';
    try {
        // 1) Detalles + external_ids para obtener imdb_id
        const [details, external] = await Promise.all([
            tmdb(`/tv/${id}`),
            tmdb(`/tv/${id}/external_ids`)
        ]);
        const imdb_id = external?.imdb_id || null;
        // 2) Recorrer temporadas
        const seasonsMeta = Array.isArray(details.seasons) ? details.seasons : [];
        const seasons = [];
        for (const s of seasonsMeta){
            if (excludeSpecials && s.season_number === 0) continue;
            // TMDb: episodios con vote_average y nombre
            const seasonData = await tmdb(`/tv/${id}/season/${s.season_number}`);
            const tmdbEpisodes = {};
            for (const ep of seasonData.episodes || []){
                tmdbEpisodes[ep.episode_number] = {
                    name: ep.name,
                    tmdbRating: typeof ep.vote_average === 'number' ? ep.vote_average : null
                };
            }
            // IMDb vía OMDb: i=ttXXXX&Season=N
            const imdbEpisodes = {};
            if (imdb_id) {
                try {
                    const om = await omdb({
                        i: imdb_id,
                        Season: s.season_number
                    });
                    (om?.Episodes || []).forEach((e)=>{
                        const epNum = Number(e.Episode);
                        const r = e.imdbRating && e.imdbRating !== 'N/A' ? Number(e.imdbRating) : null;
                        imdbEpisodes[epNum] = Number.isFinite(r) ? r : null;
                    });
                } catch  {
                // Silenciar fallos puntuales de OMDb / límites
                }
            }
            const episodes = Object.entries(tmdbEpisodes).map(([numStr, { name, tmdbRating }])=>{
                const num = Number(numStr);
                return {
                    episode_number: num,
                    name,
                    tmdbRating,
                    imdbRating: imdbEpisodes[num] ?? null
                };
            }).sort((a, b)=>a.episode_number - b.episode_number);
            seasons.push({
                season_number: s.season_number,
                name: s.name,
                episodes
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            tmdbId: details.id,
            name: details.name,
            first_air_date: details.first_air_date,
            poster_path: details.poster_path ?? null,
            imdb_id,
            seasons
        });
    } catch (e) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: e.message || 'Error'
        }, {
            status: 500
        });
    }
}
}}),

};

//# sourceMappingURL=%5Broot-of-the-server%5D__d96f4460._.js.map