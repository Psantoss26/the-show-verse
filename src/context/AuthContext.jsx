'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [account, setAccount] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const storedSession = localStorage.getItem('tmdb_session')
      const storedAccount = localStorage.getItem('tmdb_account')

      if (storedSession) setSession(storedSession)
      if (storedAccount) setAccount(JSON.parse(storedAccount))
    } catch (e) {
      console.warn('Error leyendo sesión TMDb desde localStorage', e)
      localStorage.removeItem('tmdb_session')
      localStorage.removeItem('tmdb_account')
      setSession(null)
      setAccount(null)
    }
  }, [])

  const login = ({ session_id, account }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tmdb_session', session_id)
      localStorage.setItem('tmdb_account', JSON.stringify(account))
      // cookie para rutas API/server
      document.cookie = `tmdb_session=${encodeURIComponent(
        session_id
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
  // si por algún motivo se usa fuera del provider, evitamos un crash feo
  if (!ctx) {
    console.warn('useAuth se ha usado fuera de <AuthProvider>')
    return { session: null, account: null, login: () => {}, logout: () => {} }
  }
  return ctx
}
