"use client";

import Link from "next/link";
import { useState } from "react";
import { Calendar, ImageOff } from "lucide-react";

function TmdbPoster({ posterPath, alt, enableHover = true }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!posterPath || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-700">
        <ImageOff className="h-8 w-8 opacity-50" />
      </div>
    );
  }

  return (
    <>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-zinc-900" />}
      <img
        src={`https://image.tmdb.org/t/p/w500${posterPath}`}
        alt={alt}
        className={`h-full w-full object-cover transition-all duration-700 ease-out ${
          enableHover ? "md:group-hover/card:scale-110" : ""
        } ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

export const listPosterGridClass =
  "relative z-0 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-5 lg:grid-cols-6 lg:gap-6";

export default function ListPosterCard({
  href,
  title = "Sin título",
  year,
  mediaType = "movie",
  posterPath,
  voteAverage,
  imdbRating,
  children,
  onClick,
  className = "",
  disableHover = false,
}) {
  const typeLabel = mediaType === "tv" ? "SERIE" : mediaType === "person" ? "PERSONA" : "PELÍCULA";
  const typeClass =
    mediaType === "tv"
      ? "border-purple-500/30 bg-purple-500/20 text-purple-200"
      : mediaType === "person"
        ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-200"
        : "border-sky-500/30 bg-sky-500/20 text-sky-200";

  const rating =
    typeof voteAverage === "number" && voteAverage > 0
      ? voteAverage.toFixed(1)
      : null;
  const imdb =
    typeof imdbRating === "number" && imdbRating > 0
      ? imdbRating.toFixed(1)
      : null;

  const content = (
    <div
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-zinc-900 shadow-lg ring-1 ring-white/5 transition-all duration-500 ${
        disableHover
          ? ""
          : "md:group-hover/card:-translate-y-1 md:group-hover/card:scale-[1.03] md:group-hover/card:ring-purple-500/30 md:group-hover/card:shadow-[0_0_30px_rgba(168,85,247,0.22)]"
      } ${className}`}
    >
      <TmdbPoster posterPath={posterPath} alt={title} enableHover={!disableHover} />

      {!disableHover ? (
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 md:group-hover/card:opacity-100">
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-[1200ms] ease-out md:group-hover/card:translate-x-full" />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 pt-10 bg-gradient-to-t from-black/90 via-black/45 to-transparent md:hidden">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`rounded border px-1 py-0.5 text-[8px] font-black uppercase tracking-wider ${typeClass}`}>
            {mediaType === "tv" ? "TV" : mediaType === "person" ? "PER" : "CINE"}
          </span>
          {year ? <span className="text-[10px] font-bold text-yellow-300">{year}</span> : null}
        </div>
        <h3 className="line-clamp-2 text-[11px] font-bold leading-tight text-white drop-shadow-md sm:text-xs">
          {title}
        </h3>
      </div>

      {!disableHover ? (
        <div className="pointer-events-none absolute inset-0 z-10 hidden flex-col justify-between opacity-0 transition-opacity duration-300 md:flex md:group-hover/card:opacity-100">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent p-3 transition-transform duration-300 md:-translate-y-2 md:group-hover/card:translate-y-0">
            <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider shadow-sm backdrop-blur-md ${typeClass}`}>
              {typeLabel}
            </span>

            <div className="flex flex-col items-end gap-1">
              {rating ? (
                <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                  <span className="font-mono text-xs font-black tracking-tight text-emerald-400">
                    {rating}
                  </span>
                  <img src="/logo-TMDb.png" alt="TMDb" className="h-2.5 w-auto" draggable={false} />
                </div>
              ) : null}
              {imdb ? (
                <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                  <span className="font-mono text-xs font-black tracking-tight text-yellow-400">
                    {imdb}
                  </span>
                  <img src="/logo-IMDb.png" alt="IMDb" className="h-3 w-auto" draggable={false} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 transition-transform duration-300 md:translate-y-4 md:group-hover/card:translate-y-0">
            <div className="flex items-end justify-between gap-3">
              <h3 className="line-clamp-2 min-w-0 flex-1 text-xs font-bold leading-tight text-white drop-shadow-md sm:text-sm">
                {title}
              </h3>
              {year ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-yellow-400 sm:text-xs">
                  <Calendar className="h-3 w-3" />
                  {year}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );

  if (!href) {
    return <div className="group/card relative block w-full select-none">{content}</div>;
  }

  return (
    <Link
      href={href}
      className="group/card relative block w-full select-none"
      draggable={false}
      onClick={onClick}
    >
      {content}
    </Link>
  );
}
