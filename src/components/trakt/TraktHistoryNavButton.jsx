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
            hover:
                'hover:text-emerald-300 hover:bg-emerald-500/10 hover:ring-emerald-500/30 hover:shadow-[0_0_18px_rgba(16,185,129,0.16)]',
            active:
                'text-emerald-200 bg-emerald-500/15 ring-emerald-500/35 shadow-[0_0_18px_rgba(16,185,129,0.20)]',
        },
    }

    const t = tones[tone] || tones.green
    return active ? t.active : t.hover
}

/**
 * variant:
 * - "icon"  -> (default) botón redondo como desktop
 * - "drawer"-> fila clicable para menú lateral móvil
 */
export default function TraktHistoryNavButton({
    className = '',
    variant = 'icon',
    onClick,
    label = 'Historial',
}) {
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
        return () => {
            alive = false
        }
    }, [])

    const Icon = loading ? Loader2 : Eye

    // ✅ Mantiene EXACTO el estilo actual de escritorio
    if (variant === 'icon') {
        const base =
            'group p-2 rounded-full transition-all duration-200 ' +
            'text-neutral-400 ' +
            'hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95 ' +
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30'

        const tone = iconToneClass({ active, tone: 'green' })
        const ringBase = 'ring-1 ring-transparent'

        return (
            <Link
                href={href}
                onClick={onClick}
                title={connected ? 'Historial de vistos' : 'Conectar Trakt / Historial'}
                className={`${base} ${ringBase} ${tone} ${className}`}
                aria-label="Historial"
                prefetch={false}
            >
                <Icon className={`w-5 h-5 ${loading ? 'animate-spin' : ''} transition-transform duration-200 group-hover:scale-110`} />
            </Link>
        )
    }

    // ✅ Variante para drawer móvil (fila completa clicable)
    const rowClass =
        `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ` +
        (active ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5')

    return (
        <Link
            href={href}
            onClick={onClick}
            className={`${rowClass} ${className}`}
            title={connected ? 'Historial de vistos' : 'Conectar Trakt / Historial'}
            aria-label="Historial"
            prefetch={false}
        >
            <Icon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            <span>{label}</span>
        </Link>
    )
}
