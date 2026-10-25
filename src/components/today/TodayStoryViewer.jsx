"use client";

// src/components/today/TodayStoryViewer.jsx
// Reproductor de historias a pantalla completa (como el de Trakt, y el de
// Instagram): un grupo por título, varios fotogramas por grupo.
//
//   - Avanza solo cada STORY_MS. La barra de progreso se mueve con `transform`
//     escrito en un requestAnimationFrame sobre el nodo, SIN estado de React por
//     fotograma (un setState por fotograma re-renderiza todo el árbol).
//   - Toque en el tercio izquierdo: atrás; en el resto: adelante. Mantener
//     pulsado pausa. Deslizar en horizontal cambia de título; hacia abajo cierra.
//   - Teclado: ← → cambian de fotograma, espacio pausa, Esc cierra.
//   - Cada fotograma mostrado se marca como visto (seenStories).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, Star, X } from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import useModalGuard from "@/hooks/useModalGuard";
import { relativeTime } from "@/lib/notifications/alerts";
import { firstUnseenIndex } from "@/lib/today/seenStories";
import { AvatarStack, Poster, TitleLink, UserAvatar } from "./TodayParts";
import { actionPhrase, displayName, episodeLabel, milestoneLabel, ratingTen, tmdbImage } from "./todayUi";

export const STORY_MS = 5000;
const HOLD_MS = 220;
const SWIPE_PX = 60;

const FOR_YOU_REASON = {
  new_episode: "Nuevo episodio",
  watchlist_release: "Se estrena algo de tu lista",
};

function FrameBody({ frame }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [frame.key]);

  if (frame.type === "for-you") {
    const { item } = frame;
    return (
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-500/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Para ti
        </span>
        <p className="mt-3 text-lg font-bold text-white">
          {item.milestone ? milestoneLabel(item.milestone) : FOR_YOU_REASON[item.reason] || ""}
        </p>
        {item.season != null ? (
          <p className="mt-1 text-sm text-zinc-300">
            {episodeLabel(item)}
            {item.episodeName ? ` · ${item.episodeName}` : ""}
          </p>
        ) : null}
      </div>
    );
  }

  if (frame.type === "summary") {
    const { story } = frame;
    return (
      <div className="flex flex-col items-center text-center">
        <AvatarStack users={story.users} max={6} size="h-10 w-10" />
        <p className="mt-3 text-lg font-bold text-white">
          {story.users.length} personas lo han tocado
        </p>
        {story.averageRating != null ? (
          <p className="mt-1 inline-flex items-center gap-2 text-sm text-zinc-200">
            <Star className="h-4 w-4 fill-current text-amber-400" aria-hidden="true" /> Media {ratingTen(story.averageRating)}/10
          </p>
        ) : null}
        {story.milestone ? (
          <p className="mt-1 text-sm font-bold text-pink-300">{milestoneLabel(story.milestone)}</p>
        ) : null}
      </div>
    );
  }

  const { action } = frame;
  return (
    <div className="flex flex-col items-center text-center">
      <UserAvatar user={action.user} className="h-14 w-14" ring="ring-2 ring-white/20" />
      <p className="mt-3 text-base text-zinc-200">
        <span className="font-bold text-white">{displayName(action.user)}</span> {actionPhrase(action)}
      </p>
      {action.milestone ? <p className="mt-1 text-sm font-bold text-pink-300">{milestoneLabel(action.milestone)}</p> : null}
      {action.rating != null ? (
        <div className="mt-2 flex items-center gap-1.5 text-lg font-bold tabular-nums text-white">
          <Star className="h-5 w-5 fill-current text-amber-400" aria-hidden="true" />
          {ratingTen(action.rating)}/10
        </div>
      ) : null}
      {action.kind === "comment" ? (
        action.comment.spoiler && !revealed ? (
          <button
            type="button"
            data-story-control
            onClick={() => setRevealed(true)}
            className="mt-3 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"
          >
            Contiene spoilers · mostrar
          </button>
        ) : (
          <blockquote className="mt-3 max-h-[30vh] overflow-y-auto whitespace-pre-line text-base leading-relaxed text-zinc-100">
            “{action.comment.body}”
          </blockquote>
        )
      ) : null}
      <p className="mt-2 text-xs text-zinc-400">{relativeTime(action.activityAt)}</p>
    </div>
  );
}

export default function TodayStoryViewer({ groups, startIndex, seen, onSeen, onClose }) {
  const open = startIndex != null && groups.length > 0;
  const [groupIndex, setGroupIndex] = useState(startIndex ?? 0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const barRef = useRef(null);
  const elapsedRef = useRef(0);
  const pointerRef = useRef(null);

  useModalGuard({ open, onClose });

  // Al abrir, se empieza por el primer fotograma sin ver del grupo elegido.
  useEffect(() => {
    if (startIndex == null) return;
    setGroupIndex(startIndex);
    setFrameIndex(firstUnseenIndex(groups[startIndex], seen));
    setPaused(false);
    // Solo al abrir: `seen` cambia con cada fotograma visto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIndex]);

  const group = open ? groups[groupIndex] : null;
  const frame = group?.frames[frameIndex] || null;

  const goGroup = useCallback(
    (delta) => {
      const next = groupIndex + delta;
      if (next < 0) {
        setFrameIndex(0);
        elapsedRef.current = 0;
        return;
      }
      if (next >= groups.length) {
        onClose();
        return;
      }
      setGroupIndex(next);
      setFrameIndex(delta > 0 ? firstUnseenIndex(groups[next], seen) : 0);
    },
    [groupIndex, groups, onClose, seen],
  );

  const goFrame = useCallback(
    (delta) => {
      if (!group) return;
      const next = frameIndex + delta;
      if (next < 0) goGroup(-1);
      else if (next >= group.frames.length) goGroup(1);
      else setFrameIndex(next);
    },
    [frameIndex, goGroup, group],
  );

  // Visto en cuanto aparece.
  useEffect(() => {
    if (frame) onSeen(frame.key);
  }, [frame, onSeen]);

  // Reloj del fotograma: progreso por rAF, sin estado de React.
  useEffect(() => {
    if (!frame) return undefined;
    elapsedRef.current = 0;
    if (barRef.current) barRef.current.style.transform = "scaleX(0)";
    return undefined;
  }, [frame]);

  useEffect(() => {
    if (!frame || paused) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      elapsedRef.current += now - last;
      last = now;
      const progress = Math.min(1, elapsedRef.current / STORY_MS);
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
      if (progress >= 1) {
        goFrame(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frame, paused, goFrame]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "ArrowRight") goFrame(1);
      else if (event.key === "ArrowLeft") goFrame(-1);
      else if (event.key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goFrame]);

  const onPointerDown = (event) => {
    if (event.target.closest("[data-story-control]")) return;
    pointerRef.current = { x: event.clientX, y: event.clientY, at: performance.now(), held: false };
    const start = pointerRef.current;
    start.timer = setTimeout(() => {
      start.held = true;
      setPaused(true);
    }, HOLD_MS);
  };

  const onPointerUp = (event) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    clearTimeout(start.timer);
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.held) {
      setPaused(false);
      return;
    }
    if (dy > SWIPE_PX * 1.5 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      goGroup(dx < 0 ? 1 : -1);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    goFrame(event.clientX - rect.left < rect.width / 3 ? -1 : 1);
  };

  if (!open || !group || !frame || typeof document === "undefined") return null;
  const media = frame.media || group.media;
  const backdrop = tmdbImage(media?.backdropPath, "w1280") || tmdbImage(media?.posterPath, "w780");

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={`Historias: ${media?.title || ""}`}>
      {backdrop ? (
        <OptimizedImage src={backdrop} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.35]" />
      ) : null}

      <button
        type="button"
        onClick={() => goGroup(-1)}
        className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 md:block"
        aria-label="Título anterior"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => goGroup(1)}
        className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 md:block"
        aria-label="Título siguiente"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div
        className="relative flex h-full w-full max-w-[460px] touch-none select-none flex-col overflow-hidden bg-zinc-950 md:h-[min(92vh,820px)] md:rounded-3xl md:shadow-2xl"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          clearTimeout(pointerRef.current?.timer);
          pointerRef.current = null;
          setPaused(false);
        }}
      >
        {backdrop ? (
          <OptimizedImage src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover brightness-[0.45]" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90" />

        {/* Barras de progreso: una por fotograma del grupo */}
        <div className="relative z-10 flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {group.frames.map((f, i) => (
            <span key={f.key} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
              <span
                ref={i === frameIndex ? barRef : undefined}
                className="block h-full origin-left rounded-full bg-white"
                style={{ transform: i < frameIndex ? "scaleX(1)" : "scaleX(0)" }}
              />
            </span>
          ))}
        </div>

        <div className="relative z-10 flex items-center gap-3 px-3 pt-3">
          <TitleLink media={media} className="flex min-w-0 flex-1 items-center gap-2.5" data-story-control onClick={onClose}>
            <Poster media={media} size="w92" className="h-10 w-7 rounded" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{media?.title}</span>
              <span className="block text-xs text-zinc-400">
                {groupIndex + 1} de {groups.length}
              </span>
            </span>
          </TitleLink>
          <button
            type="button"
            data-story-control
            onClick={() => setPaused((value) => !value)}
            className="rounded-full p-2 text-white hover:bg-white/10"
            aria-label={paused ? "Reanudar" : "Pausar"}
          >
            {paused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
          </button>
          <button type="button" data-story-control onClick={onClose} className="rounded-full p-2 text-white hover:bg-white/10" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Poster media={media} size="w342" className="aspect-[2/3] w-[46%] max-w-[190px] rounded-2xl shadow-2xl ring-1 ring-white/10" />
          <FrameBody frame={frame} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
