import { NextResponse } from "next/server"
import { cookies, headers } from "next/headers"

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

    const tokenRes = await fetch("https://trakt.tv/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    })

    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
        return NextResponse.json(
            { error: "Token exchange failed", details: tokenJson },
            { status: 500 }
        )
    }

    // Guardamos tokens en cookie (simple y funciona en Vercel).
    // Si ya lo haces distinto, adapta pero NO uses filesystem.
    cookies().set("trakt_tokens", Buffer.from(JSON.stringify(tokenJson)).toString("base64"), {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    })

    cookies().delete("trakt_oauth_state")

    // Vuelve a Historial (o donde quieras)
    return NextResponse.redirect(`${origin}/history`)
}
