"use client";

// Filas de la vista lateral de las secciones (SectionSheet): una por tipo de
// contenido, todas en el mismo formato de lista de arriba abajo.

import { useState } from "react";
import Link from "next/link";
import { ImageOff, ListVideo, Music2, Play, ThumbsUp, User } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import { getSoundtrackSourceBadge } from "@/lib/details/soundtrackSource";
import { videoThumbUrl } from "@/lib/details/videos";

const ROW_BASE = "flex items-center rounded-2xl bg-black/15 transition-colors";
const ROW = `${ROW_BASE} gap-3.5 p-2.5`;
const LINK_STATES = "hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400";
const ROW_LINK = `${ROW} ${LINK_STATES}`;
// Personas y títulos: compacto hasta Full HD; más amplio en monitores grandes.
const ROW_LINK_LARGE = `${ROW_BASE} gap-3 p-2.5 min-[1920px]:gap-4 min-[1920px]:p-3 ${LINK_STATES}`;
const LARGE_POSTER = "aspect-[2/3] w-16 min-[1920px]:w-20 rounded-xl";

function tmdbImage(path, size) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function Poster({ src, alt = "", className = "", icon: Icon = ImageOff, loading = false, onError }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = failedSrc === src;
  const showFallback = !src || failed;

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-zinc-900 ${className}`}>
      {loading ? (
        <span className="h-full w-full animate-pulse bg-zinc-900" aria-hidden="true" />
      ) : showFallback ? (
        <Icon className="h-5 w-5 text-zinc-600" aria-hidden="true" />
      ) : (
        <OptimizedImage
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => {
            setFailedSrc(src);
            onError?.();
          }}
        />
      )}
    </span>
  );
}

/** Persona del reparto o del equipo: foto, nombre, papel y episodios. */
export function PersonRow({ person, role, episodes = null, badge = null, title = undefined, onNavigate }) {
  const tag = badge || (episodes ? `${episodes} ep.` : null);
  return (
    <Link href={`/details/person/${person.id}`} onClick={onNavigate} title={title} className={ROW_LINK_LARGE}>
      <Poster
        src={tmdbImage(person.profile_path, "w342")}
        className={LARGE_POSTER}
        icon={User}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold leading-tight text-white min-[1920px]:text-base">{person.name}</span>
        {role ? <span className="mt-1 block line-clamp-2 text-xs text-zinc-400 min-[1920px]:text-sm">{role}</span> : null}
        {tag ? (
          <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-zinc-200 min-[1920px]:px-2.5 min-[1920px]:text-xs">
            {tag}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** Película o serie (recomendaciones, colección, listas): póster, título, año, tipo y nota. */
export function TitleRow({
  item,
  mediaType,
  href,
  onNavigate,
  onOpenTitle,
  onClick,
  showImdb = false,
  imdbRating = null,
  imdbLoading = false,
  posterPath = null,
  posterLoading = false,
  onPosterError = null,
  title: customTitle,
  year: customYear,
  voteAverage: customVoteAverage,
  action = null,
  // Línea extra bajo año y tipo (p. ej. el papel de un actor: «como Walter White»).
  detail = null,
  className = "",
}) {
  const type = item?.media_type === "tv" || mediaType === "tv" ? "tv" : "movie";
  const title = customTitle || item?.title || item?.name || "Sin título";
  const year =
    customYear !== undefined
      ? customYear
      : String(item?.release_date || item?.first_air_date || "").slice(0, 4);
  const rawVoteAverage =
    customVoteAverage !== undefined ? customVoteAverage : item?.vote_average;
  const rating = Number(rawVoteAverage) > 0 ? Number(rawVoteAverage) : null;
  const imdbScore = Number(imdbRating);
  const hasImdbScore = Number.isFinite(imdbScore) && imdbScore > 0 && imdbScore <= 10;
  // Solo con nota (o mientras se carga, «…»): sin nota en IMDb no se pinta
  // ni el logo ni «—».
  const shouldShowImdb = hasImdbScore || (showImdb && imdbLoading);

  const targetHref = href || (item?.id ? `/details/${type}/${item.id}` : "#");

  const resolvedPosterPath =
    posterPath !== null && posterPath !== undefined
      ? posterPath
      : item?.poster_path;
  const posterSrc = resolvedPosterPath
    ? resolvedPosterPath.startsWith("http")
      ? resolvedPosterPath
      : tmdbImage(resolvedPosterPath, "w342")
    : null;

  const rowLink = (
    <Link
      href={targetHref}
      onClick={(event) => {
        if (onClick) {
          onClick(event);
          return;
        }
        if (
          onOpenTitle &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0
        ) {
          event.preventDefault();
          onNavigate?.();
          onOpenTitle({ ...item, media_type: type });
        } else if (!onOpenTitle) {
          onNavigate?.();
        }
      }}
      className={`${ROW_LINK_LARGE} ${action ? "pr-14" : ""} ${className}`}
    >
      <Poster
        src={posterSrc}
        alt=""
        className={LARGE_POSTER}
        loading={posterLoading}
        onError={onPosterError}
      />
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-sm font-bold leading-tight text-white min-[1920px]:text-base">
          {title}
        </span>
        <span className="mt-1 block text-xs font-bold text-zinc-400 min-[1920px]:text-sm">
          {[year, type === "tv" ? "Serie" : "Película"].filter(Boolean).join(" · ")}
        </span>
        {detail ? (
          <span className="mt-1 block line-clamp-2 text-xs text-zinc-400 min-[1920px]:text-sm">{detail}</span>
        ) : null}
        {rating != null || shouldShowImdb ? (
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-bold tabular-nums text-white min-[1920px]:gap-x-4 min-[1920px]:text-sm">
            {rating != null ? (
              <span className="inline-flex items-center gap-1.5">
                <OptimizedImage
                  src="/logo-TMDb.png"
                  alt="TMDb"
                  className="h-3.5 w-auto"
                />
                {rating.toFixed(1)}
                <span className="sr-only"> sobre 10</span>
              </span>
            ) : null}
            {shouldShowImdb ? (
              <span className="inline-flex items-center gap-1.5">
                <OptimizedImage
                  src="/logo-IMDb.svg"
                  alt="IMDb"
                  className="h-3.5 w-auto"
                />
                {hasImdbScore ? (
                  <>
                    {imdbScore.toFixed(1)}
                    <span className="sr-only"> sobre 10</span>
                  </>
                ) : (
                  <span className="text-zinc-500">
                    <span aria-hidden="true">{imdbLoading ? "…" : "—"}</span>
                    <span className="sr-only">
                      {imdbLoading
                        ? "Cargando puntuación"
                        : "Puntuación no disponible"}
                    </span>
                  </span>
                )}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </Link>
  );

  if (action) {
    return (
      <div className="group relative">
        {rowLink}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
          {action}
        </div>
      </div>
    );
  }

  return rowLink;
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
      {/* Solo título y la fila de autor · títulos · likes (sin descripción):
          el título, más grande, ocupa el hueco que dejaba la descripción. */}
      <span className="min-w-0 flex-1">
        <span className="block line-clamp-2 text-[15px] font-bold leading-snug text-white sm:text-base">{name}</span>
        <span className="mt-2 flex items-center gap-2 text-xs font-bold text-zinc-400">
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
