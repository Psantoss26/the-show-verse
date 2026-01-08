import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function TmdbCallbackRedirect({ searchParams }) {
  const usp = new URLSearchParams()

  for (const [k, v] of Object.entries(searchParams || {})) {
    if (Array.isArray(v)) v.forEach((val) => usp.append(k, val))
    else if (v != null) usp.set(k, v)
  }

  const qs = usp.toString()
  redirect(`/auth/callback${qs ? `?${qs}` : ''}`)
}