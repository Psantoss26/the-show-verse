// src/app/api/questions/route.js
import { NextResponse } from 'next/server'

// Evita cachés en Next para este endpoint
export const dynamic = 'force-dynamic'

const FIXED_PUBLISHED_AT = '2015-08-05T08:40:51.620Z'

// Estado en memoria (solo para test local)
let questions = [
    {
        question: 'Favourite programming language?',
        published_at: FIXED_PUBLISHED_AT,
        choices: [
            { choice: 'Swift', votes: 2048 },
            { choice: 'Python', votes: 1024 },
            { choice: 'Objective-C', votes: 512 },
            { choice: 'Ruby', votes: 256 },
        ],
    },
]

export async function GET() {
    return NextResponse.json(questions, { status: 200 })
}

export async function POST(req) {
    let body = null
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { question, choices } = body || {}
    if (!question || !Array.isArray(choices) || choices.length === 0) {
        return NextResponse.json(
            { error: 'Expected { question: string, choices: string[] }' },
            { status: 400 }
        )
    }

    // Respuesta exactamente como tu spec espera (votes:0 + published_at fijo)
    const created = {
        question,
        published_at: FIXED_PUBLISHED_AT,
        choices: choices.map((c) => ({ choice: c, votes: 0 })),
    }

    questions = [...questions, created]
    return NextResponse.json(created, { status: 201 })
}
