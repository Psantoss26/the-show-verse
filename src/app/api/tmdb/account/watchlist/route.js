// src/app/api/tmdb/account/watchlist/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { fetchWatchlistForUser } from '@/lib/api/tmdb'
import {
  getValidTraktToken,
  traktFetch,
  setTraktCookies,
  clearTraktCookies,
} from '@/lib/trakt/server'
import { backendFetchJson, setBackendAuthCookies } from '@/lib/backend/server'
import { enrichMediaItemsWithTmdb } from '@/app/api/_utils/tmdbMetadata'

const TMDB = 'https://api.themoviedb.org/3'
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

async function getAccount(sessionId) {
  const url = `${TMDB}/account?api_key=${API_KEY}&session_id=${sessionId}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.status_message || 'TMDB_ACCOUNT_ERROR')
  return data
}

/**
 * Sync a watchlist add/remove to Trakt.
 * Trakt's dedicated watchlist sync endpoints:
 *   POST /sync/watchlist        → add items to watchlist
 *   POST /sync/watchlist/remove → remove items from watchlist
 */
async function syncWatchlistToTrakt({ token, mediaType, tmdbId, watchlist }) {
  // Trakt type: 'movie' or 'show' (not 'tv')
  const traktType = mediaType === 'tv' ? 'show' : 'movie'
  const key = traktType === 'movie' ? 'movies' : 'shows'

  const endpoint = watchlist ? '/sync/watchlist' : '/sync/watchlist/remove'
  const payload = {
    [key]: [{ ids: { tmdb: Number(tmdbId) } }],
  }

  const result = await traktFetch(endpoint, {
    token,
    method: 'POST',
    body: payload,
    timeoutMs: 8000,
  })

  return result
}

// GET: List all watchlist items (movies + TV shows)
export async function GET(req) {
  try {
    const backend = await backendFetchJson(req, '/v1/watchlist?limit=200')
    if (backend.ok) {
      const watchlistBase = (Array.isArray(backend.json?.results) ? backend.json.results : []).map((item) => ({
        ...item,
        media_type: item.mediaType,
        media_id: item.tmdbId,
        id: item.tmdbId,
        title: item.title || null,
        name: item.title || null,
        poster_path: item.posterPath || null,
      }))
      const watchlist = await enrichMediaItemsWithTmdb(watchlistBase, {
        getId: (item) => item.id,
        getType: (item) => item.media_type,
      })
      const res = NextResponse.json({ watchlist, source: 'backend' })
      setBackendAuthCookies(res, backend, { secure: req.nextUrl?.protocol === 'https:' })
      return res
    }
    if (!backend.skipped && backend.status !== 401) {
      console.warn('Backend watchlist failed; falling back to TMDb', backend.error)
    }
  } catch (e) {
    console.warn('Backend watchlist failed; falling back to TMDb', e)
  }

  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  if (!sessionId) {
    return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
  }

  try {
    const account = await getAccount(sessionId)
    const watchlist = await fetchWatchlistForUser(account.id, sessionId)
    return NextResponse.json({ watchlist })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: Add/remove from watchlist
export async function POST(req) {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  const body = await req.json()
  const { mediaType, mediaId, watchlist } = body // mediaType: 'movie' | 'tv'

  try {
    const backend = watchlist
      ? await backendFetchJson(req, '/v1/watchlist', {
          method: 'POST',
          body: JSON.stringify({
            tmdbId: Number(mediaId),
            mediaType,
            title: body?.title,
            posterPath: body?.posterPath,
          }),
        })
      : await backendFetchJson(req, `/v1/watchlist/${encodeURIComponent(mediaId)}/${mediaType}`, {
          method: 'DELETE',
        })

    if (backend.ok) {
      const res = NextResponse.json({ ok: true, source: 'backend' })
      setBackendAuthCookies(res, backend, { secure: req.nextUrl?.protocol === 'https:' })
      return res
    }
    if (!backend.skipped && backend.status !== 401) {
      console.warn('Backend watchlist failed; falling back to TMDb/Trakt', backend.error)
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
    }

    // ── 1. TMDb (primary, always required) ──────────────────────────────────
    const account = await getAccount(sessionId)
    const tmdbUrl = `${TMDB}/account/${account.id}/watchlist?api_key=${API_KEY}&session_id=${sessionId}`

    // ── 2. Trakt auth (parallel with TMDb request) ────────────────────────--
    const traktAuthPromise = getValidTraktToken(cookieStore).catch(() => ({
      token: null,
      refreshedTokens: null,
      shouldClear: false,
    }))

    const [tmdbRes, traktAuth] = await Promise.all([
      fetch(tmdbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify({
          media_type: mediaType,
          media_id: mediaId,
          watchlist: !!watchlist,
        }),
      }),
      traktAuthPromise,
    ])

    const tmdbData = await tmdbRes.json()

    if (!tmdbRes.ok) {
      return NextResponse.json(
        { error: tmdbData.status_message || 'TMDB_ERROR' },
        { status: tmdbRes.status },
      )
    }

    // ── 3. Trakt sync (best-effort, non-blocking for the response) ────────────
    let traktResult = null
    let traktError = null

    if (traktAuth.token) {
      try {
        const r = await syncWatchlistToTrakt({
          token: traktAuth.token,
          mediaType,
          tmdbId: mediaId,
          watchlist: !!watchlist,
        })
        traktResult = { ok: r.ok, status: r.status }
        if (!r.ok) {
          traktError = r.json?.error || `Trakt HTTP ${r.status}`
        }
      } catch (e) {
        traktError = e?.message || 'Trakt sync failed'
      }
    }

    // ── 4. Build response (set refreshed Trakt cookies if needed) ────────────
    const res = NextResponse.json({
      ok: true,
      trakt: traktAuth.token
        ? { synced: traktResult?.ok ?? false, error: traktError }
        : { synced: false, error: 'not_connected' },
    })

    if (traktAuth.refreshedTokens) setTraktCookies(res, traktAuth.refreshedTokens)
    if (traktAuth.shouldClear) clearTraktCookies(res)

    return res
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
