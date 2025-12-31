/* Auto-extracted from DetailsClient.jsx */

export const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export const mergeUniqueImages = (arrA = [], arrB = [], key = 'file_path') => {
    const out = []
    const seen = new Set()
    for (const it of [...arrA, ...arrB]) {
        const k = it?.[key]
        if (!k || seen.has(k)) continue
        seen.add(k)
        out.push(it)
    }
    return out
}

export const buildOriginalImageUrl = (filePath) => {
    if (!filePath) return null
    if (String(filePath).startsWith('http')) return filePath
    return `https://image.tmdb.org/t/p/original${filePath}`
}

// Heurística simple: escoger backdrop “bonito”
// (puedes mejorarla con scoring por vote_average, width, etc.)
export const pickBestBackdropForPreview = (backdrops = []) => {
    if (!Array.isArray(backdrops) || backdrops.length === 0) return null
    const sorted = [...backdrops].sort((a, b) => (b?.vote_average || 0) - (a?.vote_average || 0))
    return sorted[0] || backdrops[0]
}
