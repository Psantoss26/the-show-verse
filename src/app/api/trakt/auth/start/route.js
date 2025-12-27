import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function randomState() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function safeNextPath(p) {
    // solo permitimos rutas internas (evita open-redirect)
    if (!p) return "/history"
    if (typeof p !== "string") return "/history"
    if (!p.startsWith("/")) return "/history"
    if (p.startsWith("//")) return "/history"
    return p
}

export async function GET(request) {
    const clientId = process.env.TRAKT_CLIENT_ID
    if (!clientId) {
        return NextResponse.json({ error: "Missing TRAKT_CLIENT_ID" }, { status: 500 })
    }

    // ✅ en Vercel esto es lo más fiable
    const origin = request.nextUrl.origin
    const redirectUri = `${origin}/api/trakt/auth/callback`

    const state = randomState()
    const secure = process.env.NODE_ENV === "production"

    // ✅ donde volver después de autorizar
    const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"))

    const url =
        `https://trakt.tv/oauth/authorize` +
        `?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`

    const res = NextResponse.redirect(url)

    // ✅ state cookie
    res.cookies.set("trakt_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 10 * 60,
    })

    // ✅ cookie con destino post-login
    res.cookies.set("trakt_post_auth_redirect", nextPath, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 10 * 60,
    })

    return res
}
