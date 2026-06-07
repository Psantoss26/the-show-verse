'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function UserAvatar() {
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

  if (loading) {
    return (
      <Link
        href="/profile"
        title="Mi perfil"
        className="flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200"
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-800">
          <div className="w-full h-full animate-pulse" />
        </div>
      </Link>
    )
  }

  const avatarSrc = traktAvatarUrl || '/default-avatar.png'

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
