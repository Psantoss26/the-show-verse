'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'

export default function UserAvatar({ account }) {
  const { session } = useAuth()
  const [traktAvatarUrl, setTraktAvatarUrl] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadTraktAvatar() {
      try {
        const res = await fetch('/api/trakt/profile?userOnly=1', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const url = data?.user?.avatarUrl
        if (url && !cancelled) setTraktAvatarUrl(url)
      } catch {
        // Trakt no conectado — no pasa nada, usamos fallback
      }
    }
    loadTraktAvatar()
    return () => { cancelled = true }
  }, [session])

  // Fallback: avatar TMDb si Trakt no tiene imagen
  const tmdbAvatarUrl = account?.avatar?.tmdb?.avatar_path
    ? `https://image.tmdb.org/t/p/w64_and_h64_face${account.avatar.tmdb.avatar_path}`
    : '/default-avatar.png'

  const avatarSrc = traktAvatarUrl || tmdbAvatarUrl

  return (
    <Link
      href="/profile"
      title="Mi perfil"
      className="flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200"
    >
      <div className="w-9 h-9 rounded-full overflow-hidden">
        <img
          src={avatarSrc}
          alt={account?.username || 'Usuario'}
          className="w-full h-full object-cover"
        />
      </div>
    </Link>
  )
}
