'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
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
    ArrowLeft,
    Trash2,
    Eraser,
    ListVideo,
    Pencil,
    Check,
    X,
    Search,
    Plus,
    ExternalLink,
    Flame,
    Star,
    Clapperboard,
    CalendarClock,
    ChevronDown
} from 'lucide-react'

function TmdbPoster({ path, alt, className = '' }) {
    const [failed, setFailed] = useState(false)

    if (!path || failed) {
        return (
            <div
                className={`bg-black/40 border border-white/10 flex items-center justify-center text-zinc-500 ${className}`}
            >
                <ListVideo className="w-8 h-8" />
            </div>
        )
    }

    return (
        <img
            src={`https://image.tmdb.org/t/p/w342${path}`}
            alt={alt}
            className={className}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}

function Segmented({ options, value, onChange }) {
    return (
        <div className="inline-flex items-center rounded-full bg-black/30 border border-white/10 p-0.5 backdrop-blur-sm">
            {options.map((opt) => {
                const active = opt.id === value
                const Icon = opt.icon
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        className={`px-3 py-1.5 text-[11px] font-medium rounded-full inline-flex items-center gap-1.5 transition-colors
              ${active ? 'bg-white text-black shadow-sm' : 'text-zinc-200 hover:bg-white/5'}`}
                    >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        <span>{opt.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

const CATS = [
    { id: 'popular', label: 'Popular', icon: Flame },
    { id: 'top_rated', label: 'Top Rated', icon: Star },
    { id: 'now_playing', label: 'Now Playing', icon: Clapperboard },
    { id: 'upcoming', label: 'Upcoming', icon: CalendarClock }
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
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/30 border border-white/10 hover:bg-white/5 transition text-sm text-zinc-200"
                title="Seleccionar catálogo"
            >
                <Icon className="w-4 h-4 text-zinc-300" />
                <span className="font-medium">{current.label}</span>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-neutral-950 border border-white/10 shadow-2xl overflow-hidden z-50">
                    {CATS.map((opt) => {
                        const A = opt.id === value
                        const I = opt.icon
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                    onChange(opt.id)
                                    setOpen(false)
                                }}
                                className={`w-full px-3 py-2.5 text-left inline-flex items-center gap-2 text-sm transition
                  ${A ? 'bg-white/10 text-white' : 'text-zinc-200 hover:bg-white/5'}`}
                            >
                                <I className="w-4 h-4 text-zinc-300" />
                                <span>{opt.label}</span>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default function ListDetailsPage() {
    const params = useParams()
    const router = useRouter()

    const listIdRaw = params?.listId
    const listId = Array.isArray(listIdRaw) ? listIdRaw[0] : listIdRaw

    const { session, account } = useAuth()
    const canUse = useMemo(() => !!session && !!account?.id, [session, account])

    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
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
    const [tab, setTab] = useState('items') // items | add
    const items = Array.isArray(data?.items) ? data.items : []
    const idsInList = useMemo(() => new Set(items.map((x) => x?.id)), [items])

    // Add: search + catalog
    const [addMode, setAddMode] = useState('search') // search | catalog
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
        setErr('')
        setData(null)
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

    // ✅ FIX Guardar: updateUserList (recrea + copia + borra) y navega al nuevo listId
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
                items // pasamos los items ya cargados para copiar sin refetch
            })

            setEditing(false)

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

    if (!canUse) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100">
                <div className="max-w-6xl mx-auto px-4 py-10">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                        <p className="text-sm text-zinc-400">Inicia sesión para ver esta lista.</p>
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

    if (!listId) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100">
                <div className="max-w-6xl mx-auto px-4 py-10">
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
                        No se ha podido leer el <b>listId</b> de la URL.
                        <div className="mt-3">
                            <Link
                                href="/lists"
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Volver
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const tmdbListUrl = `https://www.themoviedb.org/list/${listId}`
    const gridItems = tab === 'items' ? items : addMode === 'search' ? searchRes : catRes

    return (
        <div className="min-h-screen bg-[#101010] text-gray-100">
            <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
                {/* Top bar */}
                <div className="flex items-center justify-between gap-3">
                    <Link
                        href="/lists"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm">Volver</span>
                    </Link>

                    <div className="flex items-center gap-2">
                        <a
                            href={tmdbListUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
                            title="Abrir en TMDb"
                        >
                            <ExternalLink className="w-4 h-4" />
                            TMDb
                        </a>

                        <button
                            type="button"
                            onClick={handleClear}
                            disabled={clearing || items.length === 0}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition text-sm
                ${clearing || items.length === 0
                                    ? 'bg-white/5 border-white/10 text-zinc-500 cursor-not-allowed'
                                    : 'bg-white/5 border-white/10 hover:bg-yellow-500/10 hover:border-yellow-500/40 text-yellow-200'
                                }`}
                            title="Vaciar lista"
                        >
                            {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                            Vaciar
                        </button>

                        <button
                            type="button"
                            onClick={handleDeleteList}
                            disabled={deleting}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition text-sm
                ${deleting
                                    ? 'bg-white/5 border-white/10 text-zinc-500 cursor-not-allowed'
                                    : 'bg-white/5 border-white/10 hover:bg-red-500/15 hover:border-red-500/40 text-zinc-200 hover:text-red-200'
                                }`}
                            title="Eliminar lista"
                        >
                            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Eliminar
                        </button>
                    </div>
                </div>

                {/* Header */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                    {loading && (
                        <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando lista…
                        </div>
                    )}

                    {!loading && data && (
                        <>
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                <div className="min-w-0">
                                    {!editing ? (
                                        <>
                                            <h1 className="text-2xl md:text-3xl font-extrabold text-white truncate">
                                                {data.name}
                                            </h1>
                                            <p className="text-sm text-zinc-400 mt-2">
                                                {data.description || 'Sin descripción'}
                                            </p>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            <input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                                placeholder="Nombre"
                                                maxLength={60}
                                            />
                                            <input
                                                value={editDesc}
                                                onChange={(e) => setEditDesc(e.target.value)}
                                                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                                placeholder="Descripción"
                                                maxLength={120}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {!editing ? (
                                        <button
                                            type="button"
                                            onClick={() => setEditing(true)}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
                                            title="Editar lista"
                                        >
                                            <Pencil className="w-4 h-4" />
                                            Editar
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleSaveEdit}
                                                disabled={savingEdit || !editName.trim()}
                                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border transition text-sm
                          ${savingEdit || !editName.trim()
                                                        ? 'bg-white/5 border-white/10 text-zinc-500 cursor-not-allowed'
                                                        : 'bg-yellow-500 text-black hover:brightness-110'
                                                    }`}
                                            >
                                                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                                Guardar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditing(false)
                                                    setEditName(data?.name || '')
                                                    setEditDesc(data?.description || '')
                                                }}
                                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
                                            >
                                                <X className="w-4 h-4" />
                                                Cancelar
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 text-sm text-zinc-300 flex flex-wrap gap-3">
                                <span className="px-3 py-1 rounded-full bg-black/30 border border-white/10">
                                    {items.length} películas
                                </span>
                                {data.iso_639_1 && (
                                    <span className="px-3 py-1 rounded-full bg-black/30 border border-white/10">
                                        Idioma: {data.iso_639_1}
                                    </span>
                                )}
                            </div>

                            <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <Segmented
                                    value={tab}
                                    onChange={setTab}
                                    options={[
                                        { id: 'items', label: 'Películas', icon: ListVideo },
                                        { id: 'add', label: 'Añadir', icon: Plus }
                                    ]}
                                />

                                {tab === 'add' && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Segmented
                                            value={addMode}
                                            onChange={setAddMode}
                                            options={[
                                                { id: 'search', label: 'Buscar', icon: Search },
                                                { id: 'catalog', label: 'Catálogo', icon: Flame }
                                            ]}
                                        />

                                        {addMode === 'catalog' && (
                                            <CatalogDropdown value={cat} onChange={setCat} />
                                        )}
                                    </div>
                                )}
                            </div>

                            {tab === 'add' && addMode === 'search' && (
                                <div className="mt-4">
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            value={q}
                                            onChange={(e) => setQ(e.target.value)}
                                            placeholder="Busca una película para añadir…"
                                            className="w-full rounded-xl bg-black/40 border border-white/10 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/30"
                                        />
                                    </div>
                                    {searchLoading && (
                                        <div className="mt-3 text-sm text-zinc-400 inline-flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Buscando…
                                        </div>
                                    )}
                                </div>
                            )}

                            {tab === 'add' && addMode === 'catalog' && catLoading && (
                                <div className="mt-4 text-sm text-zinc-400 inline-flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogo…
                                </div>
                            )}
                        </>
                    )}

                    {err && <p className="text-sm text-red-400 mt-3">{err}</p>}
                </div>

                {/* Empty state */}
                {tab === 'items' && !loading && items.length === 0 && (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
                        Esta lista está vacía. Usa la pestaña <b>Añadir</b>.
                    </div>
                )}

                {/* Grid: SOLO portadas + botón circular en hover */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {gridItems.map((it) => {
                        const id = it?.id
                        const inList = idsInList.has(id)
                        const posterPath = it?.poster_path || it?.backdrop_path || null

                        const href =
                            it?.media_type === 'tv'
                                ? `/details/tv/${id}`
                                : `/details/movie/${id}`

                        return (
                            <div
                                key={`${tab}-${addMode}-${id}`}
                                className="group relative rounded-2xl border border-white/10 bg-black/30 overflow-hidden shadow-md hover:shadow-xl hover:border-yellow-500/40 transition"
                            >
                                <Link href={href} className="block">
                                    <div className="relative aspect-[2/3] bg-black/40">
                                        <TmdbPoster
                                            path={posterPath}
                                            alt=""
                                            className="w-full h-full object-cover transform-gpu transition-transform duration-500 group-hover:scale-[1.05]"
                                        />
                                        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                                    </div>
                                </Link>

                                {/* Indicador “ya está” en Añadir */}
                                {tab === 'add' && inList && (
                                    <div className="absolute top-2 left-2 z-20 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-[11px] font-semibold">
                                        ✓
                                    </div>
                                )}

                                {/* Botón circular (hover) */}
                                {tab === 'items' ? (
                                    <button
                                        type="button"
                                        disabled={busyId === id}
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleRemove(id)
                                        }}
                                        title="Quitar"
                                        className={`absolute top-2 right-2 z-20 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur border transition
                      opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                      ${busyId === id
                                                ? 'bg-black/40 border-white/10 text-zinc-400 cursor-not-allowed'
                                                : 'bg-black/65 border-white/15 text-white/90 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-200'
                                            }`}
                                    >
                                        {busyId === id ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-5 h-5" />
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={busyId === id || inList}
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            handleAdd(it)
                                        }}
                                        title={inList ? 'Ya está en la lista' : 'Añadir'}
                                        className={`absolute top-2 right-2 z-20 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur border transition
                      opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                      ${inList
                                                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200 cursor-not-allowed'
                                                : busyId === id
                                                    ? 'bg-black/40 border-white/10 text-zinc-400 cursor-not-allowed'
                                                    : 'bg-black/65 border-white/15 text-white/90 hover:bg-yellow-500/15 hover:border-yellow-500/40 hover:text-yellow-200'
                                            }`}
                                    >
                                        {busyId === id ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : inList ? (
                                            <Check className="w-5 h-5" />
                                        ) : (
                                            <Plus className="w-5 h-5" />
                                        )}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
