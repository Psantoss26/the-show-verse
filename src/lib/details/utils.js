/* Auto-extracted from DetailsClient.jsx */

export const mixedCount = (a, b) => {
    const A = Number(a || 0)
    const B = Number(b || 0)
    if (A > 0 && B > 0) return `${A}+${B}`
    if (A > 0) return A
    if (B > 0) return B
    return null
}

export const sumCount = (...vals) =>
    vals.reduce((acc, v) => acc + (Number(v || 0) || 0), 0)

export const formatShortNumber = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return null
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace('.0', '')}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace('.0', '')}k`
    return String(num)
}

export const slugifyForSeriesGraph = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

export const formatDateEs = (iso) => {
    if (!iso) return null
    try {
        const d = new Date(iso)
        return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
        return iso
    }
}

export const formatVoteCount = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return null
    return new Intl.NumberFormat('es-ES').format(num)
}

export const stripHtml = (html) =>
    String(html || '').replace(/<[^>]*>/g, '').trim()

export const formatDateTimeEs = (iso) => {
    if (!iso) return null
    try {
        const d = new Date(iso)
        return d.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return iso
    }
}

export const uniqBy = (arr = [], keyFn) => {
    const out = []
    const seen = new Set()
    for (const it of arr) {
        const k = keyFn(it)
        if (seen.has(k)) continue
        seen.add(k)
        out.push(it)
    }
    return out
}
