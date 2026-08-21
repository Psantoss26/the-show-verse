// /src/app/lists/[listId]/page.jsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { AnimatePresence, motion } from 'framer-motion'

import UnifiedListDetailsLayout from '@/components/lists/UnifiedListDetailsLayout'
import ListDetailsActionRow from '@/components/lists/ListDetailsActionRow'
import ListPosterCard, { listPosterGridClass } from '@/components/lists/ListPosterCard'
import FilterableListItems from '@/components/lists/ListDetailsTools'
import LiquidGlassOpticalLayers from '@/components/ui/LiquidGlassOpticalLayers'
import { LIQUID_GLASS_CARD, LIQUID_GLASS_PANEL } from '@/lib/ui/liquidGlass'
import { formatPageTitle } from '@/lib/pageTitle'
import {
    resolveBackNavigationDetailsSnapshot,
    shouldRenderCachedListDuringAuthHydration,
} from '@/lib/lists/detailsInitialState'
import { useIsHistoryNavigation } from '@/lib/hooks/useIsHistoryNavigation'
import { ratingSummaryBadge, summarizeListRatings } from '@/lib/lists/ratingSummary'
import useListImdbRatings from '@/hooks/useListImdbRatings'

import {
    getListDetails,
    removeMovieFromList,
    clearList,
    deleteUserList,
    updateUserList,
    addMovieToList,
    searchTitles,
    fetchMovieCatalogList
} from '@/lib/api/backendLists'

import {
    Loader2,
    Trash2,
    Eraser,
    ListVideo,
    Check,
    Search,
    Plus,
    Flame,
    Star,
    Clapperboard,
    CalendarClock,
    ChevronDown,
    Save,
    Globe2,
    LockKeyhole,
    MonitorPlay,
    X
} from 'lucide-react'

// --- COMPONENTES UI ---

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

function ListActionDialog({ open, onClose, title, children }) {
    const dialogRef = useRef(null)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return

        if (open && !dialog.open) dialog.showModal()
        if (!open && dialog.open) dialog.close()
    }, [open])

    return (
        <dialog
            ref={dialogRef}
            aria-label={title}
            closedby="any"
            onClose={onClose}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
            className="m-auto w-[calc(100%-2rem)] max-w-3xl overflow-visible border-0 bg-transparent p-0 text-zinc-100 shadow-none backdrop:bg-black/60 backdrop:backdrop-blur-lg"
        >
            <div className={`relative isolate max-h-[85vh] overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL}`}>
                <LiquidGlassOpticalLayers />

                <div className="relative z-10 flex items-start justify-between gap-4 border-b border-white/[0.08] bg-white/[0.025] px-5 py-5 sm:px-7 sm:py-6">
                    <div className="min-w-0">
                        <h2 className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 sm:text-2xl">
                            {title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[6px] transition hover:-translate-y-0.5 hover:bg-white/[0.1] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                        aria-label="Cerrar"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="relative z-10 px-5 pb-5 sm:px-7 sm:pb-7">
                    {children}
                </div>
            </div>
        </dialog>
    )
}

function DialogButton({ children, tone = 'neutral', ...props }) {
    const toneClass = {
        neutral: 'text-zinc-100 hover:brightness-110',
        primary: 'text-violet-100 hover:text-white',
        warning: 'text-amber-100 hover:text-amber-50',
        danger: 'text-red-100 hover:text-white',
    }[tone] || 'text-zinc-100'

    return (
        <button
            type="button"
            className={`relative isolate inline-flex min-h-11 items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-bold transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-purple-400/70 disabled:cursor-not-allowed disabled:opacity-50 ${LIQUID_GLASS_CARD} ${toneClass}`}
            {...props}
        >
            <LiquidGlassOpticalLayers />
            <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
        </button>
    )
}

// --- PÁGINA PRINCIPAL ---

export default function ListDetailsPage() {
    const params = useParams()
    const router = useRouter()

    const listIdRaw = params?.listId
    const listId = Array.isArray(listIdRaw) ? listIdRaw[0] : listIdRaw

    const { session, account, hydrated } = useAuth()
    const canUse = useMemo(() => !!session && !!account?.id, [session, account])
    const isBackNav = useIsHistoryNavigation()

    // Solo una vuelta atrás puede usar la instantánea en el primer render. Así
    // el contenido ya existe cuando ScrollRestoration restituye la posición;
    // en una entrada normal seguimos evitando una caché potencialmente vieja.
    const [backNavigationSnapshot] = useState(() =>
        resolveBackNavigationDetailsSnapshot(
            isBackNav ? readTmdbListDetailsCache(listId) : null,
            isBackNav,
        ),
    )
    const [data, setData] = useState(backNavigationSnapshot)
    const [loading, setLoading] = useState(() => !backNavigationSnapshot)
    const [err, setErr] = useState('')
    const [busyId, setBusyId] = useState(null)
    const [clearing, setClearing] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const [actionDialog, setActionDialog] = useState(null)

    // Edit
    const [editName, setEditName] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)

    const items = Array.isArray(data?.items) ? data.items : []
    const { ratingsByKey: imdbRatings, summary: imdbSummary } = useListImdbRatings(items, { totalCount: items.length })
    // La edición solo se habilita cuando el backend confirma que esta lista
    // pertenece a la sesión actual. Así una caché antigua no expone controles
    // de gestión al abrir una lista desde otro perfil.
    const canManage = Boolean(canUse && data?.canEdit === true)
    // Clave por TIPO + id: en TMDb una película y una serie pueden compartir el
    // mismo id, así que con solo el id una serie recién buscada podía aparecer
    // marcada como "Añadido" por culpa de una película homónima.
    const listKeyOf = (item) =>
        `${item?.media_type === 'tv' ? 'tv' : 'movie'}:${item?.id}`
    const idsInList = useMemo(
        () => new Set(items.map((x) => listKeyOf(x))),
        [items]
    )
    const filterableItems = useMemo(
        () => items.map((item) => {
            const mediaType = item?.media_type === 'tv' ? 'tv' : 'movie'
            return {
                ...item,
                media_type: mediaType,
                imdbRating: imdbRatings[`${mediaType}:${item?.id}`]?.rating,
            }
        }),
        [items, imdbRatings]
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

    // Search debounce
    useEffect(() => {
        if (actionDialog !== 'add' || addMode !== 'search') return

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
                // Películas Y series: las listas admiten ambas, pero el
                // buscador solo consultaba /search/movie y las series no
                // aparecían nunca.
                const json = await searchTitles({
                    query,
                    page: 1,
                    languages: ['es-ES', 'en-US']
                })
                setSearchRes(Array.isArray(json?.results) ? json.results : [])
            } catch (e) {
                setErr(e?.message || 'Error buscando títulos')
            } finally {
                setSearchLoading(false)
            }
        }, 300)

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [q, actionDialog, addMode])

    // Catalog load
    useEffect(() => {
        if (actionDialog !== 'add' || addMode !== 'catalog') return
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
    }, [cat, actionDialog, addMode])

    const handleRemove = async (movie) => {
        const movieId = typeof movie === 'object' ? movie?.id : movie
        const mediaType = typeof movie === 'object' && movie?.media_type === 'tv' ? 'tv' : 'movie'
        if (!canManage || !listId || !movieId) return
        setBusyId(movieId)
        setErr('')
        try {
            await removeMovieFromList({ listId, movieId, mediaType })
            setData((prev) => {
                if (!prev) return prev
                const nextItems = (prev.items || []).filter((x) => !(x?.id === movieId && (x?.media_type || 'movie') === mediaType))
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
        if (!canManage || !listId) return
        if (!movie?.id) return
        if (idsInList.has(listKeyOf(movie))) return

        setBusyId(movie.id)
        setErr('')
        try {
            await addMovieToList({
                listId,
                movieId: movie.id,
                mediaType: movie.media_type === 'tv' ? 'tv' : 'movie',
                title: movie.title || movie.name || null,
                posterPath: movie.poster_path || null,
                voteAverage: movie.vote_average,
            })
            setData((prev) => {
                if (!prev) return prev
                const nextItems = [{ ...movie, media_type: movie.media_type === 'tv' ? 'tv' : 'movie' }, ...(prev.items || [])]
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
        if (!canManage || !listId) return
        setClearing(true)
        setErr('')
        try {
            await clearList({ listId })
            await load()
            setActionDialog(null)
        } catch (e) {
            setErr(e?.message || 'Error vaciando lista')
        } finally {
            setClearing(false)
        }
    }

    const handleDeleteList = async () => {
        if (!canManage || !listId) return
        setDeleting(true)
        setErr('')
        try {
            await deleteUserList({ listId })
            router.push('/lists')
        } catch (e) {
            setErr(e?.message || 'Error borrando lista')
        } finally {
            setDeleting(false)
        }
    }

    const handleSaveEdit = async () => {
        if (!canManage || !listId) return
        const n = editName.trim()
        if (!n) return

        setSavingEdit(true)
        setErr('')
        try {
            const res = await updateUserList({
                listId,
                name: n,
                description: editDesc,
                language: data?.iso_639_1 || 'es',
                items
            })

            setActionDialog(null)

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
    if (!shouldRenderCachedListDuringAuthHydration({
        canUse,
        hydrated,
        hasCachedData: Boolean(data),
    })) return null
    if (loading && !data) return null

    const addCandidates = addMode === 'search' ? searchRes : catRes
    const coverItem = items.find((item) => item?.poster_path || item?.backdrop_path)
    const coverPath = coverItem?.poster_path || coverItem?.backdrop_path || null
    const backdropPath = coverItem?.backdrop_path || coverItem?.poster_path || null
    const posterImages = items
        .map((item) => item?.poster_path || item?.backdrop_path || null)
        .filter(Boolean)
        .map((path) => `https://image.tmdb.org/t/p/w342${path}`)
    const movieCount = items.filter((item) => item?.media_type !== 'tv').length
    const tvCount = items.filter((item) => item?.media_type === 'tv').length
    const visibility = data?.public ? 'Pública' : 'Privada'
    const averageRating = summarizeListRatings(items)

    return (
        <UnifiedListDetailsLayout
            title={data?.name || 'Lista'}
            description={data?.description || ''}
            sourceLabel="Lista de usuario"
            posterImage={coverPath ? `https://image.tmdb.org/t/p/w500${coverPath}` : null}
            posterImages={posterImages}
            backdropImage={backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : null}
            scoreboardStats={[
                { icon: ListVideo, label: 'ELEMENTOS', value: items.length, tooltip: 'Títulos de la lista' },
                ...(movieCount ? [{ icon: Clapperboard, label: 'PELÍCULAS', value: movieCount, tooltip: 'Películas en la lista' }] : []),
                ...(tvCount ? [{ icon: MonitorPlay, label: 'SERIES', value: tvCount, tooltip: 'Series en la lista' }] : []),
                { icon: data?.public ? Globe2 : LockKeyhole, label: 'VISIBILIDAD', value: visibility, tooltip: `Lista ${visibility.toLowerCase()}` },
            ]}
            scoreboardRatings={{
                tmdb: ratingSummaryBadge(averageRating),
                imdb: ratingSummaryBadge(imdbSummary),
            }}
            showTopBar={false}
            heroActions={(
                <ListDetailsActionRow
                    onBack={() => router.back()}
                    onAdd={canManage ? () => setActionDialog('add') : null}
                    onEdit={canManage ? () => setActionDialog('edit') : null}
                    onClear={canManage ? () => setActionDialog('clear') : null}
                    onDelete={canManage ? () => setActionDialog('delete') : null}
                    clearDisabled={items.length === 0}
                    clearing={clearing}
                    deleting={deleting}
                />
            )}
        >
            {/* Error */}
            {err ? (
                <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-500/10 p-4 text-sm font-medium text-red-200 shadow-lg backdrop-blur-[28px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {err}
                </div>
            ) : null}

            {/* Títulos de la lista */}
            {items.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center rounded-3xl bg-black/[0.08] bg-gradient-to-br from-white/10 via-transparent to-black/15 py-20 text-center shadow-none backdrop-blur-[28px]">
                    <ListVideo className="w-12 h-12 text-zinc-700 mb-4" />
                    <h3 className="text-lg font-bold text-zinc-300">Lista vacía</h3>
                    <p className="text-zinc-500 mt-1 text-sm">
                        {canManage ? <>Usa la acción <b>Añadir títulos</b> para agregar contenido.</> : "Esta lista todavía no tiene títulos."}
                    </p>
                </div>
            ) : items.length > 0 ? (
                <FilterableListItems
                    items={filterableItems}
                    editable={canManage}
                    renderCard={(it, meta, viewMode, editMode) => {
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
                                    imdbRating={meta.imdbRating}
                                    disableHover={viewMode === 'compact'}
                                />
                                {canManage && <button
                                    type="button"
                                    disabled={busyId === id}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleRemove(it)
                                    }}
                                    className={`absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/40 text-zinc-300 shadow-lg backdrop-blur-[28px] transition-all hover:bg-red-500/70 hover:text-white focus:opacity-100 ${
                                        // En móvil no hay hover: el botón solo
                                        // se ve con el modo borrar activado
                                        // desde el menú de filtros.
                                        editMode
                                            ? 'opacity-100 bg-red-500/70 text-white'
                                            : 'opacity-0 group-hover:opacity-100'
                                    } ${busyId === id ? 'opacity-100 cursor-wait' : ''}`}
                                >
                                    {busyId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>}
                            </div>
                        )
                    }}
                    emptyTitle="Sin resultados"
                    emptyText="No hay títulos que coincidan con los filtros."
                />
            ) : null}

            <ListActionDialog open={actionDialog === 'add'} onClose={() => setActionDialog(null)} title="Añadir títulos">
                <div className="mt-5 space-y-4">
                    <Segmented
                        value={addMode}
                        onChange={setAddMode}
                        options={[
                            { id: 'search', label: 'Buscar', icon: Search },
                            { id: 'catalog', label: 'Catálogo', icon: Flame }
                        ]}
                    />

                    {addMode === 'search' ? (
                        <div className="relative">
                            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-400" />
                            <input
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                                placeholder="Buscar película o serie..."
                                className="h-11 w-full rounded-xl bg-white/10 pl-9 pr-10 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                autoFocus
                            />
                            {searchLoading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-purple-400" /> : null}
                        </div>
                    ) : (
                        <div className="relative">
                            {catLoading ? <Loader2 className="pointer-events-none absolute right-10 top-1/2 z-[70] h-4 w-4 -translate-y-1/2 animate-spin text-purple-400" /> : null}
                            <CatalogDropdown value={cat} onChange={setCat} />
                        </div>
                    )}

                    <div className="sv-scroll max-h-[52vh] overflow-y-auto pr-1">
                        {addCandidates.length ? (
                            <div className={listPosterGridClass}>
                                {addCandidates.map((item) => {
                                    const id = item?.id
                                    const inList = idsInList.has(listKeyOf(item))
                                    const mediaType = item?.media_type || 'movie'
                                    const title = item?.title || item?.name || 'Poster'
                                    const year = (item?.release_date || item?.first_air_date || '').slice(0, 4)
                                    return (
                                        <div key={`${addMode}-${mediaType}-${id}`} className="relative">
                                            <ListPosterCard href={`/details/${mediaType}/${id}`} title={title} year={year} mediaType={mediaType} posterPath={item?.poster_path || item?.backdrop_path || null} voteAverage={item?.vote_average} />
                                            {inList ? <div className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white"><Check className="h-3 w-3" />Añadido</div> : null}
                                            <button
                                                type="button"
                                                aria-label={`Añadir ${title}`}
                                                disabled={busyId === id || inList}
                                                onClick={() => handleAdd(item)}
                                                className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white shadow-lg backdrop-blur transition hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {busyId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : !searchLoading && !catLoading ? <p className="py-12 text-center text-sm text-zinc-500">{addMode === 'search' ? 'Busca un título para añadirlo a la lista.' : 'No hay títulos disponibles.'}</p> : null}
                    </div>
                </div>
            </ListActionDialog>

            <ListActionDialog open={actionDialog === 'edit'} onClose={() => setActionDialog(null)} title="Editar lista">
                <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); handleSaveEdit() }}>
                    <label className="block space-y-2 text-sm font-bold text-zinc-300">Nombre
                        <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} autoFocus className="h-11 w-full rounded-xl bg-white/10 px-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </label>
                    <label className="block space-y-2 text-sm font-bold text-zinc-300">Descripción
                        <textarea value={editDesc} onChange={(event) => setEditDesc(event.target.value)} maxLength={200} className="h-28 w-full resize-none rounded-xl bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </label>
                    <div className="flex justify-end gap-3">
                        <DialogButton onClick={() => setActionDialog(null)}>Cancelar</DialogButton>
                        <DialogButton type="submit" tone="primary" disabled={savingEdit || !editName.trim()}>{savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</DialogButton>
                    </div>
                </form>
            </ListActionDialog>

            <ListActionDialog open={actionDialog === 'clear'} onClose={() => setActionDialog(null)} title="¿Vaciar la lista?">
                <p className="mt-3 text-sm leading-6 text-zinc-300">Se eliminarán los {items.length} títulos de esta lista. La lista y sus detalles se conservarán.</p>
                <div className="mt-6 flex justify-end gap-3">
                    <DialogButton onClick={() => setActionDialog(null)}>Cancelar</DialogButton>
                    <DialogButton onClick={handleClear} tone="warning" disabled={clearing}>{clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}Vaciar lista</DialogButton>
                </div>
            </ListActionDialog>

            <ListActionDialog open={actionDialog === 'delete'} onClose={() => setActionDialog(null)} title="¿Borrar la lista?">
                <p className="mt-3 text-sm leading-6 text-zinc-300">Esta acción elimina la lista y todos sus títulos de forma permanente. No se puede deshacer.</p>
                <div className="mt-6 flex justify-end gap-3">
                    <DialogButton onClick={() => setActionDialog(null)}>Cancelar</DialogButton>
                    <DialogButton onClick={handleDeleteList} tone="danger" disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Borrar definitivamente</DialogButton>
                </div>
            </ListActionDialog>
        </UnifiedListDetailsLayout>
    )
}
