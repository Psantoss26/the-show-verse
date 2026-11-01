"use client";

// src/components/today/TodayFeed.jsx
// Columna central de Hoy, como la de Trakt: una rejilla de carteles con solo la
// foto de quien lo vio arriba a la derecha y, debajo, el título con una línea
// («Visto T1 · E2 · 22:03»). Al pulsar un cartel se abre su historia.
// La agrupación (título, persona o franja horaria) y la vista (rejilla o lista,
// ListRow) se eligen en la barra de Social.

import EntranceItem, { estimateVisibleRows } from "@/components/ui/EntranceItem";
import { mediaKey, summarizeActions } from "@/lib/today/stories";
import { AvatarStack, Poster, RatingBadge, UserAvatar } from "./TodayParts";
import { CARD_SURFACE, dayHeading, displayName, milestoneLabel, whenLabel } from "./todayUi";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(124px,1fr))] sm:gap-x-4";
// Vista lista: una fila por título, con el cartel pequeño a la izquierda; cabe
// mucho más a lo alto que la rejilla.
const LIST = `divide-y divide-white/[0.06] overflow-hidden rounded-2xl ${CARD_SURFACE}`;

// Cuántas tarjetas caben en pantalla, para animar solo esas al entrar (se
// sobreestima, como en las páginas de usuario). La rejilla va en la columna
// central, que desde `lg` comparte el ancho con la destacada y los más activos.
function estimateEntrance(layout) {
  if (layout === "list") return estimateVisibleRows(64);
  if (typeof window === "undefined") return 30;
  const width = window.innerWidth >= 1024 ? window.innerWidth * 0.5 : window.innerWidth - 32;
  const columns = Math.max(2, Math.floor(width / 120));
  const tileWidth = width / columns;
  const rows = Math.ceil(window.innerHeight / (tileWidth * 1.5 + 60)) + 2;
  return Math.min(120, rows * columns);
}

function averageOf(actions) {
  const values = actions
    .map((a) => (a.kind === "rating" || a.kind === "watch" ? a.rating : null))
    .filter((v) => typeof v === "number");
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Un cartel de la rejilla. Encima solo va la foto de quien lo vio (`users`):
 * la nota, el hito y el tipo se quedan para la lista y la historia, para no
 * llenar la portada de indicadores. `actions` resume la línea de debajo.
 */
function PosterTile({ media, users, actions, latestAt, tz, onOpen, entrance }) {
  const line = summarizeActions(actions, { people: users.length });
  return (
    <EntranceItem as="li" className="min-w-0" {...entrance}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${media.title}: ${line}`}
        className="group block w-full text-left focus-visible:outline-none"
      >
        <span className="relative block overflow-hidden rounded-lg transition-transform duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-pink-400">
          <Poster media={media} size="w342" className="aspect-[2/3] w-full" />
          <span className="absolute right-1.5 top-1.5">
            <AvatarStack users={users} max={2} size="h-7 w-7" />
          </span>
        </span>
        <span className="mt-2 block truncate text-sm text-white">{media.title}</span>
        <span className="block truncate text-xs text-zinc-400">
          {line}
          {line ? " · " : ""}
          <span className="tabular-nums">{whenLabel(latestAt, tz)}</span>
        </span>
      </button>
    </EntranceItem>
  );
}

/**
 * Lo mismo que PosterTile, en fila: cartel, título, línea y hora, caras y nota.
 * En pantallas grandes (xl, y más en 2xl: monitores 2K) crece el cartel, el
 * texto y las caras, para que la fila no se quede pequeña en tanto ancho.
 */
function ListRow({ media, users, actions, rating, milestone, latestAt, tz, onOpen, entrance }) {
  const line = summarizeActions(actions, { people: users.length });
  return (
    <EntranceItem as="li" {...entrance}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${media.title}: ${line}`}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors xl:gap-4 xl:px-4 xl:py-3 2xl:py-3.5 hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none"
      >
        <Poster media={media} size="w154" className="aspect-[2/3] w-11 shrink-0 rounded-md xl:w-14 2xl:w-16" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-bold text-white 2xl:text-base">{media.title}</span>
            {milestone ? (
              <span className="shrink-0 rounded-md bg-pink-500/15 px-1.5 py-0.5 text-xs font-bold leading-none text-pink-300">
                {milestoneLabel(milestone)}
              </span>
            ) : null}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-400 2xl:mt-1.5 2xl:text-sm">
            {line}
            {line ? " · " : ""}
            <span className="tabular-nums">{whenLabel(latestAt, tz)}</span>
          </span>
        </span>
        {typeof rating === "number" ? <RatingBadge rating={rating} className="shrink-0 2xl:text-sm" /> : null}
        <span className="shrink-0">
          <AvatarStack users={users} max={3} size="h-7 w-7 2xl:h-9 2xl:w-9" />
        </span>
      </button>
    </EntranceItem>
  );
}

function TitleGrid({ stories, tz, onOpenStory, layout }) {
  const Item = layout === "list" ? ListRow : PosterTile;
  const animateWithin = estimateEntrance(layout);
  return (
    <ol className={layout === "list" ? LIST : GRID}>
      {stories.map((story, index) => (
        <Item
          key={story.key}
          entrance={{ index, total: stories.length, animateWithin }}
          media={story.media}
          users={story.users}
          actions={story.actions}
          rating={story.averageRating ?? averageOf(story.actions)}
          milestone={story.milestone}
          latestAt={story.latestAt}
          tz={tz}
          onOpen={() => onOpenStory(story.key)}
        />
      ))}
    </ol>
  );
}

// Por persona: cabecera con la cara y, debajo, sus títulos en la misma rejilla.
function PersonSections({ people, tz, onOpenStory, onOpenPerson, layout }) {
  const Item = layout === "list" ? ListRow : PosterTile;
  const animateWithin = estimateEntrance(layout);
  const total = people.reduce((sum, group) => sum + new Set(group.actions.map((a) => mediaKey(a.media))).size, 0);
  // Índice global para que la cascada siga de una sección a la siguiente.
  let next = 0;
  return (
    <div className="space-y-8">
      {people.map((group) => {
        const byTitle = new Map();
        for (const action of group.actions) {
          const key = mediaKey(action.media);
          if (!byTitle.has(key)) byTitle.set(key, []);
          byTitle.get(key).push(action);
        }
        return (
          <section key={group.key} aria-label={displayName(group.user)}>
            <button
              type="button"
              onClick={() => onOpenPerson(group.user)}
              className="mb-3 flex items-center gap-3 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
            >
              <UserAvatar user={group.user} className="h-8 w-8" />
              <span className="text-base font-bold text-white">{displayName(group.user)}</span>
              <span className="text-sm tabular-nums text-zinc-400">
                {group.actions.length} {group.actions.length === 1 ? "historia" : "historias"}
              </span>
            </button>
            <ol className={layout === "list" ? LIST : GRID}>
              {[...byTitle.entries()].map(([key, actions]) => (
                <Item
                  key={key}
                  entrance={{ index: next++, total, animateWithin }}
                  media={actions[0].media}
                  users={[group.user]}
                  actions={actions}
                  rating={averageOf(actions)}
                  milestone={actions.find((a) => a.milestone)?.milestone || null}
                  latestAt={actions[0].activityAt}
                  tz={tz}
                  onOpen={() => onOpenStory(key)}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

// Por hora: una sección por franja (y por día si la ventana abarca varios).
function TimeSections({ sections, tz, onOpenStory, layout }) {
  const Item = layout === "list" ? ListRow : PosterTile;
  const animateWithin = estimateEntrance(layout);
  const total = sections.reduce((sum, section) => sum + section.actions.length, 0);
  // Índice global para que la cascada siga de una franja a la siguiente.
  let next = 0;
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.label}>
          <h3 className="mb-3 flex items-baseline gap-2 text-base font-bold text-white">
            {section.label}
            {section.showDay ? <span className="text-sm font-normal text-zinc-400">{dayHeading(section.day)}</span> : null}
          </h3>
          <ol className={layout === "list" ? LIST : GRID}>
            {section.actions.map((action) => (
              <Item
                key={action.key}
                entrance={{ index: next++, total, animateWithin }}
                media={action.media}
                users={[action.user]}
                actions={[action]}
                rating={averageOf([action])}
                milestone={action.milestone}
                latestAt={action.activityAt}
                tz={tz}
                onOpen={() => onOpenStory(mediaKey(action.media))}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default function TodayFeed({ group, layout = "list", stories, people, sections, tz, onOpenStory, onOpenPerson }) {
  if (group === "person") {
    return <PersonSections people={people} tz={tz} layout={layout} onOpenStory={onOpenStory} onOpenPerson={onOpenPerson} />;
  }
  if (group === "time") return <TimeSections sections={sections} tz={tz} layout={layout} onOpenStory={onOpenStory} />;
  return <TitleGrid stories={stories} tz={tz} layout={layout} onOpenStory={onOpenStory} />;
}
