'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  selectListImdbSample,
  summarizeListImdbRatings,
} from '@/lib/lists/imdbRatingSummary'
import { createImdbRatingRequestCoordinator } from '@/lib/lists/imdbRatingRequestCoordinator'

// Memoria de la pestaña: abrir la misma lista, volver atrás o cargar más
// títulos no repite resoluciones IMDb ya efectuadas en esta sesión.
const ratingCache = new Map()
const resolvedKeys = new Set()
const requestRatings = createImdbRatingRequestCoordinator()

function mergeCachedRatings(sample) {
  const next = {}
  for (const item of sample) {
    const rating = ratingCache.get(item.key)
    if (rating) next[item.key] = rating
  }
  return next
}

function sameRatingMap(current, next) {
  const currentKeys = Object.keys(current)
  const nextKeys = Object.keys(next)
  return currentKeys.length === nextKeys.length
    && currentKeys.every((key) => current[key] === next[key])
}

async function fetchAndCacheRatings(items) {
  const response = await fetch('/api/imdb/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
    cache: 'no-store',
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json?.error || 'No se pudieron cargar las puntuaciones IMDb')

  const returned = json?.items && typeof json.items === 'object' ? json.items : {}
  for (const item of items) {
    const rating = returned[item.key]
    resolvedKeys.add(item.key)
    if (rating?.rating) ratingCache.set(item.key, rating)
  }
}

export default function useListImdbRatings(items, { totalCount, limit } = {}) {
  const sample = useMemo(
    () => selectListImdbSample(items, limit),
    [items, limit],
  )
  const sampleKey = sample.map((item) => item.key).join(',')
  const [ratingsByKey, setRatingsByKey] = useState(() => mergeCachedRatings(sample))

  useEffect(() => {
    const cached = mergeCachedRatings(sample)
    setRatingsByKey((current) => sameRatingMap(current, cached) ? current : cached)

    const missing = sample.filter((item) => !ratingCache.has(item.key) && !resolvedKeys.has(item.key))
    if (!missing.length) return undefined

    let cancelled = false

    requestRatings(missing, fetchAndCacheRatings)
      .then(() => {
        if (!cancelled) {
          const next = mergeCachedRatings(sample)
          setRatingsByKey((current) => sameRatingMap(current, next) ? current : next)
        }
      })
      .catch(() => {
        // La puntuación es un enriquecimiento no crítico: la lista sigue
        // navegable y un render posterior puede reintentarla.
      })

    return () => {
      cancelled = true
    }
  }, [sample, sampleKey])

  const summary = useMemo(
    () => summarizeListImdbRatings(sample, ratingsByKey, totalCount),
    [ratingsByKey, sample, totalCount],
  )

  return { ratingsByKey, summary, sampledCount: sample.length }
}
