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

export const pickBestBackdropForPreview = (list, opts = {}) => {
    const { preferLangs = ['en', 'en-US'], minWidth = 1200 } = opts
    if (!Array.isArray(list) || list.length === 0) return null

    // normaliza a 'en'
    const norm = (v) => (v ? String(v).toLowerCase().split('-')[0] : null)
    const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean))
    const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1))

    // Mantener orden + minWidth (si no hay, cae al original)
    const pool0 = minWidth > 0 ? list.filter((b) => (b?.width || 0) >= minWidth) : list
    const pool = pool0.length ? pool0 : list

    // ✅ SOLO 3 primeras EN (en orden). Si no hay EN, devolvemos null (siempre EN)
    const top3en = []
    for (const b of pool) {
        if (isPreferredLang(b)) top3en.push(b)
        if (top3en.length === 3) break
    }
    if (!top3en.length) return null

    const isRes = (b, w, h) => (b?.width || 0) === w && (b?.height || 0) === h

    // Prioridades: 1920x1080, 2560x1440, 3840x2160, 1280x720, y si no la primera EN
    const b1080 = top3en.find((b) => isRes(b, 1920, 1080))
    if (b1080) return b1080.file_path

    const b1440 = top3en.find((b) => isRes(b, 2560, 1440))
    if (b1440) return b1440.file_path

    const b4k = top3en.find((b) => isRes(b, 3840, 2160))
    if (b4k) return b4k.file_path

    const b720 = top3en.find((b) => isRes(b, 1280, 720))
    if (b720) return b720.file_path

    return top3en[0]?.file_path || null
}
