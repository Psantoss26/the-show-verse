// src/lib/api/tmdbLists.jsx
// API TMDb (v3) - Listas de usuario + operaciones sobre listas

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

function assertKey() {
    if (!TMDB_API_KEY) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
}

function buildUrl(path, params = {}) {
    assertKey()
    const url = new URL(`${TMDB_BASE}${path}`)
    url.searchParams.set('api_key', TMDB_API_KEY)

    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue
        url.searchParams.set(k, String(v))
    }
    return url.toString()
}

async function tmdbJson(url, init) {
    const res = await fetch(url, { cache: 'no-store', ...init })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.status_message || json?.error || 'TMDb error')
    return json
}

/**
 * GET /account/{account_id}/lists
 */
export async function fetchUserLists({ accountId, sessionId, page = 1 }) {
    if (!accountId) throw new Error('accountId requerido')
    if (!sessionId) throw new Error('sessionId requerido')

    const url = buildUrl(`/account/${accountId}/lists`, {
        session_id: sessionId,
        page
    })
    return tmdbJson(url)
}

/**
 * POST /list
 */
export async function createUserList({
    sessionId,
    name,
    description = '',
    language = 'es'
}) {
    if (!sessionId) throw new Error('sessionId requerido')
    if (!name?.trim()) throw new Error('Nombre de lista requerido')

    const url = buildUrl('/list', { session_id: sessionId })
    return tmdbJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({
            name: name.trim(),
            description: description?.trim() || '',
            language
        })
    })
}

/**
 * ✅ “Update” compatible con v3:
 * TMDb v3 NO soporta update name/description -> recreamos la lista y copiamos items.
 * Devuelve: { listId: newId, recreated: true }
 */
export async function updateUserList({
    listId,
    sessionId,
    name,
    description = '',
    language = 'es',
    items // opcional: pásale data.items desde la UI para evitar otro fetch
}) {
    if (!listId) throw new Error('listId requerido')
    if (!sessionId) throw new Error('sessionId requerido')
    if (!name?.trim()) throw new Error('Nombre de lista requerido')

    // 1) leer items actuales (si no vienen)
    let currentItems = Array.isArray(items) ? items : null
    if (!currentItems) {
        const details = await getListDetails({ listId, page: 1, language: 'es-ES', sessionId })
        currentItems = Array.isArray(details?.items) ? details.items : []
    }

    // 2) crear lista nueva
    const created = await createUserList({
        sessionId,
        name: name.trim(),
        description: description?.trim() || '',
        language
    })

    const newListId = created?.list_id
    if (!newListId) throw new Error('No se pudo crear la nueva lista')

    // 3) copiar items (solo ids)
    const ids = currentItems.map((x) => x?.id).filter(Boolean)

    try {
        await promisePool(ids, 5, (movieId) =>
            addMovieToList({ listId: newListId, sessionId, movieId })
        )
    } catch (e) {
        // No borramos la vieja si falla la copia
        throw new Error(
            `Se creó la lista nueva (${newListId}), pero falló la copia de películas: ${e?.message || 'error'}`
        )
    }

    // 4) borrar lista antigua
    await deleteUserList({ listId, sessionId })

    return { listId: String(newListId), recreated: true }
}

/**
 * DELETE /list/{list_id}
 */
export async function deleteUserList({ listId, sessionId }) {
    if (!listId) throw new Error('listId requerido')
    if (!sessionId) throw new Error('sessionId requerido')

    const url = buildUrl(`/list/${listId}`, { session_id: sessionId })
    return tmdbJson(url, { method: 'DELETE' })
}

/**
 * GET /list/{list_id}
 */
export async function getListDetails({
    listId,
    page = 1,
    language = 'es-ES',
    sessionId // opcional
}) {
    if (!listId) throw new Error('listId requerido')
    const url = buildUrl(`/list/${listId}`, {
        page,
        language,
        ...(sessionId ? { session_id: sessionId } : {})
    })
    return tmdbJson(url)
}

// --- helper concurrencia pequeña (para copiar items) ---
async function promisePool(items, limit, worker) {
    const ret = []
    const executing = new Set()
    for (const item of items) {
        const p = Promise.resolve().then(() => worker(item))
        ret.push(p)
        executing.add(p)
        const clean = () => executing.delete(p)
        p.then(clean).catch(clean)

        if (executing.size >= limit) {
            await Promise.race(executing)
        }
    }
    return Promise.all(ret)
}

/**
 * (Opcional) GET /list/{list_id}/item_status?movie_id=...
 */
export async function getListItemStatus({ listId, movieId }) {
    if (!listId) throw new Error('listId requerido')
    if (!movieId) throw new Error('movieId requerido')
    const url = buildUrl(`/list/${listId}/item_status`, { movie_id: movieId })
    return tmdbJson(url)
}

/**
 * POST /list/{list_id}/add_item
 */
export async function addMovieToList({ listId, sessionId, movieId }) {
    if (!listId) throw new Error('listId requerido')
    if (!sessionId) throw new Error('sessionId requerido')
    if (!movieId) throw new Error('movieId requerido')

    const url = buildUrl(`/list/${listId}/add_item`, { session_id: sessionId })
    return tmdbJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ media_id: Number(movieId) })
    })
}

/**
 * POST /list/{list_id}/remove_item
 */
export async function removeMovieFromList({ listId, sessionId, movieId }) {
    if (!listId) throw new Error('listId requerido')
    if (!sessionId) throw new Error('sessionId requerido')
    if (!movieId) throw new Error('movieId requerido')

    const url = buildUrl(`/list/${listId}/remove_item`, { session_id: sessionId })
    return tmdbJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ media_id: Number(movieId) })
    })
}

/**
 * POST /list/{list_id}/clear?confirm=true
 */
export async function clearList({ listId, sessionId, confirm = true }) {
    if (!listId) throw new Error('listId requerido')
    if (!sessionId) throw new Error('sessionId requerido')

    const url = buildUrl(`/list/${listId}/clear`, {
        session_id: sessionId,
        confirm: confirm ? 'true' : 'false'
    })
    return tmdbJson(url, { method: 'POST' })
}

/**
 * Añade el título localizado y ASEGURA el `media_type`.
 *
 * El tipo llega por parámetro porque TMDb no lo devuelve en las búsquedas por
 * tipo (`/search/movie`, `/search/tv`). Antes se ponía 'movie' fijo, así que los
 * resultados de series salían marcados como películas: la tarjeta enlazaba a
 * /details/movie/<id> y al añadirlos a una lista se guardaban como película.
 */
function addLocalizedMovieTitle(item, language, mediaType = 'movie') {
    const lang = language?.startsWith('en')
        ? 'en'
        : language?.startsWith('es')
            ? 'es'
            : ''
    if (!lang) return { ...item, media_type: item?.media_type || mediaType }
    return {
        ...item,
        media_type: item?.media_type || mediaType,
        [`title_${lang}`]: item?.title || item?.[`title_${lang}`],
        [`name_${lang}`]: item?.name || item?.[`name_${lang}`]
    }
}

function mergeSearchMoviePages(pages, mediaType = 'movie') {
    const out = []
    const byKey = new Map()

    for (const { json, language } of pages) {
        for (const item of json?.results || []) {
            const next = addLocalizedMovieTitle(item, language, mediaType)
            const key = `${next.media_type || 'movie'}:${next.id}`
            const existing = byKey.get(key)
            if (existing) {
                for (const field of [
                    'title_es',
                    'name_es',
                    'title_en',
                    'name_en',
                    'original_title',
                    'original_name'
                ]) {
                    if (!existing[field] && next[field]) existing[field] = next[field]
                }
                continue
            }
            byKey.set(key, next)
            out.push(next)
        }
    }

    return {
        ...(pages[0]?.json || {}),
        results: out,
        total_results: out.length
    }
}

export async function searchMovies({ query, page = 1, language = 'es-ES', languages = null }) {
    return searchTitles({ query, page, language, languages, mediaTypes: ['movie'] })
}

/**
 * Búsqueda de títulos para el selector de "añadir a una lista".
 *
 * Consulta /search/movie y /search/tv y FUSIONA los resultados. Antes solo se
 * consultaba /search/movie, así que al buscar una serie no aparecía nada: las
 * listas admiten series (el backend guarda `mediaType`), pero no había forma de
 * encontrarlas desde el buscador.
 *
 * TMDb no devuelve `media_type` en las búsquedas por tipo (solo en /search/multi,
 * que además mezcla personas), así que se marca aquí a mano: es el campo del que
 * dependen la tarjeta y el alta en la lista para saber si es película o serie.
 *
 * El orden final es por POPULARIDAD entre ambos tipos, para que una serie muy
 * conocida no quede sepultada bajo películas irrelevantes.
 */
export async function searchTitles({
    query,
    page = 1,
    language = 'es-ES',
    languages = null,
    mediaTypes = ['movie', 'tv']
}) {
    if (!query?.trim()) {
        return { results: [], page: 1, total_pages: 1, total_results: 0 }
    }
    const searchLanguages = Array.isArray(languages) && languages.length
        ? languages
        : [language]

    const porTipo = await Promise.all(
        mediaTypes.map(async (mediaType) => {
            const pages = await Promise.all(
                searchLanguages.map(async (searchLanguage) => {
                    const url = buildUrl(`/search/${mediaType}`, {
                        query: query.trim(),
                        page,
                        language: searchLanguage,
                        include_adult: 'false'
                    })
                    return { language: searchLanguage, json: await tmdbJson(url) }
                })
            )
            const json =
                pages.length === 1
                    ? pages[0].json
                    : mergeSearchMoviePages(pages, mediaType)
            const results = (json?.results || []).map((item) => ({
                ...item,
                media_type: item?.media_type || mediaType
            }))
            return { ...json, results }
        })
    )

    if (porTipo.length === 1) return porTipo[0]

    const results = porTipo
        .flatMap((r) => r.results)
        .sort((a, b) => (b?.popularity || 0) - (a?.popularity || 0))

    return {
        results,
        page,
        total_pages: Math.max(...porTipo.map((r) => r.total_pages || 1)),
        total_results: porTipo.reduce((n, r) => n + (r.total_results || 0), 0)
    }
}

/**
 * GET /movie/{category}
 */
export async function fetchMovieCatalogList({
    category = 'popular',
    page = 1,
    language = 'es-ES',
    region = 'ES'
}) {
    const url = buildUrl(`/movie/${category}`, { page, language, region })
    return tmdbJson(url)
}
