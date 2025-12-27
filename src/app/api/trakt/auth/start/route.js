// /src/app/api/trakt/auth/start/route.js
import { NextResponse } from "next/server"
import { headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanOrigin(s) {
    return String(s || "").replace(/\/+$/, "")
}

async function originFromRequest(req) {
    // ✅ Forzar dominio estable (RECOMENDADO)
    // En Vercel pon: TRAKT_APP_ORIGIN=https://the-show-verse.vercel.app
    const forced =
        process.env.TRAKT_APP_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL

    if (forced) return cleanOrigin(forced)

    // ✅ Suele ir bien en App Router
    const nextOrigin = req?.nextUrl?.origin
    if (nextOrigin && nextOrigin !== "null") return cleanOrigin(nextOrigin)

    // ✅ Fallback headers (limpiando valores con coma)
    const h = await headers()
    const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim()
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim()

    if (host) return `${proto}://${host}`
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

    return "http://localhost:3000"
}

function randomState() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function sanitizeNextPath(nextPath) {
    // evita open-redirect: solo rutas internas
    if (!nextPath || typeof nextPath !== "string") return "/history"
    if (!nextPath.startsWith("/")) return "/history"
    return nextPath
}

export async function GET(req) {
    const clientId = process.env.TRAKT_CLIENT_ID
    if (!clientId) {
        return NextResponse.json({ error: "Missing TRAKT_CLIENT_ID" }, { status: 500 })
    }

    const origin = await originFromRequest(req)
    const redirectUri = `${origin}/api/trakt/auth/callback`

    const state = randomState()
    const nextPath = sanitizeNextPath(req?.nextUrl?.searchParams?.get("next") || "/history")

    const url =
        `https://trakt.tv/oauth/authorize` +
        `?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`

    // ✅ Debug opcional: /api/trakt/auth/start?debug=1
    if (req?.nextUrl?.searchParams?.get("debug") === "1") {
        return NextResponse.json({ origin, redirectUri, nextPath, authorizeUrl: url })
    }

    const res = NextResponse.redirect(url)

    const secure = origin.startsWith("https://")

    res.cookies.set("trakt_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 10 * 60, // 10 min
    })

    // ✅ guardamos a dónde volver tras callback
    res.cookies.set("trakt_oauth_next", nextPath, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 10 * 60,
    })

    return res
}
