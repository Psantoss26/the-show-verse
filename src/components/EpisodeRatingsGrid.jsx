'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// --- Tooltip flotante en portal (igual que antes) ---
function TooltipPortal({ activeData, anchorRect }) {
  const tooltipRef = useRef(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'top' })

  useEffect(() => {
    if (!anchorRect || !tooltipRef.current) return

    const tooltip = tooltipRef.current
    const { width: tW, height: tH } = tooltip.getBoundingClientRect()
    const { top: rTop, left: rLeft, width: rW, height: rH } = anchorRect

    const GAP = 8
    const VIEWPORT_PADDING = 10

    let left = rLeft + rW / 2 - tW / 2
    let top = rTop - tH - GAP
    let placement = 'top'

    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING
    } else if (left + tW > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - tW - VIEWPORT_PADDING
    }

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
          {/* TMDb */}
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

          {/* IMDb */}
          {activeData.imdbVal != null && (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <img src="/logo-IMDb.png" alt="IMDb" className="h-3 w-auto" />
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
  initialSource = 'imdb', // ya no se usa, pero lo dejamos por compatibilidad
  density = 'compact',
  fillMissingWithTmdb = true
}) {
  // Controles estilo SeriesGraph
  const [layoutMode, setLayoutMode] = useState('grid') // 'grid' | 'wrapped'
  const [inverted, setInverted] = useState(false)
  const [showSeasonAvg, setShowSeasonAvg] = useState(false)

  // Tooltip
  const [hoveredEp, setHoveredEp] = useState(null)
  const [anchorRect, setAnchorRect] = useState(null)

  const handleMouseEnter = (e, epData) => {
    if (!epData) return
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchorRect(rect)
    setHoveredEp(epData)
  }

  const handleMouseLeave = () => {
    setHoveredEp(null)
    setAnchorRect(null)
  }

  // tamaños
  const SIZES = {
    compact: {
      cell: 'w-[46px] h-[30px] md:w-[54px] md:h-[34px] lg:w-[60px] lg:h-[38px]',
      headerPad: 'px-2 py-1.5',
      stickyCol: 'w-12 md:w-14 lg:w-16'
    },
    comfy: {
      cell: 'w-[64px] h-[38px] md:w-[74px] md:h-[44px] lg:w-[84px] lg:h-[48px]',
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

  // helpers numéricos
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

  // const shouldFlatten =
  //   meta.forceSingleSeason === true ||
  //   totalSeasonsEstimate >= 15 ||
  //   totalEpisodesEstimate >= 400

  const shouldFlatten = meta.forceSingleSeason === true

  // === Normalizar datos ===
  const { seasonsSorted, maxEpisodes, seasonAverages } = useMemo(() => {
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

            let displayRating = imdbRating
            if (displayRating == null && fillMissingWithTmdb) {
              displayRating = tmdbRating
            }

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
              displayRating,
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
            if (ep.displayRating == null) return
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
            (ep) => typeof ep.displayRating === 'number'
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

    const seasonAveragesMap = new Map()
    seasons.forEach((s) => {
      const vals = s.episodes
        .map((e) => e.displayRating)
        .filter((v) => typeof v === 'number')
      if (!vals.length) {
        seasonAveragesMap.set(s.season_number, null)
        return
      }
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      seasonAveragesMap.set(s.season_number, avg)
    })

    return { seasonsSorted: seasons, maxEpisodes: maxEp, seasonAverages: seasonAveragesMap }
  }, [ratings, shouldFlatten, fillMissingWithTmdb])

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

  const format1 = (v) => {
    if (v == null) return null
    const num = Math.round(Number(v) * 10) / 10
    return Number.isInteger(num) ? num.toString() : num.toFixed(1)
  }

  // Colores estilo SeriesGraph (Bad = rojo, Garbage = morado)
  const toneFor = (v) => {
    if (v == null)
      return {
        bg: 'bg-zinc-800',
        text: 'text-zinc-400',
        ring: 'ring-white/5'
      }

    if (v >= 9.5)
      return {
        bg: 'bg-teal-400',      // Absolute Cinema
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 9.0)
      return {
        bg: 'bg-emerald-700',   // Awesome
        text: 'text-white/90',
        ring: 'ring-black/10'
      }
    if (v >= 8.0)
      return {
        bg: 'bg-green-500',     // Great
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 7.0)
      return {
        bg: 'bg-yellow-300',      // Good
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 6.0)
      return {
        bg: 'bg-yellow-500',    // Average
        text: 'text-black',
        ring: 'ring-black/10'
      }
    if (v >= 5.0)
      return {
        bg: 'bg-red-500',       // Bad
        text: 'text-white',
        ring: 'ring-black/10'
      }

    return {
      bg: 'bg-purple-700',      // Garbage
      text: 'text-white',
      ring: 'ring-white/10'
    }
  }

  const buildTooltipData = (ep, seasonNumber, episodeNumber) => {
    if (!ep) return null
    const hasData =
      ep.tmdbRating != null ||
      ep.imdbRating != null ||
      ep.displayRating != null
    if (!hasData) return null

    const titleText = ep.name || `Episodio ${episodeNumber}`
    const tmdbVal = ep.tmdbRating
    const imdbVal = ep.imdbRating
    const tmdbVotesStr = ep.tmdbVotes ? ep.tmdbVotes.toLocaleString() : null
    const imdbVotesStr = ep.imdbVotes ? ep.imdbVotes.toLocaleString() : null

    const nums = [tmdbVal, imdbVal].filter((v) => typeof v === 'number')
    const avgVal = nums.length
      ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1))
      : null

    const seasonInfo = singleSeasonView
      ? `Episode ${episodeNumber}`
      : `Season ${seasonNumber}, Episode ${episodeNumber}`

    return {
      titleText,
      seasonInfo,
      tmdbVal,
      imdbVal,
      tmdbVotesStr,
      imdbVotesStr,
      avgVal,
      format1
    }
  }

  if (!seasonsSorted.length || maxEpisodes === 0) return null

  // === Render Grid normal (S columnas / E filas) ===
  const renderGrid = () => (
    <div className="overflow-x-auto overflow-y-visible mt-2">
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
                  const raw = ep?.displayRating ?? null
                  const val = format1(raw)
                  const spec = toneFor(raw)

                  const tooltipData = buildTooltipData(
                    ep,
                    s.season_number,
                    epNum
                  )

                  return (
                    <td key={`s${s.season_number}-e${epNum}`} className="p-1">
                      <div
                        onMouseEnter={(e) =>
                          tooltipData && handleMouseEnter(e, tooltipData)
                        }
                        onMouseLeave={handleMouseLeave}
                      >
                        <div
                          className={`
                            ${spec.bg} ${spec.text}
                            ${SZ.cell}
                            rounded-[6px]
                            flex items-center justify-center
                            text-[14px] md:text-[15px] lg:text-[22px]
                            font-semibold
                            [font-variant-numeric:tabular-nums]
                            shadow-[0_0_0_2px_rgba(0,0,0,0.9)]
                            cursor-default select-none
                          `}
                        >
                          {val ?? '—'}
                        </div>

                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}

          {showSeasonAvg && (
            <tr>
              <td
                className={`sticky left-0 z-10 bg-black/80 backdrop-blur ${SZ.headerPad} text-[11px] text-zinc-100 font-semibold ${SZ.stickyCol} border-t border-white/10 border-r border-white/5`}
              >
                AVG
              </td>

              {seasonsSorted.map((s) => {
                const avg = seasonAverages.get(s.season_number) ?? null
                const spec = toneFor(avg)
                const val = format1(avg)

                return (
                  <td
                    key={`avg-s${s.season_number}`}
                    className="px-2 pt-3 pb-2 text-center align-bottom border-t border-white/10"
                  >
                    <div className="flex flex-col items-center gap-[2px] min-w-[40px]">
                      {/* número */}
                      <span
                        className="
                          text-sm md:text-base lg:text-lg
                          font-semibold
                          text-white
                          [font-variant-numeric:tabular-nums]
                        "
                      >
                        {val ?? '—'}
                      </span>

                      {/* barra de color */}
                      <span
                        className={`
                          mt-[2px]
                          h-[3px] md:h-[4px]
                          w-8 md:w-10 lg:w-12
                          rounded-full
                          ${avg == null ? 'bg-zinc-700' : spec.bg}
                        `}
                      />
                    </div>
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  // === Render Grid invertido (E columnas / S filas) ===
  const renderGridInverted = () => (
    <div className="overflow-x-auto overflow-y-visible mt-2">
      <table className="border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              className={`sticky left-0 z-10 bg-black/60 backdrop-blur ${SZ.headerPad} text-left text-[11px] text-zinc-400 font-medium ${SZ.stickyCol}`}
            >
              {/* vacío */}
            </th>
            {Array.from({ length: maxEpisodes }).map((_, i) => (
              <th
                key={`eh-${i + 1}`}
                className={`${SZ.headerPad} text-center text-xs text-zinc-200 font-semibold bg-black/60 backdrop-blur border-b border-white/10`}
              >
                E{i + 1}
              </th>
            ))}
            {showSeasonAvg && (
              <th
                className={`${SZ.headerPad} text-center text-xs text-zinc-200 font-semibold bg-black/60 backdrop-blur border-b border-white/10`}
              >
                AVG
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {seasonsSorted.map((s) => (
            <tr key={`row-s${s.season_number}`}>
              <td
                className={`sticky left-0 z-10 bg-black/60 backdrop-blur ${SZ.headerPad} text-[11px] text-zinc-300 font-medium ${SZ.stickyCol} border-r border-white/5`}
              >
                S{s.season_number}
              </td>
              {Array.from({ length: maxEpisodes }).map((_, i) => {
                const epNum = i + 1
                const ep = epIndexBySeason
                  .get(s.season_number)
                  ?.get(epNum)
                const raw = ep?.displayRating ?? null
                const val = format1(raw)
                const spec = toneFor(raw)
                const tooltipData = buildTooltipData(
                  ep,
                  s.season_number,
                  epNum
                )

                return (
                  <td
                    key={`s${s.season_number}-e${epNum}`}
                    className="p-1"
                  >
                    <div
                      onMouseEnter={(e) =>
                        tooltipData && handleMouseEnter(e, tooltipData)
                      }
                      onMouseLeave={handleMouseLeave}
                    >
                      <div
                        className={`
                          ${spec.bg} ${spec.text} ring-1 ${spec.ring}
                          rounded-[6px] md:rounded-[6px]
                          ${SZ.cell}
                          flex items-center justify-center
                          font-semibold leading-none tracking-tight
                          [font-variant-numeric:tabular-nums]
                          text-[15px] md:text-[16px] lg:text-[22px]
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
                    </div>
                  </td>
                )
              })}

              {showSeasonAvg && (
                <td className="px-2 pt-3 pb-2 text-center align-bottom border-l border-white/10">
                  {(() => {
                    const avg =
                      seasonAverages.get(s.season_number) ?? null
                    const spec = toneFor(avg)
                    const val = format1(avg)

                    return (
                      <div className="flex flex-col items-center gap-[2px] min-w-[40px]">
                        <span
                          className="
                            text-sm md:text-base lg:text-lg
                            font-semibold
                            text-white
                            [font-variant-numeric:tabular-nums]
                          "
                        >
                          {val ?? '—'}
                        </span>
                        <span
                          className={`
                            mt-[2px]
                            h-[3px] md:h-[4px]
                            w-8 md:w-10 lg:w-12
                            rounded-full
                            ${avg == null ? 'bg-zinc-700' : spec.bg}
                          `}
                        />
                      </div>
                    )
                  })()}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // === Render Wrapped (cada temporada en un bloque) ===
  const renderWrapped = () => (
    <div className="space-y-6 mt-2">
      {seasonsSorted.map((s) => {
        const avg = seasonAverages.get(s.season_number) ?? null
        return (
          <div key={`wrap-s${s.season_number}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-zinc-100">
                Season {s.season_number}
              </span>
              {showSeasonAvg && avg != null && (
                <span className="text-xs text-zinc-400">
                  Avg:{' '}
                  <span className="font-semibold text-white">
                    {format1(avg)}
                  </span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {s.episodes.map((ep) => {
                const raw = ep.displayRating ?? null
                const spec = toneFor(raw)
                const val = format1(raw)
                const tooltipData = buildTooltipData(
                  ep,
                  s.season_number,
                  ep.episodeNumber
                )
                return (
                  <div
                    key={`wrap-s${s.season_number}-e${ep.episodeNumber}`}
                    className="flex flex-col items-center gap-1"
                    onMouseEnter={(e) =>
                      tooltipData && handleMouseEnter(e, tooltipData)
                    }
                    onMouseLeave={handleMouseLeave}
                  >
                    <div
                      className={`
                        ${spec.bg} ${spec.text} ring-1 ${spec.ring}
                        rounded-[6px] md:rounded-[6px]
                        ${SZ.cell}
                        flex items-center justify-center
                        font-semibold leading-none tracking-tight
                        [font-variant-numeric:tabular-nums]
                        text-[15px] md:text-[16px] lg:text-[22px]
                        shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]
                        hover:brightness-[1.1] hover:scale-[1.05]
                        transition duration-200
                        cursor-default
                        select-none
                      `}
                    >
                      {val ?? '—'}
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      E{ep.episodeNumber}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <div className="space-y-3">
        {/* Controles estilo SeriesGraph */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedToggle
              options={[
                { id: 'grid', label: 'Grid' },
                { id: 'wrapped', label: 'Wrapped' }
              ]}
              value={layoutMode}
              onChange={setLayoutMode}
            />
            <ModeChip
              active={inverted}
              disabled={layoutMode === 'wrapped'}
              onClick={() =>
                layoutMode === 'grid' && setInverted((v) => !v)
              }
            >
              Inverted
            </ModeChip>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <span>Season Avg.</span>
            <Switch
              checked={showSeasonAvg}
              onChange={setShowSeasonAvg}
            />
          </div>
        </div>

        <LegendSeriesGraph />

        {/* Layout */}
        {layoutMode === 'grid'
          ? (inverted ? renderGridInverted() : renderGrid())
          : renderWrapped()}
      </div>

      <TooltipPortal activeData={hoveredEp} anchorRect={anchorRect} />
    </>
  )
}

// === Controles auxiliares ===

function ModeChip({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-md text-[11px] font-medium border
        flex items-center gap-1
        transition-colors
        ${disabled
          ? 'opacity-40 cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500'
          : active
            ? 'bg-zinc-100 text-black border-zinc-100 shadow-sm'
            : 'bg-zinc-900/70 text-zinc-300 border-zinc-700 hover:bg-zinc-800'}
      `}
    >
      {children}
    </button>
  )
}

function SegmentedToggle({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-md bg-zinc-900/70 border border-zinc-700 p-0.5">
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              px-3 py-1.5 text-[11px] font-medium rounded-[6px]
              transition-colors
              ${active
                ? 'bg-zinc-100 text-black shadow-sm'
                : 'text-zinc-300 hover:bg-zinc-800'}
            `}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        w-9 h-5 rounded-full flex items-center px-[3px]
        transition-colors
        ${checked ? 'bg-emerald-500' : 'bg-zinc-700'}
      `}
      aria-pressed={checked}
    >
      <span
        className={`
          w-4 h-4 rounded-full bg-white shadow
          transform transition-transform
          ${checked ? 'translate-x-4' : 'translate-x-0'}
        `}
      />
    </button>
  )
}

// Leyenda con los mismos rangos / etiquetas que SeriesGraph
function LegendSeriesGraph() {
  const items = [
    ['bg-teal-400', 'Absolute Cinema'],
    ['bg-emerald-500', 'Awesome'],
    ['bg-green-500', 'Great'],
    ['bg-lime-400', 'Good'],
    ['bg-yellow-400', 'Average'],
    ['bg-red-500', 'Bad'],
    ['bg-purple-700', 'Garbage'],
    ['bg-zinc-800', 'Sin nota']
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-300">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className={`inline-block w-3 h-3 rounded-full ${c}`} />
          {l}
        </span>
      ))}
    </div>
  )
}
