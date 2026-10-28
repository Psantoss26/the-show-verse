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
//   - En ordenador, pasar el ratón por el cartel enseña la ficha del título
//     (TodayStoryDetails) y pausa la historia mientras está encima; en táctil,
//     tocar la portada la abre y otro toque la cierra.
//   - Cada fotograma mostrado se marca como visto (seenStories).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, Pause, Play, Sparkles, Star, X } from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import useModalGuard from "@/hooks/useModalGuard";
import { relativeTime } from "@/lib/notifications/alerts";
import { firstUnseenIndex } from "@/lib/today/seenStories";
import { AvatarStack, Poster, TitleLink, UserAvatar } from "./TodayParts";
import TodayStoryDetails from "./TodayStoryDetails";
import { actionPhrase, displayName, episodeLabel, milestoneLabel, ratingTen, tmdbImage } from "./todayUi";

export const STORY_MS = 5000;
const HOLD_MS = 220;
const SWIPE_PX = 60;

const FOR_YOU_REASON = {
  new_episode: "Nuevo episodio",
  watchlist_release: "Se estrena algo de tu lista",
};

// Pie de cada fotograma: quién, qué hizo y cuándo, en una fila compacta (como
// Trakt). Tiene ALTO FIJO y todo va recortado a sus líneas, así que el texto,
// sea corto o una reseña larga, nunca cambia el tamaño del cartel de arriba.
function FrameBody({ frame }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [frame.key]);

  if (frame.type === "for-you") {
    const { item } = frame;
    return (
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pink-500/90 text-white">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">Para ti</p>
          <p className="truncate text-sm text-zinc-300">
            {item.milestone ? milestoneLabel(item.milestone) : FOR_YOU_REASON[item.reason] || ""}
            {item.season != null ? ` · ${episodeLabel(item)}` : ""}
          </p>
          {item.episodeName ? <p className="truncate text-xs text-zinc-400">{item.episodeName}</p> : null}
        </div>
      </div>
    );
  }

  if (frame.type === "summary") {
    const { story } = frame;
    return (
      <div className="flex items-center gap-3">
        <span className="shrink-0">
          <AvatarStack users={story.users} max={3} size="h-11 w-11" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{story.users.length} personas lo han tocado</p>
          <p className="truncate text-sm text-zinc-300">
            {story.milestone ? <span className="font-bold text-pink-300">{milestoneLabel(story.milestone)}</span> : null}
            {story.milestone && story.averageRating != null ? " · " : ""}
            {story.averageRating != null ? `Media ${ratingTen(story.averageRating)}/10` : ""}
          </p>
        </div>
      </div>
    );
  }

  const { action } = frame;
  const isComment = action.kind === "comment";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <UserAvatar user={action.user} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{displayName(action.user)}</p>
          <p className="truncate text-sm text-zinc-300">
            {actionPhrase(action).replace(/^ha /, "Ha ")}
            {action.milestone ? <span className="font-bold text-pink-300"> · {milestoneLabel(action.milestone)}</span> : null}
          </p>
          <p className="truncate text-xs text-zinc-400">{relativeTime(action.activityAt)}</p>
        </div>
        {action.rating != null ? (
          <span className="flex shrink-0 items-center gap-1 text-base font-bold tabular-nums text-white">
            <Star className="h-4 w-4 fill-current text-amber-400" aria-hidden="true" />
            {ratingTen(action.rating)}
          </span>
        ) : null}
      </div>
      {isComment ? (
        action.comment.spoiler && !revealed ? (
          <button
            type="button"
            data-story-control
            onClick={() => setRevealed(true)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15"
          >
            Contiene spoilers · mostrar
          </button>
        ) : (
          <blockquote className="line-clamp-2 text-sm leading-snug text-zinc-100" title={action.comment.body}>
            “{action.comment.body}”
          </blockquote>
        )
      ) : null}
    </div>
  );
}

export default function TodayStoryViewer({ groups, startIndex, seen, onSeen, onClose }) {
  const open = startIndex != null && groups.length > 0;
  const [groupIndex, setGroupIndex] = useState(startIndex ?? 0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Ratón encima del cartel (solo en dispositivos con ratón): enseña la ficha y
  // pausa, sin tocar la pausa que elija el usuario con el botón o el espacio.
  const [hovering, setHovering] = useState(false);
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setCanHover(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  const stopped = paused || hovering;
  const cardRef = useRef(null);

  // HOVER ESTABLE. No se escucha mouseenter/mouseleave en la tarjeta: mientras
  // gira, sus caras en 3D cambian de forma bajo el ratón y, cerca de los bordes,
  // el puntero «salía» y «volvía a entrar» a mitad del giro (idas y vueltas que
  // se veían mal). En su lugar se compara la posición del ratón con el
  // rectángulo FIJO del hueco de la tarjeta (que no gira), y con un pequeño
  // margen de tiempo: hay que quedarse un instante dentro para girar y salir
  // un instante para volver.
  useEffect(() => {
    if (!open || !canHover) return undefined;
    const ENTER_MS = 90;
    const LEAVE_MS = 160;
    let inside = false;
    let timer = 0;
    const settle = (next, delay) => {
      if (next === inside) {
        clearTimeout(timer);
        timer = 0;
        return;
      }
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        inside = next;
        setHovering(next);
      }, delay);
    };
    const onMove = (event) => {
      const node = cardRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const within = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      settle(within, within ? ENTER_MS : LEAVE_MS);
    };
    const onLeaveWindow = () => settle(false, LEAVE_MS);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeaveWindow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeaveWindow);
    };
  }, [open, canHover]);
  // La ficha del reverso ya tiene todo (ver TodayStoryDetails).
  const [detailsReady, setDetailsReady] = useState(false);
  const flipped = hovering && detailsReady;
  // El clic del mismo toque que abre la ficha cae ya sobre ella: sin esto la
  // cerraría en el acto.
  const openedAtRef = useRef(0);
  // En táctil la ficha se cierra al cambiar de fotograma (deslizar, botones).
  const frameKey = open ? groups[groupIndex]?.frames[frameIndex]?.key : null;
  useEffect(() => {
    if (!canHover) setHovering(false);
  }, [frameKey, canHover]);

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
    setHovering(false);
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
    if (!frame || stopped) return undefined;
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
  }, [frame, stopped, goFrame]);

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
    // Táctil: tocar la portada abre la ficha del título (lo que en ordenador
    // hace el ratón al pasar por encima). Fuera de la portada siguen las zonas
    // de toque para ir atrás y adelante.
    if (!canHover && cardRef.current?.contains(event.target)) {
      openedAtRef.current = performance.now();
      setHovering(true);
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

      {/* Las flechas van pegadas a la tarjeta, no en los bordes de la pantalla. */}
      {/* Tamaño según la pantalla: en ordenador, todo el alto que haya (hasta
          1100 px) y el ancho justo para que el cartel 2:3 lo llene (alto menos
          ~244 px de barras, cabecera y pie, por 2/3, más el margen lateral). */}
      <div className="relative h-full w-full md:h-[min(96vh,1100px)] md:w-[calc((min(96vh,1100px)-244px)*2/3+32px)] md:max-w-[calc(100vw-180px)]">
      <button
        type="button"
        onClick={() => goGroup(-1)}
        className="absolute -left-16 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 md:block"
        aria-label="Título anterior"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => goGroup(1)}
        className="absolute -right-16 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 md:block"
        aria-label="Título siguiente"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
      <div
        className="relative flex h-full w-full touch-none select-none flex-col overflow-hidden bg-zinc-950 md:rounded-3xl md:shadow-2xl"
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
          {/* Página completa de Hoy (como el botón de cuadrícula de Trakt):
              cierra las historias y deja ver la vista Actividad de Social. */}
          <Link
            href="/social"
            prefetch={false}
            data-story-control
            onClick={onClose}
            className="rounded-full p-2 text-white hover:bg-white/10"
            aria-label="Ver toda la actividad"
            title="Ver toda la actividad"
          >
            <LayoutGrid className="h-5 w-5" />
          </Link>
          <button type="button" data-story-control onClick={onClose} className="rounded-full p-2 text-white hover:bg-white/10" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          {/* CARTEL GRANDE. En ordenador, al pasar el ratón se convierte en la
              ficha del título (TodayStoryDetails) y la historia se pausa, como
              en Trakt; al salir vuelve el cartel y sigue. En táctil se abre al
              tocar la portada y se cierra con otro toque. */}
          {/* El hueco del cartel mide lo que sobra entre la cabecera y el pie;
              el cartel se encaja en él SIEMPRE a 2:3 (el ancho es el menor entre
              el ancho del hueco y dos tercios de su alto), así se ve entero y
              nunca recortado. */}
          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div
            ref={cardRef}
            className="relative aspect-[2/3] w-[min(100cqw,66.6667cqh)] [perspective:1800px]"
          >
            {/* La tarjeta DA LA VUELTA (rotateY) en 3D: delante el cartel,
                detrás la ficha. La ficha se precarga entera mientras se ve el
                cartel y solo se gira cuando está completa (`detailsReady`). */}
            <div
              className={`relative h-full w-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d] motion-reduce:transition-none ${
                flipped ? "[transform:rotateY(180deg)]" : ""
              }`}
            >
              <div className="absolute inset-0 overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl [backface-visibility:hidden] [-webkit-backface-visibility:hidden]">
                <Poster media={media} size="w500" className="absolute inset-0 h-full w-full" />
              </div>
              <div
                className={`absolute inset-0 overflow-hidden rounded-2xl shadow-2xl [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)] ${
                  flipped ? "" : "pointer-events-none"
                }`}
                aria-hidden={!flipped}
                data-story-control
                // Táctil: otro toque en la ficha vuelve a la portada y sigue la
                // historia (desplazar dentro no cuenta como toque).
                onClick={
                  canHover
                    ? undefined
                    : () => {
                        if (performance.now() - openedAtRef.current > 350) setHovering(false);
                      }
                }
              >
                <TodayStoryDetails media={media} active onReadyChange={setDetailsReady} />
              </div>
            </div>
          </div>
          </div>
          <div className="h-[116px] shrink-0 overflow-hidden">
            <FrameBody frame={frame} />
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
