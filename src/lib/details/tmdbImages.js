import { TMDB_IMAGE_LANGS_PARAM } from '../tmdb/imageLanguages.js'

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
    const url = `https://api.themoviedb.org/3/tv/${showId}/images?api_key=${apiKey}&${TMDB_IMAGE_LANGS_PARAM}`
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

// El póster principal de DetailsClient prioriza arte en inglés, conserva el
// textless como segundo recurso y evita caer en arte español cuando TMDb no
// ofrece ninguna de las dos opciones. Compartirlo entre superficies evita que
// una misma ficha cambie de idioma según el lugar donde se muestre.
export function pickBestEnglishPoster(list) {
    if (!Array.isArray(list) || list.length === 0) return null

    const isEnglishPoster = (img) => {
        const language = String(img?.iso_639_1 || '').toLowerCase()
        return img?.file_path && (language === 'en' || language === 'en-us')
    }
    const isSpanishPoster = (img) => {
        const language = String(img?.iso_639_1 || '').toLowerCase()
        return language === 'es' || language === 'es-es'
    }

    const englishPosters = list.filter(isEnglishPoster)
    if (englishPosters.length) return pickBestImage(englishPosters)

    const neutralPosters = list.filter((img) => img?.file_path && !img?.iso_639_1)
    if (neutralPosters.length) return pickBestImage(neutralPosters)

    const nonSpanishPosters = list.filter((img) => img?.file_path && !isSpanishPoster(img))
    return pickBestImage(nonSpanishPosters)
}

// Criterio de Favoritos para las parrillas: solo arte en inglés; dentro de
// ese grupo se prioriza el consenso de TMDb y se conserva el póster original
// del llamante si no hay una alternativa inglesa.
export function pickBestFavoriteEnglishPoster(list) {
    if (!Array.isArray(list) || list.length === 0) return null

    const languageOf = (value) => value ? String(value).toLowerCase().split('-')[0] : null
    const englishPosters = list.filter(
        (poster) => poster?.file_path && languageOf(poster?.iso_639_1) === 'en',
    )
    if (!englishPosters.length) return null

    const maxVotes = englishPosters.reduce(
        (max, poster) => Math.max(max, Number(poster?.vote_count) || 0),
        0,
    )
    const candidates = englishPosters.filter(
        (poster) => (Number(poster?.vote_count) || 0) === maxVotes,
    )

    return [...candidates].sort((a, b) =>
        (Number(b?.vote_average) || 0) - (Number(a?.vote_average) || 0)
        || (Number(b?.width) || 0) - (Number(a?.width) || 0),
    )[0] || null
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

// Portada del héroe MÓVIL calculada SOLO con lo que ya trae el SSR.
//
// Reproduce la política de `mobileNeutralPosterPath` (DetailsClient): se
// prefiere arte sin idioma de la galería, y la portada principal queda como
// último recurso. La galería excluye la portada principal porque en el cliente
// entra marcada con `from: "main"` y ese filtro la descarta: no lleva metadatos
// de idioma, así que no puede considerarse neutra.
//
// Vive aquí para que el servidor pueda precargar EXACTAMENTE la URL que el
// cliente va a pedir. Si las dos se separan, la precarga deja de valer y se
// descarga una imagen de más -- justo lo contrario de lo que busca.
export function pickMobileHeroPosterPath({
    posterPath,
    profilePath,
    posters
} = {}) {
    const gallery = (Array.isArray(posters) ? posters : []).filter(
        (img) => img?.file_path && img.file_path !== posterPath
    )

    return (
        pickBestNeutralPosterByResVotes(gallery)?.file_path ||
        posterPath ||
        profilePath ||
        null
    )
}

export const isLanguageNeutralImage = (img) => {
    if (!img?.file_path) return false
    if (!Object.prototype.hasOwnProperty.call(img, 'iso_639_1')) return false

    const language = img.iso_639_1
    return language == null || String(language).trim() === ''
}

export function pickBestNeutralBackdropByResVotes(list, opts = {}) {
    const { resolutionWindow = 0.98, minWidth = 1200 } = opts
    if (!Array.isArray(list) || list.length === 0) return null

    const area = (img) => (img?.width || 0) * (img?.height || 0)
    const neutral = list.filter(isLanguageNeutralImage)
    if (neutral.length === 0) return null

    const sizeFiltered = minWidth > 0
        ? neutral.filter((img) => (img?.width || 0) >= minWidth)
        : neutral
    const pool = sizeFiltered.length ? sizeFiltered : neutral

    const maxArea = Math.max(...pool.map(area))
    const threshold = maxArea * (typeof resolutionWindow === 'number' ? resolutionWindow : 1.0)
    const candidates = pool.filter((img) => area(img) >= threshold)

    const sorted = [...candidates].sort((a, b) => {
        const areaDifference = area(b) - area(a)
        if (areaDifference !== 0) return areaDifference

        const widthDifference = (b.width || 0) - (a.width || 0)
        if (widthDifference !== 0) return widthDifference

        const voteCountDifference = (b.vote_count || 0) - (a.vote_count || 0)
        if (voteCountDifference !== 0) return voteCountDifference

        return (b.vote_average || 0) - (a.vote_average || 0)
    })

    return sorted[0] || pool[0] || null
}

export function resolveNeutralBackdropPath(list, preferredPaths = []) {
    const neutralImages = Array.isArray(list) ? list.filter(isLanguageNeutralImage) : []
    if (neutralImages.length === 0) return null

    const neutralPaths = new Set(neutralImages.map((img) => img.file_path))
    for (const value of preferredPaths || []) {
        const path = typeof value === 'string' ? value : value?.file_path
        if (path && neutralPaths.has(path)) return path
    }

    return pickBestNeutralBackdropByResVotes(neutralImages)?.file_path || null
}

// Mejor backdrop SIN idioma (textless), que es el arte apto para llevar el
// logotipo superpuesto: un fondo con el título impreso lo duplicaría.
//
// ESTE ES EL CRITERIO DE LA FICHA, y vive aquí —en un módulo sin dependencias—
// porque lo comparten el fondo de DetailsClient y el héroe de DetailModal. Antes
// cada uno tenía el suyo: el modal ordenaba por ANCHO y la ficha por ÁREA dentro
// de una ventana del 98%, así que en cuanto un título tenía, por ejemplo, un
// 4096x1716 y un 3840x2160, cada superficie elegía una imagen distinta para el
// mismo título. `@/lib/dashboard/media` lo reexporta para no duplicarlo.
//
// Orden: primero se descarta lo que lleva idioma; si no queda nada textless se
// admite el resto (`allowLanguageFallback`), porque es preferible un fondo con
// texto a ninguno. Dentro del grupo mandan ancho, alto y nota.
export function pickBestBackdropNoLang(
    list,
    {
        minWidth = 1280,
        offset = 0,
        limit = 0,
        excludePaths = [],
        allowLanguageFallback = true
    } = {}
) {
    if (!Array.isArray(list) || list.length === 0) return null

    const norm = (v) => (v ? String(v).toLowerCase().split('-')[0] : null)
    const noLang = list.filter((b) => !norm(b?.iso_639_1))
    if (!noLang.length && !allowLanguageFallback) return null
    const pool = noLang.length ? noLang : list
    const excluded = new Set(excludePaths.filter(Boolean))

    const sized = pool.filter((b) => (b?.width || 0) >= minWidth)
    const candidates = sized.length ? sized : pool
    const limitedCandidates =
        Number.isFinite(limit) && limit > 0 ? candidates.slice(0, limit) : candidates
    const sorted = limitedCandidates
        .map((backdrop, position) => ({ backdrop, position }))
        .filter(({ backdrop }) => !excluded.has(backdrop?.file_path))
        .sort((a, b) =>
            (b.backdrop?.width || 0) - (a.backdrop?.width || 0) ||
            (b.backdrop?.height || 0) - (a.backdrop?.height || 0) ||
            (b.backdrop?.vote_average || 0) - (a.backdrop?.vote_average || 0) ||
            a.position - b.position
        )
        .map(({ backdrop }) => backdrop)

    const index = Math.max(0, Math.min(sorted.length - 1, Number(offset) || 0))
    return sorted[index] || null
}

// Fondo de la ficha (DetailsClient) y del héroe del modal, con UN SOLO criterio.
//
// La cadena es la misma que resuelve `useDetailModalData` para su hero:
//   selección del usuario -> mejor textless de la galería -> portada principal.
//
// SE EXIGE METADATO DE IDIOMA para entrar en la galería, y el matiz importa:
// DetailsClient inyecta la portada principal como `{ file_path, from: "main" }`,
// sin `iso_639_1` ni medidas. Esa entrada PELADA no puede competir —sin idioma
// declarado, `pickBestBackdropNoLang` la tomaría por textless y podría elegirla
// por delante del arte de verdad—, así que se descarta y queda como último
// recurso, igual que en el modal.
//
// Filtrar por `from !== "main"` NO vale, y costó un rato verlo: cuando la
// portada principal TAMBIÉN está en la galería (lo normal), `mergeUniqueImages`
// funde las dos entradas y la buena se queda con la marca `from: "main"` encima.
// Con ese filtro se descartaba justo la imagen que había que elegir: en Barbie,
// el servidor pintaba la correcta y el cliente la sustituía por la siguiente.
// El metadato de idioma distingue las dos cosas sin ambigüedad.
//
// `allowMainFallback: false` es para el fondo PROVISIONAL (mientras la galería
// aún no se conoce): sin galería no se pinta la portada principal, porque casi
// nunca es la elección definitiva y pintarla primero es justo el parpadeo
// "una imagen y luego otra" que este módulo existe para evitar. Es preferible
// esperar, que es lo que hace el modal con su esqueleto.
export function pickHeroBackdropPath({
    backdropPath,
    backdrops,
    preferredPaths = [],
    allowMainFallback = true
} = {}) {
    for (const value of preferredPaths || []) {
        const path = typeof value === 'string' ? value : value?.file_path
        if (path) return path
    }

    const gallery = (Array.isArray(backdrops) ? backdrops : []).filter(
        (img) =>
            img?.file_path &&
            Object.prototype.hasOwnProperty.call(img, 'iso_639_1')
    )
    const best = pickBestBackdropNoLang(gallery)?.file_path
    if (best) return best

    return allowMainFallback ? backdropPath || null : null
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
    const best = pickBestNeutralBackdropByResVotes(backs || [])
    return best?.file_path || null
}

export const pickBestBackdropForPreview = (list, opts = {}) => {
    const { preferLangs = ['en', 'en-US'], minWidth = 1200 } = opts
    if (!Array.isArray(list) || list.length === 0) return null

    // normaliza a 'en'
    const norm = (v) => (v ? String(v).toLowerCase().split('-')[0] : null)
    const preferSet = new Set((preferLangs || []).map(norm).filter(Boolean))
    const isPreferredLang = (img) => preferSet.has(norm(img?.iso_639_1))

    // El idioma es una regla dura para el modo Póster → Backdrop. Antes se
    // filtraba toda la lista por resolución y SOLO DESPUÉS se buscaba inglés:
    // si el backdrop inglés medía menos de `minWidth` y uno español no, se
    // eliminaba el inglés y la función devolvía `null`. DetailsClient acababa
    // cayendo al `backdrop_path` localizado. La resolución solo decide ENTRE
    // candidatos ingleses; si ninguno llega al mínimo, se conserva el mejor
    // inglés disponible en vez de abandonar la preferencia de idioma.
    const preferred = list.filter(isPreferredLang)
    if (!preferred.length) return null

    const sizedPreferred = minWidth > 0
        ? preferred.filter((b) => (b?.width || 0) >= minWidth)
        : preferred
    const pool = sizedPreferred.length ? sizedPreferred : preferred
    const top3en = pool.slice(0, 3)

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
