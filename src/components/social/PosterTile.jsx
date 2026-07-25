"use client";

import { useState } from "react";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { BookmarkPlus, Eye, Heart, ImageOff } from "lucide-react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import Stars from "./Stars";

function tmdbPoster(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function detailsHref(item) {
  const type = item?.mediaType === "tv" || item?.media_type === "tv" ? "tv" : "movie";
  return `/details/${type}/${item?.tmdbId || item?.id}`;
}

export default function PosterTile({ item, showStars = false, viewerState, starIconClassName, compactIndicator = false, indicatorSize = "default" }) {
  const [failed, setFailed] = useState(false);
  const src = tmdbPoster(item?.posterPath || item?.poster_path);

  const title = item?.title || item?.name || "";

  const favorite = Boolean(viewerState?.favorite || item?.isFavorite || item?.favorite);
  const watchlist = Boolean(viewerState?.watchlist || item?.isWatchlist || item?.watchlist);
  const watched = Boolean(viewerState?.watched || item?.watched);
  const userRating = viewerState?.rating ?? item?.userRating ?? item?.user_rating;

  const hasUserRating = userRating != null && Number(userRating) > 0;
  const hasCollectionIndicator = favorite || watchlist;
  const hasViewerIndicators = hasCollectionIndicator || watched || hasUserRating;
  const useProfileIndicatorSize = indicatorSize === "profile";
  const indicatorItemClassName = compactIndicator
    ? "h-7 w-8"
    : useProfileIndicatorSize
      ? "h-8 w-9"
      : "h-9 w-10";
  const indicatorIconClassName = compactIndicator
    ? "h-4 w-4"
    : useProfileIndicatorSize
      ? "h-[1.125rem] w-[1.125rem]"
      : "h-5 w-5";
  const indicatorRatingClassName = compactIndicator
    ? "h-7 w-8 text-base"
    : useProfileIndicatorSize
      ? "h-8 w-9 text-lg"
      : "h-9 w-10 text-xl";

  return (
    <Link href={detailsHref(item)} className="group/card relative block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 shadow-md transition-shadow duration-300">

        {/* Imagen del póster */}
        {src && !failed ? (
          <OptimizedImage
            src={src}
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ImageOff className="h-7 w-7 opacity-50" />
          </div>
        )}

        {/* Estados personales: barra liquid glass idéntica a los modales de DetailsClient (sin bordes marcados) */}
        {hasViewerIndicators && (
          <div
            className={`pointer-events-none absolute ${compactIndicator || useProfileIndicatorSize ? "bottom-1.5" : "bottom-2"} left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 opacity-0 items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover/card:translate-y-0 lg:group-hover/card:scale-100 lg:group-hover/card:opacity-100 will-change-transform transform-gpu`}
            aria-hidden="true"
          >
            {hasCollectionIndicator && (
              <span className={`flex ${indicatorItemClassName} shrink-0 items-center justify-center ${favorite ? "text-red-400" : "text-sky-400"}`}>
                {favorite ? (
                  <Heart className={`${indicatorIconClassName} fill-current`} />
                ) : (
                  <BookmarkPlus className={`${indicatorIconClassName} fill-current`} />
                )}
              </span>
            )}
            {watched && (
              <span className={`flex ${indicatorItemClassName} shrink-0 items-center justify-center text-emerald-400`}>
                <Eye className={indicatorIconClassName} />
              </span>
            )}
            {hasUserRating && (
              <span className={`flex ${indicatorRatingClassName} shrink-0 items-center justify-center font-black leading-none text-amber-300`}>
                <span className="tabular-nums leading-none">{userRating}</span>
              </span>
            )}
          </div>
        )}

      </div>

      {showStars && typeof item?.rating === "number" && (
        <div className="mt-1.5 flex justify-center">
          <Stars rating={item.rating} iconClassName={starIconClassName} />
        </div>
      )}
    </Link>
  );
}
