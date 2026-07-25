"use client";

import { useState } from "react";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { BookmarkPlus, Eye, Heart, ImageOff } from "lucide-react";
import Stars from "./Stars";

function tmdbPoster(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function detailsHref(item) {
  const type = item?.mediaType === "tv" ? "tv" : "movie";
  return `/details/${type}/${item?.tmdbId}`;
}

function ViewerStateIndicators({ state }) {
  const favorite = Boolean(state?.favorite);
  const watchlist = Boolean(state?.watchlist);
  const watched = Boolean(state?.watched);
  const rating = Number(state?.rating);
  const hasRating = Number.isFinite(rating) && rating > 0;
  if (!favorite && !watchlist && !watched && !hasRating) return null;

  const summary = [
    favorite && "en favoritos",
    watchlist && "en pendientes",
    watched && "vista",
    hasRating && `puntuada con ${rating}`,
  ].filter(Boolean).join(", ");

  return (
    <>
      <span className="sr-only">En tu biblioteca: {summary}.</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex translate-y-1 items-center justify-center opacity-0 transition-all duration-200 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-visible/card:translate-y-0 group-focus-visible/card:opacity-100"
      >
        <span className="inline-flex overflow-hidden rounded-full border border-white/20 bg-black/75 shadow-[0_8px_22px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {(favorite || watchlist) && (
            <span className={`inline-flex h-7 min-w-8 items-center justify-center px-2 ${watched || hasRating ? "border-r border-white/15" : ""} ${favorite ? "text-rose-300" : "text-sky-300"}`}>
              {favorite ? <Heart className="h-4 w-4 fill-current" /> : <BookmarkPlus className="h-4 w-4 fill-current" />}
            </span>
          )}
          {watched && (
            <span className={`inline-flex h-7 min-w-8 items-center justify-center px-2 text-emerald-300 ${hasRating ? "border-r border-white/15" : ""}`}>
              <Eye className="h-4 w-4" />
            </span>
          )}
          {hasRating && (
            <span className="inline-flex h-7 min-w-9 items-center justify-center px-2 text-[0.6875rem] font-black tabular-nums text-yellow-300">
              {rating}
            </span>
          )}
        </span>
      </span>
    </>
  );
}

// Tarjeta de póster con enlace a la ficha y, opcionalmente, la nota (estrellas).
export default function PosterTile({ item, showStars = false, viewerState }) {
  const [failed, setFailed] = useState(false);
  const src = tmdbPoster(item?.posterPath);
  return (
    <Link href={detailsHref(item)} className="group/card relative block" title={item?.title || ""}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-md transition-all duration-300 group-hover/card:shadow-xl">
        {src && !failed ? (
          <OptimizedImage
            src={src}
            alt={item?.title || ""}
            className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.06]"
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ImageOff className="h-7 w-7 opacity-50" />
          </div>
        )}
        <ViewerStateIndicators state={viewerState} />
      </div>
      {showStars && typeof item?.rating === "number" && (
        <div className="mt-1.5 flex justify-center">
          <Stars rating={item.rating} />
        </div>
      )}
    </Link>
  );
}
