'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UserAvatar({ account }) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem('tmdb_session')
    localStorage.removeItem('tmdb_account')
    router.push('/')
    router.refresh()
  }

  return (
    <div className="relative z-50">
      <div
        className="w-10 h-10 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <img
          src={
            account.avatar?.tmdb?.avatar_path
              ? `https://image.tmdb.org/t/p/w64_and_h64_face${account.avatar.tmdb.avatar_path}`
              : '/default-avatar.png'
          }
          alt={account.username}
          className="w-10 h-10 rounded-full border border-gray-600 object-cover"
        />
      </div>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-44 bg-black border border-gray-700 shadow-lg rounded-lg py-2">
          <a
            href="/profile"
            className="block w-full text-left px-4 py-2 text-white hover:bg-gray-800"
          >
            Mi perfil
          </a>
          <button
            onClick={handleLogout}
            className="block w-full text-left px-4 py-2 text-red-400 hover:bg-gray-800"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
