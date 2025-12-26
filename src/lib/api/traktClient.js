async function safeJson(res) {
    try {
        return await res.json()
    } catch {
        return null
    }
}

/**
 * Normaliza watchedAt para enviar al backend de forma consistente.
 * Acepta:
 *  - "YYYY-MM-DD" (input type="date")
 *  - "DD/MM/YYYY" o "DD-MM-YYYY"
 *  - Date
 *  - ISO
 * Devuelve:
 *  - "YYYY-MM-DD" (preferido) o null
 */
function normalizeWatchedAtForApi(input) {
    if (input == null) return null

    if (input instanceof Date && !Number.isNaN(input.getTime())) {
        return input.toISOString().slice(0, 10)
    }

    const s = String(input).trim()
    if (!s) return null

    // ya viene perfecto
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

    // dd/mm/yyyy o dd-mm-yyyy
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (m) {
        const dd = String(parseInt(m[1], 10)).padStart(2, '0')
        const mm = String(parseInt(m[2], 10)).padStart(2, '0')
        const yyyy = m[3]
        const ymd = `${yyyy}-${mm}-${dd}`
        return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
    }

    // ISO u otras fechas parseables → pasamos a YYYY-MM-DD
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
    // solo lo mandamos si existe (evita que el backend “pise” con hoy)
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

    // ✅ solo añadimos campos si vienen definidos (remove no necesita type/tmdbId)
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
 * ✅ NUEVO: Historial global (movies + shows)
 * type: 'all' | 'movies' | 'shows'
 * from/to: 'YYYY-MM-DD'
 */
export async function traktGetHistory({ type = 'all', from, to, page = 1, limit = 200 } = {}) {
    const qs = new URLSearchParams()
    qs.set('type', type)
    qs.set('page', String(page))
    qs.set('limit', String(limit))
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)

    const res = await fetch(`/api/trakt/history?${qs.toString()}`, { cache: 'no-store' })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt history HTTP ${res.status}`)
    return json
}

export async function traktGetShowWatched({ tmdbId }) {
    const res = await fetch(`/api/trakt/show/watched?tmdbId=${encodeURIComponent(tmdbId)}`, {
        cache: 'no-store'
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt show watched HTTP ${res.status}`)
    return json
}

export async function traktSetEpisodeWatched({ tmdbId, season, episode, watched, watchedAt }) {
    const res = await fetch('/api/trakt/episode/watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId, season, episode, watched, watchedAt })
    })
    const json = await safeJson(res)
    if (!res.ok) throw new Error(json?.error || `Trakt episode watched HTTP ${res.status}`)
    return json
}

