'use client'

import { useState, useEffect, useRef } from 'react'
import {
  FilmIcon,
  TvIcon,
  NewspaperIcon,
  CalendarDaysIcon,
  Heart,
  Bookmark,
  Search as SearchIcon,
  HomeIcon,
  XIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import '@/app/globals.css'
import { useAuth } from '@/context/AuthContext'
import UserAvatar from '@/components/auth/UserAvatar'
import { AnimatePresence, motion } from 'framer-motion'

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
                      ? `https://image.tmdb.org/t/p/w92${item.poster_path || item.profile_path
                      }`
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
 * Componente Principal de la Barra de Navegación
 * ==================================================================== */
export default function Navbar() {
  // 👇 ahora usamos también `hydrated`
  const { account, hydrated } = useAuth()
  const pathname = usePathname()
  const [showMobileSearch, setShowMobileSearch] = useState(false)

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

  const navLinkClassMobileTop = (href) =>
    `text-base font-medium transition-colors ${isActive(href) ? 'text-white' : 'text-neutral-400 hover:text-white'
    }`

  const navLinkClassMobileBottom = (href) =>
    `flex flex-col items-center justify-center gap-0.5 px-2 transition-colors w-full ${isActive(href) ? 'text-blue-400' : 'text-neutral-400 hover:text-white'
    }`

  useEffect(() => {
    if (showMobileSearch) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
  }, [showMobileSearch])

  return (
    <>
      {/* --- BARRA DE NAVEGACIÓN PRINCIPAL --- */}
      <nav className="relative sticky top-0 z-40 w-full bg-black/80 backdrop-blur-md border-b border-neutral-800">
        {/* --- LAYOUT DESKTOP (lg:flex) --- */}
        <div className="hidden lg:flex items-center justify-between h-16 py-3">
          {/* 1. IZQUIERDA (Desktop) */}
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
              <Link href="/" className={navLinkClass('/')}>
                Inicio
              </Link>
              <Link href="/movies" className={navLinkClass('/movies')}>
                Películas
              </Link>
              <Link href="/series" className={navLinkClass('/series')}>
                Series
              </Link>
            </div>
          </div>

          {/* 3. DERECHA (Desktop) */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-12">
            <div className="flex items-center gap-2">
              <Link
                href="/news"
                className={iconLinkClass('/news')}
                title="Noticias"
              >
                <NewspaperIcon className="w-5 h-5" />
              </Link>
              <Link
                href="/calendar"
                className={iconLinkClass('/calendar')}
                title="Calendario"
              >
                <CalendarDaysIcon className="w-5 h-5" />
              </Link>

              {hydrated && account && (
                <>
                  <Link
                    href="/favorites"
                    className={iconLinkClass('/favorites')}
                    title="Favoritas"
                  >
                    <Heart className="w-5 h-5" />
                  </Link>
                  <Link
                    href="/watchlist"
                    className={iconLinkClass('/watchlist')}
                    title="Pendientes"
                  >
                    <Bookmark className="w-5 h-5" />
                  </Link>
                </>
              )}
            </div>

            {/* 👇 Zona login / avatar sin parpadeo */}
            {!hydrated ? (
              // Skeleton mientras no sabemos si hay sesión
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

          {/* 2. CENTRO (Desktop - Absoluto) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4 flex justify-center">
            <SearchBar />
          </div>
        </div>

        {/* --- LAYOUT MÓVIL (lg:hidden) --- */}
        <div className="lg:hidden relative flex items-center justify-between h-16">
          {/* 1. IZQUIERDA (Móvil): Logo */}
          <div className="flex-shrink-0 pl-2">
            <Link href="/" className="block h-10 overflow-hidden -ml-6">
              <div className="h-full w-[140px] flex items-center justify-center overflow-hidden">
                <img
                  src="/TheShowVerse2.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[2.2] origin-left"
                />
              </div>
            </Link>
          </div>

          {/* 2. CENTRO (Móvil - Absoluto) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-5 -ml-1">
            <Link href="/movies" className={navLinkClassMobileTop('/movies')}>
              Películas
            </Link>
            <Link href="/series" className={navLinkClassMobileTop('/series')}>
              Series
            </Link>
          </div>

          {/* 3. DERECHA (Móvil): Búsqueda y Perfil */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-10">
            <button
              onClick={() => setShowMobileSearch(true)}
              className="p-2 rounded-full transition-colors text-neutral-400 hover:text-white hover:bg-white/5"
              title="Buscar"
            >
              <SearchIcon className="w-6 h-6" />
            </button>

            {!hydrated ? (
              // Skeleton redondo mientras se hidrata auth
              <div className="w-8 h-8 rounded-full bg-neutral-800/80 animate-pulse" />
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
      </nav>

      {/* --- BARRA DE NAVEGACIÓN INFERIOR (MÓVIL) --- */}
      <div className="lg:hidden fixed bottom-0 left-0 z-30 w-full h-16 bg-black border-t border-neutral-800 flex justify-around items-center">
        <Link href="/" className={navLinkClassMobileBottom('/')}>
          <HomeIcon className="w-6 h-6" />
          <span className="text-xs">Inicio</span>
        </Link>
        <Link href="/news" className={navLinkClassMobileBottom('/news')}>
          <NewspaperIcon className="w-6 h-6" />
          <span className="text-xs">Noticias</span>
        </Link>
        <Link href="/calendar" className={navLinkClassMobileBottom('/calendar')}>
          <CalendarDaysIcon className="w-6 h-6" />
          <span className="text-xs">Calendario</span>
        </Link>

        {hydrated && account && (
          <>
            <Link
              href="/favorites"
              className={navLinkClassMobileBottom('/favorites')}
            >
              <Heart className="w-6 h-6" />
              <span className="text-xs">Favoritas</span>
            </Link>
            <Link
              href="/watchlist"
              className={navLinkClassMobileBottom('/watchlist')}
            >
              <Bookmark className="w-6 h-6" />
              <span className="text-xs">Pendientes</span>
            </Link>
          </>
        )}
      </div>

      {/* --- OVERLAY DE BÚSQUEDA (MÓVIL) --- */}
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
