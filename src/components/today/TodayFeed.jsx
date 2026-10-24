"use client";

// src/components/today/TodayFeed.jsx
// Columna central de Hoy: lo que ha hecho la gente, agrupado por título (por
// defecto), por persona o por franja horaria. El selector es un control
// segmentado y no un desplegable: tres opciones caben siempre a la vista.

import { Clock3, Film, MessageSquare, Play, Star, Users } from "lucide-react";

import Stars from "@/components/social/Stars";
import { relativeTime } from "@/lib/notifications/alerts";
import {
  AvatarStack,
  PersonName,
  Poster,
  TitleLink,
  UserAvatar,
} from "./TodayParts";
import {
  ACTIVE_PILL,
  CARD_GLASS,
  CONTROL_GLASS,
  actionPhrase,
  clockTime,
  dayHeading,
  displayName,
  milestoneLabel,
} from "./todayUi";

export const GROUP_OPTIONS = [
  { value: "title", label: "Por título", icon: Film },
  { value: "person", label: "Por persona", icon: Users },
  { value: "time", label: "Por hora", icon: Clock3 },
];

export function GroupSelector({ value, onChange }) {
  return (
    <div role="tablist" aria-label="Agrupar" className={`flex h-10 items-center rounded-2xl p-1 ${CONTROL_GLASS}`}>
      {GROUP_OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            title={label}
            className={`flex h-full flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors ${
              active ? ACTIVE_PILL : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden whitespace-nowrap sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActionIcon({ action }) {
  if (action.kind === "comment") return <MessageSquare className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />;
  if (action.kind === "rating") return <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />;
  return <Play className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />;
}

function ActionLine({ action, onOpenPerson, withTitle = false }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5"><ActionIcon action={action} /></span>
      <span className="min-w-0 flex-1 text-zinc-300">
        <PersonName user={action.user} onOpenPerson={onOpenPerson} /> {actionPhrase(action)}
        {withTitle ? (
          <>
            {" "}
            <TitleLink media={action.media} className="font-bold text-white hover:underline">{action.media.title}</TitleLink>
          </>
        ) : null}
        {action.rating != null ? (
          <span className="ml-1.5 inline-flex translate-y-[2px] items-center gap-1">
            <Stars rating={action.rating} iconClassName="h-3 w-3" />
          </span>
        ) : null}
        {action.kind === "comment" ? (
          <span className={`mt-0.5 block line-clamp-2 text-zinc-400 ${action.comment.spoiler ? "blur-[3px] hover:blur-none" : ""}`}>
            “{action.comment.body}”
          </span>
        ) : null}
        <span className="ml-1 text-xs text-zinc-500">· {relativeTime(action.activityAt)}</span>
      </span>
    </li>
  );
}

function TitleTile({ story, onOpenStory, onOpenPerson }) {
  const visible = story.actions.slice(0, 3);
  const rest = story.actions.length - visible.length;
  return (
    <article className={`flex gap-3 rounded-2xl p-3 ${CARD_GLASS}`}>
      <TitleLink media={story.media} className="shrink-0">
        <Poster media={story.media} className="h-[120px] w-[80px] rounded-xl" />
      </TitleLink>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {story.milestone ? (
              <span className="text-[11px] font-bold uppercase tracking-wider text-pink-300">{milestoneLabel(story.milestone)}</span>
            ) : null}
            <TitleLink media={story.media} className="block truncate text-base font-bold text-white hover:underline">
              {story.media.title}
            </TitleLink>
          </div>
          <button
            type="button"
            onClick={onOpenStory}
            aria-label={`Ver historia de ${story.media.title}`}
            className="shrink-0 rounded-full p-[2px] bg-gradient-to-tr from-amber-400 via-pink-500 to-fuchsia-600"
          >
            <span className="block rounded-full bg-black p-[2px]">
              <AvatarStack users={story.users} max={1} size="h-7 w-7" />
            </span>
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
          <span>{story.users.length} {story.users.length === 1 ? "persona" : "personas"}</span>
          {story.averageRating != null ? (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <Star className="h-3 w-3 fill-current" aria-hidden="true" /> {story.averageRating}
            </span>
          ) : null}
        </div>
        <ul className="mt-2 space-y-1.5">
          {visible.map((action) => (
            <ActionLine key={action.key} action={action} onOpenPerson={onOpenPerson} />
          ))}
        </ul>
        {rest > 0 ? (
          <button type="button" onClick={onOpenStory} className="mt-1.5 text-xs font-bold text-pink-300 hover:text-pink-200">
            y {rest} más
          </button>
        ) : null}
      </div>
    </article>
  );
}

function PersonTile({ group, onOpenPerson }) {
  const titles = [...new Map(group.actions.map((a) => [`${a.media.type}:${a.media.tmdbId}`, a.media])).values()];
  return (
    <article className={`rounded-2xl p-3 ${CARD_GLASS}`}>
      <button
        type="button"
        onClick={() => onOpenPerson(group.user)}
        className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 rounded-xl"
      >
        <UserAvatar user={group.user} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-white">{displayName(group.user)}</span>
          <span className="block text-xs text-zinc-500">
            {group.actions.length} {group.actions.length === 1 ? "historia" : "historias"} · {relativeTime(group.latestAt)}
          </span>
        </span>
      </button>
      <ol className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]" data-mobile-page-swipe-ignore>
        {titles.slice(0, 8).map((media) => (
          <li key={`${media.type}:${media.tmdbId}`} className="shrink-0">
            <TitleLink media={media} title={media.title}>
              <Poster media={media} size="w154" className="h-[84px] w-[56px] rounded-lg" />
            </TitleLink>
          </li>
        ))}
      </ol>
      <ul className="mt-3 space-y-1.5">
        {group.actions.slice(0, 3).map((action) => (
          <ActionLine key={action.key} action={{ ...action, user: group.user }} onOpenPerson={onOpenPerson} withTitle />
        ))}
      </ul>
    </article>
  );
}

function Timeline({ sections, tz, onOpenPerson }) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.label}>
          <h3 className="mb-2 flex items-baseline gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
            {section.label}
            {section.showDay ? <span className="normal-case tracking-normal text-zinc-500">{dayHeading(section.day)}</span> : null}
            <span className="text-zinc-600">· {section.actions.length}</span>
          </h3>
          <ol className={`divide-y divide-white/5 rounded-2xl ${CARD_GLASS}`}>
            {section.actions.map((action) => (
              <li key={action.key} className="flex items-center gap-3 p-3">
                <span className="w-11 shrink-0 text-xs tabular-nums text-zinc-500">{clockTime(action.activityAt, tz)}</span>
                <UserAvatar user={action.user} className="h-8 w-8" />
                <span className="min-w-0 flex-1 text-sm text-zinc-300">
                  <PersonName user={action.user} onOpenPerson={onOpenPerson} /> {actionPhrase(action)}{" "}
                  <TitleLink media={action.media} className="font-bold text-white hover:underline">{action.media.title}</TitleLink>
                  {action.rating != null ? <span className="ml-1 text-amber-300">· {action.rating}/10</span> : null}
                </span>
                <TitleLink media={action.media} className="shrink-0">
                  <Poster media={action.media} size="w92" className="h-[54px] w-[36px] rounded-md" />
                </TitleLink>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default function TodayFeed({ group, stories, people, sections, tz, onOpenStory, onOpenPerson }) {
  if (group === "person") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {people.map((entry) => (
          <PersonTile key={entry.key} group={entry} onOpenPerson={onOpenPerson} />
        ))}
      </div>
    );
  }
  if (group === "time") return <Timeline sections={sections} tz={tz} onOpenPerson={onOpenPerson} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      {stories.map((story) => (
        <TitleTile
          key={story.key}
          story={story}
          onOpenStory={() => onOpenStory(story.key)}
          onOpenPerson={onOpenPerson}
        />
      ))}
    </div>
  );
}
