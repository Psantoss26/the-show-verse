'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null)
  const [account, setAccount] = useState(null)

  useEffect(() => {
    const storedSession = localStorage.getItem('tmdb_session')
    const storedAccount = localStorage.getItem('tmdb_account')

    if (storedSession && storedAccount) {
      setSession(storedSession)
      setAccount(JSON.parse(storedAccount))
    }

    const updateOnStorage = () => {
      const session = localStorage.getItem('tmdb_session')
      const account = localStorage.getItem('tmdb_account')
      setSession(session)
      setAccount(account ? JSON.parse(account) : null)
    }

    window.addEventListener('storage', updateOnStorage)
    return () => window.removeEventListener('storage', updateOnStorage)
  }, [])

  const login = ({ session_id, account }) => {
    localStorage.setItem('tmdb_session', session_id)
    localStorage.setItem('tmdb_account', JSON.stringify(account))
    setSession(session_id)
    setAccount(account)
  }

  const logout = () => {
    localStorage.removeItem('tmdb_session')
    localStorage.removeItem('tmdb_account')
    setSession(null)
    setAccount(null)
  }

  return (
    <AuthContext.Provider value={{ session, account, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
