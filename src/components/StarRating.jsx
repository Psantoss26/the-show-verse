'use client'

import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { StarIcon, X, Minus, Plus, Check } from 'lucide-react'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const fmt = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return ''
  return v.toFixed(1).replace(/\.0$/, '')
}

export default function StarRating({
  rating,
  onRating,
  onClearRating,
  disabled = false
}) {
  const hasRating = typeof rating === 'number' && Number.isFinite(rating)

  const pillRef = useRef(null)
  const popRef = useRef(null)

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  const [halfMode, setHalfMode] = useState(hasRating ? (rating % 1 !== 0) : false)
  const [value, setValue] = useState(hasRating ? rating : 7)

  // Posición del popover (FIXED, en body)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => setMounted(true), [])

  // Sync si cambia rating desde fuera
  useEffect(() => {
    if (!hasRating) return
    setValue(rating)
    setHalfMode(rating % 1 !== 0)
  }, [hasRating, rating])

  const pillLabel = useMemo(() => (hasRating ? fmt(rating) : 'Puntuar'), [hasRating, rating])

  // Posiciona el popover cuando se abre
  useLayoutEffect(() => {
    if (!open) return
    if (!pillRef.current) return

    const GAP = 8
    const PAD = 10
    const POP_W = 280

    const place = () => {
      const r = pillRef.current.getBoundingClientRect()
      let left = r.left
      let top = r.bottom + GAP

      // clamp horizontal (viewport)
      const maxLeft = window.innerWidth - POP_W - PAD
      left = clamp(left, PAD, Math.max(PAD, maxLeft))

      setPos({ top, left })
    }

    place()

    // Recolocar en scroll/resize (captura para scroll en cualquier contenedor)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Cerrar al click fuera / Escape (teniendo en cuenta que el popover está en portal)
  useEffect(() => {
    if (!open) return

    const onDown = (e) => {
      const t = e.target
      if (pillRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pickBase = (n) => {
    const next = clamp(n + (halfMode ? 0.5 : 0), 0.5, 10)
    setValue(next)
  }

  const adjust = (delta) => {
    setValue((prev) => clamp(Number(prev || 0) + delta, 0.5, 10))
  }

  const toggleHalf = () => {
    setHalfMode((prev) => {
      const nextHalf = !prev
      setValue((curr) => {
        const base = Math.floor(Number(curr || 0))
        return clamp(base + (nextHalf ? 0.5 : 0), 0.5, 10)
      })
      return nextHalf
    })
  }

  const handleSave = async () => {
    if (disabled) return
    const v = clamp(Math.round(value * 2) / 2, 0.5, 10)
    await onRating?.(v)
    setOpen(false)
  }

  const handleClear = async () => {
    if (disabled) return
    await onClearRating?.()
    setOpen(false)
  }

  return (
    <>
      {/* PILL */}
      <button
        ref={pillRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!open && !hasRating) {
            setValue(7)
            setHalfMode(false)
          }
          setOpen((v) => !v)
        }}
        className={[
          'inline-flex items-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-2.5 rounded-xl border transition',
          'bg-white/5 hover:bg-white/10',
          hasRating ? 'border-yellow-500/30 text-yellow-200' : 'border-white/10 text-zinc-200',
          disabled ? 'opacity-60 cursor-not-allowed hover:bg-white/5' : ''
        ].join(' ')}
        // ✅ En móvil no mostramos tooltip "Puntuar"
        title={hasRating ? `Tu puntuación: ${fmt(rating)}` : undefined}
        aria-label={hasRating ? `Tu puntuación: ${fmt(rating)}` : 'Puntuar'}
      >
        <StarIcon
          className={[
            'w-5 h-5',
            hasRating ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-300'
          ].join(' ')}
        />

        {/* ✅ Solo en >= sm mostramos texto/valor */}
        {hasRating ? (
          <span className="hidden sm:inline-flex items-baseline gap-1">
            <span className="text-sm font-extrabold leading-none">{fmt(rating)}</span>
            <span className="text-[10px] font-bold text-zinc-400 leading-none">/10</span>
          </span>
        ) : (
          <span className="hidden sm:inline text-sm font-extrabold leading-none">
            {pillLabel}
          </span>
        )}
      </button>

      {/* POPOVER (PORTAL) */}
      {mounted && open &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280 }}
            className="z-[100000] rounded-2xl border border-white/10 bg-[#101010]/95 shadow-2xl backdrop-blur overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="text-[15px] font-extrabold text-white truncate">
                Tu puntuación
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 w-8 h-8 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X className="w-4 h-4 text-zinc-200" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* Valor actual + ajuste fino */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center">
                    <StarIcon className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                      Seleccionada
                    </div>
                    <div className="text-xl font-extrabold text-white inline-flex items-baseline gap-1">
                      <span>{fmt(value)}</span>
                      <span className="text-xs font-bold text-zinc-400">/10</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(-0.5)}
                    disabled={disabled}
                    className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center disabled:opacity-50"
                    title="-0.5"
                    aria-label="-0.5"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => adjust(+0.5)}
                    disabled={disabled}
                    className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center disabled:opacity-50"
                    title="+0.5"
                    aria-label="+0.5"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Grid 1..10 */}
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const target = clamp(n + (halfMode ? 0.5 : 0), 0.5, 10)
                  const active = Math.abs(value - target) < 0.001

                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pickBase(n)}
                      disabled={disabled}
                      className={[
                        'h-10 rounded-xl border text-sm font-extrabold transition',
                        active
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:border-yellow-500/20',
                        disabled ? 'opacity-60 cursor-not-allowed hover:bg-white/5' : ''
                      ].join(' ')}
                      title={`Poner ${fmt(target)}`}
                      aria-label={`Poner ${fmt(target)}`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>

              {/* Toggle +0.5 */}
              <button
                type="button"
                onClick={toggleHalf}
                disabled={disabled}
                className={[
                  'w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition',
                  halfMode
                    ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-200'
                    : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10',
                  disabled ? 'opacity-60 cursor-not-allowed hover:bg-white/5' : ''
                ].join(' ')}
                title="Alternar +0.5"
                aria-label="Alternar +0.5"
              >
                <span className="text-sm font-bold">+0.5</span>
                {halfMode ? (
                  <Check className="w-4 h-4 text-yellow-300" />
                ) : (
                  <span className="text-xs text-zinc-500"></span>
                )}
              </button>

              {/* Acciones */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={disabled}
                  className={[
                    'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-extrabold transition',
                    'bg-yellow-500 text-black hover:brightness-110',
                    disabled ? 'opacity-60 cursor-not-allowed hover:brightness-100' : ''
                  ].join(' ')}
                >
                  <Check className="w-4 h-4" />
                  Guardar
                </button>

                {hasRating && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={disabled}
                    className={[
                      'inline-flex items-center justify-center px-3 py-2 rounded-xl border transition font-bold',
                      'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:border-red-500/30 hover:text-red-200',
                      disabled ? 'opacity-60 cursor-not-allowed hover:bg-white/5 hover:text-zinc-200' : ''
                    ].join(' ')}
                    title="Borrar puntuación"
                    aria-label="Borrar puntuación"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
