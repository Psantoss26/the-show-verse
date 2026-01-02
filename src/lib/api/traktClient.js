async function safeJson(res) {
    try {
        return await res.json()
    } catch {
        return null
    }
}

/**
 * Normaliza watchedAt para enviar al backend de forma consistente.
 * Devuelve "YYYY-MM-DD" o null
 */
function normalizeWatchedAtForApi(input) {
    if (input == null) return null

    if (input instanceof Date && !Number.isNaN(input.getTime())) {
        return input.toISOString().slice(0, 10)
    }

    const s = String(input).trim()
    if (!s) return null

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (m) {
        const dd = String(parseInt(m[1], 10)).padStart(2, '0')
        const mm = String(parseInt(m[2], 10)).padStart(2, '0')
        const yyyy = m[3]
        const ymd = `${yyyy}-${mm}-${dd}`
        return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
    }

    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)

    return null
}

export async function traktAuthStatus() {
    const res = await fetch('/api/trakt/auth/status', { cache: 'no-store' })
    const json = await safeJson(res)
    return json || { connected: false }
}

export async function traktDisconnect() {
    const res = await fetch('/api/trakt/auth/disconnect', { method: 'POST' })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || 'Disconnect failed')
    return json
}

export async function traktGetItemStatus({ type, tmdbId }) {
    const url = `/api/trakt/item/status?type=${encodeURIComponent(type)}&tmdbId=${encodeURIComponent(tmdbId)}`
    const res = await fetch(url, { cache: 'no-store' })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt status HTTP ${res.status}`)
    return json
}

export async function traktSetWatched({ type, tmdbId, watched, watchedAt }) {
    const watchedAtYmd = normalizeWatchedAtForApi(watchedAt)

    const payload = { type, tmdbId, watched }
    if (watchedAtYmd) payload.watchedAt = watchedAtYmd

    const res = await fetch('/api/trakt/item/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })

    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt watched HTTP ${res.status}`)
    return json
}

export async function traktHistoryOp({ op, type, tmdbId, watchedAt, historyId }) {
    const payload = { op }
    if (type != null) payload.type = type
    if (tmdbId != null) payload.tmdbId = tmdbId
    if (historyId != null) payload.historyId = historyId

    const watchedAtYmd = normalizeWatchedAtForApi(watchedAt)
    if (watchedAtYmd) payload.watchedAt = watchedAtYmd

    const res = await fetch('/api/trakt/item/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })

    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt history HTTP ${res.status}`)
    return json
}

export async function traktAddWatchPlay({ type, tmdbId, watchedAt }) {
    return traktHistoryOp({ op: 'add', type, tmdbId, watchedAt })
}

export async function traktUpdateWatchPlay({ type, tmdbId, historyId, watchedAt }) {
    return traktHistoryOp({ op: 'update', type, tmdbId, historyId, watchedAt })
}

export async function traktRemoveWatchPlay({ historyId }) {
    return traktHistoryOp({ op: 'remove', historyId })
}

/**
 * Historial global
 */
export async function traktGetHistory({ type = 'all', from, to, page = 1, limit = 200, extended = 'full' } = {}) {
    const qs = new URLSearchParams()
    qs.set('type', type)
    qs.set('page', String(page))
    qs.set('limit', String(limit))
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (extended) qs.set('extended', extended)

    const res = await fetch(`/api/trakt/history?${qs.toString()}`, { cache: 'no-store' })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt history HTTP ${res.status}`)
    return json
}

/** ✅ NUEVO/CLAVE: carga episodios vistos por show (SIN especiales) */
export async function traktGetShowWatched({ tmdbId }) {
    const res = await fetch(`/api/trakt/show/watched?tmdbId=${encodeURIComponent(tmdbId)}`, {
        cache: 'no-store'
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt show watched HTTP ${res.status}`)
    return json // { watchedBySeason }
}

/** ✅ Toggle episodio + devuelve watchedBySeason actualizado */
export async function traktSetEpisodeWatched({ tmdbId, season, episode, watched, watchedAt }) {
    const watchedAtYmd = normalizeWatchedAtForApi(watchedAt)

    const payload = { tmdbId, season, episode, watched }
    if (watchedAtYmd) payload.watchedAt = watchedAtYmd

    const res = await fetch('/api/trakt/episode/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })

    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt episode watched HTTP ${res.status}`)
    return json // { watchedBySeason }
}

// ✅ COMMUNITY: comentarios, listas, temporadas
export async function traktGetComments({ type, tmdbId, sort = 'likes', page = 1, limit = 20 }) {
    const qs = new URLSearchParams({
        type: String(type),
        tmdbId: String(tmdbId),
        sort: String(sort),
        page: String(page),
        limit: String(limit)
    })
    const res = await fetch(`/api/trakt/community/comments?${qs.toString()}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Error cargando comentarios')
    return json
}

export async function traktGetLists({ type, tmdbId, tab = 'popular', page = 1, limit = 10 }) {
    const qs = new URLSearchParams({
        type: String(type),
        tmdbId: String(tmdbId),
        tab: String(tab),
        page: String(page),
        limit: String(limit)
    })
    const res = await fetch(`/api/trakt/community/lists?${qs.toString()}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Error cargando listas')
    return json
}

export async function traktGetShowSeasons({ tmdbId, extended = 'full' }) {
    const qs = new URLSearchParams({ tmdbId: String(tmdbId), extended: String(extended) })
    const res = await fetch(`/api/trakt/community/seasons?${qs.toString()}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Error cargando temporadas')
    return json
}

export async function traktGetScoreboard({ type, tmdbId }) {
    const qs = new URLSearchParams({ type, tmdbId: String(tmdbId) })
    const res = await fetch(`/api/trakt/scoreboard?${qs.toString()}`, {
        method: 'GET',
        credentials: 'include'
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Error cargando scoreboard')
    return json
}

export async function traktGetStats({ type, tmdbId }) {
    const qs = new URLSearchParams({
        type: String(type),
        tmdbId: String(tmdbId),
    })

    const res = await fetch(`/api/trakt/stats?${qs.toString()}`, {
        cache: 'no-store',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Error cargando stats de Trakt')
    return json
}

export async function traktSetRating({ type, tmdbId, ids, season, episode, rating }) {
    const body = {
        type,
        rating: rating == null ? null : Number(rating),
    }

    // ✅ movie/show: tu route espera tmdbId
    const tmdb = tmdbId ?? ids?.tmdb
    if (tmdb != null) body.tmdbId = Number(tmdb)

    // ✅ season/episode: por si lo reutilizas (tu backend ya puede resolver por tmdbId+season/episode)
    if (season != null) body.season = Number(season)
    if (episode != null) body.episode = Number(episode)

    // ✅ opcional: si tu backend aceptara traktId directo
    if (ids?.trakt != null) body.traktId = Number(ids.trakt)

    const res = await fetch('/api/trakt/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Trakt rating failed')
    return json
}

export async function traktRemoveRating({ type, ids }) {
    const res = await fetch('/api/trakt/ratings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ids }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(data?.error || `Trakt remove rating failed (${res.status})`)
    }
    return data
}