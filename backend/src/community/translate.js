// backend/src/community/translate.js
// Traducción EN→ES gratuita (endpoint público de Google Translate, sin clave) para
// los temas de sentimiento oficiales de Trakt (que vienen en inglés). Usado solo en
// el sembrado (una vez por título). Caché en memoria + degradación elegante: si la
// traducción falla, se devuelve el texto original (mejor eso que perder el contenido).

const cache = new Map(); // texto original -> traducción
const UA = process.env.TRAKT_USER_AGENT || 'TheShowVerse/1.0 (+https://theshowverse.app)';
const TIMEOUT_MS = Number(process.env.TRANSLATE_TIMEOUT_MS) || 6000;

export async function translateToEs(text) {
  const src = String(text || '').trim();
  if (!src) return src;
  if (cache.has(src)) return cache.get(src);

  try {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q='
      + encodeURIComponent(src);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return src;
    const json = await res.json().catch(() => null);
    // Forma: [ [ [ "<traducido>", "<original>", ... ], ... ], ... ]
    const out = Array.isArray(json?.[0])
      ? json[0].map((seg) => seg?.[0] || '').join('').trim()
      : '';
    const value = out || src;
    cache.set(src, value);
    return value;
  } catch {
    return src; // timeout / red: se conserva el original
  }
}

// Traduce una lista en paralelo (los temas de sentimiento son ≤8 por lado).
export async function translateManyToEs(list) {
  const arr = Array.isArray(list) ? list : [];
  return Promise.all(arr.map((t) => translateToEs(t)));
}
