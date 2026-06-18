"use client";


import OptimizedImage from "@/components/OptimizedImage";
import Link from "next/link";
import { useState } from "react";
import { ImageOff } from "lucide-react";

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
      <OptimizedImage
        src={`https://image.tmdb.org/t/p/w500${posterPath}`}
        alt={alt}
        className={`h-full w-full object-cover transition-all duration-500 ease-out transform-gpu ${
          enableHover
            ? "md:group-hover/card:scale-[1.08] md:group-hover/card:-translate-y-1 md:group-hover/card:grayscale-0 md:group-focus/card:scale-[1.08] md:group-focus/card:-translate-y-1 md:group-focus/card:grayscale-0 grayscale-[18%]"
            : ""
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
  "relative z-0 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 lg:gap-4";

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
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/35 shadow-lg backdrop-blur-[28px] transition-all duration-500 transform-gpu ${
        disableHover
          ? ""
          : "md:group-hover/card:-translate-y-1.5 md:group-hover/card:shadow-[0_20px_45px_rgba(0,0,0,0.34)] md:group-focus/card:-translate-y-1.5 md:group-focus/card:shadow-[0_20px_45px_rgba(0,0,0,0.34)]"
      } ${className}`}
    >
      <TmdbPoster posterPath={posterPath} alt={title} enableHover={!disableHover} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 pt-10 bg-gradient-to-t from-black/90 via-black/45 to-transparent md:hidden">
        {year ? <div className="mb-1 text-[10px] font-bold text-yellow-300">{year}</div> : null}
        <h3 className="line-clamp-2 text-[11px] font-bold leading-tight text-white drop-shadow-md sm:text-xs">
          {title}
        </h3>
      </div>

      {!disableHover ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden items-start justify-between gap-3 p-3 opacity-0 transition-all duration-500 ease-out transform-gpu md:flex md:-translate-y-2 md:group-hover/card:translate-y-0 md:group-hover/card:opacity-100 md:group-focus/card:translate-y-0 md:group-focus/card:opacity-100">
            <div />
            <div className="flex flex-col items-end gap-1">
              {rating ? (
                <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                  <span className="font-mono text-[10px] font-black tracking-tight text-emerald-400 sm:text-xs">
                    {rating}
                  </span>
                  <OptimizedImage src="/logo-TMDb.png" alt="" className="h-2 w-auto sm:h-2.5" draggable={false} />
                </div>
              ) : null}
              {imdb ? (
                <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                  <span className="font-mono text-[10px] font-black tracking-tight text-yellow-400 sm:text-xs">
                    {imdb}
                  </span>
                  <OptimizedImage src="/logo-IMDb.svg" alt="" className="h-2.5 w-auto sm:h-3" draggable={false} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 z-0 hidden bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 transition-opacity duration-500 md:block md:group-hover/card:opacity-100 md:group-focus/card:opacity-100" />

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 hidden p-3 pb-4 opacity-0 transition-all duration-500 ease-out transform-gpu md:block md:translate-y-2 md:group-hover/card:translate-y-0 md:group-hover/card:opacity-100 md:group-focus/card:translate-y-0 md:group-focus/card:opacity-100">
            <h3 className="line-clamp-2 text-xs font-extrabold leading-tight text-white drop-shadow-sm sm:text-sm">
              {title}
            </h3>
            {year ? (
              <p className="mt-0.5 text-[10px] font-semibold leading-tight text-zinc-300 transition-colors duration-300 line-clamp-1 drop-shadow-sm group-hover/card:text-purple-400 sm:text-xs">
                {year}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {children}
    </div>
  );

  const handlePrefetch = () => {
    if (href && typeof window !== "undefined") {
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  if (!href) {
    return <div className="group/card relative block w-full select-none">{content}</div>;
  }

  return (
    <Link
      href={href}
      className="group/card relative block w-full select-none focus:outline-none"
      draggable={false}
      onClick={onClick}
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      onTouchStart={handlePrefetch}
    >
      {content}
    </Link>
  );
}
