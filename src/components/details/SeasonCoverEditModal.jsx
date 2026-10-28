'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { ImagesSheet } from '@/components/details/sectionSheet/DetailsSectionSheets'
import { useAuth } from '@/context/AuthContext'
import { saveArtworkOverrides } from '@/lib/artworkApi'
import { SEASON_ARTWORK_TYPE, buildSeasonCoverChanges } from '@/lib/details/seasonArtwork'
import { forgetCommunitySeasonPoster, retractCommunitySeasonPoster } from '@/lib/details/communitySeasonPosters'

const META = { title: 'Portadas', icon: ImageIcon }

// Solo pósters en español o inglés (con el título impreso que se espera ver):
// el filtro de idioma de la vista ofrece así solo estos dos.
const SPANISH_OR_ENGLISH = new Set(['es', 'en'])
const isSpanishOrEnglish = (img) => SPANISH_OR_ENGLISH.has(String(img?.iso_639_1 || '').toLowerCase())

// Pósters de la temporada (TMDb devuelve todos los idiomas).
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
 * «Editar portada» de una temporada: elegir su póster entre los de TMDb. Es
 * la MISMA vista lateral que «Portadas y fondos» de la ficha (ImagesSheet):
 * resolución en cada imagen, orden e idioma en la hoja de filtros y Restaurar
 * en la cabecera. Sin botón de guardar: elegir una imagen la aplica al
 * momento. Solo pósters en español o inglés.
 *
 * Como en la ficha, cada elección es también un VOTO y la más votada es la
 * portada por defecto de la temporada para todos (en su ficha, las tarjetas
 * de «Temporadas» y la vista previa). Restaurar borra la elección propia y
 * retira el voto: se vuelve a ver la por defecto.
 *
 * `defaultPoster`: la que se ve sin elección propia (la más votada o la
 * automática); `ownPoster`: la elección propia guardada (o `null`).
 */
export default function SeasonCoverEditModal({ seasonId, showId, seasonNumber, defaultPoster, ownPoster, onClose }) {
  const { authenticated, cacheArtworkOverrides } = useAuth()
  const [posters, setPosters] = useState(null)
  const [tab, setTab] = useState(null)
  // La elección propia guardada: cada cambio se calcula contra ella (no contra
  // `ownPoster`, que ya refleja la instantánea local antes de guardar).
  const savedRef = useRef(ownPoster || null)
  // La elección propia en la vista, al instante; sin ella se marca la por defecto.
  const [own, setOwn] = useState(ownPoster || null)
  const active = own || defaultPoster || null

  useEffect(() => {
    let cancelled = false
    fetchSeasonPosters(showId, seasonNumber).then((result) => {
      if (!cancelled) setPosters(result || [])
    })
    return () => { cancelled = true }
  }, [showId, seasonNumber])

  async function apply(path) {
    if (!authenticated) return
    const previous = savedRef.current
    const changes = buildSeasonCoverChanges(previous, path)
    setOwn(path)
    if (!changes.length) return
    const target = { type: SEASON_ARTWORK_TYPE, id: seasonId }
    savedRef.current = path
    cacheArtworkOverrides?.({ ...target, changes })
    // El voto anterior se retira ya: al restablecer, la portada de la página
    // no debe caer en esa misma imagen como «la más votada».
    if (previous) retractCommunitySeasonPoster(seasonId, previous)
    const saved = await saveArtworkOverrides({ ...target, changes }).catch(() => false)
    if (saved) {
      // El voto cambia la más votada: las tarjetas vuelven a preguntar.
      forgetCommunitySeasonPoster(seasonId)
    } else if (savedRef.current === path) {
      // Se devuelve la instantánea local a lo que hay guardado de verdad.
      savedRef.current = previous
      setOwn(previous)
      cacheArtworkOverrides?.({ ...target, changes: buildSeasonCoverChanges(path, previous) })
    }
  }

  // La elegida va primero, como en la ficha.
  const tabs = useMemo(() => {
    if (!posters) return []
    const list = posters.filter((img) => img?.file_path && isSpanishOrEnglish(img))
    const index = list.findIndex((img) => img.file_path === active)
    const images = index > 0 ? [list[index], ...list.slice(0, index), ...list.slice(index + 1)] : list
    return [{ id: 'posters', label: 'Portada', kind: 'poster', aspect: 'poster', images, activePath: active, count: images.length }]
  }, [posters, active])

  const data = {
    images: {
      tabs,
      loading: !posters,
      notice: authenticated ? null : 'Inicia sesión para guardar tu personalización.',
      onSelect: authenticated ? (_, path) => apply(path) : undefined,
      onReset: authenticated && own ? () => apply(null) : undefined,
    },
  }

  return <ImagesSheet meta={META} data={data} onClose={onClose} tab={tab} setTab={setTab} />
}
