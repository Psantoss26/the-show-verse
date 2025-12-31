// src/lib/details/sentiment.js
import { stripHtml } from './formatters'

export const buildSentimentFromComments = (comments = []) => {
    const POS = [
        'amazing', 'beautiful', 'great', 'stunning', 'incredible', 'masterpiece', 'immersive', 'spectacle',
        'love', 'fantastic', 'brilliant', 'excellent', 'iconic',
        'impresionante', 'increible', 'hermoso', 'espectacular', 'genial', 'magnífico', 'maravilloso'
    ]
    const NEG = [
        'boring', 'generic', 'predictable', 'weak', 'bad', 'terrible', 'awful', 'dull', 'cliche', 'overrated',
        'lazy', 'flat', 'slow', 'shallow', 'mediocre',
        'aburrido', 'genérico', 'predecible', 'flojo', 'malo', 'lento', 'sobrevalorado', 'insípido'
    ]

    const norm = (t) => stripHtml(t).toLowerCase()
    const splitSentences = (t) =>
        norm(t)
            .split(/(?<=[\.\!\?])\s+|\n+/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .filter((x) => x.length >= 28 && x.length <= 140)

    const score = (s, lex) => lex.reduce((acc, w) => (s.includes(w) ? acc + 1 : acc), 0)

    const pool = []
    for (const c of comments) {
        const text = c?.comment?.comment ?? c?.comment ?? ''
        const likes = Number(c?.likes || 0)
        for (const sent of splitSentences(text)) {
            const p = score(sent, POS)
            const n = score(sent, NEG)
            if (p === 0 && n === 0) continue
            pool.push({ sent, likes, p, n })
        }
    }

    const pos = [...pool]
        .filter((x) => x.p > x.n)
        .sort((a, b) => (b.p - a.p) || (b.likes - a.likes))
    const neg = [...pool]
        .filter((x) => x.n > x.p)
        .sort((a, b) => (b.n - a.n) || (b.likes - a.likes))

    const uniq = (arr, max) => {
        const out = []
        const seen = new Set()
        for (const it of arr) {
            if (seen.has(it.sent)) continue
            seen.add(it.sent)
            out.push(it.sent)
            if (out.length >= max) break
        }
        return out
    }

    return {
        pros: uniq(pos, 4),
        cons: uniq(neg, 4)
    }
}
