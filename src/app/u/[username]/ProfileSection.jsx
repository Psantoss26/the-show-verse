"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  Eye,
  Filter,
  Grid2X2,
  Heart,
  ImageOff,
  LayoutGrid,
  Layers3,
  List,
  ListPlus,
  ListVideo,
  Loader2,
  MessageSquare,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  X,
} from "lucide-react";
import MemberRow from "@/components/social/MemberRow";
import PosterTile from "@/components/social/PosterTile";
import Stars from "@/components/social/Stars";
import { titleStateKey, useViewerTitleStates } from "@/components/social/useViewerTitleStates";
import { useAuth } from "@/context/AuthContext";

// Configuración por sección: tipo de layout + textos.
const SECTIONS = {
  watched: { layout: "posters", showStars: true, empty: "Sin visionados." },
  watchlist: { layout: "posters", showStars: false, empty: "La watchlist está vacía." },
  favorites: { layout: "posters", showStars: false, empty: "Sin favoritos." },
  ratings: { layout: "posters", showStars: true, empty: "Sin puntuaciones." },
  reviews: { layout: "reviews", empty: "Sin reseñas." },
  lists: { layout: "lists", empty: "Sin listas públicas." },
  activity: { layout: "activity", empty: "Aún no hay actividad pública." },
};

const PROFILE_MENU_SECTIONS = new Set(["activity", "watched", "favorites", "watchlist", "ratings"]);
const profileSectionPreferences = new Map();

function getItemTitle(item) {
  return String(item?.title || item?.name || item?.movie?.title || item?.show?.title || item?.listName || "");
}

function getItemMediaType(item) {
  const type = item?.mediaType || item?.media_type || item?.type || item?.movie?.mediaType || item?.show?.mediaType;
  return type === "tv" || type === "show" || type === "episode" ? "tv" : "movie";
}

function getItemDate(item) {
  const value = item?.createdAt || item?.created_at || item?.updatedAt || item?.updated_at || item?.watchedAt || item?.watched_at || item?.addedAt || item?.added_at || item?.ratedAt || item?.rated_at || item?.lastWatchedAt || item?.last_watched_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getItemRating(item) {
  const rating = Number(item?.rating ?? item?.userRating ?? item?.user_rating ?? 0);
  return Number.isFinite(rating) ? rating : 0;
}

function activityTypeLabel(type) {
  return {
    watched: "Visionados",
    watchlist: "Pendientes",
    favorite: "Favoritos",
    rating: "Puntuaciones",
    review: "Reseñas",
    list: "Listas",
    list_item: "Elementos de listas",
  }[type] || "Otros";
}

function groupProfileItems(items, groupBy, section) {
  if (groupBy === "none") return [{ key: "all", label: null, items }];
  const groups = new Map();

  for (const item of items) {
    let key = "unknown";
    let label = "Sin información";
    if (groupBy === "type") {
      key = getItemMediaType(item);
      label = key === "tv" ? "Series" : "Películas";
    } else if (groupBy === "year") {
      const date = getItemDate(item);
      key = date ? String(date.getFullYear()) : "unknown";
      label = date ? String(date.getFullYear()) : "Sin fecha";
    } else if (groupBy === "month") {
      const date = getItemDate(item);
      key = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : "unknown";
      label = date
        ? new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" })
            .format(date)
            .toLocaleUpperCase("es-ES")
        : "SIN FECHA";
    } else if (groupBy === "rating") {
      const stars = Math.max(1, Math.min(5, Math.ceil(getItemRating(item) / 2)));
      key = String(stars);
      label = `${stars} ${stars === 1 ? "estrella" : "estrellas"}`;
    } else if (groupBy === "action" && section === "activity") {
      key = item?.type || "other";
      label = activityTypeLabel(item?.type);
    }
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(item);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (groupBy === "year" || groupBy === "month") return b.key.localeCompare(a.key, "es", { numeric: true });
    if (groupBy === "rating") return Number(b.key) - Number(a.key);
    return a.label.localeCompare(b.label, "es");
  });
}

function sectionMenuOptions(section) {
  const activity = section === "activity";
  const ratings = section === "ratings";
  return {
    filters: activity
      ? [
          ["all", "Toda la actividad"],
          ["watched", "Visionados"],
          ["watchlist", "Pendientes"],
          ["favorite", "Favoritos"],
          ["rating", "Puntuaciones"],
          ["review", "Reseñas"],
          ["list", "Listas"],
        ]
      : [["all", "Todo"], ["movie", "Películas"], ["tv", "Series"]],
    sorts: [
      ["recent", "Más recientes"],
      ["oldest", "Más antiguos"],
      ["title-asc", "Título A–Z"],
      ["title-desc", "Título Z–A"],
      ...(ratings ? [["rating-desc", "Mejor puntuación"], ["rating-asc", "Menor puntuación"]] : []),
    ],
    groups: [
      ["month", "Mes"],
      ["none", "Sin agrupar"],
      ["year", "Año"],
      ...(activity ? [["action", "Acción"]] : [["type", "Tipo"]]),
      ...(ratings ? [["rating", "Estrellas"]] : []),
    ],
    views: activity ? [["list", "Lista", List], ["compact", "Compacta", LayoutGrid]] : [["grid", "Cuadrícula", Grid2X2], ["compact", "Compacta", LayoutGrid], ["list", "Lista", List]],
  };
}

function getSectionPreference(cacheKey, section) {
  return profileSectionPreferences.get(cacheKey) || {
    query: "",
    filter: "all",
    sort: "recent",
    group: "none",
    autoMonthGroup: false,
    view: section === "activity" ? "list" : "grid",
  };
}
const profileSectionCache = new Map();

function profileSectionCacheKey(username, section) {
  return `${String(username || "").trim().toLocaleLowerCase()}:${section}`;
}

function relativeActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function ProfileMenuDropdown({ label, valueLabel, icon: Icon, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - 24);
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - width - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width,
      maxHeight: Math.max(64, Math.min(448, availableBelow)),
      zIndex: 1000,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuPosition();
    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div ref={ref} className="relative min-w-0 w-full">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 min-w-0 w-full items-center justify-between gap-3 overflow-clip rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm text-zinc-200 shadow-lg transition hover:from-white/15 hover:to-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span className="hidden text-xs font-bold uppercase tracking-wider text-zinc-500 sm:inline">{label}:</span>
          <span className="hidden min-w-0 truncate font-semibold text-white sm:inline">{valueLabel}</span>
          <span className="min-w-0 truncate font-semibold text-white sm:hidden">{valueLabel}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && menuStyle ? (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              aria-label={label}
              className="overflow-y-auto overflow-x-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 p-2 shadow-2xl backdrop-blur-2xl [scrollbar-color:#3f3f46_transparent]"
              style={{ ...menuStyle, scrollbarWidth: "thin", scrollbarGutter: "stable", overscrollBehavior: "contain" }}
            >
              {options.map(([optionValue, optionLabel]) => {
                const active = value === optionValue;
                return (
                  <button
                    key={optionValue}
                    type="button"
                    onClick={() => {
                      onChange(optionValue);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      active ? "bg-white/10 font-bold text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="font-medium">{optionLabel}</span>
                    {active ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function ProfileViewMode({ value, options, onChange }) {
  return (
    <div className="flex h-11 w-full items-center gap-1 overflow-clip rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 p-1 shadow-lg">
      {options.map(([optionValue, label, Icon]) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={`flex h-full min-w-0 flex-1 items-center justify-center overflow-clip rounded-xl px-2.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 ${
              active
                ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-inner shadow-emerald-950/35"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
            aria-pressed={active}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProfileSectionToolbar({ section, controls, onChange }) {
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const options = sectionMenuOptions(section);
  const filterLabel = options.filters.find(([value]) => value === controls.filter)?.[1] || "Todo";
  const sortLabel = options.sorts.find(([value]) => value === controls.sort)?.[1] || "Más recientes";
  const groupLabel = options.groups.find(([value]) => value === controls.group)?.[1] || "Sin agrupar";
  const handleViewChange = (view) => {
    if (section !== "watched") {
      onChange({ view });
      return;
    }
    if (view === "list" && controls.group === "none") {
      onChange({ view, group: "month", autoMonthGroup: true });
      return;
    }
    if (view !== "list" && controls.autoMonthGroup) {
      onChange({ view, group: "none", autoMonthGroup: false });
      return;
    }
    onChange({ view });
  };

  return (
    <section aria-label="Opciones de la sección" className="relative z-20 mb-5 space-y-2 sm:mb-6">
      <div className="flex gap-2 lg:hidden">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar en esta sección</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" aria-hidden="true" />
          <input
            value={controls.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Buscar..."
            className="h-11 w-full rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-10 text-base text-white shadow-lg transition placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
          />
          {controls.query ? (
            <button
              type="button"
              onClick={() => onChange({ query: "" })}
              className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          onClick={() => setMobileControlsOpen((current) => !current)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-clip rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/70 ${
            mobileControlsOpen ? "text-emerald-400" : "text-zinc-200 hover:bg-white/10"
          }`}
          aria-expanded={mobileControlsOpen}
          aria-controls={`profile-menu-${section}`}
          aria-label="Mostrar opciones"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="hidden grid-cols-1 gap-2 lg:grid lg:grid-cols-[minmax(13rem,1.35fr)_repeat(3,minmax(10rem,1fr))_minmax(10rem,0.8fr)]">
        <label className="relative min-w-0">
          <span className="sr-only">Buscar en esta sección</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" aria-hidden="true" />
          <input
            value={controls.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Buscar por título..."
            className="h-11 w-full rounded-2xl bg-black/30 bg-gradient-to-br from-white/10 to-white/5 py-2.5 pl-10 pr-10 text-sm text-white shadow-lg transition placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
          />
          {controls.query ? (
            <button type="button" onClick={() => onChange({ query: "" })} className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Limpiar búsqueda">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
        <ProfileMenuDropdown label={section === "activity" ? "Acción" : "Tipo"} valueLabel={filterLabel} icon={Filter} options={options.filters} value={controls.filter} onChange={(filter) => onChange({ filter })} />
        <ProfileMenuDropdown label="Ordenar" valueLabel={sortLabel} icon={ArrowUpDown} options={options.sorts} value={controls.sort} onChange={(sort) => onChange({ sort })} />
        <ProfileMenuDropdown label="Agrupar" valueLabel={groupLabel} icon={Layers3} options={options.groups} value={controls.group} onChange={(group) => onChange({ group })} />
        <ProfileViewMode value={controls.view} options={options.views} onChange={handleViewChange} />
      </div>

      <div id={`profile-menu-${section}`} className={`${mobileControlsOpen ? "grid" : "hidden"} grid-cols-2 gap-2 lg:hidden`}>
        <ProfileMenuDropdown label={section === "activity" ? "Acción" : "Tipo"} valueLabel={filterLabel} icon={Filter} options={options.filters} value={controls.filter} onChange={(filter) => onChange({ filter })} />
        <ProfileMenuDropdown label="Ordenar" valueLabel={sortLabel} icon={ArrowUpDown} options={options.sorts} value={controls.sort} onChange={(sort) => onChange({ sort })} />
        <ProfileMenuDropdown label="Agrupar" valueLabel={groupLabel} icon={Layers3} options={options.groups} value={controls.group} onChange={(group) => onChange({ group })} />
        <ProfileViewMode value={controls.view} options={options.views} onChange={handleViewChange} />
      </div>
    </section>
  );
}

function ActivityAvatar({ actor }) {
  const name = actor?.displayName || actor?.username || "Usuario";
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900 text-[10px] font-black text-zinc-300">
      {actor?.avatarUrl ? (
        <OptimizedImage src={actor.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function ActivityTitle({ item, className = "" }) {
  if (!item.tmdbId || !item.mediaType) return null;
  const type = item.mediaType === "tv" ? "tv" : "movie";
  return (
    <Link href={`/details/${type}/${item.tmdbId}`} className={`font-bold text-white transition-colors hover:text-emerald-300 ${className}`}>
      {item.title || "Ver ficha"}
    </Link>
  );
}

function ActivityReview({ item, actor, compact = false }) {
  const [showSpoiler, setShowSpoiler] = useState(false);
  const type = item.mediaType === "tv" ? "tv" : "movie";
  const src = item.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null;

  return (
    <article className={`rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-transparent shadow-[0_16px_38px_rgba(0,0,0,0.2)] ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="flex gap-3 sm:gap-4">
        <ActivityAvatar actor={actor} />
        <Link href={`/details/${type}/${item.tmdbId}`} className="hidden h-28 w-[76px] shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 sm:block">
          {src ? (
            <OptimizedImage src={src} alt={item.title || ""} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-zinc-700"><ImageOff className="h-5 w-5" /></span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-300">{actor?.displayName || actor?.username || "Este usuario"}</span>
            <span>ha reseñado</span>
            <ActivityTitle item={item} />
            {typeof item.rating === "number" && <Stars rating={item.rating} />}
          </div>
          {item.spoiler && !showSpoiler ? (
            <button type="button" onClick={() => setShowSpoiler(true)} className="mt-3 text-xs font-bold uppercase tracking-widest text-amber-300 transition-colors hover:text-amber-200">
              Contiene spoilers — mostrar reseña
            </button>
          ) : (
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-200 sm:text-[15px] sm:leading-7">{item.body}</p>
          )}
          <time dateTime={item.createdAt} className="mt-3 block text-xs font-medium text-zinc-500">
            {relativeActivityTime(item.createdAt)}
          </time>
        </div>
      </div>
    </article>
  );
}

function ActivityRow({ item, actor, compact = false }) {
  const definitions = {
    watched: { icon: Eye, tone: "text-emerald-300", text: "ha visto" },
    watchlist: { icon: BookmarkPlus, tone: "text-sky-300", text: "ha añadido a Pendientes" },
    favorite: { icon: Heart, tone: "text-red-300", text: "ha añadido a Favoritos" },
    rating: { tone: "text-amber-300", text: "ha puntuado" },
    list: { icon: ListPlus, tone: "text-violet-300", text: "ha creado la lista" },
    list_item: { icon: ListPlus, tone: "text-violet-300", text: "ha añadido a una lista" },
  };
  const definition = definitions[item.type] || definitions.watched;
  const Icon = definition.icon;
  const episodeLabel = item.type === "watched" && item.season && item.episode
    ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")} de `
    : "";

  return (
    <article className={`flex min-w-0 items-center gap-3 border-b border-white/[0.07] px-3 last:border-b-0 sm:px-4 ${compact ? "py-2" : "py-3"}`}>
      <ActivityAvatar actor={actor} />
      {item.type === "rating" ? (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums ${definition.tone}`} aria-hidden="true">
          {item.rating}
        </span>
      ) : (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${definition.tone}`} aria-hidden="true">
          <Icon className={`h-5 w-5 ${item.type === "favorite" || item.type === "watchlist" ? "fill-current" : ""}`} />
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm leading-5 text-zinc-400">
        <span className="font-semibold text-zinc-300">{actor?.displayName || actor?.username || "Este usuario"}</span>{" "}
        {definition.text}{" "}
        {episodeLabel}
        {item.type === "list" ? (
          <Link href={`/lists/${item.id.replace("list:", "")}`} className="font-bold text-white hover:text-emerald-300">{item.name}</Link>
        ) : (
          <ActivityTitle item={item} />
        )}
        {item.type === "list_item" && item.listName ? <span className="text-zinc-500"> · {item.listName}</span> : null}
      </p>
      <time dateTime={item.createdAt} className="shrink-0 text-xs font-medium text-zinc-600" title={new Date(item.createdAt).toLocaleString("es-ES")}>
        {relativeActivityTime(item.createdAt)}
      </time>
    </article>
  );
}

function ActivityFeed({ items, actor, compact = false }) {
  return (
    <ol className={compact ? "space-y-1" : "space-y-3"} role="list">
      {items.map((item) => (
        <li key={item.id}>
          {item.type === "review" ? <ActivityReview item={item} actor={actor} compact={compact} /> : <ActivityRow item={item} actor={actor} compact={compact} />}
        </li>
      ))}
    </ol>
  );
}
const EMPTY_SOCIAL_RELATION = Object.freeze({ users: [], hasMore: false, offset: 0 });
const EMPTY_SOCIAL_RELATIONS = Object.freeze({
  followers: EMPTY_SOCIAL_RELATION,
  following: EMPTY_SOCIAL_RELATION,
});

function ReviewCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const type = item.mediaType === "tv" ? "tv" : "movie";
  const src = item.posterPath
    ? `https://image.tmdb.org/t/p/w185${item.posterPath}`
    : null;
  return (
    <div className="flex gap-4 rounded-xl bg-zinc-900/40 p-4 shadow-sm transition-all hover:bg-zinc-900/60">
      <Link
        href={`/details/${type}/${item.tmdbId}`}
        className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-sm"
      >
        {src ? (
          <OptimizedImage src={src} alt={item.title || ""} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/details/${type}/${item.tmdbId}`}
            className="text-sm font-bold text-white hover:text-emerald-400"
          >
            {item.title || "Ver ficha"}
          </Link>
          {typeof item.rating === "number" && <Stars rating={item.rating} />}
        </div>
        {item.spoiler && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 text-xs font-bold uppercase tracking-widest text-amber-400/80 hover:text-amber-300"
          >
            Contiene spoilers — mostrar
          </button>
        ) : (
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileListCard({ item }) {
  const posters = Array.isArray(item.previewPosters) ? item.previewPosters.slice(0, 5) : [];
  return (
    <Link
      href={`/lists/${item.id}`}
      className="group block rounded-xl bg-zinc-900/40 p-4 shadow-sm transition-all hover:bg-zinc-900/60"
    >
      <div className="mb-3 flex items-center gap-1.5">
        {posters.length ? (
          posters.map((p, i) => (
            <div
              key={i}
              className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-sm"
              style={{ marginLeft: i === 0 ? 0 : -14, zIndex: 10 - i }}
            >
              <OptimizedImage
                src={`https://image.tmdb.org/t/p/w185${p}`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))
        ) : (
          <div className="flex h-16 w-11 items-center justify-center rounded-xl bg-zinc-900 text-zinc-700">
            <ListVideo className="h-5 w-5" />
          </div>
        )}
      </div>
      <p className="truncate text-sm font-bold text-white group-hover:text-emerald-400">
        {item.name}
      </p>
      <p className="text-xs text-zinc-500">
        {item.itemCount} {item.itemCount === 1 ? "título" : "títulos"}
      </p>
      {item.description && (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.description}</p>
      )}
    </Link>
  );
}

function ProfileMediaListItem({ item, showStars, viewerState, compact = false }) {
  const type = getItemMediaType(item);
  const title = getItemTitle(item) || "Sin título";
  const src = item?.posterPath || item?.poster_path || item?.profilePosterPath;
  const date = getItemDate(item);
  const rating = viewerState?.rating ?? item?.userRating ?? item?.user_rating ?? item?.rating;
  const hasRating = Number(rating) > 0;
  const sizeClass = compact ? "h-14 w-10" : "h-20 w-[3.55rem]";

  return (
    <Link
      href={`/details/${type}/${item?.tmdbId || item?.id}`}
      className="group flex min-w-0 items-center gap-3 rounded-2xl bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-2.5 shadow-lg transition hover:from-white/[0.13] hover:to-white/[0.06]"
    >
      <span className={`${sizeClass} shrink-0 overflow-hidden rounded-xl bg-zinc-900`}>
        {src ? <OptimizedImage src={`https://image.tmdb.org/t/p/w185${src}`} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full w-full items-center justify-center text-zinc-700"><ImageOff className="h-4 w-4" /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white transition-colors group-hover:text-emerald-300">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          <span>{type === "tv" ? "Serie" : "Película"}</span>
          {date ? <span>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date)}</span> : null}
        </span>
        {showStars && hasRating ? <span className="mt-1.5 block"><Stars rating={Number(rating)} /></span> : null}
      </span>
      {!showStars && hasRating ? <span className="shrink-0 text-sm font-black tabular-nums text-amber-300">{rating}</span> : null}
    </Link>
  );
}

function ProfileGroupHeading({ children }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 border-b border-emerald-400/15 pb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
      {children}
    </h2>
  );
}

function ProfileMonthHeading({ children }) {
  return (
    <h2 className="mb-3 flex items-center gap-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-400/35" aria-hidden="true" />
      <span className="rounded-full bg-emerald-400/[0.09] px-3 py-1.5 shadow-sm">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-400/35" aria-hidden="true" />
    </h2>
  );
}

function ProfilePosterItems({ items, view, showStars, viewerTitleStates }) {
  if (view === "list") {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <ProfileMediaListItem
            key={`${getItemMediaType(item)}:${item.tmdbId || item.id}`}
            item={item}
            showStars={showStars}
            viewerState={viewerTitleStates[titleStateKey(item)]}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${view === "compact" ? "grid-cols-4 sm:grid-cols-5 md:grid-cols-8" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"}`}>
      {items.map((item) => (
        <PosterTile
          key={`${getItemMediaType(item)}:${item.tmdbId || item.id}`}
          item={item}
          showStars={showStars}
          viewerState={viewerTitleStates[titleStateKey(item)]}
          starIconClassName={view === "compact" ? "h-2.5 w-2.5" : undefined}
          compactIndicator={view === "compact"}
        />
      ))}
    </div>
  );
}

function ProfileContentSection({ username, section, actor }) {
  const { user: viewer } = useAuth();
  const config = SECTIONS[section];
  const cacheKey = profileSectionCacheKey(username, section);
  const [items, setItems] = useState(() => profileSectionCache.get(cacheKey)?.items || []);
  const [status, setStatus] = useState(() => profileSectionCache.has(cacheKey) ? "ready" : "loading");
  const [offset, setOffset] = useState(() => profileSectionCache.get(cacheKey)?.offset || 0);
  const [hasMore, setHasMore] = useState(() => profileSectionCache.get(cacheKey)?.hasMore || false);
  const [loadingMore, setLoadingMore] = useState(false);
  const viewerTitleStates = useViewerTitleStates(items, Boolean(viewer?.username));
  const menuEnabled = PROFILE_MENU_SECTIONS.has(section);
  const [controls, setControls] = useState(() => getSectionPreference(cacheKey, section));

  useEffect(() => {
    setControls(getSectionPreference(cacheKey, section));
  }, [cacheKey, section]);

  const updateControls = (patch) => {
    setControls((current) => {
      const isManualGroupChange = Object.hasOwn(patch, "group") && !Object.hasOwn(patch, "autoMonthGroup");
      const next = { ...current, ...patch, ...(isManualGroupChange ? { autoMonthGroup: false } : {}) };
      profileSectionPreferences.set(cacheKey, next);
      return next;
    });
  };

  const visibleItems = useMemo(() => {
    if (!menuEnabled) return items;
    const query = controls.query.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      const matchesQuery = !query || getItemTitle(item).toLocaleLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (controls.filter === "all") return true;
      if (section === "activity") {
        return controls.filter === "list"
          ? item?.type === "list" || item?.type === "list_item"
          : item?.type === controls.filter;
      }
      return getItemMediaType(item) === controls.filter;
    });

    return filtered.sort((a, b) => {
      if (controls.sort === "title-asc") return getItemTitle(a).localeCompare(getItemTitle(b), "es");
      if (controls.sort === "title-desc") return getItemTitle(b).localeCompare(getItemTitle(a), "es");
      if (controls.sort === "rating-desc") return getItemRating(b) - getItemRating(a);
      if (controls.sort === "rating-asc") return getItemRating(a) - getItemRating(b);
      const aDate = getItemDate(a)?.getTime() || 0;
      const bDate = getItemDate(b)?.getTime() || 0;
      return controls.sort === "oldest" ? aDate - bDate : bDate - aDate;
    });
  }, [controls, items, menuEnabled, section]);

  const effectiveGroup = controls.group;
  const groups = useMemo(
    () => (menuEnabled ? groupProfileItems(visibleItems, effectiveGroup, section) : [{ key: "all", label: null, items: visibleItems }]),
    [effectiveGroup, menuEnabled, section, visibleItems],
  );

  useEffect(() => {
    let cancelled = false;
    const cachedSection = profileSectionCache.get(cacheKey);
    if (cachedSection) {
      setItems(cachedSection.items);
      setHasMore(cachedSection.hasMore);
      setOffset(cachedSection.offset);
      setStatus("ready");
    } else {
      setStatus("loading");
      setItems([]);
      setHasMore(false);
      setOffset(0);
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(username)}/${section}?limit=30&offset=0`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const nextSection = {
          items: Array.isArray(data.items) ? data.items : [],
          hasMore: Boolean(data.hasMore),
          offset: Number(data.offset) || 0,
        };
        profileSectionCache.set(cacheKey, nextSection);
        setItems(nextSection.items);
        setHasMore(nextSection.hasMore);
        setOffset(nextSection.offset);
        setStatus("ready");
      } catch {
        if (!cancelled && !cachedSection) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, section, cacheKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/${section}?limit=30&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nextSection = {
        items: [...items, ...(Array.isArray(data.items) ? data.items : [])],
        hasMore: Boolean(data.hasMore),
        offset: Number(data.offset) || offset,
      };
      profileSectionCache.set(cacheKey, nextSection);
      setItems(nextSection.items);
      setHasMore(nextSection.hasMore);
      setOffset(nextSection.offset);
    } catch {
      // reintentar manualmente
    } finally {
      setLoadingMore(false);
    }
  };

  if (!config) return null;

  if (status === "loading") {
    return <div aria-busy="true" />;
  }

  if (status === "error") {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        No se pudo cargar esta sección. Inténtalo de nuevo.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <MessageSquare className="h-10 w-10 text-zinc-700" />
        <p className="text-sm text-zinc-500">{config.empty}</p>
      </div>
    );
  }

  return (
    <div>
      {menuEnabled ? <ProfileSectionToolbar section={section} controls={controls} onChange={updateControls} /> : null}

      {visibleItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Search className="h-8 w-8 text-zinc-700" aria-hidden="true" />
          <p className="text-sm text-zinc-500">No hay resultados con estos filtros.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              {group.label
                ? effectiveGroup === "month"
                  ? <ProfileMonthHeading>{group.label}</ProfileMonthHeading>
                  : <ProfileGroupHeading>{group.label}</ProfileGroupHeading>
                : null}
              {config.layout === "posters" ? (
                <ProfilePosterItems
                  items={group.items}
                  view={menuEnabled ? controls.view : "grid"}
                  showStars={config.showStars}
                  viewerTitleStates={viewerTitleStates}
                />
              ) : null}
              {config.layout === "reviews" ? (
                <div className="space-y-3">
                  {group.items.map((item) => <ReviewCard key={item.id} item={item} />)}
                </div>
              ) : null}
              {config.layout === "lists" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => <ProfileListCard key={item.id} item={item} />)}
                </div>
              ) : null}
              {config.layout === "activity" ? <ActivityFeed items={group.items} actor={actor} compact={controls.view === "compact"} /> : null}
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Cargar más
        </button>
      )}
    </div>
  );
}

function SocialColumn({ title, empty, relation, data, loadingMore, onLoadMore }) {
  return (
    <section className="min-w-0 rounded-xl bg-zinc-900/30 p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 border-b border-white/10 pb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
        {title}
      </h2>
      {data.users.length ? (
        <div className="space-y-2">
          {data.users.map((member) => (
            <MemberRow key={member.username} member={member} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-zinc-500">{empty}</p>
      )}
      {data.hasMore && (
        <button
          type="button"
          onClick={() => onLoadMore(relation)}
          disabled={loadingMore}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-zinc-300 transition-colors hover:bg-white/[0.09] disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Cargar más
        </button>
      )}
    </section>
  );
}

function ProfileSocialSection({ username }) {
  const cacheKey = profileSectionCacheKey(username, "social");
  const [relations, setRelations] = useState(() => profileSectionCache.get(cacheKey)?.relations || EMPTY_SOCIAL_RELATIONS);
  const [status, setStatus] = useState(() => profileSectionCache.has(cacheKey) ? "ready" : "loading");
  const [loadingMore, setLoadingMore] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const cachedSection = profileSectionCache.get(cacheKey);
    if (cachedSection) {
      setRelations(cachedSection.relations);
      setStatus("ready");
    } else {
      setStatus("loading");
      setRelations(EMPTY_SOCIAL_RELATIONS);
    }
    (async () => {
      try {
        const fetchRelation = async (relation) => {
          const response = await fetch(
            `/api/users/${encodeURIComponent(username)}/${relation}?limit=30&offset=0`,
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          return {
            users: Array.isArray(payload.users) ? payload.users : [],
            hasMore: Boolean(payload.hasMore),
            offset: Number(payload.offset) || 0,
          };
        };
        const [followers, following] = await Promise.all([
          fetchRelation("followers"),
          fetchRelation("following"),
        ]);
        if (!cancelled) {
          const nextRelations = { followers, following };
          profileSectionCache.set(cacheKey, { relations: nextRelations });
          setRelations(nextRelations);
          setStatus("ready");
        }
      } catch {
        if (!cancelled && !cachedSection) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, cacheKey]);

  const loadMore = async (relation) => {
    const current = relations[relation];
    if (!current?.hasMore || loadingMore) return;
    setLoadingMore(relation);
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(username)}/${relation}?limit=30&offset=${current.offset}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const nextRelations = {
        ...relations,
        [relation]: {
          users: [...current.users, ...(Array.isArray(payload.users) ? payload.users : [])],
          hasMore: Boolean(payload.hasMore),
          offset: Number(payload.offset) || current.offset,
        },
      };
      profileSectionCache.set(cacheKey, { relations: nextRelations });
      setRelations(nextRelations);
    } catch {
      // El botón se mantiene disponible para reintentar la carga.
    } finally {
      setLoadingMore(null);
    }
  };

  if (status === "loading") {
    return <div aria-busy="true" />;
  }

  if (status === "error") {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        No se pudo cargar la información social. Inténtalo de nuevo.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <SocialColumn
        title="Seguidores"
        relation="followers"
        data={relations.followers}
        empty="Todavía no tiene seguidores."
        loadingMore={loadingMore === "followers"}
        onLoadMore={loadMore}
      />
      <SocialColumn
        title="Siguiendo"
        relation="following"
        data={relations.following}
        empty="Todavía no sigue a nadie."
        loadingMore={loadingMore === "following"}
        onLoadMore={loadMore}
      />
    </div>
  );
}

export default function ProfileSection({ username, section, actor }) {
  if (section === "social") return <ProfileSocialSection username={username} />;
  return <ProfileContentSection username={username} section={section} actor={actor} />;
}
