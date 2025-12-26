'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTraktAuth } from '@/lib/trakt/useTraktAuth'

export default function TraktConnectButton() {
    const { isConnected, ready, setTokens, disconnect } = useTraktAuth()

    // Hooks SIEMPRE arriba (nunca detrás de un return condicional)
    const [open, setOpen] = useState(false)
    const [device, setDevice] = useState(null)
    const [status, setStatus] = useState('idle') // idle | waiting | success | error
    const [error, setError] = useState('')

    const pollRef = useRef(null)
    const deadlineRef = useRef(0)

    const canPoll = useMemo(
        () => device?.device_code && device?.interval && device?.expires_in,
        [device]
    )

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current)
        }
    }, [])

    async function start() {
        setError('')
        setStatus('waiting')
        setOpen(true)

        const r = await fetch('/api/trakt/device/code', { method: 'POST' })
        const data = await r.json().catch(() => null)

        if (!r.ok || !data?.device_code) {
            setStatus('error')
            setError(data?.error || 'No se pudo iniciar Trakt Device Flow.')
            return
        }

        setDevice(data)
        deadlineRef.current = Date.now() + data.expires_in * 1000

        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(() => pollOnce(data.device_code), data.interval * 1000)
    }

    async function pollOnce(device_code) {
        if (Date.now() > deadlineRef.current) {
            if (pollRef.current) clearInterval(pollRef.current)
            setStatus('error')
            setError('Código expirado. Vuelve a conectar.')
            return
        }

        const r = await fetch('/api/trakt/device/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code }),
        })

        if (r.status === 200) {
            const tokens = await r.json().catch(() => null)
            if (pollRef.current) clearInterval(pollRef.current)
            if (tokens?.access_token) {
                setTokens(tokens)
                setStatus('success')
            } else {
                setStatus('error')
                setError('Token inválido.')
            }
            return
        }

        // 400 suele ser “pending”, seguimos sin hacer ruido
        if (r.status === 400) return

        const data = await r.json().catch(() => ({}))
        if (pollRef.current) clearInterval(pollRef.current)
        setStatus('error')
        setError(data?.error_description || data?.error || `Error Trakt (${r.status})`)
    }

    // ✅ Ahora SÍ: return condicional (después de declarar hooks)
    if (!ready) {
        return <div className="h-7 w-40 rounded-md bg-white/10 animate-pulse" />
    }

    if (isConnected) {
        return (
            <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400">Trakt conectado</span>
                <button
                    onClick={disconnect}
                    className="text-xs px-2 py-1 rounded-md border border-white/10 hover:border-white/20"
                >
                    Desconectar
                </button>
            </div>
        )
    }

    return (
        <div>
            <button
                onClick={start}
                className="text-xs px-2 py-1 rounded-md border border-white/10 hover:border-white/20"
            >
                Conectar Trakt
            </button>

            {open && (
                <div className="mt-3 p-3 rounded-xl border border-white/10 bg-black/30">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold">Conecta tu cuenta de Trakt</div>
                            <div className="text-xs text-white/70 mt-1">
                                Ve a{' '}
                                <a
                                    className="underline"
                                    href={device?.verification_url || 'https://trakt.tv/activate'}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {device?.verification_url || 'https://trakt.tv/activate'}
                                </a>{' '}
                                e introduce el código:
                            </div>

                            <div className="mt-2 text-2xl tracking-widest font-bold">
                                {device?.user_code || '…'}
                            </div>

                            <div className="mt-2 text-xs text-white/60">
                                Estado: {status === 'waiting' ? 'esperando autorización…' : status}
                            </div>

                            {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
                        </div>

                        <button
                            onClick={() => setOpen(false)}
                            className="text-xs px-2 py-1 rounded-md border border-white/10 hover:border-white/20"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
