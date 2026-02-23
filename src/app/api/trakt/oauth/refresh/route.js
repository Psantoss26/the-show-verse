import { NextResponse } from "next/server"
import {
    clearTraktCookies,
    refreshAccessToken,
    setTraktCookies,
} from "@/lib/trakt/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function toClientTokenPayload(tokens) {
    const expiresAtMs = Number(tokens?.expires_at_ms || 0)
    const nowMs = Date.now()
    const createdAt = Math.floor(nowMs / 1000)
    const expiresIn = Math.max(1, Math.floor((expiresAtMs - nowMs) / 1000))

    return {
        access_token: tokens?.access_token || null,
        refresh_token: tokens?.refresh_token || null,
        created_at: createdAt,
        expires_in: expiresIn,
    }
}

export async function POST(req) {
    const body = await req.json().catch(() => ({}))
    const cookieRefreshToken = req.cookies.get("trakt_refresh_token")?.value || null
    const refreshToken = body?.refresh_token || cookieRefreshToken

    if (!refreshToken) {
        return NextResponse.json({ error: "Missing refresh_token" }, { status: 400 })
    }

    try {
        const tokens = await refreshAccessToken(refreshToken)
        const res = NextResponse.json(toClientTokenPayload(tokens), { status: 200 })

        // Si existen cookies del flujo web, las mantenemos sincronizadas.
        setTraktCookies(res, tokens)
        return res
    } catch (e) {
        const msg = e?.message || "Trakt refresh failed"
        const res = NextResponse.json({ error: msg }, { status: 401 })
        clearTraktCookies(res)
        return res
    }
}
