// /lib/hooks/useAuth.js
'use client'
import { useEffect, useState } from 'react'

const SESSION_KEY = 'tmdb_session_id'
const ACCOUNT_KEY = 'tmdb_account'

export default function useAuth() {
  const [account, setAccount] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    try {
      const acc = localStorage.getItem(ACCOUNT_KEY)
      if (acc) setAccount(JSON.parse(acc))
      const sid = localStorage.getItem(SESSION_KEY)
      if (sid) setSessionId(sid)
    } catch {}

    const onStorage = (e) => {
      if (e.key === ACCOUNT_KEY) {
        setAccount(e.newValue ? JSON.parse(e.newValue) : null)
      }
      if (e.key === SESSION_KEY) {
        setSessionId(e.newValue || null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Validación silenciosa (evita sesiones caducadas/incorrectas)
  useEffect(() => {
    let ignore = false
    const check = async () => {
      if (!sessionId) { setChecking(false); return }
      try {
        const r = await fetch(`/api/tmdb/account?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' })
        if (!r.ok) {
          // sesión inválida → limpia
          localStorage.removeItem(SESSION_KEY)
          localStorage.removeItem(ACCOUNT_KEY)
          if (!ignore) {
            setSessionId(null)
            setAccount(null)
          }
        }
      } catch {}
      if (!ignore) setChecking(false)
    }
    check()
    return () => { ignore = true }
  }, [sessionId])

  return { account, sessionId, checking }
}
