'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LegacyTmdbCallback() {
  const router = useRouter()
  const sp = useSearchParams()

  useEffect(() => {
    // reenvía todo tal cual
    const qs = sp?.toString() || ''
    router.replace(`/auth/callback${qs ? `?${qs}` : ''}`)
  }, [router, sp])

  return null
}