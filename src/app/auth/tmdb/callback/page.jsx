'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSession, getAccount } from '@/lib/api/auth'
import { useAuth } from '@/context/AuthContext'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const requestToken = searchParams.get('request_token')
    const approved = searchParams.get('approved')

    if (!requestToken || approved !== 'true') {
      setError('Autenticación cancelada o inválida')
      return
    }

    const finishLogin = async () => {
      try {
        const session_id = await createSession(requestToken)
        const account = await getAccount(session_id)

        login({ session_id, account })
        router.replace('/')
      } catch (e) {
        console.error(e)
        setError('No se pudo completar el inicio de sesión con TMDb')
      }
    }

    finishLogin()
  }, [searchParams, login, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-white">
      Completando inicio de sesión...
    </div>
  )
}
