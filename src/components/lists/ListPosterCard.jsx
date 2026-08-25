"use client";


import OptimizedImage from "@/components/OptimizedImage";
import Link from "next/link";
import { useState } from "react";
import { Film, ImageOff, MonitorPlay } from "lucide-react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

function TmdbPoster({ posterPath, alt, loading = false }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (loading) {
    return <div className="h-full w-full animate-pulse bg-zinc-900" aria-hidden="true" />;
  }

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
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

function ListDetailsHoverIndicator({ mediaType, voteAverage, imdbRating }) {
  const tmdbScore = Number(voteAverage);
  const imdbScore = Number(imdbRating);
  const hasTmdbScore = Number.isFinite(tmdbScore) && tmdbScore > 0;
  const hasImdbScore = Number.isFinite(imdbScore) && imdbScore > 0;
  const isTv = mediaType === "tv";

  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 items-center overflow-hidden rounded-full px-1.5 opacity-0 ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover/card:translate-y-0 lg:group-hover/card:scale-100 lg:group-hover/card:opacity-100 lg:group-focus-visible/card:translate-y-0 lg:group-focus-visible/card:scale-100 lg:group-focus-visible/card:opacity-100 will-change-transform transform-gpu`}
      aria-hidden="true"
    >
      <span className={`flex h-9 w-10 shrink-0 items-center justify-center ${isTv ? "text-violet-400" : "text-sky-400"}`}>
        {isTv ? <MonitorPlay className="h-5 w-5" /> : <Film className="h-5 w-5" />}
      </span>
      {hasTmdbScore ? (
        <span className="flex h-9 w-10 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums text-sky-400">
          {tmdbScore.toFixed(1)}
        </span>
      ) : null}
      {hasImdbScore ? (
        <span className="flex h-9 w-10 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums text-amber-300">
          {imdbScore.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

export const listPosterGridClass =
  "relative z-0 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6 lg:gap-4";

export default function ListPosterCard({
  href,
  title = "Sin título",
  mediaType = "movie",
  posterPath,
  voteAverage,
  imdbRating,
  posterLoading = false,
  children,
  onClick,
  className = "",
  disableHover = false,
}) {
  const content = (
    <div
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/35 shadow-lg backdrop-blur-[28px] ${className}`}
    >
      <TmdbPoster posterPath={posterPath} alt={title} loading={posterLoading} />

      {!disableHover ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] transition-shadow duration-300 lg:group-hover/card:shadow-[inset_0_0_0_2px_rgba(168,85,247,0.92)] lg:group-focus-visible/card:shadow-[inset_0_0_0_2px_rgba(168,85,247,0.92)]" />
          <ListDetailsHoverIndicator
            mediaType={mediaType}
            voteAverage={voteAverage}
            imdbRating={imdbRating}
          />
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
      className="group/card relative block w-full select-none focus:outline-none focus-visible:rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
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
