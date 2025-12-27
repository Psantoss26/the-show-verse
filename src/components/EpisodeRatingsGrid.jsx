'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { LayoutGrid, WrapText, ArrowUpDown, BarChart3 } from 'lucide-react'

/* =======================
   Hooks (perf / mobile)
======================= */
function useIsTouchLike() {
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mqHoverNone = window.matchMedia?.('(hover: none)')
    const mqCoarse = window.matchMedia?.('(pointer: coarse)')

    const compute = () => {
      const touch =
        ('ontouchstart' in window) ||
        (navigator?.maxTouchPoints || 0) > 0 ||
        !!mqHoverNone?.matches ||
        !!mqCoarse?.matches
      setIsTouch(touch)
    }

    compute()

    const onChange = () => compute()
    mqHoverNone?.addEventListener?.('change', onChange)
    mqCoarse?.addEventListener?.('change', onChange)

    return () => {
      mqHoverNone?.removeEventListener?.('change', onChange)
      mqCoarse?.removeEventListener?.('change', onChange)
    }
  }, [])

  return isTouch
}

function useInViewOnce(rootMargin = '300px') {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return

    const io = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [inView, rootMargin])

  return { ref, inView }
}

// --- Tooltip flotante en portal (igual que antes, pero desactivable) ---
function TooltipPortal({ activeData, anchorRect, enabled }) {
  const tooltipRef = useRef(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: 'top' })

  useEffect(() => {
    if (!enabled) return
    if (!anchorRect || !tooltipRef.current) return

    const tooltip = tooltipRef.current
    const { width: tW, height: tH } = tooltip.getBoundingClientRect()
    const { top: rTop, left: rLeft, width: rW, height: rH } = anchorRect

    const GAP = 8
    const VIEWPORT_PADDING = 10

    let left = rLeft + rW / 2 - tW / 2
    let top = rTop - tH - GAP
    let placement = 'top'

    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING
    else if (left + tW > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - tW - VIEWPORT_PADDING
    }

    if (top < VIEWPORT_PADDING) {
      top = rTop + rH + GAP
      placement = 'bottom'
    }

    setCoords({ top, left, placement })
  }, [anchorRect, enabled])

  if (!enabled) return null
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
        <div className="font-semibold text-[13px] mb-1 leading-snug text-balance">
          {activeData.titleText}
        </div>

        <div className="text-[11px] text-emerald-300 mb-2 font-medium">
          {activeData.seasonInfo}
        </div>

        <div className="space-y-2">
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
  initialSource = 'imdb', // compat
  density = 'compact',
  fillMissingWithTmdb = true
}) {
  const isTouchLike = useIsTouchLike()
  const { ref: inViewRef, inView } = useInViewOnce('450px')

  // Controles estilo SeriesGraph
  const [layoutMode, setLayoutMode] = useState('wrapped') // 'grid' | 'wrapped'
  const userPickedLayoutRef = useRef(false)

  const [inverted, setInverted] = useState(false)
  const [showSeasonAvg, setShowSeasonAvg] = useState(false)

  // Tooltip (DESACTIVADO EN MÓVIL/TOUCH)
  const tooltipEnabled = !isTouchLike
  const [hoveredEp, setHoveredEp] = useState(null)
  const [anchorRect, setAnchorRect] = useState(null)

  const handleMouseEnter = useCallback((e, epData) => {
    if (!tooltipEnabled || !epData) return
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchorRect(rect)
    setHoveredEp(epData)
  }, [tooltipEnabled])

  const handleMouseLeave = useCallback(() => {
    if (!tooltipEnabled) return
    setHoveredEp(null)
    setAnchorRect(null)
  }, [tooltipEnabled])

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

  // helpers numéricos
  const toRatingNumber = (value) => {
    if (value == null) return null
    if (typeof value === 'number') {
      const n = Number(value)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    if (typeof value === 'string') {
      const cleaned = value.replace(',', '.').trim()
      const num = Number(cleaned)
      return Number.isFinite(num) && num > 0 ? num : null
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

            const airDateStr = ep.air_date || ep.airDate || null
            let isUnaired = false
            if (airDateStr) {
              const d = new Date(airDateStr)
              if (!Number.isNaN(d.getTime()) && d > new Date()) isUnaired = true
            }

            let tmdbRating = toRatingNumber(
              ep.tmdbRating ?? ep.tmdb ?? ep.vote_average
            )
            let imdbRating = toRatingNumber(ep.imdbRating ?? ep.imdb)

            let displayRating = imdbRating
            if (displayRating == null && fillMissingWithTmdb) displayRating = tmdbRating

            if (isUnaired) {
              tmdbRating = null
              imdbRating = null
              displayRating = null
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
              imdbVotes,
              airDate: airDateStr,
              isUnaired
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.episodeNumber - b.episodeNumber)

        return { season_number: seasonNumber, episodes }
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
            allEpisodes.push({ ...ep, episodeNumber: counter++ })
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

  const episodeNumbers = useMemo(() => {
    return Array.from({ length: maxEpisodes }, (_, i) => i + 1)
  }, [maxEpisodes])

  const format1 = (v) => {
    if (v == null) return null
    const num = Math.round(Number(v) * 10) / 10
    return Number.isInteger(num) ? num.toString() : num.toFixed(1)
  }

  const toneFor = (v) => {
    if (v == null)
      return { bg: 'bg-zinc-800', text: 'text-zinc-400', ring: 'ring-white/5' }
    if (v >= 9.5) return { bg: 'bg-teal-400', text: 'text-black', ring: 'ring-black/10' }
    if (v >= 9.0) return { bg: 'bg-emerald-700', text: 'text-white/90', ring: 'ring-black/10' }
    if (v >= 8.0) return { bg: 'bg-green-500', text: 'text-black', ring: 'ring-black/10' }
    if (v >= 7.0) return { bg: 'bg-yellow-300', text: 'text-black', ring: 'ring-black/10' }
    if (v >= 6.0) return { bg: 'bg-yellow-500', text: 'text-black', ring: 'ring-black/10' }
    if (v >= 5.0) return { bg: 'bg-red-500', text: 'text-white', ring: 'ring-black/10' }
    return { bg: 'bg-purple-700', text: 'text-white', ring: 'ring-white/10' }
  }

  const buildTooltipData = (ep, seasonNumber, episodeNumber) => {
    if (!tooltipEnabled) return null
    if (!ep || ep.isUnaired) return null

    const hasData =
      ep.tmdbRating != null || ep.imdbRating != null || ep.displayRating != null
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

  // ✅ Auto-optimización móvil:
  // - si es touch y el grid es grande, cambiamos por defecto a Wrapped (sin impedir que el usuario elija Grid)
  const gridSize = seasonsSorted.length * maxEpisodes
  const isHeavyGrid = gridSize >= 420 // umbral razonable para móviles (ajustable)

  useEffect(() => {
    if (!isTouchLike) return
    if (userPickedLayoutRef.current) return
    if (layoutMode !== 'grid') return
    if (isHeavyGrid) setLayoutMode('wrapped')
  }, [isTouchLike, layoutMode, isHeavyGrid])

  const setLayoutModeSafe = (mode) => {
    userPickedLayoutRef.current = true
    setLayoutMode(mode)
    if (mode === 'wrapped') {
      // limpiamos tooltip si venimos de grid
      setHoveredEp(null)
      setAnchorRect(null)
    }
  }

  if (!seasonsSorted.length || maxEpisodes === 0) return null

  // =======================
  //  Render GRID normal
  //  (optim: menos blur/shadows en móvil + content-visibility)
  // =======================
  const renderGrid = () => (
    <div
      className="overflow-x-auto overflow-y-visible mt-2 [-webkit-overflow-scrolling:touch] overscroll-contain"
      style={{
        // ⚡ evita que el navegador “pinte todo” cuando está fuera de pantalla (gran mejora en scroll móvil)
        contentVisibility: 'auto',
        containIntrinsicSize: '900px 520px'
      }}
    >
      <table className="border-separate border-spacing-0 [table-layout:fixed]">
        <thead>
          <tr>
            <th
              className={`
                sticky left-0 z-10
                bg-black/70
                md:bg-black/60 md:backdrop-blur
                ${SZ.headerPad}
                text-left text-[11px] text-zinc-400 font-medium
                ${SZ.stickyCol}
              `}
            />
            {seasonsSorted.map((s) => (
              <th
                key={s.season_number}
                className={`
                  ${SZ.headerPad}
                  text-center text-xs text-zinc-200 font-semibold
                  bg-black/70
                  md:bg-black/60 md:backdrop-blur
                  border-b border-white/10
                `}
              >
                S{s.season_number}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {episodeNumbers.map((epNum) => (
            <tr key={`row-${epNum}`}>
              <td
                className={`
                  sticky left-0 z-10
                  bg-black/70
                  md:bg-black/60 md:backdrop-blur
                  ${SZ.headerPad}
                  text-[11px] text-zinc-300 font-medium
                  ${SZ.stickyCol}
                  border-r border-white/5
                `}
              >
                E{epNum}
              </td>

              {seasonsSorted.map((s) => {
                const ep = epIndexBySeason.get(s.season_number)?.get(epNum)
                const isUpcoming = ep?.isUnaired
                const raw = isUpcoming ? null : ep?.displayRating ?? null
                const val = isUpcoming ? '?' : format1(raw)
                const spec = toneFor(raw)

                const bgClass = isUpcoming ? 'bg-zinc-400' : spec.bg
                const textClass = isUpcoming ? 'text-black' : spec.text

                const tooltipData = isUpcoming ? null : buildTooltipData(ep, s.season_number, epNum)

                return (
                  <td key={`s${s.season_number}-e${epNum}`} className="p-1">
                    <div
                      onMouseEnter={
                        tooltipEnabled ? (e) => tooltipData && handleMouseEnter(e, tooltipData) : undefined
                      }
                      onMouseLeave={tooltipEnabled ? handleMouseLeave : undefined}
                    >
                      <div
                        className={`
                          ${bgClass} ${textClass}
                          ${SZ.cell}
                          rounded-[6px]
                          flex items-center justify-center
                          text-[14px] md:text-[15px] lg:text-[22px]
                          font-semibold
                          [font-variant-numeric:tabular-nums]
                          select-none
                          cursor-default
                          ${tooltipEnabled ? 'md:shadow-[0_0_0_2px_rgba(0,0,0,0.9)]' : 'shadow-none'}
                        `}
                      >
                        {val ?? '—'}
                      </div>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}

          {showSeasonAvg && (
            <tr>
              <td
                className={`
                  sticky left-0 z-10
                  bg-black/80
                  md:backdrop-blur
                  ${SZ.headerPad}
                  text-[11px] text-zinc-100 font-semibold
                  ${SZ.stickyCol}
                  border-t border-white/10 border-r border-white/5
                `}
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
                      <span className="text-sm md:text-base lg:text-lg font-semibold text-white [font-variant-numeric:tabular-nums]">
                        {val ?? '—'}
                      </span>
                      <span
                        className={`
                          mt-[2px] h-[3px] md:h-[4px] w-8 md:w-10 lg:w-12 rounded-full
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

  // =======================
  //  Render GRID invertido
  // =======================
  const renderGridInverted = () => (
    <div
      className="overflow-x-auto overflow-y-visible mt-2 [-webkit-overflow-scrolling:touch] overscroll-contain"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '900px 520px'
      }}
    >
      <table className="border-separate border-spacing-0 [table-layout:fixed]">
        <thead>
          <tr>
            <th
              className={`
                sticky left-0 z-10
                bg-black/70
                md:bg-black/60 md:backdrop-blur
                ${SZ.headerPad}
                text-left text-[11px] text-zinc-400 font-medium
                ${SZ.stickyCol}
              `}
            />
            {episodeNumbers.map((epNum) => (
              <th
                key={`eh-${epNum}`}
                className={`
                  ${SZ.headerPad}
                  text-center text-xs text-zinc-200 font-semibold
                  bg-black/70
                  md:bg-black/60 md:backdrop-blur
                  border-b border-white/10
                `}
              >
                E{epNum}
              </th>
            ))}
            {showSeasonAvg && (
              <th
                className={`
                  ${SZ.headerPad}
                  text-center text-xs text-zinc-200 font-semibold
                  bg-black/70
                  md:bg-black/60 md:backdrop-blur
                  border-b border-white/10
                `}
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
                className={`
                  sticky left-0 z-10
                  bg-black/70
                  md:bg-black/60 md:backdrop-blur
                  ${SZ.headerPad}
                  text-[11px] text-zinc-300 font-medium
                  ${SZ.stickyCol}
                  border-r border-white/5
                `}
              >
                S{s.season_number}
              </td>

              {episodeNumbers.map((epNum) => {
                const ep = epIndexBySeason.get(s.season_number)?.get(epNum)

                const isUpcoming = ep?.isUnaired
                const raw = isUpcoming ? null : ep?.displayRating ?? null
                const val = isUpcoming ? '?' : format1(raw)
                const spec = toneFor(raw)
                const bgClass = isUpcoming ? 'bg-zinc-400' : spec.bg
                const textClass = isUpcoming ? 'text-black' : spec.text

                const tooltipData = isUpcoming ? null : buildTooltipData(ep, s.season_number, epNum)

                return (
                  <td key={`s${s.season_number}-e${epNum}`} className="p-1">
                    <div
                      onMouseEnter={
                        tooltipEnabled ? (e) => tooltipData && handleMouseEnter(e, tooltipData) : undefined
                      }
                      onMouseLeave={tooltipEnabled ? handleMouseLeave : undefined}
                    >
                      <div
                        className={`
                          ${bgClass} ${textClass} ring-1 ${spec.ring}
                          rounded-[6px]
                          ${SZ.cell}
                          flex items-center justify-center
                          font-semibold
                          [font-variant-numeric:tabular-nums]
                          text-[15px] md:text-[16px] lg:text-[22px]
                          ${tooltipEnabled ? 'md:hover:brightness-[1.07]' : ''}
                          transition duration-150
                          cursor-default select-none
                        `}
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
                    const avg = seasonAverages.get(s.season_number) ?? null
                    const spec = toneFor(avg)
                    const val = format1(avg)

                    return (
                      <div className="flex flex-col items-center gap-[2px] min-w-[40px]">
                        <span className="text-sm md:text-base lg:text-lg font-semibold text-white [font-variant-numeric:tabular-nums]">
                          {val ?? '—'}
                        </span>
                        <span
                          className={`
                            mt-[2px] h-[3px] md:h-[4px] w-8 md:w-10 lg:w-12 rounded-full
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

  // =======================
  //  Render Wrapped
  // =======================
  const renderWrapped = () => (
    <div className="space-y-6 mt-2" style={{ contentVisibility: 'auto', containIntrinsicSize: '800px 520px' }}>
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
                  Avg <span className="font-semibold text-white">{format1(avg)}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {s.episodes.map((ep) => {
                const isUpcoming = ep.isUnaired
                const raw = isUpcoming ? null : ep.displayRating ?? null
                const spec = toneFor(raw)
                const bgClass = isUpcoming ? 'bg-zinc-400' : spec.bg
                const textClass = isUpcoming ? 'text-black' : spec.text
                const val = isUpcoming ? '?' : format1(raw)

                const tooltipData = isUpcoming
                  ? null
                  : buildTooltipData(ep, s.season_number, ep.episodeNumber)

                return (
                  <div
                    key={`wrap-s${s.season_number}-e${ep.episodeNumber}`}
                    className="flex flex-col items-center gap-1"
                    onMouseEnter={
                      tooltipEnabled ? (e) => tooltipData && handleMouseEnter(e, tooltipData) : undefined
                    }
                    onMouseLeave={tooltipEnabled ? handleMouseLeave : undefined}
                  >
                    <div
                      className={`
                        ${bgClass} ${textClass} ring-1 ${spec.ring}
                        rounded-[6px]
                        ${SZ.cell}
                        flex items-center justify-center
                        font-semibold
                        [font-variant-numeric:tabular-nums]
                        text-[15px] md:text-[16px] lg:text-[22px]
                        ${tooltipEnabled ? 'md:hover:brightness-[1.07]' : ''}
                        transition duration-150
                        cursor-default select-none
                      `}
                    >
                      {val ?? '—'}
                    </div>
                    <span className="text-[10px] text-zinc-400">E{ep.episodeNumber}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  // ✅ En móvil, si el grid es pesado, no lo montamos hasta que el usuario lo elija (y esté cerca en viewport)
  const shouldRenderHeavyGrid = layoutMode === 'grid' && (!isTouchLike || !isHeavyGrid) ? true : (layoutMode === 'grid' && inView)

  return (
    <>
      <div ref={inViewRef} className="space-y-3">
        {/* Controles */}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedToggle
            options={[
              { id: 'grid', label: 'Grid' },
              { id: 'wrapped', label: 'Wrapped' }
            ]}
            value={layoutMode}
            onChange={setLayoutModeSafe}
          />

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 opacity-80" />
              <span>Inverted</span>
            </div>
            <Switch
              checked={inverted}
              disabled={layoutMode === 'wrapped'}
              onChange={(v) => {
                if (layoutMode === 'grid') setInverted(v)
              }}
            />

            <div className="flex items-center gap-1.5 ml-3">
              <BarChart3 className="w-3.5 h-3.5 opacity-80" />
              <span>Season Avg.</span>
            </div>
            <Switch checked={showSeasonAvg} onChange={setShowSeasonAvg} />
          </div>
        </div>

        <LegendSeriesGraph />

        {/* Layout */}
        {layoutMode === 'grid' ? (
          shouldRenderHeavyGrid ? (
            inverted ? renderGridInverted() : renderGrid()
          ) : (
            // placeholder ultra-ligero para evitar “parón” al llegar a la sección
            <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
              Cargando vista Grid…
            </div>
          )
        ) : (
          renderWrapped()
        )}
      </div>

      <TooltipPortal activeData={hoveredEp} anchorRect={anchorRect} enabled={tooltipEnabled} />
    </>
  )
}

/* =======================
   Controles auxiliares
======================= */

function SegmentedToggle({ options, value, onChange }) {
  return (
    <div className="inline-flex items-center rounded-full bg-black/30 border border-white/10 p-0.5 backdrop-blur-sm shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
      {options.map((opt) => {
        const active = opt.id === value
        let Icon = null
        if (opt.id === 'grid') Icon = LayoutGrid
        if (opt.id === 'wrapped') Icon = WrapText

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`
              px-3 py-1.5 text-[11px] font-medium rounded-full
              inline-flex items-center gap-1.5 transition-colors
              ${active ? 'bg-white text-black shadow-sm' : 'text-zinc-200 hover:bg-white/5'}
            `}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        w-10 h-5 rounded-full flex items-center px-[3px]
        transition-colors border
        ${disabled
          ? 'opacity-40 cursor-not-allowed bg-black/40 border-white/10'
          : checked
            ? 'bg-emerald-500 border-emerald-400'
            : 'bg-black/40 border-white/15'}
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

function LegendSeriesGraph() {
  const items = [
    ['bg-teal-400', 'Absolute Cinema'],
    ['bg-emerald-700', 'Awesome'],
    ['bg-green-500', 'Great'],
    ['bg-yellow-300', 'Good'],
    ['bg-yellow-500', 'Average'],
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
