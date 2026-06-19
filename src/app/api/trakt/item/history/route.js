// src/app/api/trakt/item/history/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
    readTraktCookies,
    tokenIsExpired,
    refreshAccessToken,
    setTraktCookies,
    normalizeWatchedAt,
    traktAddToHistory,
    traktRemoveHistoryEntries
} from '@/lib/trakt/server'
import {
    backendFetchJson,
    mediaTypeToBackend,
    setBackendAuthCookies,
    hasBackendCredentials,
} from '@/lib/backend/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
    const cookieStore = await cookies()
    const { accessToken, refreshToken, expiresAtMs } = readTraktCookies(cookieStore)

    let payload = null
    try {
        payload = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const op = String(payload?.op || '').trim() // add | update | remove
    const type = payload?.type // movie | show
    const tmdbId = payload?.tmdbId
    const watchedAt = payload?.watchedAt || null
    const historyId = payload?.historyId

    if (hasBackendCredentials(request)) {
        try {
            const mediaType = mediaTypeToBackend(type);
            let backendResult = null;

            if (op === 'add') {
                backendResult = await backendFetchJson(request, "/v1/history", {
                    method: "POST",
                    body: JSON.stringify({
                        tmdbId: Number(tmdbId),
                        mediaType,
                        watchedAt: watchedAt ? new Date(watchedAt).toISOString() : new Date().toISOString(),
                        title: payload?.title || undefined,
                        posterPath: payload?.posterPath || undefined,
                    }),
                });
            } else if (op === 'remove') {
                backendResult = await backendFetchJson(request, `/v1/history/${encodeURIComponent(historyId)}`, {
                    method: "DELETE",
                });
            } else if (op === 'update') {
                await backendFetchJson(request, `/v1/history/${encodeURIComponent(historyId)}`, {
                    method: "DELETE",
                });
                backendResult = await backendFetchJson(request, "/v1/history", {
                    method: "POST",
                    body: JSON.stringify({
                        tmdbId: Number(tmdbId),
                        mediaType,
                        watchedAt: watchedAt ? new Date(watchedAt).toISOString() : new Date().toISOString(),
                        title: payload?.title || undefined,
                        posterPath: payload?.posterPath || undefined,
                    }),
                });
            }

            if (backendResult) {
                if (!backendResult.ok) {
                    const res = NextResponse.json({
                        ok: false,
                        error: backendResult.error || "Backend history operation failed",
                    }, { status: backendResult.status });
                    setBackendAuthCookies(res, backendResult, { secure: request.nextUrl?.protocol === "https:" });
                    return res;
                }

                // Sincronización opcional hacia Trakt si está conectado
                let token = accessToken;
                let refreshedTokens = null;

                if (token) {
                    try {
                        const ensureToken = async () => {
                            if (!token || tokenIsExpired(expiresAtMs)) {
                                if (refreshToken) {
                                    refreshedTokens = await refreshAccessToken(refreshToken);
                                    token = refreshedTokens.access_token;
                                }
                            }
                        };
                        await ensureToken();

                        if (op === 'add') {
                            const watchedAtIso = normalizeWatchedAt(watchedAt);
                            await traktAddToHistory(token, { type, tmdbId, watchedAtIso });
                        }
                    } catch (traktErr) {
                        console.warn("Failed to sync history to Trakt:", traktErr);
                    }
                }

                const res = NextResponse.json({
                    ok: true,
                    historyId: backendResult.json?.item?.id || null,
                    source: "backend",
                });
                if (refreshedTokens) setTraktCookies(res, refreshedTokens);
                setBackendAuthCookies(res, backendResult, { secure: request.nextUrl?.protocol === "https:" });
                return res;
            }
        } catch (e) {
            console.warn("Backend history operation failed:", e);
            return NextResponse.json({ error: e?.message || "Backend history operation failed" }, { status: 500 });
        }
    }

    if (!accessToken && !refreshToken) {
        return NextResponse.json({ error: 'Not connected to Trakt' }, { status: 401 })
    }


    if (op !== 'add' && op !== 'update' && op !== 'remove') {
        return NextResponse.json({ error: 'Invalid op. Use add|update|remove.' }, { status: 400 })
    }

    if (op !== 'remove') {
        if (type !== 'movie' && type !== 'show') {
            return NextResponse.json({ error: 'Invalid type. Use movie|show.' }, { status: 400 })
        }
        if (!tmdbId) return NextResponse.json({ error: 'Missing tmdbId' }, { status: 400 })
    }

    if ((op === 'update' || op === 'remove') && !historyId) {
        return NextResponse.json({ error: 'Missing historyId' }, { status: 400 })
    }

    let token = accessToken
    let refreshedTokens = null

    const ensureToken = async () => {
        if (!token || tokenIsExpired(expiresAtMs)) {
            if (!refreshToken) throw new Error('Not connected to Trakt')
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token
        }
    }

    try {
        await ensureToken()

        // ✅ op: add => añade UN nuevo visionado (no borra los anteriores)
        if (op === 'add') {
            const watchedAtIso = normalizeWatchedAt(watchedAt)
            const result = await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
            const historyId = Array.isArray(result?.ids) ? result.ids[0] : null

            const res = NextResponse.json({ ok: true, historyId, result })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        // ✅ op: update => remove entry (historyId) + add con nueva fecha
        if (op === 'update') {
            const watchedAtIso = normalizeWatchedAt(watchedAt)
            await traktRemoveHistoryEntries(token, { ids: [historyId] })
            const result = await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
            const nextHistoryId = Array.isArray(result?.ids) ? result.ids[0] : null

            const res = NextResponse.json({ ok: true, historyId: nextHistoryId, result })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }

        // ✅ op: remove => quita SOLO ese visionado (no todos)
        if (op === 'remove') {
            await traktRemoveHistoryEntries(token, { ids: [historyId] })

            const res = NextResponse.json({ ok: true })
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }
    } catch (e) {
        // reintento con refresh 1 vez
        try {
            if (!refreshToken) throw e
            refreshedTokens = await refreshAccessToken(refreshToken)
            token = refreshedTokens.access_token

            if (op === 'add') {
                const watchedAtIso = normalizeWatchedAt(watchedAt)
                const result = await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
                const historyId = Array.isArray(result?.ids) ? result.ids[0] : null
                const res = NextResponse.json({ ok: true, historyId, result })
                setTraktCookies(res, refreshedTokens)
                return res
            } else if (op === 'update') {
                const watchedAtIso = normalizeWatchedAt(watchedAt)
                await traktRemoveHistoryEntries(token, { ids: [historyId] })
                const result = await traktAddToHistory(token, { type, tmdbId, watchedAtIso })
                const nextHistoryId = Array.isArray(result?.ids) ? result.ids[0] : null
                const res = NextResponse.json({ ok: true, historyId: nextHistoryId, result })
                setTraktCookies(res, refreshedTokens)
                return res
            } else if (op === 'remove') {
                await traktRemoveHistoryEntries(token, { ids: [historyId] })
            }

            const res = NextResponse.json({ ok: true })
            setTraktCookies(res, refreshedTokens)
            return res
        } catch (err2) {
            const res = NextResponse.json(
                { ok: false, error: err2?.message || e?.message || 'Trakt history op failed' },
                { status: 500 }
            )
            if (refreshedTokens) setTraktCookies(res, refreshedTokens)
            return res
        }
    }
}
