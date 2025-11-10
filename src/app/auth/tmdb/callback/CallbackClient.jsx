'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function CallbackClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const requestToken = searchParams.get('request_token')
    const approved = searchParams.get('approved')

    // Aquí pones tu lógica actual:
    //  - guardar el sessionId
    //  - llamar a tu API interna
    //  - redirigir al dashboard, etc.
    //
    // Ejemplo muy genérico:
    async function handleTmdbCallback() {
      if (!requestToken || approved !== 'true') {
        router.push('/auth/error')
        return
      }

      try {
        // Llama a tu endpoint que intercambia request_token por session_id
        const res = await fetch('/api/auth/tmdb/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestToken }),
        })

        if (!res.ok) throw new Error('Error al autenticar con TMDb')

        // Cuando todo vaya bien, redirige a tu dashboard principal
        router.push('/')
      } catch (err) {
        console.error(err)
        router.push('/auth/error')
      }
    }

    handleTmdbCallback()
  }, [searchParams, router])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-lg">Procesando autenticación con TMDb...</p>
    </main>
  )
}
