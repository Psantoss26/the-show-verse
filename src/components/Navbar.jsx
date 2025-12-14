'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import '@/app/globals.css'
import { useAuth } from '@/context/AuthContext'
import UserAvatar from '@/components/auth/UserAvatar'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FilmIcon,
  TvIcon,
  NewspaperIcon,
  CalendarDaysIcon,
  Heart,
  Bookmark,
  Search as SearchIcon,
  X as XIcon,
  Menu as MenuIcon,
  HomeIcon,
} from 'lucide-react'

/* ====================================================================
 * Componente de Búsqueda Reutilizable (Lógica y UI)
 * ==================================================================== */
function SearchBar({ onResultClick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }

    const searchTimer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
            query
          )}`
        )
        const data = await res.json()
        const filteredResults = (data.results || []).filter(
          (item) =>
            item.media_type !== 'person' ||
            item.known_for_department === 'Acting'
        )
        setResults(filteredResults)
        setShowDropdown(true)
      } catch (err) {
        console.error('Error buscando en TMDb:', err)
      }
    }, 300)

    return () => clearTimeout(searchTimer)
  }, [query])

  const handleResultClick = () => {
    setShowDropdown(false)
    setQuery('')
    setResults([])
    if (onResultClick) onResultClick()
  }

  return (
    <div className="relative w-full max-w-lg" ref={searchRef}>
      <form onSubmit={(e) => e.preventDefault()} className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setShowDropdown(true)}
          placeholder="Buscar películas, series o actores..."
          className="w-full pl-11 pr-4 py-2.5 bg-neutral-800/70 border border-neutral-700 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-neutral-400"
        />
      </form>

      <AnimatePresence>
        {showDropdown && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 w-full bg-[#181818] text-white mt-2 rounded-2xl shadow-2xl max-h-[70vh] overflow-y-auto z-50 border border-[#2a2a2a] backdrop-blur-md no-scrollbar"
          >
            {results.map((item) => (
              <Link
                key={`${item.media_type}-${item.id}`}
                href={`/details/${item.media_type}/${item.id}`}
                onClick={handleResultClick}
                className="flex items-center gap-4 px-4 py-3 hover:bg-[#2a2a2a] transition-colors cursor-pointer"
              >
                <img
                  src={
                    item.poster_path || item.profile_path
                      ? `https://image.tmdb.org/t/p/w92${item.poster_path || item.profile_path}`
                      : '/default-poster.png'
                  }
                  alt={item.title || item.name || 'Resultado'}
                  className="w-12 h-16 rounded-md shadow-md object-cover"
                />
                <div>
                  <p className="font-semibold text-base line-clamp-1">
                    {item.title || item.name}
                  </p>
                  <p className="text-sm text-neutral-400 capitalize">
                    {item.media_type === 'movie'
                      ? 'Película'
                      : item.media_type === 'tv'
                        ? 'Serie'
                        : item.media_type === 'person'
                          ? 'Persona'
                          : item.media_type}
                  </p>
                </div>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ====================================================================
 * Navbar principal
 * ==================================================================== */
export default function Navbar() {
  const { account, hydrated } = useAuth()
  const pathname = usePathname()

  const [showMobileSearch, setShowMobileSearch] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Mostrar/ocultar barras (móvil) según scroll
  const [isMobile, setIsMobile] = useState(false)
  const [barsVisible, setBarsVisible] = useState(true)

  const lastYRef = useRef(0)
  const tickingRef = useRef(false)

  const isActive = (href) =>
    pathname === href || (href !== '/' && pathname?.startsWith(href))

  const navLinkClass = (href) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive(href)
      ? 'bg-white/10 text-white'
      : 'text-neutral-400 hover:text-white hover:bg-white/5'
    }`

  const iconLinkClass = (href) =>
    `p-2 rounded-full transition-colors ${isActive(href)
      ? 'text-white bg-white/10'
      : 'text-neutral-400 hover:text-white hover:bg-white/5'
    }`

  const navLinkClassMobileBottom = (href) =>
    `flex flex-col items-center justify-center gap-0.5 px-2 transition-colors w-full ${isActive(href) ? 'text-blue-400' : 'text-neutral-400 hover:text-white'
    }`

  // Menú inferior fijo: 4 secciones. Si no hay sesión, fav/watchlist llevan a login.
  const favHref = hydrated && account ? '/favorites' : '/login'
  const watchHref = hydrated && account ? '/watchlist' : '/login'

  // Detectar móvil (lg breakpoint)
  useEffect(() => {
    const calc = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 1024)
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  // Bloquear scroll cuando overlays están abiertos
  useEffect(() => {
    const locked = showMobileSearch || mobileMenuOpen
    document.body.style.overflow = locked ? 'hidden' : 'auto'
    // Si hay overlay, forzamos barras visibles
    if (locked) setBarsVisible(true)
  }, [showMobileSearch, mobileMenuOpen])

  // Scroll -> ocultar/mostrar (solo móvil)
  useEffect(() => {
    if (!isMobile) {
      setBarsVisible(true)
      return
    }

    const THRESHOLD = 12
    const TOP_LOCK = 40

    lastYRef.current = window.scrollY || 0

    const onScroll = () => {
      if (showMobileSearch || mobileMenuOpen) return

      const currentY = window.scrollY || 0
      const delta = currentY - lastYRef.current

      if (tickingRef.current) return
      tickingRef.current = true

      requestAnimationFrame(() => {
        // Cerca del top, siempre visible
        if (currentY <= TOP_LOCK) {
          setBarsVisible(true)
        } else if (Math.abs(delta) >= THRESHOLD) {
          // Baja => ocultar, sube => mostrar
          if (delta > 0) setBarsVisible(false)
          else setBarsVisible(true)
        }

        lastYRef.current = currentY
        tickingRef.current = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile, showMobileSearch, mobileMenuOpen])

  // Animaciones top/bottom (solo móvil)
  const topAnimate = useMemo(() => {
    if (!isMobile) return { y: 0 }
    return { y: barsVisible ? 0 : -80 }
  }, [isMobile, barsVisible])

  const bottomAnimate = useMemo(() => {
    if (!isMobile) return { y: 0 }
    return { y: barsVisible ? 0 : 90 }
  }, [isMobile, barsVisible])

  return (
    <>
      {/* ===================== TOP BAR ===================== */}
      <motion.nav
        animate={topAnimate}
        transition={{ type: 'tween', duration: 0.18 }}
        className="sticky top-0 z-40 w-full bg-black/80 backdrop-blur-md border-b border-neutral-800 will-change-transform"
      >
        {/* ---------------- Desktop ---------------- */}
        <div className="hidden lg:flex items-center justify-between h-16 py-3">
          {/* Izquierda */}
          <div className="flex items-center gap-6 flex-shrink-0 pl-6 -ml-10">
            <Link href="/" className="block h-12 overflow-hidden flex-shrink-0">
              <div className="h-full w-[170px] flex items-center justify-center overflow-hidden">
                <img
                  src="/TheShowVerse2.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[2.2] origin-left"
                />
              </div>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/" className={navLinkClass('/')}>Inicio</Link>
              <Link href="/movies" className={navLinkClass('/movies')}>Películas</Link>
              <Link href="/series" className={navLinkClass('/series')}>Series</Link>
            </div>
          </div>

          {/* Derecha */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-12">
            <div className="flex items-center gap-2">
              <Link href="/news" className={iconLinkClass('/news')} title="Noticias">
                <NewspaperIcon className="w-5 h-5" />
              </Link>
              <Link href="/calendar" className={iconLinkClass('/calendar')} title="Calendario">
                <CalendarDaysIcon className="w-5 h-5" />
              </Link>

              {hydrated && account && (
                <>
                  <Link href="/favorites" className={iconLinkClass('/favorites')} title="Favoritas">
                    <Heart className="w-5 h-5" />
                  </Link>
                  <Link href="/watchlist" className={iconLinkClass('/watchlist')} title="Pendientes">
                    <Bookmark className="w-5 h-5" />
                  </Link>
                </>
              )}
            </div>

            {!hydrated ? (
              <div className="ml-2 w-28 h-9 rounded-full bg-neutral-800/80 animate-pulse" />
            ) : !account ? (
              <Link
                href="/login"
                className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
              >
                Iniciar sesión
              </Link>
            ) : (
              <UserAvatar account={account} />
            )}
          </div>

          {/* Centro */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4 flex justify-center">
            <SearchBar />
          </div>
        </div>

        {/* ---------------- Mobile ---------------- */}
        <div className="lg:hidden relative flex items-center justify-between h-16 px-2">
          {/* Izquierda: menú */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
              title="Menú"
              aria-label="Abrir menú"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Centro: logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Link href="/" className="block h-10 overflow-hidden">
              <div className="h-full w-[140px] flex items-center justify-center overflow-hidden">
                <img
                  src="/TheShowVerse2.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[2.2] origin-center"
                />
              </div>
            </Link>
          </div>

          {/* Derecha: búsqueda + perfil */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-1">
            <button
              onClick={() => setShowMobileSearch(true)}
              className="p-2 rounded-full transition-colors text-neutral-300 hover:text-white hover:bg-white/5"
              title="Buscar"
              aria-label="Buscar"
            >
              <SearchIcon className="w-6 h-6" />
            </button>

            {!hydrated ? (
              <div className="w-9 h-9 rounded-full bg-neutral-800/80 animate-pulse" />
            ) : !account ? (
              <Link
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              >
                Acceder
              </Link>
            ) : (
              <UserAvatar account={account} />
            )}
          </div>
        </div>
      </motion.nav>

      {/* ===================== BOTTOM BAR (MÓVIL) ===================== */}
      <motion.div
        animate={bottomAnimate}
        transition={{ type: 'tween', duration: 0.18 }}
        className="lg:hidden fixed bottom-0 left-0 z-30 w-full h-16 bg-black/95 backdrop-blur-md border-t border-neutral-800 flex items-center justify-around will-change-transform"
      >
        <Link href="/movies" className={navLinkClassMobileBottom('/movies')}>
          <FilmIcon className="w-6 h-6" />
          <span className="text-xs">Películas</span>
        </Link>

        <Link href="/series" className={navLinkClassMobileBottom('/series')}>
          <TvIcon className="w-6 h-6" />
          <span className="text-xs">Series</span>
        </Link>

        <Link href={favHref} className={navLinkClassMobileBottom('/favorites')}>
          <Heart className="w-6 h-6" />
          <span className="text-xs">Favoritas</span>
        </Link>

        <Link href={watchHref} className={navLinkClassMobileBottom('/watchlist')}>
          <Bookmark className="w-6 h-6" />
          <span className="text-xs">Pendientes</span>
        </Link>
      </motion.div>

      {/* ===================== DRAWER MENÚ (MÓVIL) ===================== */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="h-full w-[280px] bg-[#0b0b0b] border-r border-neutral-800 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block h-10 overflow-hidden"
                >
                  <div className="h-full w-[140px] flex items-center justify-center overflow-hidden">
                    <img
                      src="/TheShowVerse2.png"
                      alt="The Show Verse"
                      className="h-full w-auto object-contain scale-[2.2] origin-center"
                    />
                  </div>
                </Link>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Cerrar menú"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="mt-5 space-y-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <HomeIcon className="w-5 h-5" />
                  <span>Inicio</span>
                </Link>

                <Link
                  href="/movies"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/movies') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <FilmIcon className="w-5 h-5" />
                  <span>Películas</span>
                </Link>

                <Link
                  href="/series"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/series') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <TvIcon className="w-5 h-5" />
                  <span>Series</span>
                </Link>

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href={favHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/favorites') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <Heart className="w-5 h-5" />
                  <span>Favoritas</span>
                </Link>

                <Link
                  href={watchHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/watchlist') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <Bookmark className="w-5 h-5" />
                  <span>Pendientes</span>
                </Link>

                {/* Extras opcionales (si quieres mantenerlos accesibles sin ocupar el bottom nav) */}
                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href="/news"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/news') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <NewspaperIcon className="w-5 h-5" />
                  <span>Noticias</span>
                </Link>

                <Link
                  href="/calendar"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive('/calendar') ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                    }`}
                >
                  <CalendarDaysIcon className="w-5 h-5" />
                  <span>Calendario</span>
                </Link>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== OVERLAY BÚSQUEDA (MÓVIL) ===================== */}
      <AnimatePresence>
        {showMobileSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-lg flex flex-col items-center gap-6 p-4 pt-10"
          >
            <button
              onClick={() => setShowMobileSearch(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              aria-label="Cerrar búsqueda"
            >
              <XIcon className="w-7 h-7" />
            </button>
            <div className="w-full max-w-lg">
              <SearchBar onResultClick={() => setShowMobileSearch(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
