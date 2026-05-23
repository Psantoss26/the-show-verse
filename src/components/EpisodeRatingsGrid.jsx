"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LayoutGrid, WrapText, ArrowUpDown, BarChart3, Info } from "lucide-react";

/* =======================
   Hooks (perf / mobile)
======================= */
function useIsTouchLike() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqHoverNone = window.matchMedia?.("(hover: none)");
    const mqCoarse = window.matchMedia?.("(pointer: coarse)");

    const compute = () => {
      const touch =
        "ontouchstart" in window ||
        (navigator?.maxTouchPoints || 0) > 0 ||
        !!mqHoverNone?.matches ||
        !!mqCoarse?.matches;
      setIsTouch(touch);
    };

    compute();

    const onChange = () => compute();
    mqHoverNone?.addEventListener?.("change", onChange);
    mqCoarse?.addEventListener?.("change", onChange);

    return () => {
      mqHoverNone?.removeEventListener?.("change", onChange);
      mqCoarse?.removeEventListener?.("change", onChange);
    };
  }, []);

  return isTouch;
}

function useInViewOnce(rootMargin = "300px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

// --- Tooltip flotante en portal ---
function TooltipPortal({ activeData, anchorRect, enabled }) {
  const tooltipRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, placement: "top" });

  useEffect(() => {
    if (!enabled) return;
    if (!anchorRect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const { width: tW, height: tH } = tooltip.getBoundingClientRect();
    const { top: rTop, left: rLeft, width: rW, height: rH } = anchorRect;

    const GAP = 8;
    const VIEWPORT_PADDING = 10;

    let left = rLeft + rW / 2 - tW / 2;
    let top = rTop - tH - GAP;

    if (left < VIEWPORT_PADDING) left = VIEWPORT_PADDING;
    else if (left + tW > window.innerWidth - VIEWPORT_PADDING) {
      left = window.innerWidth - tW - VIEWPORT_PADDING;
    }

    if (top < VIEWPORT_PADDING) {
      top = rTop + rH + GAP;
    }

    setCoords({ top, left });
  }, [anchorRect, enabled]);

  if (!enabled) return null;
  if (!activeData) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="fixed z-[9999] pointer-events-none transition-opacity duration-150 ease-out"
      style={{
        top: coords.top,
        left: coords.left,
        opacity: anchorRect ? 1 : 0,
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
          {activeData.seriesGraphVal != null && (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <img
                  src="/logoseriesgraph.png"
                  alt="SeriesGraph"
                  className="h-3 w-auto"
                />
                <span className="text-[10px] uppercase tracking-wide text-yellow-300 font-bold">
                  SeriesGraph
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[14px] font-bold">
                  {activeData.format1(activeData.seriesGraphVal)}
                </span>
                {activeData.seriesGraphVotesStr && (
                  <span className="text-[10px] text-zinc-400">
                    {activeData.seriesGraphVotesStr} votos
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function EpisodeRatingsGrid({
  ratings,
  showId, // TMDb show id para poder navegar
  initialSource = "seriesgraph", // compat
  density = "compact",
  fillMissingWithTmdb = false,
  fallbackSource = "tmdb",
}) {
  const router = useRouter();
  const isTouchLike = useIsTouchLike();
  const { ref: inViewRef, inView } = useInViewOnce("450px");

  // Controles estilo SeriesGraph
  const [layoutMode, setLayoutMode] = useState("grid"); // 'grid' | 'wrapped'
  const userPickedLayoutRef = useRef(false);

  const [inverted, setInverted] = useState(false);
  const [showSeasonAvg, setShowSeasonAvg] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  // Tooltip (DESACTIVADO EN MÓVIL/TOUCH)
  const tooltipEnabled = !isTouchLike;
  const [hoveredEp, setHoveredEp] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);

  const handleMouseEnter = useCallback(
    (e, epData) => {
      if (!tooltipEnabled || !epData) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setAnchorRect(rect);
      setHoveredEp(epData);
    },
    [tooltipEnabled],
  );

  const handleMouseLeave = useCallback(() => {
    if (!tooltipEnabled) return;
    setHoveredEp(null);
    setAnchorRect(null);
  }, [tooltipEnabled]);

  // tamaños
  const SIZES = {
    compact: {
      cell: "w-[54px] h-[36px] sm:w-[60px] sm:h-[40px] lg:w-[66px] lg:h-[43px]",
      headerPad: "px-0 py-1.5 sm:px-1",
      stickyCol: "w-5 sm:w-8 lg:w-9",
    },
    comfy: {
      cell: "w-[64px] h-[42px] sm:w-[70px] sm:h-[46px] lg:w-[78px] lg:h-[50px]",
      headerPad: "px-0 py-2 sm:px-1.5",
      stickyCol: "w-6 sm:w-9 lg:w-10",
    },
  };
  const SZ = SIZES[density] ?? SIZES.compact;

  const meta = ratings?.meta || {};
  const totalSeasonsEstimate =
    meta.totalSeasons ??
    (Array.isArray(ratings?.seasons) ? ratings.seasons.length : 0);

  // helpers numéricos
  const toRatingNumber = (value) => {
    if (value == null) return null;
    if (typeof value === "number") {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    if (typeof value === "string") {
      const cleaned = value.replace(",", ".").trim();
      const num = Number(cleaned);
      return Number.isFinite(num) && num > 0 ? num : null;
    }
    return null;
  };

  const toNumberSafe = (value) => {
    if (value == null) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const cleaned = value.replace(/,/g, "").trim();
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const shouldFlatten = meta.forceSingleSeason === true;

  // === Normalizar datos ===
  const { seasonsSorted, maxEpisodes, seasonAverages } = useMemo(() => {
    const rawSeasons = Array.isArray(ratings?.seasons)
      ? ratings.seasons
      : Array.isArray(ratings)
        ? ratings
        : [];

    const normalized = rawSeasons
      .map((s) => {
        const seasonNumber =
          typeof s.season_number === "number"
            ? s.season_number
            : typeof s.seasonNumber === "number"
              ? s.seasonNumber
              : null;
        if (seasonNumber == null) return null;

        const episodesArr = Array.isArray(s.episodes) ? s.episodes : [];

        const episodes = episodesArr
          .map((ep) => {
            const episodeNumber =
              typeof ep.episode_number === "number"
                ? ep.episode_number
                : typeof ep.episodeNumber === "number"
                  ? ep.episodeNumber
                  : null;
            if (episodeNumber == null) return null;

            const airDateStr = ep.air_date || ep.airDate || null;
            let isUnaired = false;
            if (airDateStr) {
              const d = new Date(airDateStr);
              if (!Number.isNaN(d.getTime()) && d > new Date())
                isUnaired = true;
            }

            const seriesGraphRating = toRatingNumber(
              ep.seriesGraphRating ??
                ep.seriesgraphRating ??
                ep.series_graph_rating ??
                ep.seriesGraph ??
                ep.seriesgraph ??
                (ep.source === "seriesgraph" ? ep.vote_average : null),
            );
            let tmdbRating = toRatingNumber(
              ep.tmdbRating ?? ep.tmdb ?? ep.vote_average,
            );
            let imdbRating = toRatingNumber(ep.imdbRating ?? ep.imdb);

            let displayRating = seriesGraphRating;
            if (displayRating == null && initialSource === "imdb")
              displayRating = imdbRating;
            if (displayRating == null && fallbackSource === "tmdb")
              displayRating = tmdbRating;
            if (displayRating == null && fillMissingWithTmdb)
              displayRating = tmdbRating;

            if (isUnaired) {
              tmdbRating = null;
              imdbRating = null;
              displayRating = null;
            }

            const seriesGraphVotes = toNumberSafe(
              ep.seriesGraphVotes ??
                ep.seriesgraphVotes ??
                ep.series_graph_votes ??
                ep.num_votes ??
                ep.votes ??
                (ep.source === "seriesgraph" ? ep.vote_count : null),
            );
            const tmdbVotes = toNumberSafe(
              ep.tmdbVotes ?? ep.tmdb_votes ?? ep.vote_count,
            );
            const imdbVotes = toNumberSafe(
              ep.imdbVotes ??
                ep.imdb_votes ??
                ep.imdbVotesCount ??
                ep.imdb_votes_count,
            );

            return {
              episodeNumber,
              name: ep.name || "",
              seriesGraphRating,
              tmdbRating,
              imdbRating,
              displayRating,
              seriesGraphVotes,
              tmdbVotes,
              imdbVotes,
              airDate: airDateStr,
              isUnaired,
              source:
                ep.source ||
                (seriesGraphRating != null
                  ? "seriesgraph"
                  : null) ||
                (imdbRating != null
                  ? "imdb"
                  : tmdbRating != null
                    ? "tmdb"
                    : null),
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.episodeNumber - b.episodeNumber);

        return { season_number: seasonNumber, episodes };
      })
      .filter(Boolean);

    let seasons = normalized.filter((s) => s.episodes.length > 0);

    if (shouldFlatten && seasons.length > 1) {
      const allEpisodes = [];
      let counter = 1;

      seasons
        .slice()
        .sort((a, b) => a.season_number - b.season_number)
        .forEach((s) => {
          s.episodes.forEach((ep) => {
            if (ep.displayRating == null) return;
            // Guardamos el season/episode real para la navegación
            allEpisodes.push({
              ...ep,
              episodeNumber: counter++, // número “aplanado” (solo visual)
              _origSeasonNumber: s.season_number,
              _origEpisodeNumber: ep.episodeNumber,
            });
          });
        });

      const combined = {
        season_number: 1,
        episodes: allEpisodes,
        hasAnyRating: allEpisodes.length > 0,
      };

      seasons = combined.hasAnyRating ? [combined] : [];
    } else {
      seasons = seasons
        .map((s) => {
          const hasAnyRating = s.episodes.some(
            (ep) => typeof ep.displayRating === "number",
          );
          return { ...s, hasAnyRating };
        })
        .filter((s) => s.episodes.length > 0 && s.hasAnyRating)
        .sort((a, b) => a.season_number - b.season_number);
    }

    const maxEp = seasons.reduce((m, s) => {
      const localMax = s.episodes.reduce(
        (mm, e) =>
          typeof e.episodeNumber === "number" && e.episodeNumber > mm
            ? e.episodeNumber
            : mm,
        0,
      );
      return Math.max(m, localMax);
    }, 0);

    const seasonAveragesMap = new Map();
    seasons.forEach((s) => {
      const vals = s.episodes
        .map((e) => e.displayRating)
        .filter((v) => typeof v === "number");
      if (!vals.length) {
        seasonAveragesMap.set(s.season_number, null);
        return;
      }
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      seasonAveragesMap.set(s.season_number, avg);
    });

    return {
      seasonsSorted: seasons,
      maxEpisodes: maxEp,
      seasonAverages: seasonAveragesMap,
    };
  }, [
    ratings,
    shouldFlatten,
    fillMissingWithTmdb,
    fallbackSource,
    initialSource,
  ]);

  const singleSeasonView =
    shouldFlatten && seasonsSorted.length === 1 && totalSeasonsEstimate > 1;

  const epIndexBySeason = useMemo(() => {
    const map = new Map();
    seasonsSorted.forEach((s) => {
      const inner = new Map();
      s.episodes.forEach((e) => inner.set(e.episodeNumber, e));
      map.set(s.season_number, inner);
    });
    return map;
  }, [seasonsSorted]);

  const episodeNumbers = useMemo(() => {
    return Array.from({ length: maxEpisodes }, (_, i) => i + 1);
  }, [maxEpisodes]);

  const format1 = (v) => {
    if (v == null) return null;
    const num = Math.round(Number(v) * 10) / 10;
    return Number.isInteger(num) ? num.toString() : num.toFixed(1);
  };

  const toneFor = (v) => {
    if (v == null)
      return {
        bg: "bg-[#2f3035]",
        text: "text-zinc-400",
        ring: "ring-transparent",
        bar: "bg-zinc-700",
      };
    if (v >= 9.7)
      return {
        bg: "bg-[#26a8ea]",
        text: "text-white",
        ring: "ring-transparent",
        bar: "bg-[#26a8ea]",
      };
    if (v >= 9.0)
      return {
        bg: "bg-[#0b6f3d]",
        text: "text-white",
        ring: "ring-transparent",
        bar: "bg-[#0b6f3d]",
      };
    if (v >= 8.0)
      return {
        bg: "bg-[#24b260]",
        text: "text-[#10231b]",
        ring: "ring-transparent",
        bar: "bg-[#24b260]",
      };
    if (v >= 7.0)
      return {
        bg: "bg-[#f2d43b]",
        text: "text-[#1d1d1f]",
        ring: "ring-transparent",
        bar: "bg-[#f2d43b]",
      };
    if (v >= 6.0)
      return {
        bg: "bg-[#f39b16]",
        text: "text-[#1d1d1f]",
        ring: "ring-transparent",
        bar: "bg-[#f39b16]",
      };
    if (v >= 5.0)
      return {
        bg: "bg-[#f04444]",
        text: "text-white",
        ring: "ring-transparent",
        bar: "bg-[#f04444]",
      };
    return {
      bg: "bg-[#8b22d6]",
      text: "text-white",
      ring: "ring-transparent",
      bar: "bg-[#8b22d6]",
    };
  };

  const buildTooltipData = (ep, seasonNumber, episodeNumber) => {
    if (!tooltipEnabled) return null;
    if (!ep || ep.isUnaired) return null;

    const hasData =
      ep.seriesGraphRating != null ||
      ep.displayRating != null;
    if (!hasData) return null;

    const titleText = ep.name || `Episodio ${episodeNumber}`;
    const seriesGraphVal = ep.seriesGraphRating ?? ep.displayRating;
    const seriesGraphVotesStr = ep.seriesGraphVotes
      ? ep.seriesGraphVotes.toLocaleString()
      : null;

    const seasonInfo = singleSeasonView
      ? `Episode ${episodeNumber}`
      : `Season ${seasonNumber}, Episode ${episodeNumber}`;

    return {
      titleText,
      seasonInfo,
      seriesGraphVal,
      seriesGraphVotesStr,
      format1,
    };
  };

  // navegación a detalles
  const goToEpisode = useCallback(
    (ep, seasonNumber, episodeNumber) => {
      if (!showId) return;
      if (!ep || ep.isUnaired) return;

      const s = ep?._origSeasonNumber ?? seasonNumber;
      const e = ep?._origEpisodeNumber ?? episodeNumber;
      if (s == null || e == null) return;

      router.push(`/details/tv/${showId}/season/${s}/episode/${e}`);
    },
    [router, showId],
  );

  const gridSize = seasonsSorted.length * maxEpisodes;
  const isHeavyGrid = gridSize >= 420;

  useEffect(() => {
    if (!isTouchLike) return;
    if (userPickedLayoutRef.current) return;
    if (layoutMode !== "grid") return;
    if (isHeavyGrid) setLayoutMode("wrapped");
  }, [isTouchLike, layoutMode, isHeavyGrid]);

  const setLayoutModeSafe = (mode) => {
    userPickedLayoutRef.current = true;
    setLayoutMode(mode);
    if (mode === "wrapped") {
      setHoveredEp(null);
      setAnchorRect(null);
    }
  };

  if (!seasonsSorted.length || maxEpisodes === 0) return null;

  const cellProps = (ep, seasonNumber, episodeNumber) => {
    const clickable = !!(ep && !ep.isUnaired && showId);
    return {
      role: clickable ? "link" : undefined,
      tabIndex: clickable ? 0 : -1,
      onClick: clickable
        ? () => goToEpisode(ep, seasonNumber, episodeNumber)
        : undefined,
      onKeyDown: clickable
        ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              goToEpisode(ep, seasonNumber, episodeNumber);
            }
          }
        : undefined,
      title: clickable ? "Ver detalles del episodio" : undefined,
      clickable,
    };
  };

  // =======================
  // Render GRID normal
  // =======================
  const renderGrid = () => (
    <div
      className="-ml-3 pr-3 overflow-x-auto overflow-y-visible mt-3 [-webkit-overflow-scrolling:touch] overscroll-x-contain sm:ml-0 sm:pr-0"
      style={{ contentVisibility: "auto", containIntrinsicSize: "900px 520px" }}
    >
      <table className="border-separate border-spacing-x-[5px] border-spacing-y-[8px] [table-layout:fixed] [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
        <thead>
          <tr>
            <th
              className={`
                sticky left-0 z-10
                bg-transparent
                ${SZ.headerPad}
                text-left text-[12px] text-zinc-400 font-medium
                ${SZ.stickyCol}
              `}
            />
            {seasonsSorted.map((s) => (
              <th
                key={s.season_number}
                className={`
                  ${SZ.headerPad}
                  text-center text-[14px] lg:text-[15px] text-zinc-100 font-medium
                  bg-transparent
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
                  bg-transparent
                  ${SZ.headerPad}
                  text-right text-[13px] lg:text-[14px] text-zinc-100 font-medium
                  ${SZ.stickyCol}
                `}
              >
                E{epNum}
              </td>

              {seasonsSorted.map((s) => {
                const ep = epIndexBySeason.get(s.season_number)?.get(epNum);
                const isUpcoming = ep?.isUnaired;
                const raw = isUpcoming ? null : (ep?.displayRating ?? null);
                const val = isUpcoming ? "?" : format1(raw);
                const spec = toneFor(raw);

                const bgClass = isUpcoming ? "bg-zinc-400" : spec.bg;
                const textClass = isUpcoming ? "text-black" : spec.text;
                const isBlank = !ep;

                const tooltipData = isUpcoming
                  ? null
                  : buildTooltipData(ep, s.season_number, epNum);
                const { role, tabIndex, onClick, onKeyDown, title, clickable } =
                  cellProps(ep, s.season_number, epNum);

                return (
                  <td
                    key={`s${s.season_number}-e${epNum}`}
                    className="p-0 align-middle"
                  >
                    {isBlank ? (
                      <div className={SZ.cell} aria-hidden="true" />
                    ) : (
                    <div
                      onMouseEnter={
                        tooltipEnabled
                          ? (e) =>
                              tooltipData && handleMouseEnter(e, tooltipData)
                          : undefined
                      }
                      onMouseLeave={
                        tooltipEnabled ? handleMouseLeave : undefined
                      }
                    >
                      <div
                        role={role}
                        tabIndex={tabIndex}
                        onClick={onClick}
                        onKeyDown={onKeyDown}
                        title={title}
                        className={`
                          ${bgClass} ${textClass}
                          ${SZ.cell}
                          rounded-[5px]
                          flex items-center justify-center
                          text-[21px] sm:text-[23px] lg:text-[27px]
                          font-extrabold leading-none
                          [font-variant-numeric:tabular-nums]
                          select-none
                          ${clickable ? "cursor-pointer hover:brightness-[1.08]" : "cursor-default"}
                          ${clickable ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30" : ""}
                          transition duration-150
                        `}
                      >
                        {val ?? "—"}
                      </div>
                    </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {showSeasonAvg && (
            <tr>
              <td
                className={`
                  sticky left-0 z-10
                  bg-transparent
                  ${SZ.headerPad}
                  text-right text-[13px] lg:text-[14px] text-zinc-300 font-semibold
                  ${SZ.stickyCol}
                `}
              >
                AVG.
              </td>

              {seasonsSorted.map((s) => {
                const avg = seasonAverages.get(s.season_number) ?? null;
                const spec = toneFor(avg);
                const val = format1(avg);

                return (
                  <td
                    key={`avg-s${s.season_number}`}
                    className="p-0 pt-1 text-center align-bottom"
                  >
                    <div className={`${SZ.cell} flex flex-col items-center justify-end gap-[5px]`}>
                      <span className="text-[24px] lg:text-[27px] font-extrabold leading-none text-white [font-variant-numeric:tabular-nums]">
                        {val ?? "—"}
                      </span>
                      <span
                        className={`
                          h-[4px] w-full rounded-t-sm
                          ${avg == null ? "bg-zinc-700" : spec.bar}
                        `}
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // =======================
  // Render GRID invertido
  // =======================
  const renderGridInverted = () => (
    <div
      className="-ml-3 pr-3 overflow-x-auto overflow-y-visible mt-3 [-webkit-overflow-scrolling:touch] overscroll-x-contain sm:ml-0 sm:pr-0"
      style={{ contentVisibility: "auto", containIntrinsicSize: "900px 520px" }}
    >
      <table className="border-separate border-spacing-x-[5px] border-spacing-y-[8px] [table-layout:fixed] [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
        <thead>
          <tr>
            <th
              className={`
                sticky left-0 z-10
                bg-transparent
                ${SZ.headerPad}
                text-left text-[12px] text-zinc-400 font-medium
                ${SZ.stickyCol}
              `}
            />
            {episodeNumbers.map((epNum) => (
              <th
                key={`eh-${epNum}`}
                className={`
                  ${SZ.headerPad}
                  text-center text-[14px] lg:text-[15px] text-zinc-100 font-medium
                  bg-transparent
                `}
              >
                E{epNum}
              </th>
            ))}
            {showSeasonAvg && (
              <th
                className={`
                  ${SZ.headerPad}
                  text-center text-[14px] lg:text-[15px] text-zinc-100 font-medium
                  bg-transparent
                `}
              >
                AVG.
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
                  bg-transparent
                  ${SZ.headerPad}
                  text-right text-[13px] lg:text-[14px] text-zinc-100 font-medium
                  ${SZ.stickyCol}
                `}
              >
                S{s.season_number}
              </td>

              {episodeNumbers.map((epNum) => {
                const ep = epIndexBySeason.get(s.season_number)?.get(epNum);

                const isUpcoming = ep?.isUnaired;
                const raw = isUpcoming ? null : (ep?.displayRating ?? null);
                const val = isUpcoming ? "?" : format1(raw);
                const spec = toneFor(raw);
                const bgClass = isUpcoming ? "bg-zinc-400" : spec.bg;
                const textClass = isUpcoming ? "text-black" : spec.text;
                const isBlank = !ep;

                const tooltipData = isUpcoming
                  ? null
                  : buildTooltipData(ep, s.season_number, epNum);
                const { role, tabIndex, onClick, onKeyDown, title, clickable } =
                  cellProps(ep, s.season_number, epNum);

                return (
                  <td
                    key={`s${s.season_number}-e${epNum}`}
                    className="p-0 align-middle"
                  >
                    {isBlank ? (
                      <div className={SZ.cell} aria-hidden="true" />
                    ) : (
                    <div
                      onMouseEnter={
                        tooltipEnabled
                          ? (e) =>
                              tooltipData && handleMouseEnter(e, tooltipData)
                          : undefined
                      }
                      onMouseLeave={
                        tooltipEnabled ? handleMouseLeave : undefined
                      }
                    >
                      <div
                        role={role}
                        tabIndex={tabIndex}
                        onClick={onClick}
                        onKeyDown={onKeyDown}
                        title={title}
                        className={`
                          ${bgClass} ${textClass}
                          rounded-[5px]
                          ${SZ.cell}
                          flex items-center justify-center
                          font-extrabold leading-none
                          [font-variant-numeric:tabular-nums]
                          text-[21px] sm:text-[23px] lg:text-[27px]
                          ${clickable ? "cursor-pointer hover:brightness-[1.08]" : "cursor-default"}
                          ${clickable ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30" : ""}
                          transition duration-150
                          select-none
                        `}
                      >
                        {val ?? "—"}
                      </div>
                    </div>
                    )}
                  </td>
                );
              })}

              {showSeasonAvg && (
                <td className="p-0 pt-1 text-center align-bottom">
                  {(() => {
                    const avg = seasonAverages.get(s.season_number) ?? null;
                    const spec = toneFor(avg);
                    const val = format1(avg);

                    return (
                      <div className={`${SZ.cell} flex flex-col items-center justify-end gap-[5px]`}>
                        <span className="text-[24px] lg:text-[27px] font-extrabold leading-none text-white [font-variant-numeric:tabular-nums]">
                          {val ?? "—"}
                        </span>
                        <span
                          className={`
                            h-[4px] w-full rounded-t-sm
                            ${avg == null ? "bg-zinc-700" : spec.bar}
                          `}
                        />
                      </div>
                    );
                  })()}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // =======================
  // Render Wrapped
  // =======================
  const renderWrapped = () => (
    <div
      className="space-y-6 mt-2"
      style={{ contentVisibility: "auto", containIntrinsicSize: "800px 520px" }}
    >
      {seasonsSorted.map((s) => {
        const avg = seasonAverages.get(s.season_number) ?? null;
        return (
          <div key={`wrap-s${s.season_number}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-zinc-100">
                Season {s.season_number}
              </span>
              {showSeasonAvg && avg != null && (
                <span className="text-xs text-zinc-400">
                  Avg{" "}
                  <span className="font-semibold text-white">
                    {format1(avg)}
                  </span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {s.episodes.map((ep) => {
                const isUpcoming = ep.isUnaired;
                const raw = isUpcoming ? null : (ep.displayRating ?? null);
                const spec = toneFor(raw);
                const bgClass = isUpcoming ? "bg-zinc-400" : spec.bg;
                const textClass = isUpcoming ? "text-black" : spec.text;
                const val = isUpcoming ? "?" : format1(raw);

                const tooltipData = isUpcoming
                  ? null
                  : buildTooltipData(ep, s.season_number, ep.episodeNumber);

                const { role, tabIndex, onClick, onKeyDown, title, clickable } =
                  cellProps(ep, s.season_number, ep.episodeNumber);

                return (
                  <div
                    key={`wrap-s${s.season_number}-e${ep.episodeNumber}`}
                    className="flex flex-col items-center gap-1"
                    onMouseEnter={
                      tooltipEnabled
                        ? (e) => tooltipData && handleMouseEnter(e, tooltipData)
                        : undefined
                    }
                    onMouseLeave={tooltipEnabled ? handleMouseLeave : undefined}
                  >
                    <div
                      role={role}
                      tabIndex={tabIndex}
                      onClick={onClick}
                      onKeyDown={onKeyDown}
                      title={title}
                      className={`
                        ${bgClass} ${textClass}
                        rounded-[5px]
                        ${SZ.cell}
                        flex items-center justify-center
                        font-extrabold leading-none
                        [font-variant-numeric:tabular-nums]
                        text-[21px] sm:text-[23px] lg:text-[27px]
                        ${clickable ? "cursor-pointer hover:brightness-[1.08]" : "cursor-default"}
                        ${clickable ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30" : ""}
                        transition duration-150
                        select-none
                      `}
                    >
                      {val ?? "—"}
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      E{ep.episodeNumber}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // En móvil, si el grid es pesado, no lo montamos hasta que el usuario lo elija (y esté cerca en viewport)
  const shouldRenderHeavyGrid =
    layoutMode === "grid" && (!isTouchLike || !isHeavyGrid)
      ? true
      : layoutMode === "grid" && inView;

  return (
    <>
      <div ref={inViewRef} className="space-y-3">
        {/* Controles */}
        <div className="flex flex-wrap items-center gap-2.5">
          <ViewModeControl value={layoutMode} onChange={setLayoutModeSafe} />

          <IconToggle
            icon={ArrowUpDown}
            label="Invertida"
            checked={inverted}
            disabled={layoutMode === "wrapped"}
            onChange={(v) => {
              if (layoutMode === "grid") setInverted(v);
            }}
          />

          <IconToggle
            icon={BarChart3}
            label="Media"
            checked={showSeasonAvg}
            onChange={setShowSeasonAvg}
          />

          <LegendPopover open={legendOpen} setOpen={setLegendOpen} />
        </div>

        {/* Layout */}
        {layoutMode === "grid" ? (
          shouldRenderHeavyGrid ? (
            inverted ? (
              renderGridInverted()
            ) : (
              renderGrid()
            )
          ) : (
            <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
              Cargando vista Grid…
            </div>
          )
        ) : (
          renderWrapped()
        )}
      </div>

      <TooltipPortal
        activeData={hoveredEp}
        anchorRect={anchorRect}
        enabled={tooltipEnabled}
      />
    </>
  );
}

/* =======================
   Controles auxiliares
======================= */

const LEGEND_ITEMS = [
  ["bg-[#26a8ea]", "Absolute Cinema"],
  ["bg-[#0b6f3d]", "Awesome"],
  ["bg-[#24b260]", "Great"],
  ["bg-[#f2d43b]", "Good"],
  ["bg-[#f39b16]", "Average"],
  ["bg-[#f04444]", "Bad"],
  ["bg-[#8b22d6]", "Garbage"],
  ["bg-[#2f3035]", "Sin nota"],
];

function ViewModeControl({ value, onChange }) {
  const options = [
    { id: "grid", label: "Grid", icon: LayoutGrid },
    { id: "wrapped", label: "Wrapped", icon: WrapText },
  ];

  return (
    <div className="inline-flex h-9 items-center rounded-full border border-white/10 bg-black/35 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md">
      {options.map((opt) => {
        const active = opt.id === value;
        const Icon = opt.icon;

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            className={`
              h-7 rounded-full px-2.5 text-[11px] font-semibold
              inline-flex items-center gap-1.5 transition-all duration-150
              ${active ? "bg-white text-black shadow-sm" : "text-zinc-300 hover:bg-white/10 hover:text-white"}
            `}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function IconToggle({ icon: Icon, label, checked, onChange, disabled }) {
  return (
    <div
      className={`
        inline-flex h-9 items-center gap-2 rounded-full border border-white/10
        bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-300
        shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md
        ${disabled ? "opacity-45" : ""}
      `}
    >
      <Icon className="h-3.5 w-3.5 text-zinc-300" />
      <span className="hidden sm:inline">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative h-5 w-9 rounded-full border transition-colors duration-150
          ${
            disabled
              ? "cursor-not-allowed border-white/10 bg-black/40"
              : checked
                ? "border-emerald-400 bg-emerald-500"
                : "border-white/15 bg-black/50"
          }
        `}
        aria-label={label}
        aria-pressed={checked}
      >
        <span
          className={`
            absolute left-[3px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow
            transition-transform duration-150
            ${checked ? "translate-x-4" : "translate-x-0"}
          `}
        />
      </button>
    </div>
  );
}

function LegendPopover({ open, setOpen }) {
  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  return (
    <div
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Ver leyenda de colores"
        className={`
          inline-flex h-9 w-9 items-center justify-center rounded-full
          border border-white/10 bg-black/35 text-zinc-200
          shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md
          transition-colors hover:bg-white/10 hover:text-white
        `}
      >
        <Info className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(78vw,260px)] rounded-xl border border-white/10 bg-[#111214]/95 p-3 shadow-2xl backdrop-blur-xl sm:w-[300px]">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
            Leyenda
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LEGEND_ITEMS.map(([c, l]) => (
              <span
                key={l}
                className="inline-flex items-center gap-2 text-[12px] font-medium text-zinc-100"
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full ${c}`} />
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
