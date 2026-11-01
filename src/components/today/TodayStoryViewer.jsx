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
//   - El cartel es solo la portada: ni el ratón ni el toque abren una vista
//     previa; tocarlo cuenta como cualquier otro toque (atrás o adelante).
//   - Cada fotograma mostrado se marca como visto (seenStories).
//   - Al pasar a otra historia (toque, flechas, teclado, deslizar o el paso
//     automático) lo nuevo entra desde el lado hacia el que se va: el cartel y
//     los fondos si cambia el título, el pie si solo cambia el fotograma
//     (`.sv-story-*` en globals.css). Al abrir no se anima.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, Pause, Play, Sparkles, Star, X } from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import useModalGuard from "@/hooks/useModalGuard";
import { relativeTime } from "@/lib/notifications/alerts";
import { firstUnseenIndex } from "@/lib/today/seenStories";
import { storySummaryLines } from "@/lib/today/stories";
import { AvatarStack, Poster, TitleLink, UserAvatar } from "./TodayParts";
import { actionPhrase, displayName, episodeLabel, milestoneLabel, ratingTen, tmdbImage } from "./todayUi";

// Pieza del visor que entra al pasar de historia. El sentido se fija AL
// MONTAR: la pieza que ya estaba (el cartel cuando solo cambia el fotograma)
// no debe recibir la clase después y repetir la entrada sin haber cambiado.
function StoryEnter({ as: Tag = "div", dir, enterClass, className = "", ...props }) {
  const [mountDir] = useState(dir);
  return (
    <Tag
      className={`${className} ${mountDir ? enterClass : ""}`}
      data-story-dir={mountDir ?? undefined}
      {...props}
    />
  );
}

// CIERRE FIABLE EN TÁCTIL. El visor lleva `touch-action: none` (sus gestos
// los lleva él) y algunos navegadores móviles (Firefox, Samsung Internet) no
// generan `click` si el dedo se mueve unos píxeles al tocar: la X no hacía
// nada. Por eso, con dedo o lápiz, la X cierra al LEVANTAR el dedo sobre ella
// (pointerup, que siempre llega: el puntero táctil queda capturado por el
// botón donde empezó) y no espera al clic.
//
// Al cerrar en pointerup el visor desaparece antes del clic, y ese clic (si el
// navegador lo genera) caería en lo que queda debajo: la barra superior, con
// la píldora «Hoy» que vuelve a abrir las historias. Se descarta el siguiente
// clic durante un instante.
const GHOST_CLICK_MS = 700;
const TAP_SLOP_PX = 12;

function swallowNextClick() {
  const swallow = (event) => {
    event.preventDefault();
    event.stopPropagation();
    cleanup();
  };
  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", swallow, true);
  };
  const timer = window.setTimeout(cleanup, GHOST_CLICK_MS);
  document.addEventListener("click", swallow, true);
}

function closeTapHandlers(onClose) {
  return {
    onPointerUp: (event) => {
      if (event.pointerType === "mouse") return;
      const r = event.currentTarget.getBoundingClientRect();
      const inside =
        event.clientX >= r.left - TAP_SLOP_PX &&
        event.clientX <= r.right + TAP_SLOP_PX &&
        event.clientY >= r.top - TAP_SLOP_PX &&
        event.clientY <= r.bottom + TAP_SLOP_PX;
      if (!inside) return;
      swallowNextClick();
      onClose();
    },
    // Ratón y teclado (Intro, espacio).
    onClick: onClose,
  };
}

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
    // Qué han hecho con el título (storySummaryLines): lo de todas arriba y el
    // resto, el hito y la media debajo, en una línea.
    const { headline, details } = storySummaryLines(story);
    const extra = [
      ...details,
      story.averageRating != null ? `Media ${ratingTen(story.averageRating)}/10` : null,
    ].filter(Boolean);
    return (
      <div className="flex items-center gap-3">
        <span className="shrink-0">
          <AvatarStack users={story.users} max={3} size="h-11 w-11" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{headline}</p>
          <p className="truncate text-sm text-zinc-300">
            {story.milestone ? <span className="font-bold text-pink-300">{milestoneLabel(story.milestone)}</span> : null}
            {story.milestone && extra.length ? " · " : ""}
            {extra.join(" · ")}
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
  // Sentido del último paso («forward» | «back»); null al abrir. Se reinicia
  // en el render (no en un efecto): el visor sigue montado mientras está
  // cerrado y, con el efecto, el primer cartel salía con el sentido de la
  // vez anterior y hacía su entrada al abrir.
  const [dir, setDir] = useState(null);
  const [openedFor, setOpenedFor] = useState(startIndex);
  if (openedFor !== startIndex) {
    setOpenedFor(startIndex);
    setDir(null);
  }
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
      setDir(delta > 0 ? "forward" : "back");
      setGroupIndex(next);
      setFrameIndex(delta > 0 ? firstUnseenIndex(groups[next], seen) : 0);
    },
    [groupIndex, groups, onClose, seen],
  );

  // De historia en historia (toques, teclado, flechas laterales y el paso
  // automático), también dentro del mismo título y sin saltarse las vistas.
  // Al retroceder desde la primera de un título se va a la ÚLTIMA del
  // anterior, no a su primera.
  const goFrame = useCallback(
    (delta) => {
      if (!group) return;
      const next = frameIndex + delta;
      if (next < 0) {
        if (groupIndex <= 0) {
          setFrameIndex(0);
          elapsedRef.current = 0;
          return;
        }
        setDir("back");
        setGroupIndex(groupIndex - 1);
        setFrameIndex(Math.max(0, groups[groupIndex - 1].frames.length - 1));
      } else if (next >= group.frames.length) {
        // Al título siguiente por su PRIMERA historia (goGroup salta a la
        // primera sin ver y se comería las ya vistas).
        if (groupIndex >= groups.length - 1) {
          onClose();
          return;
        }
        setDir("forward");
        setGroupIndex(groupIndex + 1);
        setFrameIndex(0);
      } else {
        setDir(delta > 0 ? "forward" : "back");
        setFrameIndex(next);
      }
    },
    [frameIndex, group, groupIndex, groups, onClose],
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
  // Clave del título que se ve: cambia con el grupo y, en «Para ti», con cada
  // fotograma (cada uno es de un título distinto).
  const mediaKey = `${group.key}|${media?.type || ""}:${media?.id ?? media?.title ?? ""}`;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={`Historias: ${media?.title || ""}`}>
      {backdrop ? (
        <StoryEnter
          as={OptimizedImage}
          key={mediaKey}
          dir={dir}
          enterClass="sv-story-fade"
          src={backdrop}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.35]"
        />
      ) : null}

      {/* Las flechas van pegadas a la tarjeta, no en los bordes de la pantalla. */}
      {/* Tamaño según la pantalla: en ordenador, todo el alto que haya (hasta
          1100 px) y el ancho justo para que el cartel 2:3 lo llene (alto menos
          ~244 px de barras, cabecera y pie, por 2/3, más el margen lateral). */}
      <div className="relative h-full w-full md:h-[min(96vh,1100px)] md:w-[calc((min(96vh,1100px)-244px)*2/3+32px)] md:max-w-[calc(100vw-180px)]">
      {/* Flechas laterales: una historia cada vez, también dentro del mismo
          título (antes saltaban de título). */}
      <button
        type="button"
        onClick={() => goFrame(-1)}
        className="absolute -left-16 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 md:block"
        aria-label="Historia anterior"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => goFrame(1)}
        className="absolute -right-16 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 md:block"
        aria-label="Historia siguiente"
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
          <StoryEnter
            as={OptimizedImage}
            key={mediaKey}
            dir={dir}
            enterClass="sv-story-fade"
            src={backdrop}
            alt=""
            className="absolute inset-0 h-full w-full object-cover brightness-[0.45]"
          />
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

        {/* La cabecera entera es zona de controles: un toque que roza la X o
            el resto de botones no cuenta como «siguiente historia» (antes
            avanzaba y parecía que la X no respondía). */}
        <div className="relative z-10 flex items-center gap-3 px-3 pt-3" data-story-control>
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
          {/* 44 px de diana, el mínimo cómodo para un dedo (antes 36). */}
          <button
            type="button"
            data-story-control
            {...closeTapHandlers(onClose)}
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-5 px-4 pb-[max(1.5rem,var(--sv-safe-bottom,0px))] pt-4">
          {/* El hueco del cartel mide lo que sobra entre la cabecera y el pie;
              el cartel se encaja en él SIEMPRE a 2:3 (el ancho es el menor entre
              el ancho del hueco y dos tercios de su alto), así se ve entero y
              nunca recortado. */}
          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <StoryEnter
            key={mediaKey}
            dir={dir}
            enterClass="sv-story-card"
            className="relative aspect-[2/3] w-[min(100cqw,66.6667cqh)] overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl"
          >
            <Poster media={media} size="w500" className="absolute inset-0 h-full w-full" />
          </StoryEnter>
          </div>
          <div className="h-[116px] shrink-0 overflow-hidden">
            <StoryEnter key={frame.key} dir={dir} enterClass="sv-story-body">
              <FrameBody frame={frame} />
            </StoryEnter>
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
