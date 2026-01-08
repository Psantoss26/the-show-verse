import { Suspense } from 'react'
import LoginClient from './LoginClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function LoginPage({ searchParams }) {
  const rawNext = typeof searchParams?.next === 'string' ? searchParams.next : '/'
  const next = rawNext.startsWith('/') ? rawNext : '/'

  return (
    <Suspense fallback={null}>
      <LoginClient next={next} />
    </Suspense>
  )
}