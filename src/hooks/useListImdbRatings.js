'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  selectListImdbSample,
  summarizeListImdbRatings,
} from '@/lib/lists/imdbRatingSummary'
import { createImdbRatingRequestCoordinator } from '@/lib/lists/imdbRatingRequestCoordinator'
import {
  readScoreCacheEntries,
  shouldRefreshScore,
  writeScoreCache,
} from '@/lib/userLists/listScoreCache'

// Memoria de la pestaña: abrir la misma lista, volver atrás o cargar más
// títulos no repite resoluciones IMDb ya efectuadas en esta sesión.
const ratingCache = new Map()
const resolvedKeys = new Set()
const requestRatings = createImdbRatingRequestCoordinator()

// La caché persistente de notas de IMDb es la MISMA que usan Favoritos y
// Pendientes (`showverse:scores:imdb:v2`, protegida del desalojo por cuota):
// sus notas y sus «sin nota» confirmados valen aquí y viceversa. Se vuelca a
// la memoria una vez por pestaña. Las notas caducadas se pintan igualmente,
// pero no cuentan como resueltas: se vuelven a pedir si el título lo necesita.
let persistentCacheLoaded = false
function loadPersistentCache() {
  if (persistentCacheLoaded || typeof window === 'undefined') return
  persistentCacheLoaded = true
  readScoreCacheEntries('imdb').forEach((entry, key) => {
    if (typeof entry.score === 'number' && entry.score > 0 && !ratingCache.has(key)) {
      ratingCache.set(key, { rating: entry.score })
    }
    // Sin fecha de estreno en las listas: se aplica el TTL de títulos antiguos.
    if (!shouldRefreshScore(null, entry)) resolvedKeys.add(key)
  })
}

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
  // `unresolved`: no se pudo averiguar su id de IMDb (fallo pasajero de TMDb).
  // No es un «sin nota»: ni se da por resuelto ni se guarda como negativo, y
  // el siguiente hover (o la próxima visita) lo reintenta.
  const unresolved = new Set(Array.isArray(json?.unresolved) ? json.unresolved : [])
  const persisted = new Map()
  for (const item of items) {
    if (unresolved.has(item.key)) continue
    const rating = returned[item.key]
    resolvedKeys.add(item.key)
    if (rating?.rating) {
      ratingCache.set(item.key, rating)
      persisted.set(item.key, Number(rating.rating))
    } else {
      ratingCache.delete(item.key)
      persisted.set(item.key, null)
    }
  }
  if (persisted.size) writeScoreCache('imdb', persisted)
}

// Notas pedidas al pasar por encima de un título: salen YA, con prioridad. No
// esperan al lote de muestra aunque el título vaya en él (un lote de 120 en
// frío tarda segundos) y no comparten cola con él: tienen su propio
// coordinador. Solo se juntan los hovers del mismo instante.
const HOVER_BATCH_DELAY_MS = 16
const requestHoverRatings = createImdbRatingRequestCoordinator()
let hoverQueue = new Map()
let hoverFlush = null

function queueHoverRating(item) {
  hoverQueue.set(item.key, item)
  if (!hoverFlush) {
    hoverFlush = new Promise((resolve) => {
      setTimeout(() => {
        const batch = [...hoverQueue.values()]
        hoverQueue = new Map()
        hoverFlush = null
        resolve(requestHoverRatings(batch, fetchAndCacheRatings).catch(() => {}))
      }, HOVER_BATCH_DELAY_MS)
    })
  }
  return hoverFlush
}

export default function useListImdbRatings(items, { totalCount, limit } = {}) {
  const sample = useMemo(
    () => selectListImdbSample(items, limit),
    [items, limit],
  )
  const sampleKey = sample.map((item) => item.key).join(',')
  const [sampleRatings, setSampleRatings] = useState(() => {
    loadPersistentCache()
    return mergeCachedRatings(sample)
  })
  // Títulos fuera de la muestra cuya nota se pidió al pasar por encima.
  const [hoverRatings, setHoverRatings] = useState({})

  useEffect(() => {
    loadPersistentCache()
    const cached = mergeCachedRatings(sample)
    setSampleRatings((current) => sameRatingMap(current, cached) ? current : cached)

    const missing = sample.filter((item) => !resolvedKeys.has(item.key))
    if (!missing.length) return undefined

    let cancelled = false

    requestRatings(missing, fetchAndCacheRatings)
      .then(() => {
        if (!cancelled) {
          const next = mergeCachedRatings(sample)
          setSampleRatings((current) => sameRatingMap(current, next) ? current : next)
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

  // Pide (si hace falta) la nota de un título concreto: la muestra deja fuera
  // a la mayoría de los títulos de las listas grandes. Sin petición si ya está
  // en memoria o en la caché persistente, si es un «sin nota» confirmado o si
  // ya hay una en curso para ese título.
  const requestRating = useCallback((mediaType, tmdbId) => {
    const id = Number(tmdbId)
    if (!Number.isFinite(id) || id <= 0) return
    const key = `${mediaType === 'tv' ? 'tv' : 'movie'}:${id}`
    loadPersistentCache()

    const publish = () => {
      const rating = ratingCache.get(key)
      if (!rating) return
      setHoverRatings((current) => current[key] === rating ? current : { ...current, [key]: rating })
    }

    publish()
    if (resolvedKeys.has(key)) return
    queueHoverRating({ key, id, mediaType: key.split(':')[0], imdbId: null }).then(publish)
  }, [])

  const ratingsByKey = useMemo(
    () => ({ ...hoverRatings, ...sampleRatings }),
    [hoverRatings, sampleRatings],
  )

  const summary = useMemo(
    () => summarizeListImdbRatings(sample, sampleRatings, totalCount),
    [sampleRatings, sample, totalCount],
  )

  return { ratingsByKey, summary, sampledCount: sample.length, requestRating }
}
