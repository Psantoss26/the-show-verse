"use client";

import { useState } from "react";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { ImageOff } from "lucide-react";
import Stars from "./Stars";

function tmdbPoster(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function detailsHref(item) {
  const type = item?.mediaType === "tv" ? "tv" : "movie";
  return `/details/${type}/${item?.tmdbId}`;
}

// Tarjeta de póster con enlace a la ficha y, opcionalmente, la nota (estrellas).
export default function PosterTile({ item, showStars = false }) {
  const [failed, setFailed] = useState(false);
  const src = tmdbPoster(item?.posterPath);
  return (
    <Link href={detailsHref(item)} className="group/card block" title={item?.title || ""}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 shadow-md ring-1 ring-white/5 transition-all duration-300 group-hover/card:ring-emerald-400/50">
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
      </div>
      {showStars && typeof item?.rating === "number" && (
        <div className="mt-1.5 flex justify-center">
          <Stars rating={item.rating} />
        </div>
      )}
    </Link>
  );
}
