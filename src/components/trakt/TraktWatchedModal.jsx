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
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={onClose} />

            <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header Calendario */}
                <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-white uppercase tracking-wide">{title}</div>
                        <div className="text-xs text-emerald-400 mt-0.5 font-mono">
                            {selected ? formatYmdHuman(selected) : 'Sin fecha'}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navegación Mes */}
                <div className="p-4 pb-0 flex items-center justify-between mb-4">
                    <button
                        onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                        className="p-2 rounded-xl hover:bg-white/10 text-zinc-300 transition"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-bold text-white capitalize">{monthLabel}</span>
                    <button
                        onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                        className="p-2 rounded-xl hover:bg-white/10 text-zinc-300 transition"
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
                                        ${!inMonth ? 'text-zinc-700 opacity-50' : 'text-zinc-300 hover:bg-white/10'}
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

                    <div className="mt-5 pt-4 border-t border-white/5 flex gap-2">
                        <button
                            onClick={() => onSelect?.(todayYmd())}
                            className="flex-1 py-2.5 rounded-xl bg-white/5 text-xs font-bold text-white hover:bg-white/10 transition"
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
    busy
}) {
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
        if (!newDate || busy) return
        await onAddPlay?.(newDate)
        setNewDate(todayYmd())
    }
    const doSaveEdit = async () => {
        if (!editingId || !editDate || busy) return
        await onUpdatePlay?.(editingId, editDate)
        stopEdit()
    }
    const doRemove = async (id) => {
        if (!id || busy) return
        await onRemovePlay?.(id)
        if (editingId === id) stopEdit()
    }

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
            {/* Backdrop con Blur y Fade */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative w-full max-w-md flex flex-col max-h-[90vh] 
                            rounded-3xl border border-white/10 bg-[#050505] 
                            shadow-[0_0_50px_-12px_rgba(255,255,255,0.05)] 
                            overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">

                {/* Header Premium */}
                <div className="px-6 py-5 border-b border-white/5 flex items-start justify-between bg-white/[0.02]">
                    <div>
                        <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
                            Historial de Visionado
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                                <Check className="w-3 h-3" />
                                {plays ? `${plays} Vistas` : 'Sin ver'}
                            </span>
                            {traktUrl && (
                                <a href={traktUrl} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-zinc-500 hover:text-white transition flex items-center gap-1">
                                    Trakt <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white hover:rotate-90 transition-all duration-300">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

                    {/* SECCIÓN 1: AÑADIR NUEVO (Hero Section) */}
                    <div className="relative group">
                        <div className="absolute -inset-2 bg-gradient-to-b from-emerald-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-lg" />
                        <div className="relative flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Registrar nueva vista</span>
                                {busy && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={openCalendarForNew}
                                    disabled={busy}
                                    className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 text-left transition disabled:opacity-50"
                                >
                                    <CalendarDays className="w-5 h-5 text-zinc-400" />
                                    <div>
                                        <div className="text-xs text-zinc-500 font-medium">Fecha</div>
                                        <div className="text-sm font-bold text-white">{formatYmdHuman(newDate)}</div>
                                    </div>
                                </button>

                                <button
                                    onClick={doAdd}
                                    disabled={busy}
                                    className="px-5 py-3 rounded-xl bg-emerald-500 text-black font-extrabold hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    <Plus className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 2: HISTORIAL (Timeline) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-zinc-500" />
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Actividad Reciente</h4>
                        </div>

                        {!items.length ? (
                            <div className="py-8 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                                <Clock className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-500">No hay registros en el historial.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {items.slice(0, 20).map((it) => {
                                    const isEditing = editingId === it.id
                                    const { date, time } = formatFullWatched(it.watchedAt)

                                    return (
                                        <div
                                            key={it.id}
                                            className={`
                                                relative p-4 rounded-2xl border transition-all duration-300
                                                ${isEditing
                                                    ? 'bg-zinc-900 border-yellow-500/30 shadow-[0_0_30px_-10px_rgba(234,179,8,0.2)]'
                                                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                                                }
                                            `}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className={`
                                                        w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border
                                                        ${isEditing ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-white/5 border-white/5 text-zinc-500'}
                                                    `}>
                                                        {isEditing ? <Pencil className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className={`text-sm font-bold ${isEditing ? 'text-yellow-100' : 'text-zinc-200'}`}>
                                                            {isEditing ? 'Editando fecha...' : date}
                                                        </div>
                                                        <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                                                            {!isEditing && <>{time} · ID: {it.id.toString().slice(-4)}</>}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Acciones Rápidas (Solo visibles si NO se edita, o si es la fila activa) */}
                                                {!isEditing && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => startEdit(it.id, it.watchedAt)}
                                                            disabled={busy}
                                                            className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition"
                                                            title="Editar"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => doRemove(it.id)}
                                                            disabled={busy}
                                                            className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition"
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
                                                            onClick={openCalendarForEdit}
                                                            disabled={busy}
                                                            className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/50 border border-white/10 hover:border-white/20 text-sm text-zinc-200 transition"
                                                        >
                                                            <span className="font-mono">{formatYmdHuman(editDate)}</span>
                                                            <CalendarDays className="w-4 h-4 text-yellow-500" />
                                                        </button>
                                                        <button
                                                            onClick={doSaveEdit}
                                                            disabled={busy}
                                                            className="px-4 py-2 rounded-xl bg-yellow-500 text-black text-sm font-bold hover:bg-yellow-400 transition"
                                                        >
                                                            Guardar
                                                        </button>
                                                        <button
                                                            onClick={stopEdit}
                                                            disabled={busy}
                                                            className="px-3 py-2 rounded-xl bg-white/5 text-zinc-400 text-sm font-bold hover:bg-white/10 transition"
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