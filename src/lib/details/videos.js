// src/lib/details/videos.js

export const uniqBy = (arr, keyFn) => {
    const seen = new Set()
    const out = []
    for (const item of arr || []) {
        const k = keyFn(item)
        if (!k || seen.has(k)) continue
        seen.add(k)
        out.push(item)
    }
    return out
}

export const isPlayableVideo = (v) => v?.site === 'YouTube' || v?.site === 'Vimeo'

export const videoExternalUrl = (v) => {
    if (!v?.key) return null
    if (v.site === 'YouTube') return `https://www.youtube.com/watch?v=${v.key}`
    if (v.site === 'Vimeo') return `https://vimeo.com/${v.key}`
    return null
}

export const videoEmbedUrl = (v, autoplay = true) => {
    if (!v?.key) return null
    if (v.site === 'YouTube') {
        const ap = autoplay ? 1 : 0
        return `https://www.youtube.com/embed/${v.key}?autoplay=${ap}&rel=0&modestbranding=1&playsinline=1`
    }
    if (v.site === 'Vimeo') {
        const ap = autoplay ? 1 : 0
        return `https://player.vimeo.com/video/${v.key}?autoplay=${ap}`
    }
    return null
}

export const videoThumbUrl = (v) => {
    if (!v?.key) return null
    if (v.site === 'YouTube') return `https://img.youtube.com/vi/${v.key}/hqdefault.jpg`
    return null
}

export const rankVideo = (v) => {
    const typeRank = {
        Trailer: 0,
        Teaser: 1,
        Clip: 2,
        Featurette: 3,
        'Behind the Scenes': 4
    }
    const lang = (v?.iso_639_1 || '').toLowerCase()
    const langRank = lang === 'es' ? 0 : lang === 'en' ? 1 : 2
    const siteRank = v?.site === 'YouTube' ? 0 : v?.site === 'Vimeo' ? 1 : 2
    const tRank = typeRank[v?.type] ?? 9
    const officialRank = v?.official ? 0 : 1

    return officialRank * 1000 + tRank * 100 + siteRank * 10 + langRank
}

export const pickPreferredVideo = (videos) => {
    const playable = (videos || []).filter(isPlayableVideo)
    if (!playable.length) return null
    const sorted = [...playable].sort((a, b) => rankVideo(a) - rankVideo(b))
    return sorted[0] || null
}
