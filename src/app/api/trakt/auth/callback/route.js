// /src/app/api/trakt/auth/callback/route.js
import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanOrigin(s) {
    return String(s || "").replace(/\/+$/, "")
}

function originFromRequest(req) {
    const forced =
        process.env.TRAKT_APP_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL

    if (forced) return cleanOrigin(forced)

    const nextOrigin = req?.nextUrl?.origin
    if (nextOrigin && nextOrigin !== "null") return cleanOrigin(nextOrigin)

    const h = headers()
    const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim()
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim()
    if (!host && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
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

    const origin = originFromRequest(req)
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
    if (!tokenRes.ok) {
        return NextResponse.json(
            { error: "Token exchange failed", details: tokenJson },
            { status: 500 }
        )
    }

    // ✅ Cookies que espera tu backend actual (/auth/status, /item/watched, /history...)
    const createdAtSec = Number(tokenJson?.created_at || 0)
    const expiresInSec = Number(tokenJson?.expires_in || 0)
    const expiresAtMs = (createdAtSec + expiresInSec) * 1000

    const secure = origin.startsWith("https://")

    const res = NextResponse.redirect(`${origin}/history`)

    res.cookies.set("trakt_access_token", tokenJson.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
    })

    res.cookies.set("trakt_refresh_token", tokenJson.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
    })

    res.cookies.set("trakt_expires_at", String(expiresAtMs), {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
    })

    // ✅ Compatibilidad (por si alguna parte tuya aún usa trakt_tokens)
    res.cookies.set("trakt_tokens", Buffer.from(JSON.stringify(tokenJson)).toString("base64"), {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    })

    // limpiar state
    res.cookies.set("trakt_oauth_state", "", {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 0,
    })

    return res
}
