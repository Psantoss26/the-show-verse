// /src/lib/hooks/useTraktLists.js
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export default function useTraktLists({ mode = 'trending' } = {}) {
    const [lists, setLists] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const refresh = useCallback(async () => {
        try {
            setLoading(true)
            setError('')
            const res = await fetch(`/api/trakt/lists?mode=${encodeURIComponent(mode)}&limit=30`, { cache: 'no-store' })
            const j = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(j?.error || 'Trakt lists failed')
            setLists(Array.isArray(j?.lists) ? j.lists : [])
        } catch (e) {
            setError(e?.message || 'Error')
            setLists([])
        } finally {
            setLoading(false)
        }
    }, [mode])

    useEffect(() => { refresh() }, [refresh])

    return useMemo(() => ({
        lists,
        loading,
        error,
        refresh,
    }), [lists, loading, error, refresh])
}
