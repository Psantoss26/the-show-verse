// src/lib/details/formatters.js

export const formatShortNumber = (num) => {
    if (!num) return null
    const n = Number(num)
    if (isNaN(n)) return null
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return n.toString()
}

export const slugifyForSeriesGraph = (name) => {
    if (!name) return ''
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
}

export const formatDateEs = (iso) => {
    if (!iso) return null
    try {
        return new Date(iso).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    } catch {
        return iso
    }
}

export const formatVoteCount = (v) => {
    const n =
        typeof v === 'number'
            ? v
            : Number(String(v || '').replace(/,/g, '').trim())

    if (!Number.isFinite(n) || n <= 0) return null

    return new Intl.NumberFormat('es-ES', {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(n)
}

export function formatCountShort(input) {
    if (input == null) return null

    let n = input
    // Acepta "2,5M" no, pero acepta strings de OMDb tipo "2,498,190"
    if (typeof n === 'string') {
        const digits = n.replace(/[^\d]/g, '')
        n = digits ? Number(digits) : NaN
    }

    if (!Number.isFinite(n) || n <= 0) return null

    const fmt1 = (x) => x.toFixed(1).replace(/\.0$/, '').replace('.', ',')

    if (n >= 1_000_000) {
        const v = n / 1_000_000
        return `${v >= 10 ? Math.round(v) : fmt1(v)}M`
    }
    if (n >= 1_000) {
        const v = n / 1_000
        return `${v >= 10 ? Math.round(v) : fmt1(v)}K`
    }
    return String(n)
}

export const stripHtml = (s) => String(s || '').replace(/<[^>]*>?/gm, '').trim()

export const formatDateTimeEs = (iso) => {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
        return iso
    }
}

export const mixedCount = (a, b) => {
    const A = Number(a || 0)
    const B = Number(b || 0)
    if (A > 0 && B > 0) return `${A}+${B}`
    if (A > 0) return A
    if (B > 0) return B
    return null
}

export const sumCount = (...vals) => vals.reduce((acc, v) => acc + (Number(v || 0) || 0), 0)
