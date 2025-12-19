'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
    fetchUserLists,
    createUserList,
    deleteUserList,
    getListDetails
} from '@/lib/api/tmdbLists'

function uniqById(arr) {
    const map = new Map()
    for (const x of arr || []) {
        if (!x?.id) continue
        map.set(x.id, x)
    }
    return Array.from(map.values())
}

function extractCoverPosters(listDetailsJson, limit = 4) {
    const items = Array.isArray(listDetailsJson?.items) ? listDetailsJson.items : []
    const out = []
    for (const it of items) {
        const p = it?.poster_path || it?.backdrop_path
        if (p && !out.includes(p)) out.push(p)
        if (out.length >= limit) break
    }
    return out
}

// pool simple con límite de concurrencia
async function runPool(tasks, concurrency = 3) {
    const queue = [...tasks]
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
            const t = queue.shift()
            // eslint-disable-next-line no-await-in-loop
            await t()
        }
    })
    await Promise.all(workers)
}

export default function useTmdbLists() {
    const { session, account } = useAuth()
    const accountId = account?.id || null

    const canUse = useMemo(() => !!session && !!accountId, [session, accountId])

    const [lists, setLists] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // paginación
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)

    // ✅ covers: listId -> [poster_path...]
    const [coversById, setCoversById] = useState({})
    const coversRef = useRef(coversById)
    useEffect(() => {
        coversRef.current = coversById
    }, [coversById])

    const refresh = useCallback(async () => {
        if (!canUse) return
        setLoading(true)
        setError('')
        try {
            const json = await fetchUserLists({ accountId, sessionId: session, page: 1 })
            const results = Array.isArray(json?.results) ? json.results : []
            setLists(results)
            setPage(1)
            setHasMore((json?.page || 1) < (json?.total_pages || 1))
        } catch (e) {
            setError(e?.message || 'Error cargando listas')
            setLists([])
            setPage(1)
            setHasMore(false)
        } finally {
            setLoading(false)
        }
    }, [canUse, accountId, session])

    const loadMore = useCallback(async () => {
        if (!canUse || loading || !hasMore) return
        const nextPage = page + 1
        setLoading(true)
        setError('')
        try {
            const json = await fetchUserLists({ accountId, sessionId: session, page: nextPage })
            const results = Array.isArray(json?.results) ? json.results : []
            setLists((prev) => uniqById([...(prev || []), ...(results || [])]))
            setPage(nextPage)
            setHasMore((json?.page || nextPage) < (json?.total_pages || nextPage))
        } catch (e) {
            setError(e?.message || 'Error cargando más listas')
        } finally {
            setLoading(false)
        }
    }, [canUse, loading, hasMore, page, accountId, session])

    // ✅ Precarga covers cuando llegan / cambian las listas
    useEffect(() => {
        if (!canUse) return
        if (!lists || lists.length === 0) return

        let cancelled = false

        const run = async () => {
            // Solo las que no tienen cover aún
            const pending = lists
                .map((l) => String(l?.id))
                .filter((id) => id && !coversRef.current?.[id])

            if (pending.length === 0) return

            const tasks = pending.map((id) => async () => {
                try {
                    const json = await getListDetails({ listId: id, page: 1, language: 'es-ES' })
                    const posters = extractCoverPosters(json, 4)

                    if (!cancelled) {
                        setCoversById((prev) => ({
                            ...prev,
                            [id]: posters
                        }))
                    }
                } catch {
                    // si falla, dejamos el fallback
                    if (!cancelled) {
                        setCoversById((prev) => ({ ...prev, [id]: [] }))
                    }
                }
            })

            await runPool(tasks, 3)
        }

        run()
        return () => {
            cancelled = true
        }
    }, [canUse, lists])

    useEffect(() => {
        refresh()
    }, [refresh])

    return {
        canUse,
        lists,
        loading,
        error,
        refresh,
        loadMore,
        hasMore,

        // ✅ expón covers al page.jsx
        coversById,

        async create({ name, description }) {
            if (!canUse) throw new Error('Login requerido')
            await createUserList({ sessionId: session, name, description })
            await refresh()
        },

        async del(listId) {
            if (!canUse) throw new Error('Login requerido')
            await deleteUserList({ listId, sessionId: session })
            // limpiezas para que no queden covers huérfanas
            setCoversById((prev) => {
                const next = { ...prev }
                delete next[String(listId)]
                return next
            })
            await refresh()
        }
    }
}
