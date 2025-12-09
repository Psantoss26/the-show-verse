'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// --- Componente Portal para el Tooltip ---
// Este componente se renderiza fuera de la tabla (en el body)
function TooltipPortal({ activeData, anchorRect, onClose }) {
  const tooltipRef = useRef(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'top' })

  useEffect(() => {
    if (!anchorRect || !tooltipRef.current) return

    const tooltip = tooltipRef.current
    const { width: tW, height: tH } = tooltip.getBoundingClientRect()
    const { top: rTop, left: rLeft, width: rW, height: rH } = anchorRect

    const GAP = 8
    const VIEWPORT_PADDING = 10

    // Posición ideal: centrado arriba
    let left = rLeft + rW / 2 - tW / 2
    let top = rTop - tH - GAP
    let placement = 'top'

    // Corrección X
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING
    } else if (left + tW > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - tW - VIEWPORT_PADDING
    }

    // Si no cabe arriba, lo ponemos abajo
    if (top < VIEWPORT_PADDING) {
      top = rTop + rH + GAP
      placement = 'bottom'
    }

    setCoords({ top, left, placement })
  }, [anchorRect])

  if (!activeData) return null

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999] pointer-events-none transition-opacity duration-150 ease-out"
      style={{
        top: coords.top,
        left: coords.left,
        opacity: anchorRect ? 1 : 0
      }}
    >
      <div className="bg-black text-white px-3 py-2 rounded-md shadow-2xl border border-white/10 max-w-[280px] sm:max-w-[320px]">
        {/* Título episodio */}
        <div className="font-semibold text-[13px] mb-1 leading-snug text-balance">
          {activeData.titleText}
        </div>

        <div className="text-[11px] text-emerald-300 mb-2 font-medium">
          {activeData.seasonInfo}
        </div>

        <div className="space-y-2">
          {/* BLOQUE TMDB CON LOGO */}
          {activeData.tmdbVal != null && (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <img
                  src="/logo-TMDb.png"
                  alt="TMDb"
                  className="h-3 w-auto rounded-[2px]"
                />
                <span className="text-[10px] uppercase tracking-wide text-emerald-300 font-bold">
                  TMDb
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[14px] font-bold">
                  {activeData.format1(activeData.tmdbVal)}
                </span>
                {activeData.tmdbVotesStr && (
                  <span className="text-[10px] text-zinc-400">
                    {activeData.tmdbVotesStr} votos
                  </span>
                )}
              </div>
            </div>
          )}

          {/* BLOQUE IMDB CON LOGO */}
          {activeData.imdbVal != null && (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <img
                  src="/logo-IMDb.png"
                  alt="IMDb"
                  className="h-3 w-auto"
                />
                <span className="text-[10px] uppercase tracking-wide text-yellow-300 font-bold">
                  IMDb
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[14px] font-bold">
                  {activeData.format1(activeData.imdbVal)}
                </span>
                {activeData.imdbVotesStr && (
                  <span className="text-[10px] text-zinc-400">
                    {activeData.imdbVotesStr} votos
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {activeData.avgVal != null && (
          <div className="mt-2 pt-2 border-t border-white/20 text-[11px] flex justify-between gap-4 items-center">
            <span className="text-zinc-400">Media global</span>
            <span className="font-bold text-white text-[13px]">
              {activeData.format1(activeData.avgVal)}
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function EpisodeRatingsGrid({
  ratings,
  initialSource = 'imdb',
  density = 'compact',
  fillMissingWithTmdb = false
}) {
  const [source, setSource] = useState(initialSource)

  // --- ESTADO PARA EL TOOLTIP ---
  const [hoveredEp, setHoveredEp] = useState(null)
  const [anchorRect, setAnchorRect] = useState(null)

  // --- Manejadores del ratón ---
  const handleMouseEnter = (e, epData) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchorRect(rect)
    setHoveredEp(epData)
  }

  const handleMouseLeave = () => {
    setHoveredEp(null)
    setAnchorRect(null)
  }

  // --- tamaños
  const SIZES = {
    compact: {
      cell: 'w-[42px] h-[28px] md:w-[50px] md:h-[32px] lg:w-[58px] lg:h-[36px]',
      headerPad: 'px-2 py-1.5',
      stickyCol: 'w-12 md:w-14 lg:w-16'
    },
    comfy: {
      cell: 'w-[60px] h-[36px] md:w-[70px] md:h-[42px] lg:w-[80px] lg:h-[48px]',
      headerPad: 'px-3 py-2',
      stickyCol: 'w-16 md:w-20 lg:w-24'
    }
  }
  const SZ = SIZES[density] ?? SIZES.compact

  const meta = ratings?.meta || {}
  const totalSeasonsEstimate =
    meta.totalSeasons ??
    (Array.isArray(ratings?.seasons) ? ratings.seasons.length : 0)
  const totalEpisodesEstimate = meta.totalEpisodes ?? 0

  // === helpers numéricos ===
  const toRatingNumber = (value) => {
    if (value == null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string') {
      const cleaned = value.replace(',', '.').trim()
      const num = Number(cleaned)
      return Number.isFinite(num) ? num : null
    }
    return null
  }

  const toNumberSafe = (value) => {
    if (value == null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'string') {
      const cleaned = value.replace(/,/g, '').trim()
      const n = Number(cleaned)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  const shouldFlatten =
    meta.forceSingleSeason === true ||
    totalSeasonsEstimate >= 15 ||
    totalEpisodesEstimate >= 400

  // === Normalizar datos de entrada ===
  const { seasonsSorted, maxEpisodes } = useMemo(() => {
    const rawSeasons = Array.isArray(ratings?.seasons)
      ? ratings.seasons
      : Array.isArray(ratings)
        ? ratings
        : []

    const normalized = rawSeasons
      .map((s) => {
        const seasonNumber =
          typeof s.season_number === 'number'
            ? s.season_number
            : typeof s.seasonNumber === 'number'
              ? s.seasonNumber
              : null
        if (seasonNumber == null) return null

        const episodesArr = Array.isArray(s.episodes) ? s.episodes : []

        const episodes = episodesArr
          .map((ep) => {
            const episodeNumber =
              typeof ep.episode_number === 'number'
                ? ep.episode_number
                : typeof ep.episodeNumber === 'number'
                  ? ep.episodeNumber
                  : null
            if (episodeNumber == null) return null

            const tmdbRating = toRatingNumber(
              ep.tmdbRating ?? ep.tmdb ?? ep.vote_average
            )
            const imdbRating = toRatingNumber(ep.imdbRating ?? ep.imdb)

            const tmdbVotes = toNumberSafe(
              ep.tmdbVotes ?? ep.tmdb_votes ?? ep.vote_count
            )
            const imdbVotes = toNumberSafe(
              ep.imdbVotes ??
              ep.imdb_votes ??
              ep.imdbVotesCount ??
              ep.imdb_votes_count
            )

            return {
              episodeNumber,
              name: ep.name || '',
              tmdbRating,
              imdbRating,
              tmdbVotes,
              imdbVotes
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.episodeNumber - b.episodeNumber)

        return {
          season_number: seasonNumber,
          episodes
        }
      })
      .filter(Boolean)

    let seasons = normalized.filter((s) => s.episodes.length > 0)

    if (shouldFlatten && seasons.length > 1) {
      const allEpisodes = []
      let counter = 1

      seasons
        .slice()
        .sort((a, b) => a.season_number - b.season_number)
        .forEach((s) => {
          s.episodes.forEach((ep) => {
            const hasRating =
              typeof ep.tmdbRating === 'number' ||
              typeof ep.imdbRating === 'number'
            if (!hasRating) return
            allEpisodes.push({
              ...ep,
              episodeNumber: counter++
            })
          })
        })

      const combined = {
        season_number: 1,
        episodes: allEpisodes,
        hasAnyRating: allEpisodes.length > 0
      }

      seasons = combined.hasAnyRating ? [combined] : []
    } else {
      seasons = seasons
        .map((s) => {
          const hasAnyRating = s.episodes.some(
            (ep) =>
              typeof ep.tmdbRating === 'number' ||
              typeof ep.imdbRating === 'number'
          )
          return { ...s, hasAnyRating }
        })
        .filter((s) => s.episodes.length > 0 && s.hasAnyRating)
        .sort((a, b) => a.season_number - b.season_number)
    }

    const maxEp = seasons.reduce((m, s) => {
      const localMax = s.episodes.reduce(
        (mm, e) =>
          typeof e.episodeNumber === 'number' && e.episodeNumber > mm
            ? e.episodeNumber
            : mm,
        0
      )
      return Math.max(m, localMax)
    }, 0)

    return { seasonsSorted: seasons, maxEpisodes: maxEp }
  }, [ratings, shouldFlatten])

  const singleSeasonView =
    shouldFlatten && seasonsSorted.length === 1 && totalSeasonsEstimate > 1

  const epIndexBySeason = useMemo(() => {
    const map = new Map()
    seasonsSorted.forEach((s) => {
      const inner = new Map()
      s.episodes.forEach((e) => inner.set(e.episodeNumber, e))
      map.set(s.season_number, inner)
    })
    return map
  }, [seasonsSorted])

  // --- helpers visuales ---
  const format1 = (v) => {
    if (v == null) return null
    const num = Math.round(Number(v) * 10) / 10
    return Number.isInteger(num) ? num.toString() : num.toFixed(1)
  }

  const pickValue = (ep) => {
    if (!ep) return null
    if (source === 'tmdb') return ep.tmdbRating ?? null
    if (source === 'imdb') return ep.imdbRating ?? null

    const vals = [ep.tmdbRating, ep.imdbRating].filter(
      (v) => typeof v === 'number'
    )
    if (!vals.length) return null
    return Number(
      (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
    )
  }

  const toneFor = (v) => {
    if (v == null)
      return {
        bg: 'bg-zinc-800',
        text: 'text-zinc-400',
        ring: 'ring-white/5'
      }
    if (v >= 9.3)
      return {
        bg: 'bg-emerald-700',
        text: 'text-white',
        ring: 'ring-white/10'
      }
    if (v >= 9.0)
      return {
        bg: 'bg-emerald-600',
        text: 'text-white',
        ring: 'ring-white/10'
      }
    if (v >= 8.5)
      return {
        bg: 'bg-emerald-500',
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 8.0)
      return {
        bg: 'bg-lime-400',
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 7.0)
      return {
        bg: 'bg-yellow-400',
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 6.0)
      return {
        bg: 'bg-orange-500',
        text: 'text-black',
        ring: 'ring-black/10'
      }
    return { bg: 'bg-red-600', text: 'text-white', ring: 'ring-white/10' }
  }

  if (!seasonsSorted.length || maxEpisodes === 0) return null

  return (
    <>
      <div className="space-y-3">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">
            Puntuaciones por episodio
          </h3>
          <div className="flex items-center gap-1 text-xs">
            <span className="opacity-70">Fuente:</span>
            <Toggle
              active={source === 'avg'}
              onClick={() => setSource('avg')}
            >
              Media
            </Toggle>
            <Toggle
              active={source === 'tmdb'}
              onClick={() => setSource('tmdb')}
            >
              TMDb
            </Toggle>
            <Toggle
              active={source === 'imdb'}
              onClick={() => setSource('imdb')}
            >
              IMDb
            </Toggle>
          </div>
        </div>

        <LegendCompact />

        {/* Tabla */}
        <div className="overflow-x-auto overflow-y-visible">
          <table className="border-separate border-spacing-0">
            <thead>
              <tr>
                <th
                  className={`sticky left-0 z-10 bg-black/60 backdrop-blur ${SZ.headerPad} text-left text-[11px] text-zinc-400 font-medium ${SZ.stickyCol}`}
                />
                {seasonsSorted.map((s) => (
                  <th
                    key={s.season_number}
                    className={`${SZ.headerPad} text-center text-xs text-zinc-200 font-semibold bg-black/60 backdrop-blur border-b border-white/10`}
                  >
                    S{s.season_number}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: maxEpisodes }).map((_, i) => {
                const epNum = i + 1
                return (
                  <tr key={`row-${epNum}`}>
                    <td
                      className={`sticky left-0 z-10 bg-black/60 backdrop-blur ${SZ.headerPad} text-[11px] text-zinc-300 font-medium ${SZ.stickyCol} border-r border-white/5`}
                    >
                      E{epNum}
                    </td>

                    {seasonsSorted.map((s) => {
                      const ep = epIndexBySeason
                        .get(s.season_number)
                        ?.get(epNum)
                      const raw = pickValue(ep)
                      const val = format1(raw)
                      const spec = toneFor(raw)

                      // Preparamos datos para el tooltip
                      const hasData = ep && (ep.tmdbRating != null || ep.imdbRating != null)

                      let tooltipData = null
                      if (hasData) {
                        const titleText = ep?.name || `Episodio ${epNum}`
                        const tmdbVal = ep.tmdbRating
                        const imdbVal = ep.imdbRating
                        const tmdbVotesStr = ep.tmdbVotes ? ep.tmdbVotes.toLocaleString() : null
                        const imdbVotesStr = ep.imdbVotes ? ep.imdbVotes.toLocaleString() : null

                        const avgVal = (tmdbVal == null && imdbVal == null)
                          ? null
                          : Number(
                            ([tmdbVal, imdbVal].filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0) /
                              [tmdbVal, imdbVal].filter((v) => typeof v === 'number').length).toFixed(1)
                          )

                        const seasonInfo = singleSeasonView
                          ? `Episode ${epNum}`
                          : `Season ${s.season_number}, Episode ${epNum}`

                        tooltipData = {
                          titleText,
                          seasonInfo,
                          tmdbVal,
                          imdbVal,
                          tmdbVotesStr,
                          imdbVotesStr,
                          avgVal,
                          format1 // pasamos la funcion helper
                        }
                      }

                      return (
                        <td key={`s${s.season_number}-e${epNum}`} className="p-1">
                          <div
                            // Ya no usamos relative ni group para el tooltip interno
                            // Usamos handlers de JS para el portal
                            onMouseEnter={(e) => hasData && handleMouseEnter(e, tooltipData)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <div
                              className={`
                                ${spec.bg} ${spec.text} ring-1 ${spec.ring}
                                rounded-[20px] md:rounded-[24px]
                                ${SZ.cell}
                                flex items-center justify-center
                                font-medium leading-none tracking-tight
                                [font-variant-numeric:tabular-nums]
                                text-[15px] md:text-[16px] lg:text-[17px]
                                shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]
                                hover:brightness-[1.1] hover:scale-[1.1] hover:z-20
                                transition duration-200
                                cursor-default
                                outline-none focus:ring-2 focus:ring-white/30
                                select-none
                              `}
                              role="button"
                              tabIndex={0}
                            >
                              {val ?? '—'}
                            </div>

                            {/* NOTA: Eliminamos el Tooltip interno de aquí */}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renderizamos el Portal al final. Solo aparece cuando hay hover */}
      <TooltipPortal
        activeData={hoveredEp}
        anchorRect={anchorRect}
      />
    </>
  )
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-xs transition-colors
        ${active
          ? 'bg-white text-black border-white'
          : 'border-zinc-600 text-zinc-300 hover:bg-zinc-800'
        }
      `}
    >
      {children}
    </button>
  )
}

function LegendCompact() {
  const items = [
    ['bg-emerald-700', '≥ 9.3'],
    ['bg-emerald-600', '9.0–9.2'],
    ['bg-emerald-500', '8.5–8.9'],
    ['bg-lime-400', '8.0–8.4'],
    ['bg-yellow-400', '7.0–7.9'],
    ['bg-orange-500', '6.0–6.9'],
    ['bg-red-600', '≤ 5.9'],
    ['bg-zinc-800', '—']
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1">
          <i className={`inline-block w-3 h-3 rounded ${c}`} />
          {l}
        </span>
      ))}
    </div>
  )
}