'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Pencil, Trash2, ExternalLink, Loader2 } from 'lucide-react'

const todayYmd = () => new Date().toISOString().slice(0, 10)

const isoToYmd = (iso) => {
    if (!iso) return ''
    return String(iso).slice(0, 10)
}

const pickHistoryId = (h) => h?.id ?? h?.historyId ?? h?.history_id ?? null
const pickWatchedAt = (h) => h?.watched_at ?? h?.watchedAt ?? h?.watchedAtIso ?? null

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

    useEffect(() => {
        if (!open) return
        setNewDate(todayYmd())
        setEditingId(null)
        setEditDate(todayYmd())
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

    return (
        <div className="fixed inset-0 z-[10050]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="text-lg font-extrabold text-white truncate">Trakt · Visto</h3>
                            <p className="text-xs text-zinc-400 mt-1">
                                {Number(plays || 0) > 0 ? `Visto · ${plays} vez${plays === 1 ? '' : 'es'}` : 'Aún no marcado como visto'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="shrink-0 w-10 h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center"
                            title="Cerrar"
                        >
                            <X className="w-5 h-5 text-zinc-200" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-5 space-y-4">
                        {/* Añadir nuevo visionado */}
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-xs font-bold text-zinc-300 mb-2">Añadir nuevo visionado</div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                    className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                />
                                <button
                                    type="button"
                                    onClick={() => setNewDate(todayYmd())}
                                    disabled={busy}
                                    className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm text-zinc-200"
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
                                Añadir visionado
                            </button>

                            {traktUrl && (
                                <a
                                    href={traktUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-xl
                    bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm text-zinc-200"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Abrir en Trakt
                                </a>
                            )}
                        </div>

                        {/* Historial */}
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-bold text-zinc-300">Historial (últimos)</div>
                                <div className="text-[11px] text-zinc-500">{items.length ? `${items.length} registro(s)` : '—'}</div>
                            </div>

                            {!items.length ? (
                                <div className="text-sm text-zinc-400">
                                    Aún no hay entradas en el historial.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
                                    {items.slice(0, 20).map((it) => {
                                        const isEditing = editingId === it.id
                                        const dateLabel = (() => {
                                            try {
                                                return new Date(it.watchedAt).toLocaleDateString('es-ES')
                                            } catch {
                                                return it.watchedAt
                                            }
                                        })()

                                        return (
                                            <div
                                                key={it.id}
                                                className="rounded-xl border border-white/10 bg-black/30 p-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-bold text-white truncate">
                                                            Visto · {dateLabel}
                                                        </div>
                                                        <div className="text-[11px] text-zinc-500 truncate">
                                                            ID: {it.id}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => (isEditing ? stopEdit() : startEdit(it.id, it.watchedAt))}
                                                            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-center"
                                                            title={isEditing ? 'Cancelar' : 'Editar fecha'}
                                                        >
                                                            <Pencil className="w-4 h-4 text-zinc-200" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => doRemove(it.id)}
                                                            className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/25 hover:bg-red-500/15 hover:border-red-500/40 transition flex items-center justify-center"
                                                            title="Quitar este visionado"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-300" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {isEditing && (
                                                    <div className="mt-3 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="date"
                                                                value={editDate}
                                                                onChange={(e) => setEditDate(e.target.value)}
                                                                className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditDate(todayYmd())}
                                                                disabled={busy}
                                                                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm text-zinc-200"
                                                            >
                                                                Hoy
                                                            </button>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={doSaveEdit}
                                                            disabled={busy || !editDate}
                                                            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-extrabold transition
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
        </div>
    )
}
