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

export default function PosterTile({ item, showStars = false, viewerState }) {
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

  return (
    <Link href={detailsHref(item)} className="group/card relative block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-md transition-shadow duration-300">

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

        {/* Estados personales: barra liquid glass idéntica a los modales de DetailsClient */}
        {hasViewerIndicators && (
          <div
            className={`pointer-events-none absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 opacity-0 items-center overflow-hidden rounded-full border border-white/10 ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover/card:translate-y-0 lg:group-hover/card:scale-100 lg:group-hover/card:opacity-100 will-change-transform transform-gpu`}
            aria-hidden="true"
          >
            {hasCollectionIndicator && (
              <span className={`flex h-9 w-10 shrink-0 items-center justify-center ${favorite ? "text-red-400" : "text-sky-400"}`}>
                {favorite ? (
                  <Heart className="h-5 w-5 fill-current" />
                ) : (
                  <BookmarkPlus className="h-5 w-5 fill-current" />
                )}
              </span>
            )}
            {watched && (
              <span className={`flex h-9 w-10 shrink-0 items-center justify-center text-emerald-400 ${hasCollectionIndicator ? "border-l border-white/10" : ""}`}>
                <Eye className="h-5 w-5" />
              </span>
            )}
            {hasUserRating && (
              <span className={`flex h-9 w-10 shrink-0 items-center justify-center text-xl font-black leading-none text-amber-300 ${hasCollectionIndicator || watched ? "border-l border-white/10" : ""}`}>
                <span className="tabular-nums leading-none">{userRating}</span>
              </span>
            )}
          </div>
        )}

      </div>

      {showStars && typeof item?.rating === "number" && (
        <div className="mt-1.5 flex justify-center">
          <Stars rating={item.rating} />
        </div>
      )}
    </Link>
  );
}
