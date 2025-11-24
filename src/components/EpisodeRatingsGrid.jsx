// src/components/EpisodeRatingsGrid.jsx
'use client'

import { useMemo, useState } from 'react'

export default function EpisodeRatingsGrid({
  ratings,
  initialSource = 'imdb',
  density = 'compact',
  fillMissingWithTmdb = true
}) {
  const [source, setSource] = useState(initialSource)

  // --- tamaños
  const SIZES = {
    compact: {
      cell:
        'w-[42px] h-[28px] md:w-[50px] md:h-[32px] lg:w-[58px] lg:h-[36px]',
      headerPad: 'px-2 py-1.5',
      stickyCol: 'w-12 md:w-14 lg:w-16'
    },
    comfy: {
      cell:
        'w-[60px] h-[36px] md:w-[70px] md:h-[42px] lg:w-[80px] lg:h-[48px]',
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

  // Modo "toda la serie en una sola temporada" (estilo SeriesGraph)
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

    // 1) Normalizar temporadas + episodios
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

            return {
              episodeNumber,
              name: ep.name || '',
              tmdbRating:
                typeof ep.tmdbRating === 'number'
                  ? ep.tmdbRating
                  : typeof ep.tmdb === 'number'
                    ? ep.tmdb
                    : null,
              imdbRating:
                typeof ep.imdbRating === 'number'
                  ? ep.imdbRating
                  : typeof ep.imdb === 'number'
                    ? ep.imdb
                    : null,
              tmdbVotes:
                typeof ep.tmdbVotes === 'number' ? ep.tmdbVotes : null,
              imdbVotes:
                typeof ep.imdbVotes === 'number' ? ep.imdbVotes : null
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

    // 2) O bien mantenemos temporadas reales, o aplanamos en una sola
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
              // numeración global tipo E1, E2, E3, ...
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

  // ¿Estamos mostrando una sola temporada sintética?
  const singleSeasonView =
    shouldFlatten && seasonsSorted.length === 1 && totalSeasonsEstimate > 1

  // índice rápido: [season_number][episodeNumber] -> episodio
  const epIndexBySeason = useMemo(() => {
    const map = new Map()
    seasonsSorted.forEach((s) => {
      const inner = new Map()
      s.episodes.forEach((e) => inner.set(e.episodeNumber, e))
      map.set(s.season_number, inner)
    })
    return map
  }, [seasonsSorted])

  // --- helpers
  const format1 = (v) => {
    if (v == null) return null
    const num = Math.round(Number(v) * 10) / 10
    return Number.isInteger(num) ? num.toString() : num.toFixed(1)
  }

  const pickValue = (ep) => {
    if (!ep) return null
    if (source === 'tmdb') return ep.tmdbRating ?? null
    if (source === 'imdb') {
      if (ep.imdbRating != null) return ep.imdbRating
      return fillMissingWithTmdb ? ep.tmdbRating ?? null : null
    }
    // media (avg)
    const vals = [ep.tmdbRating, ep.imdbRating].filter(
      (v) => typeof v === 'number'
    )
    if (!vals.length) return null
    return Number(
      (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
    )
  }

  // Colores con contraste
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

  const sourceLabel =
    source === 'tmdb' ? 'TMDb' : source === 'imdb' ? 'IMDb' : 'Media'

  return (
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
                  {/* En modo "aplanado" mostramos solo S1 */}
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

                    const titleText = ep?.name || `Episodio ${epNum}`
                    const imdbVotesStr =
                      ep?.imdbVotes != null
                        ? ep.imdbVotes.toLocaleString()
                        : '—'

                    const placeAbove = epNum > 2

                    return (
                      <td key={`s${s.season_number}-e${epNum}`} className="p-1">
                        <div className="relative group">
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
                              hover:brightness-[1.06] hover:scale-[1.02]
                              transition will-change-transform
                              outline-none focus:ring-2 focus:ring-white/30
                              select-none
                            `}
                            style={{ transform: 'scaleX(1.03)' }}
                            role="button"
                            tabIndex={0}
                          >
                            {val ?? '—'}
                          </div>

                          {/* Tooltip visual */}
                          {ep && raw != null && (
                            <div
                              className={[
                                'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50',
                                placeAbove
                                  ? '-top-2 -translate-y-full'
                                  : 'top-full mt-2',
                                'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150',
                                'px-3 py-2 rounded-md text-[12px] leading-tight bg-black/90 text-white shadow-lg',
                                'whitespace-pre text-center max-w-[260px]'
                              ].join(' ')}
                            >
                              <strong className="block">
                                {titleText}
                              </strong>
                              <span className="block opacity-90">
                                {singleSeasonView
                                  ? `Episode ${epNum}`
                                  : `Season ${s.season_number}, Episode ${epNum}`}
                              </span>
                              <span className="block opacity-90">
                                {sourceLabel}: {format1(raw)}
                              </span>
                              <span className="block opacity-80">
                                Votes: {imdbVotesStr}
                              </span>

                              {placeAbove ? (
                                <span className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-black/90" />
                              ) : (
                                <span className="absolute left-1/2 -top-2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-black/90" />
                              )}
                            </div>
                          )}
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
  )
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-xs
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
