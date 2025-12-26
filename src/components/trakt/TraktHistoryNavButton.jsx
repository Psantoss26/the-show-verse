'use client'

import Link from 'next/link'
import { Eye, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { traktAuthStatus } from '@/lib/api/traktClient'

export default function TraktHistoryNavButton({ className = '' }) {
    const [loading, setLoading] = useState(true)
    const [connected, setConnected] = useState(false)

    useEffect(() => {
        let alive = true
            ; (async () => {
                try {
                    const st = await traktAuthStatus()
                    if (!alive) return
                    setConnected(!!st?.connected)
                } finally {
                    if (alive) setLoading(false)
                }
            })()
        return () => { alive = false }
    }, [])

    const href = '/history' // la nueva página global

    return (
        <Link
            href={href}
            title={connected ? 'Historial de vistos' : 'Conectar Trakt / Historial'}
            className={`w-11 h-11 rounded-full flex items-center justify-center border transition
        bg-white/5 border-white/10 hover:bg-white/10 hover:border-yellow-500/30 ${className}`}
        >
            {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
            ) : (
                <Eye className={`w-5 h-5 ${connected ? 'text-emerald-300' : 'text-zinc-200'}`} />
            )}
        </Link>
    )
}
