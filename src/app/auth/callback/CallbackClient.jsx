// /src/app/auth/callback/CallbackClient.jsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function CallbackPage() {
    const router = useRouter()
    const sp = useSearchParams()
    const { login } = useAuth()

    const [step, setStep] = useState('Verificando autorización…')
    const [err, setErr] = useState('')

    const requestToken = sp?.get('request_token')
    const approved = sp?.get('approved')

    const next = useMemo(() => {
        const n = sp?.get('next') || '/'
        return n.startsWith('/') ? n : '/'
    }, [sp])

    const didRunRef = useRef(false)

    useEffect(() => {
        let cancelled = false

        const run = async () => {
            try {
                if (!requestToken) throw new Error('Falta request_token')
                if (approved !== 'true') throw new Error('Autorización cancelada en TMDb')

                // ✅ Guard anti-doble ejecución
                if (didRunRef.current) return
                didRunRef.current = true

                const ssKey = `tmdb_cb_done:${requestToken}`
                if (typeof window !== 'undefined') {
                    if (sessionStorage.getItem(ssKey) === '1') return
                    sessionStorage.setItem(ssKey, '1')
                }

                if (!cancelled) setErr('')
                if (!cancelled) setStep('Creando sesión…')

                const sres = await fetch('/api/tmdb/auth/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    cache: 'no-store',
                    body: JSON.stringify({ request_token: requestToken })
                })

                const sj = await sres.json().catch(() => ({}))
                if (!sres.ok) throw new Error(sj?.error || 'No se pudo crear la sesión')

                const session_id = sj?.session_id
                if (!session_id) throw new Error('session_id inválido')

                if (!cancelled) setStep('Cargando perfil…')
                const ares = await fetch(`/api/tmdb/auth/account?session_id=${encodeURIComponent(session_id)}`, {
                    cache: 'no-store'
                })
                const aj = await ares.json().catch(() => ({}))
                if (!ares.ok) throw new Error(aj?.error || 'No se pudo cargar la cuenta')

                login({ session_id, account: aj })

                if (!cancelled) setStep('¡Listo! Redirigiendo…')
                router.replace(next)
            } catch (e) {
                if (!cancelled) setErr(e?.message || 'Error en callback')
            }
        }

        run()
        return () => {
            cancelled = true
        }
    }, [requestToken, approved, next, router, login])

    return (
        <main className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
                {!err ? (
                    <div className="flex items-start gap-3">
                        <Loader2 className="w-5 h-5 mt-0.5 animate-spin text-emerald-300" />
                        <div>
                            <div className="text-lg font-extrabold">Conectando con TMDb</div>
                            <div className="text-sm text-zinc-400 mt-1">{step}</div>
                            {step.includes('¡Listo!') && (
                                <div className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-200">
                                    <CheckCircle className="w-4 h-4" /> Sesión creada correctamente
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 text-red-300" />
                        <div>
                            <div className="text-lg font-extrabold">No se pudo iniciar sesión</div>
                            <div className="text-sm text-zinc-400 mt-1">{err}</div>
                            <button
                                onClick={() => router.replace('/login')}
                                className="mt-5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm font-bold"
                            >
                                Volver a login
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}