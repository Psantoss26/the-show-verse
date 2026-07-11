"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { translateGenre } from "@/lib/details/formatters";

function getStatusLabel(status) {
  return status === "Released"
    ? "Estrenada"
    : status === "Ended"
      ? "Finalizada"
      : status === "Returning Series"
        ? "En emisión"
        : status === "Canceled"
          ? "Cancelada"
          : status === "In Production"
            ? "En producción"
            : status === "Post Production"
              ? "Postproducción"
              : status === "Planned"
                ? "Planificada"
                : status === "Rumored"
                  ? "Rumoreada"
                  : status === "Pilot"
                    ? "Piloto"
                    : status;
}

function getStatusBadgeClass(status) {
  return status === "Ended" || status === "Canceled"
    ? "bg-red-500/[0.06] text-red-300"
    : "bg-emerald-500/[0.06] text-emerald-300";
}

const metaDotClass = "w-1 h-1 rounded-full bg-white/30 shrink-0";
const genreChipClass =
  "relative isolate inline-flex shrink-0 items-center px-2 py-0.5 rounded-md overflow-hidden bg-black/[0.04] bg-gradient-to-br from-white/10 via-transparent to-black/10 text-[10px] font-bold uppercase tracking-widest text-zinc-300 backdrop-blur-[6px] shadow-none";

export default function DetailsMetaGenresRow({
  yearIso,
  displayRuntimeValue,
  status,
  genres = [],
  genresBelowMetaOnMobile = false,
}) {
  const rowRef = useRef(null);
  const metaProbeRef = useRef(null);
  const genreProbeRef = useRef(null);
  const genreDotProbeRef = useRef(null);
  const genreChipProbeRefs = useRef([]);
  const [visibleGenreCount, setVisibleGenreCount] = useState(() =>
    Math.min(Array.isArray(genres) ? genres.length : 0, 3),
  );

  const visibleGenres = useMemo(
    () =>
      (Array.isArray(genres) ? genres : [])
        .filter(Boolean)
        .slice(0, 3)
        .map((genre) => ({
          id: genre.id ?? genre.name,
          label: translateGenre(genre.name),
        })),
    [genres],
  );

  const hasMeta = Boolean(yearIso || displayRuntimeValue || status);
  const statusLabel = status ? getStatusLabel(status) : null;
  const statusBadgeClass = status ? getStatusBadgeClass(status) : "";

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;

    const readGap = (element) => {
      if (!element || typeof window === "undefined") return 0;
      const styles = window.getComputedStyle(element);
      return Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    };

    const updateVisibleGenres = () => {
      const maxCount = visibleGenres.length;
      if (!maxCount) {
        setVisibleGenreCount(0);
        return;
      }

      const rowWidth = row.clientWidth;
      const metaWidth = metaProbeRef.current?.scrollWidth || 0;
      const rowGap = readGap(row);
      const chipGap = readGap(genreProbeRef.current);
      const dotWidth = genreDotProbeRef.current?.offsetWidth || 0;
      const chipWidths = genreChipProbeRefs.current
        .slice(0, maxCount)
        .map((node) => node?.offsetWidth || 0);

      let nextCount = 0;
      for (let count = maxCount; count >= 1; count -= 1) {
        const chipsWidth = chipWidths
          .slice(0, count)
          .reduce((sum, width) => sum + width, 0);
        const genresWidth =
          dotWidth + chipGap + chipsWidth + chipGap * (count - 1);
        const requiredWidth = metaWidth + rowGap + genresWidth;

        if (requiredWidth <= rowWidth + 1) {
          nextCount = count;
          break;
        }
      }

      setVisibleGenreCount(nextCount);
    };

    updateVisibleGenres();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateVisibleGenres)
        : null;
    resizeObserver?.observe(row);
    window.addEventListener("resize", updateVisibleGenres);
    document.fonts?.ready?.then(updateVisibleGenres).catch(() => {});

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateVisibleGenres);
    };
  }, [displayRuntimeValue, hasMeta, status, statusLabel, visibleGenres, yearIso]);

  if (!hasMeta && visibleGenres.length === 0) return null;

  const clampedGenreCount = Math.min(visibleGenreCount, visibleGenres.length);
  const desktopGenreRow = clampedGenreCount > 0 && (
    <div
      className={
        genresBelowMetaOnMobile
          ? "hidden min-w-0 shrink flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap sm:flex"
          : "flex min-w-0 shrink flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap"
      }
    >
      {hasMeta && <span className={metaDotClass} />}
      {visibleGenres.slice(0, clampedGenreCount).map((genre) => (
        <span key={genre.id} className={genreChipClass}>
          <span
            className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02] pointer-events-none overflow-hidden"
            style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
          />
          <span className="relative z-10">{genre.label}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      ref={rowRef}
      className={`relative flex w-full min-w-0 max-w-full items-center justify-center overflow-hidden text-base font-medium text-zinc-300 md:justify-start md:text-lg [container-type:inline-size] ${
        genresBelowMetaOnMobile
          ? "flex-col gap-2 sm:flex-row sm:flex-nowrap sm:gap-2.5"
          : "flex-nowrap gap-2.5"
      }`}
    >
      <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-2.5 whitespace-nowrap">
        {yearIso && (
          <span className="shrink-0 text-white font-bold tracking-wide">
            {yearIso}
          </span>
        )}

        {yearIso && displayRuntimeValue && <span className={metaDotClass} />}

        {displayRuntimeValue && (
          <span className="shrink-0">{displayRuntimeValue}</span>
        )}

        {(yearIso || displayRuntimeValue) && status && (
          <span className={metaDotClass} />
        )}

        {status && (
          <span
            className={`relative isolate inline-flex shrink-0 items-center px-2 py-0.5 rounded-md overflow-hidden bg-gradient-to-br from-white/10 via-transparent to-black/10 text-[10px] font-black uppercase tracking-widest backdrop-blur-[6px] shadow-none ${statusBadgeClass}`}
          >
            <span
              className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02] pointer-events-none overflow-hidden"
              style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
            />
            <span className="relative z-10">{statusLabel}</span>
          </span>
        )}
      </div>

      {genresBelowMetaOnMobile && visibleGenres.length > 0 && (
        <div className="flex max-w-full flex-wrap items-center justify-center gap-2 overflow-hidden sm:hidden">
          {visibleGenres.map((genre) => (
            <span key={genre.id} className={genreChipClass}>
              <span
                className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02] pointer-events-none overflow-hidden"
                style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
              />
              <span className="relative z-10">{genre.label}</span>
            </span>
          ))}
        </div>
      )}

      {desktopGenreRow}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-10000px] top-0 flex flex-nowrap items-center gap-2.5 whitespace-nowrap opacity-0"
      >
        <div
          ref={metaProbeRef}
          className="flex flex-nowrap items-center gap-2.5 whitespace-nowrap text-base font-medium text-zinc-300 md:text-lg"
        >
          {yearIso && (
            <span className="shrink-0 text-white font-bold tracking-wide">
              {yearIso}
            </span>
          )}
          {yearIso && displayRuntimeValue && <span className={metaDotClass} />}
          {displayRuntimeValue && (
            <span className="shrink-0">{displayRuntimeValue}</span>
          )}
          {(yearIso || displayRuntimeValue) && status && (
            <span className={metaDotClass} />
          )}
          {status && (
            <span
              className={`relative isolate inline-flex shrink-0 items-center px-2 py-0.5 rounded-md overflow-hidden bg-gradient-to-br from-white/10 via-transparent to-black/10 text-[10px] font-black uppercase tracking-widest backdrop-blur-[6px] shadow-none ${statusBadgeClass}`}
            >
              <span
                className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02] pointer-events-none overflow-hidden"
                style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
              />
              <span className="relative z-10">{statusLabel}</span>
            </span>
          )}
        </div>
        <div
          ref={genreProbeRef}
          className="flex flex-nowrap items-center gap-2 whitespace-nowrap"
        >
          <span ref={genreDotProbeRef} className={metaDotClass} />
          {visibleGenres.map((genre, index) => (
            <span
              key={genre.id}
              ref={(node) => {
                genreChipProbeRefs.current[index] = node;
              }}
              className={genreChipClass}
            >
              <span
                className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-white/[0.02] pointer-events-none overflow-hidden"
                style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
              />
              <span className="relative z-10">{genre.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export { getStatusLabel, getStatusBadgeClass };
