// ActorDetails.jsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ImageOff,
  Link as LinkIcon,
  ExternalLink,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  Globe,
  Film,
  Tv as Tv2,
  User,
  Cake,
  Skull,
  Briefcase,
  TrendingUp,
  Star,
  Search,
  SlidersHorizontal,
  Images,
  Tags,
  ChevronDown,
  Calendar,
  ArrowUpRight
} from 'lucide-react'

/* --- CONFIG & UTILS --- */
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

const tmdbImg = (path, size = 'original') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null)
const safeText = (v, fallback = '—') => (v == null || v === '' ? fallback : String(v))

const genderLabel = (g) => {
  if (g === 1) return 'Mujer'
  if (g === 2) return 'Hombre'
  if (g === 3) return 'No binario'
  return 'N/A'
}

const calcAge = (birthday, deathday) => {
  if (!birthday) return null
  const b = new Date(birthday)
  if (Number.isNaN(b.getTime())) return null
  const end = deathday ? new Date(deathday) : new Date()
  if (Number.isNaN(end.getTime())) return null
  let age = end.getFullYear() - b.getFullYear()
  const m = end.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) age--
  return Number.isFinite(age) ? age : null
}

const yearFromDate = (s) => {
  if (!s) return null
  const y = String(s).slice(0, 4)
  return /^\d{4}$/.test(y) ? Number(y) : null
}

const formatHumanDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.status_message || 'Error TMDb')
  return json
}

/* --- UI COMPONENTS --- */

function Badge({ children, icon: Icon, className = '', variant = 'default' }) {
  const variants = {
    default: 'bg-zinc-800/50 text-zinc-300 border-zinc-700/50',
    highlight: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20'
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium backdrop-blur-sm ${variants[variant] || variants.default
        } ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </span>
  )
}

function SectionTitle({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-emerald-400 shadow-[0_0_15px_-3px_rgba(52,211,153,0.3)]">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

function SocialButton({ href, icon: Icon, label }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      className="group relative flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 hover:bg-zinc-800 transition-all duration-300"
    >
      <Icon className="w-4 h-4" />
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
        {label}
      </span>
    </a>
  )
}

// Custom select wrapper
function SelectInput({ value, onChange, options, icon: Icon, placeholder = 'Seleccionar', className = '' }) {
  return (
    <div className={`relative group ${className}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-focus-within:text-emerald-400 transition-colors">
        {Icon ? <Icon className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
      </div>
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none bg-zinc-900/80 border border-zinc-800 hover:border-zinc-600 text-zinc-200 text-sm rounded-xl py-2.5 pl-9 pr-8 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all cursor-pointer"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none group-hover:text-zinc-400" />
    </div>
  )
}

/**
 * PosterCard (CRÉDITOS EN PANTALLA)
 * ✅ Solo muestra la portada por defecto
 * ✅ Título/“como …”/año/puntuación SOLO en hover/focus
 * ✅ La puntuación en hover es la de estos créditos (vote_average)
 */
function PosterCard({ item }) {
  const title = item?.title || item?.name || 'Sin título'
  const poster = tmdbImg(item?.poster_path || item?.profile_path, 'w500')
  const subtitle = item?.subtitle || ''
  const year = item?.year || yearFromDate(item?.date) || null
  const mediaType = item?.media_type === 'tv' ? 'tv' : 'movie'
  const href = mediaType === 'movie' ? `/details/movie/${item?.id}` : `/details/tv/${item?.id}`

  const rating = Number(item?.vote_average ?? item?.rating ?? 0)
  const hasRating = Number.isFinite(rating) && rating > 0

  return (
    <Link href={href} prefetch={false} className="group block relative w-full" aria-label={title}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/5 group-hover:ring-emerald-500/35 transition-all duration-300">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 bg-zinc-900">
            <ImageOff className="w-10 h-10 mb-2 opacity-50" />
            <span className="text-[10px] uppercase font-bold tracking-widest">No Image</span>
          </div>
        )}

        {/* Hover / focus overlay (sin repetir texto fuera) */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300">
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

          {/* Rating SOLO en hover (créditos en pantalla) */}
          {hasRating && (
            <div className="absolute top-2 right-2 translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-300">
              <div className="px-2 py-1 rounded-full bg-black/65 backdrop-blur border border-white/10 text-[11px] font-extrabold text-white inline-flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                {rating.toFixed(1)}
              </div>
            </div>
          )}

          <div className="absolute left-0 right-0 bottom-0 p-4">
            <div className="translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 transition-all duration-300">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-emerald-400 text-[11px] font-extrabold uppercase tracking-wider">
                  {mediaType === 'tv' ? 'Serie' : 'Película'}
                </span>
                {year ? <span className="text-[11px] text-zinc-300/80 font-semibold">· {year}</span> : null}
              </div>

              <div className="text-white text-sm font-extrabold leading-snug line-clamp-2">{title}</div>
              {subtitle ? (
                <div className="mt-1 text-xs text-zinc-300/85 line-clamp-1">{subtitle}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Accesibilidad (sin UI visible) */}
      <span className="sr-only">{title}</span>
    </Link>
  )
}

/* --- MAIN COMPONENT --- */

export default function ActorDetails({ actorDetails, actorMovies }) {
  const personId = actorDetails?.id

  // UI States
  const [tab, setTab] = useState('credits')
  const [showFullBio, setShowFullBio] = useState(false)
  const [loadingExtra, setLoadingExtra] = useState(false)
  const [extraErr, setExtraErr] = useState('')

  // Data States
  const [externalIds, setExternalIds] = useState(null)
  const [combinedCredits, setCombinedCredits] = useState(null)
  const [images, setImages] = useState(null)
  const [taggedImages, setTaggedImages] = useState(null)
  const [translations, setTranslations] = useState(null)

  // Filter States (Créditos)
  const [q, setQ] = useState('')
  const [mediaFilter, setMediaFilter] = useState('all')
  const [creditFilter, setCreditFilter] = useState('acting')
  const [deptFilter, setDeptFilter] = useState('all')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [sort, setSort] = useState('date_desc')

  const profileSrc = tmdbImg(actorDetails?.profile_path, 'h632')
  const tmdbUrl = personId ? `https://www.themoviedb.org/person/${personId}` : null

  const loadAll = useCallback(async () => {
    if (!TMDB_API_KEY || !personId) return
    setLoadingExtra(true)
    setExtraErr('')
    const qs = `api_key=${encodeURIComponent(TMDB_API_KEY)}`
    const lang = `&language=es-ES`

    const endpoints = {
      external: `${TMDB_BASE}/person/${personId}/external_ids?${qs}`,
      combined: `${TMDB_BASE}/person/${personId}/combined_credits?${qs}${lang}`,
      images: `${TMDB_BASE}/person/${personId}/images?${qs}`,
      tagged: `${TMDB_BASE}/person/${personId}/tagged_images?${qs}&page=1`,
      translations: `${TMDB_BASE}/person/${personId}/translations?${qs}`
    }

    const settled = await Promise.allSettled([
      fetchJson(endpoints.external),
      fetchJson(endpoints.combined),
      fetchJson(endpoints.images),
      fetchJson(endpoints.tagged),
      fetchJson(endpoints.translations)
    ])

    const [ex, cc, im, tg, tr] = settled
    const firstErr = settled.find((r) => r.status === 'rejected')?.reason?.message
    if (firstErr) setExtraErr(firstErr)

    if (ex.status === 'fulfilled') setExternalIds(ex.value)
    if (cc.status === 'fulfilled') setCombinedCredits(cc.value)
    if (im.status === 'fulfilled') setImages(im.value)
    if (tg.status === 'fulfilled') setTaggedImages(tg.value)
    if (tr.status === 'fulfilled') setTranslations(tr.value)

    setLoadingExtra(false)
  }, [personId])

  useEffect(() => {
    setQ('')
    setMediaFilter('all')
    setCreditFilter('acting')
    setDeptFilter('all')
    setYearFrom('')
    setYearTo('')
    setSort('date_desc')
    setTab('credits')
    setShowFullBio(false)
    if (personId && TMDB_API_KEY) loadAll()
  }, [personId, loadAll])

  // --- Computed Data ---
  const creditsAll = useMemo(() => {
    if (combinedCredits?.cast || combinedCredits?.crew) {
      const cast = (combinedCredits.cast || []).map((c) => ({ ...c, kind: 'acting', department: 'Acting' }))
      const crew = (combinedCredits.crew || []).map((c) => ({ ...c, kind: 'crew', department: c.department || 'Crew' }))

      return [...cast, ...crew]
        .filter((x) => x?.id)
        .map((c) => {
          const media_type = c.media_type || (c.first_air_date ? 'tv' : 'movie')
          const date = media_type === 'tv' ? c.first_air_date : c.release_date
          return {
            ...c,
            media_type,
            year: yearFromDate(date),
            date,
            subtitle: c.character ? `como ${c.character}` : c.job ? c.job : ''
          }
        })
    }

    // Fallback
    return (Array.isArray(actorMovies) ? actorMovies : [])
      .map((m) => ({
        ...m,
        kind: 'acting',
        department: 'Acting',
        media_type: 'movie',
        year: yearFromDate(m.release_date),
        date: m.release_date,
        subtitle: m.character ? `como ${m.character}` : ''
      }))
      .filter((x) => x.id)
  }, [combinedCredits, actorMovies])

  const deptOptions = useMemo(() => {
    const set = new Set(creditsAll.filter((c) => c.kind === 'crew').map((c) => c.department))
    return Array.from(set)
      .sort()
      .map((d) => ({ value: d, label: d }))
  }, [creditsAll])

  const yearOptions = useMemo(() => {
    const set = new Set(creditsAll.map((c) => c.year).filter((y) => y > 0))
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }))
  }, [creditsAll])

  const filteredCredits = useMemo(() => {
    let out = [...creditsAll] // ✅ no mutar creditsAll
    const needle = q.trim().toLowerCase()

    if (mediaFilter !== 'all') out = out.filter((x) => x.media_type === mediaFilter)
    if (creditFilter !== 'all') out = out.filter((x) => x.kind === creditFilter)
    if (creditFilter === 'crew' && deptFilter !== 'all') out = out.filter((x) => x.department === deptFilter)
    if (yearFrom) out = out.filter((x) => (x.year || -Infinity) >= Number(yearFrom))
    if (yearTo) out = out.filter((x) => (x.year || Infinity) <= Number(yearTo))
    if (needle) {
      out = out.filter((x) => {
        const t = String(x.title || x.name || '').toLowerCase()
        const s = String(x.subtitle || '').toLowerCase()
        return t.includes(needle) || s.includes(needle)
      })
    }

    const byDate = (x) => (x.date ? new Date(x.date).getTime() : -Infinity)

    if (sort === 'date_desc') out.sort((a, b) => byDate(b) - byDate(a))
    else if (sort === 'date_asc') out.sort((a, b) => byDate(a) - byDate(b))
    else if (sort === 'pop_desc') out.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    else if (sort === 'rating_desc') out.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
    else if (sort === 'alpha') out.sort((a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || '')))

    return out
  }, [creditsAll, q, mediaFilter, creditFilter, deptFilter, yearFrom, yearTo, sort])

  const stats = useMemo(
    () => ({
      total: creditsAll.length,
      movies: creditsAll.filter((x) => x.media_type === 'movie').length,
      tv: creditsAll.filter((x) => x.media_type === 'tv').length,
      acting: creditsAll.filter((x) => x.kind === 'acting').length,
      crew: creditsAll.filter((x) => x.kind === 'crew').length
    }),
    [creditsAll]
  )

  const socials = useMemo(() => {
    const ex = externalIds || {}
    const imdb = actorDetails?.imdb_id || ex?.imdb_id
    return {
      imdb: imdb ? `https://www.imdb.com/name/${imdb}` : null,
      instagram: ex?.instagram_id ? `https://www.instagram.com/${ex.instagram_id}` : null,
      twitter: ex?.twitter_id ? `https://twitter.com/${ex.twitter_id}` : null,
      facebook: ex?.facebook_id ? `https://www.facebook.com/${ex.facebook_id}` : null,
      youtube: ex?.youtube_id ? `https://www.youtube.com/${ex.youtube_id}` : null,
      homepage: actorDetails?.homepage,
      tmdb: tmdbUrl
    }
  }, [externalIds, actorDetails, tmdbUrl])

  const age = calcAge(actorDetails?.birthday, actorDetails?.deathday)
  const esBio = translations?.translations?.find((t) => t.iso_639_1 === 'es')?.data?.biography
  const bio = esBio || actorDetails?.biography || ''
  const photos = (images?.profiles || []).sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))

  const taggedCount = taggedImages?.results?.length || 0
  const photosCount = photos.length

  const Tabs = useMemo(
    () => [
      { id: 'credits', label: 'Créditos', icon: Film, count: stats.total },
      { id: 'photos', label: 'Fotos', icon: Images, count: photosCount },
      { id: 'tagged', label: 'En medios', icon: Tags, count: taggedCount },
      { id: 'about', label: 'Perfil', icon: User }
    ],
    [stats.total, photosCount, taggedCount]
  )

  const clearFilters = () => {
    setQ('')
    setMediaFilter('all')
    setCreditFilter('acting')
    setDeptFilter('all')
    setYearFrom('')
    setYearTo('')
    setSort('date_desc')
  }

  // --- “Más populares” (sin scrollbar, más compacto, con títulos con espacio) ---
  const popularItems = useMemo(() => {
    return creditsAll
      .filter((x) => x.poster_path && x.kind === 'acting')
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 5)
  }, [creditsAll])

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-emerald-900/10 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-indigo-900/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {/* HERO */}
        <div className="pt-10 pb-8 sm:pt-16 sm:pb-10">
          <div className="flex flex-col md:flex-row gap-8 lg:gap-12 items-start">
            {/* Profile Image */}
            <div className="shrink-0 relative group w-48 sm:w-60 md:w-72 lg:w-80 mx-auto md:mx-0">
              <div className="absolute -inset-1 bg-gradient-to-br from-emerald-500 to-indigo-600 rounded-[2rem] opacity-30 blur transition duration-500" />
              <div className="relative aspect-[2/3] rounded-[1.75rem] overflow-hidden shadow-2xl bg-zinc-900 ring-1 ring-white/10">
                {profileSrc ? (
                  <img src={profileSrc} alt={actorDetails?.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <User className="w-16 h-16" />
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center md:text-left space-y-6">
              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-white mb-2 leading-[1.1]">
                  {safeText(actorDetails?.name)}
                </h1>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm text-zinc-400">
                  {actorDetails?.birthday && (
                    <span className="flex items-center gap-1.5">
                      <Cake className="w-4 h-4 text-zinc-500" />
                      {formatHumanDate(actorDetails.birthday)}
                      {age && <span className="text-emerald-400 font-semibold">({age} años)</span>}
                    </span>
                  )}
                  {actorDetails?.deathday && (
                    <span className="flex items-center gap-1.5 text-red-400">
                      <Skull className="w-4 h-4" />
                      † {formatHumanDate(actorDetails.deathday)}
                    </span>
                  )}
                  {actorDetails?.place_of_birth && (
                    <span className="hidden sm:flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-zinc-700" />
                      {actorDetails.place_of_birth}
                    </span>
                  )}
                </div>
              </div>

              {/* Bio */}
              <div className="relative">
                <div
                  className={`prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed ${!showFullBio && bio.length > 420 ? 'line-clamp-4 mask-fade-bottom' : ''
                    }`}
                >
                  {bio || <span className="italic text-zinc-500">Sin biografía disponible.</span>}
                </div>
                {bio.length > 420 && (
                  <button
                    onClick={() => setShowFullBio(!showFullBio)}
                    className="mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wide flex items-center gap-1"
                  >
                    {showFullBio ? 'Ver menos' : 'Leer más'}{' '}
                    <ChevronDown className={`w-3 h-3 transition-transform ${showFullBio ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>

              {/* Stats + Dept */}
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <Badge variant="highlight" icon={TrendingUp}>
                  Pop: {Math.round(actorDetails?.popularity || 0)}
                </Badge>
                <Badge icon={Briefcase}>{actorDetails?.known_for_department || '—'}</Badge>
                <Badge icon={Film}>{stats.movies} Cine</Badge>
                <Badge icon={Tv2}>{stats.tv} TV</Badge>
                <Badge icon={User}>{stats.acting} Actuación</Badge>
                <Badge icon={Briefcase}>{stats.crew} Equipo</Badge>
              </div>

              {/* Socials */}
              <div className="flex items-center justify-center md:justify-start gap-3 pt-1 flex-wrap">
                <SocialButton href={socials.tmdb} icon={ExternalLink} label="TMDb" />
                <SocialButton href={socials.imdb} icon={LinkIcon} label="IMDb" />
                <SocialButton href={socials.instagram} icon={Instagram} label="Instagram" />
                <SocialButton href={socials.twitter} icon={Twitter} label="Twitter" />
                <SocialButton href={socials.facebook} icon={Facebook} label="Facebook" />
                <SocialButton href={socials.youtube} icon={Youtube} label="YouTube" />
                <SocialButton href={socials.homepage} icon={Globe} label="Website" />
              </div>

              {!!extraErr && <div className="text-xs text-red-300/90">{extraErr}</div>}
              {loadingExtra && <div className="text-xs text-zinc-400">Cargando datos extra…</div>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-4 z-40 mb-8 rounded-2xl border border-white/5 bg-black/60 backdrop-blur-xl shadow-xl overflow-x-auto no-scrollbar">
          <div className="flex items-center p-1.5 min-w-max">
            {Tabs.map((t) => {
              const isActive = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${isActive ? 'text-white bg-zinc-800 shadow-lg ring-1 ring-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <t.icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : ''}`} />
                  {t.label}
                  {typeof t.count === 'number' && (
                    <span
                      className={`ml-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${isActive ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-zinc-300'
                        }`}
                    >
                      {t.count}
                    </span>
                  )}
                  {isActive && <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* MAIN */}
          <div className="lg:col-span-8 space-y-8">
            {/* TAB: CREDITS */}
            {tab === 'credits' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <SectionTitle
                  title="Créditos en pantalla"
                  subtitle={`${filteredCredits.length} de ${stats.total} resultados`}
                  icon={Film}
                  right={
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-xs font-bold text-zinc-200"
                      title="Limpiar filtros"
                    >
                      Limpiar
                    </button>
                  }
                />

                {/* Filters (arreglado: una sola línea de selects, sin partir en dos) */}
                <div className="bg-zinc-900/45 border border-white/5 rounded-2xl p-4 mb-6 backdrop-blur-sm">
                  {/* Search */}
                  <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por título o rol…"
                      className="w-full bg-black/35 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>

                  {/* One-line controls */}
                  <div className="mt-3 flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                    <SelectInput
                      className="min-w-[165px] shrink-0"
                      value={mediaFilter}
                      onChange={(e) => setMediaFilter(e.target.value)}
                      options={[
                        { label: 'Tipo (todos)', value: 'all' },
                        { label: 'Películas', value: 'movie' },
                        { label: 'Series', value: 'tv' }
                      ]}
                      placeholder="Tipo"
                    />

                    <SelectInput
                      className="min-w-[175px] shrink-0"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      options={[
                        { label: 'Más recientes', value: 'date_desc' },
                        { label: 'Más antiguos', value: 'date_asc' },
                        { label: 'Popularidad', value: 'pop_desc' },
                        { label: 'Mejor valorados', value: 'rating_desc' },
                        { label: 'A-Z', value: 'alpha' }
                      ]}
                      icon={ArrowUpRight}
                      placeholder="Orden"
                    />

                    <SelectInput
                      className="min-w-[165px] shrink-0"
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value)}
                      options={yearOptions}
                      icon={Calendar}
                      placeholder="Desde (cualquiera)"
                    />

                    <SelectInput
                      className="min-w-[165px] shrink-0"
                      value={yearTo}
                      onChange={(e) => setYearTo(e.target.value)}
                      options={yearOptions}
                      icon={Calendar}
                      placeholder="Hasta (cualquiera)"
                    />

                    <SelectInput
                      className="min-w-[170px] shrink-0"
                      value={creditFilter}
                      onChange={(e) => {
                        setCreditFilter(e.target.value)
                        if (e.target.value !== 'crew') setDeptFilter('all')
                      }}
                      options={[
                        { label: 'Actuación', value: 'acting' },
                        { label: 'Equipo', value: 'crew' },
                        { label: 'Todos', value: 'all' }
                      ]}
                      placeholder="Rol"
                    />

                    {creditFilter === 'crew' && (
                      <SelectInput
                        className="min-w-[200px] shrink-0"
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                        options={[{ label: 'Dept. (todos)', value: 'all' }, ...deptOptions]}
                        placeholder="Departamento"
                      />
                    )}
                  </div>
                </div>

                {/* Grid (solo portadas; info en hover) */}
                {filteredCredits.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 gap-x-5 gap-y-6">
                    {filteredCredits.map((c) => (
                      <PosterCard key={`${c.id}-${c.credit_id || 'x'}-${c.media_type || 'm'}`} item={c} />
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center border border-dashed border-white/10 rounded-3xl bg-white/5">
                    <Film className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400">No se encontraron créditos con estos filtros.</p>
                    <button onClick={clearFilters} className="mt-4 text-sm text-emerald-400 hover:underline">
                      Limpiar filtros
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB: PHOTOS */}
            {tab === 'photos' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <SectionTitle title="Fotos" subtitle={`${photos.length} imágenes`} icon={Images} />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {photos.map((p) => (
                    <a
                      key={p.file_path}
                      href={tmdbImg(p.file_path, 'original')}
                      target="_blank"
                      rel="noreferrer"
                      className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-emerald-500/50 transition-colors"
                    >
                      <img
                        src={tmdbImg(p.file_path, 'w500')}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.width}x{p.height}
                      </div>
                    </a>
                  ))}
                </div>
                {!photos.length && <div className="text-zinc-500 italic">No hay fotos disponibles.</div>}
              </div>
            )}

            {/* TAB: TAGGED */}
            {tab === 'tagged' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <SectionTitle title="Apariciones en medios" subtitle="Imágenes donde aparece etiquetado/a" icon={Tags} />
                <div className="columns-2 sm:columns-3 gap-4 space-y-4">
                  {taggedImages?.results?.map((t) => (
                    <a
                      key={t.file_path}
                      href={tmdbImg(t.file_path, 'original')}
                      target="_blank"
                      rel="noreferrer"
                      className="break-inside-avoid relative group rounded-xl overflow-hidden border border-white/10 bg-zinc-900/40 hover:border-emerald-500/40 transition-colors block"
                    >
                      <img src={tmdbImg(t.file_path, 'w500')} alt="" className="w-full h-auto" loading="lazy" />
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLink className="w-6 h-6 text-white" />
                      </div>
                      {(t.media?.title || t.media?.name) && (
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-xs text-white line-clamp-1">
                          {t.media.title || t.media.name}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
                {!taggedImages?.results?.length && <div className="text-zinc-500 italic">No hay imágenes etiquetadas.</div>}
              </div>
            )}

            {/* TAB: ABOUT */}
            {tab === 'about' && (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <SectionTitle title="Perfil" subtitle="Datos del actor/actriz" icon={User} />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-zinc-900/45 border border-white/5 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Información</h3>
                    <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                      <span className="text-zinc-400">Género</span>
                      <span className="text-white text-right">{genderLabel(actorDetails?.gender)}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                      <span className="text-zinc-400">Lugar</span>
                      <span className="text-white text-right max-w-[60%] truncate">{safeText(actorDetails?.place_of_birth)}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                      <span className="text-zinc-400">Conocido/a por</span>
                      <span className="text-white text-right">{safeText(actorDetails?.known_for_department)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-zinc-400">TMDb ID</span>
                      <span className="text-white font-mono">{safeText(actorDetails?.id)}</span>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-zinc-900/45 border border-white/5 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Enlaces & Alias</h3>

                    <div className="flex flex-wrap gap-2">
                      {Object.entries(socials).map(([key, url]) =>
                        url ? (
                          <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-zinc-800/70 hover:bg-emerald-500/15 hover:text-emerald-300 border border-white/5 text-sm capitalize transition-colors"
                          >
                            {key}
                          </a>
                        ) : null
                      )}
                    </div>

                    <div className="mt-1">
                      <h4 className="text-xs text-zinc-500 mb-2">También conocido/a como</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {(actorDetails?.also_known_as || []).slice(0, 14).map((a) => (
                          <span key={a} className="px-2 py-0.5 rounded bg-white/5 text-xs text-zinc-400 border border-white/5">
                            {a}
                          </span>
                        ))}
                        {(actorDetails?.also_known_as || []).length > 14 && (
                          <span className="px-2 py-0.5 rounded bg-white/5 text-xs text-zinc-500 border border-white/5">
                            +{(actorDetails?.also_known_as || []).length - 14}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SIDE */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-6">
              {/* Más populares (sin scrollbar, más espacio) */}
              <div className="rounded-3xl border border-white/10 bg-zinc-900/30 backdrop-blur p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-[0.08]">
                  <Star className="w-24 h-24 text-yellow-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-4 relative z-10">Más populares</h3>

                <div className="space-y-3 relative z-10">
                  {popularItems.map((item) => {
                    const href = item.media_type === 'movie' ? `/details/movie/${item.id}` : `/details/tv/${item.id}`
                    const title = item.title || item.name || 'Sin título'
                    const year = item.year || '—'
                    const isTv = item.media_type === 'tv'
                    const rating = Number(item.vote_average || 0)

                    return (
                      <Link
                        key={`${item.media_type}:${item.id}:${item.credit_id || 'x'}`}
                        href={href}
                        prefetch={false}
                        className="flex gap-3 group rounded-2xl p-2.5 hover:bg-white/5 transition"
                        title={title}
                      >
                        <div className="w-12 h-[72px] rounded-xl overflow-hidden shrink-0 shadow ring-1 ring-white/10 group-hover:ring-emerald-500/35 transition">
                          <img src={tmdbImg(item.poster_path, 'w185')} className="w-full h-full object-cover" alt="" />
                        </div>

                        <div className="min-w-0 flex-1 py-0.5">
                          <div className="text-sm font-extrabold text-zinc-200 group-hover:text-emerald-300 line-clamp-2 transition-colors">
                            {title}
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-[12px] text-zinc-500">
                            <span className="inline-flex items-center gap-1">
                              {isTv ? <Tv2 className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                              {isTv ? 'Serie' : 'Película'}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-zinc-700" />
                            <span>{year}</span>
                          </div>

                          {rating > 0 && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 px-2 py-1 rounded-full">
                              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                              {rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                      </Link>
                    )
                  })}

                  {!popularItems.length && <div className="text-sm text-zinc-500">No hay títulos destacados.</div>}
                </div>
              </div>

              {/* Resumen (sin recortes) */}
              <div className="rounded-3xl border border-white/10 bg-zinc-900/30 backdrop-blur p-6">
                <h3 className="text-lg font-bold text-white mb-4">Resumen</h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-400">Debut</span>
                    <span className="text-white font-medium">{yearOptions[yearOptions.length - 1]?.label || '—'}</span>
                  </div>

                  <div className="w-full h-px bg-white/5" />

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-zinc-400">Créditos</span>
                    <span className="text-emerald-400 font-bold text-lg">{stats.total}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-xl font-extrabold text-white">{stats.movies}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Cine</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-xl font-extrabold text-white">{stats.tv}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">TV</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-xl font-extrabold text-white">{stats.acting}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Actuación</div>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3 text-center">
                      <div className="text-xl font-extrabold text-white">{stats.crew}</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Equipo</div>
                    </div>
                  </div>
                </div>
              </div>

              {!TMDB_API_KEY && (
                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-200 text-xs">
                  <strong>⚠️ Developer:</strong> Falta <code>NEXT_PUBLIC_TMDB_API_KEY</code>. No cargarán datos extra (socials/credits/images).
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .mask-fade-bottom { mask-image: linear-gradient(to bottom, black 55%, transparent 100%); }
      `}</style>
    </div>
  )
}