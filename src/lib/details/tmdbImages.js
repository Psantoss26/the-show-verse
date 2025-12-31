// src/lib/details/tmdbImages.js

export const mergeUniqueImages = (current = [], incoming = []) => {
    const map = new Map()

    for (const img of current) {
        const fp = img?.file_path
        if (!fp) continue
        map.set(fp, img)
    }

    for (const img of incoming || []) {
        const fp = img?.file_path
        if (!fp) continue
        const prev = map.get(fp)
        map.set(fp, prev ? { ...prev, ...img } : img)
    }

    return Array.from(map.values())
}

export const buildOriginalImageUrl = (filePath) =>
    `https://image.tmdb.org/t/p/original${filePath}`

export const preloadTmdb = (filePath, size = 'w780') => {
    if (!filePath || typeof window === 'undefined') return Promise.resolve()
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = `https://image.tmdb.org/t/p/${size}${filePath}`
    })
}

export async function fetchTVImages({ showId, apiKey }) {
    if (!apiKey) return { posters: [], backdrops: [] }
    const url = `https://api.themoviedb.org/3/tv/${showId}/images?api_key=${apiKey}`
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.status_message || 'Error al cargar imágenes')
    return {
        posters: Array.isArray(json.posters) ? json.posters : [],
        backdrops: Array.isArray(json.backdrops) ? json.backdrops : []
    }
}

export function pickBestImage(list) {
    if (!Array.isArray(list) || list.length === 0) return null

    const maxVotes = list.reduce((max, img) => {
        const vc = img.vote_count || 0
        return vc > max ? vc : max
    }, 0)

    const withMaxVotes = list.filter((img) => (img.vote_count || 0) === maxVotes)

    const preferredLangs = new Set(['es', 'es-ES', 'en', 'en-US'])
    const preferred = withMaxVotes.filter(
        (img) => img.iso_639_1 && preferredLangs.has(img.iso_639_1)
    )

    const candidates = preferred.length ? preferred : withMaxVotes

    const sorted = [...candidates].sort((a, b) => {
        const va = (b.vote_average || 0) - (a.vote_average || 0)
        if (va !== 0) return va
        return (b.width || 0) - (a.width || 0)
    })

    return sorted[0] || null
}

export function pickBestNeutralPosterByResVotes(list, opts = {}) {
    const { resolutionWindow = 0.98, minWidth = 600 } = opts
    if (!Array.isArray(list) || list.length === 0) return null

    const area = (img) => (img?.width || 0) * (img?.height || 0)

    const neutral = list.filter((p) => p?.file_path && !p?.iso_639_1)
    const pool0 = neutral.length ? neutral : list.filter((p) => p?.file_path)

    const sizeFiltered = minWidth > 0 ? pool0.filter((p) => (p?.width || 0) >= minWidth) : pool0
    const pool1 = sizeFiltered.length ? sizeFiltered : pool0

    const maxArea = Math.max(...pool1.map(area))
    const threshold = maxArea * (typeof resolutionWindow === 'number' ? resolutionWindow : 1.0)
    const pool2 = pool1.filter((p) => area(p) >= threshold)

    const sorted = [...pool2].sort((a, b) => {
        const aA = area(a)
        const bA = area(b)
        if (bA !== aA) return bA - aA
        const w = (b.width || 0) - (a.width || 0)
        if (w !== 0) return w
        const vc = (b.vote_count || 0) - (a.vote_count || 0)
        if (vc !== 0) return vc
        const va = (b.vote_average || 0) - (a.vote_average || 0)
        return va
    })

    return sorted[0] || pool1[0] || null
}

export function pickBestBackdropByLangResVotes(list, opts = {}) {
    const {
        preferLangs = ['en', 'en-US'],
        resolutionWindow = 0.98,
        minWidth = 1200
    } = opts

    if (!Array.isArray(list) || list.length === 0) return null

    const area = (img) => (img?.width || 0) * (img?.height || 0)
    const lang = (img) => img?.iso_639_1 || null

    const sizeFiltered = minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list
    const pool0 = sizeFiltered.length ? sizeFiltered : list

    const hasPreferred = pool0.some((b) => preferLangs.includes(lang(b)))
    const pool1 = hasPreferred ? pool0.filter((b) => preferLangs.includes(lang(b))) : pool0

    const maxArea = Math.max(...pool1.map(area))
    const threshold = maxArea * (typeof resolutionWindow === 'number' ? resolutionWindow : 1.0)
    const pool2 = pool1.filter((b) => area(b) >= threshold)

    const sorted = [...pool2].sort((a, b) => {
        const aA = area(a)
        const bA = area(b)
        if (bA !== aA) return bA - aA
        const w = (b.width || 0) - (a.width || 0)
        if (w !== 0) return w
        const vc = (b.vote_count || 0) - (a.vote_count || 0)
        if (vc !== 0) return vc
        const va = (b.vote_average || 0) - (a.vote_average || 0)
        return va
    })

    return sorted[0] || null
}

export const pickBestPosterTV = (posters) => {
    const best = pickBestImage(posters || [])
    return best?.file_path || null
}

export const pickBestBackdropTVNeutralFirst = (backs) => {
    const best = pickBestImage(backs || [])
    return best?.file_path || null
}

export const pickBestBackdropForPreview = (backs) => {
    const all = Array.isArray(backs) ? backs : []
    if (!all.length) return null

    const allowed = new Set(['es', 'en'])
    const langBacks = all.filter((img) => allowed.has((img?.iso_639_1 || '').toLowerCase()))

    const best = pickBestImage(langBacks.length ? langBacks : all)
    return best?.file_path || null
}
