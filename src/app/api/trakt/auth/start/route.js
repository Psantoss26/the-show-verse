// /src/app/api/trakt/auth/start/route.js
import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanOrigin(s) {
    return String(s || "").replace(/\/+$/, "")
}

function originFromRequest(req) {
    // ✅ 1) Forzar origin estable (RECOMENDADO en Vercel)
    // Pon en Vercel: TRAKT_APP_ORIGIN=https://the-show-verse.vercel.app
    const forced =
        process.env.TRAKT_APP_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL

    if (forced) return cleanOrigin(forced)

    // ✅ 2) Next URL origin (suele ir bien)
    const nextOrigin = req?.nextUrl?.origin
    if (nextOrigin && nextOrigin !== "null") return cleanOrigin(nextOrigin)

    // ✅ 3) Headers (fallback robusto, limpiando comas)
    const h = headers()
    const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim()
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim()

    // ✅ 4) Vercel env fallback
    if (!host && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

    return `${proto}://${host}`
}

function randomState() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

export async function GET(req) {
    const clientId = process.env.TRAKT_CLIENT_ID
    if (!clientId) {
        return NextResponse.json({ error: "Missing TRAKT_CLIENT_ID" }, { status: 500 })
    }

    const origin = originFromRequest(req)
    const redirectUri = `${origin}/api/trakt/auth/callback`

    const state = randomState()
    cookies().set("trakt_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 10 * 60,
    })

    const url =
        `https://trakt.tv/oauth/authorize` +
        `?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`

    // ✅ DEBUG: abre /api/trakt/auth/start?debug=1 en Vercel para ver el redirect real
    if (req?.nextUrl?.searchParams?.get("debug") === "1") {
        return NextResponse.json({ origin, redirectUri, authorizeUrl: url })
    }

    return NextResponse.redirect(url)
}
