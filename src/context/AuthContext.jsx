// /src/context/AuthContext.jsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({
  children,
  initialSession = null,
  initialAccount = null,
}) => {
  const [session, setSession] = useState(initialSession)
  const [account, setAccount] = useState(initialAccount)

  // Sincronizar con localStorage solo si desde el servidor no venía nada
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const storedSession = localStorage.getItem('tmdb_session')
      const storedAccount = localStorage.getItem('tmdb_account')

      if (!session && storedSession) {
        setSession(storedSession)
      }

      if (!account && storedAccount) {
        setAccount(JSON.parse(storedAccount))
      }
    } catch (e) {
      console.warn('Error leyendo sesión TMDb desde localStorage', e)
      localStorage.removeItem('tmdb_session')
      localStorage.removeItem('tmdb_account')
      setSession(null)
      setAccount(null)
    }
    // queremos que esto se ejecute solo una vez al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = ({ session_id, account }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tmdb_session', session_id)
      localStorage.setItem('tmdb_account', JSON.stringify(account))

      // cookies para que el servidor las pueda leer
      document.cookie = `tmdb_session=${encodeURIComponent(
        session_id
      )}; path=/; max-age=31536000`

      document.cookie = `tmdb_account=${encodeURIComponent(
        JSON.stringify(account)
      )}; path=/; max-age=31536000`
    }

    setSession(session_id)
    setAccount(account)
  }

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('tmdb_session')
      localStorage.removeItem('tmdb_account')

      document.cookie = 'tmdb_session=; path=/; max-age=0'
      document.cookie = 'tmdb_account=; path=/; max-age=0'
    }

    setSession(null)
    setAccount(null)
  }

  return (
    <AuthContext.Provider value={{ session, account, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    console.warn('useAuth se ha usado fuera de <AuthProvider>')
    return { session: null, account: null, login: () => { }, logout: () => { } }
  }
  return ctx
}
