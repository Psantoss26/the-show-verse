// /src/app/api/trakt/auth/callback/route.js
import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"
import { setTraktCookies, clearTraktCookies } from "@/lib/trakt/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function originFromHeaders() {
    const h = headers()
    const proto = h.get("x-forwarded-proto") || "http"
    const host = h.get("x-forwarded-host") || h.get("host")
    return `${proto}://${host}`
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

    const expected = cookies().get("trakt_oauth_state")?.value
    if (!code || !state || !expected || state !== expected) {
        return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 })
    }

    const origin = originFromHeaders()
    const redirectUri = `${origin}/api/trakt/auth/callback`

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
    if (!tokenRes.ok || !tokenJson?.access_token) {
        return NextResponse.json(
            { error: "Token exchange failed", details: tokenJson || {} },
            { status: 500 }
        )
    }

    // ✅ calcular expires_at_ms como espera tu lib
    const createdAtSec = Number(tokenJson.created_at || 0)
    const expiresInSec = Number(tokenJson.expires_in || 0)
    const expiresAtMs = (createdAtSec + expiresInSec) * 1000

    const res = NextResponse.redirect(`${origin}/history`)

    // ✅ guarda cookies correctas (las que usa status/history/item/watched)
    setTraktCookies(res, {
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expires_at_ms: expiresAtMs,
    })

    // ✅ limpia state
    res.cookies.set("trakt_oauth_state", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    })

    // (opcional) limpia cualquier cookie antigua que tengas
    // res.cookies.set("trakt_tokens", "", { path: "/", maxAge: 0 })

    return res
}
