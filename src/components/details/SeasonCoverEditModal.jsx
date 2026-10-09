'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, RotateCcw, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import useModalGuard from '@/hooks/useModalGuard'
import { saveArtworkOverrides } from '@/lib/artworkApi'
import { ArtworkRow, titledImages } from '@/components/lists/CollectionEditModal'
import { SEASON_ARTWORK_TYPE, buildSeasonCoverChanges } from '@/lib/details/seasonArtwork'
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from '@/lib/ui/liquidGlass'

const THIN_SCROLLBAR = '[scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]'

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
 * para la cuenta del usuario. Mismo modal que «Editar colección»
 * (lists/CollectionEditModal): portal, velo difuminado, tarjeta de cristal con
 * cabecera fija, cuerpo con scroll y pie con Restaurar / Cancelar / Guardar.
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

  useModalGuard({ open: true, onClose: close })
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

  return createPortal(
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="season-cover-edit-title"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300" onClick={close} aria-hidden="true" />

      <form
        ref={panelRef}
        tabIndex={-1}
        onSubmit={save}
        className={`relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] outline-none ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
      >
        <div className={`flex w-full shrink-0 items-center justify-between gap-4 ${LIQUID_GLASS_MODAL_HEADER} p-6 sm:px-8 sm:pb-6 sm:pt-8`}>
          <div className="min-w-0">
            <h2 id="season-cover-edit-title" className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent">
              Editar portada
            </h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Solo cambia para tu cuenta</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${THIN_SCROLLBAR}`}>
        <fieldset disabled={saving} className="min-w-0 space-y-6 p-6 sm:px-8">
          <ArtworkRow
            id="season-cover-edit-poster"
            label="Póster"
            field="poster_path"
            original={originalPoster}
            value={draft}
            candidates={titledImages(posters)}
            onSelect={(_, path) => setDraft(path)}
          />

          {!posters && !imageError && (
            <p role="status" className="flex items-center gap-2 text-xs font-medium text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Cargando imágenes de TMDb…</p>
          )}
          {imageError && (
            <p role="status" className="text-xs font-medium text-zinc-400">
              No se pudieron cargar más imágenes.{' '}
              <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-bold text-zinc-200 underline underline-offset-2 hover:text-white">Reintentar</button>
            </p>
          )}
          {!authenticated && <p className="rounded-xl bg-yellow-500/10 p-3 text-xs font-medium text-yellow-200">Inicia sesión para guardar tu personalización.</p>}
          {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-xs font-medium text-red-400">{error}</p>}
        </fieldset>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/5 px-4 py-4 sm:px-8">
          <button
            type="button"
            disabled={saving}
            onClick={() => setDraft(originalPoster || null)}
            title="Restaurar TMDb"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" /><span className="max-sm:sr-only">Restaurar TMDb</span>
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={close}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white/5 px-4 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-online-only="true"
              disabled={saving || !authenticated}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 text-sm font-bold text-black shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)] transition hover:bg-yellow-400 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-zinc-500 disabled:shadow-none disabled:active:scale-100"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  )
}
