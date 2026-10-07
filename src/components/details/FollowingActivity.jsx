"use client";

// Actividad de tus amigos en la ficha de un título: qué han hecho con él las
// cuentas que sigues. Dos piezas que comparten la misma petición:
//   - FollowingActivityAvatars (escritorio): avatares con su marca (nota,
//     viéndola, pendiente…) a la derecha de la fila de stats del marcador.
//   - FollowingActivityModal: una fila por persona (progreso, nota, favorito,
//     pendiente, reseña y listas), con el mismo diseño que el modal de
//     plataformas. Lo abren los avatares (escritorio) y el botón Actividad de
//     la fila Plataformas · Actividad · Enlaces · Compartir (teléfono).
// Si no hay sesión o nadie de los que sigues ha tocado el título, no se pinta
// nada: ninguna deja hueco vacío.

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkPlus,
  CheckCircle2,
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

import Avatar from "@/components/ui/Avatar";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  activityMarks,
  episodeLabel,
  primaryMark,
  relativeTime,
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
        {shown.map((item) => (
          // Solo la foto (38px, lo mismo que las insignias de la fila), sin la
          // marca de lo que hizo cada uno encima: el botón abre el modal con
          // esa información detallada. La etiqueta del botón la sigue
          // describiendo para lectores de pantalla.
          <span key={item.user.username} className="relative block h-[38px] w-[38px] shrink-0" title={describe(item)}>
            <PersonAvatar user={item.user} className="h-full w-full" />
          </span>
        ))}
        {extra > 0 ? (
          <span className="inline-flex h-[38px] min-w-[38px] items-center justify-center rounded-full bg-white/10 px-1.5 text-xs font-bold text-white">
            +{extra}
          </span>
        ) : null}
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

// Una persona en el modal: misma fila que un registro de la actividad del
// perfil (ProfileSection ActivityRow): foto, los iconos de lo que ha hecho con
// el título (sin texto: lo dicen el tooltip y la etiqueta del enlace), nombre
// y cuándo, y la flecha a su perfil.
function PersonRow({ item, mediaType, onNavigate }) {
  const when = item.lastActivityApprox ? null : relativeTime(item.lastActivityAt);
  const w = item.watched;
  const marks = activityMarks(item, mediaType);
  const marksLabel = marks.map((mark) => mark.label).join(", ");
  return (
    <li className="rounded-2xl bg-white/[0.03] p-4 transition-colors duration-300 hover:bg-white/[0.05]">
      <Link
        href={`/u/${encodeURIComponent(item.user.username)}`}
        onClick={onNavigate}
        aria-label={`Ver el perfil de ${item.user.displayName}${marksLabel ? `. ${marksLabel}` : ""}`}
        className="group/link flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
      >
        <PersonAvatar user={item.user} className="h-11 w-11 transition duration-300 group-hover/link:scale-105" />
        {marks.length ? (
          <span className="flex shrink-0 items-center [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.65))]" aria-hidden="true">
            {marks.map((mark) => (
              <span key={mark.id} title={mark.label} className="flex h-8 min-w-8 items-center justify-center">
                <MarkIcon mark={mark} iconClassName="h-5 w-5" ratingClassName="text-xl" />
              </span>
            ))}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black leading-tight text-white">{item.user.displayName}</span>
          {/* Una sola línea: si "· hace 2 meses" no cabe entero, pasa a la
              segunda, que no se ve. Nunca sale cortado con puntos. */}
          <span className="mt-1 flex h-4 flex-wrap overflow-hidden text-xs font-semibold leading-4 text-zinc-400 transition-colors group-hover/link:text-zinc-300">
            <span className="min-w-0 max-w-full truncate">@{item.user.username}</span>
            {when ? <span className="whitespace-nowrap">&nbsp;· {when}</span> : null}
          </span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400 transition duration-300 group-hover/link:bg-white/10 group-hover/link:text-white">
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </Link>

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
