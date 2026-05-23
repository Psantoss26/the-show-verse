// src/lib/details/sentiment.js
import { stripHtml } from './formatters'

const normalizeText = (text = '') =>
    stripHtml(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

const normalizeTerm = (text = '') =>
    String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

const POSITIVE_PATTERNS = [
    {
        id: 'visuals',
        terms: [
            'beautiful', 'stunning', 'gorgeous', 'visual', 'cinematography', 'photography',
            'shot', 'shots', 'vfx', 'cgi', 'spectacle', 'visually', 'color', 'colour',
            'hermos', 'precioso', 'visual', 'fotografia', 'plano', 'efecto', 'color',
        ],
        text: 'La comunidad destaca su apartado visual y la puesta en escena.',
    },
    {
        id: 'performances',
        terms: [
            'performance', 'performances', 'acting', 'actor', 'actress', 'cast', 'chemistry',
            'interpretacion', 'actuacion', 'reparto', 'actor', 'actriz', 'quimica',
        ],
        text: 'Las interpretaciones y la química del reparto salen especialmente bien paradas.',
    },
    {
        id: 'story',
        terms: [
            'story', 'plot', 'script', 'writing', 'screenplay', 'narrative', 'arc',
            'historia', 'guion', 'trama', 'narrativa', 'arco',
        ],
        text: 'Se valora positivamente la historia y cómo está construida.',
    },
    {
        id: 'emotion',
        terms: [
            'emotional', 'moving', 'heart', 'touching', 'powerful', 'feel', 'felt',
            'emocion', 'emocional', 'conmovedor', 'corazon', 'potente', 'sentir',
        ],
        text: 'Conecta emocionalmente y deja una impresión fuerte en parte del público.',
    },
    {
        id: 'world',
        terms: [
            'immersive', 'world', 'worldbuilding', 'atmosphere', 'atmospheric', 'setting',
            'inmersiv', 'mundo', 'ambientacion', 'atmosfera', 'universo',
        ],
        text: 'Su mundo y su atmósfera resultan envolventes.',
    },
    {
        id: 'pacing',
        terms: [
            'pacing', 'pace', 'rhythm', 'engaging', 'gripping', 'entertaining',
            'ritmo', 'entretenid', 'engancha', 'atrapa',
        ],
        text: 'El ritmo funciona bien y mantiene el interés.',
    },
    {
        id: 'direction',
        terms: [
            'directing', 'direction', 'director', 'filmmaking', 'crafted',
            'direccion', 'director', 'realizacion',
        ],
        text: 'La dirección se percibe como uno de sus puntos fuertes.',
    },
    {
        id: 'music',
        terms: [
            'music', 'score', 'soundtrack', 'sound', 'song',
            'musica', 'banda sonora', 'sonido', 'cancion',
        ],
        text: 'La música y el sonido refuerzan muy bien la experiencia.',
    },
    {
        id: 'overall',
        terms: [
            'amazing', 'great', 'incredible', 'masterpiece', 'love', 'fantastic', 'brilliant',
            'excellent', 'iconic', 'perfect', 'best', 'favorite', 'recommend',
            'impresionante', 'increible', 'espectacular', 'genial', 'magnifico',
            'maravilloso', 'excelente', 'obra maestra', 'perfect', 'mejor', 'favorit',
            'recomend',
        ],
        text: 'La recepción general es muy positiva entre quienes la recomiendan.',
    },
]

const NEGATIVE_PATTERNS = [
    {
        id: 'pacing',
        terms: [
            'boring', 'dull', 'slow', 'drag', 'dragged', 'pacing', 'pace',
            'aburrid', 'lento', 'pesad', 'ritmo', 'arrastra',
        ],
        text: 'La queja más repetida apunta al ritmo y a tramos que se sienten lentos.',
    },
    {
        id: 'predictable',
        terms: [
            'predictable', 'cliche', 'cliched', 'formulaic', 'generic',
            'predecible', 'cliche', 'generico', 'formulaic',
        ],
        text: 'Algunas opiniones la ven demasiado predecible o poco original.',
    },
    {
        id: 'story',
        terms: [
            'plot hole', 'plot holes', 'script', 'writing', 'story', 'mess', 'confusing',
            'guion', 'historia', 'trama', 'agujero', 'confus', 'desorden',
        ],
        text: 'El guion y algunos giros narrativos generan reservas.',
    },
    {
        id: 'characters',
        terms: [
            'character', 'characters', 'flat', 'shallow', 'development', 'weak',
            'personaje', 'personajes', 'plano', 'superficial', 'desarrollo', 'flojo',
        ],
        text: 'Hay críticas hacia personajes que se sienten poco desarrollados.',
    },
    {
        id: 'performances',
        terms: [
            'acting', 'performance', 'cast', 'wooden', 'overacting',
            'actuacion', 'interpretacion', 'reparto', 'sobreactu',
        ],
        text: 'Parte del público no termina de conectar con algunas interpretaciones.',
    },
    {
        id: 'ending',
        terms: [
            'ending', 'finale', 'final', 'conclusion', 'resolved',
            'final', 'desenlace', 'conclusion', 'resolucion',
        ],
        text: 'El desenlace divide y deja a algunos espectadores insatisfechos.',
    },
    {
        id: 'tone',
        terms: [
            'tone', 'tonal', 'cheesy', 'cringe', 'corny', 'silly',
            'tono', 'vergüenza', 'verguenza', 'ridicul', 'tonto',
        ],
        text: 'El tono no convence a todo el mundo.',
    },
    {
        id: 'overall',
        terms: [
            'bad', 'terrible', 'awful', 'overrated', 'lazy', 'mediocre', 'disappointing',
            'waste', 'hate', 'worst',
            'malo', 'terrible', 'horrible', 'sobrevalorado', 'mediocre', 'decepcion',
            'perdida de tiempo', 'odio', 'peor', 'insipido',
        ],
        text: 'La valoración negativa se concentra en una sensación general de decepción.',
    },
]

const TRIVIA_PATTERNS = [
    {
        id: 'references',
        terms: [
            'reference', 'references', 'referencing', 'easter egg', 'callback', 'homage',
            'tribute', 'nod', 'cameo', 'cameos', 'connection', 'connected',
            'universe', 'franchise',
            'referencia', 'referencias', 'guiño', 'guino', 'homenaje', 'cameo', 'cameos',
            'conexion', 'conectad', 'universo', 'franquicia',
        ],
        text: 'Se comentan referencias, guiños o conexiones con otras obras.',
    },
    {
        id: 'adaptation',
        terms: [
            'based on', 'adapted', 'adaptation', 'book', 'novel', 'comic', 'manga',
            'game', 'source material', 'original',
            'basad', 'adaptacion', 'adaptado', 'libro', 'novela', 'comic', 'manga',
            'juego', 'material original', 'obra original',
        ],
        text: 'Aparecen detalles sobre la obra original o el material en el que se basa.',
    },
    {
        id: 'production',
        terms: [
            'behind the scenes', 'production', 'filming', 'shooting', 'set', 'location',
            'locations', 'practical effect', 'practical effects', 'makeup', 'costume',
            'bts', 'camera', 'edited', 'editing', 'cut', 'budget',
            'rodaje', 'produccion', 'escenario', 'localizacion', 'localizaciones',
            'efecto practico', 'efectos practicos', 'maquillaje', 'vestuario',
            'camara', 'montaje', 'presupuesto',
        ],
        text: 'La conversación menciona detalles de rodaje, producción o puesta en escena.',
    },
    {
        id: 'real-context',
        terms: [
            'true story', 'real story', 'real life', 'historical', 'history', 'inspired by',
            'actual', 'event', 'events',
            'historia real', 'vida real', 'historico', 'historica', 'historia',
            'inspirad', 'hecho real', 'hechos reales', 'evento', 'eventos',
        ],
        text: 'Se señalan conexiones con hechos reales, contexto histórico o inspiración real.',
    },
    {
        id: 'cast',
        terms: [
            'actor was', 'actress was', 'cast was', 'director was', 'originally',
            'audition', 'role', 'voice', 'dub', 'voice actor',
            'actor era', 'actriz era', 'reparto', 'director era', 'originalmente',
            'audicion', 'papel', 'voz', 'doblaje', 'actor de voz',
        ],
        text: 'Hay menciones curiosas sobre reparto, voces, casting o dirección.',
    },
    {
        id: 'details',
        terms: [
            'fun fact', 'trivia', 'did you know', 'detail', 'details', 'symbolism',
            'meaning', 'hidden', 'foreshadowing',
            'post credits', 'after credits', 'credits scene', 'timeline', 'chronology',
            'version', 'versions', 'alternate', 'extended', 'deleted scene',
            'curiosidad', 'sabias que', 'sabías que', 'detalle', 'detalles',
            'simbolismo', 'significado', 'oculto', 'presagio',
            'postcreditos', 'post creditos', 'escena eliminada', 'version',
            'versiones', 'alternativa', 'extendida', 'cronologia',
        ],
        text: 'Los usuarios destacan pequeños detalles, símbolos o lecturas ocultas.',
    },
]

const splitSentences = (text) =>
    normalizeText(text)
        .split(/(?<=[\.\!\?])\s+|\n+/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .filter((x) => x.length >= 18 && x.length <= 220)

const matchPatterns = (sentence, patterns) =>
    patterns
        .map((pattern) => ({
            ...pattern,
            score: pattern.terms.reduce(
                (acc, term) => (sentence.includes(normalizeTerm(term)) ? acc + 1 : acc),
                0,
            ),
        }))
        .filter((pattern) => pattern.score > 0)
        .sort((a, b) => b.score - a.score)

const uniqueSpanishPoints = (items, max) => {
    const out = []
    const seen = new Set()

    for (const item of items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item.text)
        if (out.length >= max) break
    }

    return out
}

export const buildSentimentFromComments = (comments = []) => {
    const pool = []

    for (const c of comments) {
        const text = c?.comment?.comment ?? c?.comment ?? ''
        const likes = Number(c?.likes || 0)

        for (const sentence of splitSentences(text)) {
            const positive = matchPatterns(sentence, POSITIVE_PATTERNS)
            const negative = matchPatterns(sentence, NEGATIVE_PATTERNS)
            const trivia = matchPatterns(sentence, TRIVIA_PATTERNS)
            const positiveScore = positive.reduce((acc, item) => acc + item.score, 0)
            const negativeScore = negative.reduce((acc, item) => acc + item.score, 0)
            const triviaScore = trivia.reduce((acc, item) => acc + item.score, 0)

            if (positiveScore === 0 && negativeScore === 0 && triviaScore === 0) continue

            if (positiveScore > negativeScore) {
                pool.push({
                    ...positive[0],
                    sentiment: 'positive',
                    totalScore: positiveScore,
                    likes,
                })
            } else if (negativeScore > positiveScore) {
                pool.push({
                    ...negative[0],
                    sentiment: 'negative',
                    totalScore: negativeScore,
                    likes,
                })
            }

            if (triviaScore > 0) {
                pool.push({
                    ...trivia[0],
                    sentiment: 'trivia',
                    totalScore: triviaScore,
                    likes,
                })
            }
        }
    }

    const sortBySignal = (a, b) => (b.totalScore - a.totalScore) || (b.likes - a.likes)

    const pros = pool
        .filter((item) => item.sentiment === 'positive')
        .sort(sortBySignal)
    const cons = pool
        .filter((item) => item.sentiment === 'negative')
        .sort(sortBySignal)
    const trivia = pool
        .filter((item) => item.sentiment === 'trivia')
        .sort(sortBySignal)

    return {
        pros: uniqueSpanishPoints(pros, 4),
        cons: uniqueSpanishPoints(cons, 4),
        trivia: uniqueSpanishPoints(trivia, 4),
    }
}
