'use client'

import { useEffect, useMemo } from 'react'
import { X, Plus, Check, Loader2, Search, ListPlus, FileText } from 'lucide-react'

export default function AddToListModal(props) {
    const {
        open = false,
        onClose = () => { },

        lists = [],
        loading = false,
        error = '',

        query = '',
        setQuery = () => { },

        membershipMap = {},
        busyListId = null,
        onAddToList = () => { },

        creating = false,
        createOpen = false,
        setCreateOpen = () => { },

        newName = '',
        setNewName = () => { },
        newDesc = '',
        setNewDesc = () => { },

        onCreateList = () => { },
    } = props || {}

    // Normaliza ID de lista (importante para que membershipMap encaje siempre)
    const getListId = (l) => {
        const id = l?.id ?? l?._id ?? l?.ids?.trakt ?? l?.slug ?? l?.name
        return id != null ? String(id) : null
    }

    // Bloquear scroll del body al abrir
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = prev
        }
    }, [open])

    // Manejo de errores seguro
    const safeError = useMemo(() => {
        const msg =
            typeof error === 'string'
                ? error
                : error && typeof error === 'object' && 'message' in error
                    ? String(error.message)
                    : ''
        if (msg.includes('NEXT_PUBLIC_TMDB_API_KEY')) return ''
        return msg
    }, [error])

    // Filtrado local
    const filtered = useMemo(() => {
        const q = (query || '').trim().toLowerCase()
        const arr = Array.isArray(lists) ? lists : []
        if (!q) return arr
        return arr.filter((l) => (l?.name || '').toLowerCase().includes(q))
    }, [lists, query])

    // ✅ Listas donde YA está añadida (para mostrar arriba del modal)
    const addedLists = useMemo(() => {
        const arr = Array.isArray(lists) ? lists : []
        if (!arr.length) return []
        const map = membershipMap || {}
        return arr.filter((l) => {
            const id = getListId(l)
            return id && !!map[id]
        })
    }, [lists, membershipMap])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-xl flex flex-col max-h-[85vh]
                   rounded-3xl border border-white/10 bg-[#050505]
                   shadow-[0_0_50px_-12px_rgba(255,255,255,0.05)]
                   overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
                            Añadir a una lista
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1 font-medium tracking-wide uppercase">
                            Gestiona tu colección
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="group relative flex h-9 w-9 items-center justify-center rounded-full
                       bg-white/5 border border-white/5 text-zinc-400
                       transition-all hover:bg-white/10 hover:text-white hover:rotate-90"
                        aria-label="Cerrar"
                        title="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {/* ✅ Resumen: ya está en... */}
                    {addedLists.length > 0 && (
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                                Ya está añadida en {addedLists.length} {addedLists.length === 1 ? 'lista' : 'listas'}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                                {addedLists.slice(0, 6).map((l) => {
                                    const id = getListId(l)
                                    return (
                                        <span
                                            key={id || l?.name}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100"
                                            title={l?.name}
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            <span className="max-w-[220px] truncate">{l?.name || 'Lista'}</span>
                                        </span>
                                    )
                                })}
                                {addedLists.length > 6 && (
                                    <span className="text-[11px] font-bold text-emerald-200/80 px-2 py-1">
                                        +{addedLists.length - 6}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Crear lista */}
                    <div className="space-y-3">
                        {!createOpen ? (
                            <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02]
                           text-zinc-400 text-sm font-bold hover:bg-white/[0.05] hover:border-white/20 hover:text-white transition-all group"
                            >
                                <div className="p-1 rounded-md bg-white/5 group-hover:bg-yellow-500 group-hover:text-black transition-colors">
                                    <Plus className="w-4 h-4" />
                                </div>
                                Crear nueva lista
                            </button>
                        ) : (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4 animate-in slide-in-from-top-2 fade-in">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Nueva Lista</span>
                                    <button
                                        type="button"
                                        onClick={() => setCreateOpen(false)}
                                        className="text-xs text-zinc-500 hover:text-white transition"
                                    >
                                        Cancelar
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <input
                                        value={newName ?? ''}
                                        onChange={(e) => setNewName?.(e.target.value)}
                                        placeholder="Nombre de la lista"
                                        maxLength={60}
                                        className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-yellow-500/50 focus:bg-black/60 transition"
                                        autoFocus
                                    />

                                    <input
                                        value={newDesc ?? ''}
                                        onChange={(e) => setNewDesc?.(e.target.value)}
                                        placeholder="Descripción (opcional)"
                                        maxLength={120}
                                        className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-white/20 focus:bg-black/60 transition"
                                    />

                                    <button
                                        type="button"
                                        onClick={onCreateList}
                                        disabled={creating || !String(newName || '').trim()}
                                        className={[
                                            'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all',
                                            creating || !String(newName || '').trim()
                                                ? 'bg-white/5 text-zinc-500 cursor-not-allowed'
                                                : 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)] active:scale-95',
                                        ].join(' ')}
                                    >
                                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                                        Crear lista
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Buscador + listado */}
                    <div className="space-y-4">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-white transition-colors" />
                            <input
                                value={query ?? ''}
                                onChange={(e) => setQuery?.(e.target.value)}
                                placeholder="Buscar en tus listas..."
                                className="w-full rounded-xl bg-black/40 border border-white/10 pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-white/20 focus:bg-black/60 transition"
                            />
                        </div>

                        {!!safeError && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
                                {safeError}
                            </div>
                        )}

                        {loading && (
                            <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500">
                                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                                <span className="text-xs font-medium">Cargando listas...</span>
                            </div>
                        )}

                        {!loading && filtered.length === 0 && (
                            <div className="py-10 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
                                <FileText className="w-8 h-8 text-zinc-700 mb-2" />
                                <p className="text-sm text-zinc-400 font-medium">No se encontraron listas</p>
                                <p className="text-xs text-zinc-600 mt-0.5">Intenta con otro nombre o crea una nueva.</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            {filtered.map((l) => {
                                const id = getListId(l)
                                if (!id) return null

                                const present = !!membershipMap?.[id]
                                const busy = String(busyListId ?? '') === id

                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => (!present && !busy ? onAddToList(id) : undefined)}
                                        disabled={present || busy}
                                        className={[
                                            'group w-full relative overflow-hidden rounded-2xl border p-4 transition-all duration-300',
                                            'flex items-center justify-between gap-4 text-left',
                                            present
                                                ? 'bg-emerald-500/[0.03] border-emerald-500/20 cursor-default'
                                                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10 active:scale-[0.98]',
                                        ].join(' ')}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div
                                                className={[
                                                    'font-bold truncate transition-colors',
                                                    present ? 'text-emerald-100' : 'text-zinc-200 group-hover:text-white',
                                                ].join(' ')}
                                            >
                                                {l?.name || 'Sin nombre'}
                                            </div>

                                            <div className="text-xs text-zinc-500 mt-1 truncate pr-4">
                                                {l?.description || 'Sin descripción'}
                                            </div>

                                            <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/5">
                                                {typeof l?.item_count === 'number' ? `${l.item_count} ITEMS` : '—'}
                                            </div>
                                        </div>

                                        <div className="shrink-0">
                                            <div
                                                className={[
                                                    'w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-300',
                                                    busy
                                                        ? 'bg-white/5 border-white/10'
                                                        : present
                                                            ? 'bg-emerald-500 text-black border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                                                            : 'bg-transparent border-white/10 text-zinc-500 group-hover:border-yellow-500 group-hover:text-yellow-500 group-hover:bg-yellow-500/10',
                                                ].join(' ')}
                                            >
                                                {busy ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
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
