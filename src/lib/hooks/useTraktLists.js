// /src/lib/hooks/useTraktLists.js
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

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
            const res = await fetch(
                `/api/trakt/lists?mode=${encodeURIComponent(mode)}&limit=30&preview=0`,
                { cache: 'no-store' }
            )
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j?.error || 'Trakt lists failed')
            setLists(Array.isArray(j?.lists) ? j.lists : [])
            setConnected(
                typeof j?.connected === 'boolean' ? j.connected : mode !== 'user'
            )
            setRequiresAuth(!!j?.requiresAuth)
            setUser(j?.user || null)
            setError(j?.error || '')
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
