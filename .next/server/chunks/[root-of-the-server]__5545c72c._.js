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
"[project]/src/app/api/tv/[id]/ratings/route.js [app-route] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
// /src/app/api/tv/[id]/ratings/route.js
__turbopack_context__.s({
    "GET": (()=>GET),
    "dynamic": (()=>dynamic)
});
const dynamic = 'force-dynamic';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const OMDB_BASE = 'https://www.omdbapi.com/';
const CACHE_TTL_MS = 1000 * 60 * 10; // 10 min
const cache = new Map();
const getCache = (k)=>{
    const v = cache.get(k);
    if (!v) return null;
    if (Date.now() - v.t > CACHE_TTL_MS) {
        cache.delete(k);
        return null;
    }
    return v.d;
};
const setCache = (k, d)=>cache.set(k, {
        d,
        t: Date.now()
    });
const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
async function tmdb(path, params = {}) {
    const apiKey = ("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b");
    if ("TURBOPACK compile-time falsy", 0) {
        "TURBOPACK unreachable";
    }
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('language', 'en-US');
    for (const [k, v] of Object.entries(params))if (v != null) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
        next: {
            revalidate: 300
        }
    });
    if (!res.ok) throw new Error(`TMDb ${res.status}: ${await res.text()}`);
    return res.json();
}
async function omdb(params = {}, { retries = 2, backoff = 500 } = {}) {
    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey) throw new Error('Falta OMDB_API_KEY');
    const url = new URL(OMDB_BASE);
    url.searchParams.set('apikey', apiKey);
    for (const [k, v] of Object.entries(params))if (v != null) url.searchParams.set(k, String(v));
    for(let i = 0; i <= retries; i++){
        const res = await fetch(url, {
            next: {
                revalidate: 120
            }
        });
        let json = null;
        try {
            json = await res.json();
        } catch  {}
        const limited = json?.Error && /limit/i.test(json.Error);
        if (res.ok && json && json.Response !== 'False') return json;
        if (i < retries && limited) {
            await sleep(backoff * (i + 1));
            continue;
        }
        return json || {
            Response: 'False',
            Error: `HTTP ${res.status}`
        };
    }
}
const parseVotes = (x)=>{
    if (x == null) return null;
    if (typeof x === 'number') return x;
    if (typeof x === 'string') {
        const n = Number(x.replaceAll(',', '').trim());
        return Number.isFinite(n) ? n : null;
    }
    return null;
};
async function GET(req, ctx) {
    const { id } = await ctx.params; // Next 15
    try {
        const { searchParams } = new URL(req.url);
        const excludeSpecials = searchParams.get('excludeSpecials') === 'true';
        const cacheKey = `fast:${id}:${excludeSpecials ? 1 : 0}`;
        const hit = getCache(cacheKey);
        if (hit) return Response.json(hit);
        // Serie + imdb_id
        const [details, ext] = await Promise.all([
            tmdb(`/tv/${id}`),
            tmdb(`/tv/${id}/external_ids`)
        ]);
        const imdbSeriesId = ext?.imdb_id || null;
        const seasonsMeta = Array.isArray(details.seasons) ? details.seasons : [];
        const seasons = [];
        // Carga en paralelo: TMDb season + OMDb season (si hay imdb id)
        await Promise.all(seasonsMeta.map(async (s)=>{
            if (excludeSpecials && s.season_number === 0) return;
            const [tmdbSeason, omdbSeason] = await Promise.all([
                tmdb(`/tv/${id}/season/${s.season_number}`),
                imdbSeriesId ? omdb({
                    i: imdbSeriesId,
                    Season: s.season_number
                }) : Promise.resolve(null)
            ]);
            // Mapa rápido imdbRating por nº de episodio (OMDb Season)
            const imdbMap = {};
            if (omdbSeason?.Episodes) {
                for (const e of omdbSeason.Episodes){
                    const n = Number(e.Episode);
                    const r = e?.imdbRating && e.imdbRating !== 'N/A' ? Number(e.imdbRating) : null;
                    imdbMap[n] = Number.isFinite(r) ? r : null;
                }
            }
            const episodes = (tmdbSeason.episodes || []).map((ep)=>({
                    episode_number: ep.episode_number,
                    name: ep.name,
                    tmdbRating: typeof ep.vote_average === 'number' ? ep.vote_average : null,
                    tmdbVotes: parseVotes(ep.vote_count),
                    imdbRating: imdbMap[ep.episode_number] ?? null,
                    imdbVotes: null
                })).sort((a, b)=>a.episode_number - b.episode_number);
            seasons.push({
                season_number: s.season_number,
                name: s.name,
                episodes
            });
        }));
        seasons.sort((a, b)=>a.season_number - b.season_number);
        const payload = {
            tmdbId: details.id,
            name: details.name,
            first_air_date: details.first_air_date,
            poster_path: details.poster_path ?? null,
            imdb_id: imdbSeriesId,
            seasons
        };
        setCache(cacheKey, payload);
        return Response.json(payload);
    } catch (e) {
        return Response.json({
            error: e.message || 'Error'
        }, {
            status: 500
        });
    }
}
}}),

};

//# sourceMappingURL=%5Broot-of-the-server%5D__5545c72c._.js.map