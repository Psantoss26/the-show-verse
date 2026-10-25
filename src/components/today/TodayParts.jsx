"use client";

// src/components/today/TodayParts.jsx
// Bloques de Hoy (Social): carril de historias,
// historia destacada, destacados, «Para ti» y los más activos. La agrupación
// del feed vive en TodayFeed y el reproductor en TodayStoryViewer.

import Link from "next/link";
import {
  Flame,
  ImageOff,
  MessageSquare,
  Play,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import Stars from "@/components/social/Stars";
import FollowButton from "@/components/social/FollowButton";
import usePreviewOpen from "@/components/preview/usePreviewOpen";
import { hasUnseenFrames } from "@/lib/today/seenStories";
import { relativeTime } from "@/lib/notifications/alerts";
import {
  CARD_GLASS,
  actionPhrase,
  displayName,
  episodeLabel,
  milestoneLabel,
  profileHref,
  titleHref,
  tmdbImage,
} from "./todayUi";

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

export function AvatarStack({ users, max = 4, size = "h-7 w-7" }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center -space-x-2">
      {shown.map((user) => (
        <UserAvatar key={user.id} user={user} className={size} ring="ring-2 ring-black" />
      ))}
      {rest > 0 ? (
        <span className={`inline-flex items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-300 ring-2 ring-black ${size}`}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export function Poster({ media, className = "", size = "w185" }) {
  const src = tmdbImage(media?.posterPath, size);
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
                <span className="w-full truncate text-center text-[11px] text-zinc-300">
                  {group.kind === "for-you" ? "Para ti" : group.media?.title}
                </span>
                {people.length > 1 ? (
                  <span className="-mt-1 text-[10px] text-zinc-500">{people.length} personas</span>
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
// Historia destacada
// ─────────────────────────────────────────────

export function TodayHero({ story, onPlay, onOpenPerson }) {
  if (!story) return null;
  const backdrop = tmdbImage(story.media.backdropPath, "w1280");
  // La frase cuenta lo que dio el hito (el final visto), no lo último que pasó.
  const latest = story.actions.find((a) => story.milestone && a.milestone === story.milestone) || story.actions[0];
  const label = story.milestone ? milestoneLabel(story.milestone) : story.users.length > 1 ? "Lo más comentado" : "Lo último";
  return (
    <article className="relative overflow-hidden rounded-3xl bg-zinc-950 shadow-2xl">
      <div className="relative aspect-[16/10] w-full sm:aspect-[16/8]">
        {backdrop ? (
          <OptimizedImage src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Poster media={story.media} size="w500" className="absolute inset-0 h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {label}
        </span>
        <TitleLink media={story.media} className="mt-2 block text-2xl font-bold leading-tight text-white hover:underline sm:text-4xl">
          {story.media.title}
        </TitleLink>
        <p className="mt-1.5 line-clamp-2 text-sm text-zinc-300">
          <PersonName user={latest.user} onOpenPerson={onOpenPerson} /> {actionPhrase(latest)}
          {story.users.length > 1 ? ` · y ${story.users.length - 1} más` : ""}
          {story.averageRating != null ? ` · media ${story.averageRating}/10` : ""}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <AvatarStack users={story.users} />
          <button
            type="button"
            onClick={onPlay}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Ver todo
          </button>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────
// Destacados (reseña y nota)
// ─────────────────────────────────────────────

export function TodayHighlightCard({ action, onOpenPerson }) {
  const isComment = action.kind === "comment";
  return (
    <article className={`flex gap-3 rounded-2xl p-3 ${CARD_GLASS}`}>
      <TitleLink media={action.media} className="shrink-0">
        <Poster media={action.media} className="h-[96px] w-[64px] rounded-lg" />
      </TitleLink>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {isComment ? (
            <MessageSquare className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
          ) : (
            <Star className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          )}
          <span>{isComment ? "Reseña destacada" : "Nota destacada"}</span>
        </div>
        <TitleLink media={action.media} className="mt-0.5 block truncate text-sm font-bold text-white hover:underline">
          {action.media.title}
        </TitleLink>
        {isComment ? (
          <p className="mt-1 line-clamp-3 text-sm text-zinc-300">“{action.comment.body}”</p>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <Stars rating={action.rating} />
            <span className="text-sm font-bold tabular-nums text-white">{action.rating}/10</span>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <UserAvatar user={action.user} className="h-5 w-5" />
          <PersonName user={action.user} onOpenPerson={onOpenPerson} />
          <span>· {relativeTime(action.activityAt)}</span>
        </div>
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
    <section aria-labelledby="today-for-you" className="mt-6">
      <h2 id="today-for-you" className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-300">
        <Sparkles className="h-4 w-4 text-pink-400" aria-hidden="true" /> Para ti
      </h2>
      <ol className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0" data-mobile-page-swipe-ignore>
        {items.map((item) => (
          <li key={item.key} className="w-[120px] shrink-0">
            <TitleLink media={item.media} className="group block">
              <Poster media={item.media} className="aspect-[2/3] w-full rounded-xl transition-transform group-hover:scale-[1.02]" />
              <span className="mt-1.5 block truncate text-xs font-bold text-white">{item.media.title}</span>
              <span className="block truncate text-[11px] text-pink-300">
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

export function TodayMostActive({ ranking, scope, viewerId, followingSet, onOpenPerson }) {
  if (!ranking.length) return null;
  return (
    <section aria-labelledby="today-most-active" className={`rounded-3xl p-4 ${CARD_GLASS}`}>
      <h2 id="today-most-active" className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-zinc-300">
        <Trophy className="h-4 w-4 text-amber-400" aria-hidden="true" /> Más activos
      </h2>
      <ol className="space-y-3">
        {ranking.map((entry) => (
          <li key={entry.key} className="flex items-center gap-3">
            <span className="w-4 text-center text-sm font-bold tabular-nums text-zinc-500">{entry.rank}</span>
            <button
              type="button"
              onClick={() => onOpenPerson(entry.user)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
            >
              <UserAvatar user={entry.user} className="h-9 w-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{displayName(entry.user)}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full origin-left rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500"
                    style={{ transform: `scaleX(${entry.share})` }}
                  />
                </span>
                <span className="mt-0.5 block text-[11px] text-zinc-500">
                  {entry.count} {entry.count === 1 ? "historia" : "historias"} · {entry.titles} {entry.titles === 1 ? "título" : "títulos"}
                </span>
              </span>
            </button>
            {scope === "community" && entry.user.id !== viewerId && entry.user.username ? (
              <FollowButton username={entry.user.username} initialFollowing={followingSet?.has(entry.user.id)} size="sm" bordered={false} />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export { PersonName, profileHref };
