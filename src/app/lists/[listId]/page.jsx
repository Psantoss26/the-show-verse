// /src/app/lists/[listId]/page.jsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { AnimatePresence, motion } from 'framer-motion'

import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import ListPosterCard, { listPosterGridClass } from '@/components/lists/ListPosterCard'
import FilterableListItems from '@/components/lists/ListDetailsTools'
import { formatPageTitle } from '@/lib/pageTitle'

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
        <div className="flex w-full items-center rounded-xl bg-gradient-to-br from-white/10 to-white/5 p-1 shadow-lg backdrop-blur-lg">
            {options.map((opt) => {
                const active = opt.id === value
                const Icon = opt.icon
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        className={`flex-1 px-4 py-2 text-xs sm:text-sm font-bold rounded-lg inline-flex items-center justify-center gap-2 transition-all
              ${active ? 'bg-white/15 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
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

const TMDB_LIST_DETAILS_CACHE_TTL_MS = 20 * 60 * 1000

function getTmdbListDetailsCacheKey(listId) {
    return listId ? `showverse:list-details:tmdb:${listId}:v1` : null
}

function readTmdbListDetailsCache(listId) {
    const key = getTmdbListDetailsCacheKey(listId)
    if (!key || typeof window === 'undefined') return null
    try {
        const raw = window.sessionStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (Date.now() - Number(parsed?.t || 0) > TMDB_LIST_DETAILS_CACHE_TTL_MS) return null
        return parsed?.data || null
    } catch {
        return null
    }
}

function writeTmdbListDetailsCache(listId, data) {
    const key = getTmdbListDetailsCacheKey(listId)
    if (!key || typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }))
    } catch {
        // ignore
    }
}

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
                className="inline-flex h-10 w-full items-center justify-between rounded-xl bg-gradient-to-br from-white/10 to-white/5 px-3 text-sm text-zinc-200 shadow-lg backdrop-blur-lg transition hover:from-white/15 hover:to-white/10 hover:text-white"
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
                        className="absolute left-0 right-0 top-full z-[100] mt-2 origin-top overflow-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 p-2 shadow-2xl shadow-black backdrop-blur-2xl"
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
                      ${active ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}
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

    const [data, setData] = useState(() => readTmdbListDetailsCache(listId))
    const [loading, setLoading] = useState(() => !readTmdbListDetailsCache(listId))
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
    const filterableItems = useMemo(
        () => items.map((item) => ({ ...item, media_type: item?.media_type || 'movie' })),
        [items]
    )

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
        const cached = readTmdbListDetailsCache(listId)
        if (cached) {
            setData(cached)
            setEditName(cached?.name || '')
            setEditDesc(cached?.description || '')
        }
        setLoading(!cached)
        setErr('')
        try {
            const json = await getListDetails({ listId, page: 1, language: 'es-ES', sessionId: session })
            writeTmdbListDetailsCache(listId, json)
            setData(json)
            setEditName(json?.name || '')
            setEditDesc(json?.description || '')
        } catch (e) {
            setErr(e?.message || 'Error cargando lista')
            if (!cached) setData(null)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!listId) return
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listId])

    useEffect(() => {
        document.title = formatPageTitle(data?.name || 'Lista')
    }, [data?.name])

    useEffect(() => {
        if (typeof window === 'undefined') return
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
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
                const next = {
                    ...prev,
                    items: nextItems,
                    item_count: Math.max(0, (prev.item_count || nextItems.length) - 1)
                }
                writeTmdbListDetailsCache(listId, next)
                return next
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
                const next = { ...prev, items: nextItems, item_count: (prev.item_count || 0) + 1 }
                writeTmdbListDetailsCache(listId, next)
                return next
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
    if (loading && !data) return null

    const tmdbListUrl = `https://www.themoviedb.org/list/${listId}`
    const gridItems = tab === 'items' ? items : addMode === 'search' ? searchRes : catRes
    const coverItem = items.find((item) => item?.poster_path || item?.backdrop_path) || gridItems.find((item) => item?.poster_path || item?.backdrop_path)
    const coverPath = coverItem?.poster_path || coverItem?.backdrop_path || null
    const backdropPath = coverItem?.backdrop_path || coverItem?.poster_path || null

    return (
        <UnifiedListDetailsLayout
            title={!editing ? (data?.name || 'Lista') : editName}
            description={!editing ? (data?.description || '') : editDesc}
            sourceLabel="Lista de TMDb"
            posterImage={coverPath ? `https://image.tmdb.org/t/p/w500${coverPath}` : null}
            backdropImage={backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : null}
            badges={data ? [`${items.length} items`, 'TMDb'] : ['TMDb']}
            stats={[
                { label: 'Elementos', value: items.length },
                { label: 'Fuente', value: 'TMDb' },
                { label: 'Modo', value: tab === 'items' ? 'Lista' : 'Añadir' },
            ]}
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
                                    className="h-10 w-full rounded-xl bg-gradient-to-br from-white/10 to-white/5 pl-9 pr-4 text-sm text-white shadow-lg backdrop-blur-lg transition placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
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
                                    className="h-12 w-full rounded-xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/30 px-4 text-lg font-bold text-white shadow-lg backdrop-blur-[28px] outline-none transition focus:bg-white/10"
                                    placeholder="Nombre"
                                    maxLength={60}
                                    autoFocus
                                />
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    className="h-24 w-full resize-none rounded-xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/30 px-4 py-3 text-sm text-zinc-300 shadow-lg backdrop-blur-[28px] outline-none transition focus:bg-white/10"
                                    placeholder="Descripción"
                                    maxLength={200}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={savingEdit || !editName.trim()}
                                    className="flex items-center gap-2 rounded-full bg-purple-500/25 px-6 py-2.5 font-bold text-purple-100 shadow-lg backdrop-blur-[28px] transition hover:bg-purple-500/35 disabled:opacity-50"
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
                                    className="rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/30 px-6 py-2.5 font-bold text-white shadow-lg backdrop-blur-[28px] transition hover:bg-white/10"
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
                <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-500/10 p-4 text-sm font-medium text-red-200 shadow-lg backdrop-blur-[28px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {err}
                </div>
            ) : null}

            {/* Empty / Filtros / Grid */}
            {tab === 'items' && items.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center rounded-3xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 py-20 text-center shadow-none backdrop-blur-[28px]">
                    <ListVideo className="w-12 h-12 text-zinc-700 mb-4" />
                    <h3 className="text-lg font-bold text-zinc-300">Lista vacía</h3>
                    <p className="text-zinc-500 mt-1 text-sm">
                        Usa la pestaña <b>Añadir</b> para agregar películas.
                    </p>
                </div>
            ) : tab === 'items' && items.length > 0 ? (
                <FilterableListItems
                    items={filterableItems}
                    renderCard={(it, meta, viewMode) => {
                        const id = it?.id
                        const posterPath = it?.poster_path || it?.backdrop_path || null
                        const mediaType = it?.media_type || 'movie'
                        const title = it?.title || it?.name || 'Poster'
                        const year = (it?.release_date || it?.first_air_date || '').slice(0, 4)

                        return (
                            <div key={`items-${id}`} className="group relative">
                                <ListPosterCard
                                    href={`/details/${mediaType}/${id}`}
                                    title={title}
                                    year={year}
                                    mediaType={mediaType}
                                    posterPath={posterPath}
                                    voteAverage={it?.vote_average}
                                    disableHover={viewMode === 'compact'}
                                />
                                <button
                                    type="button"
                                    disabled={busyId === id}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleRemove(id)
                                    }}
                                    className={`absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/40 text-zinc-300 shadow-lg backdrop-blur-[28px] transition-all hover:bg-red-500/70 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 ${busyId === id ? 'opacity-100 cursor-wait' : ''}`}
                                >
                                    {busyId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                            </div>
                        )
                    }}
                    emptyTitle="Sin resultados"
                    emptyText="No hay títulos que coincidan con los filtros."
                />
            ) : tab === 'add' ? (
                <div className={listPosterGridClass}>
                    {gridItems.map((it) => {
                        const id = it?.id
                        const inList = idsInList.has(id)
                        const posterPath = it?.poster_path || it?.backdrop_path || null
                        const href = `/details/${it?.media_type || 'movie'}/${id}`
                        const mediaType = it?.media_type || 'movie'
                        const title = it?.title || it?.name || 'Poster'
                        const year = (it?.release_date || it?.first_air_date || '').slice(0, 4)

                        return (
                            <div key={`${tab}-${addMode}-${id}`} className="relative">
                                <ListPosterCard
                                    href={href}
                                    title={title}
                                    year={year}
                                    mediaType={mediaType}
                                    posterPath={posterPath}
                                    voteAverage={it?.vote_average}
                                />
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
                                    className={`absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full shadow-lg backdrop-blur-[28px] transition-all
                    ${tab === 'items'
                                            ? 'bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/40 text-zinc-300 hover:bg-red-500/70 hover:text-white opacity-0 group-hover:opacity-100'
                                            : inList
                                                ? 'bg-emerald-500/20 text-emerald-300 cursor-default opacity-0'
                                                : 'bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/40 text-white hover:bg-purple-600/70 hover:scale-110 opacity-100'
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
            ) : null}
        </UnifiedListDetailsLayout>
    )
}
