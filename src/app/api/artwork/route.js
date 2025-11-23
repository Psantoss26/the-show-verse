// /src/app/api/artwork/route.js
import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const DATA_FILE = path.join(process.cwd(), 'artwork-overrides.json')

// Forzamos runtime Node para poder usar fs
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function readStore() {
    try {
        const raw = await fs.readFile(DATA_FILE, 'utf8')
        return JSON.parse(raw)
    } catch {
        // Si no existe el archivo o hay error, devolvemos un objeto vacío
        return {}
    }
}

async function writeStore(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function keyFor(type, id) {
    return `${type}:${id}`
}

/**
 * GET /api/artwork
 *  - ?type=movie|tv
 *  - ?id=123 -> devuelve todas las claves (poster/backdrop/background) de esa obra
 *  - ?ids=1,2,3&kind=backdrop -> devuelve solo esa "kind" para esos ids
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'movie'
    const kind = searchParams.get('kind') // opcional
    const idsParam = searchParams.get('ids')
    const id = searchParams.get('id')

    const store = await readStore()

    if (idsParam) {
        const ids = idsParam
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)

        const overrides = {}
        ids.forEach((movieId) => {
            const k = keyFor(type, movieId)
            const entry = store[k] || {}
            if (kind) {
                overrides[movieId] = entry[kind] || null
            } else {
                overrides[movieId] = entry
            }
        })

        return NextResponse.json({ overrides })
    }

    if (id) {
        const k = keyFor(type, id)
        const entry = store[k] || {}
        return NextResponse.json({ overrides: entry })
    }

    return NextResponse.json({ overrides: {} })
}

/**
 * POST /api/artwork
 * body: { type: 'movie'|'tv', id: string|number, kind: 'poster'|'backdrop'|'background', filePath: string|null }
 *
 * - Si filePath tiene valor => lo guarda
 * - Si filePath es null/undefined => borra ese override
 */
export async function POST(request) {
    try {
        const body = await request.json()
        const type = body.type || 'movie'
        const id = String(body.id || '')
        const kind = body.kind
        const filePath = body.filePath || null

        if (!id || !kind) {
            return NextResponse.json(
                { error: 'Faltan parámetros id o kind' },
                { status: 400 }
            )
        }

        const store = await readStore()
        const k = keyFor(type, id)
        const existing = store[k] || {}

        if (filePath) {
            store[k] = {
                ...existing,
                [kind]: filePath
            }
        } else {
            // Si se manda null => eliminar ese campo concreto
            const next = { ...existing }
            delete next[kind]
            store[k] = next
        }

        await writeStore(store)
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('Error guardando artwork override', err)
        return NextResponse.json(
            { error: 'Error interno al guardar' },
            { status: 500 }
        )
    }
}
