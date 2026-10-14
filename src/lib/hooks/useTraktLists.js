// /src/lib/hooks/useTraktLists.js
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Surface A (discover): la fuente ahora es nuestro backend (community_lists),
// no Trakt directamente. Cada resultado llega como { list, user, previewPosters }
// (ver backend/src/community/normalize.js:listRowToApi). Lo aplanamos al shape
// que ya consume src/app/lists/page.jsx (list.name/description/item_count/likes,
// list.user, list.previewPosters), usando list.id (uuid interno de
// community_lists) como identificador. OJO: a propósito NO propagamos
// list.ids.{slug,trakt} aquí — page.jsx (getTraktListKey/buildInternalUrl)
// preferiría ese slug/traktId sobre list.id para construir /lists/trakt/<user>/<key>,
// pero TraktListDetailsClient ahora necesita el uuid interno en esa posición para
// poder pedir /api/community/lists/<id>. Omitir ids fuerza el fallback a list.id.
function mapDiscoverResult(entry) {
    const list = entry?.list || {}
    return {
        id: list?.id || null,
        name: list?.name || '',
        description: list?.description || '',
        item_count: Number(list?.item_count) || 0,
        likes: Number(list?.likes) || 0,
        traktUrl: list?.traktUrl || entry?.traktUrl || null,
        // 'user' = publicada desde la app (el índice las pone delante).
        origin: list?.origin === 'user' ? 'user' : 'trakt',
        user: entry?.user || null,
        previewPosters: Array.isArray(entry?.previewPosters) ? entry.previewPosters : [],
        // Primeros títulos de la lista, ya en la respuesta del índice
        // (`preview=`): la tarjeta pinta su vista previa sin pedir la lista.
        previewItems: Array.isArray(entry?.previewItems) ? entry.previewItems : null,
    }
}

// Tamaño de página del índice comunitario (el máximo que acepta el backend).
// Se recorre página a página con `loadMore`: antes se pedía una sola página de
// 30 y el resto de listas guardadas no aparecía nunca.
export const DISCOVER_PAGE_SIZE = 60
// Títulos de vista previa por lista que vienen con cada página (el máximo del
// backend). Antes cada tarjeta pedía su lista aparte: 60 peticiones por página
// que, con el scroll infinito, agotaban el límite de 200/min del backend.
const DISCOVER_PREVIEW_ITEMS = 12

function discoverUrl({ sort, query, page }) {
    const params = new URLSearchParams({
        sort: sort || 'items_desc',
        limit: String(DISCOVER_PAGE_SIZE),
        page: String(page),
        preview: String(DISCOVER_PREVIEW_ITEMS),
    })
    if (query) params.set('q', query)
    return `/api/community/lists/discover?${params.toString()}`
}

// Escribir en el buscador no lanza una petición por tecla.
const SEARCH_DEBOUNCE_MS = 250

function readTotals(json) {
    const totals = json?.totals
    if (!totals || typeof totals !== 'object') return null
    const value = (key) => (Number.isFinite(Number(totals[key])) ? Number(totals[key]) : 0)
    return { lists: value('lists'), items: value('items'), likes: value('likes') }
}

function mergeById(current, incoming) {
    const seen = new Set(current.map((list) => list.id))
    return [...current, ...incoming.filter((list) => list.id && !seen.has(list.id))]
}

export default function useTraktLists({ mode = 'trending', sort = 'items_desc', query = '' } = {}) {
    const [lists, setLists] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [initialized, setInitialized] = useState(false)
    const [error, setError] = useState('')
    const [connected, setConnected] = useState(mode !== 'user')
    const [requiresAuth, setRequiresAuth] = useState(false)
    const [user, setUser] = useState(null)
    // Paginación del índice comunitario. `totals`: listas, títulos y me gusta
    // de TODAS las listas con el filtro actual (no solo de las cargadas).
    const [hasMore, setHasMore] = useState(false)
    const [totals, setTotals] = useState(null)
    // Orden con el que llegaron las listas actuales: mientras coincide con el
    // pedido, quien pinta respeta el del servidor en vez de reordenar.
    const [resultsSort, setResultsSort] = useState(null)
    // La última página siguiente falló (p. ej. 429): no se reintenta sola, o
    // el centinela del scroll la pediría en bucle.
    const [loadMoreError, setLoadMoreError] = useState(false)
    const pageRef = useRef(1)
    // Solo vale la respuesta de la ÚLTIMA petición: si se cambia de orden o de
    // búsqueda a mitad, la anterior llega tarde y no debe pisar la nueva.
    const requestRef = useRef(0)
    const loadingMoreRef = useRef(false)
    const typedTerm = String(query || '').trim()
    const [searchTerm, setSearchTerm] = useState(typedTerm)
    useEffect(() => {
        if (typedTerm === searchTerm) return undefined
        // Borrar la búsqueda vuelve al índice al instante.
        const timer = setTimeout(() => setSearchTerm(typedTerm), typedTerm ? SEARCH_DEBOUNCE_MS : 0)
        return () => clearTimeout(timer)
    }, [typedTerm, searchTerm])

    useEffect(() => {
        setLists([])
        setError('')
        setInitialized(false)
        setConnected(mode !== 'user')
        setRequiresAuth(false)
        setUser(null)
        setHasMore(false)
        setTotals(null)
        setLoading(true)
    }, [mode])

    const refresh = useCallback(async () => {
        const requestId = ++requestRef.current
        loadingMoreRef.current = false
        setLoadingMore(false)
        setLoadMoreError(false)
        try {
            setLoading(true)
            setError('')

            // 'user' = listas de la cuenta Trakt conectada del usuario: sigue
            // siendo Trakt real (OAuth), no forma parte de esta migración.
            if (mode === 'user') {
                const res = await fetch(
                    `/api/trakt/lists?mode=user&limit=30&preview=0`,
                    { cache: 'no-store' }
                )
                const j = await res.json().catch(() => ({}))
                if (requestId !== requestRef.current) return
                if (!res.ok) throw new Error(j?.error || 'Trakt lists failed')
                setLists(Array.isArray(j?.lists) ? j.lists : [])
                setConnected(typeof j?.connected === 'boolean' ? j.connected : false)
                setRequiresAuth(!!j?.requiresAuth)
                setUser(j?.user || null)
                setError(j?.error || '')
                setHasMore(false)
                return
            }

            // Surface A (discover): catálogo comunitario propio, primera página
            // con el orden y la búsqueda actuales (los dos los aplica el servidor
            // sobre TODAS las listas guardadas, no sobre lo ya cargado).
            const res = await fetch(discoverUrl({ sort, query: searchTerm, page: 1 }), { cache: 'no-store' })
            const j = await res.json().catch(() => ({}))
            if (requestId !== requestRef.current) return
            if (!res.ok) throw new Error(j?.error || 'Community lists failed')
            const results = Array.isArray(j?.results) ? j.results : []
            pageRef.current = 1
            setLists(mergeById([], results.map(mapDiscoverResult)))
            setResultsSort(sort)
            setHasMore(typeof j?.hasMore === 'boolean' ? j.hasMore : results.length >= DISCOVER_PAGE_SIZE)
            setTotals(readTotals(j))
            setConnected(true)
            setRequiresAuth(false)
            setUser(null)
            setError('')
        } catch (e) {
            if (requestId !== requestRef.current) return
            setError(e?.message || 'Error')
            setLists([])
            setHasMore(false)
            // También con error: quien espera las listas de este orden deja de
            // esperar (y enseña el error) en vez de quedarse en las anteriores.
            setResultsSort(sort)
            setConnected(mode !== 'user')
            setRequiresAuth(false)
            setUser(null)
        } finally {
            if (requestId === requestRef.current) {
                setInitialized(true)
                setLoading(false)
            }
        }
    }, [mode, sort, searchTerm])

    // Página siguiente del índice comunitario (scroll infinito).
    const loadMore = useCallback(async () => {
        if (mode === 'user' || !hasMore || loadingMoreRef.current) return
        const requestId = requestRef.current
        const nextPage = pageRef.current + 1
        loadingMoreRef.current = true
        setLoadingMore(true)
        setLoadMoreError(false)
        try {
            const res = await fetch(discoverUrl({ sort, query: searchTerm, page: nextPage }), { cache: 'no-store' })
            const j = await res.json().catch(() => ({}))
            if (requestId !== requestRef.current) return
            if (!res.ok) throw new Error(j?.error || 'Community lists failed')
            const results = Array.isArray(j?.results) ? j.results : []
            pageRef.current = nextPage
            setLists((current) => mergeById(current, results.map(mapDiscoverResult)))
            setHasMore(typeof j?.hasMore === 'boolean' ? j.hasMore : results.length >= DISCOVER_PAGE_SIZE)
            const nextTotals = readTotals(j)
            if (nextTotals) setTotals(nextTotals)
        } catch {
            // Se puede reintentar a mano: la página no avanza y `hasMore` sigue.
            if (requestId === requestRef.current) setLoadMoreError(true)
        } finally {
            if (requestId === requestRef.current) {
                loadingMoreRef.current = false
                setLoadingMore(false)
            }
        }
    }, [mode, hasMore, sort, searchTerm])

    useEffect(() => { refresh() }, [refresh])

    return useMemo(() => ({
        lists,
        loading,
        loadingMore,
        initialized,
        error,
        connected,
        requiresAuth,
        user,
        hasMore,
        totals,
        resultsSort,
        loadMoreError,
        refresh,
        loadMore,
    }), [lists, loading, loadingMore, initialized, error, connected, requiresAuth, user, hasMore, totals, resultsSort, loadMoreError, refresh, loadMore])
}
