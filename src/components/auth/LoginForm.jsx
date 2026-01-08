'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, ShieldCheck, Sparkles, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const searchParams = useSearchParams()

  const next = useMemo(() => {
    const n = searchParams?.get('next') || '/'
    return n.startsWith('/') ? n : '/'
  }, [searchParams])

  const startTmdbLogin = async () => {
    setLoading(true)
    setErr('')

    try {
      const res = await fetch('/api/tmdb/auth/request-token', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo iniciar el login')

      const token = json?.request_token
      if (!token) throw new Error('Token inválido')

      const origin = window.location.origin
      const redirectUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`

      window.location.href =
        `https://www.themoviedb.org/authenticate/${token}` +
        `?redirect_to=${encodeURIComponent(redirectUrl)}`
    } catch (e) {
      setErr(e?.message || 'Error iniciando login TMDb')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md lg:max-w-5xl grid gap-4 lg:grid-cols-2 lg:gap-6 items-stretch">
      {/* LEFT (solo desktop) */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="hidden lg:block rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 lg:p-10 relative overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-[90px]" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-[90px]" />
        </div>

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/30 text-xs font-bold text-zinc-200">
            <Sparkles className="w-4 h-4 text-emerald-300" />
            Conecta tu cuenta de TMDb
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-tight">Inicia sesión de forma segura</h1>
          <p className="mt-3 text-zinc-300 leading-relaxed max-w-prose">
            Te redirigimos a TMDb para autorizar. Nosotros solo guardamos tu{' '}
            <span className="text-emerald-300 font-semibold">session_id</span> y tu perfil.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Feature icon={ShieldCheck} title="Sin contraseña" desc="Autorización oficial de TMDb" />
            <Feature icon={ExternalLink} title="Vuelves solo" desc="Sesión + perfil al volver" />
          </div>

          <div className="mt-8 text-xs text-zinc-400 border-t border-white/10 pt-4">
            Al continuar, aceptas que TMDb gestione la autenticación en su web.
          </div>
        </div>
      </motion.div>

      {/* RIGHT (mobile + desktop) */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="
          rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl shadow-black/60
          p-5 sm:p-7 lg:p-10
          flex flex-col
        "
      >
        {/* Intro compacta SOLO móvil (para no necesitar la columna izquierda) */}
        <div className="lg:hidden">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/30 text-[11px] font-extrabold text-zinc-200">
            <Sparkles className="w-4 h-4 text-emerald-300" />
            Login oficial TMDb
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight leading-tight">
            Entra sin contraseña
          </h1>

          <div className="mt-2 flex gap-2">
            <MiniPill icon={ShieldCheck} text="Seguro" />
            <MiniPill icon={ExternalLink} text="Vuelves solo" />
          </div>
        </div>

        <div className="mt-5 lg:mt-0 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold">Accede a tu cuenta</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">Autenticación oficial de TMDb</p>
          </div>
          <div className="px-2.5 py-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200 text-[11px] sm:text-xs font-extrabold">
            Recomendado
          </div>
        </div>

        {/* Contenido principal: compacto + centrado para que quepa en móvil */}
        <div className="mt-5 sm:mt-6 flex-1 flex flex-col justify-center gap-3">
          <button
            type="button"
            onClick={startTmdbLogin}
            disabled={loading}
            className="
              w-full rounded-2xl px-4 py-3 sm:py-3.5 font-extrabold text-sm
              bg-emerald-500/15 border border-emerald-500/25 text-emerald-100
              hover:bg-emerald-500/20 hover:border-emerald-500/35
              transition disabled:opacity-60 disabled:cursor-not-allowed
              flex items-center justify-center gap-2
            "
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {loading ? 'Abriendo TMDb…' : 'Continuar con TMDb'}
          </button>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-zinc-300 space-y-1.5">
              <Step n="1" text="Se abre TMDb y autorizas" />
              <Step n="2" text="Vuelves aquí automáticamente" />
              <Step n="3" text="Guardamos sesión y perfil" />
            </div>
          </div>

          {/* Reserva altura para que el error no empuje y provoque scroll */}
          <div className="min-h-[22px]">
            <AnimatePresence>
              {!!err && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 text-xs sm:text-sm text-red-300"
                >
                  <AlertCircle className="w-4 h-4" />
                  <span className="line-clamp-2">{err}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Aviso legal SOLO móvil (porque no tenemos columna izquierda) */}
        <div className="lg:hidden text-[11px] text-zinc-500 border-t border-white/10 pt-3 mt-3">
          Al continuar, TMDb gestiona la autenticación en su web. Solo guardamos tu sesión y perfil.
        </div>
      </motion.div>
    </div>
  )
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-emerald-300">
          <Icon className="w-4 h-4" />
        </div>
        <div className="font-extrabold text-white text-sm">{title}</div>
      </div>
      <div className="mt-2 text-xs text-zinc-400 leading-relaxed">{desc}</div>
    </div>
  )
}

function MiniPill({ icon: Icon, text }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] font-bold text-zinc-200">
      <Icon className="w-3.5 h-3.5 text-emerald-300" />
      {text}
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div className="flex gap-2">
      <span className="text-zinc-500 font-extrabold">{n}.</span>
      <span>{text}</span>
    </div>
  )
}