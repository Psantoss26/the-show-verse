// src/lib/search/fuzzy.js
//
// Utilidades PURAS de similitud fuzzy para el buscador. Permiten que una consulta
// con erratas (1-2 letras) siga puntuando alto el título/persona/colección
// correcto. No dependen de React ni de la red; operan sobre texto YA normalizado
// (ver normalizeSearchText en Navbar: sin acentos, minúsculas, sin puntuación).

// Distancia de edición de Levenshtein (dos filas: O(n·m) tiempo, O(m) memoria).
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

// Similitud por edición normalizada a [0,1] (1 = idénticos).
function editSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Conjunto de trigramas (con relleno en los bordes) de un texto.
function trigramSet(s) {
  const padded = `  ${s} `;
  const set = new Set();
  for (let i = 0; i < padded.length - 2; i += 1) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

// Coeficiente de Dice sobre trigramas [0,1]: robusto a transposiciones y a
// consultas multi-palabra.
export function trigramSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigramSet(a);
  const tb = trigramSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter += 1;
  return (2 * inter) / (ta.size + tb.size);
}

// Mejor similitud fuzzy [0,1] entre una consulta y un título (ambos normalizados).
// Máximo de: edición consulta↔título completo, edición consulta↔cada token del
// título (para títulos largos donde la consulta es solo una palabra) y trigramas.
export function fuzzySimilarity(query, title) {
  if (!query || !title) return 0;
  if (query === title) return 1;

  let best = editSimilarity(query, title);

  for (const token of title.split(" ")) {
    if (!token) continue;
    const s = editSimilarity(query, token);
    if (s > best) best = s;
    if (best === 1) return 1;
  }

  const tri = trigramSimilarity(query, title);
  if (tri > best) best = tri;

  return best;
}

// ¿Un token de la consulta casa (tolerante a erratas) con algún token del título?
// Permite 1 edición en tokens cortos (≤4) y 2 en tokens largos. Cubre erratas en
// consultas multi-palabra (p. ej. "intersteler nolan").
export function tokenFuzzyMatches(queryToken, titleTokens) {
  if (!queryToken) return false;
  const maxDist = queryToken.length <= 4 ? 1 : 2;
  for (const t of titleTokens) {
    if (!t) continue;
    if (t.includes(queryToken) || queryToken.includes(t)) return true;
    if (
      Math.abs(t.length - queryToken.length) <= maxDist &&
      levenshtein(queryToken, t) <= maxDist
    ) {
      return true;
    }
  }
  return false;
}
