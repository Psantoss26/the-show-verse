// src/app/api/trakt/auth/status/route.js
import { NextResponse } from 'next/server'
import {
    getValidTraktToken,
    setTraktCookies,
    clearTraktCookies,
    traktApi
} from '@/lib/trakt/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
    try {
        const cookieStore = request.cookies
        const { token, refreshedTokens, shouldClear } = await getValidTraktToken(cookieStore)

        if (!token) {
            const res = NextResponse.json({ connected: false })
            if (shouldClear) clearTraktCookies(res)
            return res
        }

        const auth = await traktApi('/users/settings', { token })
        if (!auth.ok) {
            const res = NextResponse.json({ connected: false })
            clearTraktCookies(res)
            return res
        }

        const res = NextResponse.json({
            connected: true,
            user: auth.json?.user || null
        })

        if (refreshedTokens) setTraktCookies(res, refreshedTokens)
        return res
    } catch (e) {
        return NextResponse.json({ connected: false, error: e?.message || 'Status failed' }, { status: 500 })
    }
}
