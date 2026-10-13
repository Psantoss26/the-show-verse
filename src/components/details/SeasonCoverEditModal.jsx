'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, RotateCcw } from 'lucide-react'
import SectionSheet from '@/components/details/sectionSheet/SectionSheet'
import { useAuth } from '@/context/AuthContext'
import { saveArtworkOverrides } from '@/lib/artworkApi'
import { ArtworkEditFooter, ArtworkGrid, titledImages } from '@/components/lists/CollectionEditModal'
import { SEASON_ARTWORK_TYPE, buildSeasonCoverChanges } from '@/lib/details/seasonArtwork'

// Pósters de la temporada en TODOS los idiomas (la fila se queda con los que
// llevan título, en español o inglés, como la portada de las colecciones).
async function fetchSeasonPosters(showId, seasonNumber) {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}/images?api_key=${key}`)
    if (!res.ok) return null
    const json = await res.json()
    return Array.isArray(json?.posters) ? json.posters : []
  } catch {
    return null
  }
}

/**
 * «Editar portada» de una temporada: elegir su póster entre los de TMDb, solo
 * para la cuenta del usuario. Misma vista lateral que «Editar colección»
 * (lists/CollectionEditModal): Restaurar TMDb en la cabecera, pósters en
 * cuadrícula y Cancelar / Guardar en el pie.
 *
 * `originalPoster`: el automático (lo que se ve sin elección propia);
 * `currentPoster`: el que se ve ahora.
 */
export default function SeasonCoverEditModal({ seasonId, showId, seasonNumber, originalPoster, currentPoster, onClose }) {
  const { authenticated, cacheArtworkOverrides } = useAuth()
  const panelRef = useRef(null)
  const [portalReady, setPortalReady] = useState(false)
  const [draft, setDraft] = useState(currentPoster || null)
  const [posters, setPosters] = useState(null)
  const [imageError, setImageError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const close = () => { if (!saving) onClose() }

  useEffect(() => setPortalReady(true), [])

  useEffect(() => {
    if (!portalReady) return undefined
    const previousFocus = document.activeElement
    panelRef.current?.focus({ preventScroll: true })
    return () => previousFocus?.focus?.({ preventScroll: true })
  }, [portalReady])

  useEffect(() => {
    let cancelled = false
    setImageError(false)
    fetchSeasonPosters(showId, seasonNumber).then((result) => {
      if (cancelled) return
      setPosters(result)
      setImageError(!result)
    })
    return () => { cancelled = true }
  }, [showId, seasonNumber, attempt])

  async function save(event) {
    event.preventDefault()
    if (saving || !authenticated) return
    setError('')
    setSaving(true)
    try {
      const changes = buildSeasonCoverChanges(originalPoster, currentPoster, draft)
      if (changes.length) {
        const target = { type: SEASON_ARTWORK_TYPE, id: seasonId }
        cacheArtworkOverrides?.({ ...target, changes })
        const saved = await saveArtworkOverrides({ ...target, changes })
        if (!saved) {
          // Se devuelve la instantánea local a lo que hay guardado de verdad.
          cacheArtworkOverrides?.({ ...target, changes: buildSeasonCoverChanges(originalPoster, draft, currentPoster) })
          throw new Error('No se pudo guardar la portada. Inténtalo de nuevo.')
        }
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'No se pudieron guardar los cambios.')
      setSaving(false)
    }
  }

  if (!portalReady) return null

  // Misma vista lateral que «Editar colección» y las secciones de la ficha
  // (details/sectionSheet): pósters en cuadrícula y botones en un pie fijo.
  return (
    <SectionSheet
      open
      onClose={close}
      closeDisabled={saving}
      title="Editar portada"
      icon={Pencil}
      subtitle={`Temporada ${seasonNumber} · Solo para tu cuenta`}
      as="form"
      panelRef={panelRef}
      panelProps={{ onSubmit: save, tabIndex: -1 }}
      headerAction={
        <button
          type="button"
          disabled={saving}
          onClick={() => setDraft(originalPoster || null)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:opacity-50"
          aria-label="Restaurar TMDb"
          title="Restaurar TMDb"
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      }
      footer={<ArtworkEditFooter saving={saving} canSave={authenticated} onCancel={close} />}
    >
      <fieldset disabled={saving} className="min-w-0 space-y-4 pb-2 pt-1">
        {!authenticated && <p className="rounded-xl bg-yellow-500/10 p-3 text-xs font-medium text-yellow-200">Inicia sesión para guardar tu personalización.</p>}
        {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-xs font-medium text-red-400">{error}</p>}
        {imageError && (
          <p role="status" className="text-xs font-medium text-zinc-400">
            No se pudieron cargar más imágenes.{' '}
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-bold text-zinc-200 underline underline-offset-2 hover:text-white">Reintentar</button>
          </p>
        )}
        {!posters && !imageError ? (
          <p role="status" className="flex items-center justify-center gap-2 py-12 text-xs font-medium text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Cargando imágenes de TMDb…</p>
        ) : (
          <ArtworkGrid
            label="Póster"
            field="poster_path"
            original={originalPoster}
            value={draft}
            candidates={titledImages(posters)}
            onSelect={(_, path) => setDraft(path)}
          />
        )}
      </fieldset>
    </SectionSheet>
  )
}
