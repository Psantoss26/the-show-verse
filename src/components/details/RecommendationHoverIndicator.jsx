"use client";

import { Heart, BookmarkPlus } from "lucide-react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

export default function RecommendationHoverIndicator({
  favorite = false,
  watchlist = false,
  userRating = null,
  tmdbRating = null,
  imdbRating = null,
}) {
  // Favorito tiene prioridad si, por una importación antigua, el título
  // aparece también en Pendientes. El resto de títulos conservan sus
  // puntuaciones públicas aunque no pertenezcan a ninguna lista.
  const isFavorite = Boolean(favorite);
  const isWatchlist = !isFavorite && Boolean(watchlist);
  const normalizedUserRating = Number(userRating);
  const normalizedTmdbRating = Number(tmdbRating);
  const normalizedImdbRating = Number(imdbRating);
  const hasUserRating =
    Number.isFinite(normalizedUserRating) && normalizedUserRating > 0;
  const hasTmdbRating =
    Number.isFinite(normalizedTmdbRating) && normalizedTmdbRating > 0;
  const hasImdbRating =
    Number.isFinite(normalizedImdbRating) && normalizedImdbRating > 0;
  const scoreClassName =
    "flex h-9 w-10 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums";

  if (!isFavorite && !isWatchlist && !hasTmdbRating && !hasImdbRating) return null;

  return (
    <div
      className={`pointer-events-none absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 items-center overflow-hidden rounded-full px-1.5 opacity-0 ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover:translate-y-0 lg:group-hover:scale-100 lg:group-hover:opacity-100 will-change-transform transform-gpu`}
      aria-hidden="true"
    >
      {(isFavorite || isWatchlist) && (
        <span
          className={`flex h-9 w-10 shrink-0 items-center justify-center ${
            isFavorite ? "text-red-400" : "text-sky-400"
          }`}
        >
          {isFavorite ? (
            <Heart className="h-5 w-5 fill-current" />
          ) : (
            <BookmarkPlus className="h-5 w-5 fill-current" />
          )}
        </span>
      )}
      {isFavorite && hasUserRating && (
        <span className={`${scoreClassName} text-amber-300`}>
          {Number.isInteger(normalizedUserRating)
            ? normalizedUserRating
            : normalizedUserRating.toFixed(1)}
        </span>
      )}
      {!isFavorite && hasTmdbRating && (
        <span className={`${scoreClassName} text-sky-400`}>
          {normalizedTmdbRating.toFixed(1)}
        </span>
      )}
      {!isFavorite && hasImdbRating && (
        <span className={`${scoreClassName} text-amber-300`}>
          {normalizedImdbRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
