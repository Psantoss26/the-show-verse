"use client";

// src/components/today/TodayPersonDrawer.jsx
// Panel lateral de una persona en Hoy: todo lo suyo de la ventana elegida, con
// enlace a su perfil y botón de seguir. Entra con `transform` en CSS (sin
// opacidad en el contenedor, que aplanaría el cristal).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

import FollowButton from "@/components/social/FollowButton";
import useModalGuard from "@/hooks/useModalGuard";
import { relativeTime } from "@/lib/notifications/alerts";
import { Poster, TitleLink, UserAvatar } from "./TodayParts";
import { actionPhrase, displayName, profileHref } from "./todayUi";

const EXIT_MS = 260;

export default function TodayPersonDrawer({ person, actions, following, viewerId, onClose }) {
  // `shown` va un fotograma por detrás de `person` para que la entrada anime.
  const [current, setCurrent] = useState(person);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (person) {
      setCurrent(person);
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = setTimeout(() => setCurrent(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [person]);

  useModalGuard({ open: Boolean(person), onClose });

  if (!current || typeof document === "undefined") return null;
  const href = profileHref(current);
  const own = (actions || []).filter((a) => a.user?.id === current.id);

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label={displayName(current)}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-[background-color] duration-200 ${shown ? "" : "bg-black/0"}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 transition-transform duration-[260ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-white/5 p-4">
          <UserAvatar user={current} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-white">{displayName(current)}</p>
            {current.username ? <p className="truncate text-xs text-zinc-500">@{current.username}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex items-center gap-2 px-4 py-3">
          {href ? (
            <Link
              href={href}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/15"
            >
              Ver perfil <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          {current.id !== viewerId && current.username ? (
            <FollowButton username={current.username} initialFollowing={following} size="sm" bordered={false} />
          ) : null}
          <span className="ml-auto text-xs text-zinc-500">
            {own.length} {own.length === 1 ? "historia" : "historias"}
          </span>
        </div>
        <ol className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-6">
          {own.map((action) => (
            <li key={action.key} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5">
              <TitleLink media={action.media} className="shrink-0" onClickCapture={onClose}>
                <Poster media={action.media} size="w92" className="h-[66px] w-[44px] rounded-lg" />
              </TitleLink>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-zinc-400">{actionPhrase(action)}</p>
                <p className="truncate font-bold text-white">{action.media.title}</p>
                {action.kind === "comment" && !action.comment.spoiler ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">“{action.comment.body}”</p>
                ) : null}
                <p className="text-xs text-zinc-500">
                  {relativeTime(action.activityAt)}
                  {action.rating != null ? ` · ${action.rating}/10` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>,
    document.body,
  );
}
