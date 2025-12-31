// src/lib/details/tmdbListsClient.js

export async function tmdbFetchAllUserLists({ apiKey, accountId, sessionId, language = 'es-ES' }) {
    if (!apiKey) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
    if (!accountId || !sessionId) throw new Error('Falta sesión para cargar listas')

    const all = []
    let page = 1
    let totalPages = 1
    const maxPages = 5

    while (page <= totalPages && page <= maxPages) {
        const url = `https://api.themoviedb.org/3/account/${accountId}/lists?api_key=${apiKey}&session_id=${sessionId}&language=${language}&page=${page}`
        const res = await fetch(url)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.status_message || 'Error cargando listas')
        totalPages = Number(json?.total_pages || 1)
        const results = Array.isArray(json?.results) ? json.results : []
        all.push(...results)
        page += 1
    }

    return all
}

export async function tmdbListItemStatus({ apiKey, listId, movieId, sessionId }) {
    if (!apiKey) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
    if (!listId || !movieId) return false

    const url = `https://api.themoviedb.org/3/list/${listId}/item_status?api_key=${apiKey}&movie_id=${movieId}${sessionId ? `&session_id=${sessionId}` : ''}`
    const res = await fetch(url)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.status_message || 'Error comprobando item_status')
    return !!json?.item_present
}

export async function tmdbAddMovieToList({ apiKey, listId, movieId, sessionId }) {
    if (!apiKey) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
    if (!listId || !movieId || !sessionId) throw new Error('Falta sesión para añadir a lista')

    const url = `https://api.themoviedb.org/3/list/${listId}/add_item?api_key=${apiKey}&session_id=${sessionId}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({ media_id: movieId })
    })
    const json = await res.json()

    if (!res.ok) {
        if (json?.status_code === 8) return { ok: true, duplicate: true, json }
        throw new Error(json?.status_message || 'Error añadiendo a la lista')
    }

    if (json?.success === true || json?.status_code === 12 || json?.status_code === 1) {
        return { ok: true, duplicate: false, json }
    }

    if (json?.status_code === 8) return { ok: true, duplicate: true, json }
    throw new Error(json?.status_message || 'Error añadiendo a la lista')
}

export async function tmdbCreateList({ apiKey, name, description, sessionId, language = 'es' }) {
    if (!apiKey) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY')
    if (!sessionId) throw new Error('Falta sesión para crear lista')

    const url = `https://api.themoviedb.org/3/list?api_key=${apiKey}&session_id=${sessionId}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({
            name,
            description: description || '',
            language
        })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.status_message || 'Error creando lista')
    if (!json?.list_id) throw new Error('TMDb no devolvió list_id')
    return json.list_id
}
