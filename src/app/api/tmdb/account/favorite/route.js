// src/app/api/tmdb/account/favorite/route.js
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { fetchFavoritesForUser } from '@/lib/api/tmdb'
import {
  getValidTraktToken,
  traktFetch,
  setTraktCookies,
  clearTraktCookies,
} from '@/lib/trakt/server'

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
 * Sync a favorite add/remove to Trakt.
 * Trakt's dedicated favorites sync endpoints:
 *   POST /sync/favorites        → add items to favorites
 *   POST /sync/favorites/remove → remove items from favorites
 */
async function syncFavoriteToTrakt({ token, mediaType, tmdbId, favorite }) {
  // Trakt uses 'show' (not 'tv') and 'movie'
  const traktType = mediaType === 'tv' ? 'show' : 'movie'
  const key = traktType === 'movie' ? 'movies' : 'shows'

  const endpoint = favorite ? '/sync/favorites' : '/sync/favorites/remove'
  const payload = {
    [key]: [{ ids: { tmdb: Number(tmdbId) } }],
  }

  return traktFetch(endpoint, {
    token,
    method: 'POST',
    body: payload,
    timeoutMs: 8000,
  })
}

// GET: List all favorites (movies + TV shows)
export async function GET(req) {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  if (!sessionId) {
    return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
  }

  try {
    const account = await getAccount(sessionId)
    const favorites = await fetchFavoritesForUser(account.id, sessionId)
    return NextResponse.json({ favorites })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session_id')?.value

  if (!sessionId) {
    return NextResponse.json({ error: 'NO_SESSION' }, { status: 401 })
  }

  const body = await req.json()
  const { mediaType, mediaId, favorite } = body // mediaType: 'movie' | 'tv'

  try {
    // ── 1. TMDb (primary, always required) ──────────────────────────────────
    const account = await getAccount(sessionId)
    const tmdbUrl = `${TMDB}/account/${account.id}/favorite?api_key=${API_KEY}&session_id=${sessionId}`

    // ── 2. Trakt (secondary, optional — don't block on auth failure) ─────────
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
          favorite: !!favorite,
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

    // ── 3. Fire Trakt sync (non-blocking for the response, best-effort) ──────
    let traktResult = null
    let traktError = null

    if (traktAuth.token) {
      try {
        const r = await syncFavoriteToTrakt({
          token: traktAuth.token,
          mediaType,
          tmdbId: mediaId,
          favorite: !!favorite,
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
