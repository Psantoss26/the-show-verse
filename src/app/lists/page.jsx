// src/app/lists/page.jsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import useTmdbLists from '@/lib/hooks/useTmdbLists'
import { getListDetails } from '@/lib/api/tmdbLists'
import {
    Loader2,
    Plus,
    Trash2,
    ListVideo,
    RefreshCcw,
    Search,
    ArrowUpDown
} from 'lucide-react'

function sortLists(lists, mode) {
    const arr = [...lists]
    switch (mode) {
        case 'name_asc':
            return arr.sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
        case 'name_desc':
            return arr.sort((a, b) => (b?.name || '').localeCompare(a?.name || ''))
        case 'items_desc':
            return arr.sort((a, b) => (b?.item_count || 0) - (a?.item_count || 0))
        case 'items_asc':
            return arr.sort((a, b) => (a?.item_count || 0) - (b?.item_count || 0))
        default:
            return arr
    }
}

function TmdbImg({ filePath, size = 'w185', alt, className = '' }) {
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        setFailed(false)
    }, [filePath])

    if (!filePath || failed) return null

    return (
        <img
            src={`https://image.tmdb.org/t/p/${size}${filePath}`}
            alt={alt}
            className={className}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}

/**
 * Collage inteligente:
 * - 1 -> full
 * - 2 -> split vertical
 * - 3 -> 1 grande izquierda + 2 pequeñas derecha
 * - 4 -> grid 2x2
 */
function ListCoverCollage({ posterPaths = [], fallbackPosterPath, alt = '' }) {
    const uniq = []
    const seen = new Set()
    for (const p of posterPaths || []) {
        if (!p || seen.has(p)) continue
        seen.add(p)
        uniq.push(p)
        if (uniq.length >= 4) break
    }

    // Fallback si aún no hemos cargado items: usa el poster_path que trae la lista (si existe)
    const paths = uniq.length ? uniq : (fallbackPosterPath ? [fallbackPosterPath] : [])

    if (!paths.length) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black/40 border border-white/10 text-zinc-500">
                <ListVideo className="w-9 h-9" />
            </div>
        )
    }

    if (paths.length === 1) {
        return (
            <div className="w-full h-full">
                <TmdbImg
                    filePath={paths[0]}
                    size="w342"
                    alt={alt}
                    className="w-full h-full object-cover"
                />
            </div>
        )
    }

    if (paths.length === 2) {
        return (
            <div className="w-full h-full grid grid-cols-2 gap-[2px] bg-black/40">
                <div className="overflow-hidden">
                    <TmdbImg filePath={paths[0]} alt={alt} className="w-full h-full object-cover" />
                </div>
                <div className="overflow-hidden">
                    <TmdbImg filePath={paths[1]} alt={alt} className="w-full h-full object-cover" />
                </div>
            </div>
        )
    }

    if (paths.length === 3) {
        return (
            <div className="w-full h-full grid grid-cols-3 grid-rows-2 gap-[2px] bg-black/40">
                <div className="col-span-2 row-span-2 overflow-hidden">
                    <TmdbImg filePath={paths[0]} alt={alt} className="w-full h-full object-cover" />
                </div>
                <div className="col-span-1 row-span-1 overflow-hidden">
                    <TmdbImg filePath={paths[1]} alt={alt} className="w-full h-full object-cover" />
                </div>
                <div className="col-span-1 row-span-1 overflow-hidden">
                    <TmdbImg filePath={paths[2]} alt={alt} className="w-full h-full object-cover" />
                </div>
            </div>
        )
    }

    // 4
    return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] bg-black/40">
            {paths.slice(0, 4).map((p, i) => (
                <div key={`${p}-${i}`} className="overflow-hidden">
                    <TmdbImg filePath={p} alt={alt} className="w-full h-full object-cover" />
                </div>
            ))}
        </div>
    )
}

export default function ListsPage() {
    const { canUse, lists, loading, error, refresh, loadMore, hasMore, create, del } =
        useTmdbLists()

    const [name, setName] = useState('')
    const [desc, setDesc] = useState('')
    const [creating, setCreating] = useState(false)

    const [query, setQuery] = useState('')
    const [sortMode, setSortMode] = useState('items_desc')

    // Map: listId -> posterPaths[]
    const [coverMap, setCoverMap] = useState({})
    const coverMapRef = useRef(coverMap)
    const inFlight = useRef(new Set())
    const runIdRef = useRef(0)

    useEffect(() => {
        coverMapRef.current = coverMap
    }, [coverMap])

    // Carga “covers” (primeras 4 pelis) para cada lista y poder hacer collage
    useEffect(() => {
        let cancelled = false
        const runId = ++runIdRef.current

        const pickPathsFromItems = (items = []) => {
            const out = []
            const seen = new Set()
            for (const it of items) {
                const p = it?.poster_path || it?.backdrop_path
                if (!p || seen.has(p)) continue
                seen.add(p)
                out.push(p)
                if (out.length >= 4) break
            }
            return out
        }

        const run = async () => {
            if (!Array.isArray(lists) || lists.length === 0) return

            // ✅ ids normalizados a string (evita líos number/string)
            const missing = lists
                .map((l) => String(l?.id || ''))
                .filter((id) => {
                    if (!id) return false
                    if (coverMapRef.current[id] !== undefined) return false // ya tenemos cover (incluso [])
                    if (inFlight.current.has(id)) return false
                    return true
                })

            if (!missing.length) return

            const concurrency = 3
            let idx = 0

            const worker = async () => {
                while (!cancelled && idx < missing.length) {
                    const listId = missing[idx++]
                    inFlight.current.add(listId)

                    try {
                        const json = await getListDetails({ listId, page: 1, language: 'es-ES' })
                        const paths = pickPathsFromItems(Array.isArray(json?.items) ? json.items : [])

                        // ✅ ignora resultados si esta ejecución ya no es la última
                        if (cancelled || runIdRef.current !== runId) continue

                        setCoverMap((prev) => {
                            // si otra ejecución ya lo rellenó mientras tanto, no machacamos
                            if (prev[listId] !== undefined) return prev
                            return { ...prev, [listId]: paths }
                        })
                    } catch {
                        if (cancelled || runIdRef.current !== runId) continue
                        setCoverMap((prev) => {
                            if (prev[listId] !== undefined) return prev
                            return { ...prev, [listId]: [] } // marcamos “sin collage” para no reintentar infinito
                        })
                    } finally {
                        inFlight.current.delete(listId)
                    }
                }
            }

            await Promise.all(
                Array.from({ length: Math.min(concurrency, missing.length) }, worker)
            )
        }

        run()

        return () => {
            cancelled = true
            // ✅ CRÍTICO: evita el bug de StrictMode dejando ids “atascados”
            inFlight.current.clear()
        }
    }, [lists])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = q ? lists.filter((l) => (l?.name || '').toLowerCase().includes(q)) : lists
        return sortLists(base, sortMode)
    }, [lists, query, sortMode])

    const handleCreate = async () => {
        if (!canUse || creating) return
        const n = name.trim()
        if (!n) return
        setCreating(true)
        try {
            await create({ name: n, description: desc.trim() })
            setName('')
            setDesc('')
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (e, listId) => {
        e.preventDefault()
        e.stopPropagation()
        if (!canUse) return
        const ok = window.confirm('¿Seguro que quieres borrar esta lista?')
        if (!ok) return
        await del(listId)
    }

    if (!canUse) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100">
                <div className="max-w-6xl mx-auto px-4 py-10">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <div className="flex items-center gap-3">
                            <ListVideo className="w-5 h-5 text-yellow-500" />
                            <h1 className="text-xl font-bold">Mis Listas</h1>
                        </div>
                        <p className="text-sm text-zinc-400 mt-2">
                            Inicia sesión para ver y gestionar tus listas de TMDb.
                        </p>
                        <Link
                            href="/login"
                            className="inline-flex mt-4 px-4 py-2 rounded-xl bg-yellow-500 text-black font-semibold hover:brightness-110 transition"
                        >
                            Ir a Login
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#101010] text-gray-100">
            <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <ListVideo className="w-6 h-6 text-yellow-500" />
                            <h1 className="text-2xl md:text-3xl font-extrabold">Mis Listas</h1>
                        </div>
                        <p className="text-sm text-zinc-400 mt-2">
                            Crea listas, edítalas y añade películas desde el detalle.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={refresh}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                        title="Refrescar"
                    >
                        <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span className="text-sm">Refrescar</span>
                    </button>
                </div>

                {/* Control Bar (unificada: buscar + ordenar + crear) */}
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1 relative">
                            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar listas…"
                                className="w-full rounded-2xl bg-black/40 border border-white/10 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                            />
                        </div>

                        <div className="inline-flex items-center gap-2 rounded-2xl bg-black/30 border border-white/10 px-3 py-2">
                            <ArrowUpDown className="w-4 h-4 text-zinc-300" />
                            <select
                                value={sortMode}
                                onChange={(e) => setSortMode(e.target.value)}
                                className="bg-transparent text-sm outline-none text-zinc-200"
                            >
                                <option value="items_desc">Más items</option>
                                <option value="items_asc">Menos items</option>
                                <option value="name_asc">Nombre (A-Z)</option>
                                <option value="name_desc">Nombre (Z-A)</option>
                            </select>
                        </div>
                    </div>

                    {/* Crear (mismo bloque, sin sub-secciones con color distinto) */}
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <div className="flex items-center gap-2 mb-3">
                            <Plus className="w-5 h-5 text-emerald-400" />
                            <h2 className="text-base md:text-lg font-bold">Crear nueva lista</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nombre (obligatorio)"
                                className="md:col-span-1 w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                maxLength={60}
                            />
                            <input
                                value={desc}
                                onChange={(e) => setDesc(e.target.value)}
                                placeholder="Descripción (opcional)"
                                className="md:col-span-2 w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                maxLength={120}
                            />
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={creating || !name.trim()}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl font-semibold transition
                  ${creating || !name.trim()
                                        ? 'bg-yellow-500/40 text-black/60 cursor-not-allowed'
                                        : 'bg-yellow-500 text-black hover:brightness-110'
                                    }`}
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Crear
                            </button>

                            {error && <span className="text-sm text-red-400">{error}</span>}
                        </div>
                    </div>
                </div>

                {/* Listado */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold">Tus listas</h2>
                        {loading && (
                            <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                            </div>
                        )}
                    </div>

                    {!loading && filtered.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
                            No hay listas que coincidan.
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {filtered.map((l) => {
                            const posters = coverMap[String(l.id)] || []
                            return (
                                <div
                                    key={l.id}
                                    className="group relative rounded-3xl border border-white/10 bg-black/30 overflow-hidden shadow-md hover:shadow-xl hover:border-yellow-500/40 transition"
                                >
                                    {/* Toda la tarjeta clicable */}
                                    <Link href={`/lists/${l.id}`} className="flex gap-4 p-3 sm:p-4">
                                        {/* Cover más grande + collage */}
                                        <div className="shrink-0 w-[138px] h-[184px] sm:w-[160px] sm:h-[225px] rounded-2xl overflow-hidden bg-black/40 border border-white/10">
                                            <ListCoverCollage
                                                posterPaths={posters}
                                                fallbackPosterPath={l.poster_path}
                                                alt={l.name}
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1 flex flex-col py-1">
                                            <h3 className="text-lg font-bold text-white truncate">{l.name}</h3>
                                            <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
                                                {l.description || 'Sin descripción'}
                                            </p>

                                            <div className="mt-auto pt-4 flex items-center justify-between">
                                                <span className="text-xs text-zinc-400">
                                                    {typeof l.item_count === 'number' ? `${l.item_count} items` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>

                                    {/* Delete (fuera de la navegación) */}
                                    <button
                                        type="button"
                                        onClick={(e) => handleDelete(e, l.id)}
                                        className="absolute top-3 right-3 p-2 rounded-2xl bg-white/5 border border-white/10 hover:bg-red-500/15 hover:border-red-500/40 text-zinc-300 hover:text-red-200 transition"
                                        title="Borrar lista"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>

                                    <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent opacity-0 group-hover:opacity-100 transition" />
                                </div>
                            )
                        })}
                    </div>

                    {hasMore && (
                        <div className="flex justify-center pt-2">
                            <button
                                type="button"
                                onClick={loadMore}
                                disabled={loading}
                                className={`px-4 py-2 rounded-2xl border transition text-sm font-semibold
                  ${loading
                                        ? 'bg-white/5 border-white/10 text-zinc-500 cursor-not-allowed'
                                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-zinc-200'
                                    }`}
                            >
                                {loading ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
                                    </span>
                                ) : (
                                    'Cargar más'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
