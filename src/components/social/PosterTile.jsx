"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import OptimizedImage from "@/components/OptimizedImage";
import { BookmarkPlus, Eye, Heart, ImageOff } from "lucide-react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import Stars from "./Stars";

function tmdbPoster(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function mediaTypeOf(item) {
  const type = item?.mediaType ?? item?.media_type;
  return type === "tv" || type === "show" || type === "episode" ? "tv" : "movie";
}

function detailsHref(item) {
  const mediaType = mediaTypeOf(item);
  const season = Number(item?.season ?? item?.seasonNumber ?? item?.season_number);
  const episode = Number(item?.episode ?? item?.episodeNumber ?? item?.episode_number);
  if (
    mediaType === "tv" &&
    Number.isInteger(season) && season >= 0 &&
    Number.isInteger(episode) && episode >= 0
  ) {
    return `/details/tv/${item?.tmdbId || item?.id}/season/${season}/episode/${episode}`;
  }
  return `/details/${mediaType}/${item?.tmdbId || item?.id}`;
}

function episodePreviewOf(item, mediaType) {
  if (mediaType !== "tv") return undefined;
  const seasonNumber = Number(item?.season ?? item?.seasonNumber ?? item?.season_number);
  const episodeNumber = Number(item?.episode ?? item?.episodeNumber ?? item?.episode_number);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 0 || !Number.isInteger(episodeNumber) || episodeNumber < 0) return undefined;
  return {
    showId: item?.tmdbId || item?.id,
    seasonNumber,
    episodeNumber,
    showName: item?.title || item?.name || null,
  };
}

function clampScore(score) {
  const num = Number(score);
  return Number.isNaN(num) ? null : Math.max(0, Math.min(10, num));
}

export default function PosterTile({ item, showStars = false, viewerState, starIconClassName, compactIndicator = false, indicatorSize = "default", hoverExpand = false, cornerOverlay = null, fixedIndicator = false, onClick }) {
  const [failed, setFailed] = useState(false);
  const previewClick = usePreviewOpen();
  const mediaType = mediaTypeOf(item);
  const src = tmdbPoster(item?.posterPath || item?.poster_path);
  const title = item?.title || item?.name || "";

  const isFixedSelfWatchlist = fixedIndicator === "watchlist-self";
  const isFixedFavorite = fixedIndicator === "favorite" || fixedIndicator === "favorites";
  const isFixedWatchlist = fixedIndicator === "watchlist" || fixedIndicator === "pending";

  const favorite = Boolean(
    viewerState?.favorite ??
    item?.isFavorite ??
    item?.favorite ??
    (isFixedFavorite && !viewerState ? true : false)
  );
  const watchlist = Boolean(
    viewerState?.watchlist ??
    item?.isWatchlist ??
    item?.watchlist ??
    (isFixedSelfWatchlist ? true : isFixedWatchlist && !viewerState ? true : false)
  );
  const watched = Boolean(viewerState?.watched || item?.watched);
  const userRating = viewerState?.rating ?? item?.userRating ?? item?.user_rating ?? (!showStars ? item?.rating : undefined);

  const tmdbScore = clampScore(item?.vote_average ?? item?.voteAverage ?? item?.tmdbScore ?? item?.tmdb_rating ?? item?.rating);
  const imdbScore = clampScore(item?.imdbScore ?? item?.imdb_score ?? item?.imdbRating ?? item?.imdb_rating ?? item?._imdb?.rating);

  const hasUserRating = userRating != null && Number(userRating) > 0;
  const hasCollectionIndicator = favorite || watchlist;
  const hasViewerIndicators = isFixedSelfWatchlist || hasCollectionIndicator || watched || hasUserRating;
  const useProfileIndicatorSize = indicatorSize === "profile";
  const useCompactSize = compactIndicator;
  const useResponsiveFixedSize = Boolean(fixedIndicator) && !compactIndicator;
  const indicatorItemClassName = useCompactSize
    ? "h-6 w-7 sm:h-6.5 sm:w-7.5"
    : useResponsiveFixedSize
      ? useProfileIndicatorSize
        ? "h-6 w-7 sm:h-6.5 sm:w-7.5 lg:h-8 lg:w-9"
        : "h-6 w-7 sm:h-6.5 sm:w-7.5 lg:h-9 lg:w-10"
    : useProfileIndicatorSize
      ? "h-8 w-9"
      : "h-9 w-10";
  const indicatorIconClassName = useCompactSize
    ? "h-3.5 w-3.5 sm:h-4 sm:w-4"
    : useResponsiveFixedSize
      ? useProfileIndicatorSize
        ? "h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-[1.125rem] lg:w-[1.125rem]"
        : "h-3.5 w-3.5 sm:h-4 sm:w-4 lg:h-5 lg:w-5"
    : useProfileIndicatorSize
      ? "h-[1.125rem] w-[1.125rem]"
      : "h-5 w-5";
  const indicatorRatingClassName = useCompactSize
    ? "h-6 w-7 text-xs sm:h-6.5 sm:w-7.5 sm:text-sm font-black"
    : useResponsiveFixedSize
      ? useProfileIndicatorSize
        ? "h-6 w-7 text-xs font-black sm:h-6.5 sm:w-7.5 sm:text-sm lg:h-8 lg:w-9 lg:text-lg"
        : "h-6 w-7 text-xs font-black sm:h-6.5 sm:w-7.5 sm:text-sm lg:h-9 lg:w-10 lg:text-xl"
    : useProfileIndicatorSize
      ? "h-8 w-9 text-lg"
      : "h-9 w-10 text-xl";

  return (
    <Link
      href={detailsHref(item)}
      onClick={onClick || previewClick(item, { mediaType, episode: episodePreviewOf(item, mediaType) })}
      className={`group/card relative block ${hoverExpand ? "z-0 overflow-visible focus-within:z-[40] hover:z-[50]" : ""}`}
    >
      <motion.div
        className={`relative aspect-[2/3] overflow-hidden bg-zinc-900 shadow-md transition-shadow duration-300 ${
          hoverExpand ? "rounded-lg" : "rounded-xl"
        }`}
        whileHover={hoverExpand ? {
          scale: 1.15,
          zIndex: 100,
          boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
        } : undefined}
        transition={hoverExpand
          ? { type: "spring", stiffness: 300, damping: 20 }
          : { duration: 0.3 }}
        style={hoverExpand ? { transformOrigin: "center center" } : undefined}
      >

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

        {cornerOverlay}

        {/* En escritorio todos los estados viven dentro del póster y aparecen
            únicamente al interactuar. `fixedIndicator` solo mantiene la
            variante visible bajo la tarjeta en superficies táctiles. */}
        {hasViewerIndicators && (
          <div
            className={`pointer-events-none absolute ${
              useCompactSize ? "bottom-1.5 px-1 sm:px-1.5" : useProfileIndicatorSize ? "bottom-1.5 px-1.5" : "bottom-2 px-1.5"
            } left-1/2 z-20 hidden -translate-x-1/2 translate-y-3 scale-95 opacity-0 items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white shadow-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex lg:group-hover/card:translate-y-0 lg:group-hover/card:scale-100 lg:group-hover/card:opacity-100 lg:group-focus-visible/card:translate-y-0 lg:group-focus-visible/card:scale-100 lg:group-focus-visible/card:opacity-100 will-change-transform transform-gpu`}
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

      </motion.div>

      {/* La variante fija es exclusivamente táctil. En escritorio no ocupa
          espacio debajo de la tarjeta: se utiliza el overlay anterior. */}
      {fixedIndicator && hasViewerIndicators ? (
        <div className="mt-1.5 flex justify-center lg:hidden">
          <div
            className={`inline-flex items-center overflow-hidden rounded-full ${LIQUID_GLASS_PANEL} text-white shadow-md`}
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
        </div>
      ) : showStars && typeof item?.rating === "number" ? (
        <div className="mt-1.5 flex justify-center">
          <Stars rating={item.rating} iconClassName={starIconClassName} />
        </div>
      ) : null}
    </Link>
  );
}
