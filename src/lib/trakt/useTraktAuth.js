'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'trakt.auth.v1'
const REFRESH_SKEW_SECONDS = 60

function nowSeconds() {
    return Math.floor(Date.now() / 1000)
}

function safeReadStored() {
    if (typeof window === 'undefined') return null
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

function safeWriteStored(value) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch { }
}

function safeClearStored() {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.removeItem(STORAGE_KEY)
    } catch { }
}

function isExpired(t) {
    if (!t?.access_token || !t?.created_at || !t?.expires_in) return true
    const exp = t.created_at + t.expires_in
    return nowSeconds() >= (exp - REFRESH_SKEW_SECONDS)
}

export function useTraktAuth() {
    // 👇 Importante: NO leer localStorage aquí para evitar hydration mismatch
    const [tokens, setTokens] = useState(null)
    const [ready, setReady] = useState(false)

    const tokensRef = useRef(tokens)
    useEffect(() => {
        tokensRef.current = tokens
    }, [tokens])

    // 👇 Lee localStorage SOLO tras montar
    useEffect(() => {
        const stored = safeReadStored()
        if (stored?.access_token) setTokens(stored)
        setReady(true)
    }, [])

    const setAndPersist = useCallback((t) => {
        setTokens(t)
        if (t) safeWriteStored(t)
        else safeClearStored()
    }, [])

    const disconnect = useCallback(() => setAndPersist(null), [setAndPersist])

    const refresh = useCallback(async () => {
        const t = tokensRef.current
        if (!t?.refresh_token) return null

        const r = await fetch('/api/trakt/oauth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: t.refresh_token }),
        })

        if (!r.ok) return null
        const next = await r.json().catch(() => null)
        if (!next?.access_token) return null

        setAndPersist(next)
        return next
    }, [setAndPersist])

    const getValidAccessToken = useCallback(async () => {
        const t = tokensRef.current
        if (!t?.access_token) return null
        if (!isExpired(t)) return t.access_token

        const next = await refresh()
        return next?.access_token || null
    }, [refresh])

    return {
        ready,
        tokens,
        isConnected: ready && !!tokens?.access_token,
        setTokens: setAndPersist,
        disconnect,
        getValidAccessToken,
    }
}
