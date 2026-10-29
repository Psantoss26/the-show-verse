'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { ImagesSheet } from '@/components/details/sectionSheet/DetailsSectionSheets'
import { useAuth } from '@/context/AuthContext'
import {
  forgetCommunityArtwork,
  readArtworkPreference,
  readPersistedArtworkOverride,
  saveArtworkOverride,
  saveArtworkOverrides,
  writeArtworkPreference,
} from '@/lib/artworkApi'
import { buildDetailModalArtworkTabs } from '@/lib/details/artworkSheetTabs'
import { buildImg, preloadImage } from '@/lib/dashboard/media'
import { fetchTmdbImages } from '@/lib/tmdb/imageRequests'

const META = { title: 'Editar imágenes', icon: Pencil }
const KINDS = ['backdrop', 'logo']
// Mismo tamaño que pinta la cabecera ancha de DetailModal.
const PREVIEW_SIZE = 'original'

// Elección propia guardada de cada capa: instantánea de la cuenta y, sin ella,
// la copia local por título (el mismo criterio que la ficha).
function readOwn(type, id) {
  const snapshot = readPersistedArtworkOverride({ type, id })
  return Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      snapshot ? snapshot[kind] || null : readArtworkPreference(`showverse:${type}:${id}:${kind}`) || null,
    ]),
  )
}

/**
 * Editor de las imágenes de DetailModal (botón Editar de sus controles): el
 * backdrop sin idioma de «Vista previa» y el logo, las dos capas de su
 * cabecera. Es la misma vista lateral que «Portadas y fondos» de la ficha
 * (ImagesSheet), sin Guardar: elegir una imagen la aplica al momento en el
 * modal (`onApply`, ver `applyArtworkSelection`) y la guarda en la cuenta.
 * Como en la ficha, cada elección es un voto; Restaurar borra las dos
 * elecciones propias y vuelven las automáticas.
 *
 * `active`: lo que enseña ahora la cabecera ({ backdrop, logo }).
 */
export default function DetailModalArtworkEditor({ type, id, active, defaults, onApply, onClose }) {
  const { authenticated, cacheArtworkOverrides } = useAuth()
  const [images, setImages] = useState(null)
  const [tab, setTab] = useState(null)
  const [own, setOwn] = useState(() => readOwn(type, id))
  // La elegida se marca ya, mientras se descarga para la cabecera.
  const [draft, setDraft] = useState({})

  useEffect(() => {
    let cancelled = false
    fetchTmdbImages(type, id, { allLanguages: true, priority: 'high' }).then((result) => {
      if (!cancelled) setImages(result || {})
    })
    return () => { cancelled = true }
  }, [type, id])

  const tabs = useMemo(() => {
    if (!images) return []
    return buildDetailModalArtworkTabs({
      backdrops: images.backdrops,
      logos: images.logos,
      active: {
        preview: draft.backdrop || active?.backdrop || null,
        logo: draft.logo || active?.logo || null,
      },
      // Las del criterio automático (indicador «Por defecto»).
      defaults: { preview: defaults?.backdrop || null, logo: defaults?.logo || null },
    })
  }, [images, draft, active?.backdrop, active?.logo, defaults?.backdrop, defaults?.logo])

  function persist(changes) {
    for (const { kind, filePath } of changes) {
      writeArtworkPreference(`showverse:${type}:${id}:${kind}`, filePath)
    }
    cacheArtworkOverrides?.({ type, id, changes })
  }

  async function select(kind, filePath) {
    if (!filePath) return
    setDraft((current) => ({ ...current, [kind]: filePath }))
    setOwn((current) => ({ ...current, [kind]: filePath }))
    persist([{ kind, filePath }])
    saveArtworkOverride({ type, id, kind, filePath })
    // El backdrop de la cabecera es grande: se cambia ya descargado, sin que se
    // vea pintarse a trozos.
    if (kind === 'backdrop') {
      await preloadImage(buildImg(filePath, PREVIEW_SIZE)).catch(() => {})
    }
    onApply?.({ kind, filePath })
    setDraft((current) => (current[kind] === filePath ? { ...current, [kind]: null } : current))
  }

  function reset() {
    const changes = KINDS.map((kind) => ({ kind, filePath: null }))
    setDraft({})
    setOwn({ backdrop: null, logo: null })
    persist(changes)
    // Sin voto propio cambia la más votada: las fichas montadas del título
    // vuelven a preguntar.
    saveArtworkOverrides({ type, id, changes }).then((saved) => {
      if (saved) forgetCommunityArtwork({ type, id })
    })
    for (const { kind } of changes) onApply?.({ kind, filePath: null })
  }

  const data = {
    images: {
      tabs,
      loading: !images,
      voteTarget: { type, id },
      notice: authenticated ? null : 'Inicia sesión para guardar tu personalización.',
      onSelect: authenticated ? select : undefined,
      onReset: authenticated && KINDS.some((kind) => own[kind]) ? reset : undefined,
    },
  }

  return <ImagesSheet meta={META} data={data} onClose={onClose} tab={tab} setTab={setTab} />
}
