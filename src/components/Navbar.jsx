'use client'

import { useState, useEffect, useRef } from 'react'
import {
  FilmIcon,
  TvIcon,
  NewspaperIcon,
  SearchIcon,
  CalendarDaysIcon,
  Heart,
  Bookmark,
} from 'lucide-react'
import Link from 'next/link'
import '@/app/globals.css'
import { useAuth } from '@/context/AuthContext'
import UserAvatar from '@/components/auth/UserAvatar'

export default function Navbar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)
  const { account } = useAuth()

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
          query
        )}`
      )
      const data = await res.json()
      setResults(data.results || [])
      setShowDropdown(true)
    } catch (err) {
      console.error('Error buscando en TMDb:', err)
    }
  }

  return (
    <nav className="px-4 py-6 flex flex-wrap items-center justify-between gap-4 sm:gap-0 sm:flex-nowrap bg-black">
      {/* Logo */}
      <div className="w-full sm:w-auto flex justify-center sm:justify-start items-center">
        <Link href="/" className="block h-14 overflow-hidden">
          <div className="h-full w-[150px] md:w-[180px] flex items-center justify-center sm:justify-start overflow-hidden">
            <img
              src="/TheShowVerse2.png"
              alt="Logo The Show Verse"
              className="
                h-full w-auto object-contain
                scale-[2.3] sm:scale-[2.3]
                origin-center sm:origin-left
                transition-transform duration-300
                hover:scale-[2.0]
              "
            />
          </div>
        </Link>
      </div>

      {/* Barra de búsqueda */}
      <div
        className="w-full sm:flex-grow sm:max-w-xl sm:mx-8 sm:px-4 relative"
        ref={searchRef}
      >
        <form onSubmit={handleSearch} className="flex w-full">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar películas, series o actores..."
            className="w-full px-4 py-2 bg-[#1F1F1F] text-white rounded-l-3xl border border-[#333] focus:outline-none focus:ring-1 focus:ring-blue-600 placeholder:text-gray-400"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-r-3xl flex items-center justify-center"
          >
            <SearchIcon className="text-white" />
          </button>
        </form>

        {showDropdown && results.length > 0 && (
          <div className="absolute top-full left-0 w-full bg-[#121212] text-white mt-2 rounded-2xl shadow-2xl max-h-[550px] overflow-y-auto z-50 border border-[#2a2a2a] backdrop-blur-md no-scrollbar">
            {results.map((item) => (
              <Link
                key={`${item.media_type}-${item.id}`}
                href={`/details/${item.media_type}/${item.id}`}
                onClick={() => {
                  setShowDropdown(false)
                  setQuery('')
                }}
                className="flex items-center gap-4 px-4 py-3 hover:bg-[#1f1f1f] transition-colors cursor-pointer"
              >
                <img
                  src={
                    item.poster_path || item.profile_path
                      ? `https://image.tmdb.org/t/p/w92${
                          item.poster_path || item.profile_path
                        }`
                      : '/default-poster.png'
                  }
                  alt={item.title || item.name || 'Resultado'}
                  className="w-16 h-auto rounded-lg shadow-md object-cover"
                />
                <div>
                  <p className="font-semibold text-base">
                    {item.title || item.name || item.original_title}
                  </p>
                  <p className="text-sm text-gray-400 capitalize">
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
          </div>
        )}
      </div>

      {/* Navegación derecha */}
      <div className="w-full sm:w-auto flex justify-around sm:justify-end items-center gap-4 text-white text-sm">
        <Link href="/movies" className="hover:text-blue-500 transition-colors">
          <FilmIcon className="w-6 h-6" />
        </Link>
        <Link href="/series" className="hover:text-blue-500 transition-colors">
          <TvIcon className="w-6 h-6" />
        </Link>
        <Link href="/news" className="hover:text-blue-500 transition-colors">
          <NewspaperIcon className="w-6 h-6" />
        </Link>
        <Link
          href="/calendar"
          className="hover:text-blue-500 transition-colors"
        >
          <CalendarDaysIcon className="w-6 h-6" />
        </Link>

        {/* Favoritas / Pendientes solo si hay usuario */}
        {account && (
          <>
            <Link
              href="/favorites"
              className="hover:text-red-400 transition-colors flex items-center"
              title="Favoritas"
            >
              <Heart className="w-6 h-6" />
            </Link>
            <Link
              href="/watchlist"
              className="hover:text-blue-400 transition-colors flex items-center"
              title="Pendientes"
            >
              <Bookmark className="w-6 h-6" />
            </Link>
          </>
        )}

        {/* Login / Avatar */}
        {!account ? (
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors"
          >
            Iniciar sesión
          </Link>
        ) : (
          <UserAvatar account={account} />
        )}
      </div>
    </nav>
  )
}
