"use client";
import { useState } from "react";
import Link from "next/link";
import { Film, Tv, Users } from "lucide-react";

const tmdbImg = (p, s = "w342") =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : null;
const fmtShort = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
      })
    : "";
const starColor = (r) =>
  r >= 9 ? "#f59e0b" : r >= 7 ? "#10b981" : r >= 5 ? "#6366f1" : "#ef4444";

const ACCENT = {
  yellow: {
    border: "group-hover:border-yellow-500/50",
    text: "text-yellow-400",
  },
  emerald: {
    border: "group-hover:border-emerald-500/50",
    text: "text-emerald-400",
  },
  blue: { border: "group-hover:border-blue-500/50", text: "text-blue-400" },
  purple: {
    border: "group-hover:border-purple-500/50",
    text: "text-purple-400",
  },
  indigo: {
    border: "group-hover:border-indigo-500/50",
    text: "text-indigo-400",
  },
  rose: { border: "group-hover:border-rose-500/50", text: "text-rose-400" },
};

export function PosterCard({
  item,
  showRating = false,
  dateField = "watched_at",
  accentColor = "yellow",
}) {
  const [err, setErr] = useState(false);
  const src = tmdbImg(item.poster_path, "w185");
  const { border, text } = ACCENT[accentColor] || ACCENT.yellow;
  return (
    <Link
      href={item.detailsHref || "#"}
      className="group relative block w-full"
      title={item.title}
    >
      <div
        className={`relative isolate aspect-[2/3] rounded-xl overflow-hidden bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/50 border border-white/10 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] transform-gpu group-hover:bg-black/40 ${border} transition-all duration-300`}
      >
        {src && !err ? (
          <img
            src={src}
            alt={item.title}
            className="w-full h-full object-cover grayscale-[18%] group-hover:scale-110 group-hover:grayscale-0 transition-transform duration-500"
            onError={() => setErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            {item.type === "movie" ? (
              <Film className="h-8 w-8" />
            ) : (
              <Tv className="h-8 w-8" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />
        {showRating && item.rating && (
          <div
            className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white shadow-lg"
            style={{ background: starColor(item.rating) }}
          >
            {item.rating}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="truncate text-xs font-bold leading-tight text-white">
            {item.title}
          </p>
          <p className={`text-[10px] font-medium ${text}`}>
            {fmtShort(item[dateField])}
            {item.episode
              ? ` · T${item.episode.season}:E${item.episode.number}`
              : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function RankedPosterCard({ item, rank, type, accentColor = "yellow" }) {
  const media = type === "movie" ? item?.movie : item?.show;
  const tmdbId = media?.ids?.tmdb;
  const title = media?.title || "Sin título";
  const plays = item?.plays || 0;
  const src = tmdbImg(media?.poster_path, "w342");
  const href = tmdbId
    ? `/details/${type === "movie" ? "movie" : "tv"}/${tmdbId}`
    : "#";
  const { border, text } = ACCENT[accentColor] || ACCENT.yellow;

  return (
    <Link href={href} className="group relative block w-full" title={title}>
      <div
        className={`relative isolate aspect-[2/3] rounded-xl overflow-hidden bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/50 border border-white/10 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] transform-gpu group-hover:bg-black/40 ${border} transition-all duration-300`}
      >
        {src ? (
          <img
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover grayscale-[18%] group-hover:scale-110 group-hover:grayscale-0 transition-transform duration-500"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
            {type === "movie" ? (
              <Film className="h-9 w-9 opacity-60" />
            ) : (
              <Tv className="h-9 w-9 opacity-60" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />
        <div className="absolute top-1.5 left-1.5">
          <span className="rounded-md border border-yellow-500/30 bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-yellow-300 shadow-sm backdrop-blur-md">
            #{rank}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="line-clamp-2 text-xs font-bold leading-tight text-white">
            {title}
          </p>
          <p className={`text-[10px] font-medium ${text}`}>
            {plays.toLocaleString("es-ES")} vistas
          </p>
        </div>
      </div>
    </Link>
  );
}

export function WatchlistCard({ item }) {
  const src = tmdbImg(item.poster_path, "w342");
  const typeLabel = item.type === "movie" ? "Película" : "Serie";
  return (
    <Link
      href={item.detailsHref || "#"}
      className="group relative block w-full"
      title={item.title}
    >
      <div className="relative isolate aspect-[2/3] rounded-xl overflow-hidden bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/50 border border-white/10 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] transform-gpu group-hover:bg-black/40 group-hover:border-indigo-500/50 transition-all duration-300">
        {src ? (
          <img
            src={src}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600">
            {item.type === "movie" ? (
              <Film className="h-8 w-8" />
            ) : (
              <Tv className="h-8 w-8" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="truncate text-xs font-bold leading-tight text-white">
            {item.title}
          </p>
          <p className="text-[10px] font-medium text-indigo-400">
            {item.year} · {typeLabel}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function PersonCard({ person, accentColor = "yellow" }) {
  const src = person.profile_path
    ? `https://image.tmdb.org/t/p/w342${person.profile_path}`
    : null;
  const { border, text } = ACCENT[accentColor] || ACCENT.yellow;
  return (
    <Link
      href={`/details/person/${person.id}`}
      className="group relative block w-full"
    >
      <div
        className={`relative isolate aspect-[2/3] rounded-xl overflow-hidden bg-black/30 bg-gradient-to-br from-white/10 via-transparent to-black/50 border border-white/10 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] transform-gpu group-hover:bg-black/40 ${border} transition-all duration-300`}
      >
        {src ? (
          <img
            src={src}
            alt={person.name}
            className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            {accentColor === "rose" ? (
              <Film className="w-8 h-8" />
            ) : (
              <Users className="w-8 h-8" />
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="text-white text-xs font-bold leading-tight truncate">
            {person.name}
          </p>
          <p className={`${text} text-[10px] font-medium`}>
            {person.count} pelis
          </p>
        </div>
      </div>
    </Link>
  );
}
