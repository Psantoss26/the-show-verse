// src/app/api/trakt/show/plays/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    traktFetch,
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HISTORY_LIMIT = 200
const MAX_PAGES = 80

// ✅ POST chunking para evitar payloads demasiado grandes (causa típica de 500)
const MAX_EPISODES_PER_CALL = 350

function buildEpisodeKey(sn, en) {
    return `${sn}x${en}`
}

// Acepta ISO o YYYY-MM-DD (interpreta YYYY-MM-DD como medianoche UTC)
function normalizeWatchedAtIso(input) {
    if (!input) return null
    if (input instanceof Date && !Number.isNaN(input.getTime())) return input.toISOString()

    const s = String(input).trim()
    if (!s) return null

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const d = new Date(`${s}T00:00:00.000Z`)
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }

    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

async function resolveShowTraktId(token, tmdbId) {
    const r = await traktFetch(`/search/tmdb/${encodeURIComponent(tmdbId)}?type=show`, { token })
    if (!r.ok) throw new Error(r?.json?.error || `Trakt search failed (${r.status})`)
    const hit = Array.isArray(r.json) ? r.json[0] : null
    return hit?.show?.ids?.trakt ?? null
}

async function fetchShowSeasonsWithEpisodes(token, traktId) {
    const r = await traktFetch(`/shows/${encodeURIComponent(traktId)}/seasons?extended=episodes`, { token })
    if (!r.ok) throw new Error(r?.json?.error || `Trakt seasons failed (${r.status})`)
    return Array.isArray(r.json) ? r.json : []
}

function collectCanonicalEpisodes(seasons) {
    const episodeKeySet = new Set()
    const canonicalBySeason = {}

    for (const s of seasons) {
        const sn = Number(s?.number)
        if (!Number.isFinite(sn) || sn <= 0) continue

        const eps = Array.isArray(s?.episodes) ? s.episodes : []
        for (const ep of eps) {
            const en = Number(ep?.number)
            if (!Number.isFinite(en) || en <= 0) continue
            episodeKeySet.add(buildEpisodeKey(sn, en))
            if (!canonicalBySeason[sn]) canonicalBySeason[sn] = []
            canonicalBySeason[sn].push(en)
        }
    }

    for (const sn of Object.keys(canonicalBySeason)) {
        canonicalBySeason[Number(sn)] = [...new Set(canonicalBySeason[sn])].sort((a, b) => a - b)
    }

    return { episodeKeySet, canonicalBySeason, totalEpisodes: episodeKeySet.size }
}

async function fetchAllShowHistory(token, traktId, { startAtIso } = {}) {
    const out = []
    for (let page = 1; page <= MAX_PAGES; page++) {
        const qs = new URLSearchParams()
        qs.set('page', String(page))
        qs.set('limit', String(HISTORY_LIMIT))
        qs.set('extended', 'full')
        if (startAtIso) qs.set('start_at', startAtIso)

        const r = await traktFetch(`/sync/history/shows/${encodeURIComponent(traktId)}?${qs.toString()}`, { token })
        if (!r.ok) throw new Error(r?.json?.error || `Trakt show history failed (${r.status})`)

        const items = Array.isArray(r.json) ? r.json : []
        if (items.length === 0) break

        out.push(...items)
        if (items.length < HISTORY_LIMIT) break
    }
    return out
}

/**
 * Calcula cuántas veces "se ha completado" la serie basándose en:
 * minPlays = mínimo conteo de plays por episodio
 * showPlays = timestamps (watched_at) en los que se completó cada run (más recientes primero)
 */
function computeShowCompletions(historyItems, episodeKeySet) {
    const keys = Array.from(episodeKeySet)
    const total = keys.length
    if (!total) return { showPlays: [], minPlays: 0 }

    const counts = Object.create(null)
    for (const k of keys) counts[k] = 0

    let minCount = 0
    let numAtMin = total
    const completionsAsc = []

    const itemsAsc = (Array.isArray(historyItems) ? historyItems : [])
        .filter((it) => it?.watched_at && it?.episode?.season > 0 && it?.episode?.number > 0)
        .sort((a, b) => new Date(a.watched_at).getTime() - new Date(b.watched_at).getTime())

    for (const it of itemsAsc) {
        const sn = Number(it.episode.season)
        const en = Number(it.episode.number)
        const k = buildEpisodeKey(sn, en)
        if (!episodeKeySet.has(k)) continue

        const before = counts[k] ?? 0
        if (before === minCount) numAtMin -= 1
        counts[k] = before + 1

        // cuando TODOS los episodios alcanzan minCount+1, se considera un run completado
        if (numAtMin === 0) {
            minCount += 1
            completionsAsc.push(it.watched_at)

            let c = 0
            for (const kk of keys) if ((counts[kk] ?? 0) === minCount) c++
            numAtMin = c
        }
    }

    return { showPlays: completionsAsc.slice().reverse(), minPlays: minCount }
}

/**
 * Progreso "desde" startAtIso (rewatch). Nota: esto no separa runs por sí solo;
 * sirve para "progreso del rewatch actual" si tu app persiste startAt.
 */
function computeWatchedBySeasonSince(historyItems, startAtIso, episodeKeySet) {
    if (!startAtIso) return null
    const startMs = new Date(startAtIso).getTime()
    if (Number.isNaN(startMs)) return null

    const map = {}

    for (const it of Array.isArray(historyItems) ? historyItems : []) {
        const wa = it?.watched_at
        const ms = wa ? new Date(wa).getTime() : NaN
        if (Number.isNaN(ms) || ms < startMs) continue

        const sn = Number(it?.episode?.season)
        const en = Number(it?.episode?.number)
        if (!Number.isFinite(sn) || sn <= 0) continue
        if (!Number.isFinite(en) || en <= 0) continue

        const k = buildEpisodeKey(sn, en)
        if (!episodeKeySet.has(k)) continue

        if (!map[sn]) map[sn] = new Set()
        map[sn].add(en)
    }

    const out = {}
    for (const [sn, set] of Object.entries(map)) {
        out[Number(sn)] = Array.from(set).sort((a, b) => a - b)
    }
    return out
}

function chunkSeasonsByEpisodeCount(payloadSeasons) {
    const batches = []
    let cur = []
    let curCount = 0

    for (const s of payloadSeasons) {
        const c = Array.isArray(s?.episodes) ? s.episodes.length : 0
        if (!c) continue

        // si no cabe, cerramos batch actual
        if (curCount + c > MAX_EPISODES_PER_CALL && cur.length) {
            batches.push(cur)
            cur = []
            curCount = 0
        }

        cur.push(s)
        curCount += c
    }

    if (cur.length) batches.push(cur)
    return batches
}

export async function GET(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const tmdbId = request.nextUrl.searchParams.get('tmdbId')
    const startAt = request.nextUrl.searchParams.get('startAt')

    if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    if (!accessToken && !refreshToken) return NextResponse.json({ connected: false }, { status: 401 })

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false }, { status: 401 })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        const traktId = await resolveShowTraktId(token, Number(tmdbId))
        if (!traktId) {
            const res = NextResponse.json({ connected: true, found: false, showPlays: [], plays: [] })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        const seasons = await fetchShowSeasonsWithEpisodes(token, traktId)
        const { episodeKeySet, totalEpisodes } = collectCanonicalEpisodes(seasons)

        const historyAll = await fetchAllShowHistory(token, traktId)
        const { showPlays, minPlays } = computeShowCompletions(historyAll, episodeKeySet)

        const startAtIso = normalizeWatchedAtIso(startAt)
        const watchedBySeasonSince = startAtIso
            ? computeWatchedBySeasonSince(historyAll, startAtIso, episodeKeySet)
            : null

        const res = NextResponse.json({
            connected: true,
            found: true,
            traktId,
            totalEpisodes,
            minPlays,
            completedPlays: showPlays.length,
            showPlays,
            plays: showPlays, // alias
            watchedBySeasonSince,
            startAt: startAtIso || null,
        })

        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Trakt show plays failed' },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}

export async function POST(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    const body = await request.json().catch(() => ({}))
    const tmdbId = body?.tmdbId
    const watchedAt = body?.watchedAt

    if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    if (!accessToken && !refreshToken) return NextResponse.json({ connected: false }, { status: 401 })

    let token = accessToken
    let refreshedTokens = null

    try {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) return NextResponse.json({ connected: false }, { status: 401 })
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }

        const traktId = await resolveShowTraktId(token, Number(tmdbId))
        if (!traktId) {
            const res = NextResponse.json({ connected: true, found: false }, { status: 404 })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        const seasons = await fetchShowSeasonsWithEpisodes(token, traktId)
        const watchedAtIso = normalizeWatchedAtIso(watchedAt)

        // Construye seasons payload completo (sin specials)
        const payloadSeasons = []
        for (const s of seasons) {
            const sn = Number(s?.number)
            if (!Number.isFinite(sn) || sn <= 0) continue

            const eps = Array.isArray(s?.episodes) ? s.episodes : []
            const episodes = eps
                .map((ep) => {
                    const en = Number(ep?.number)
                    if (!Number.isFinite(en) || en <= 0) return null
                    const obj = { number: en }
                    if (watchedAtIso) obj.watched_at = watchedAtIso
                    return obj
                })
                .filter(Boolean)

            if (episodes.length) payloadSeasons.push({ number: sn, episodes })
        }

        // ✅ EVITA 500: manda por lotes
        const batches = chunkSeasonsByEpisodeCount(payloadSeasons)
        if (batches.length === 0) {
            const res = NextResponse.json({ connected: true, ok: true, traktId, batches: 0 })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        for (const seasonsChunk of batches) {
            const payload = {
                shows: [{ ids: { trakt: Number(traktId) }, seasons: seasonsChunk }],
            }

            const r = await traktFetch('/sync/history', {
                token,
                method: 'POST',
                body: payload,
                headers: { 'Content-Type': 'application/json' },
            })

            if (!r.ok) throw new Error(r?.json?.error || `Trakt sync/history failed (${r.status})`)
        }

        const res = NextResponse.json({ connected: true, ok: true, traktId, batches: batches.length })
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        const res = NextResponse.json(
            { connected: true, error: e?.message || 'Trakt add show play failed' },
            { status: 500 }
        )
        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    }
}