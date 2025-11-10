'use client'

import { createRequestToken } from '@/lib/api/auth'

export default function LoginButton() {
  const handleLogin = async () => {
    try {
      const token = await createRequestToken()
      const redirectUrl = `${window.location.origin}/auth/callback`

      window.location.href =
        `https://www.themoviedb.org/authenticate/${token}` +
        `?redirect_to=${encodeURIComponent(redirectUrl)}`
    } catch (e) {
      console.error('Error iniciando login TMDb', e)
      alert('No se pudo iniciar el inicio de sesión con TMDb')
    }
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
