"use client";

// src/components/today/TodayParts.jsx
// Bloques de Hoy (Social): carril de historias,
// historia destacada, destacados, «Para ti» y los más activos. La agrupación
// del feed vive en TodayFeed y el reproductor en TodayStoryViewer.

import Link from "next/link";
import { ImageOff, MessageSquare, Play, Star } from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import { hasUnseenFrames } from "@/lib/today/seenStories";
import { summarizeActions } from "@/lib/today/stories";
import {
  CARD_SURFACE,
  displayName,
  episodeLabel,
  milestoneLabel,
  profileHref,
  ratingTen,
  titleHref,
  tmdbImage,
  whenLabel,
} from "./todayUi";
import useOwnCardPoster from "@/lib/hooks/useOwnCardPoster";

export function previewItem(media) {
  return {
    id: media.tmdbId,
    tmdbId: media.tmdbId,
    title: media.title,
    name: media.title,
    poster_path: media.posterPath,
    backdrop_path: media.backdropPath,
  };
}

/** Avatar redondo con la inicial de respaldo. */
export function UserAvatar({ user, className = "h-8 w-8", ring = "" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-xs font-bold text-zinc-200 ${ring} ${className}`}
    >
      <Avatar src={user?.avatarUrl} name={displayName(user)} alt="" />
    </span>
  );
}

// Caras montadas una sobre otra SIN aro: cada una recorta con una máscara el
// hueco donde se apoya la siguiente (el AvatarStack «cutout» de Trakt, como la
// píldora del navbar). El solape es el de `-space-x-2` (8 px) y el hueco, 2 px;
// la máscara va en porcentajes para servir a cualquier tamaño de cara.
const STACK_CUTOUT = "radial-gradient(calc(50% + 2px) calc(50% + 2px) at calc(150% - 8px) 50%, transparent 98%, #000 100%)";
const stackCutoutStyle = (last) => (last ? undefined : { WebkitMaskImage: STACK_CUTOUT, maskImage: STACK_CUTOUT });

export function AvatarStack({ users, max = 4, size = "h-7 w-7" }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((user, index) => (
        <span key={user.id} className="inline-flex" style={stackCutoutStyle(index === shown.length - 1 && rest <= 0)}>
          <UserAvatar user={user} className={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span className={`inline-flex items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300 ${size}`}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export function Poster({ media, className = "", size = "w185" }) {
  // Portada elegida en la ficha o, sin ella, la más votada.
  const cardPoster = useOwnCardPoster(media?.type === "tv" ? "tv" : "movie", media?.tmdbId);
  const src = tmdbImage(cardPoster || media?.posterPath, size);
  return (
    <span className={`block overflow-hidden bg-zinc-900 ${className}`}>
      {src ? (
        <OptimizedImage src={src} alt={media?.title || ""} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-zinc-700">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** Enlace al título que abre la ficha rápida (DetailModal) en un clic normal. */
export function TitleLink({ media, className = "", children, ...props }) {
  const previewClick = usePreviewOpen();
  const href = titleHref(media);
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={previewClick(previewItem(media), { mediaType: media.type })}
      className={className}
      {...props}
    >
      {children}
    </Link>
  );
}

function PersonName({ user, onOpenPerson }) {
  return (
    <button
      type="button"
      onClick={() => onOpenPerson?.(user)}
      className="font-bold text-white hover:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 rounded"
    >
      {displayName(user)}
    </button>
  );
}

// ─────────────────────────────────────────────
// Carril de historias (círculos estilo Instagram)
// ─────────────────────────────────────────────

export function StoryRail({ groups, seen, onOpen }) {
  if (!groups.length) return null;
  return (
    <section aria-label="Historias" className="-mx-4 mb-6 sm:mx-0" data-mobile-page-swipe-ignore>
      <ol className="flex gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none] sm:px-0">
        {groups.map((group, index) => {
          const unseen = hasUnseenFrames(group, seen);
          const people = group.story?.users || [];
          return (
            <li key={group.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onOpen(index)}
                className="group flex w-[76px] flex-col items-center gap-1.5 focus-visible:outline-none"
                aria-label={`Ver historia de ${group.kind === "for-you" ? "Para ti" : group.media?.title}`}
              >
                <span
                  className={`rounded-full p-[2.5px] transition-transform group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-pink-400 ${
                    unseen ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-fuchsia-600" : "bg-zinc-700"
                  }`}
                >
                  <span className="block rounded-full bg-black p-[2px]">
                    <Poster media={group.media} size="w154" className="h-[64px] w-[64px] rounded-full" />
                  </span>
                </span>
                <span className="w-full truncate text-center text-xs text-zinc-300">
                  {group.kind === "for-you" ? "Para ti" : group.media?.title}
                </span>
                {people.length > 1 ? (
                  <span className="-mt-1 text-xs text-zinc-500">{people.length} personas</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─────────────────────────────────────────────
// Cabeceras de columna
// ─────────────────────────────────────────────

/**
 * Título de cada columna de Hoy (Historia destacada · feed · Más activos), con
 * la misma letra que «Películas favoritas» del perfil (SectionHeader en
 * ProfileClient): 12 px en negrita, versalitas espaciadas y gris, con una
 * línea horizontal fina debajo. Las tres tienen la misma altura para quedar
 * alineadas arriba, y sus líneas también.
 */
export function ColumnHeading({ id, children, count, action }) {
  return (
    <div className="mb-4 flex h-9 items-center justify-between gap-3 border-b border-white/10 pb-2">
      <h2 id={id} className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
        <span className="truncate">{children}</span>
        {typeof count === "number" ? (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-xs font-bold leading-none tracking-normal tabular-nums text-zinc-300">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

/** Nota de 0 a 10 con su estrella: «9,5 ★». */
export function RatingBadge({ rating, className = "" }) {
  const value = ratingTen(rating);
  if (!value) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold leading-none tabular-nums text-white ${className}`}>
      {value}
      <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
    </span>
  );
}

function mediaKind(media) {
  return media?.type === "tv" ? "Serie" : "Película";
}

// ─────────────────────────────────────────────
// Historia destacada
// ─────────────────────────────────────────────

export function TodayHero({ story, tz, onPlay, onOpenPerson }) {
  if (!story) return null;
  const backdrop = tmdbImage(story.media.backdropPath, "w780");
  // La cara y el nombre son los de quien dio el hito (el final visto); si no
  // hay hito, los de lo último.
  const lead = story.actions.find((a) => story.milestone && a.milestone === story.milestone) || story.actions[0];
  const chip = story.milestone ? milestoneLabel(story.milestone) : mediaKind(story.media);
  return (
    <article className="relative overflow-hidden rounded-2xl bg-zinc-950">
      {backdrop ? (
        <OptimizedImage src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black" />

      <div className="relative flex flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenPerson?.(lead.user)}
            className="flex min-w-0 items-center gap-2 rounded-full text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
          >
            <UserAvatar user={lead.user} className="h-7 w-7" />
            <span className="truncate">{displayName(lead.user)}</span>
            {story.users.length > 1 ? <span className="text-zinc-400">y {story.users.length - 1} más</span> : null}
          </button>
          <span className="shrink-0 rounded-full bg-pink-500/90 px-2.5 py-1 text-xs font-bold leading-none text-white">
            {chip}
          </span>
        </div>

        <button
          type="button"
          onClick={onPlay}
          aria-label={`Reproducir la historia de ${story.media.title}`}
          className="mx-auto my-5 block w-[38%] max-w-[170px] transition-transform duration-300 hover:scale-[1.03] focus-visible:outline-none"
        >
          <Poster media={story.media} size="w342" className="aspect-[2/3] w-full rounded-xl shadow-2xl" />
        </button>

        <TitleLink media={story.media} className="block truncate text-xl font-bold text-white hover:underline">
          {story.media.title}
        </TitleLink>
        <p className="mt-1 flex items-center gap-2 text-sm text-zinc-400">
          <span className="truncate">{summarizeActions(story.actions, { people: story.users.length })}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">{whenLabel(story.latestAt, tz)}</span>
          {story.averageRating != null ? <RatingBadge rating={story.averageRating} className="ml-auto" /> : null}
        </p>
        <button
          type="button"
          onClick={onPlay}
          className="mt-4 inline-flex h-10 w-fit items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-bold text-white transition-colors hover:bg-white/15"
        >
          Reproducir historia
          <Play className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────
// Destacados (reseña y nota), en fila compacta
// ─────────────────────────────────────────────

export function TodayHighlightCard({ action, tz, onOpenPerson }) {
  const isComment = action.kind === "comment";
  return (
    <article className={`flex items-center gap-3 rounded-2xl p-2.5 ${CARD_SURFACE}`}>
      <TitleLink media={action.media} className="shrink-0">
        <Poster media={action.media} size="w154" className="aspect-[2/3] w-12 rounded-lg" />
      </TitleLink>
      <div className="min-w-0 flex-1">
        <TitleLink media={action.media} className="block truncate text-sm font-bold text-white hover:underline">
          {action.media.title}
        </TitleLink>
        {isComment ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-zinc-300">“{action.comment.body}”</p>
        ) : (
          <p className="mt-0.5 text-xs text-zinc-400 tabular-nums">{whenLabel(action.activityAt, tz)}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isComment ? (
          <MessageSquare className="h-4 w-4 text-zinc-400" aria-label="Reseña" />
        ) : (
          <RatingBadge rating={action.rating} />
        )}
        <button
          type="button"
          onClick={() => onOpenPerson?.(action.user)}
          className="flex items-center gap-2 rounded-full text-sm text-zinc-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
        >
          <span className="hidden max-w-[7rem] truncate sm:inline">{displayName(action.user)}</span>
          <UserAvatar user={action.user} className="h-7 w-7" />
        </button>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────
// Para ti
// ─────────────────────────────────────────────

const FOR_YOU_REASON = {
  new_episode: "Nuevo episodio",
  watchlist_release: "Estreno de tu lista",
};

export function TodayForYouRow({ items }) {
  if (!items?.length) return null;
  return (
    <section aria-labelledby="today-for-you" className="mt-8">
      <h3 id="today-for-you" className="mb-3 text-base font-bold text-white">Para ti</h3>
      <ol className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0" data-mobile-page-swipe-ignore>
        {items.map((item) => (
          <li key={item.key} className="w-[104px] shrink-0">
            <TitleLink media={item.media} className="group block">
              <Poster media={item.media} className="aspect-[2/3] w-full rounded-lg" />
              <span className="mt-2 block truncate text-sm text-white">{item.media.title}</span>
              <span className="block truncate text-xs text-zinc-400">
                {item.milestone ? milestoneLabel(item.milestone) : FOR_YOU_REASON[item.reason] || ""}
                {item.season != null ? ` · ${episodeLabel(item)}` : ""}
              </span>
            </TitleLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─────────────────────────────────────────────
// Más activos
// ─────────────────────────────────────────────

export function TodayMostActive({ ranking, onOpenPerson }) {
  if (!ranking.length) return null;
  return (
    <ol className={`space-y-1 rounded-2xl p-2 ${CARD_SURFACE}`}>
      {ranking.map((entry) => (
        <li key={entry.key}>
          <button
            type="button"
            onClick={() => onOpenPerson(entry.user)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
          >
            <span className="w-4 shrink-0 text-center text-xs tabular-nums text-zinc-500">{entry.rank}</span>
            <UserAvatar user={entry.user} className="h-9 w-9" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold text-white">{displayName(entry.user)}</span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                  {entry.count} {entry.count === 1 ? "historia" : "historias"}
                </span>
              </span>
              <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full origin-left rounded-full bg-pink-500"
                  style={{ transform: `scaleX(${entry.share})` }}
                />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export { PersonName, profileHref };
