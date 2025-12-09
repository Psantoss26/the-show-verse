// src/app/api/omdb/route.js
import { NextResponse } from 'next/server'

const OMDB_API_KEY = process.env.OMDB_API_KEY

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const imdbId = searchParams.get('i')

  if (!imdbId) {
    return NextResponse.json(
      { ok: false, error: 'Missing "i" (IMDb id) query param' },
      { status: 400 }
    )
  }

  if (!OMDB_API_KEY) {
    console.error('[OMDb] Falta OMDB_API_KEY en las variables de entorno')
    // Devolvemos 200 para no llenar logs de errores, simplemente sin datos
    return NextResponse.json(
      { ok: false, error: 'OMDb API key not configured' },
      { status: 200 }
    )
  }

  try {
    const upstreamUrl = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${encodeURIComponent(
      imdbId
    )}&plot=short&r=json`

    const omdbRes = await fetch(upstreamUrl, {
      // cache en el edge / server
      next: { revalidate: 60 * 60 * 24 } // 24h
    })

    // Si OMDb responde con un error HTTP, NO reventamos la función
    if (!omdbRes.ok) {
      const bodyText = await omdbRes.text().catch(() => null)
      console.warn('[OMDb] upstream HTTP error', {
        status: omdbRes.status,
        body: bodyText
      })

      // Devolvemos 200 con ok:false, para que el cliente haga fallback.
      return NextResponse.json(
        {
          ok: false,
          upstreamStatus: omdbRes.status,
          error: 'Upstream OMDb error'
        },
        { status: 200 }
      )
    }

    let data
    try {
      data = await omdbRes.json()
    } catch (e) {
      console.error('[OMDb] Error parseando JSON', e)
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON from OMDb' },
        { status: 200 }
      )
    }

    if (data.Response === 'False') {
      // Ej: API key inválida, película no encontrada, etc.
      console.warn('[OMDb] Response False', data)
      return NextResponse.json(
        { ok: false, error: data.Error || 'OMDb error' },
        { status: 200 }
      )
    }

    // Todo OK → devolvemos datos originales + ok:true
    return NextResponse.json(
      {
        ok: true,
        ...data
      },
      {
        status: 200,
        headers: {
          // cache también a nivel CDN
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=43200'
        }
      }
    )
  } catch (err) {
    console.error('[OMDb] Unexpected route error', err)
    // De nuevo, devolvemos 200 pero sin datos ⇒ el cliente hace fallback.
    return NextResponse.json(
      { ok: false, error: 'Unexpected error contacting OMDb' },
      { status: 200 }
    )
  }
}
