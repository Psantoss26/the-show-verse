'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, RotateCcw, X } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import useModalGuard from '@/hooks/useModalGuard'
import { saveArtworkOverrides } from '@/lib/artworkApi'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from '@/lib/ui/liquidGlass'
import {
  COLLECTION_ARTWORK_TYPE,
  buildCollectionArtworkChanges,
  buildCollectionCustomization,
  collectionCustomizationKey,
} from '@/lib/lists/collectionCustomization'

// Controles de los modales de acciones de la ficha (AddToListModal).
const FIELD_CLASS = 'mt-2 block w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition focus:bg-black/60 focus:ring-2 focus:ring-yellow-500/50'
const LABEL_CLASS = 'block text-xs font-bold uppercase tracking-wider text-zinc-300'
// Barra fina y translúcida sin raíl, la de EpisodeRatingsModal.
const THIN_SCROLLBAR = '[scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]'

// Mismo corte que la página (`sm:` de Tailwind): por debajo, la colección se
// pinta con un póster de fondo; por encima, con un backdrop.
const PHONE_QUERY = '(max-width: 639px)'
const subscribePhone = (onChange) => {
  const media = window.matchMedia(PHONE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const usePhoneViewport = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)

// Columnas visibles por fila: siempre un número exacto de tarjetas completas
// dentro del margen del modal (gap de 0.75rem entre ellas). El scroll avanza
// por páginas y encaja en cada tarjeta, así que ninguna queda recortada.
const ROW_COLUMNS = {
  portrait: 'auto-cols-[calc((100%_-_1.5rem)/3)] sm:auto-cols-[calc((100%_-_3rem)/5)]',
  landscape: 'auto-cols-[calc((100%_-_0.75rem)/2)]',
}
const ROW_GAP_PX = 12

// Idioma de cada imagen de TMDb (`iso_639_1`). Sin idioma llega como null y, en
// algunas, como "xx" o cadena vacía: las tres son "imagen sin texto".
const POSTER_LANGUAGES = new Set(['es', 'en'])
const imageLanguage = (image) => {
  const lang = String(image?.iso_639_1 || '').toLowerCase()
  return lang === 'xx' ? '' : lang
}
// Póster: el de portada lleva el título, así que solo en español o inglés.
const titledPosters = (images) => (images?.posters || []).filter((image) => POSTER_LANGUAGES.has(imageLanguage(image)))
// Fondos (móvil y ordenador): sin texto encima, solo imágenes sin idioma.
const textlessImages = (list) => (list || []).filter((image) => !imageLanguage(image))

function ArtworkRow({ id, label, field, original, value, candidates, landscape = false, onSelect }) {
  const paths = [...new Set([original, value, ...(candidates || []).map((item) => item.file_path)].filter(Boolean))]
  const size = landscape ? 'w300' : 'w185'
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ prev: false, next: false })

  const updateEdges = useCallback(() => {
    const row = rowRef.current
    if (!row) return
    setEdges({ prev: row.scrollLeft > 4, next: row.scrollLeft + row.clientWidth < row.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    updateEdges()
    const row = rowRef.current
    if (!row || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(updateEdges)
    observer.observe(row)
    return () => observer.disconnect()
  }, [updateEdges, paths.length])

  // Una página = las tarjetas visibles más su separación.
  const scrollRow = (direction) => {
    const row = rowRef.current
    row?.scrollBy({ left: direction * (row.clientWidth + ROW_GAP_PX), behavior: 'smooth' })
  }

  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={id} className={LABEL_CLASS}>{label}</h3>
        {paths.length > 0 ? <span className="text-[11px] font-medium text-zinc-500">{paths.length} {paths.length === 1 ? 'imagen' : 'imágenes'}</span> : null}
      </div>
      {paths.length > 0 ? (
        <div className="group/row relative mt-3">
        {/* Sin barra: en táctil se desliza y con ratón se usan las flechas de
            los carruseles de la ficha (DetailsArrowCarousel), en el margen. */}
        <div ref={rowRef} onScroll={updateEdges} className={`grid snap-x snap-mandatory grid-flow-col gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${landscape ? ROW_COLUMNS.landscape : ROW_COLUMNS.portrait}`}>
          {paths.map((path, index) => {
            const selected = value === path
            const isOriginal = path === original
            return (
              <button
                key={path}
                type="button"
                aria-label={`${label} ${index + 1}${isOriginal ? ' · Original de TMDb' : ''}`}
                aria-pressed={selected}
                onClick={() => onSelect(field, path)}
                className={`group relative w-full snap-start overflow-hidden rounded-xl bg-white/5 transition duration-300 focus-visible:outline-none ${landscape ? 'aspect-video' : 'aspect-[2/3]'} ${selected ? '' : 'opacity-70 hover:opacity-100'}`}
              >
                {/* Galería acotada de TMDb; la carga diferida nativa evita bajar lo que queda fuera de la fila. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://image.tmdb.org/t/p/${size}${path}`} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                {/* Aro y foco POR DENTRO: un anillo exterior lo recortaría el
                    borde de la fila en la primera y la última tarjeta. */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 rounded-xl ring-inset ${selected ? 'ring-2 ring-yellow-400' : 'group-focus-visible:ring-2 group-focus-visible:ring-white/80'}`}
                />
                {isOriginal && !selected ? (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur-md">TMDb</span>
                ) : null}
                {selected ? (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-yellow-400 text-black shadow-lg"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                ) : null}
              </button>
            )
          })}
        </div>
        {[['prev', -1, '-left-6 sm:-left-8', '‹', 'Anterior'], ['next', 1, '-right-6 sm:-right-8', '›', 'Siguiente']].map(([edge, direction, side, glyph, name]) => edges[edge] ? (
          <button
            key={edge}
            type="button"
            tabIndex={-1}
            aria-label={`${name} · ${label}`}
            onClick={() => scrollRow(direction)}
            className={`absolute inset-y-0 ${side} z-10 hidden w-6 items-center justify-center text-4xl font-semibold text-white/75 opacity-0 drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition hover:text-white group-hover/row:opacity-100 sm:flex sm:w-8`}
          >
            {glyph}
          </button>
        ) : null)}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No hay imágenes disponibles.</p>
      )}
    </section>
  )
}

/**
 * Edición por usuario de una colección con la estructura de los modales de
 * acciones de DetailsClient: portal, velo difuminado, tarjeta de cristal con
 * cabecera fija y cuerpo con scroll propio.
 */
export default function CollectionEditModal({ original, collection, onClose }) {
  const { authenticated, saveUiSettings, cacheArtworkOverrides } = useAuth()
  const phone = usePhoneViewport()
  const panelRef = useRef(null)
  const [portalReady, setPortalReady] = useState(false)
  const [draft, setDraft] = useState(() => ({ ...collection }))
  const [images, setImages] = useState(null)
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
    fetchTmdbImages(COLLECTION_ARTWORK_TYPE, original.id, { allLanguages: true, priority: 'high' }).then((result) => {
      if (cancelled) return
      setImages(result)
      setImageError(!result)
    })
    return () => { cancelled = true }
  }, [original.id, attempt])

  async function save(event) {
    event.preventDefault()
    if (saving || !authenticated) return
    setError('')
    setSaving(true)
    try {
      const customization = buildCollectionCustomization(original, draft)
      const artworkChanges = buildCollectionArtworkChanges(original, collection, draft)
      const textChanged = ['name', 'description'].some((field) => String(draft[field] || '').trim() !== String(collection[field] || '').trim())

      // Primero el texto: su respuesta reemplaza las preferencias del contexto
      // y, si fuese después, pisaría la instantánea local del artwork.
      if (textChanged) await saveUiSettings({ [collectionCustomizationKey(original.id)]: customization })

      if (artworkChanges.length) {
        const target = { type: COLLECTION_ARTWORK_TYPE, id: original.id }
        cacheArtworkOverrides?.({ ...target, changes: artworkChanges })
        const saved = await saveArtworkOverrides({ ...target, changes: artworkChanges })
        if (!saved) {
          // Se devuelve la instantánea local a lo que hay guardado de verdad.
          cacheArtworkOverrides?.({ ...target, changes: buildCollectionArtworkChanges(original, draft, collection) })
          throw new Error('No se pudieron guardar las imágenes. Inténtalo de nuevo.')
        }
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'No se pudieron guardar los cambios.')
      setSaving(false)
    }
  }

  const selectArtwork = (field, path) => setDraft((current) => ({ ...current, [field]: path }))

  if (!portalReady) return null

  return createPortal(
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-edit-title"
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
            <h2 id="collection-edit-title" className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent">
              Editar colección
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

        {/* El scroll va en un div: un <fieldset> no encoge dentro del flex y
            empujaba el pie fuera de la tarjeta. */}
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${THIN_SCROLLBAR}`}>
        <fieldset disabled={saving} className="min-w-0 space-y-6 p-6 sm:px-8">
          <label className={LABEL_CLASS}>
            Nombre
            <input required maxLength={200} value={draft.name || ''} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${FIELD_CLASS} normal-case tracking-normal font-normal`} />
          </label>
          <label className={LABEL_CLASS}>
            Descripción
            <textarea rows={3} maxLength={5000} value={draft.description || ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${FIELD_CLASS} resize-y normal-case tracking-normal font-normal ${THIN_SCROLLBAR}`} />
          </label>

          <ArtworkRow id="collection-edit-poster" label="Póster" field="poster_path" original={original.poster_path} value={draft.poster_path} candidates={titledPosters(images)} onSelect={selectArtwork} />
          {/* El fondo se edita para la vista en la que se está: en móvil la
              colección usa un póster de fondo y en ordenador un backdrop, y
              cada uno se guarda por separado. */}
          {phone ? (
            <ArtworkRow key="mobile" id="collection-edit-background" label="Fondo (vista móvil)" field="mobile_background_path" original={original.mobile_background_path} value={draft.mobile_background_path} candidates={textlessImages(images?.posters)} onSelect={selectArtwork} />
          ) : (
            <ArtworkRow key="desktop" id="collection-edit-background" label="Fondo (vista ordenador)" field="backdrop_path" original={original.backdrop_path} value={draft.backdrop_path} candidates={textlessImages(images?.backdrops)} landscape onSelect={selectArtwork} />
          )}

          {!images && !imageError && (
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
            onClick={() => setDraft({ ...original })}
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
