'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function getTmdbAvatarUrl(account) {
  const tmdbPath = account?.avatar?.tmdb?.avatar_path
  if (tmdbPath) return `https://image.tmdb.org/t/p/w185${tmdbPath}`

  const gravatarHash = account?.avatar?.gravatar?.hash
  if (gravatarHash) return `https://www.gravatar.com/avatar/${gravatarHash}?s=96&d=identicon`

  return null
}

export default function UserAvatar({ account }) {
  const [traktAvatarUrl, setTraktAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadTraktAvatar() {
      try {
        const res = await fetch('/api/trakt/profile?userOnly=1', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setLoading(false)
          return
        }
        const data = await res.json()
        const url = data?.user?.avatarUrl
        if (!cancelled) {
          if (url) setTraktAvatarUrl(url)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    loadTraktAvatar()
    return () => { cancelled = true }
  }, [])

  const tmdbAvatarUrl = getTmdbAvatarUrl(account)

  if (loading) {
    return (
      <Link
        href="/profile"
        title="Mi perfil"
        className="flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200"
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-800">
          {tmdbAvatarUrl ? (
            <img
              src={tmdbAvatarUrl}
              alt="Usuario"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full animate-pulse" />
          )}
        </div>
      </Link>
    )
  }

  const avatarSrc = traktAvatarUrl || tmdbAvatarUrl || '/default-avatar.png'

  return (
    <Link
      href="/profile"
      title="Mi perfil"
      className="flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200"
    >
      <div className="w-9 h-9 rounded-full overflow-hidden">
        <img
          src={avatarSrc}
          alt="Usuario"
          className="w-full h-full object-cover"
        />
      </div>
    </Link>
  )
}
