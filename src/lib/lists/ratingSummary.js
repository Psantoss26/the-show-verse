function validScore(value) {
  const score = Number(value)
  return Number.isFinite(score) && score > 0 && score <= 10 ? score : null
}

/** Calcula la media con los datos ya recibidos; no realiza peticiones. */
export function summarizeListRatings(items = []) {
  const rows = Array.isArray(items) ? items : []
  const scores = rows.map((item) => validScore(item?.vote_average ?? item?.voteAverage)).filter((score) => score != null)
  if (!scores.length) return null

  return {
    average: Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)),
    ratedCount: scores.length,
    totalCount: rows.length,
  }
}

export function ratingSummaryBadge(summary) {
  if (!summary || !Number.isFinite(Number(summary.average))) return null
  const coverage = Number(summary.ratedCount) || 0
  const total = Number(summary.totalCount) || coverage
  return {
    value: Number(summary.average).toFixed(1),
    sub: total > coverage ? `${coverage}/${total}` : String(coverage),
  }
}
