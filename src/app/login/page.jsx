// /src/app/login/page.jsx
import { Suspense } from 'react'
import LoginClient from './LoginClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LoginPage({ searchParams }) {
  // Next (App Router) puede pasar searchParams como Promise
  const sp = await Promise.resolve(searchParams)

  const rawNext = typeof sp?.next === 'string' ? sp.next : '/'
  const next = rawNext.startsWith('/') ? rawNext : '/'

  return (
    <Suspense fallback={null}>
      <LoginClient next={next} />
    </Suspense>
  )
}
