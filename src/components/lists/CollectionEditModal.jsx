'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Pencil } from 'lucide-react'
import { ImagesSheet } from '@/components/details/sectionSheet/DetailsSectionSheets'
import { useAuth } from '@/context/AuthContext'
import { forgetCommunityArtwork, retractOwnArtworkVotes, saveArtworkOverrides } from '@/lib/artworkApi'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'
import {
  COLLECTION_ARTWORK_KIND_BY_FIELD,
  COLLECTION_ARTWORK_TYPE,
  buildCollectionArtworkChanges,
  collectionArtworkVotes,
} from '@/lib/lists/collectionCustomization'

const META = { title: 'Editar colección', icon: Pencil }
// Imágenes editables (ver lib/lists/collectionCustomization).
const ARTWORK_FIELDS = ['poster_path', 'cover_backdrop_path', 'backdrop_path', 'mobile_background_path']

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
const titledImages = (list) => (list || []).filter((image) => POSTER_LANGUAGES.has(imageLanguage(image)))
// Fondos (móvil y ordenador): sin texto encima, solo imágenes sin idioma.
const textlessImages = (list) => (list || []).filter((image) => !imageLanguage(image))

// La elegida primero, luego la de por defecto y el resto, sin repetir. Si
// alguna de las dos no está entre las candidatas (p. ej. la portada principal
// de TMDb con otro idioma), entra igual, sin sus datos de resolución.
function sectionImages(candidates, fallback, active) {
  const byPath = new Map((candidates || []).filter((image) => image?.file_path).map((image) => [image.file_path, image]))
  const first = [active, fallback].filter(Boolean)
  return [...new Set([...first, ...byPath.keys()])].map((path) => byPath.get(path) || { file_path: path })
}

// Imágenes ya pedidas en esta sesión, por colección. La página las pide antes
// de abrir la vista (`prefetchCollectionEditImages`), así que abre ya con
// ellas, como «Portadas y fondos» en la ficha.
const imagesCache = new Map()
function fetchEditImages(collectionId) {
  const entry = imagesCache.get(collectionId)
  if (entry) return entry.promise
  const next = { promise: null, images: null }
  next.promise = fetchTmdbImages(COLLECTION_ARTWORK_TYPE, collectionId, { allLanguages: true, priority: 'high' }).then((result) => {
    // Un fallo no se guarda: la próxima vez se vuelve a pedir.
    if (result) next.images = result
    else imagesCache.delete(collectionId)
    return result
  })
  imagesCache.set(collectionId, next)
  return next.promise
}
export function prefetchCollectionEditImages(collectionId) {
  if (collectionId != null) fetchEditImages(collectionId)
}

/**
 * Edición por usuario de las IMÁGENES de una colección (el nombre y la
 * descripción son siempre los de TMDb). Es la MISMA vista lateral que
 * «Portadas y fondos» de la ficha (ImagesSheet): una pestaña por imagen
 * editable, resolución en cada imagen, orden e idioma en la hoja de filtros y
 * Restaurar en la cabecera. Sin botones de guardar ni cancelar: elegir una
 * imagen la aplica al momento.
 *
 * Como en la ficha, cada elección es también un VOTO y la más votada de cada
 * imagen es la de por defecto de la colección para todos. Restaurar borra las
 * elecciones propias y retira los votos.
 *
 * `defaults`: lo que se ve sin elección propia (la más votada o la automática),
 * `criterionDefaults`: las automáticas sin votos (indicador «Por defecto»),
 * por campo; `own`: la elección propia guardada por campo (o `null`).
 */
export default function CollectionEditModal({ collectionId, defaults, criterionDefaults, own, onClose }) {
  const { authenticated, cacheArtworkOverrides } = useAuth()
  const phone = usePhoneViewport()
  const [images, setImages] = useState(() => imagesCache.get(collectionId)?.images || null)
  const [tab, setTab] = useState(null)
  // Lo guardado de verdad: cada elección se calcula contra esto (no contra
  // `own`, que ya refleja la instantánea local antes de guardar).
  const savedRef = useRef({ ...own })
  // Las elecciones propias en la vista, al instante.
  const [draft, setDraft] = useState(() => ({ ...own }))

  useEffect(() => {
    let cancelled = false
    fetchEditImages(collectionId).then((result) => {
      if (!cancelled) setImages(result || {})
    })
    return () => { cancelled = true }
  }, [collectionId])

  async function apply(next) {
    if (!authenticated) return
    const previous = savedRef.current
    const changes = buildCollectionArtworkChanges(previous, next)
    setDraft(next)
    if (!changes.length) return
    const target = { type: COLLECTION_ARTWORK_TYPE, id: Number(collectionId) }
    savedRef.current = next
    cacheArtworkOverrides?.({ ...target, changes })
    // Los votos anteriores se retiran ya: al restaurar, la página no debe
    // caer en esas mismas imágenes como «las más votadas».
    retractOwnArtworkVotes({ ...target, votes: collectionArtworkVotes(previous) })
    const saved = await saveArtworkOverrides({ ...target, changes }).catch(() => false)
    if (saved) {
      // El voto cambia la más votada: la próxima visita vuelve a preguntar.
      forgetCommunityArtwork(target)
    } else if (savedRef.current === next) {
      // Se devuelve la instantánea local a lo que hay guardado de verdad.
      savedRef.current = previous
      setDraft(previous)
      cacheArtworkOverrides?.({ ...target, changes: buildCollectionArtworkChanges(next, previous) })
    }
  }

  // Secciones del editor como pestañas, igual que Portada / Fondo / Logo en
  // la vista lateral de la ficha. El fondo se edita para la vista en la que se
  // está: en móvil la colección usa un póster de fondo y en ordenador un
  // backdrop, y cada uno se guarda por separado; la portada en modo backdrop
  // solo existe en ordenador.
  const tabs = useMemo(() => {
    if (!images) return []
    const textlessPosters = textlessImages(images.posters)
    return [
      { id: 'poster', label: 'Póster', field: 'poster_path', candidates: titledImages(images.posters), aspect: 'poster' },
      phone ? null : { id: 'cover', label: 'Backdrop de portada', field: 'cover_backdrop_path', candidates: titledImages(images.backdrops), aspect: 'backdrop' },
      phone
        // Siempre sin idioma: pósters sin texto y, si la colección no tiene
        // ninguno, sus backdrops sin texto (de fondo se recortan en vertical),
        // los mismos que usa el fondo automático.
        ? { id: 'background', label: 'Fondo', field: 'mobile_background_path', candidates: textlessPosters.length ? textlessPosters : textlessImages(images.backdrops), aspect: textlessPosters.length ? 'poster' : 'backdrop' }
        : { id: 'background', label: 'Fondo', field: 'backdrop_path', candidates: textlessImages(images.backdrops), aspect: 'backdrop' },
    ].filter(Boolean).map(({ field, candidates, ...section }) => {
      const active = draft[field] || defaults[field] || null
      const list = sectionImages(candidates, defaults[field], active)
      return { ...section, kind: field, voteKind: COLLECTION_ARTWORK_KIND_BY_FIELD[field], images: list, activePath: active, defaultPath: criterionDefaults?.[field] || null, count: list.length }
    })
  }, [images, phone, defaults, criterionDefaults, draft])

  const changed = ARTWORK_FIELDS.some((field) => draft[field])
  const data = {
    images: {
      tabs,
      loading: !images,
      voteTarget: { type: COLLECTION_ARTWORK_TYPE, id: Number(collectionId) },
      notice: authenticated ? null : 'Inicia sesión para guardar tu personalización.',
      onSelect: authenticated ? (field, path) => apply({ ...savedRef.current, [field]: path }) : undefined,
      // Restaurar: se borran todas las elecciones propias y vuelven las de por defecto.
      onReset: authenticated && changed ? () => apply(Object.fromEntries(ARTWORK_FIELDS.map((field) => [field, null]))) : undefined,
    },
  }

  return <ImagesSheet meta={META} data={data} onClose={onClose} tab={tab} setTab={setTab} />
}
