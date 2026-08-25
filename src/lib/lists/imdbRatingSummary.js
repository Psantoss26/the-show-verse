// El endpoint de IMDb admite lotes de hasta 250 y resuelve los IDs TMDb con
// concurrencia limitada. 120 da una media mucho más representativa sin llegar
// a ese límite ni convertir la apertura de una lista grande en un pico de red.
const MAX_IMDB_LIST_SAMPLE_SIZE = 120

function validScore(value) {
  const score = Number(value)
  return Number.isFinite(score) && score > 0 && score <= 10 ? score : null
}

function normalizeMediaType(value) {
  return value === 'tv' || value === 'show' ? 'tv' : 'movie'
}

export function getListImdbItemKey(item) {
  const tmdbId = item?.tmdbId ?? item?.tmdb_id ?? item?.id
  if (!Number.isFinite(Number(tmdbId)) || Number(tmdbId) <= 0) return null
  const mediaType = normalizeMediaType(item?.mediaType ?? item?.media_type)
  return `${mediaType}:${Number(tmdbId)}`
}

export function toImdbRatingRequestItem(item) {
  const key = getListImdbItemKey(item)
  if (!key) return null

  const [mediaType, tmdbId] = key.split(':')
  return {
    key,
    id: Number(tmdbId),
    mediaType,
    imdbId: item?.imdbId ?? item?.imdb_id ?? null,
  }
}

/**
 * Mantiene el coste acotado para listas enormes y reparte la muestra por toda
 * la lista para que no dependa solo de los primeros títulos.
 */
export function selectListImdbSample(items = [], limit = MAX_IMDB_LIST_SAMPLE_SIZE) {
  const unique = []
  const seen = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    const requestItem = toImdbRatingRequestItem(item)
    if (!requestItem || seen.has(requestItem.key)) continue
    seen.add(requestItem.key)
    unique.push(requestItem)
  }

  const safeLimit = Math.max(1, Number(limit) || MAX_IMDB_LIST_SAMPLE_SIZE)
  if (unique.length <= safeLimit) return unique
  if (safeLimit === 1) return [unique[0]]

  return Array.from({ length: safeLimit }, (_, index) => {
    const position = Math.round((index * (unique.length - 1)) / (safeLimit - 1))
    return unique[position]
  })
}

export function summarizeListImdbRatings(sample = [], ratingsByKey = {}, totalCount) {
  const rows = Array.isArray(sample) ? sample : []
  const scores = rows
    .map((item) => validScore(ratingsByKey?.[item?.key]?.rating ?? ratingsByKey?.[item?.key]))
    .filter((score) => score != null)

  if (!scores.length) return null

  const total = Math.max(Number(totalCount) || 0, rows.length)
  return {
    average: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)),
    ratedCount: scores.length,
    totalCount: total,
  }
}

export { MAX_IMDB_LIST_SAMPLE_SIZE }
