"use client";
import { useState } from "react";
import Link from "next/link";
import { Film, Tv, Users } from "lucide-react";

const tmdbImg = (p, s = "w342") => p ? `https://image.tmdb.org/t/p/${s}${p}` : null;
const fmtShort = (iso) => iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "";
const starColor = (r) => r >= 9 ? "#f59e0b" : r >= 7 ? "#10b981" : r >= 5 ? "#6366f1" : "#ef4444";

const ACCENT = {
  yellow:  { border: "group-hover:border-yellow-500/50",  text: "text-yellow-400",  ring: "group-hover:ring-yellow-400/35",  shadow: "group-hover:shadow-[0_18px_40px_-22px_rgba(234,179,8,0.7)]",   glow: "from-yellow-500/20 via-yellow-500/5" },
  emerald: { border: "group-hover:border-emerald-500/50", text: "text-emerald-400", ring: "group-hover:ring-emerald-400/35", shadow: "group-hover:shadow-[0_18px_40px_-22px_rgba(16,185,129,0.7)]",  glow: "from-emerald-500/20 via-emerald-500/5" },
  blue:    { border: "group-hover:border-blue-500/50",    text: "text-blue-400",    ring: "group-hover:ring-blue-400/35",    shadow: "group-hover:shadow-[0_18px_40px_-22px_rgba(59,130,246,0.7)]",  glow: "from-blue-500/20 via-blue-500/5" },
  purple:  { border: "group-hover:border-purple-500/50",  text: "text-purple-400",  ring: "group-hover:ring-purple-400/35",  shadow: "group-hover:shadow-[0_18px_40px_-22px_rgba(168,85,247,0.7)]",  glow: "from-purple-500/20 via-purple-500/5" },
  indigo:  { border: "group-hover:border-indigo-500/50",  text: "text-indigo-400",  ring: "group-hover:ring-indigo-400/35",  shadow: "group-hover:shadow-[0_18px_40px_-22px_rgba(99,102,241,0.7)]",  glow: "from-indigo-500/20 via-indigo-500/5" },
  rose:    { border: "group-hover:border-rose-500/50",    text: "text-rose-400",    ring: "group-hover:ring-rose-400/35",    shadow: "group-hover:shadow-[0_18px_40px_-22px_rgba(244,63,94,0.7)]",   glow: "from-rose-500/20 via-rose-500/5" },
};

function CardLight({ glow, ring }) {
  return (
    <>
      <div className={`pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5 transition-all duration-300 ${ring}`} />
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t ${glow} to-transparent opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-100`} />
      <div className="pointer-events-none absolute inset-x-4 -bottom-6 h-12 rounded-full bg-white/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20" />
    </>
  );
}

export function PosterCard({ item, showRating = false, dateField = "watched_at", accentColor = "yellow" }) {
  const [err, setErr] = useState(false);
  const src = tmdbImg(item.poster_path, "w185");
  const { border, text, ring, shadow, glow } = ACCENT[accentColor] || ACCENT.yellow;
  return (
    <Link href={item.detailsHref || "#"} className="group relative block w-28 flex-shrink-0" title={item.title}>
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl border border-white/5 bg-zinc-800 shadow-lg shadow-black/25 ${border} ${shadow} transition-all duration-300`}>
        {src && !err ? (
          <img src={src} alt={item.title} className="w-full h-full object-cover grayscale-[18%] transition-[filter] duration-500 transform-none group-hover:transform-none group-hover:grayscale-0" style={{ transform: "none" }} onError={() => setErr(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
            {item.type === "movie" ? <Film className="h-8 w-8" /> : <Tv className="h-8 w-8" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-70 transition duration-300 group-hover:opacity-85" />
        <CardLight glow={glow} ring={ring} />
        {showRating && item.rating && (
          <div className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white shadow-lg" style={{ background: starColor(item.rating) }}>
            {item.rating}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="truncate text-xs font-bold leading-tight text-white">{item.title}</p>
          <p className={`text-[10px] font-medium ${text}`}>
            {fmtShort(item[dateField])}{item.episode ? ` · T${item.episode.season}:E${item.episode.number}` : ""}
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
  const href = tmdbId ? `/details/${type === "movie" ? "movie" : "tv"}/${tmdbId}` : "#";
  const { border, text, ring, shadow, glow } = ACCENT[accentColor] || ACCENT.yellow;

  return (
    <Link href={href} className="group relative block" title={title}>
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl border border-white/5 bg-zinc-800 shadow-lg shadow-black/25 ${border} ${shadow} transition-all duration-300`}>
        {src ? (
          <img src={src} alt={title} loading="lazy" decoding="async" className="w-full h-full object-cover grayscale-[18%] transition-[filter] duration-500 transform-none group-hover:transform-none group-hover:grayscale-0" style={{ transform: "none" }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
            {type === "movie" ? <Film className="h-9 w-9 opacity-60" /> : <Tv className="h-9 w-9 opacity-60" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-70 transition duration-300 group-hover:opacity-85" />
        <CardLight glow={glow} ring={ring} />
        <div className="absolute top-1.5 left-1.5">
          <span className="rounded-md border border-yellow-500/30 bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-yellow-300 shadow-sm backdrop-blur-md">#{rank}</span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="line-clamp-2 text-xs font-bold leading-tight text-white">{title}</p>
          <p className={`text-[10px] font-medium ${text}`}>{plays.toLocaleString("es-ES")} vistas</p>
        </div>
      </div>
    </Link>
  );
}

export function WatchlistCard({ item }) {
  const src = tmdbImg(item.poster_path, "w342");
  const typeLabel = item.type === "movie" ? "Película" : "Serie";
  return (
    <Link href={item.detailsHref || "#"} className="group relative block" title={item.title}>
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl border border-white/5 bg-zinc-800 shadow-lg shadow-black/25 ${ACCENT.indigo.border} ${ACCENT.indigo.shadow} transition-all duration-300`}>
        {src ? (
          <img src={src} alt={item.title} className="w-full h-full object-cover transition-[filter] duration-500 transform-none group-hover:transform-none" style={{ transform: "none" }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
            {item.type === "movie" ? <Film className="h-8 w-8" /> : <Tv className="h-8 w-8" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-70 transition duration-300 group-hover:opacity-85" />
        <CardLight glow={ACCENT.indigo.glow} ring={ACCENT.indigo.ring} />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="truncate text-xs font-bold leading-tight text-white">{item.title}</p>
          <p className="text-[10px] font-medium text-indigo-400">{item.year} · {typeLabel}</p>
        </div>
      </div>
    </Link>
  );
}

export function PersonCard({ person, accentColor = "yellow" }) {
  const src = person.profile_path ? `https://image.tmdb.org/t/p/w342${person.profile_path}` : null;
  const { border, text, ring, shadow, glow } = ACCENT[accentColor] || ACCENT.yellow;
  return (
    <Link href={`/details/person/${person.id}`} className="group relative">
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl border border-white/5 bg-zinc-800 shadow-lg shadow-black/25 ${border} ${shadow} transition-all duration-300`}>
        {src ? (
          <img src={src} alt={person.name} className="w-full h-full object-cover transition-[filter] duration-500 transform-none group-hover:transform-none" style={{ transform: "none" }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
            {accentColor === "rose" ? <Film className="w-8 h-8" /> : <Users className="w-8 h-8" />}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-70 transition duration-300 group-hover:opacity-85" />
        <CardLight glow={glow} ring={ring} />
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="text-white text-xs font-bold leading-tight truncate">{person.name}</p>
          <p className={`${text} text-[10px] font-medium`}>{person.count} pelis</p>
        </div>
      </div>
    </Link>
  );
}
