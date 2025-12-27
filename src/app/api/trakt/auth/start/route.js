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

function randomState() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

export async function GET() {
    const clientId = process.env.TRAKT_CLIENT_ID
    if (!clientId) {
        return NextResponse.json({ error: "Missing TRAKT_CLIENT_ID" }, { status: 500 })
    }

    const origin = originFromHeaders()
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

    return NextResponse.redirect(url)
}
