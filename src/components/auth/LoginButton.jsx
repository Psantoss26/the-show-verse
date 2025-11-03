'use client'

import { createRequestToken } from '@/lib/api/auth'

export default function LoginButton() {
  const handleLogin = async () => {
    const token = await createRequestToken()
    window.location.href = `https://www.themoviedb.org/authenticate/${token}?redirect_to=${window.location.origin}/auth/callback?request_token=${token}`
  }

  return (
    <button
      onClick={handleLogin}
      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
    >
      Iniciar sesión
    </button>
  )
}
