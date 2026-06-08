'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    X,
    Plus,
    Pencil,
    Trash2,
    ExternalLink,
    Loader2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Check,
    Clock,
    History
    ,
    Eye
} from 'lucide-react'

// --- Helpers de Fecha (Mismos que tenías) ---
const todayYmd = () => new Date().toISOString().slice(0, 10)

const isoToYmd = (iso) => {
    if (!iso) return ''
    return String(iso).slice(0, 10)
}

const ymdToDate = (ymd) => {
    if (!ymd) return null
    const [y, m, d] = String(ymd).split('-').map((x) => Number(x))
    if (!y || !m || !d) return null
    const dt = new Date(y, m - 1, d)
    return Number.isNaN(dt.getTime()) ? null : dt
}

const formatYmdHuman = (ymd) => {
    const d = ymdToDate(ymd)
    if (!d) return '—'
    try {
        return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
        return ymd
    }
}

const formatFullWatched = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)

    const date = new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(d)

    const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d)
    return { date, time, full: `${date} · ${time}` }
}

const pickHistoryId = (h) => h?.id ?? h?.historyId ?? h?.history_id ?? null
const pickWatchedAt = (h) => h?.watched_at ?? h?.watchedAt ?? h?.watchedAtIso ?? null

// ----------------------------
// Componente: Calendario Estilizado
// ----------------------------
function buildMonthGrid(year, month, weekStartsOn = 1) {
    const first = new Date(year, month, 1)
    const firstDow = first.getDay()
    const offset = (firstDow - weekStartsOn + 7) % 7
    const start = new Date(year, month, 1 - offset)

    const weeks = []
    for (let w = 0; w < 6; w++) {
        const week = []
        for (let i = 0; i < 7; i++) {
            const d = new Date(start)
            d.setDate(start.getDate() + w * 7 + i)
            week.push(d)
        }
        weeks.push(week)
    }
    return weeks
}

function dateToYmdLocal(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function CalendarPickerModal({ open, valueYmd, onSelect, onClose, title = 'Selecciona fecha' }) {
    const [monthDate, setMonthDate] = useState(() => {
        const d = new Date()
        d.setDate(1)
        return d
    })

    useEffect(() => {
        if (!open) return
        const base = ymdToDate(valueYmd) || new Date()
        const d = new Date(base)
        d.setDate(1)
        setMonthDate(d)
    }, [open, valueYmd])

    if (!open) return null

    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const weeks = buildMonthGrid(year, month, 1)
    const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(monthDate)
    const selected = valueYmd || null
    const today = todayYmd()
    const dow = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

    return (
        <div className="fixed inset-0 z-[10060] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/20 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)] backdrop-blur-[50px] animate-in zoom-in-95 duration-300 ease-out"
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                {/* Header Calendario */}
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <div className="text-sm font-black uppercase tracking-wide text-white drop-shadow-sm">{title}</div>
                        <div className="mt-0.5 font-mono text-xs font-semibold text-emerald-300">
                            {selected ? formatYmdHuman(selected) : 'Sin fecha'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white"
                        title="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navegación Mes */}
                <div className="p-4 pb-0 flex items-center justify-between mb-4">
                    <button
                        type="button"
                        onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                        title="Mes anterior"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-bold text-white capitalize">{monthLabel}</span>
                    <button
                        type="button"
                        onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                        className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                        title="Mes siguiente"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                {/* Grid */}
                <div className="px-4 pb-6">
                    <div className="grid grid-cols-7 mb-2">
                        {dow.map((d) => (
                            <div key={d} className="text-center text-[10px] font-bold text-zinc-500 uppercase">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                        {weeks.flat().map((d, i) => {
                            const inMonth = d.getMonth() === month
                            const key = dateToYmdLocal(d)
                            const isSel = !!key && key === selected
                            const isToday = !!key && key === today

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => key && onSelect?.(key)}
                                    className={`
                                        relative aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all duration-200
                                        ${!inMonth ? 'text-white/20 opacity-50' : 'text-white/70 hover:bg-white/10 hover:text-white'}
                                        ${isSel ? '!bg-emerald-500 !text-black font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105 z-10' : ''}
                                        ${isToday && !isSel ? 'bg-white/5 border border-white/10 text-white' : ''}
                                    `}
                                >
                                    {d.getDate()}
                                    {isToday && !isSel && <div className="absolute bottom-1 w-1 h-1 bg-emerald-500 rounded-full" />}
                                </button>
                            )
                        })}
                    </div>

                    <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
                        <button
                            type="button"
                            onClick={() => onSelect?.(todayYmd())}
                            className="flex-1 rounded-full border border-white/20 bg-white/10 py-2.5 text-xs font-bold uppercase tracking-wide text-white/90 backdrop-blur-xl transition hover:bg-white/20 active:scale-95"
                        >
                            Seleccionar Hoy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ----------------------------
// Componente Principal
// ----------------------------
export default function TraktWatchedModal({
    open,
    onClose,
    traktUrl,
    plays,
    history,
    onAddPlay,
    onUpdatePlay,
    onRemovePlay,
    busy,
    busyKey
}) {
    const isBusy = !!(busy || busyKey)

    // Hooks y lógica (igual que antes)
    const items = useMemo(() => {
        const arr = Array.isArray(history) ? history : []
        return arr
            .map((h) => {
                const id = pickHistoryId(h)
                const watchedAt = pickWatchedAt(h)
                if (!id || !watchedAt) return null
                return { id, watchedAt }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
    }, [history])

    const [newDate, setNewDate] = useState(todayYmd())
    const [editingId, setEditingId] = useState(null)
    const [editDate, setEditDate] = useState(todayYmd())
    const [calOpen, setCalOpen] = useState(false)
    const [calTarget, setCalTarget] = useState('new') // 'new' | 'edit'

    useEffect(() => {
        if (!open) return
        setNewDate(todayYmd())
        setEditingId(null)
        setEditDate(todayYmd())
        setCalOpen(false)
        setCalTarget('new')

        // Bloquear scroll
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

    // Handlers
    const startEdit = (id, watchedAtIso) => {
        setEditingId(id)
        setEditDate(isoToYmd(watchedAtIso) || todayYmd())
    }
    const stopEdit = () => {
        setEditingId(null)
        setEditDate(todayYmd())
    }
    const openCalendarForNew = () => {
        setCalTarget('new')
        setCalOpen(true)
    }
    const openCalendarForEdit = () => {
        setCalTarget('edit')
        setCalOpen(true)
    }
    const onPickCalendar = (ymd) => {
        if (!ymd) return
        if (calTarget === 'edit') setEditDate(ymd)
        else setNewDate(ymd)
        setCalOpen(false)
    }
    const doAdd = async () => {
        if (!newDate || isBusy) return
        await onAddPlay?.(newDate)
        setNewDate(todayYmd())
    }
    const doSaveEdit = async () => {
        if (!editingId || !editDate || isBusy) return
        await onUpdatePlay?.(editingId, editDate)
        stopEdit()
    }
    const doRemove = async (id) => {
        if (!id || isBusy) return
        await onRemovePlay?.(id)
        if (editingId === id) stopEdit()
    }

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop con Blur y Fade */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Container */}
            <div
                className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/20 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)] backdrop-blur-[50px] animate-in zoom-in-95 duration-300 ease-out"
                role="dialog"
                aria-modal="true"
                aria-label="Historial de visionados"
            >

                {/* Header Premium */}
                <div className="flex items-start justify-between border-b border-white/10 px-6 py-5 sm:px-7">
                    <div>
                        <h3 className="text-xl font-black text-white drop-shadow-md">
                            Historial de Visionado
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 backdrop-blur-md">
                                <Check className="w-3 h-3" />
                                {plays ? `${plays} Vistas` : 'Sin ver'}
                            </span>
                            {traktUrl && (
                                <a href={traktUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-bold text-white/50 transition hover:text-white">
                                    Trakt <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white"
                        title="Cerrar (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

                    {/* SECCIÓN 1: AÑADIR NUEVO (Hero Section) */}
                    <div className="relative group">
                        <div className="absolute -inset-2 rounded-3xl bg-gradient-to-b from-emerald-400/15 to-transparent opacity-0 blur-lg transition duration-500 group-hover:opacity-100" />
                        <div className="relative flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-white/60">Registrar nueva vista</span>
                                {isBusy && <Loader2 className="w-4 h-4 text-emerald-300 animate-spin" />}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={openCalendarForNew}
                                    disabled={isBusy}
                                    className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left backdrop-blur-md transition hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
                                >
                                    <CalendarDays className="w-5 h-5 text-emerald-200/80" />
                                    <div>
                                        <div className="text-xs font-medium text-white/45">Fecha</div>
                                        <div className="text-sm font-bold text-white">{formatYmdHuman(newDate)}</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={doAdd}
                                    disabled={isBusy}
                                    className="flex items-center justify-center rounded-full border border-emerald-200/30 bg-emerald-400/90 px-5 py-3 font-extrabold text-black shadow-[0_10px_30px_-10px_rgba(52,211,153,0.65)] transition-all hover:bg-emerald-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Añadir visionado"
                                >
                                    <Plus className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 2: HISTORIAL (Timeline) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-white/40" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-white/45">Actividad Reciente</h4>
                        </div>

                        {!items.length ? (
                            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.04] py-8 text-center backdrop-blur-xl">
                                <Clock className="mb-2 w-8 h-8 text-white/25" />
                                <p className="text-sm text-white/45">No hay registros en el historial.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {items.slice(0, 20).map((it) => {
                                    const isEditing = editingId === it.id
                                    const { date } = formatFullWatched(it.watchedAt)

                                    return (
                                        <div
                                            key={it.id}
                                            className={`
                                                relative rounded-3xl border p-4 backdrop-blur-xl transition-all duration-300
                                                ${isEditing
                                                    ? 'border-yellow-300/30 bg-yellow-400/10 shadow-[0_0_30px_-10px_rgba(234,179,8,0.35)]'
                                                    : 'border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.08]'
                                                }
                                            `}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className={`
                                                        w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border backdrop-blur-md
                                                        ${isEditing ? 'bg-yellow-400/15 border-yellow-300/25 text-yellow-200' : 'bg-white/5 border-white/10 text-white/45'}
                                                    `}>
                                                        {isEditing ? <Pencil className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className={`text-base sm:text-lg font-extrabold tracking-tight leading-tight ${isEditing ? 'text-yellow-100' : 'text-white'}`}>
                                                            {isEditing ? 'Editando fecha...' : date}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Acciones Rápidas (Solo visibles si NO se edita, o si es la fila activa) */}
                                                {!isEditing && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => startEdit(it.id, it.watchedAt)}
                                                            disabled={isBusy}
                                                            className="rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                                                            title="Editar"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => doRemove(it.id)}
                                                            disabled={isBusy}
                                                            className="rounded-full p-2 text-white/45 transition hover:bg-red-500/15 hover:text-red-300"
                                                            title="Eliminar"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Editor Inline Expansible */}
                                            {isEditing && (
                                                <div className="mt-4 pt-4 border-t border-white/10 animate-in slide-in-from-top-2 fade-in">
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={openCalendarForEdit}
                                                            disabled={isBusy}
                                                            className="flex flex-1 items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white/85 transition hover:border-white/20 hover:bg-white/10"
                                                        >
                                                            <span className="font-mono">{formatYmdHuman(editDate)}</span>
                                                            <CalendarDays className="w-4 h-4 text-yellow-200" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={doSaveEdit}
                                                            disabled={isBusy}
                                                            className="rounded-full border border-yellow-200/30 bg-yellow-300/90 px-4 py-2 text-sm font-bold text-black transition hover:bg-yellow-200 active:scale-95"
                                                        >
                                                            Guardar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={stopEdit}
                                                            disabled={isBusy}
                                                            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
                                                            title="Cancelar"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Calendario Modal (Portaled o Overlay) */}
            <CalendarPickerModal
                open={calOpen}
                valueYmd={calTarget === 'edit' ? editDate : newDate}
                onSelect={onPickCalendar}
                onClose={() => setCalOpen(false)}
                title={calTarget === 'edit' ? 'Cambiar fecha' : 'Fecha de visionado'}
            />
        </div>
    )
}
