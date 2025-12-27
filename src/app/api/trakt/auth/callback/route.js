// /src/app/api/trakt/auth/callback/route.js
import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { setTraktCookies } from "@/lib/trakt/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function originFromHeaders() {
    const h = headers()
    const proto = h.get("x-forwarded-proto") || "http"
    const host = h.get("x-forwarded-host") || h.get("host")
    return `${proto}://${host}`
}

function safeNextPath(p) {
    // evita open-redirect
    if (!p || typeof p !== "string") return "/history"
    if (!p.startsWith("/")) return "/history"
    if (p.startsWith("//")) return "/history"
    return p
}

export async function GET(req) {
    const clientId = process.env.TRAKT_CLIENT_ID
    const clientSecret = process.env.TRAKT_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "Missing TRAKT_CLIENT_ID/SECRET" }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    const store = cookies()

    const expected = store.get("trakt_oauth_state")?.value
    if (!code || !state || !expected || state !== expected) {
        return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 })
    }

    // ✅ origin robusto en Vercel
    const origin = req?.nextUrl?.origin || originFromHeaders()
    const redirectUri = `${origin}/api/trakt/auth/callback`

    // ✅ endpoint correcto (api.trakt.tv)
    const tokenRes = await fetch("https://api.trakt.tv/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    })

    const tokenJson = await tokenRes.json().catch(() => null)
    if (!tokenRes.ok || !tokenJson) {
        return NextResponse.json(
            { error: "Token exchange failed", details: tokenJson },
            { status: 500 }
        )
    }

    // ✅ Calcula expires_at_ms para tu sistema de cookies (getValidTraktToken)
    const createdAtSec = Number(tokenJson.created_at || 0)
    const expiresInSec = Number(tokenJson.expires_in || 0)
    const expiresAtMs = (createdAtSec + expiresInSec) * 1000

    // ✅ destino post-login (lo setea /auth/start con ?next=/history)
    const nextCookie = store.get("trakt_post_auth_redirect")?.value || "/history"
    const nextPath = safeNextPath(nextCookie)

    const res = NextResponse.redirect(`${origin}${nextPath}`)
    const secure = process.env.NODE_ENV === "production"

    // ✅ (1) Compatibilidad antigua (si algo lo sigue leyendo)
    res.cookies.set("trakt_tokens", Buffer.from(JSON.stringify(tokenJson)).toString("base64"), {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    })

    // ✅ (2) Cookies NUEVAS/REALES que usa tu app (/auth/status, /history, /item/watched, etc.)
    setTraktCookies(res, {
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expires_at_ms: expiresAtMs,
    })

    // ✅ limpiar cookies temporales
    res.cookies.set("trakt_oauth_state", "", {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 0,
    })

    res.cookies.set("trakt_post_auth_redirect", "", {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 0,
    })

    return res
}
