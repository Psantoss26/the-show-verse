// /src/app/lists/[listId]/page.jsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { AnimatePresence, motion } from 'framer-motion'

import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'

import {
    getListDetails,
    removeMovieFromList,
    clearList,
    deleteUserList,
    updateUserList,
    addMovieToList,
    searchMovies,
    fetchMovieCatalogList
} from '@/lib/api/tmdbLists'

import {
    Loader2,
    Trash2,
    Eraser,
    ListVideo,
    Pencil,
    Check,
    Search,
    Plus,
    ExternalLink,
    Flame,
    Star,
    Clapperboard,
    CalendarClock,
    ChevronDown,
    Save
} from 'lucide-react'

// --- COMPONENTES UI ---

function TmdbPoster({ path, alt, className = '' }) {
    const [failed, setFailed] = useState(false)

    if (!path || failed) {
        return (
            <div className={`bg-zinc-900 flex items-center justify-center text-zinc-700 ${className}`}>
                <ListVideo className="w-8 h-8 opacity-50" />
            </div>
        )
    }

    return (
        <img
            src={`https://image.tmdb.org/t/p/w500${path}`}
            alt={alt}
            className={className}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}

function Segmented({ options, value, onChange }) {
    return (
        <div className="flex items-center rounded-xl bg-zinc-900 border border-zinc-800 p-1 w-full">
            {options.map((opt) => {
                const active = opt.id === value
                const Icon = opt.icon
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        className={`flex-1 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg inline-flex items-center justify-center gap-2 transition-all
              ${active ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
                    >
                        {Icon && <Icon className="w-4 h-4" />}
                        <span>{opt.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

const CATS = [
    { id: 'popular', label: 'Popular', icon: Flame },
    { id: 'top_rated', label: 'Mejor Valoradas', icon: Star },
    { id: 'now_playing', label: 'En Cartelera', icon: Clapperboard },
    { id: 'upcoming', label: 'Próximamente', icon: CalendarClock }
]

function CatalogDropdown({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef(null)
    const current = CATS.find((c) => c.id === value) || CATS[0]
    const Icon = current.icon

    useEffect(() => {
        const onDown = (e) => {
            if (!wrapRef.current) return
            if (!wrapRef.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [])

    return (
        <div ref={wrapRef} className="relative z-[60] w-full">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full h-10 inline-flex items-center justify-between px-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-200 shadow-sm"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">Ver:</span>
                    <div className="w-[1px] h-3 bg-zinc-700 mx-1" />
                    <Icon className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="font-medium truncate">{current.label}</span>
                </div>
                <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 left-0 top-full mt-2 p-1 rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl shadow-black z-[100] overflow-hidden origin-top"
                    >
                        <div className="flex flex-col gap-0.5">
                            {CATS.map((opt) => {
                                const active = opt.id === value
                                const I = opt.icon
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                            onChange(opt.id)
                                            setOpen(false)
                                        }}
                                        className={`w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm transition flex items-center gap-2
                      ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
                                    >
                                        <I className={`w-4 h-4 ${active ? 'text-purple-400' : 'text-zinc-500'}`} />
                                        <span>{opt.label}</span>
                                        {active && <Check className="w-3 h-3 text-purple-500 ml-auto" />}
                                    </button>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// --- PÁGINA PRINCIPAL ---

export default function ListDetailsPage() {
    const params = useParams()
    const router = useRouter()

    const listIdRaw = params?.listId
    const listId = Array.isArray(listIdRaw) ? listIdRaw[0] : listIdRaw

    const { session, account } = useAuth()
    const canUse = useMemo(() => !!session && !!account?.id, [session, account])

    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState('')
    const [busyId, setBusyId] = useState(null)
    const [clearing, setClearing] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // Edit
    const [editing, setEditing] = useState(false)
    const [editName, setEditName] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)

    // Tabs
    const [tab, setTab] = useState('items')
    const items = Array.isArray(data?.items) ? data.items : []
    const idsInList = useMemo(() => new Set(items.map((x) => x?.id)), [items])

    // Add: search + catalog
    const [addMode, setAddMode] = useState('search')
    const [q, setQ] = useState('')
    const [searchLoading, setSearchLoading] = useState(false)
    const [searchRes, setSearchRes] = useState([])

    const [cat, setCat] = useState('popular')
    const [catLoading, setCatLoading] = useState(false)
    const [catRes, setCatRes] = useState([])

    const debounceRef = useRef(null)

    const load = async () => {
        if (!listId) return
        setLoading(true)
        setErr('')
        try {
            const json = await getListDetails({ listId, page: 1, language: 'es-ES', sessionId: session })
            setData(json)
            setEditName(json?.name || '')
            setEditDesc(json?.description || '')
        } catch (e) {
            setErr(e?.message || 'Error cargando lista')
            setData(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!listId) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listId])

    // Search debounce
    useEffect(() => {
        if (tab !== 'add' || addMode !== 'search') return

        if (debounceRef.current) clearTimeout(debounceRef.current)
        const query = q.trim()
        if (!query) {
            setSearchRes([])
            setSearchLoading(false)
            return
        }

        debounceRef.current = setTimeout(async () => {
            setSearchLoading(true)
            try {
                const json = await searchMovies({ query, page: 1, language: 'es-ES' })
                setSearchRes(Array.isArray(json?.results) ? json.results : [])
            } catch (e) {
                setErr(e?.message || 'Error buscando películas')
            } finally {
                setSearchLoading(false)
            }
        }, 300)

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [q, tab, addMode])

    // Catalog load
    useEffect(() => {
        if (tab !== 'add' || addMode !== 'catalog') return
        let ignore = false

        const run = async () => {
            setCatLoading(true)
            try {
                const json = await fetchMovieCatalogList({
                    category: cat,
                    page: 1,
                    language: 'es-ES',
                    region: 'ES'
                })
                if (!ignore) setCatRes(Array.isArray(json?.results) ? json.results : [])
            } catch (e) {
                if (!ignore) setErr(e?.message || 'Error cargando catálogo')
            } finally {
                if (!ignore) setCatLoading(false)
            }
        }

        run()
        return () => {
            ignore = true
        }
    }, [cat, tab, addMode])

    const handleRemove = async (movieId) => {
        if (!canUse || !listId) return
        setBusyId(movieId)
        setErr('')
        try {
            await removeMovieFromList({ listId, sessionId: session, movieId })
            setData((prev) => {
                if (!prev) return prev
                const nextItems = (prev.items || []).filter((x) => x?.id !== movieId)
                return {
                    ...prev,
                    items: nextItems,
                    item_count: Math.max(0, (prev.item_count || nextItems.length) - 1)
                }
            })
        } catch (e) {
            setErr(e?.message || 'Error quitando película')
            await load()
        } finally {
            setBusyId(null)
        }
    }

    const handleAdd = async (movie) => {
        if (!canUse || !listId) return
        if (!movie?.id) return
        if (idsInList.has(movie.id)) return

        setBusyId(movie.id)
        setErr('')
        try {
            await addMovieToList({ listId, sessionId: session, movieId: movie.id })
            setData((prev) => {
                if (!prev) return prev
                const nextItems = [{ ...movie, media_type: 'movie' }, ...(prev.items || [])]
                return { ...prev, items: nextItems, item_count: (prev.item_count || 0) + 1 }
            })
        } catch (e) {
            setErr(e?.message || 'Error añadiendo película')
            await load()
        } finally {
            setBusyId(null)
        }
    }

    const handleClear = async () => {
        if (!canUse || !listId) return
        const ok = window.confirm('¿Vaciar la lista por completo?')
        if (!ok) return
        setClearing(true)
        setErr('')
        try {
            await clearList({ listId, sessionId: session, confirm: true })
            await load()
        } catch (e) {
            setErr(e?.message || 'Error vaciando lista')
        } finally {
            setClearing(false)
        }
    }

    const handleDeleteList = async () => {
        if (!canUse || !listId) return
        const ok = window.confirm('¿Borrar la lista definitivamente?')
        if (!ok) return
        setDeleting(true)
        setErr('')
        try {
            await deleteUserList({ listId, sessionId: session })
            router.push('/lists')
        } catch (e) {
            setErr(e?.message || 'Error borrando lista')
        } finally {
            setDeleting(false)
        }
    }

    const handleSaveEdit = async () => {
        if (!canUse || !listId) return
        const n = editName.trim()
        if (!n) return

        setSavingEdit(true)
        setErr('')
        try {
            const res = await updateUserList({
                listId,
                sessionId: session,
                name: n,
                description: editDesc,
                language: data?.iso_639_1 || 'es',
                items
            })

            setEditing(false)

            // Si tu update recrea lista y cambia el id
            if (res?.recreated && res?.listId && String(res.listId) !== String(listId)) {
                router.replace(`/lists/${res.listId}`)
                return
            }

            await load()
        } catch (e) {
            setErr(e?.message || 'Error guardando cambios')
        } finally {
            setSavingEdit(false)
        }
    }

    // Si no hay sesión, no renderizamos (como ya hacías)
    if (!canUse) return null

    // Loading inicial
    if (loading && !data) {
        return (
            <div className="min-h-screen bg-[#101010] flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
            </div>
        )
    }

    const tmdbListUrl = `https://www.themoviedb.org/list/${listId}`
    const gridItems = tab === 'items' ? items : addMode === 'search' ? searchRes : catRes

    return (
        <UnifiedListDetailsLayout
            title={!editing ? (data?.name || 'Lista') : editName}
            description={!editing ? (data?.description || '') : editDesc}
            badges={[`${items.length} Items`]}
            backHref="/lists"
            rightActions={
                <>
                    <button
                        onClick={() => setEditing(true)}
                        disabled={editing}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition disabled:opacity-50"
                        title="Editar detalles"
                    >
                        <Pencil className="w-5 h-5" />
                    </button>

                    <a
                        href={tmdbListUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-blue-400 hover:border-blue-500/50 transition"
                        title="Abrir en TMDb"
                    >
                        <ExternalLink className="w-5 h-5" />
                    </a>

                    <button
                        onClick={handleClear}
                        disabled={clearing || items.length === 0}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-yellow-400 hover:border-yellow-500/50 transition disabled:opacity-50"
                        title="Vaciar lista"
                    >
                        {clearing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eraser className="w-5 h-5" />}
                    </button>

                    <button
                        onClick={handleDeleteList}
                        disabled={deleting}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/50 transition disabled:opacity-50"
                        title="Borrar lista"
                    >
                        {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                    </button>
                </>
            }
            tabs={[
                { id: 'items', label: 'Películas', icon: ListVideo },
                { id: 'add', label: 'Añadir', icon: Plus }
            ]}
            activeTab={tab}
            onTabChange={(next) => {
                setTab(next)
                // Si cambias a items, cierra edición rápida si quieres:
                // if (next === 'items') setEditing(false)
            }}
            topControls={
                tab === 'add' ? (
                    <div className="space-y-3">
                        <Segmented
                            value={addMode}
                            onChange={setAddMode}
                            options={[
                                { id: 'search', label: 'Buscar', icon: Search },
                                { id: 'catalog', label: 'Catálogo', icon: Flame }
                            ]}
                        />

                        {addMode === 'search' ? (
                            <div className="relative w-full">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Buscar película..."
                                    className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 text-sm text-white focus:outline-none focus:border-purple-500 transition placeholder:text-zinc-600"
                                    autoFocus
                                />
                                {searchLoading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full relative">
                                {catLoading && (
                                    <div className="absolute right-10 top-1/2 -translate-y-1/2 z-[70]">
                                        <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                                    </div>
                                )}
                                <CatalogDropdown value={cat} onChange={setCat} />
                            </div>
                        )}
                    </div>
                ) : (
                    // En tab items mostramos el editor inline (igual que antes, pero ya dentro del layout unificado)
                    editing ? (
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-lg font-bold text-white focus:border-purple-500 outline-none transition"
                                    placeholder="Nombre"
                                    maxLength={60}
                                    autoFocus
                                />
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    className="w-full h-24 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:border-purple-500 outline-none transition resize-none"
                                    placeholder="Descripción"
                                    maxLength={200}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={savingEdit || !editName.trim()}
                                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar
                                </button>

                                <button
                                    onClick={() => {
                                        setEditing(false)
                                        setEditName(data?.name || '')
                                        setEditDesc(data?.description || '')
                                    }}
                                    className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    ) : null
                )
            }
        >
            {/* Error */}
            {err ? (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm font-medium flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {err}
                </div>
            ) : null}

            {/* Empty / Grid */}
            {tab === 'items' && items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
                    <ListVideo className="w-12 h-12 text-zinc-700 mb-4" />
                    <h3 className="text-lg font-bold text-zinc-300">Lista vacía</h3>
                    <p className="text-zinc-500 mt-1 text-sm">
                        Usa la pestaña <b>Añadir</b> para agregar películas.
                    </p>
                </div>
            ) : (
                <div className="relative z-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {gridItems.map((it) => {
                        const id = it?.id
                        const inList = idsInList.has(id)
                        const posterPath = it?.poster_path || it?.backdrop_path || null
                        const href = `/details/${it?.media_type || 'movie'}/${id}`

                        return (
                            <div key={`${tab}-${addMode}-${id}`} className="group relative">
                                <Link
                                    href={href}
                                    className="block relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 shadow-lg ring-1 ring-white/5 transition-all duration-500 group-hover:shadow-[0_0_25px_rgba(255,255,255,0.08)] group-hover:scale-[1.03] z-0 group-hover:z-10"
                                >
                                    <TmdbPoster
                                        path={posterPath}
                                        alt={it?.title || it?.name || 'Poster'}
                                        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                        <p className="text-white font-bold text-xs sm:text-sm line-clamp-2 leading-tight drop-shadow-md">
                                            {it?.title || it?.name}
                                        </p>
                                    </div>
                                </Link>

                                {tab === 'add' && inList && (
                                    <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold shadow-lg backdrop-blur-sm flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Añadido
                                    </div>
                                )}

                                <button
                                    type="button"
                                    disabled={busyId === id || (tab === 'add' && inList)}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        if (tab === 'items') handleRemove(id)
                                        else handleAdd(it)
                                    }}
                                    className={`absolute top-2 right-2 z-20 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all shadow-lg
                    ${tab === 'items'
                                            ? 'bg-black/60 border-white/10 text-zinc-400 hover:bg-red-500 hover:border-red-400 hover:text-white opacity-0 group-hover:opacity-100'
                                            : inList
                                                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500 cursor-default opacity-0'
                                                : 'bg-black/60 border-white/10 text-white hover:bg-purple-600 hover:border-purple-500 hover:scale-110 opacity-100'
                                        }
                    ${busyId === id ? 'opacity-100 cursor-wait' : ''}`}
                                >
                                    {busyId === id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : tab === 'items' ? (
                                        <Trash2 className="w-4 h-4" />
                                    ) : (
                                        <Plus className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </UnifiedListDetailsLayout>
    )
}