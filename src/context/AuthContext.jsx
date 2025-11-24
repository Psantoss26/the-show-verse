'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [account, setAccount] = useState(null)
  const [hydrated, setHydrated] = useState(false) // 👈 NUEVO

  useEffect(() => {
    // Este efecto solo se ejecuta en el cliente
    if (typeof window === 'undefined') {
      setHydrated(true)
      return
    }

    try {
      const storedSession = window.localStorage.getItem('tmdb_session')
      const storedAccount = window.localStorage.getItem('tmdb_account')

      if (storedSession) {
        setSession(storedSession)
      }

      if (storedAccount) {
        try {
          setAccount(JSON.parse(storedAccount))
        } catch (e) {
          console.warn('tmdb_account corrupto, se limpia', e)
          window.localStorage.removeItem('tmdb_account')
          setAccount(null)
        }
      }
    } catch (e) {
      console.warn('Error leyendo sesión TMDb desde localStorage', e)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('tmdb_session')
        window.localStorage.removeItem('tmdb_account')
      }
      setSession(null)
      setAccount(null)
    } finally {
      // 👇 Muy importante: marcar que ya hemos intentado hidratar
      setHydrated(true)
    }
  }, [])

  const login = ({ session_id, account }) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tmdb_session', session_id)
      window.localStorage.setItem('tmdb_account', JSON.stringify(account))
      document.cookie = `tmdb_session=${encodeURIComponent(
        session_id
      )}; path=/; max-age=31536000`
    }

    setSession(session_id)
    setAccount(account)
    setHydrated(true) // por si acaso
  }

  const logout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('tmdb_session')
      window.localStorage.removeItem('tmdb_account')
      document.cookie = 'tmdb_session=; path=/; max-age=0'
    }

    setSession(null)
    setAccount(null)
    setHydrated(true) // también hemos “terminado de saber” el estado
  }

  return (
    <AuthContext.Provider
      value={{ session, account, login, logout, hydrated }} // 👈 exportamos hydrated
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    console.warn('useAuth se ha usado fuera de <AuthProvider>')
    // devolvemos hydrated: true para no dejar la UI en loading eterno
    return {
      session: null,
      account: null,
      login: () => { },
      logout: () => { },
      hydrated: true,
    }
  }
  return ctx
}
