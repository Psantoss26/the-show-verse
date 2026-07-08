// /src/lib/hooks/useTraktLists.js
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

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
        user: entry?.user || null,
        previewPosters: Array.isArray(entry?.previewPosters) ? entry.previewPosters : [],
    }
}

export default function useTraktLists({ mode = 'trending' } = {}) {
    const [lists, setLists] = useState([])
    const [loading, setLoading] = useState(true)
    const [initialized, setInitialized] = useState(false)
    const [error, setError] = useState('')
    const [connected, setConnected] = useState(mode !== 'user')
    const [requiresAuth, setRequiresAuth] = useState(false)
    const [user, setUser] = useState(null)

    useEffect(() => {
        setLists([])
        setError('')
        setInitialized(false)
        setConnected(mode !== 'user')
        setRequiresAuth(false)
        setUser(null)
        setLoading(true)
    }, [mode])

    const refresh = useCallback(async () => {
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
                if (!res.ok) throw new Error(j?.error || 'Trakt lists failed')
                setLists(Array.isArray(j?.lists) ? j.lists : [])
                setConnected(typeof j?.connected === 'boolean' ? j.connected : false)
                setRequiresAuth(!!j?.requiresAuth)
                setUser(j?.user || null)
                setError(j?.error || '')
                return
            }

            // Surface A (discover): catálogo comunitario propio.
            const res = await fetch(
                `/api/community/lists/discover?sort=items_desc&limit=30`,
                { cache: 'no-store' }
            )
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j?.error || 'Community lists failed')
            const results = Array.isArray(j?.results) ? j.results : []
            setLists(results.map(mapDiscoverResult))
            setConnected(true)
            setRequiresAuth(false)
            setUser(null)
            setError('')
        } catch (e) {
            setError(e?.message || 'Error')
            setLists([])
            setConnected(mode !== 'user')
            setRequiresAuth(false)
            setUser(null)
        } finally {
            setInitialized(true)
            setLoading(false)
        }
    }, [mode])

    useEffect(() => { refresh() }, [refresh])

    return useMemo(() => ({
        lists,
        loading,
        initialized,
        error,
        connected,
        requiresAuth,
        user,
        refresh,
    }), [lists, loading, initialized, error, connected, requiresAuth, user, refresh])
}
