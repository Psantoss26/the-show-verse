// src/components/details/AddToListModal.jsx
'use client'

import { useEffect } from 'react'
import { X, Plus, Check, Loader2, Search } from 'lucide-react'

export default function AddToListModal({
    open,
    onClose,
    lists,
    loading,
    error,
    query,
    setQuery,
    membershipMap,
    busyListId,
    onAddToList,
    creating,
    createOpen,
    setCreateOpen,
    newName,
    setNewName,
    newDesc,
    setNewDesc,
    onCreateList
}) {
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [open])

    if (!open) return null

    const filtered = (lists || []).filter((l) => {
        const q = (query || '').trim().toLowerCase()
        if (!q) return true
        return (l?.name || '').toLowerCase().includes(q)
    })

    return (
        <div className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden">
                    <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-extrabold text-white">Añadir a lista</h3>
                            <p className="text-sm text-zinc-400 mt-1">
                                Selecciona una lista existente o crea una nueva.
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

                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setCreateOpen((v) => !v)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Crear nueva lista
                            </button>
                        </div>

                        {createOpen && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="Nombre (obligatorio)"
                                        maxLength={60}
                                        className="md:col-span-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                    />
                                    <input
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        placeholder="Descripción (opcional)"
                                        maxLength={120}
                                        className="md:col-span-2 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={onCreateList}
                                        disabled={creating || !newName.trim()}
                                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition
                      ${creating || !newName.trim()
                                                ? 'bg-yellow-500/40 text-black/60 cursor-not-allowed'
                                                : 'bg-yellow-500 text-black hover:brightness-110'
                                            }`}
                                    >
                                        {creating ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        Crear y añadir
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setCreateOpen(false)}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="relative">
                            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar listas…"
                                className="w-full rounded-xl bg-black/40 border border-white/10 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                            />
                        </div>

                        {loading && (
                            <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando listas…
                            </div>
                        )}

                        {!!error && <div className="text-sm text-red-400">{error}</div>}

                        {!loading && filtered.length === 0 && (
                            <div className="text-sm text-zinc-400 rounded-xl border border-white/10 bg-white/5 p-4">
                                No hay listas que coincidan.
                            </div>
                        )}

                        <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                            {filtered.map((l) => {
                                const present = !!membershipMap?.[l.id]
                                const busy = busyListId === l.id

                                return (
                                    <button
                                        key={l.id}
                                        type="button"
                                        onClick={() => (!present && !busy ? onAddToList(l.id) : undefined)}
                                        className={`w-full text-left rounded-2xl border transition p-4 flex items-center justify-between gap-3
                      ${present
                                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                                : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-yellow-500/30'
                                            }`}
                                        disabled={present || busy}
                                        title={present ? 'Ya está en la lista' : 'Añadir a esta lista'}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-bold text-white truncate">{l.name}</div>
                                            <div className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                                {l.description || 'Sin descripción'}
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-2">
                                                {typeof l.item_count === 'number' ? `${l.item_count} items` : '—'}
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            <div
                                                className={`w-11 h-11 rounded-full border flex items-center justify-center transition
                          ${present
                                                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                                                        : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-yellow-500/10 hover:border-yellow-500/40 hover:text-yellow-200'
                                                    }`}
                                            >
                                                {busy ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : present ? (
                                                    <Check className="w-5 h-5" />
                                                ) : (
                                                    <Plus className="w-5 h-5" />
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
