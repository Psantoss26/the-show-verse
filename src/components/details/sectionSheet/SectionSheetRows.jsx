"use client";

// Filas de la vista lateral de las secciones (SectionSheet): una por tipo de
// contenido, todas en el mismo formato de lista de arriba abajo.

import Link from "next/link";
import { ImageOff, ListVideo, Music2, Play, ThumbsUp, User } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import { getSoundtrackSourceBadge } from "@/lib/details/soundtrackSource";
import { videoThumbUrl } from "@/lib/details/videos";
import { stripHtml } from "@/lib/details/formatters";

const ROW = "flex items-center gap-3.5 rounded-2xl bg-black/15 p-2.5 transition-colors";
const ROW_LINK = `${ROW} hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400`;

function tmdbImage(path, size) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function Poster({ src, alt = "", className = "", icon: Icon = ImageOff }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-zinc-900 ${className}`}>
      {src ? (
        <OptimizedImage src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <Icon className="h-5 w-5 text-zinc-600" aria-hidden="true" />
      )}
    </span>
  );
}

/** Persona del reparto o del equipo: foto, nombre, papel y episodios. */
export function PersonRow({ person, role, episodes = null, onNavigate }) {
  return (
    <Link href={`/details/person/${person.id}`} onClick={onNavigate} className={ROW_LINK}>
      <Poster
        src={tmdbImage(person.profile_path, "w185")}
        className="aspect-[2/3] w-14 rounded-xl"
        icon={User}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">{person.name}</span>
        {role ? <span className="mt-0.5 block line-clamp-2 text-xs text-zinc-400">{role}</span> : null}
        {episodes ? (
          <span className="mt-1.5 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200">
            {episodes} ep.
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Película o serie (recomendaciones, colección): póster, título, año, tipo y nota. */
export function TitleRow({ item, mediaType, onNavigate, showImdb = false, imdbRating = null, imdbLoading = false }) {
  const type = item?.media_type === "tv" || mediaType === "tv" ? "tv" : "movie";
  const title = item?.title || item?.name || "Sin título";
  const year = String(item?.release_date || item?.first_air_date || "").slice(0, 4);
  const rating = Number(item?.vote_average) > 0 ? Number(item.vote_average) : null;
  const imdbScore = Number(imdbRating);
  const hasImdbScore = Number.isFinite(imdbScore) && imdbScore > 0 && imdbScore <= 10;
  return (
    <Link href={`/details/${type}/${item.id}`} onClick={onNavigate} className={ROW_LINK}>
      <Poster src={tmdbImage(item?.poster_path, "w185")} alt="" className="aspect-[2/3] w-14 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-sm font-bold leading-tight text-white">{title}</span>
        <span className="mt-1 block text-xs font-bold text-zinc-400">
          {[year, type === "tv" ? "Serie" : "Película"].filter(Boolean).join(" · ")}
        </span>
        {rating != null || showImdb ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold tabular-nums text-white">
            {rating != null ? (
              <span className="inline-flex items-center gap-1.5">
                <OptimizedImage src="/logo-TMDb.png" alt="TMDb" className="h-3 w-auto" />
                {rating.toFixed(1)}<span className="sr-only"> sobre 10</span>
              </span>
            ) : null}
            {showImdb ? (
              <span className="inline-flex items-center gap-1.5">
                <OptimizedImage src="/logo-IMDb.svg" alt="IMDb" className="h-3 w-auto" />
                {hasImdbScore ? (
                  <>{imdbScore.toFixed(1)}<span className="sr-only"> sobre 10</span></>
                ) : (
                  <span className="text-zinc-500">
                    <span aria-hidden="true">{imdbLoading ? "…" : "—"}</span>
                    <span className="sr-only">{imdbLoading ? "Cargando puntuación" : "Puntuación no disponible"}</span>
                  </span>
                )}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

const VIDEO_TYPES = {
  Trailer: "Tráiler",
  Teaser: "Teaser",
  Clip: "Clip",
  Featurette: "Featurette",
  "Behind the Scenes": "Detrás de las cámaras",
  Bloopers: "Tomas falsas",
  "Opening Credits": "Créditos iniciales",
  Recap: "Resumen",
};

/** Vídeo: miniatura, nombre, tipo y fecha; abre el reproductor de la ficha. */
export function VideoRow({ video, onPlay }) {
  const date = video?.published_at ? new Date(video.published_at) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
      : null;
  return (
    <button type="button" onClick={() => onPlay?.(video)} className={`${ROW_LINK} w-full text-left`}>
      <span className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
        {videoThumbUrl(video) ? (
          <OptimizedImage src={videoThumbUrl(video)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55">
            <Play className="h-4 w-4 fill-white text-white" aria-hidden="true" />
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-sm font-bold leading-tight text-white">{video?.name || "Vídeo"}</span>
        <span className="mt-1 block text-xs font-bold text-zinc-400">
          {[VIDEO_TYPES[video?.type] || video?.type, dateLabel].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}

/** Pista del soundtrack: portada, título, artista, álbum y fuente; abre el reproductor. */
export function TrackRow({ track, onPlay }) {
  const badge = getSoundtrackSourceBadge(track?.source);
  return (
    <button type="button" onClick={() => onPlay?.(track)} className={`${ROW_LINK} w-full text-left`}>
      <Poster src={track?.artworkUrl || null} className="aspect-square w-14 rounded-xl" icon={Music2} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">{track?.trackName || "Pista"}</span>
        <span className="mt-0.5 block truncate text-xs text-zinc-400">{track?.artistName}</span>
        <span className="mt-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className={`inline-flex items-center gap-1.5 ${badge.textClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} />
            {badge.label}
          </span>
          {track?.collectionName ? (
            <span className="truncate normal-case tracking-normal text-zinc-500">{track.collectionName}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** Lista de la comunidad: portadas, nombre, autor, títulos y me gusta. */
export function ListRow({ row, onNavigate }) {
  const list = row?.list || row || {};
  const user = row?.user || list?.user || {};
  const previews = Array.isArray(row?.previewPosters) ? row.previewPosters.slice(0, 3) : [];
  const name = list?.name || "Lista";
  const itemCount = Number(list?.item_count || list?.items || 0);
  const likes = Number(list?.likes || 0);
  const username = user?.username || user?.name || null;
  const href = list?.id ? `/lists/community/${encodeURIComponent(String(list.id))}` : null;
  const content = (
    <>
      <span className="relative flex h-[4.5rem] w-20 shrink-0 items-center justify-center">
        {previews.length ? (
          previews.map((src, index) => (
            <span
              key={src}
              className="absolute top-0 aspect-[2/3] h-[4.5rem] overflow-hidden rounded-lg bg-zinc-900 shadow-lg shadow-black/50 ring-1 ring-black/40"
              style={{ left: `${index * 0.75}rem`, zIndex: previews.length - index }}
            >
              <OptimizedImage src={src} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </span>
          ))
        ) : (
          <ListVideo className="h-8 w-8 text-zinc-600" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-sm font-bold leading-tight text-white">{name}</span>
        {list?.description ? (
          <span className="mt-0.5 block line-clamp-1 text-xs text-zinc-500">{stripHtml(list.description)}</span>
        ) : null}
        <span className="mt-1.5 flex items-center gap-2 text-xs font-bold text-zinc-400">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[9px] font-black text-white">
            <Avatar src={user?.images?.avatar?.full || null} name={username || "user"} />
          </span>
          <span className="truncate">{username || "—"}</span>
          <span className="shrink-0 text-zinc-500">· {itemCount} títulos</span>
          <span className="flex shrink-0 items-center gap-1 text-zinc-500">
            <ThumbsUp className="h-3 w-3" aria-hidden="true" />
            {likes}
          </span>
        </span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} onClick={onNavigate} className={ROW_LINK}>
      {content}
    </Link>
  ) : (
    <div className={ROW}>{content}</div>
  );
}
