// src/app/api/trakt/auth/disconnect/route.js
import { NextResponse } from 'next/server'
import { clearTraktCookies } from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
    const res = NextResponse.json({ ok: true })
    clearTraktCookies(res)
    return res
}
