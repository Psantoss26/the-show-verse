'use client'

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Star, X, Trash2, Minus, Plus } from 'lucide-react'

// Utilidad para formatear números (7.0 -> 7)
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

  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(hasRating ? rating : 8)
  const rangeRef = useRef(null)

  useEffect(() => setMounted(true), [])

  // Sincronizar rating externo
  useEffect(() => {
    if (hasRating) setValue(rating)
  }, [hasRating, rating])

  // Bloquear scroll al abrir
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Handlers
  const updateValue = (val) => {
    // Clamp entre 0.5 y 10, redondeado a 0.5
    const next = Math.min(10, Math.max(0.5, Math.round(val * 2) / 2))
    setValue(next)
  }

  const adjust = (delta) => updateValue(value + delta)

  const handleSave = async () => {
    if (disabled) return
    await onRating?.(value)
    setOpen(false)
  }

  const handleClear = async () => {
    if (disabled) return
    await onClearRating?.()
    setOpen(false)
  }

  // Calcula el porcentaje para el gradiente del slider
  const percentage = ((value - 0.5) / (10 - 0.5)) * 100

  return (
    <>
      {/* BOTÓN TRIGGER MODIFICADO */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!open && !hasRating) setValue(8)
          setOpen(true)
        }}
        className={`
                    group inline-flex items-center justify-center gap-2 rounded-xl border transition-all duration-300
                    ${/* Ajuste de padding: si no hay rating (solo icono en móvil), padding más cuadrado */ ''}
                    ${!hasRating ? 'p-2 sm:px-3 sm:py-2' : 'px-3 py-2'}
                    
                    ${hasRating
            ? 'bg-white/[0.08] border-white/20 text-white'
            : 'bg-transparent border-white/10 text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
          }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
        title={hasRating ? `Nota: ${fmt(rating)}` : 'Puntuar'}
      >
        <Star
          className={`w-5 h-5 transition-transform group-hover:scale-110 ${hasRating ? 'fill-yellow-500 text-yellow-500' : 'text-current'}`}
        />

        {/* LÓGICA DE VISIBILIDAD DEL TEXTO */}
        {hasRating ? (
          <span className="text-sm font-medium">{fmt(rating)}</span>
        ) : (
          // Hidden en móvil, block en sm (tablet/pc)
          <span className="hidden sm:block text-sm font-medium">Puntuar</span>
        )}
      </button>

      {/* MODAL (Portal) - Diseño Neutro Slider + Estrella Amarilla Fondo */}
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-sm bg-[#080808] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Tu reseña
              </span>
              <button
                onClick={() => setOpen(false)}
                className="p-2 -mr-2 rounded-full text-zinc-500 hover:bg-white/5 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-8 space-y-8">
              {/* Display Principal */}
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="relative flex items-center justify-center">
                  <Star
                    className="w-24 h-24 text-yellow-500/20 fill-yellow-500/20 absolute drop-shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                    strokeWidth={1}
                  />
                  <span className="relative text-6xl font-black text-white tracking-tighter z-10 font-sans">
                    {fmt(value)}
                  </span>
                </div>
              </div>

              {/* ZONA DE SLIDER */}
              <div className="space-y-6">
                <div className="relative h-12 flex items-center justify-center group">
                  <div className="absolute w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-200 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <input
                    ref={rangeRef}
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={value}
                    onChange={(e) => updateValue(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <div
                    className="absolute h-7 w-7 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] pointer-events-none transition-all duration-75 z-10 flex items-center justify-center border-4 border-[#080808]"
                    style={{ left: `calc(${percentage}% - 14px)` }}
                  >
                    <div className="w-1.5 h-1.5 bg-black rounded-full" />
                  </div>
                </div>

                {/* Botones de Ajuste */}
                <div className="flex items-center justify-between text-zinc-500">
                  <button
                    onClick={() => adjust(-0.5)}
                    className="w-12 h-12 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center hover:bg-white/10 hover:text-white transition active:scale-95"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-[10px] font-medium tracking-widest opacity-40">DESLIZA PARA PUNTUAR</span>
                  <button
                    onClick={() => adjust(0.5)}
                    className="w-12 h-12 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center hover:bg-white/10 hover:text-white transition active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-3 pt-2">
                {hasRating && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="h-12 w-12 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900/50 hover:bg-red-900/10 transition"
                    title="Eliminar nota"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={disabled}
                  className="flex-1 h-12 rounded-xl bg-white text-black font-extrabold text-sm uppercase tracking-wide hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}