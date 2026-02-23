// /src/app/api/trakt/auth/callback/route.js
import { NextResponse } from "next/server"
import { headers } from "next/headers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanOrigin(s) {
    return String(s || "").replace(/\/+$/, "")
}

function cleanUrl(s) {
    return String(s || "").trim().replace(/\/+$/, "")
}

function traktUserAgent() {
    return process.env.TRAKT_USER_AGENT || "TheShowVerse/1.0 (Next.js; Trakt OAuth Callback)"
}

async function originFromRequest(req) {
    const forced =
        process.env.TRAKT_APP_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL

    if (forced) return cleanOrigin(forced)

    const nextOrigin = req?.nextUrl?.origin
    if (nextOrigin && nextOrigin !== "null") return cleanOrigin(nextOrigin)

    const h = await headers()
    const proto = (h.get("x-forwarded-proto") || "http").split(",")[0].trim()
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim()

    if (host) return `${proto}://${host}`
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

    return "http://localhost:3000"
}

function resolveWebRedirectUri(origin, req) {
    const fromCookie = cleanUrl(req.cookies.get("trakt_oauth_redirect_uri")?.value || "")
    if (/^https?:\/\//i.test(fromCookie)) return fromCookie

    const configured = cleanUrl(process.env.TRAKT_REDIRECT_URI || "")
    if (/^https?:\/\//i.test(configured)) return configured

    return `${origin}/api/trakt/auth/callback`
}

function sanitizeNextPath(nextPath) {
    if (!nextPath || typeof nextPath !== "string") return "/history"
    if (!nextPath.startsWith("/")) return "/history"
    return nextPath
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

    const expected = req.cookies.get("trakt_oauth_state")?.value || null
    const nextCookie = req.cookies.get("trakt_oauth_next")?.value || "/history"
    const nextPath = sanitizeNextPath(nextCookie)

    if (!code || !state || !expected || state !== expected) {
        return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 })
    }

    const origin = await originFromRequest(req)
    const redirectUri = resolveWebRedirectUri(origin, req)

    const tokenRes = await fetch("https://api.trakt.tv/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId,
            "User-Agent": traktUserAgent(),
        },
        cache: "no-store",
        body: JSON.stringify({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    })

    const rawBody = await tokenRes.text().catch(() => "")
    let tokenJson = null
    if (rawBody) {
        try {
            tokenJson = JSON.parse(rawBody)
        } catch {
            tokenJson = null
        }
    }
    if (!tokenRes.ok) {
        const isCloudflareChallenge =
            tokenRes.status === 403 &&
            /cloudflare|attention required/i.test(String(rawBody || ""))

        console.error("❌ Trakt token exchange failed:", {
            status: tokenRes.status,
            statusText: tokenRes.statusText,
            response: tokenJson,
            responseText: tokenJson ? null : rawBody?.slice(0, 400) || null,
            isCloudflareChallenge,
            redirectUri,
            hasCode: !!code,
            hasClientId: !!clientId,
        })
        
        // Si es rate limit, dar un mensaje más amigable
        if (tokenRes.status === 429) {
            return NextResponse.json(
                { 
                    error: "Rate limit excedido", 
                    message: "Has realizado demasiadas peticiones a Trakt. Por favor espera 1 hora antes de intentar de nuevo.",
                    retryAfter: tokenRes.headers.get("Retry-After") || "3600"
                },
                { status: 429 }
            )
        }
        
        return NextResponse.json(
            {
                error: "Token exchange failed",
                details: tokenJson,
                detailsText: tokenJson ? null : rawBody?.slice(0, 400) || null,
                status: tokenRes.status,
                redirectUri,
                hint:
                    tokenRes.status === 403
                        ? (
                            isCloudflareChallenge
                                ? "Cloudflare está bloqueando la petición del servidor a Trakt. Prueba sin VPN/proxy/antibot y reinicia el flujo."
                                : "Verifica que el redirect_uri de la app de Trakt coincida exactamente con el usado en /auth/start y /auth/callback."
                        )
                        : null,
                cloudflareChallenge: isCloudflareChallenge || null,
            },
            { status: tokenRes.status }
        )
    }

    const createdAtSec = Number(tokenJson?.created_at || 0)
    const expiresInSec = Number(tokenJson?.expires_in || 0)
    const expiresAtMs = (createdAtSec + expiresInSec) * 1000

    const secure = origin.startsWith("https://")

    const res = NextResponse.redirect(new URL(nextPath, origin))

    // ✅ cookies que usa tu /auth/status y el resto de rutas
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

    // Limpieza
    res.cookies.set("trakt_oauth_state", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 })
    res.cookies.set("trakt_oauth_next", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 })
    res.cookies.set("trakt_oauth_redirect_uri", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 })

    return res
}
