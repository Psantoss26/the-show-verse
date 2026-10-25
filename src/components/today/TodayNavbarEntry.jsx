"use client";

// src/components/today/TodayNavbarEntry.jsx
//
// Píldora «Hoy» del navbar, como la de Trakt (trakt-lite, TodayNavbarEntry):
//   - Escritorio: caras de hasta 3 personas con historias, «Hoy» y un contador
//     con las historias sin ver. Mientras quede alguna, un brillo recorre el
//     borde de vez en cuando (sv-today-shine en globals.css).
//   - Móvil: un círculo con dos carteles inclinados y el contador en la esquina.
// Lleva a la vista «Hoy» de Social abriendo el reproductor en la primera
// historia sin ver (/social?story=…). Sin historias no se pinta.
//
// Los datos son los de la vista «Hoy» (Siguiendo, hoy), con la petición
// compartida de todayFeedClient: la barra está montada dos veces y la página
// también los usa.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { SEEN_STORIES_EVENT, hasUnseenFrames, readSeenStories } from "@/lib/today/seenStories";
import { prepareActions, toStoryGroups, toTitleStories } from "@/lib/today/stories";
import { fetchTodayFeed, peekTodayFeed } from "@/lib/today/todayFeedClient";
import { displayName, tmdbImage } from "./todayUi";

const MAX_FACES = 3;
const MAX_POSTERS = 2;

function useTodayGroups(enabled) {
  const pathname = usePathname();
  const [data, setData] = useState(() => peekTodayFeed("following", "today"));
  const [seen, setSeen] = useState({});

  // Al entrar y al navegar, salvo que la copia compartida sea reciente.
  useEffect(() => {
    if (!enabled) return undefined;
    const fresh = peekTodayFeed("following", "today");
    if (fresh) {
      setData(fresh);
      return undefined;
    }
    let vigente = true;
    fetchTodayFeed("following", "today")
      .then((json) => {
        if (vigente) setData(json);
      })
      .catch(() => {
        /* sin datos la píldora no se pinta; la próxima navegación lo reintenta */
      });
    return () => {
      vigente = false;
    };
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const sync = () => setSeen(readSeenStories());
    sync();
    window.addEventListener(SEEN_STORIES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SEEN_STORIES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled || !data) return null;
    const stories = toTitleStories(prepareActions(data.actions));
    const groups = toStoryGroups(stories, data.forYou || []);
    if (!groups.length) return null;
    const unseen = groups.filter((group) => hasUnseenFrames(group, seen));
    const faces = [];
    for (const story of stories) {
      for (const user of story.users) {
        if (faces.length < MAX_FACES && !faces.some((f) => f.id === user.id)) faces.push(user);
      }
    }
    const posters = [];
    for (const group of groups) {
      const media = group.frames[0]?.media || group.media;
      if (posters.length < MAX_POSTERS && media?.posterPath && !posters.some((p) => p.posterPath === media.posterPath)) {
        posters.push(media);
      }
    }
    const target = unseen[0] || groups[0];
    return { unseen: unseen.length, faces, posters, href: `/social?story=${encodeURIComponent(target.key)}` };
  }, [enabled, data, seen]);
}

// Brillo del borde: un degradado cónico recortado al anillo de 1px de la
// píldora. Solo mientras queda algo sin ver; sin animación con reduced-motion.
function Shine() {
  return (
    <span
      aria-hidden="true"
      className="sv-today-shine pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] p-px"
    />
  );
}

function Badge({ count, className = "" }) {
  if (!count) return null;
  return (
    <span
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-950 px-1.5 text-[11px] font-bold tabular-nums text-indigo-100 ring-1 ring-inset ring-indigo-400/40 ${className}`}
    >
      {count}
    </span>
  );
}

export default function TodayNavbarEntry({ variant = "desktop" }) {
  const { account } = useAuth();
  const entry = useTodayGroups(Boolean(account?.id));
  if (!entry) return null;

  const label = entry.unseen
    ? `Hoy: ${entry.unseen} ${entry.unseen === 1 ? "historia sin ver" : "historias sin ver"}`
    : "Hoy: historias de la gente que sigues";
  const pillSurface =
    "bg-[linear-gradient(135deg,rgba(236,72,153,0.18),rgba(99,102,241,0.12))] bg-black/55 backdrop-blur-md shadow-[0_6px_20px_-8px_rgba(236,72,153,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:shadow-[0_8px_26px_-8px_rgba(236,72,153,0.7),inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-shadow";

  if (variant === "mobile") {
    return (
      <Link
        href={entry.href}
        prefetch={false}
        aria-label={label}
        className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-white ${pillSurface}`}
      >
        {entry.unseen ? <Shine /> : null}
        {entry.posters.map((media, index) => (
          <span
            key={media.posterPath}
            className={`absolute h-5 w-3.5 overflow-hidden rounded-[3px] shadow-md ${
              entry.posters.length === 1
                ? ""
                : index === 0
                  ? "-translate-x-1.5 -rotate-[10deg]"
                  : "translate-x-1.5 rotate-[10deg]"
            }`}
          >
            <OptimizedImage src={tmdbImage(media.posterPath, "w92")} alt="" className="h-full w-full object-cover" />
          </span>
        ))}
        <Badge count={entry.unseen} className="absolute -right-1.5 -top-1.5 h-[18px] min-w-[18px] px-1 ring-2 ring-black" />
      </Link>
    );
  }

  return (
    <Link
      href={entry.href}
      prefetch={false}
      aria-label={label}
      className={`relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 ${
        entry.faces.length ? "pl-[3px]" : "pl-3"
      } ${entry.unseen ? "pr-2.5" : "pr-3"} ${pillSurface}`}
    >
      {entry.unseen ? <Shine /> : null}
      {entry.faces.length ? (
        <span className="flex items-center -space-x-2">
          {entry.faces.map((user) => (
            <span
              key={user.id}
              className="inline-flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-xs font-bold text-zinc-200 ring-2 ring-black/80"
            >
              <Avatar src={user.avatarUrl} name={displayName(user)} alt="" />
            </span>
          ))}
        </span>
      ) : null}
      <span className="font-bold">Hoy</span>
      <Badge count={entry.unseen} />
    </Link>
  );
}
