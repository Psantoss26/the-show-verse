'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
} from '@/lib/api/tmdb'
import {
  Heart,
  HeartOff,
  BookmarkPlus,
  BookmarkMinus,
  Loader2,
  LogIn,
} from 'lucide-react'

export default function FavoriteWatchlistButtons({ type, mediaId }) {
  const { session, account } = useAuth()
  const [loadingStates, setLoadingStates] = useState(true)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadStates = async () => {
      if (!session || !account?.id) {
        setLoadingStates(false)
        return
      }

      try {
        const states = await getMediaAccountStates(type, mediaId, session)
        setFavorite(states.favorite)
        setWatchlist(states.watchlist)
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingStates(false)
      }
    }

    loadStates()
  }, [session, account, type, mediaId])

  if (!session || !account?.id) {
    return (
      <div className="flex flex-col gap-2 text-sm text-neutral-400">
        <div className="flex items-center gap-2">
          <LogIn className="w-4 h-4" />
          <span>Inicia sesión en TMDb para guardar favoritos y pendientes.</span>
        </div>
      </div>
    )
  }

  const handleToggleFavorite = async () => {
    if (updating) return
    setUpdating(true)
    setError('')
    const next = !favorite

    // Optimista
    setFavorite(next)

    try {
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId,
        favorite: next,
      })
    } catch (e) {
      console.error(e)
      setFavorite(!next) // revertir
      setError('No se pudo actualizar favorito')
    } finally {
      setUpdating(false)
    }
  }

  const handleToggleWatchlist = async () => {
    if (updating) return
    setUpdating(true)
    setError('')
    const next = !watchlist

    // Optimista
    setWatchlist(next)

    try {
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId,
        watchlist: next,
      })
    } catch (e) {
      console.error(e)
      setWatchlist(!next) // revertir
      setError('No se pudo actualizar la lista de pendientes')
    } finally {
      setUpdating(false)
    }
  }

  const isBusy = loadingStates || updating

  const baseBtn =
    'inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed'

  const favClass = favorite
    ? 'bg-red-600 hover:bg-red-500 text-white'
    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border border-neutral-700'

  const watchClass = watchlist
    ? 'bg-blue-600 hover:bg-blue-500 text-white'
    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border border-neutral-700'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {/* FAVORITO */}
        <button
          onClick={handleToggleFavorite}
          disabled={isBusy}
          className={`${baseBtn} ${favClass}`}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : favorite ? (
            <HeartOff className="w-4 h-4" /> // ← aquí el cambio
          ) : (
            <Heart className="w-4 h-4" />
          )}
          <span>
            {favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          </span>
        </button>

        {/* PENDIENTES */}
        <button
          onClick={handleToggleWatchlist}
          disabled={isBusy}
          className={`${baseBtn} ${watchClass}`}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : watchlist ? (
            <BookmarkMinus className="w-4 h-4" />
          ) : (
            <BookmarkPlus className="w-4 h-4" />
          )}
          <span>
            {watchlist ? 'Quitar de pendientes' : 'Añadir a pendientes'}
          </span>
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
