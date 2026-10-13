'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Loader2, Pencil, RotateCcw } from 'lucide-react'
import OptimizedImage from '@/components/OptimizedImage'
import SectionSheet, { SectionSheetEmpty } from '@/components/details/sectionSheet/SectionSheet'
import { tmdbSrcSet } from '@/lib/tmdb/imageSrcSet'
import { useAuth } from '@/context/AuthContext'
import { saveArtworkOverrides } from '@/lib/artworkApi'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import {
  COLLECTION_ARTWORK_TYPE,
  buildCollectionArtworkChanges,
} from '@/lib/lists/collectionCustomization'

// Mismo corte que la página (`sm:` de Tailwind): por debajo, la colección se
// pinta con un póster de fondo; por encima, con un backdrop.
const PHONE_QUERY = '(max-width: 639px)'
const subscribePhone = (onChange) => {
  const media = window.matchMedia(PHONE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const usePhoneViewport = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)

// Idioma de cada imagen de TMDb (`iso_639_1`). Sin idioma llega como null y, en
// algunas, como "xx" o cadena vacía: las tres son "imagen sin texto".
const POSTER_LANGUAGES = new Set(['es', 'en'])
const imageLanguage = (image) => {
  const lang = String(image?.iso_639_1 || '').toLowerCase()
  return lang === 'xx' ? '' : lang
}
// Póster y backdrop de portada: llevan el título, así que solo en español o
// inglés.
export const titledImages = (list) => (list || []).filter((image) => POSTER_LANGUAGES.has(imageLanguage(image)))
// Fondos (móvil y ordenador): sin texto encima, solo imágenes sin idioma.
const textlessImages = (list) => (list || []).filter((image) => !imageLanguage(image))

// La original de TMDb, la elegida y el resto, sin repetir.
const artworkPaths = (original, value, candidates) =>
  [...new Set([original, value, ...(candidates || []).map((item) => item.file_path)].filter(Boolean))]

// Imágenes de una sección del editor en cuadrícula vertical, como la vista
// lateral «Portadas y fondos» de la ficha: 3 pósters o 2 apaisadas por fila,
// la elegida marcada y la original de TMDb con su etiqueta. También la usa
// «Editar portada» de las temporadas (details/SeasonCoverEditModal).
export function ArtworkGrid({ label, field, original, value, candidates, landscape = false, onSelect }) {
  const paths = artworkPaths(original, value, candidates)
  if (!paths.length) return <SectionSheetEmpty>No hay imágenes disponibles.</SectionSheetEmpty>
  return (
    <ul className={`grid gap-2.5 sm:gap-3 ${landscape ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {paths.map((path, index) => {
        const selected = value === path
        const isOriginal = path === original
        return (
          <li key={path}>
            <button
              type="button"
              aria-label={`${label} ${index + 1}${isOriginal ? ' · Original de TMDb' : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(field, path)}
              className={`group/img relative block w-full overflow-hidden rounded-xl bg-zinc-900 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${landscape ? 'aspect-video' : 'aspect-[2/3]'} ${
                selected ? 'shadow-[0_0_12px_rgba(16,185,129,0.35)] after:shadow-[inset_0_0_0_2px_rgba(52,211,153,1)]' : ''
              }`}
            >
              <OptimizedImage
                src={`https://image.tmdb.org/t/p/${landscape ? 'w780' : 'w342'}${path}`}
                srcSet={tmdbSrcSet(path, landscape ? 'backdrop' : 'poster')}
                sizes={landscape ? '(min-width: 640px) 400px, 75vw' : '(min-width: 640px) 250px, 48vw'}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover/img:scale-[1.03]"
              />
              {selected ? (
                <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
              ) : null}
              {isOriginal ? (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-zinc-200">TMDb</span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Pie de los editores de imágenes: Cancelar y Guardar cambios.
export function ArtworkEditFooter({ saving, canSave, onCancel }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-white/5 px-4 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        data-online-only="true"
        disabled={saving || !canSave}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 text-sm font-bold text-black shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)] transition hover:bg-yellow-400 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-zinc-500 disabled:shadow-none disabled:active:scale-100"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}

/**
 * Edición por usuario de las IMÁGENES de una colección (el nombre y la
 * descripción son siempre los de TMDb), en la vista lateral de las secciones
 * de la ficha (SectionSheet): una pestaña por imagen editable.
 */
export default function CollectionEditModal({ original, collection, onClose }) {
  const { authenticated, cacheArtworkOverrides } = useAuth()
  const phone = usePhoneViewport()
  const panelRef = useRef(null)
  const [portalReady, setPortalReady] = useState(false)
  const [draft, setDraft] = useState(() => ({ ...collection }))
  const [images, setImages] = useState(null)
  const [imageError, setImageError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('poster')
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
      const artworkChanges = buildCollectionArtworkChanges(original, collection, draft)

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

  // Secciones del editor como pestañas, igual que Portada / Fondo / Logo en
  // la vista lateral de la ficha. El fondo se edita para la vista en la que se
  // está: en móvil la colección usa un póster de fondo y en ordenador un
  // backdrop, y cada uno se guarda por separado; la portada en modo backdrop
  // solo existe en ordenador.
  const textlessPosters = textlessImages(images?.posters)
  const sections = [
    { id: 'poster', label: 'Póster', field: 'poster_path', candidates: titledImages(images?.posters) },
    phone ? null : { id: 'cover', label: 'Backdrop de portada', field: 'cover_backdrop_path', candidates: titledImages(images?.backdrops), landscape: true },
    phone
      // Siempre sin idioma: pósters sin texto y, si la colección no tiene
      // ninguno, sus backdrops sin texto (de fondo se recortan en vertical),
      // los mismos que usa el fondo automático.
      ? { id: 'background', label: 'Fondo', field: 'mobile_background_path', candidates: textlessPosters.length ? textlessPosters : textlessImages(images?.backdrops) }
      : { id: 'background', label: 'Fondo', field: 'backdrop_path', candidates: textlessImages(images?.backdrops), landscape: true },
  ].filter(Boolean).map((section) => ({
    ...section,
    count: artworkPaths(original[section.field], draft[section.field], section.candidates).length,
  }))
  const section = sections.find((item) => item.id === tab) || sections[0]

  if (!portalReady) return null

  // Misma vista lateral que las secciones de la ficha (details/sectionSheet),
  // con el panel como formulario y los botones en un pie fijo.
  return (
    <SectionSheet
      open
      onClose={close}
      closeDisabled={saving}
      title="Editar colección"
      icon={Pencil}
      subtitle="Solo cambia para tu cuenta"
      tabs={sections.map(({ id, label, count }) => ({ id, label, count }))}
      activeTab={section.id}
      onTabChange={setTab}
      as="form"
      panelRef={panelRef}
      panelProps={{ onSubmit: save, tabIndex: -1 }}
      headerAction={
        <button
          type="button"
          disabled={saving}
          onClick={() => setDraft({ ...original })}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:opacity-50"
          aria-label="Restaurar TMDb"
          title="Restaurar TMDb"
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
      }
      footer={<ArtworkEditFooter saving={saving} canSave={authenticated} onCancel={close} />}
    >
      <fieldset disabled={saving} className="min-w-0 space-y-4 pb-2">
        {!authenticated && <p className="rounded-xl bg-yellow-500/10 p-3 text-xs font-medium text-yellow-200">Inicia sesión para guardar tu personalización.</p>}
        {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-center text-xs font-medium text-red-400">{error}</p>}
        {imageError && (
          <p role="status" className="text-xs font-medium text-zinc-400">
            No se pudieron cargar más imágenes.{' '}
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-bold text-zinc-200 underline underline-offset-2 hover:text-white">Reintentar</button>
          </p>
        )}
        {!images && !imageError ? (
          <p role="status" className="flex items-center justify-center gap-2 py-12 text-xs font-medium text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Cargando imágenes de TMDb…</p>
        ) : (
          <ArtworkGrid
            key={section.id}
            label={section.label}
            field={section.field}
            original={original[section.field]}
            value={draft[section.field]}
            candidates={section.candidates}
            landscape={section.landscape}
            onSelect={selectArtwork}
          />
        )}
      </fieldset>
    </SectionSheet>
  )
}
