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
  const type = item?.mediaType === "tv" || item?.media_type === "tv" ? "tv" : "movie";
  return `/details/${type}/${item?.tmdbId || item?.id}`;
}

export default function PosterTile({ item, showStars = false, viewerState }) {
  const [failed, setFailed] = useState(false);
  const src = tmdbPoster(item?.posterPath || item?.poster_path);

  const title = item?.title || item?.name || "";
  const year =
    item?.year ||
    (item?.releaseDate || item?.release_date || item?.firstAirDate || item?.first_air_date || "")?.slice(0, 4);
  const mediaTypeLabel =
    item?.mediaType === "tv" || item?.media_type === "tv" ? "Serie" : "Película";
  const firstGenre = item?.genre || item?.firstGenre || mediaTypeLabel;

  const favorite = Boolean(viewerState?.favorite || item?.isFavorite || item?.favorite);
  const watchlist = Boolean(viewerState?.watchlist || item?.isWatchlist || item?.watchlist);
  const watched = Boolean(viewerState?.watched || item?.watched);
  const userRating = viewerState?.rating ?? item?.userRating ?? item?.user_rating;

  const rawVote = item?.vote_average ?? (typeof item?.rating === "number" && !viewerState?.rating ? item.rating : null);
  const tmdbScore = typeof rawVote === "number" && rawVote > 0 ? rawVote.toFixed(1) : null;

  // Determinar color e iconos con bordes vectoriales nítidos para el badge de la esquina superior izquierda
  let badgeColor = "bg-zinc-800/80 border-white/20 text-white";
  if (favorite && watchlist) {
    badgeColor = "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300";
  } else if (favorite) {
    badgeColor = "bg-red-500/20 border-red-500/40 text-red-400";
  } else if (watchlist) {
    badgeColor = "bg-sky-500/20 border-sky-500/40 text-sky-400";
  } else if (watched) {
    badgeColor = "bg-emerald-500/20 border-emerald-500/40 text-emerald-400";
  }

  const showTopLeftBadge = favorite || watchlist || watched;

  return (
    <Link href={detailsHref(item)} className="group/card relative block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-md transition-shadow duration-300">

        {/* Imagen del póster */}
        {src && !failed ? (
          <OptimizedImage
            src={src}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-110"
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ImageOff className="h-7 w-7 opacity-50" />
          </div>
        )}

        {/* Insignia en esquina superior izquierda (con bordes de ultra alta resolución sin borrosidad GPU) */}
        {showTopLeftBadge && (
          <div
            className={`hidden lg:flex items-center justify-center gap-1.5 absolute -top-px -left-px z-20 p-2 sm:p-2.5 rounded-br-2xl border backdrop-blur-xl shadow-md transition-all duration-300 ease-out origin-top-left lg:scale-0 lg:opacity-0 lg:group-hover/card:scale-100 lg:group-hover/card:opacity-100 ${badgeColor}`}
            aria-hidden="true"
          >
            {favorite && <Heart className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />}
            {watchlist && <BookmarkPlus className="w-4 h-4 sm:w-[18px] sm:h-[18px] fill-current" />}
            {!favorite && !watchlist && watched && <Eye className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
          </div>
        )}

        {/* Overlay con gradientes superior e inferior idéntico al de Favoritos */}
        <div className="absolute inset-0 z-10 hidden lg:flex flex-col justify-between opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none">
          {/* Top gradient con valoración TMDb */}
          <div className="p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover/card:translate-y-0 transition-transform duration-300">
            <div />

            <div className="flex flex-col items-end gap-1 pointer-events-auto">
              {tmdbScore && (
                <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                  <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                    {tmdbScore}
                  </span>
                  <OptimizedImage
                    src="/logo-TMDb.png"
                    alt="TMDb"
                    className="w-auto h-2.5 opacity-100"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bottom gradient con título, año/género y nota del usuario */}
          <div className="p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover/card:translate-y-0 transition-transform duration-300">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 text-left flex-1">
                {title && (
                  <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-sm">
                    {title}
                  </h3>
                )}
                {(year || firstGenre) && (
                  <p className="text-yellow-500 text-xs font-bold mt-0.5 drop-shadow-md">
                    {year}
                    {year && firstGenre ? ` • ${firstGenre}` : firstGenre}
                  </p>
                )}
              </div>
              {userRating != null && Number(userRating) > 0 && (
                <span className="text-yellow-400 text-2xl font-black font-mono tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)] shrink-0">
                  {userRating}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {showStars && typeof item?.rating === "number" && (
        <div className="mt-1.5 flex justify-center">
          <Stars rating={item.rating} />
        </div>
      )}
    </Link>
  );
}
