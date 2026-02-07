// /src/app/lists/page.jsx
"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
  useTransition,
  memo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";

import useTmdbLists from "@/lib/hooks/useTmdbLists";
import { getListDetails } from "@/lib/api/tmdbLists";
import { getExternalIds } from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { useAuth } from "@/context/AuthContext";

import {
  Loader2,
  Plus,
  Trash2,
  ListVideo,
  RefreshCcw,
  Search,
  ArrowUpDown,
  LayoutGrid,
  StretchHorizontal,
  Rows,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
  Layers,
  Filter,
} from "lucide-react";
import useTraktLists from "@/lib/hooks/useTraktLists";

// ================== UTILS & CACHE ==================
const OMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const imdbRatingsCache = new Map();
const PRELOAD_FIRST_N_LISTS = 3;

const readOmdbCache = (imdbId) => {
  if (!imdbId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`showverse:omdb:${imdbId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      fresh: Date.now() - (parsed?.t || 0) < OMDB_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
};
const writeOmdbCache = (imdbId, patch) => {
  if (!imdbId || typeof window === "undefined") return;
  try {
    const prev = readOmdbCache(imdbId) || {};
    const next = {
      t: Date.now(),
      imdbRating: patch?.imdbRating ?? prev?.imdbRating ?? null,
    };
    window.sessionStorage.setItem(
      `showverse:omdb:${imdbId}`,
      JSON.stringify(next),
    );
  } catch {
    // ignore
  }
};

/* --- Hook SIMPLE: layout móvil SOLO por anchura (NO por touch) --- */
const useIsMobileLayout = (breakpointPx = 768) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width:${breakpointPx - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width:${breakpointPx - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();

    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);

      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, [breakpointPx]);

  return isMobile;
};

/* --- InView: lazy load por proximidad al viewport --- */
const useInView = ({ rootMargin = "320px 0px", threshold = 0.01 } = {}) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin, threshold },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, threshold]);

  return [ref, inView];
};

function TmdbImg({ filePath, size = "w780", alt, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [filePath]);

  if (!filePath || failed) {
    return (
      <div
        className={`bg-zinc-900 flex items-center justify-center ${className}`}
      >
        <ListVideo className="w-8 h-8 text-zinc-800" />
      </div>
    );
  }

  return (
    <img
      src={`https://image.tmdb.org/t/p/${size}${filePath}`}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onError={() => setFailed(true)}
    />
  );
}

function ListCoverBackdropCollage({ items = [], alt = "" }) {
  const backdrops = [];
  const seen = new Set();
  for (const item of items) {
    const p = item.backdrop_path || item.poster_path;
    if (!p || seen.has(p)) continue;
    seen.add(p);
    backdrops.push(p);
    if (backdrops.length >= 4) break;
  }

  if (!backdrops.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/50 text-zinc-600 gap-2">
        <ListVideo className="w-10 h-10 opacity-50" />
      </div>
    );
  }

  if (backdrops.length === 1) {
    return (
      <TmdbImg
        filePath={backdrops[0]}
        size="w780"
        alt={alt}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
    );
  }

  if (backdrops.length === 2) {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-0.5">
        <div className="overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[0]}
            alt={alt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[1]}
            alt={alt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      </div>
    );
  }

  if (backdrops.length === 3) {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
        <div className="row-span-2 overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[0]}
            alt={alt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden w-full h-full">
          <TmdbImg
            filePath={backdrops[1]}
            alt={alt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden w-full h-full">
          <TmdbImg
            filePath={backdrops[2]}
            alt={alt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
      {backdrops.slice(0, 4).map((p, i) => (
        <div
          key={`${p}-${i}`}
          className="overflow-hidden w-full h-full relative"
        >
          <TmdbImg
            filePath={p}
            alt={alt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      ))}
    </div>
  );
}

function Dropdown({ valueLabel, icon: Icon, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div
      ref={ref}
      className={`relative ${open ? "z-50" : "z-10"} ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 inline-flex items-center justify-between gap-2 px-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-sm text-zinc-300"
      >
        <div className="flex items-center gap-2 truncate">
          {Icon && <Icon className="w-4 h-4 text-zinc-500" />}
          <span className="font-medium text-white truncate">{valueLabel}</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-zinc-800 bg-[#121212] shadow-2xl overflow-hidden"
          >
            <div className="p-1 space-y-0.5">
              {children({ close: () => setOpen(false) })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropdownItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-lg text-left text-xs sm:text-sm transition flex items-center justify-between
        ${active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}`}
    >
      <span className="font-medium">{children}</span>
      {active && <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />}
    </button>
  );
}

// --- CREATION MODAL ---
function CreateListModal({ open, onClose, onCreate, creating, error }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-[#0b0b0b] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-bold text-white">Nueva Lista</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/5 transition"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">
              Nombre
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500 outline-none transition"
              placeholder="Mi lista de favoritos..."
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">
              Descripción (opcional)
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-purple-500 outline-none transition resize-none h-24"
              placeholder="De qué trata esta lista..."
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onCreate(name, desc);
                setName("");
                setDesc("");
              }}
              disabled={creating || !name.trim()}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />} Crear
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const ListItemCard = memo(function ListItemCard({ item, isMobile }) {
  const [imdbScore, setImdbScore] = useState(null);

  const title = item?.title || item?.name || "—";
  const date = item?.release_date || item?.first_air_date;
  const year = date ? date.slice(0, 4) : "";
  const mediaType = item?.media_type || (item?.title ? "movie" : "tv");
  const href = `/details/${mediaType}/${item.id}`;
  const posterPath = item?.poster_path || item?.backdrop_path || null;

  const prefetchImdb = useCallback(async () => {
    if (!item?.id) return;
    const key = `${mediaType}:${item.id}`;

    if (imdbRatingsCache.has(key)) {
      setImdbScore(imdbRatingsCache.get(key));
      return;
    }

    try {
      const ext = await getExternalIds(mediaType, item.id);
      const imdbId = ext?.imdb_id || null;
      if (!imdbId) return;

      const cached = readOmdbCache(imdbId);
      if (cached?.imdbRating) {
        setImdbScore(cached.imdbRating);
        imdbRatingsCache.set(key, cached.imdbRating);
        if (cached.fresh) return;
      }

      const omdb = await fetchOmdbByImdb(imdbId);
      const r =
        omdb?.imdbRating && omdb.imdbRating !== "N/A"
          ? Number(omdb.imdbRating)
          : null;
      const safe = Number.isFinite(r) ? r : null;

      if (safe) {
        setImdbScore(safe);
        imdbRatingsCache.set(key, safe);
        writeOmdbCache(imdbId, { imdbRating: safe });
      }
    } catch {
      // ignore
    }
  }, [item?.id, mediaType]);

  // En móvil evitamos disparar OMDb por “hover”.
  const prefetchEnabled = !isMobile;

  return (
    <Link
      href={href}
      className="block group/card relative w-full select-none"
      onMouseEnter={prefetchEnabled ? prefetchImdb : undefined}
      onFocus={prefetchEnabled ? prefetchImdb : undefined}
      draggable={false}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-zinc-900 shadow-lg ring-1 ring-white/5 transition-transform duration-300 md:group-hover/card:scale-[1.02]">
        <TmdbImg
          filePath={posterPath}
          size="w500"
          alt={title}
          className="w-full h-full object-cover"
        />

        {/* overlay: en móvil OCULTO, solo visible en desktop con hover */}
        <div
          className={[
            "pointer-events-none absolute inset-0 transition-opacity duration-200",
            isMobile
              ? "opacity-0"
              : "opacity-0 md:group-hover/card:opacity-100",
          ].join(" ")}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

          {/* ratings arriba derecha */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
            {typeof item?.vote_average === "number" &&
              item.vote_average > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-300 text-[11px] font-black font-mono tracking-tight">
                    {item.vote_average.toFixed(1)}
                  </span>
                  <img
                    src="/logo-TMDb.png"
                    alt="TMDb"
                    className="w-auto h-2.5"
                    draggable={false}
                  />
                </div>
              )}
            {!isMobile && typeof imdbScore === "number" && imdbScore > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-yellow-300 text-[11px] font-black font-mono tracking-tight">
                  {imdbScore.toFixed(1)}
                </span>
                <img
                  src="/logo-IMDb.png"
                  alt="IMDb"
                  className="w-auto h-2.5"
                  draggable={false}
                />
              </div>
            )}
          </div>

          {/* título + año */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="flex items-end justify-between gap-3">
              <h3 className="text-white font-bold text-xs sm:text-sm leading-tight line-clamp-2">
                {title}
              </h3>
              {year && (
                <span className="shrink-0 text-[10px] sm:text-xs font-black text-yellow-300">
                  {year}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
});

function sortLists(lists, mode) {
  const arr = [...lists];
  switch (mode) {
    case "name_asc":
      return arr.sort((a, b) => (a?.name || "").localeCompare(b?.name || ""));
    case "name_desc":
      return arr.sort((a, b) => (b?.name || "").localeCompare(a?.name || ""));
    case "items_desc":
      return arr.sort((a, b) => (b?.item_count || 0) - (a?.item_count || 0));
    case "items_asc":
      return arr.sort((a, b) => (a?.item_count || 0) - (b?.item_count || 0));
    case "likes_desc":
      return arr.sort((a, b) => (b?.likes || 0) - (a?.likes || 0));
    case "likes_asc":
      return arr.sort((a, b) => (a?.likes || 0) - (b?.likes || 0));
    default:
      return arr;
  }
}

function getTraktUsername(list) {
  return list?.user?.username || list?.user?.ids?.slug || list?.user || "trakt";
}

function getTraktListKey(list) {
  // Preferimos slug (más estable), si no id
  return list?.ids?.slug || list?.ids?.trakt || list?.id;
}

function buildInternalUrl(list) {
  const src = list?.source;
  if (src === "tmdb") return `/lists/${list?.id}`;

  if (src === "trakt") {
    const u = getTraktUsername(list);
    const key = getTraktListKey(list);
    if (!u || !key) return null;
    return `/lists/trakt/${encodeURIComponent(u)}/${encodeURIComponent(String(key))}`;
  }

  // Colecciones: ruta interna a vista detallada
  if (src === "collections") return `/lists/collection/${list?.id}`;

  return null;
}

function buildExternalUrl(list) {
  const src = list?.source;
  if (src === "tmdb") return `https://www.themoviedb.org/list/${list?.id}`;
  if (src === "trakt") return list?.traktUrl || null;
  if (src === "collections")
    return `https://www.themoviedb.org/collection/${list?.id}`;
  return null;
}

function normalizeTraktItemsToCards(items) {
  // Convierte items de Trakt (con _tmdb) al shape que usan tus previews (ListItemCard)
  if (!Array.isArray(items)) return [];

  return items
    .map((it) => {
      const t = it?._tmdb;
      if (!t?.id || !t?.media_type) return null;

      const title =
        it?.movie?.title ||
        it?.show?.title ||
        it?.person?.name ||
        it?.episode?.title ||
        it?.season?.title ||
        "Elemento";

      return {
        id: t.id,
        media_type: t.media_type,
        title: t.media_type === "movie" ? title : undefined,
        name: t.media_type !== "movie" ? title : undefined,
        poster_path: t.poster_path || null,
        backdrop_path: t.backdrop_path || null,
      };
    })
    .filter(Boolean);
}

/* ========= fila tipo Dashboard: drag con ratón + 3 completas en móvil ========= */
function ListItemsRow({ items, isMobile }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  const breakpointsRow = {
    0: { slidesPerView: 3, spaceBetween: 12 },
    640: { slidesPerView: 4, spaceBetween: 14 },
    768: { slidesPerView: "auto", spaceBetween: 14 },
    1024: { slidesPerView: "auto", spaceBetween: 18 },
    1280: { slidesPerView: "auto", spaceBetween: 20 },
  };

  return (
    <div className="-mx-4 sm:mx-0">
      <div className="px-3 sm:px-0">
        <Swiper
          slidesPerView={3}
          spaceBetween={12}
          breakpoints={breakpointsRow}
          loop={false}
          watchOverflow
          allowTouchMove
          simulateTouch
          grabCursor={!isMobile}
          threshold={6}
          preventClicks
          preventClicksPropagation
          touchStartPreventDefault={false}
          className="group relative"
        >
          {items.map((item, idx) => {
            const mt = item?.media_type || (item?.title ? "movie" : "tv");
            return (
              <SwiperSlide
                key={`${mt}-${item?.id}-${idx}`}
                className="select-none md:!w-[140px] lg:!w-[140px] xl:!w-[168px] 2xl:!w-[201px]"
              >
                {/* ✅ IMPORTANTE: pasamos isMobile */}
                <ListItemCard item={item} isMobile={isMobile} />
              </SwiperSlide>
            );
          })}
        </Swiper>
      </div>
    </div>
  );
}

function ListItemsRowSkeleton({ isMobile }) {
  const n = isMobile ? 3 : 6;
  return (
    <div className="-mx-4 sm:mx-0 px-[10px] sm:px-0">
      <div className="flex gap-[10px] overflow-hidden">
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            className="w-[30%] sm:w-[140px] md:w-[150px] lg:w-[160px] aspect-[2/3] rounded-2xl bg-zinc-900/40 border border-white/5 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

/** ✅ Wrapper: Link interno si existe, si no anchor externo, si no div */
function ListNavWrapper({ list, className = "", children }) {
  const href = list?.internalUrl || null;
  const ext = list?.externalUrl || null;

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  if (ext) {
    return (
      <a href={ext} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return <div className={className}>{children}</div>;
}

function GridListCard({ list, itemsState, ensureListItems, canUse, onDelete }) {
  const listId = String(list?.id || "");
  const [ref, inView] = useInView();

  useEffect(() => {
    if (inView) ensureListItems(listId);
  }, [inView, ensureListItems, listId]);

  const isLoading = itemsState === null || itemsState === undefined;
  const items = Array.isArray(itemsState) ? itemsState : [];

  return (
    <div ref={ref}>
      {/* ✅ antes: Link fijo a /lists/:id (rompía Trakt/Colecciones) */}
      <ListNavWrapper list={list} className="group block h-full">
        <div className="h-full bg-zinc-900/40 border border-white/5 rounded-2xl overflow-hidden md:hover:border-white/10 md:hover:bg-zinc-900/60 transition-all flex flex-col relative">
          <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden md:group-hover:opacity-90 transition-opacity">
            {isLoading ? (
              <div className="w-full h-full animate-pulse bg-zinc-900/40" />
            ) : (
              <ListCoverBackdropCollage items={items} alt={list.name} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent opacity-60" />

            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-white border border-white/10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {list.item_count} items
            </div>
          </div>

          <div className="p-4 flex flex-col flex-1">
            <div className="flex justify-between items-start gap-2">
              <h3 className="text-lg font-bold text-white leading-tight line-clamp-1 md:group-hover:text-purple-400 transition-colors">
                {list.name}
              </h3>
            </div>
            <p className="text-sm text-zinc-400 mt-1 line-clamp-2 leading-relaxed flex-1">
              {list.description || (
                <span className="italic opacity-50">Sin descripción</span>
              )}
            </p>
          </div>

          {canUse && (
            <button
              onClick={(e) => onDelete(e, list.id)}
              className="absolute top-2 right-2 p-2 bg-black/50 md:hover:bg-red-600/80 text-white/70 md:hover:text-white rounded-full backdrop-blur-md transition-all opacity-0 md:group-hover:opacity-100 focus:opacity-100"
              title="Borrar lista"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </ListNavWrapper>
    </div>
  );
}

function RowListSection({
  list,
  itemsState,
  ensureListItems,
  isMobile,
  canUse,
  onDelete,
}) {
  const listId = String(list?.id || "");
  const [ref, inView] = useInView();

  useEffect(() => {
    if (inView) ensureListItems(listId);
  }, [inView, ensureListItems, listId]);

  const isLoading = itemsState === null || itemsState === undefined;
  const items = Array.isArray(itemsState) ? itemsState : [];

  return (
    <section ref={ref} className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-white/5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-2xl sm:text-3xl font-black text-white truncate">
              {list.name}
            </h3>

            <span className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-bold text-zinc-200">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              {list.item_count} items
            </span>
          </div>

          {list.description && (
            <p className="text-sm text-zinc-500 mt-1 line-clamp-1 max-w-3xl">
              {list.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {canUse && (
            <button
              onClick={(e) => onDelete(e, list.id)}
              className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition"
              title="Borrar lista"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* ✅ antes: Link fijo a /lists/:id */}
          {list?.internalUrl ? (
            <Link
              href={list.internalUrl}
              className="h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600/15 border border-purple-500/30 px-4 text-xs font-black uppercase tracking-wider text-purple-200 hover:bg-purple-600/22 hover:border-purple-500/45 transition flex-1 sm:flex-none"
            >
              Ver todo <ChevronRight className="w-4 h-4" />
            </Link>
          ) : list?.externalUrl ? (
            <a
              href={list.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600/15 border border-purple-500/30 px-4 text-xs font-black uppercase tracking-wider text-purple-200 hover:bg-purple-600/22 hover:border-purple-500/45 transition flex-1 sm:flex-none"
            >
              Ver todo <ChevronRight className="w-4 h-4" />
            </a>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <ListItemsRowSkeleton isMobile={isMobile} />
      ) : items.length > 0 ? (
        <ListItemsRow items={items} isMobile={isMobile} />
      ) : (
        <div className="h-40 flex items-center justify-center bg-zinc-900/20 rounded-2xl border border-dashed border-white/5 text-zinc-600 text-sm">
          Lista vacía
        </div>
      )}
    </section>
  );
}

function ListModeRow({ list, itemsState, ensureListItems, canUse, onDelete }) {
  const listId = String(list?.id || "");
  const [ref, inView] = useInView();

  useEffect(() => {
    if (inView) ensureListItems(listId);
  }, [inView, ensureListItems, listId]);

  const isLoading = itemsState === null || itemsState === undefined;
  const items = Array.isArray(itemsState) ? itemsState : [];
  const firstItem = items[0];

  return (
    <div ref={ref}>
      {/* ✅ antes: Link fijo a /lists/:id */}
      <ListNavWrapper list={list} className="group block">
        <div className="flex items-center gap-4 p-3 bg-zinc-900/30 border border-white/5 rounded-xl hover:bg-zinc-900/60 hover:border-white/10 transition-all">
          <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-zinc-950 border border-white/5 relative">
            {isLoading ? (
              <div className="w-full h-full animate-pulse bg-zinc-900/40" />
            ) : firstItem ? (
              <TmdbImg
                filePath={firstItem.poster_path || firstItem.backdrop_path}
                size="w92"
                alt={list.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700">
                <ListVideo className="w-6 h-6" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white truncate group-hover:text-purple-400 transition-colors">
              {list.name}
            </h3>
            <p className="text-sm text-zinc-400 truncate">
              {list.description || "—"}
            </p>
          </div>

          <div className="flex items-center gap-4 pr-1">
            <div className="text-right hidden sm:block">
              <span className="text-xs text-zinc-500 uppercase font-bold tracking-wider block">
                Items
              </span>
              <span className="text-sm font-bold text-white">
                {list.item_count}
              </span>
            </div>

            {canUse && (
              <button
                onClick={(e) => onDelete(e, list.id)}
                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                title="Borrar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </ListNavWrapper>
    </div>
  );
}

// ================== MAIN PAGE ==================
export default function ListsPage() {
  const isMobile = useIsMobileLayout(768);
  const [isPending, startTransition] = useTransition();

  const {
    canUse,
    lists,
    loading,
    error,
    refresh,
    loadMore,
    hasMore,
    create,
    del,
  } = useTmdbLists();
  const { session, account } = useAuth();

  const [authStatus, setAuthStatus] = useState("checking");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [sortMode, setSortMode] = useState("items_desc");
  const [viewMode, setViewMode] = useState("rows"); // ✅ por defecto como “Dashboard”

  // ✅ NUEVO: selector de fuente
  const [source, setSource] = useState("trakt"); // 'tmdb' | 'trakt' | 'collections'
  const [traktMode, setTraktMode] = useState("trending"); // trending | popular | user

  const trakt = useTraktLists({ mode: traktMode });
  const [featuredCollections, setFeaturedCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [searchedCollections, setSearchedCollections] = useState([]);

  // Map: listId -> undefined (no pedido) | null (cargando) | Array(items)
  const [itemsMap, setItemsMap] = useState({});
  const itemsMapRef = useRef(itemsMap);
  const inFlight = useRef(new Set());
  const controllersRef = useRef(new Map()); // listId -> AbortController

  useEffect(() => {
    itemsMapRef.current = itemsMap;
  }, [itemsMap]);

  // ✅ Auth
  useEffect(() => {
    if (session === undefined) return;
    if (session && account?.id) setAuthStatus("authenticated");
    else setAuthStatus("anonymous");
  }, [session, account]);

  const safeTmdbLists = Array.isArray(lists) ? lists : [];

  // ✅ carga colecciones destacadas cuando toca
  useEffect(() => {
    if (source !== "collections") {
      setFeaturedCollections([]);
      setSearchedCollections([]);
      return;
    }

    // Limpiar búsqueda al cambiar a colecciones
    setSearchedCollections([]);

    let alive = true;
    (async () => {
      try {
        setCollectionsLoading(true);
        const res = await fetch("/api/tmdb/collections/featured", {
          cache: "no-store", // Cambiar a no-store para evitar problemas de caché
        });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        const cols = Array.isArray(j?.collections) ? j.collections : [];
        console.log("📦 Colecciones cargadas:", cols.length, cols);
        setFeaturedCollections(cols);
      } catch {
        if (alive) setFeaturedCollections([]);
      } finally {
        if (alive) setCollectionsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [source]);

  // ✅ búsqueda dinámica de colecciones
  useEffect(() => {
    if (source !== "collections" || !deferredQuery.trim()) {
      setSearchedCollections([]);
      return;
    }

    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setCollectionsLoading(true);
        const res = await fetch(
          `/api/tmdb/collections/search?query=${encodeURIComponent(deferredQuery)}`,
          { signal: controller.signal, cache: "force-cache" },
        );
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        setSearchedCollections(
          Array.isArray(j?.collections) ? j.collections : [],
        );
      } catch (e) {
        if (e?.name !== "AbortError" && alive) {
          setSearchedCollections([]);
        }
      } finally {
        if (alive) setCollectionsLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [source, deferredQuery]);

  // ✅ lista activa según fuente
  const activeLists = useMemo(() => {
    if (source === "tmdb") {
      return safeTmdbLists.map((l) => ({
        ...l,
        source: "tmdb",
        internalUrl: buildInternalUrl({ ...l, source: "tmdb" }),
        externalUrl: buildExternalUrl({ ...l, source: "tmdb" }),
      }));
    }

    if (source === "trakt") {
      const arr = Array.isArray(trakt?.lists) ? trakt.lists : [];
      console.log("🔍 Trakt lists raw:", arr.length, arr);
      return arr.map((l) => ({
        ...l,
        source: "trakt",
        internalUrl: buildInternalUrl({ ...l, source: "trakt" }),
        externalUrl: buildExternalUrl({ ...l, source: "trakt" }),
      }));
    }

    // Colecciones: usar búsqueda si hay query, sino destacadas
    const cols = deferredQuery.trim()
      ? Array.isArray(searchedCollections)
        ? searchedCollections
        : []
      : Array.isArray(featuredCollections)
        ? featuredCollections
        : [];

    return cols.map((c) => ({
      ...c,
      source: "collections",
      internalUrl: buildInternalUrl({ ...c, source: "collections" }), // null
      externalUrl: buildExternalUrl({ ...c, source: "collections" }),
    }));
  }, [
    source,
    safeTmdbLists,
    trakt?.lists,
    featuredCollections,
    searchedCollections,
    deferredQuery,
  ]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();

    // Para colecciones, si hay búsqueda ya viene filtrado del servidor
    if (source === "collections" && q) {
      return sortLists(activeLists, sortMode);
    }

    // Para TMDb y Trakt, filtrar localmente
    const base = q
      ? activeLists.filter((l) => (l?.name || "").toLowerCase().includes(q))
      : activeLists;
    return sortLists(base, sortMode);
  }, [activeLists, deferredQuery, sortMode, source]);

  const visibleCount = filtered.length;

  // ✅ reset caches al cambiar de fuente/modo (evita previews cruzados)
  useEffect(() => {
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    inFlight.current.clear();
    setItemsMap({});
    imdbRatingsCache.clear();
  }, [source, traktMode]);

  const listsTitle =
    source === "tmdb"
      ? "Mis Listas"
      : source === "trakt"
        ? "Listas de Trakt"
        : "Colecciones";

  const subtitle =
    source === "tmdb"
      ? `${safeTmdbLists.length} listas creadas`
      : source === "trakt"
        ? `${visibleCount} listas`
        : `${visibleCount} colecciones`;

  // ✅ ensureListItems multi-origen
  const ensureListItems = useCallback(
    async (listId) => {
      if (!listId) return;

      // ya cargado o cargando
      if (itemsMapRef.current[listId] !== undefined) return;
      if (inFlight.current.has(listId)) return;

      // busca el objeto de lista en el “filtered” actual
      const listObj = filtered.find((x) => String(x?.id) === String(listId));
      const src = listObj?.source || source;

      inFlight.current.add(listId);
      setItemsMap((prev) => ({ ...prev, [listId]: null }));

      const ctrl = new AbortController();
      controllersRef.current.set(listId, ctrl);

      try {
        if (src === "tmdb") {
          const json = await getListDetails({
            listId,
            page: 1,
            language: "es-ES",
            signal: ctrl.signal,
          });
          const items = Array.isArray(json?.items) ? json.items : [];
          setItemsMap((prev) => ({ ...prev, [listId]: items }));
          return;
        }

        if (src === "trakt") {
          const username = getTraktUsername(listObj);
          const listKey = getTraktListKey(listObj);

          const res = await fetch(
            `/api/trakt/lists/${encodeURIComponent(username)}/${encodeURIComponent(String(listKey))}?page=1&limit=12`,
            { signal: ctrl.signal, cache: "no-store" },
          );
          const j = await res.json().catch(() => ({}));

          const normalized = normalizeTraktItemsToCards(j?.items);
          setItemsMap((prev) => ({ ...prev, [listId]: normalized }));
          return;
        }

        // collections
        const res = await fetch(
          `/api/tmdb/collection?id=${encodeURIComponent(listId)}`,
          {
            signal: ctrl.signal,
            cache: "no-store",
          },
        );
        const j = await res.json().catch(() => ({}));
        const items = Array.isArray(j?.items) ? j.items : [];
        setItemsMap((prev) => ({ ...prev, [listId]: items }));
      } catch (e) {
        if (e?.name === "AbortError") {
          // vuelve a “no pedido” para que pueda pedirse después
          setItemsMap((prev) => {
            const next = { ...prev };
            delete next[listId];
            return next;
          });
          return;
        }
        setItemsMap((prev) => ({ ...prev, [listId]: [] }));
      } finally {
        inFlight.current.delete(listId);
        controllersRef.current.delete(listId);
      }
    },
    [filtered, source],
  );

  // ✅ precarga solo las primeras N listas visibles (el resto lo hace InView)
  useEffect(() => {
    const first = filtered.slice(0, PRELOAD_FIRST_N_LISTS);
    for (const l of first) ensureListItems(String(l?.id || ""));
  }, [filtered, ensureListItems]);

  const handleCreate = async (name, desc) => {
    setCreating(true);
    try {
      await create({ name, description: desc });
      setCreateOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, listId) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canUse || source !== "tmdb") return;
    const ok = window.confirm("¿Seguro que quieres borrar esta lista?");
    if (!ok) return;

    // abort preview si estaba cargando
    const ctrl = controllersRef.current.get(String(listId));
    if (ctrl) ctrl.abort();

    await del(listId);

    // limpia preview cache
    setItemsMap((prev) => {
      const next = { ...prev };
      delete next[String(listId)];
      return next;
    });
  };

  const handleRefresh = () => {
    // aborta todo lo que estuviera volando + limpia previews (evita estados raros)
    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    inFlight.current.clear();
    setItemsMap({});
    imdbRatingsCache.clear();

    if (source === "tmdb") refresh();
    else if (source === "trakt") trakt?.refresh?.();
    else {
      // collections: limpiar búsqueda y re-fetch destacadas
      setQuery("");
      setSearchedCollections([]);
      setFeaturedCollections([]);
      setCollectionsLoading(true);
      fetch("/api/tmdb/collections/featured", { cache: "no-store" })
        .then((r) => r.json().catch(() => ({})))
        .then((j) =>
          setFeaturedCollections(
            Array.isArray(j?.collections) ? j.collections : [],
          ),
        )
        .finally(() => setCollectionsLoading(false));
    }
  };

  // loader auth
  if (authStatus === "checking") {
    return (
      <div className="min-h-screen bg-[#101010] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
      </div>
    );
  }

  if (authStatus === "anonymous") {
    return (
      <div className="min-h-screen bg-[#101010] text-gray-100 flex items-center justify-center">
        <div className="max-w-md text-center px-4">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg border border-zinc-800">
            <ListVideo className="w-8 h-8 text-zinc-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Mis Listas</h1>
          <p className="text-zinc-400 mb-8">
            Inicia sesión con tu cuenta TMDb para gestionar tus listas
            personalizadas.
          </p>
          <Link
            href="/login"
            className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition"
          >
            Iniciar Sesión
          </Link>
        </div>
      </div>
    );
  }

  const loadingUnified =
    source === "tmdb"
      ? loading
      : source === "trakt"
        ? trakt?.loading
        : collectionsLoading;

  const errorUnified =
    source === "tmdb" ? error : source === "trakt" ? trakt?.error : "";

  // ✅ readonly: Trakt y Colecciones no crean/borran ni loadMore
  const canEdit = !!canUse && source === "tmdb";

  return (
    <div className="min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-purple-500/30 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-1/4 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* HEADER + CONTROLES */}
        <motion.div
          className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px w-12 bg-purple-500" />
              <span className="text-purple-400 font-bold uppercase tracking-widest text-xs">TU COLECCIÓN</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              Mis Listas
              <span className="text-purple-500">.</span>
            </h1>
            <p className="mt-2 text-zinc-400 max-w-lg text-lg">
              Gestiona y organiza tus colecciones personales.
            </p>
          </div>
        </motion.div>

        {/* Filtros Sticky */}
        <motion.div
          ref={(el) => {
            if (el && !el.dataset.stickySetup) {
              el.dataset.stickySetup = 'true';
              const observer = new IntersectionObserver(
                ([e]) => {
                  const isStuck = e.intersectionRatio < 1;
                  if (isStuck) {
                    el.classList.add('backdrop-blur-xl', 'bg-gradient-to-br', 'from-black/60', 'via-black/50', 'to-black/55');
                  } else {
                    el.classList.remove('backdrop-blur-xl', 'bg-gradient-to-br', 'from-black/60', 'via-black/50', 'to-black/55');
                  }
                },
                { threshold: [1], rootMargin: '-65px 0px 0px 0px' }
              );
              observer.observe(el);
            }
          }}
          className="sticky top-16 z-[60] space-y-1 mb-3 p-2 rounded-2xl transition-all duration-300"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          {/* Controles (desktop: todo en 1 línea; móvil: 3 filas) */}
          <div className="w-full">
            <div className="space-y-1">
              {/* Móvil: Fila 1 - Búsqueda */}
              <div className="lg:hidden">
                <div className="relative w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) =>
                      startTransition(() => setQuery(e.target.value))
                    }
                    placeholder={
                      source === "collections"
                        ? "Buscar colecciones..."
                        : "Buscar listas..."
                    }
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-500/50 transition-all placeholder:text-zinc-600"
                  />
                  {query && (
                    <button
                      onClick={() => startTransition(() => setQuery(""))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  )}
                </div>
              </div>

              {/* Móvil: Fila 2 - Fuente y Modo/Ordenar (50% cada uno) */}
              <div className="flex gap-2 lg:hidden">
                <div className="flex-1">
                  <Dropdown
                    label="Fuente"
                    valueLabel={
                      source === "tmdb"
                        ? "TMDb"
                        : source === "trakt"
                          ? "Trakt"
                          : "Colecciones"
                    }
                    icon={Layers}
                  >
                    {({ close }) => (
                      <>
                        <DropdownItem
                          active={source === "tmdb"}
                          onClick={() => {
                            startTransition(() => setSource("tmdb"));
                            close();
                          }}
                        >
                          TMDb
                        </DropdownItem>
                        <DropdownItem
                          active={source === "trakt"}
                          onClick={() => {
                            startTransition(() => setSource("trakt"));
                            close();
                          }}
                        >
                          Trakt
                        </DropdownItem>
                        <DropdownItem
                          active={source === "collections"}
                          onClick={() => {
                            startTransition(() => setSource("collections"));
                            close();
                          }}
                        >
                          Colecciones
                        </DropdownItem>
                      </>
                    )}
                  </Dropdown>
                </div>

                <div className="flex-1">
                  {source === "trakt" ? (
                    <Dropdown
                      label="Modo"
                      valueLabel={
                        traktMode === "trending"
                          ? "Trending"
                          : traktMode === "popular"
                            ? "Popular"
                            : "Mis listas"
                      }
                      icon={Filter}
                    >
                      {({ close }) => (
                        <>
                          <DropdownItem
                            active={traktMode === "trending"}
                            onClick={() => {
                              setTraktMode("trending");
                              close();
                            }}
                          >
                            Trending
                          </DropdownItem>
                          <DropdownItem
                            active={traktMode === "popular"}
                            onClick={() => {
                              setTraktMode("popular");
                              close();
                            }}
                          >
                            Popular
                          </DropdownItem>
                          <DropdownItem
                            active={traktMode === "user"}
                            onClick={() => {
                              setTraktMode("user");
                              close();
                            }}
                          >
                            Mis listas
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  ) : (
                    <Dropdown
                      label="Ordenar"
                      valueLabel={
                        sortMode.includes("items")
                          ? sortMode === "items_desc"
                            ? "Más items"
                            : "Menos items"
                          : sortMode.includes("likes")
                            ? sortMode === "likes_desc"
                              ? "Más likes"
                              : "Menos likes"
                            : sortMode === "name_asc"
                              ? "A-Z"
                              : "Z-A"
                      }
                      icon={ArrowUpDown}
                    >
                      {({ close }) => (
                        <>
                          <DropdownItem
                            active={sortMode === "items_desc"}
                            onClick={() => {
                              startTransition(() => setSortMode("items_desc"));
                              close();
                            }}
                          >
                            Más items
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "items_asc"}
                            onClick={() => {
                              startTransition(() => setSortMode("items_asc"));
                              close();
                            }}
                          >
                            Menos items
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "likes_desc"}
                            onClick={() => {
                              startTransition(() => setSortMode("likes_desc"));
                              close();
                            }}
                          >
                            Más likes
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "likes_asc"}
                            onClick={() => {
                              startTransition(() => setSortMode("likes_asc"));
                              close();
                            }}
                          >
                            Menos likes
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "name_asc"}
                            onClick={() => {
                              startTransition(() => setSortMode("name_asc"));
                              close();
                            }}
                          >
                            Nombre (A-Z)
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "name_desc"}
                            onClick={() => {
                              startTransition(() => setSortMode("name_desc"));
                              close();
                            }}
                          >
                            Nombre (Z-A)
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  )}
                </div>
              </div>

              {/* Móvil: Fila 3 - Ordenar (si Trakt) + Vistas + Acciones */}
              <div className="flex gap-2 lg:hidden">
                {source === "trakt" && (
                  <div className="flex-1">
                    <Dropdown
                      label="Ordenar"
                      valueLabel={
                        sortMode.includes("items")
                          ? sortMode === "items_desc"
                            ? "Más items"
                            : "Menos items"
                          : sortMode.includes("likes")
                            ? sortMode === "likes_desc"
                              ? "Más likes"
                              : "Menos likes"
                            : sortMode === "name_asc"
                              ? "A-Z"
                              : "Z-A"
                      }
                      icon={ArrowUpDown}
                    >
                      {({ close }) => (
                        <>
                          <DropdownItem
                            active={sortMode === "items_desc"}
                            onClick={() => {
                              startTransition(() => setSortMode("items_desc"));
                              close();
                            }}
                          >
                            Más items
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "items_asc"}
                            onClick={() => {
                              startTransition(() => setSortMode("items_asc"));
                              close();
                            }}
                          >
                            Menos items
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "likes_desc"}
                            onClick={() => {
                              startTransition(() => setSortMode("likes_desc"));
                              close();
                            }}
                          >
                            Más likes
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "likes_asc"}
                            onClick={() => {
                              startTransition(() => setSortMode("likes_asc"));
                              close();
                            }}
                          >
                            Menos likes
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "name_asc"}
                            onClick={() => {
                              startTransition(() => setSortMode("name_asc"));
                              close();
                            }}
                          >
                            Nombre (A-Z)
                          </DropdownItem>
                          <DropdownItem
                            active={sortMode === "name_desc"}
                            onClick={() => {
                              startTransition(() => setSortMode("name_desc"));
                              close();
                            }}
                          >
                            Nombre (Z-A)
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  </div>
                )}

                <div
                  className={`flex ${source === "trakt" ? "flex-1" : "flex-[2]"} gap-2`}
                >
                  <div className="flex flex-1 bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center">
                    <button
                      onClick={() => startTransition(() => setViewMode("grid"))}
                      className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "grid"
                        ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      title="Cuadrícula"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startTransition(() => setViewMode("rows"))}
                      className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "rows"
                        ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      title="Filas"
                    >
                      <Rows className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startTransition(() => setViewMode("list"))}
                      className={`flex-1 h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "list"
                        ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        }`}
                      title="Lista"
                    >
                      <StretchHorizontal className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={handleRefresh}
                    className="h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all flex items-center justify-center shrink-0"
                    title="Refrescar"
                  >
                    <RefreshCcw
                      className={`w-4 h-4 ${loadingUnified ? "animate-spin text-purple-500" : ""}`}
                    />
                  </button>

                  {canEdit && (
                    <button
                      onClick={() => setCreateOpen(true)}
                      className="h-11 px-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Crear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Desktop: Una sola fila con todo */}
              <div className="hidden lg:flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) =>
                      startTransition(() => setQuery(e.target.value))
                    }
                    placeholder={
                      source === "collections"
                        ? "Buscar colecciones..."
                        : "Buscar listas..."
                    }
                    className="w-full h-11 bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-purple-500/50 transition-all placeholder:text-zinc-600"
                  />
                  {query && (
                    <button
                      onClick={() => startTransition(() => setQuery(""))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-800 rounded-md transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  )}
                </div>

                <Dropdown
                  label="Fuente"
                  valueLabel={
                    source === "tmdb"
                      ? "TMDb"
                      : source === "trakt"
                        ? "Trakt"
                        : "Colecciones"
                  }
                  icon={Layers}
                >
                  {({ close }) => (
                    <>
                      <DropdownItem
                        active={source === "tmdb"}
                        onClick={() => {
                          startTransition(() => setSource("tmdb"));
                          close();
                        }}
                      >
                        TMDb
                      </DropdownItem>
                      <DropdownItem
                        active={source === "trakt"}
                        onClick={() => {
                          startTransition(() => setSource("trakt"));
                          close();
                        }}
                      >
                        Trakt
                      </DropdownItem>
                      <DropdownItem
                        active={source === "collections"}
                        onClick={() => {
                          startTransition(() => setSource("collections"));
                          close();
                        }}
                      >
                        Colecciones
                      </DropdownItem>
                    </>
                  )}
                </Dropdown>

                {source === "trakt" && (
                  <Dropdown
                    label="Modo"
                    valueLabel={
                      traktMode === "trending"
                        ? "Trending"
                        : traktMode === "popular"
                          ? "Popular"
                          : "Mis listas"
                    }
                    icon={Filter}
                  >
                    {({ close }) => (
                      <>
                        <DropdownItem
                          active={traktMode === "trending"}
                          onClick={() => {
                            setTraktMode("trending");
                            close();
                          }}
                        >
                          Trending
                        </DropdownItem>
                        <DropdownItem
                          active={traktMode === "popular"}
                          onClick={() => {
                            setTraktMode("popular");
                            close();
                          }}
                        >
                          Popular
                        </DropdownItem>
                        <DropdownItem
                          active={traktMode === "user"}
                          onClick={() => {
                            setTraktMode("user");
                            close();
                          }}
                        >
                          Mis listas
                        </DropdownItem>
                      </>
                    )}
                  </Dropdown>
                )}

                <Dropdown
                  label="Ordenar"
                  valueLabel={
                    sortMode.includes("items")
                      ? sortMode === "items_desc"
                        ? "Más items"
                        : "Menos items"
                      : sortMode.includes("likes")
                        ? sortMode === "likes_desc"
                          ? "Más likes"
                          : "Menos likes"
                        : sortMode === "name_asc"
                          ? "A-Z"
                          : "Z-A"
                  }
                  icon={ArrowUpDown}
                >
                  {({ close }) => (
                    <>
                      <DropdownItem
                        active={sortMode === "items_desc"}
                        onClick={() => {
                          startTransition(() => setSortMode("items_desc"));
                          close();
                        }}
                      >
                        Más items
                      </DropdownItem>
                      <DropdownItem
                        active={sortMode === "items_asc"}
                        onClick={() => {
                          startTransition(() => setSortMode("items_asc"));
                          close();
                        }}
                      >
                        Menos items
                      </DropdownItem>
                      <DropdownItem
                        active={sortMode === "likes_desc"}
                        onClick={() => {
                          startTransition(() => setSortMode("likes_desc"));
                          close();
                        }}
                      >
                        Más likes
                      </DropdownItem>
                      <DropdownItem
                        active={sortMode === "likes_asc"}
                        onClick={() => {
                          startTransition(() => setSortMode("likes_asc"));
                          close();
                        }}
                      >
                        Menos likes
                      </DropdownItem>
                      <DropdownItem
                        active={sortMode === "name_asc"}
                        onClick={() => {
                          startTransition(() => setSortMode("name_asc"));
                          close();
                        }}
                      >
                        Nombre (A-Z)
                      </DropdownItem>
                      <DropdownItem
                        active={sortMode === "name_desc"}
                        onClick={() => {
                          startTransition(() => setSortMode("name_desc"));
                          close();
                        }}
                      >
                        Nombre (Z-A)
                      </DropdownItem>
                    </>
                  )}
                </Dropdown>

                <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800 h-11 items-center shrink-0">
                  <button
                    onClick={() => startTransition(() => setViewMode("grid"))}
                    className={`h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "grid"
                      ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      }`}
                    title="Cuadrícula"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => startTransition(() => setViewMode("rows"))}
                    className={`h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "rows"
                      ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      }`}
                    title="Filas"
                  >
                    <Rows className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => startTransition(() => setViewMode("list"))}
                    className={`h-full px-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center ${viewMode === "list"
                      ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      }`}
                    title="Lista"
                  >
                    <StretchHorizontal className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={handleRefresh}
                  className="h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all flex items-center justify-center shrink-0"
                  title="Refrescar"
                >
                  <RefreshCcw
                    className={`w-4 h-4 ${loadingUnified ? "animate-spin text-purple-500" : ""}`}
                  />
                </button>

                {canEdit && (
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="h-11 px-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold text-sm transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {createOpen && canEdit && (
            <CreateListModal
              open={createOpen}
              onClose={() => setCreateOpen(false)}
              onCreate={handleCreate}
              creating={creating}
              error={errorUnified}
            />
          )}
        </AnimatePresence>

        {errorUnified ? (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            {String(errorUnified)}
          </div>
        ) : null}

        {/* CONTENT */}
        {loadingUnified && visibleCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-4" />
            <span className="text-neutral-500 text-sm font-medium animate-pulse">
              {source === "collections"
                ? "Cargando colecciones..."
                : "Cargando listas..."}
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-neutral-800 rounded-3xl bg-neutral-900/20">
            <ListVideo className="w-16 h-16 text-neutral-700 mb-4" />
            <h3 className="text-xl font-bold text-neutral-300">
              {source === "collections"
                ? "No hay colecciones"
                : "No hay listas"}
            </h3>
            <p className="text-zinc-500 mt-2">
              {source === "tmdb"
                ? "Crea una nueva lista arriba para empezar."
                : "Prueba cambiando el modo o el buscador."}
            </p>
          </div>
        ) : (
          <>
            {viewMode === "grid" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((l, idx) => (
                  <GridListCard
                    key={`${l.source}-${l.id}-${idx}`}
                    list={l}
                    itemsState={itemsMap[String(l.id)]}
                    ensureListItems={ensureListItems}
                    canUse={canEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {viewMode === "rows" && (
              <div className="space-y-12">
                {filtered.map((l, idx) => (
                  <RowListSection
                    key={`${l.source}-${l.id}-${idx}`}
                    list={l}
                    itemsState={itemsMap[String(l.id)]}
                    ensureListItems={ensureListItems}
                    isMobile={isMobile}
                    canUse={canEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {viewMode === "list" && (
              <div className="flex flex-col gap-3">
                {filtered.map((l, idx) => (
                  <ListModeRow
                    key={`${l.source}-${l.id}-${idx}`}
                    list={l}
                    itemsState={itemsMap[String(l.id)]}
                    ensureListItems={ensureListItems}
                    canUse={canEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ✅ LoadMore SOLO TMDb */}
        {source === "tmdb" && hasMore && !loadingUnified && (
          <div className="flex justify-center pt-8">
            <button
              onClick={loadMore}
              className="px-6 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-full text-sm font-bold text-zinc-300 hover:text-white transition"
            >
              Cargar más listas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
