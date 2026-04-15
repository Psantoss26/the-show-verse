'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
    fetchUserLists,
    createUserList,
    deleteUserList,
} from '@/lib/api/tmdbLists'

function uniqById(arr) {
    const map = new Map()
    for (const x of arr || []) {
        if (!x?.id) continue
        map.set(x.id, x)
    }
    return Array.from(map.values())
}

export default function useTmdbLists() {
    const { session, account } = useAuth()
    const accountId = account?.id || null

    const canUse = useMemo(() => !!session && !!accountId, [session, accountId])

    const [lists, setLists] = useState([])
    const [loading, setLoading] = useState(false)
    const [initialized, setInitialized] = useState(false)
    const [error, setError] = useState('')

    // paginación
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)

    const refresh = useCallback(async () => {
        if (!canUse) {
            setInitialized(true)
            setLoading(false)
            return
        }
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
            setInitialized(true)
            setLoading(false)
        }
    }, [canUse, accountId, session])

    useEffect(() => {
        if (!canUse) {
            setInitialized(true)
            return
        }
        setInitialized(false)
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

    useEffect(() => {
        refresh()
    }, [refresh])

    return {
        canUse,
        lists,
        loading,
        initialized,
        error,
        refresh,
        loadMore,
        hasMore,

        async create({ name, description }) {
            if (!canUse) throw new Error('Login requerido')
            await createUserList({ sessionId: session, name, description })
            await refresh()
        },

        async del(listId) {
            if (!canUse) throw new Error('Login requerido')
            await deleteUserList({ listId, sessionId: session })
            await refresh()
        }
    }
}
