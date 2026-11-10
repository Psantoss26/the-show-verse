// backend/src/community/sentiment.js
import { extractJsonText, nvidiaChat, nvidiaEnabled } from '../lib/nvidia.js';

const POS_PATTERNS = [
  { re: /\b(masterpiece|obra maestra)\b/i, es: 'Considerada una obra maestra' },
  { re: /\b(best|mejor|amazing|incre[ií]ble|brilliant|genial)\b/i, es: 'Valoración entusiasta de la comunidad' },
  { re: /\b(acting|actuaci[oó]n|performance|interpretaci[oó]n)\b/i, es: 'Interpretaciones muy elogiadas' },
  { re: /\b(soundtrack|score|banda sonora|m[uú]sica)\b/i, es: 'La banda sonora destaca' },
  { re: /\b(visual|cinematography|fotograf[ií]a)\b/i, es: 'Apartado visual y fotografía sobresalientes' },
];
const NEG_PATTERNS = [
  { re: /\b(boring|aburrid|slow|lento|tedious)\b/i, es: 'Ritmo lento para parte del público' },
  { re: /\b(makes no sense|no tiene sentido|confusing|confus)\b/i, es: 'Tramas que a algunos les resultan confusas' },
  { re: /\b(too long|demasiado larg|overlong)\b/i, es: 'Se percibe como demasiado larga' },
  { re: /\b(disappoint|decepci[oó]n|weak|floj)\b/i, es: 'Expectativas no del todo cumplidas' },
  { re: /\b(overrated|sobrevalorad)\b/i, es: 'Señalada por algunos como sobrevalorada' },
];

function collect(comments, patterns) {
  const out = [];
  const seen = new Set();
  for (const p of patterns) {
    if (out.length >= 5) break;
    if (comments.some((c) => p.re.test(c?.body || ''))) {
      if (!seen.has(p.es)) { seen.add(p.es); out.push({ text_es: p.es }); }
    }
  }
  return out;
}

export function buildHeuristicSentiment(comments = []) {
  const list = Array.isArray(comments) ? comments : [];
  return { good: collect(list, POS_PATTERNS), bad: collect(list, NEG_PATTERNS) };
}

export function buildSentimentPrompt({ comments = [], title = '' }) {
  const joined = comments.map((c, i) => `${i + 1}. ${String(c?.body || '').slice(0, 400)}`).join('\n');
  const system = [
    'IMPORTANTE: TODA tu respuesta debe estar redactada en ESPAÑOL (castellano), sin excepción,',
    'aunque los comentarios estén en inglés u otro idioma. Un valor en inglés es una respuesta INCORRECTA.',
    'Eres un analista experto de opiniones de cine y series (estilo Rotten Tomatoes / Trakt).',
    'A partir de comentarios de la comunidad, SINTETIZA los temas POSITIVOS y NEGATIVOS más recurrentes.',
    'REGLAS ESTRICTAS:',
    '1) Cada "text_es" es una frase en ESPAÑOL, corta, concreta y neutral (máx ~90 caracteres), sin comillas ni nombres de usuario.',
    '2) NO copies ni traduzcas literalmente frases de los comentarios: redacta tú un tema breve y general que resuma lo que varios opinan.',
    '3) 3 a 5 temas por lado (menos solo si no hay material). Si no hay críticas negativas claras, usa "bad":[].',
    '4) No inventes aspectos que nadie menciona.',
    'Ejemplo del ESTILO, IDIOMA y FORMATO esperados (no lo copies literalmente):',
    '{"good":[{"text_es":"La actuación protagonista es memorable e intensa"},{"text_es":"La banda sonora refuerza la tensión"}],'
      + '"bad":[{"text_es":"El ritmo se hace lento en la parte central"}]}',
    'Responde ÚNICAMENTE con ese JSON en español, sin texto adicional.',
  ].join(' ');
  const user = `Título de la obra: ${title || '(desconocido)'}\n`
    + `Comentarios de la comunidad (analízalos y sintetiza los temas recurrentes, SIEMPRE en español):\n${joined}\n\n`
    + 'Recuerda: cada "text_es" debe estar en ESPAÑOL.';
  return { system, user };
}

function clampSide(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? { text_es: x } : x))
    .filter((x) => x && typeof x.text_es === 'string' && x.text_es.trim())
    .map((x) => ({ text_es: x.text_es.trim() }))
    .slice(0, 5);
}

export function parseSentimentResponse(text) {
  if (!text) return null;
  let obj = null;
  try { obj = JSON.parse(text); } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { obj = JSON.parse(m[0]); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const good = clampSide(obj.good);
  const bad = clampSide(obj.bad);
  if (!good.length && !bad.length) return null;
  return { good, bad };
}

export function sentimentRowToApi(row, commentCount = 0) {
  const map = (arr) => (Array.isArray(arr) ? arr : []).map((x) => ({ sentiment_es: x?.text_es || '' })).filter((x) => x.sentiment_es);
  return { good: map(row?.good), bad: map(row?.bad), comment_count: Number(commentCount) || 0 };
}

// ── generador con la API de modelos de NVIDIA ──
// Va en segundo plano (el heurístico ya se ha servido), así que admite esperar
// a la reserva, que es más lenta.
const NVIDIA_SENTIMENT_TIMEOUT_MS = Number(process.env.NVIDIA_SENTIMENT_TIMEOUT_MS) || 60000;

// Returns { good, bad, provider, model } or null (el llamador se queda con el heurístico).
// Comments = [{ body }].
export async function generateSentiment({ comments, title }, { env = process.env, fetchImpl } = {}) {
  if (!Array.isArray(comments) || comments.length === 0) return null;
  if (!nvidiaEnabled(env)) return null;
  const prompt = buildSentimentPrompt({ comments, title });
  try {
    const { content, model } = await nvidiaChat({
      ...prompt,
      temperature: 0.3,
      maxTokens: 800,
      timeoutMs: NVIDIA_SENTIMENT_TIMEOUT_MS,
      totalTimeoutMs: NVIDIA_SENTIMENT_TIMEOUT_MS * 2,
      env,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    const parsed = parseSentimentResponse(extractJsonText(content));
    return parsed ? { ...parsed, provider: 'nvidia', model } : null;
  } catch (err) {
    console.warn('[sentiment] NVIDIA sin respuesta:', err?.kind || err?.name || 'error');
    return null;
  }
}
