import { NextResponse } from 'next/server'

export const revalidate = 60 * 60 // 1h

const TRAKT_KEY =
    process.env.TRAKT_CLIENT_ID ||
    process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID ||
    process.env.TRAKT_API_KEY

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

function traktHeaders() {
    if (!TRAKT_KEY) throw new Error('Missing TRAKT_CLIENT_ID env')
    return {
        'content-type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_KEY,
    }
}

async function safeJson(res) {
    try { return await res.json() } catch { return null }
}

async function fetchTrakt(path) {
    const res = await fetch(`https://api.trakt.tv${path}`, {
        headers: traktHeaders(),
        next: { revalidate },
    })
    const json = await safeJson(res)
    if (!res.ok) return []
    return Array.isArray(json) ? json : []
}

async function fetchTmdb(type, id) {
    if (!TMDB_KEY) return null
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=es-ES`
    const res = await fetch(url, { next: { revalidate } })
    const json = await safeJson(res)
    if (!res.ok) return null
    return json
}

function interleave(a, b, limit = 24) {
    const out = []
    let i = 0
    while (out.length < limit && (i < a.length || i < b.length)) {
        if (i < a.length) out.push(a[i])
        if (out.length >= limit) break
        if (i < b.length) out.push(b[i])
        i++
    }
    return out
}

async function mapWithConcurrency(items, worker, concurrency = 8) {
    const out = new Array(items.length)
    let idx = 0

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (idx < items.length) {
            const cur = idx++
            out[cur] = await worker(items[cur]).catch(() => null)
        }
    })

    await Promise.all(runners)
    return out.filter(Boolean)
}

export async function GET() {
    try {
        const limitEach = 20

        const [movies, shows] = await Promise.all([
            fetchTrakt(`/movies/recommended?extended=full&limit=${limitEach}`),
            fetchTrakt(`/shows/recommended?extended=full&limit=${limitEach}`),
        ])

        const movieSeeds = movies
            .map((m) => ({ media_type: 'movie', tmdb: m?.ids?.tmdb }))
            .filter((x) => x.tmdb)

        const showSeeds = shows
            .map((s) => ({ media_type: 'tv', tmdb: s?.ids?.tmdb }))
            .filter((x) => x.tmdb)

        const mixed = interleave(movieSeeds, showSeeds, 24)

        const hydrated = await mapWithConcurrency(
            mixed,
            async (it) => {
                const details = await fetchTmdb(it.media_type === 'tv' ? 'tv' : 'movie', it.tmdb)
                if (!details?.id || !details?.poster_path) return null

                return {
                    id: details.id,
                    media_type: it.media_type,
                    title: details.title || null,
                    name: details.name || null,
                    poster_path: details.poster_path || null,
                    backdrop_path: details.backdrop_path || null,
                    release_date: details.release_date || null,
                    first_air_date: details.first_air_date || null,
                    vote_average: details.vote_average ?? null,
                    runtime: details.runtime ?? null, // movie
                    number_of_episodes: details.number_of_episodes ?? null, // tv
                }
            },
            8
        )

        return NextResponse.json({ items: hydrated })
    } catch (e) {
        console.error('trakt discover recommended error', e)
        return NextResponse.json({ items: [] }, { status: 200 })
    }
}