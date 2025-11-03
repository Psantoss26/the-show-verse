'use client'

import { useEffect, useState } from 'react'

export default function useAuth() {
  const [account, setAccount] = useState(null)

  useEffect(() => {
    const storedAccount = localStorage.getItem('tmdb_account')
    if (storedAccount) {
      setAccount(JSON.parse(storedAccount))
    }

    const handleStorageChange = () => {
      const updated = localStorage.getItem('tmdb_account')
      if (updated) {
        setAccount(JSON.parse(updated))
      } else {
        setAccount(null)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return { account }
}
