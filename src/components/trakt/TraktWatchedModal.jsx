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
    Eye
} from 'lucide-react'

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
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(d)

    const hasTime = String(iso).includes('T')
    if (!hasTime) return date

    const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d)
    return `${date} · ${time}`
}

const pickHistoryId = (h) => h?.id ?? h?.historyId ?? h?.history_id ?? null
const pickWatchedAt = (h) => h?.watched_at ?? h?.watchedAt ?? h?.watchedAtIso ?? null

// ----------------------------
// Calendar (flat modal) picker
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

function CalendarPickerModal({ open, valueYmd, onSelect, onClose, title = 'Selecciona el día' }) {
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
        <div className="fixed inset-0 z-[10060]">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101010] shadow-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-extrabold text-white truncate">{title}</div>
                            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{selected ? formatYmdHuman(selected) : '—'}</div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 w-10 h-10 rounded-full border border-white/10 hover:bg-white/5 transition flex items-center justify-center"
                            title="Cerrar"
                        >
                            <X className="w-5 h-5 text-zinc-200" />
                        </button>
                    </div>

                    <div className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <button
                                type="button"
                                onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                                className="w-10 h-10 rounded-xl border border-white/10 hover:bg-white/5 transition flex items-center justify-center"
                                title="Mes anterior"
                            >
                                <ChevronLeft className="w-5 h-5 text-zinc-200" />
                            </button>

                            <div className="min-w-0 flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center">
                                    <CalendarDays className="w-5 h-5 text-yellow-300" />
                                </div>
                                <div className="text-sm font-extrabold text-white truncate capitalize">{monthLabel}</div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                                className="w-10 h-10 rounded-xl border border-white/10 hover:bg-white/5 transition flex items-center justify-center"
                                title="Mes siguiente"
                            >
                                <ChevronRight className="w-5 h-5 text-zinc-200" />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-2 text-[11px] font-bold text-zinc-500 mb-2">
                            {dow.map((d) => (
                                <div key={d} className="text-center">
                                    {d}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-2">
                            {weeks.flat().map((d) => {
                                const inMonth = d.getMonth() === month
                                const key = dateToYmdLocal(d)
                                const isSel = !!key && key === selected
                                const isToday = !!key && key === today

                                return (
                                    <button
                                        key={d.toISOString()}
                                        type="button"
                                        onClick={() => key && onSelect?.(key)}
                                        className={`relative aspect-square rounded-xl border transition flex items-center justify-center
                      ${inMonth ? '' : 'opacity-55'}
                      ${isSel ? 'border-yellow-500/60 bg-yellow-500/10' : 'border-white/10 hover:bg-white/5'}
                    `}
                                        title={key || ''}
                                    >
                                        <div className="text-zinc-100 font-extrabold text-sm">{d.getDate()}</div>
                                        {isToday && !isSel && (
                                            <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow ring-2 ring-black/60" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => onSelect?.(todayYmd())}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 transition text-sm font-bold text-zinc-200"
                            >
                                Hoy
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 transition text-sm font-bold text-zinc-200"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

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
    const items = useMemo(() => {
        const arr = Array.isArray(history) ? history : []
        const normalized = arr
            .map((h) => {
                const id = pickHistoryId(h)
                const watchedAt = pickWatchedAt(h)
                if (!id || !watchedAt) return null
                return { id, watchedAt }
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))
        return normalized
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
    }, [open])

    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

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
        await onAddPlay?.(newDate) // YYYY-MM-DD
        setNewDate(todayYmd())
    }

    const doSaveEdit = async () => {
        if (!editingId || !editDate || busy) return
        await onUpdatePlay?.(editingId, editDate) // YYYY-MM-DD
        stopEdit()
    }

    const doRemove = async (id) => {
        if (!id || busy) return
        await onRemovePlay?.(id)
        if (editingId === id) stopEdit()
    }

    const playsLabel =
        Number(plays || 0) > 0 ? `Visto · ${plays} vez${plays === 1 ? '' : 'es'}` : 'Aún no marcado como visto'

    return (
        <div className="fixed inset-0 z-[10050]">
            {/* overlay un poco más plano */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                {/* ✅ modal plano: un solo fondo, sin “tarjetas” apiladas */}
                <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101010] shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="text-lg font-extrabold text-white truncate">Trakt · Visto</h3>
                            <p className="text-xs text-zinc-400 mt-1 truncate">{playsLabel}</p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 w-10 h-10 rounded-full border border-white/10 hover:bg-white/5 transition flex items-center justify-center"
                            title="Cerrar"
                        >
                            <X className="w-5 h-5 text-zinc-200" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="px-5 py-4 space-y-4 max-h-[78vh] overflow-auto">
                        {/* ✅ Añadir nuevo visionado (sin tarjeta) */}
                        <div>
                            <div className="text-xs font-bold text-zinc-300 mb-2">Añadir nueva vista</div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={openCalendarForNew}
                                    disabled={busy}
                                    className="flex-1 inline-flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2
                             text-sm text-zinc-200 hover:bg-white/5 hover:border-white/15 transition disabled:opacity-70"
                                    title="Seleccionar día"
                                >
                                    <span className="truncate">{formatYmdHuman(newDate)}</span>
                                    <CalendarDays className="w-4 h-4 text-yellow-300 shrink-0" />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setNewDate(todayYmd())}
                                    disabled={busy}
                                    className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/15 transition text-sm text-zinc-200 disabled:opacity-70"
                                >
                                    Hoy
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={doAdd}
                                disabled={busy || !newDate}
                                className={`mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-extrabold transition
                  ${busy || !newDate
                                        ? 'bg-emerald-500/25 text-black/40 cursor-not-allowed'
                                        : 'bg-emerald-500 text-black hover:brightness-110'
                                    }`}
                            >
                                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                Añadir
                            </button>

                            {traktUrl && (
                                <a
                                    href={traktUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl
                             border border-white/10 hover:bg-white/5 hover:border-white/15 transition text-sm text-zinc-200"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Abrir en Trakt
                                </a>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/10" />

                        {/* ✅ Historial (sin tarjeta, lista plana) */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-bold text-zinc-300">Historial</div>
                                <div className="text-[11px] text-zinc-500">{items.length ? `${items.length} registro(s)` : '—'}</div>
                            </div>

                            {!items.length ? (
                                <div className="text-sm text-zinc-400">Aún no hay entradas en el historial.</div>
                            ) : (
                                <div className="rounded-2xl border border-white/10 overflow-hidden">
                                    <div className="max-h-[240px] overflow-auto">
                                        {items.slice(0, 20).map((it, idx) => {
                                            const isEditing = editingId === it.id
                                            const dateLabel = formatFullWatched(it.watchedAt)

                                            return (
                                                <div
                                                    key={it.id}
                                                    className={`px-3 py-3 flex items-center justify-between gap-3 ${idx !== 0 ? 'border-t border-white/10' : ''
                                                        }`}
                                                >
                                                    {/* Fecha completa + icono */}
                                                    <div className="min-w-0 flex items-center gap-3">
                                                        <div className="w-11 h-11 rounded-2xl border border-white/10 flex items-center justify-center shrink-0">
                                                            <Eye className="w-5 h-5 text-emerald-200" />
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="text-sm font-extrabold text-white truncate">{dateLabel}</div>
                                                            <div className="text-[11px] text-zinc-500 mt-0.5">
                                                                {isEditing ? 'Editando fecha…' : 'Visionado registrado'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Botones */}
                                                    <div className="shrink-0 flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => (isEditing ? stopEdit() : startEdit(it.id, it.watchedAt))}
                                                            className="w-10 h-10 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/15 transition flex items-center justify-center disabled:opacity-70"
                                                            title={isEditing ? 'Cancelar' : 'Editar fecha'}
                                                        >
                                                            <Pencil className="w-4 h-4 text-zinc-200" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => doRemove(it.id)}
                                                            className="w-10 h-10 rounded-xl border border-red-500/25 hover:bg-red-500/10 hover:border-red-500/40 transition flex items-center justify-center disabled:opacity-70"
                                                            title="Quitar este visionado"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-300" />
                                                        </button>
                                                    </div>

                                                    {/* editor inline: debajo de la fila (plano) */}
                                                    {isEditing && (
                                                        <div className="w-full pt-3 mt-3 border-t border-white/10">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={openCalendarForEdit}
                                                                    disabled={busy}
                                                                    className="flex-1 inline-flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2
                                             text-sm text-zinc-200 hover:bg-white/5 hover:border-white/15 transition disabled:opacity-70"
                                                                    title="Seleccionar día"
                                                                >
                                                                    <span className="truncate">{formatYmdHuman(editDate)}</span>
                                                                    <CalendarDays className="w-4 h-4 text-yellow-300 shrink-0" />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditDate(todayYmd())}
                                                                    disabled={busy}
                                                                    className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/15 transition text-sm text-zinc-200 disabled:opacity-70"
                                                                >
                                                                    Hoy
                                                                </button>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={doSaveEdit}
                                                                disabled={busy || !editDate}
                                                                className={`mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-extrabold transition
                                  ${busy || !editDate
                                                                        ? 'bg-emerald-500/25 text-black/40 cursor-not-allowed'
                                                                        : 'bg-emerald-500 text-black hover:brightness-110'
                                                                    }`}
                                                            >
                                                                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                                                                Actualizar fecha
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {busy && (
                            <div className="text-xs text-zinc-400 inline-flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Sincronizando con Trakt…
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Calendario */}
            <CalendarPickerModal
                open={calOpen}
                valueYmd={calTarget === 'edit' ? editDate : newDate}
                onSelect={onPickCalendar}
                onClose={() => setCalOpen(false)}
                title={calTarget === 'edit' ? 'Cambiar día del visionado' : 'Elegir día del visionado'}
            />
        </div>
    )
}
