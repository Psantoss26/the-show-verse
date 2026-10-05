"use client";

// "Tus amigos" en la ficha de un título: qué han hecho con él las cuentas que
// sigues. Tres piezas que comparten la misma petición:
//   - FollowingActivityAvatars (escritorio): avatares con su marca (nota,
//     viéndola, pendiente…) a la derecha de la fila de stats del marcador.
//   - FollowingActivityStrip (modal del dashboard en teléfono): franja
//     compacta bajo el marcador (avatares + "Ana y Luis la han visto" + chips).
//   - FollowingActivityPill (ficha en teléfono): píldora con sus avatares entre
//     Plataformas y Compartir, bajo el marcador; abre FollowingActivityModal,
//     con el mismo diseño que el modal de plataformas.
//   - FollowingActivitySection: la sección completa, con una tarjeta por
//     persona (progreso, nota, favorito, pendiente, reseña y listas).
// Si no hay sesión o nadie de los que sigues ha tocado el título, no se pinta
// nada: ninguna deja hueco vacío.

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  ListPlus,
  ListVideo,
  MessageSquareQuote,
  Play,
  X,
} from "lucide-react";

import { SCOREBOARD_PILL_CLASS } from "@/components/details/DetailHeaderBits";
import Avatar from "@/components/ui/Avatar";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL, LIQUID_GLASS_SURFACE_CARD } from "@/lib/ui/liquidGlass";
import {
  activityMarks,
  episodeLabel,
  primaryMark,
  relativeTime,
  summaryChips,
  summarySentence,
} from "@/lib/details/followingActivity";

// ─────────────────────────────────────────────
// Datos (una petición por título, compartida por la franja y la sección)
// ─────────────────────────────────────────────

const TTL_MS = 60 * 1000;
const cache = new Map(); // "tv:123" → { at, data } | { promise }

function fetchFollowing(type, id) {
  const key = `${type}:${id}`;
  const entry = cache.get(key);
  if (entry?.data && Date.now() - entry.at < TTL_MS) return Promise.resolve(entry.data);
  if (entry?.promise) return entry.promise;
  const promise = fetch(`/api/community/${type}/${id}/following`, { cache: "no-store", credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((data) => {
      if (data) cache.set(key, { at: Date.now(), data });
      else cache.delete(key);
      return data;
    });
  cache.set(key, { promise });
  return promise;
}

/** Actividad de tus seguidos con un título (null mientras carga o si no hay sesión). */
export function useFollowingActivity(type, id, { enabled = true } = {}) {
  const key = `${type}:${id}`;
  const [state, setState] = useState(() => ({ key, data: cache.get(key)?.data || null }));
  useEffect(() => {
    if (!enabled || !id || (type !== "movie" && type !== "tv")) return undefined;
    let active = true;
    fetchFollowing(type, id).then((data) => {
      if (active) setState({ key, data });
    });
    return () => {
      active = false;
    };
  }, [enabled, type, id, key]);
  // Al cambiar de título no se enseña la actividad del anterior.
  return enabled && state.key === key ? state.data : null;
}

export function hasFollowingActivity(data) {
  return Boolean(data?.items?.length);
}

// ─────────────────────────────────────────────
// Piezas
// ─────────────────────────────────────────────

// Mismo lenguaje de iconos que la actividad del perfil (ProfileSection
// ActivityRow) y que el menú: visto = ojo verde, en progreso = play, terminada
// = check, pendiente = marcador azul, favorito = corazón rojo relleno,
// lista = violeta y la nota como número ámbar, sin estrella.
const MARKS = {
  watched: { icon: Eye, tone: "text-emerald-400" },
  watching: { icon: Play, tone: "text-emerald-400", fill: true },
  completed: { icon: CheckCircle2, tone: "text-emerald-400" },
  watchlist: { icon: BookmarkPlus, tone: "text-sky-400" },
  favorite: { icon: Heart, tone: "text-red-500", fill: true },
  list: { icon: ListPlus, tone: "text-violet-400" },
};

/** Icono de una marca. `size` en clases de Tailwind para el icono. */
function MarkIcon({ mark, iconClassName = "h-4 w-4", ratingClassName = "text-base" }) {
  if (mark.id === "rating") {
    return (
      <span className={`font-black leading-none tabular-nums text-amber-400 ${ratingClassName}`} aria-hidden="true">
        {mark.value}
      </span>
    );
  }
  const def = MARKS[mark.id] || MARKS.watched;
  const Icon = def.icon;
  return <Icon aria-hidden="true" strokeWidth={2.5} className={`shrink-0 ${iconClassName} ${def.tone} ${def.fill ? "fill-current" : ""}`} />;
}

function PersonAvatar({ user, className = "h-8 w-8" }) {
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs font-bold text-white ${className}`}>
      <Avatar src={user?.avatarUrl} name={user?.displayName || user?.username} loading="lazy" />
    </span>
  );
}

/**
 * Escritorio: avatares de tus seguidos a la derecha de la fila de stats del
 * marcador, cada uno con su marca (la nota; si no, "viéndola" en series; si no,
 * pendiente…). Sin texto: el detalle está en la sección, a un clic.
 */
export function FollowingActivityAvatars({ data, mediaType, onOpen, compact = false }) {
  if (!hasFollowingActivity(data)) return null;
  const shown = data.items.slice(0, 5);
  const extra = data.items.length - shown.length;
  const avatarCount = shown.length + (extra > 0 ? 1 : 0);
  const describe = (item) => {
    const mark = primaryMark(item, mediaType);
    return `${item.user.displayName}${mark ? `, ${mark.label.toLowerCase()}` : ""}`;
  };
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Tus amigos. ${shown.map(describe).join(". ")}${extra > 0 ? `. Y ${extra} más` : ""}. Ver su actividad`}
      className={`group flex items-center rounded-full p-0.5 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70 ${compact ? "w-full min-w-0" : "gap-2.5"}`}
    >
      <span
        className={compact ? "ml-auto grid w-full min-w-0 items-center" : "flex items-center gap-2.5"}
        style={compact ? {
          gridTemplateColumns: avatarCount > 1 ? `repeat(${avatarCount - 1}, minmax(0, 1fr)) 38px` : "38px",
          // Cada foto añade solo 18px: el solapamiento se mantiene también
          // cuando sobra ancho y aumenta si el hueco disponible se estrecha.
          maxWidth: `${38 + (avatarCount - 1) * 18}px`,
        } : undefined}
        aria-hidden="true"
      >
        {shown.map((item) => {
          const mark = primaryMark(item, mediaType);
          return (
            // La foto mide lo mismo que las insignias de la fila (38px). El
            // icono es una insignia de avatar: su CENTRO cae sobre el borde
            // del círculo a 45° (abajo a la derecha), en (r + r·cos45°) ≈
            // 32.5px de cada lado; con una caja de 16px eso es -2.5px desde
            // la esquina. Queda montado sobre el canto de la foto.
            <span key={item.user.username} className="relative block h-[38px] w-[38px] shrink-0" title={describe(item)}>
              <PersonAvatar user={item.user} className="h-full w-full" />
              {mark && !compact ? (
                // Solo el icono, sin pastilla ni borde: una sombra apretada lo
                // separa de la foto para que se lea sobre cualquier avatar.
                <span className="absolute -bottom-[2.5px] -right-[2.5px] flex h-4 w-4 items-center justify-center [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.95))_drop-shadow(0_0_3px_rgba(0,0,0,0.85))]">
                  <MarkIcon mark={mark} iconClassName="h-4 w-4" ratingClassName="text-[15px] [line-height:1]" />
                </span>
              ) : null}
            </span>
          );
        })}
        {extra > 0 ? (
          <span className="inline-flex h-[38px] min-w-[38px] items-center justify-center rounded-full bg-white/10 px-1.5 text-xs font-bold text-white">
            +{extra}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Teléfono: píldora entre Plataformas y Compartir con los avatares de tus
 * seguidos (hasta tres; con más, dos y "+N"). Solo ocupa lo que miden las
 * fotos: las otras dos se reparten el resto de la fila.
 */
export function FollowingActivityPill({ data, onOpen, className = "", ref, ...props }) {
  if (!hasFollowingActivity(data)) return null;
  const items = data.items;
  const shown = items.length > 3 ? items.slice(0, 2) : items;
  const extra = items.length - shown.length;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${summarySentence(data)}. Ver la actividad de tus amigos`}
      className={`${SCOREBOARD_PILL_CLASS} !w-auto !px-2.5 ${className}`}
      {...props}
    >
      <LiquidGlassOpticalLayers />
      <span className="relative z-10 flex shrink-0 -space-x-3" aria-hidden="true">
        {shown.map((item) => (
          <PersonAvatar key={item.user.username} user={item.user} className="h-7 w-7 ring-2 ring-black/50" />
        ))}
        {extra > 0 ? (
          <span className="relative inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-zinc-800 px-1 text-[11px] font-bold tabular-nums text-white ring-2 ring-black/50">
            +{extra}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Franja compacta de la cabecera. `onOpen` lleva a la sección completa. */
export function FollowingActivityStrip({ data, onOpen, className = "", phoneLayout = false, compactWatchedSummary = false }) {
  if (!hasFollowingActivity(data)) return null;
  const items = data.items;
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const multipleWatched = items.filter((item) => item.watched).length > 1;
  const chips = compactWatchedSummary && multipleWatched ? [] : summaryChips(data);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group ${LIQUID_GLASS_SURFACE_CARD} flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70 ${className}`}
      aria-label={`${summarySentence(data)}. Ver la actividad de tus amigos`}
    >
      <LiquidGlassOpticalLayers />
      <span className="relative z-10 flex shrink-0 -space-x-2" aria-hidden="true">
        {shown.map((item) => (
          <PersonAvatar key={item.user.username} user={item.user} className="h-8 w-8" />
        ))}
        {extra > 0 ? (
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-white">
            +{extra}
          </span>
        ) : null}
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">{summarySentence(data)}</span>
        {chips.length ? (
          <span className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-zinc-300">
            {chips.map((chip) => (
              <span key={chip.id} className={chip.id === "rating" ? "font-black tabular-nums text-amber-400" : ""}>
                {chip.prefix ? <span className="font-normal text-zinc-400">{chip.prefix} </span> : null}
                {chip.label}
                {chip.hint ? <span className="font-normal text-zinc-400"> {chip.hint}</span> : null}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="relative z-10 flex shrink-0 items-center gap-1 text-xs font-bold text-zinc-300 transition-colors group-hover:text-white">
        <span className={phoneLayout ? "hidden" : "hidden sm:inline"}>Ver</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
      </span>
    </button>
  );
}

function ReviewQuote({ review }) {
  const [revealed, setRevealed] = useState(!review.spoiler);
  return (
    <figure className="mt-3 rounded-2xl bg-black/25 p-3">
      <MessageSquareQuote aria-hidden="true" strokeWidth={2.5} className="mb-1.5 h-4 w-4 text-violet-400" />
      <blockquote className="relative">
        <p className={`whitespace-pre-line text-sm leading-relaxed text-zinc-200 ${revealed ? "" : "select-none blur-[5px]"}`} aria-hidden={!revealed}>
          {review.body}
        </p>
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            <Eye aria-hidden="true" className="h-4 w-4" /> Contiene spoilers · Mostrar
          </button>
        ) : review.spoiler ? (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-zinc-200"
          >
            <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> Ocultar spoiler
          </button>
        ) : null}
      </blockquote>
      {review.likes ? <figcaption className="mt-1.5 text-[11px] font-bold text-zinc-500">{review.likes} me gusta</figcaption> : null}
    </figure>
  );
}

function PersonCard({ item, mediaType }) {
  const when = item.lastActivityApprox ? null : relativeTime(item.lastActivityAt);
  const w = item.watched;
  const isTv = mediaType === "tv";
  const marks = activityMarks(item, mediaType);
  return (
    <article className={`${LIQUID_GLASS_SURFACE_CARD} flex flex-col rounded-3xl p-4`}>
      <LiquidGlassOpticalLayers />
      <div className="relative z-10 flex items-center gap-3">
        <Link
          href={`/u/${encodeURIComponent(item.user.username)}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70"
        >
          <PersonAvatar user={item.user} className="h-11 w-11" />
          <span className="min-w-0">
            <span className="block truncate font-bold text-white">{item.user.displayName}</span>
            <span className="block truncate text-xs text-zinc-400">
              @{item.user.username}
              {when ? ` · ${when}` : ""}
            </span>
          </span>
        </Link>
        {/* Lo que ha hecho, en iconos (mismo lenguaje que la actividad del
            perfil). Cada icono lleva su texto para lectores de pantalla y en el
            tooltip. */}
        {marks.length ? (
          <ul className="flex shrink-0 items-center gap-2.5 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.65))]" aria-label="Su actividad con este título">
            {marks.map((mark) => (
              <li key={mark.id} className="relative flex items-center" title={mark.label}>
                <MarkIcon mark={mark} iconClassName="h-5 w-5" ratingClassName="text-xl" />
                {mark.count ? (
                  <span className="ml-0.5 text-[11px] font-bold tabular-nums text-emerald-400" aria-hidden="true">×{mark.count}</span>
                ) : null}
                <span className="sr-only">{mark.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {isTv && w?.episodes ? (
        <div className="relative z-10 mt-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-zinc-200">
              {w.aired ? `${w.episodes} de ${w.aired} episodios` : `${w.episodes} episodios`}
            </span>
            <span className="text-zinc-400">
              {episodeLabel(w.lastEpisode) ? `Último: ${episodeLabel(w.lastEpisode)}` : null}
            </span>
          </div>
          {w.progressPct != null ? (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={w.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progreso de ${item.user.displayName}: ${w.progressPct}%`}
            >
              <div
                className={`h-full rounded-full ${w.completed ? "bg-emerald-400" : "bg-sky-400"}`}
                style={{ width: `${Math.max(3, w.progressPct)}%` }}
              />
            </div>
          ) : null}
          {item.episodeRatings ? (
            <p className="mt-2 text-xs text-zinc-400">
              {item.episodeRatings} episodio{item.episodeRatings === 1 ? "" : "s"} puntuado{item.episodeRatings === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}

      {item.review ? <ReviewQuote review={item.review} /> : null}

      {item.lists?.length ? (
        <p className="relative z-10 mt-3 flex items-center gap-1.5 truncate text-xs text-zinc-400">
          <ListVideo aria-hidden="true" strokeWidth={2.5} className="h-3.5 w-3.5 shrink-0 text-violet-400" />
          <span className="truncate">{item.lists.map((list) => `«${list.name}»`).join(", ")}</span>
        </p>
      ) : null}
    </article>
  );
}

/** Sección completa: una tarjeta por persona. */
export function FollowingActivitySection({ data, mediaType, loading = false, phoneLayout = false }) {
  const [showAll, setShowAll] = useState(false);
  if (!hasFollowingActivity(data)) {
    if (loading) {
      return (
        <p className="text-sm text-zinc-400" role="status">
          Cargando la actividad de tus amigos…
        </p>
      );
    }
    return <p className="text-sm text-zinc-400">Aún no hay actividad de tus amigos con este título.</p>;
  }
  const visible = showAll ? data.items : data.items.slice(0, 6);
  return (
    <>
      <div className={`grid grid-cols-1 gap-4 ${phoneLayout ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
        {visible.map((item) => (
          <PersonCard key={item.user.username} item={item} mediaType={mediaType} />
        ))}
      </div>
      {data.items.length > visible.length ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="rounded-full bg-white/10 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70"
          >
            Ver a los {data.items.length} amigos
          </button>
        </div>
      ) : null}
    </>
  );
}

// Una persona en el modal: misma fila que una plataforma (foto, nombre y
// flecha a su perfil) y, debajo, lo que ha hecho con el título.
function PersonRow({ item, mediaType, onNavigate }) {
  const when = item.lastActivityApprox ? null : relativeTime(item.lastActivityAt);
  const w = item.watched;
  const marks = activityMarks(item, mediaType);
  return (
    <li className="rounded-2xl bg-white/[0.03] p-4 transition-colors duration-300 hover:bg-white/[0.05]">
      <Link
        href={`/u/${encodeURIComponent(item.user.username)}`}
        onClick={onNavigate}
        aria-label={`Ver el perfil de ${item.user.displayName}`}
        className="group/link flex w-full items-center gap-3.5 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
      >
        <PersonAvatar user={item.user} className="h-11 w-11 transition duration-300 group-hover/link:scale-105" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black leading-tight text-white">{item.user.displayName}</span>
          <span className="mt-1 block truncate text-xs font-semibold text-zinc-400 transition-colors group-hover/link:text-zinc-300">
            @{item.user.username}
            {when ? ` · ${when}` : ""}
          </span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400 transition duration-300 group-hover/link:bg-white/10 group-hover/link:text-white">
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </Link>

      {marks.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Su actividad con este título">
          {marks.map((mark) => (
            <li
              key={mark.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-zinc-200"
            >
              <MarkIcon mark={mark} iconClassName="h-3.5 w-3.5" ratingClassName="text-sm" />
              <span>{mark.id === "rating" ? "Su nota" : mark.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {mediaType === "tv" && w?.episodes ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-zinc-200">
              {w.aired ? `${w.episodes} de ${w.aired} episodios` : `${w.episodes} episodios`}
            </span>
            <span className="text-zinc-400">
              {episodeLabel(w.lastEpisode) ? `Último: ${episodeLabel(w.lastEpisode)}` : null}
            </span>
          </div>
          {w.progressPct != null ? (
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={w.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progreso de ${item.user.displayName}: ${w.progressPct}%`}
            >
              <div
                className={`h-full rounded-full ${w.completed ? "bg-emerald-400" : "bg-sky-400"}`}
                style={{ width: `${Math.max(3, w.progressPct)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {item.review ? <ReviewQuote review={item.review} /> : null}

      {item.lists?.length ? (
        <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-zinc-400">
          <ListVideo aria-hidden="true" strokeWidth={2.5} className="h-3.5 w-3.5 shrink-0 text-violet-400" />
          <span className="truncate">{item.lists.map((list) => `«${list.name}»`).join(", ")}</span>
        </p>
      ) : null}
    </li>
  );
}

/**
 * Teléfono: la actividad de tus amigos en un modal con el diseño del de
 * plataformas (ExternalLinksModal): mismo velo, cristal, cabecera y filas.
 */
export function FollowingActivityModal({ open, onClose, data, mediaType }) {
  const [portalReady, setPortalReady] = useState(false);
  useModalGuard({ open, onClose });
  useEffect(() => setPortalReady(true), []);
  if (!open || !portalReady || !hasFollowingActivity(data)) return null;

  return createPortal(
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="following-activity-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
      >
        <div className={`flex w-full shrink-0 items-center justify-between ${LIQUID_GLASS_MODAL_HEADER} p-6 sm:px-8 sm:pb-6 sm:pt-8`}>
          <div className="min-w-0">
            <h2
              id="following-activity-title"
              className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
            >
              Actividad de amigos
            </h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {summarySentence(data)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pb-8 sm:px-8">
          <ul className="space-y-2">
            {data.items.map((item) => (
              <PersonRow key={item.user.username} item={item} mediaType={mediaType} onNavigate={onClose} />
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
