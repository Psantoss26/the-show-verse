"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Image,
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
import usePreviewOpen from "@/components/preview/usePreviewOpen";

// Configuración por sección: tipo de layout + textos.
const SECTIONS = {
  watched: { layout: "posters", showStars: true, empty: "Sin visionados." },
  watchlist: { layout: "posters", showStars: false, empty: "La watchlist está vacía." },
  favorites: { layout: "posters", showStars: false, empty: "Sin favoritos." },
  ratings: { layout: "posters", showStars: true, empty: "Sin puntuaciones." },
  reviews: { layout: "reviews", empty: "Sin reseñas." },
  lists: { layout: "lists", empty: "Sin listas." },
  activity: { layout: "activity", empty: "Aún no hay actividad pública." },
};

const PROFILE_MENU_SECTIONS = new Set(["activity", "watched", "favorites", "watchlist", "ratings"]);
const profileSectionPreferences = new Map();
const profileViewPreferences = new Map();
const PROFILE_VIEW_STORAGE_PREFIX = "showverse:profile:view-mode:v1:";

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

function hasActivityPoster(item) {
  return typeof item?.posterPath === "string" && item.posterPath.trim().length > 0;
}

// Los eventos de Perfil pueden representar un episodio sin cambiar el tipo
// público de la serie (`tv`). Conservamos la serie como ficha padre, pero la
// preview debe recibir su temporada y episodio concretos.
function getEpisodePreview(item) {
  const mediaType = item?.mediaType || item?.media_type || item?.type;
  if (mediaType !== "tv" && mediaType !== "show" && mediaType !== "episode") return undefined;

  const rawSeason = item?.seasonNumber ?? item?.season_number ?? item?.season;
  const rawEpisode = item?.episodeNumber ?? item?.episode_number ?? item?.episode;
  if (rawSeason == null || rawSeason === "" || rawEpisode == null || rawEpisode === "") return undefined;

  const seasonNumber = Number(rawSeason);
  const episodeNumber = Number(rawEpisode);
  const showId = item?.showId ?? item?.show_id ?? item?.tmdbId ?? item?.tmdb_id ?? item?.id;

  if (!Number.isInteger(seasonNumber) || seasonNumber < 0 || !Number.isInteger(episodeNumber) || episodeNumber < 0 || showId == null) {
    return undefined;
  }

  return {
    showId,
    seasonNumber,
    episodeNumber,
    name: item?.episodeTitle ?? item?.episode_title ?? item?.episodeName ?? item?.episode_name ?? null,
    still_path: item?.stillPath ?? item?.still_path ?? null,
    showName: item?.showName ?? item?.show_name ?? item?.showTitle ?? item?.show_title ?? item?.seriesName ?? item?.series_name ?? item?.title ?? null,
  };
}

function getDiaryEpisode(item) {
  const season = Number(item?.season ?? item?.seasonNumber ?? item?.season_number);
  const episode = Number(item?.episode ?? item?.episodeNumber ?? item?.episode_number);
  if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 0) return null;
  return { season, episode };
}

function formatDiaryEpisode(episode) {
  return episode ? `T${episode.season} · E${episode.episode}` : null;
}

function formatDiaryEpisodeRange(items) {
  const episodes = items.map(getDiaryEpisode).filter(Boolean);
  if (episodes.length < 2) return null;
  const seasons = [...new Set(episodes.map((entry) => entry.season))];
  if (seasons.length === 1) {
    const numbers = episodes.map((entry) => entry.episode).sort((a, b) => a - b);
    return `T${seasons[0]} · E${numbers[0]}–E${numbers[numbers.length - 1]}`;
  }
  const first = episodes[0];
  const last = episodes[episodes.length - 1];
  return `T${first.season} E${first.episode} – T${last.season} E${last.episode}`;
}

// Mismo criterio que Historial: sólo se colapsan episodios consecutivos de la
// misma serie; las películas y cada episodio siguen siendo registros reales.
function collapseDiaryEpisodes(items) {
  const result = [];
  for (const item of items) {
    const episode = getDiaryEpisode(item);
    const previous = result.at(-1);
    const previousEpisodes = previous?.episodeGroup;
    const sameShow =
      getItemMediaType(item) === "tv" &&
      episode &&
      previousEpisodes &&
      getItemMediaType(previous) === "tv" &&
      Number(previous.tmdbId) === Number(item.tmdbId);

    if (sameShow) {
      previous.episodeGroup.push(item);
      continue;
    }

    result.push({ ...item, ...(episode ? { episodeGroup: [item] } : {}) });
  }
  return result;
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
    views: activity
      ? [["list", "Lista", List], ["poster-list", "Lista con póster", Image]]
      : [["grid", "Cuadrícula", Grid2X2], ["compact", "Compacta", LayoutGrid], ["list", "Lista", List]],
  };
}

function profileViewPreferenceKey(username) {
  return String(username || "").trim().toLocaleLowerCase();
}

function supportsProfileView(section, view) {
  return sectionMenuOptions(section).views.some(([value]) => value === view);
}

function readStoredProfileView(profileKey) {
  if (!profileKey || typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(`${PROFILE_VIEW_STORAGE_PREFIX}${profileKey}`);
    return value === "grid" || value === "compact" || value === "list" || value === "poster-list" ? value : null;
  } catch {
    return null;
  }
}

function saveProfileView(profileKey, view) {
  if (!profileKey || !view) return;
  profileViewPreferences.set(profileKey, view);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PROFILE_VIEW_STORAGE_PREFIX}${profileKey}`, view);
  } catch {
    // El modo sigue vivo durante la sesión aunque el almacenamiento no exista.
  }
}

function getSectionPreference(cacheKey, section, profileKey) {
  const usesDiaryDefaults = section === "watched";
  const current = profileSectionPreferences.get(cacheKey);
  const fallbackView = section === "activity" || usesDiaryDefaults ? "list" : "grid";
  const sharedView = profileViewPreferences.get(profileKey);
  const view = supportsProfileView(section, sharedView)
    ? sharedView
    : supportsProfileView(section, current?.view)
      ? current.view
      : fallbackView;
  return {
    query: "",
    filter: "all",
    sort: "recent",
    group: usesDiaryDefaults ? "month" : "none",
    autoMonthGroup: usesDiaryDefaults,
    ...current,
    view,
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
  const previewClick = usePreviewOpen();
  if (!item.tmdbId || !item.mediaType) return null;
  const type = item.mediaType === "tv" || item.mediaType === "episode" ? "tv" : "movie";
  return (
    <Link
      href={`/details/${type}/${item.tmdbId}`}
      onClick={previewClick(item, { mediaType: type, episode: getEpisodePreview(item) })}
      className={`font-bold text-white transition-colors hover:text-emerald-300 ${className}`}
    >
      {item.title || "Ver ficha"}
    </Link>
  );
}

function ActivityPoster({ item, className = "" }) {
  const previewClick = usePreviewOpen();
  const type = item?.mediaType === "tv" || item?.mediaType === "episode" ? "tv" : "movie";
  const src = item?.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null;
  const poster = src ? (
    <OptimizedImage src={src} alt={item?.title || ""} className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-zinc-700">
      <ImageOff className="h-4 w-4" aria-hidden="true" />
    </span>
  );

  if (!item?.tmdbId || !item?.mediaType) {
    return <span aria-hidden="true" className={`${className} flex items-center justify-center bg-zinc-900`}>{poster}</span>;
  }

  return (
    <Link
      href={`/details/${type}/${item.tmdbId}`}
      onClick={previewClick(item, { mediaType: type, episode: getEpisodePreview(item) })}
      className={`${className} shrink-0 overflow-hidden bg-zinc-900 ring-1 ring-white/10 transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70`}
      aria-label={`Ver ${item.title || "ficha"}`}
    >
      {poster}
    </Link>
  );
}

function ActivityReview({ item, actor, compact = false, posterList = false }) {
  const [showSpoiler, setShowSpoiler] = useState(false);
  const previewClick = usePreviewOpen();
  const type = item.mediaType === "tv" ? "tv" : "movie";
  const src = item.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null;

  return (
    <article className={`rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-transparent shadow-[0_16px_38px_rgba(0,0,0,0.2)] ${compact ? "p-3" : "p-4 sm:p-5"}`}>
      <div className="flex gap-3 sm:gap-4">
        {posterList ? (
          <ActivityPoster item={item} className="h-32 w-[5.4rem] rounded-lg" />
        ) : (
          <>
            <ActivityAvatar actor={actor} />
            <Link href={`/details/${type}/${item.tmdbId}`} onClick={previewClick(item)} className="hidden h-28 w-[76px] shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 sm:block">
              {src ? (
                <OptimizedImage src={src} alt={item.title || ""} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-zinc-700"><ImageOff className="h-5 w-5" /></span>
              )}
            </Link>
          </>
        )}
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

function ActivityRow({ item, actor, compact = false, posterList = false }) {
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
  const actionText = item.type === "watched" && item.completedShow
    ? "ha completado"
    : definition.text;
  const episodeLabel = item.type === "watched" && item.season && item.episode
    ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")} de `
    : "";

  return (
    <article className={`flex min-w-0 items-center gap-3 border-b border-white/[0.07] px-3 last:border-b-0 sm:px-4 ${compact ? "py-2" : "py-3"}`}>
      {posterList ? (
        <ActivityPoster item={item} className="h-[4.25rem] w-[2.85rem] rounded-lg" />
      ) : (
        <ActivityAvatar actor={actor} />
      )}
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
        {actionText}{" "}
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

function ActivityFeed({ items, actor, compact = false, posterList = false }) {
  return (
    <ol className={compact ? "space-y-1" : "space-y-3"} role="list">
      {items.map((item) => (
        <li key={item.id}>
          {item.type === "review" ? (
            <ActivityReview item={item} actor={actor} compact={compact} posterList={posterList} />
          ) : (
            <ActivityRow item={item} actor={actor} compact={compact} posterList={posterList} />
          )}
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
  const previewClick = usePreviewOpen();
  const type = item.mediaType === "tv" ? "tv" : "movie";
  const src = item.posterPath
    ? `https://image.tmdb.org/t/p/w185${item.posterPath}`
    : null;
  return (
    <div className="flex gap-4 rounded-xl bg-zinc-900/40 p-4 shadow-sm transition-all hover:bg-zinc-900/60">
      <Link
        href={`/details/${type}/${item.tmdbId}`}
        onClick={previewClick(item)}
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
            onClick={previewClick(item)}
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
  const previewClick = usePreviewOpen();
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
      onClick={previewClick(item, { mediaType: type })}
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

function profileGridColumnCount(view) {
  if (typeof window === "undefined") return 0;
  const width = window.innerWidth;
  if (view === "compact") {
    if (width >= 768) return 8;
    if (width >= 640) return 5;
    return 4;
  }
  if (width >= 768) return 6;
  if (width >= 640) return 4;
  return 3;
}

function ProfileContentSection({ username, section, actor }) {
  const { user: viewer } = useAuth();
  const config = SECTIONS[section];
  const cacheKey = profileSectionCacheKey(username, section);
  const profileKey = profileViewPreferenceKey(username);
  const [items, setItems] = useState(() => profileSectionCache.get(cacheKey)?.items || []);
  const [status, setStatus] = useState(() => profileSectionCache.has(cacheKey) ? "ready" : "loading");
  const [offset, setOffset] = useState(() => profileSectionCache.get(cacheKey)?.offset || 0);
  const [hasMore, setHasMore] = useState(() => profileSectionCache.get(cacheKey)?.hasMore || false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const viewerTitleStates = useViewerTitleStates(items, Boolean(viewer?.username));
  const menuEnabled = PROFILE_MENU_SECTIONS.has(section);
  const [controls, setControls] = useState(() => getSectionPreference(cacheKey, section, profileKey));

  // La lectura se realiza antes del primer pintado del navegador para que la
  // cuadrícula/lista/compacta guardada no llegue a verse como el modo por
  // defecto al entrar o volver a una sección.
  useLayoutEffect(() => {
    const storedView = readStoredProfileView(profileKey);
    if (storedView) profileViewPreferences.set(profileKey, storedView);
    setControls(getSectionPreference(cacheKey, section, profileKey));
  }, [cacheKey, profileKey, section]);

  const updateControls = (patch) => {
    setControls((current) => {
      const isManualGroupChange = Object.hasOwn(patch, "group") && !Object.hasOwn(patch, "autoMonthGroup");
      const next = { ...current, ...patch, ...(isManualGroupChange ? { autoMonthGroup: false } : {}) };
      profileSectionPreferences.set(cacheKey, next);
      if (Object.hasOwn(patch, "view")) saveProfileView(profileKey, next.view);
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

  // El modo con póster es una representación de títulos, no del registro
  // textual de actividad. Las acciones como crear una lista no tienen artwork
  // asociado y no deben producir una tarjeta vacía.
  const displayItems = useMemo(
    () => (
      section === "activity" && controls.view === "poster-list"
        ? visibleItems.filter(hasActivityPoster)
        : visibleItems
    ),
    [controls.view, section, visibleItems],
  );

  const effectiveGroup = controls.group;
  const groups = useMemo(
    () => (menuEnabled ? groupProfileItems(displayItems, effectiveGroup, section) : [{ key: "all", label: null, items: displayItems }]),
    [displayItems, effectiveGroup, menuEnabled, section],
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
    setLoadMoreError(false);
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

  const loadMore = useCallback(async ({ limit = 30 } = {}) => {
    if (loadingMoreRef.current || !hasMore) return;
    const pageSize = Math.min(30, Math.max(1, Number(limit) || 30));
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/${section}?limit=${pageSize}&offset=${offset}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const nextHasMore = Boolean(data.hasMore);
      const nextOffset = Number(data.offset) || offset;
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems((currentItems) => {
        const mergedItems = [...currentItems, ...nextItems];
        profileSectionCache.set(cacheKey, {
          items: mergedItems,
          hasMore: nextHasMore,
          offset: nextOffset,
        });
        return mergedItems;
      });
      setHasMore(nextHasMore);
      setOffset(nextOffset);
    } catch {
      setLoadMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cacheKey, hasMore, offset, section, username]);

  // El historial carga al acercarse al final; las secciones paginadas del
  // perfil usan el mismo patrón y conservan un botón solo para reintentar un
  // fallo de red.
  useEffect(() => {
    if (
      status !== "ready" ||
      !hasMore ||
      loadingMore ||
      loadMoreError ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }
    const sentinel = loadMoreRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { threshold: 0.01, rootMargin: "0px 0px 360px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadMoreError, loadingMore, status]);

  // En grid, una vista con más columnas puede dejar la última fila incompleta
  // aunque ya hubiese una página cargada. Pedimos exactamente las tarjetas que
  // faltan para completar esa fila cuando haya más resultados disponibles.
  useEffect(() => {
    const canCompleteGrid =
      config?.layout === "posters" &&
      effectiveGroup === "none" &&
      (controls.view === "grid" || controls.view === "compact") &&
      hasMore &&
      !loadingMore &&
      !loadMoreError;
    const columns = canCompleteGrid ? profileGridColumnCount(controls.view) : 0;
    const remainder = columns > 0 ? visibleItems.length % columns : 0;
    if (columns > 0 && remainder > 0) {
      loadMore({ limit: columns - remainder });
    }
  }, [config?.layout, controls.view, effectiveGroup, hasMore, loadMore, loadMoreError, loadingMore, visibleItems.length]);

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

      {displayItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Search className="h-8 w-8 text-zinc-700" aria-hidden="true" />
          <p className="text-sm text-zinc-500">
            {section === "activity" && controls.view === "poster-list"
              ? "No hay acciones con portada para mostrar."
              : "No hay resultados con estos filtros."}
          </p>
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
              {config.layout === "activity" ? (
                <ActivityFeed
                  items={group.items}
                  actor={actor}
                  posterList={controls.view === "poster-list"}
                />
              ) : null}
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={loadMoreRef} className="mt-6 flex min-h-10 w-full items-center justify-center" aria-live="polite">
          {loadingMore ? (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" aria-hidden="true" />
              Cargando más...
            </span>
          ) : loadMoreError ? (
            <button
              type="button"
              onClick={() => loadMore()}
              className="text-sm font-bold text-emerald-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            >
              Reintentar cargar más
            </button>
          ) : (
            <span className="sr-only">Desplázate para cargar más títulos.</span>
          )}
        </div>
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
