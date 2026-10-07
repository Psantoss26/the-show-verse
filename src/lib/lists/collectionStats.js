// Datos agregados de una colección de TMDb a partir de sus películas.
//
// `/collection/{id}` no trae ni recaudación ni créditos de sus partes: el
// endpoint los completa con `/movie/{id}` y aquí se combinan.

// Suma solo las películas con dato: las no estrenadas o sin taquilla conocida
// llegan con 0 y no deben contar como "recaudó 0".
export function sumCollectionRevenue(parts) {
  if (!Array.isArray(parts)) return 0;
  return parts.reduce((sum, part) => {
    const revenue = Number(part?.revenue);
    return Number.isFinite(revenue) && revenue > 0 ? sum + revenue : sum;
  }, 0);
}

const moneyFormat = (digits) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits, useGrouping: 'always' });

// Mismo estilo que el resto de la app ("775 M$"), con "mil M$" para las sagas
// que pasan de mil millones: "billón" en español sería un millón de millones.
export function formatCollectionRevenue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount >= 1e9) return `${moneyFormat(1).format(amount / 1e9)} mil M$`;
  if (amount >= 1e6) {
    const millions = amount / 1e6;
    return `${moneyFormat(millions < 10 ? 1 : 0).format(millions)} M$`;
  }
  return `${moneyFormat(0).format(Math.round(amount))} $`;
}

// Reparto destacado de la colección: quien aparece en más películas va
// primero y, a igualdad, quien sale más arriba en los créditos (su mejor
// posición). Cada actor lleva los personajes y películas en orden de la saga.
//
// `movies`: [{ id, title, release_date, cast: [{ id, name, character, order, profile_path }] }]
export function buildCollectionCast(movies, { limit = 40 } = {}) {
  const byId = new Map();
  (Array.isArray(movies) ? movies : []).forEach((movie, movieIndex) => {
    const seen = new Set();
    for (const member of Array.isArray(movie?.cast) ? movie.cast : []) {
      if (member?.id == null || seen.has(member.id)) continue;
      seen.add(member.id);
      const order = Number.isFinite(Number(member.order)) ? Number(member.order) : 999;
      let entry = byId.get(member.id);
      if (!entry) {
        entry = {
          id: member.id,
          name: member.name || '',
          profile_path: member.profile_path || null,
          bestOrder: order,
          firstIndex: movieIndex,
          appearances: [],
        };
        byId.set(member.id, entry);
      }
      entry.bestOrder = Math.min(entry.bestOrder, order);
      if (!entry.profile_path && member.profile_path) entry.profile_path = member.profile_path;
      entry.appearances.push({
        movieId: movie.id,
        title: movie.title || '',
        year: movie.release_date ? String(movie.release_date).slice(0, 4) : null,
        character: member.character || '',
      });
    }
  });

  return [...byId.values()]
    .sort((a, b) =>
      b.appearances.length - a.appearances.length ||
      a.bestOrder - b.bestOrder ||
      a.firstIndex - b.firstIndex,
    )
    .slice(0, limit)
    .map(({ id, name, profile_path, appearances }) => ({
      id,
      name,
      profile_path,
      appearances,
      // El personaje principal es el más repetido (p. ej. "Luke Skywalker"
      // frente a variantes puntuales); a igualdad, el de la primera película.
      character: mostFrequentCharacter(appearances),
    }));
}

function mostFrequentCharacter(appearances) {
  const counts = new Map();
  for (const { character } of appearances) {
    const name = String(character || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
