'use client'

// Modales de las acciones de una lista propia (añadir títulos, editar, vaciar,
// borrar) con la MISMA estructura y acabado que los modales de acciones de
// DetailsClient (puntuación, listas, compartir, editar colección): portal, velo
// `bg-black/60` difuminado, tarjeta `rounded-[2rem]` de LIQUID_GLASS_PANEL con
// cabecera LIQUID_GLASS_MODAL_HEADER, cuerpo con scroll propio y pie con los
// botones. Escape y el «atrás» del sistema lo cierran (useModalGuard).

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'

import useModalGuard from '@/hooks/useModalGuard'
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from '@/lib/ui/liquidGlass'

// Campos y etiquetas de los modales de la ficha (CollectionEditModal).
export const MODAL_FIELD_CLASS = 'mt-2 block w-full rounded-xl bg-black/40 px-4 py-3 text-sm font-normal normal-case tracking-normal text-white placeholder-zinc-600 outline-none transition focus:bg-black/60 focus:ring-2 focus:ring-yellow-500/50'
export const MODAL_LABEL_CLASS = 'block text-xs font-bold uppercase tracking-wider text-zinc-300'
const THIN_SCROLLBAR = '[scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]'

const SIZES = { sm: 'max-w-[440px]', md: 'max-w-xl', lg: 'max-w-3xl' }

/**
 * - title, subtitle?: cabecera (el subtítulo en versalitas, como en la ficha).
 * - footer?: botones del pie (fijos bajo el cuerpo con scroll).
 * - busy?: mientras guarda no se cierra.
 * - size?: 'sm' (confirmaciones) | 'md' (formularios) | 'lg' (añadir títulos).
 */
export default function ListActionModal({ open, onClose, title, subtitle, footer = null, busy = false, size = 'md', children }) {
    const titleId = useId()
    const panelRef = useRef(null)
    const [portalReady, setPortalReady] = useState(false)
    const close = () => { if (!busy) onClose() }

    useModalGuard({ open, onClose: close })
    useEffect(() => setPortalReady(true), [])

    // Foco al panel al abrir y de vuelta a quien lo abrió al cerrar.
    useEffect(() => {
        if (!open || !portalReady) return undefined
        const previous = document.activeElement
        panelRef.current?.focus({ preventScroll: true })
        return () => previous?.focus?.({ preventScroll: true })
    }, [open, portalReady])

    if (!open || !portalReady) return null

    return createPortal(
        <div
            data-detail-modal-layer=""
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300" onClick={close} aria-hidden="true" />

            <div
                ref={panelRef}
                tabIndex={-1}
                className={`relative flex max-h-[85dvh] w-full ${SIZES[size] || SIZES.md} flex-col overflow-hidden rounded-[2rem] outline-none ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
            >
                <div className={`flex w-full shrink-0 items-center justify-between gap-4 ${LIQUID_GLASS_MODAL_HEADER} p-6 sm:px-8 sm:pb-6 sm:pt-8`}>
                    <div className="min-w-0">
                        <h2 id={titleId} className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent">
                            {title}
                        </h2>
                        {subtitle ? (
                            <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-zinc-500">{subtitle}</p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        disabled={busy}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 disabled:opacity-50"
                        aria-label="Cerrar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 sm:px-8 ${THIN_SCROLLBAR}`}>
                    {children}
                </div>

                {footer ? (
                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/5 px-4 py-4 sm:px-8">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body,
    )
}

// Botones del pie, los de los modales de la ficha: secundario de cristal y
// principal amarillo («Guardar»); los destructivos, con la misma forma en ámbar
// (vaciar) y rojo (borrar).
const TONES = {
    neutral: 'bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white',
    primary: 'bg-yellow-500 text-black shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)] hover:bg-yellow-400 active:scale-95',
    warning: 'bg-amber-500 text-black shadow-[0_0_20px_-5px_rgba(245,158,11,0.35)] hover:bg-amber-400 active:scale-95',
    danger: 'bg-red-500 text-white shadow-[0_0_20px_-5px_rgba(239,68,68,0.4)] hover:bg-red-400 active:scale-95',
}

export function ModalButton({ tone = 'neutral', loading = false, icon: Icon = null, children, className = '', ...props }) {
    return (
        <button
            type="button"
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-zinc-500 disabled:shadow-none disabled:active:scale-100 ${TONES[tone] || TONES.neutral} ${className}`}
            {...props}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {children}
        </button>
    )
}

// Interruptor de los ajustes (ToggleRow de Ajustes) en una fila de cristal con
// icono, título y descripción.
export function ModalToggleRow({ icon: Icon, title, description, checked, onChange, disabled = false }) {
    const titleId = useId()
    return (
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/[0.04] p-4">
            <div className="flex min-w-0 items-start gap-3">
                {Icon ? (
                    <div className={`rounded-xl bg-white/5 p-2.5 ${checked ? 'text-emerald-400' : 'text-zinc-400'}`}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                ) : null}
                <div className="min-w-0">
                    <h3 id={titleId} className="text-sm font-bold tracking-wide text-white">{title}</h3>
                    {description ? <p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:text-sm">{description}</p> : null}
                </div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={titleId}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                    checked ? 'bg-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-white/10'
                }`}
            >
                <span
                    aria-hidden="true"
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300 ${checked ? 'left-7' : 'left-1'}`}
                />
            </button>
        </div>
    )
}
