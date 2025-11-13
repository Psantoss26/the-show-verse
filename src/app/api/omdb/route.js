import { NextResponse } from 'next/server'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const imdb = searchParams.get('i')
    if (!imdb) {
      return NextResponse.json({ error: 'Missing imdb id (param i)' }, { status: 400 })
    }

    const key = process.env.OMDB_API_KEY
    if (!key) {
      return NextResponse.json({ error: 'OMDB_API_KEY missing in env' }, { status: 500 })
    }

    const r = await fetch(`https://www.omdbapi.com/?apikey=${key}&i=${imdb}&plot=short`, {
      cache: 'no-store',
    })
    const j = await r.json()
    if (!r.ok) {
      return NextResponse.json(j || { error: 'OMDb upstream error' }, { status: 502 })
    }
    return NextResponse.json(j)
  } catch (err) {
    console.error('OMDb proxy failed:', err)
    return NextResponse.json({ error: 'OMDb proxy failed' }, { status: 500 })
  }
}
