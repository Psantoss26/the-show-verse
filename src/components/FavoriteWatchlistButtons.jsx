'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
} from '@/lib/api/tmdb'
import { traktGetItemStatus } from '@/lib/api/traktClient'
import TwoApiSyncIcon, {
  getTwoApiNextValue,
  getTwoApiSyncTitle,
} from '@/components/TwoApiSyncIcon'
import {
  Heart,
  BookmarkPlus,
  Loader2,
  LogIn,
} from 'lucide-react'

export default function FavoriteWatchlistButtons({ type, mediaId }) {
  const { session, account } = useAuth()
  const [loadingStates, setLoadingStates] = useState(true)
  const [favorite, setFavorite] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [traktState, setTraktState] = useState({
    connected: false,
    favorite: false,
    inWatchlist: false,
  })
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadStates = async () => {
      if (!session || !account?.id) {
        setLoadingStates(false)
        return
      }

      try {
        const traktType = type === 'tv' ? 'show' : type
        const [states, traktStatus] = await Promise.all([
          getMediaAccountStates(type, mediaId, session),
          traktGetItemStatus({
            type: traktType,
            tmdbId: mediaId,
          }).catch(() => ({ connected: false })),
        ])
        setFavorite(states.favorite)
        setWatchlist(states.watchlist)
        setTraktState({
          connected: !!traktStatus?.connected,
          favorite: !!traktStatus?.favorite,
          inWatchlist: !!traktStatus?.inWatchlist,
        })
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
    const traktFavorite = !!traktState.connected && !!traktState.favorite
    const next = getTwoApiNextValue(favorite, traktFavorite)

    // Optimista
    setFavorite(next)

    try {
      const result = await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId,
        favorite: next,
      })
      setTraktState((prev) => ({
        ...prev,
        favorite: result?.trakt?.synced ? next : !!prev.favorite,
      }))
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
    const traktWatchlist =
      !!traktState.connected && !!traktState.inWatchlist
    const next = getTwoApiNextValue(watchlist, traktWatchlist)

    // Optimista
    setWatchlist(next)

    try {
      const result = await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId,
        watchlist: next,
      })
      setTraktState((prev) => ({
        ...prev,
        inWatchlist: result?.trakt?.synced ? next : !!prev.inWatchlist,
      }))
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
  const traktFavorite = !!traktState.connected && !!traktState.favorite
  const traktWatchlist = !!traktState.connected && !!traktState.inWatchlist
  const favoriteActive = favorite || traktFavorite
  const watchlistActive = watchlist || traktWatchlist

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {/* FAVORITO */}
        <button
          onClick={handleToggleFavorite}
          disabled={isBusy}
          className={`${baseBtn} ${favoriteActive ? 'bg-red-600 hover:bg-red-500 text-white' : favClass}`}
          title={getTwoApiSyncTitle({
            label: 'Favorito',
            tmdbActive: favorite,
            traktActive: traktFavorite,
            addLabel: 'Añadir a favoritos',
            removeLabel: 'Quitar de favoritos',
          })}
          aria-label={getTwoApiSyncTitle({
            label: 'Favorito',
            tmdbActive: favorite,
            traktActive: traktFavorite,
            addLabel: 'Añadir a favoritos',
            removeLabel: 'Quitar de favoritos',
          })}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TwoApiSyncIcon
              icon={Heart}
              tmdbActive={favorite}
              traktActive={traktFavorite}
              className="w-4 h-4"
            />
          )}
          <span>
            {favoriteActive ? 'Favorito' : 'Añadir a favoritos'}
          </span>
        </button>

        {/* PENDIENTES */}
        <button
          onClick={handleToggleWatchlist}
          disabled={isBusy}
          className={`${baseBtn} ${watchlistActive ? 'bg-blue-600 hover:bg-blue-500 text-white' : watchClass}`}
          title={getTwoApiSyncTitle({
            label: 'Pendientes',
            tmdbActive: watchlist,
            traktActive: traktWatchlist,
            addLabel: 'Añadir a pendientes',
            removeLabel: 'Quitar de pendientes',
          })}
          aria-label={getTwoApiSyncTitle({
            label: 'Pendientes',
            tmdbActive: watchlist,
            traktActive: traktWatchlist,
            addLabel: 'Añadir a pendientes',
            removeLabel: 'Quitar de pendientes',
          })}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TwoApiSyncIcon
              icon={BookmarkPlus}
              tmdbActive={watchlist}
              traktActive={traktWatchlist}
              className="w-4 h-4"
            />
          )}
          <span>
            {watchlistActive ? 'Pendiente' : 'Añadir a pendientes'}
          </span>
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
