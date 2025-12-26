'use client'

import Link from 'next/link'
import { Eye, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { traktAuthStatus } from '@/lib/api/traktClient'

function isActivePath(pathname, href) {
    if (!pathname) return false
    if (pathname === href) return true
    if (href !== '/' && pathname.startsWith(`${href}/`)) return true
    return false
}

function iconToneClass({ active, tone = 'green' }) {
    const tones = {
        green: {
            hover: 'hover:text-emerald-300 hover:bg-emerald-500/10 hover:ring-emerald-500/30 hover:shadow-[0_0_18px_rgba(16,185,129,0.16)]',
            active: 'text-emerald-200 bg-emerald-500/15 ring-emerald-500/35 shadow-[0_0_18px_rgba(16,185,129,0.20)]'
        }
    }

    const t = tones[tone] || tones.green

    return active ? t.active : t.hover
}

export default function TraktHistoryNavButton({ className = '' }) {
    const [loading, setLoading] = useState(true)
    const [connected, setConnected] = useState(false)
    const pathname = usePathname()

    const href = '/history'
    const active = useMemo(() => isActivePath(pathname, href), [pathname])

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

    const base =
        'group p-2 rounded-full transition-all duration-200 ' +
        'text-neutral-400 ' +
        'hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95 ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30'

    const tone = iconToneClass({ active, tone: 'green' })
    const ringBase = 'ring-1 ring-transparent' // para que el layout no “salte” al hacer hover

    return (
        <Link
            href={href}
            title={connected ? 'Historial de vistos' : 'Conectar Trakt / Historial'}
            className={`${base} ${ringBase} ${tone} ${className}`}
            aria-label="Historial"
        >
            {loading ? (
                <Loader2 className="w-5 h-5 animate-spin transition-transform duration-200 group-hover:scale-110" />
            ) : (
                <Eye className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
            )}
        </Link>
    )
}
