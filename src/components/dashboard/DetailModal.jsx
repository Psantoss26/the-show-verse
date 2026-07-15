"use client";

// /src/components/dashboard/DetailModal.jsx
// Ficha rápida (vista previa) que se abre desde las tarjetas del dashboard sobre
// el fondo difuminado. Panel ancho anclado al borde inferior, con esquinas
// superiores redondeadas y scroll interno (oculto, como AddToListModal). Réplica
// del lenguaje visual de DetailsClient (paneles glassy, badges de puntuación,
// pestañas Detalles/Producción/Sinopsis, reparto, similares y
// sentimientos) SIN importar sus internos: se replican los estilos.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { createPortal } from "react-dom";
import OptimizedImage from "@/components/OptimizedImage";
import {
  X,
  Play,
  Heart,
  BookmarkPlus,
  ArrowUpRight,
  Trophy,
  Award,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Building2,
  MonitorPlay,
  Globe,
  Languages,
  Film,
  Layers,
  Info,
  Users,
  ListPlus,
  ImageOff,
  ChevronDown,
  Check,
  PlayCircle,
  Calendar,
  Clock,
  Star,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import { markAsFavorite, markInWatchlist } from "@/lib/api/tmdb";
import {
  addMovieToList as backendAddMovieToList,
  createUserList as backendCreateUserList,
} from "@/lib/api/backendLists";
import useTmdbLists from "@/lib/hooks/useTmdbLists";
import LiquidButton from "@/components/LiquidButton";
import {
  buildImg,
  getMediaTypeForItem,
  getBestTrailerCached,
  fetchBestBackdrop,
} from "@/lib/dashboard/media";
import { dashboardDetailHref } from "@/lib/dashboard/detailHref";

// Componentes reales de la ficha completa (standalone) para que las tarjetas,
// badges, pestañas y acciones sean IDÉNTICAS a DetailsClient.
import DetailsScoreboardPanel from "@/components/details/DetailsScoreboardPanel";
import {
  formatCountShort,
  formatDateEs,
  slugifyForSeriesGraph,
} from "@/lib/details/formatters";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import AddToListModal from "@/components/details/AddToListModal";
import SoundtrackModal from "@/components/details/SoundtrackModal";
import TraktCommentModal from "@/components/details/TraktCommentModal";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal";
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
// Tabs Detalles/Sinopsis + tarjetas meta (Serie/Emisión/Duración/Episodio) que usa
// EpisodeDetails; se reutilizan para la variante de episodio del modal.
import {
  VisualMetaCard,
  DetailsTabsMenu,
} from "@/components/details/DetailAtoms";
// Carrusel horizontal con flechas (Swiper) COMPARTIDO con DetailsClient: mismo
// desplazamiento, tamaños y organización de tarjetas. Con breakpointsBase
// "container", el nº de tarjetas se adapta al ancho disponible del modal.
import DetailsArrowCarousel, {
  SwiperSlide,
} from "@/components/details/DetailsArrowCarousel";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";
// Fila de botones de acción principal (tráiler, favorito, pendiente, puntuar,
// listas, reseñas, soundtrack…): MISMO componente presentacional que la ficha
// completa (DetailsClient) para que la fila sea IDÉNTICA.
import DetailActionsRow from "@/components/details/DetailActionsRow";
// Sección de pestañas (Detalles/Producción/Sinopsis) compartida con la
// ficha completa: renderiza EXACTAMENTE las mismas tarjetas que DetailsClient.
import DetailsInfoTabs from "@/components/details/DetailsInfoTabs";
import {
  createPlatformItem,
  dedupeStreamingProviders,
} from "@/lib/streaming/providers";
import { useTraktAuth } from "@/lib/trakt/useTraktAuth";
import {
  traktAddComment,
  traktUpdateComment,
  traktDeleteComment,
  traktGetItemStatus,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
  traktGetEpisodePlays,
  traktSetEpisodeWatched,
} from "@/lib/api/traktClient";

import { useDetailModalData } from "@/components/dashboard/useDetailModalData";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
// Máquina de episodios vistos (series) COMPARTIDA con DetailsClient: misma
// lógica de toggles, rewatches, plays y persistencia en localStorage.
import { useTraktEpisodesWatched } from "@/lib/hooks/useTraktEpisodesWatched";

const DETAILS_ROUTE_TRANSITION_KEY = "showverse:details-route-transition";
const DETAILS_ROUTE_REVEAL_MIN_MS = 500;
const DETAILS_ROUTE_CLEANUP_MS = 420;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

// Espera (best-effort) a que la ruta /details haya montado su superficie. El
// loading boundary ya expone [data-details-root], así que normalmente resuelve
// enseguida; el timeout evita que una navegación lenta deje una capa colgada.
function waitForDetailsRoot(maxMs = 1800) {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const check = () => {
      if (document.querySelector("[data-details-root]")) return finish();
      if (Date.now() - start > maxMs) return finish();
      setTimeout(check, 8);
    };
    check();
  });
}

function startFullDetailsTransition(panelElement, variant = "center") {
  if (typeof document === "undefined" || !panelElement) return null;

  document
    .querySelectorAll("[data-details-route-transition]")
    .forEach((element) => element.remove());

  const rect = panelElement.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "sv-detail-route-transition";
  // El drawer derecho no sale hacia abajo: la tarjeta se AMPLÍA hacia dentro y se
  // difumina para morfear a la ficha completa (ver CSS --right).
  if (variant === "right") {
    layer.classList.add("sv-detail-route-transition--right");
  }
  layer.dataset.detailsRouteTransition = "true";
  layer.setAttribute("aria-hidden", "true");

  const scrim = document.createElement("div");
  scrim.className = "sv-detail-route-transition__scrim";

  const panelClone = panelElement.cloneNode(true);
  panelClone.classList.add("sv-detail-route-transition__panel");
  panelClone.setAttribute("aria-hidden", "true");
  panelClone.style.setProperty("--sv-route-panel-top", `${rect.top}px`);
  panelClone.style.setProperty("--sv-route-panel-left", `${rect.left}px`);
  panelClone.style.setProperty("--sv-route-panel-width", `${rect.width}px`);
  panelClone.style.setProperty("--sv-route-panel-height", `${rect.height}px`);
  panelClone.style.viewTransitionName = "none";

  panelClone
    .querySelectorAll("iframe, video, audio")
    .forEach((mediaElement) => mediaElement.remove());
  panelClone
    .querySelectorAll("a, button, input, select, textarea, [tabindex]")
    .forEach((interactiveElement) => {
      interactiveElement.setAttribute("tabindex", "-1");
    });

  layer.append(scrim, panelClone);
  document.body.append(layer);

  layer.classList.add("is-running");

  let cleanupTimer = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (cleanupTimer) window.clearTimeout(cleanupTimer);
    layer.remove();
  };

  const reveal = () => {
    if (cleaned) return;
    layer.classList.add("is-revealing");
    cleanupTimer = window.setTimeout(cleanup, DETAILS_ROUTE_CLEANUP_MS);
  };

  return { reveal, cleanup };
}

function normalizeUrl(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (!value) return null;
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

async function fetchResolvedExternalLink(url, { signal } = {}) {
  const response = await fetch(url, { signal, cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Request failed: ${response.status}`);
  }
  return json?.url || null;
}

const modalSeasonCache = new Map();

async function fetchModalSeasonEpisodes({ showId, seasonNumber, signal }) {
  const cacheKey = `${showId}:${seasonNumber}`;
  if (modalSeasonCache.has(cacheKey)) {
    return modalSeasonCache.get(cacheKey);
  }

  const response = await fetch(
    `/api/tmdb/tv/${encodeURIComponent(showId)}/season/${encodeURIComponent(
      seasonNumber,
    )}`,
    { signal, cache: "no-store" },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `Request failed: ${response.status}`);
  }
  modalSeasonCache.set(cacheKey, json);
  return json;
}

function normalizeSeasonNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/* =============================== ANIMACIÓN =============================== */
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  },
  navigate: {
    // El dim real se oculta durante la navegación; la capa temporal usa un
    // scrim sólido sin backdrop-filter para evitar restos del blur del modal.
    opacity: 0,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
};

// Panel anclado abajo: entra como una hoja de preview y sale hacia la ficha.
// NO se anima `filter: blur` (re-desenfocaba el panel en cada frame, carísimo):
// solo opacity + y + scale, que se componen en GPU. Además el backdrop-blur del
// panel se DESACTIVA durante la entrada (ver `panelSettled`) para que el
// transform no obligue a recalcular el backdrop-filter frame a frame.
const panelVariants = {
  hidden: { opacity: 0, y: 86, scale: 0.965 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 170,
      damping: 22,
      mass: 0.9,
    },
  },
  navigate: {
    // El panel real se oculta: el movimiento visible lo hace un clon inerte
    // montado en body, independiente del ciclo de render de App Router.
    opacity: 0,
    y: 0,
    scale: 1,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 0,
    y: 52,
    scale: 0.985,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
};

// Placement "right" (páginas de usuario): drawer anclado al borde derecho que
// entra deslizándose desde la derecha hacia el centro, con el mismo ancho. Se
// anima solo `x` (transform en GPU); ease-out sin overshoot para que no asome
// hueco tras el borde derecho.
// `custom` = switching: true cuando se cambia de un título a otro con el drawer YA
// abierto. En ese caso NO se desliza (dejaría ver el fondo un instante): se hace un
// fundido cruzado en el sitio entre la ficha saliente y la entrante. En la apertura
// inicial (switching false) sí entra deslizando desde el borde derecho.
const panelVariantsRight = {
  hidden: (switching) =>
    switching ? { opacity: 0 } : { opacity: 0, x: "100%" },
  visible: (switching) => ({
    opacity: 1,
    x: 0,
    transition: switching
      ? { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
      : { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
  }),
  navigate: {
    // Igual que en el centrado: el panel real se oculta y el movimiento a la
    // ficha completa lo hace el clon inerte.
    opacity: 0,
    x: 0,
    transition: { duration: 0 },
  },
  exit: (switching) =>
    switching
      ? { opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }
      : {
          opacity: 0,
          x: "100%",
          transition: { duration: 0.26, ease: [0.4, 0, 1, 1] },
        },
};

// ---- Redimensionado del drawer derecho -------------------------------------
// El usuario puede arrastrar el borde izquierdo para agrandar/encoger el ancho.
// Se persiste en localStorage y se acota a límites seguros que no rompen el
// layout (mínimo cómodo, y como mucho casi todo el viewport).
const RESIZE_STORAGE_KEY = "showverse:detailModalWidth";

function clampDrawerWidth(width, viewportWidth) {
  const vw = viewportWidth || 1280;
  // En pantallas estrechas el mínimo se adapta para no desbordar.
  const min = Math.min(420, Math.max(300, vw - 24));
  const max = Math.round(vw * 0.98);
  return Math.max(min, Math.min(Math.round(width || 0), max));
}

function initialDrawerWidth() {
  if (typeof window === "undefined") return 1080;
  const vw = window.innerWidth;
  let stored = NaN;
  try {
    stored = Number(window.localStorage.getItem(RESIZE_STORAGE_KEY));
  } catch {
    // localStorage no disponible
  }
  const base =
    Number.isFinite(stored) && stored > 0
      ? stored
      : Math.min(Math.round(vw * 0.95), 1080);
  return clampDrawerWidth(base, vw);
}

/* ============================== SUBCOMPONENTES ============================== */
function SkeletonBar({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-full bg-white/10 ${className}`} />
  );
}

/* =========================== TARJETA "SIMILAR" ============================= */
// Tarjeta de "Títulos similares": muestra SOLO el backdrop (con el título
// rotulado en inglés cuando existe). Arranca con el backdrop por defecto del
// item y, al montar, resuelve el mejor backdrop EN INGLÉS (fetchBestBackdrop
// prioriza en → otro idioma → textless) y lo intercambia con un fundido.
function SimilarBackdrop({ rec, onOpen }) {
  const recMediaType = getMediaTypeForItem(rec);
  const recTitle = rec?.title || rec?.name || "";
  const fallback = rec?.backdrop_path
    ? buildImg(rec.backdrop_path, "w780")
    : rec?.poster_path
      ? buildImg(rec.poster_path, "w780")
      : null;
  const [src, setSrc] = useState(fallback);

  useEffect(() => {
    let alive = true;
    setSrc(fallback);
    (async () => {
      try {
        const path = await fetchBestBackdrop(rec.id, recMediaType);
        if (alive && path) setSrc(buildImg(path, "w780"));
      } catch {
        // silencio: conservamos el backdrop por defecto
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.id, recMediaType]);

  return (
    <div
      className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-neutral-800 shadow-md transition duration-300 hover:border-white/30 hover:shadow-lg hover:shadow-black/40"
      role="button"
      tabIndex={onOpen ? 0 : -1}
      title={recTitle}
      onClick={() => onOpen?.(rec)}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(rec);
        }
      }}
    >
      {src ? (
        <NextImage
          src={src}
          alt={recTitle}
          fill
          sizes="(min-width:1024px) 260px, (min-width:640px) 320px, 72vw"
          className="object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-bold text-zinc-500">
          {recTitle}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <PlayCircle className="h-11 w-11 text-white/90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]" />
      </div>
    </div>
  );
}

/* ======================== SELECTOR DE TEMPORADA =========================== */
// Desplegable personalizado (glassy) que sustituye al <select> nativo: botón con
// la temporada activa + nº de episodios, y menú animado con todas las temporadas
// (marca la activa). Cierra al hacer click fuera o con Escape.
function SeasonDropdown({ seasons, value, onChange, labelId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = seasons.find((s) => s.season_number === value) || null;

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-full sm:w-[230px]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => setOpen((o) => !o)}
        className={`group flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-bold transition-all duration-300 select-none outline-none focus:outline-none focus:ring-0 active:outline-none ${
          open
            ? "border-yellow-500/40 bg-white/[0.08] text-white shadow-[0_0_15px_rgba(234,179,8,0.1)]"
            : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        <span className="truncate">
          Temporada {current?.season_number ?? "—"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-all duration-300 ${
            open ? "rotate-180 text-yellow-400" : "text-zinc-400 group-hover:text-zinc-200"
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 z-50 mt-2 max-h-72 w-full min-w-[200px] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl soundtrack-scrollbar outline-none focus:outline-none"
          >
            {seasons.map((season) => {
              const active = season.season_number === value;
              return (
                <li key={season.season_number} className="list-none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(season.season_number);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-all duration-200 select-none outline-none focus:outline-none focus:ring-0 active:outline-none ${
                      active
                        ? "bg-yellow-500/10 text-yellow-400 font-bold shadow-[inset_0_1px_1px_rgba(254,240,138,0.05)]"
                        : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    <span className="flex-1 truncate">
                      Temporada {season.season_number}
                    </span>
                    {season.episode_count ? (
                      <span className={`shrink-0 text-xs font-medium transition-colors ${
                        active ? "text-yellow-500/80" : "text-zinc-500 group-hover:text-zinc-400"
                      }`}>
                        {season.episode_count} ep.
                      </span>
                    ) : null}
                    {active && (
                      <Check
                        className="h-4 w-4 shrink-0 text-yellow-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// En el modal NO mostramos las flechas de navegación (quedan apretadas contra
// los bordes del panel estrecho): el desplazamiento se hace por arrastre /
// deslizamiento. En DetailsClient sí se muestran (valores por defecto).
const MODAL_ARROW_PROPS = {
  showArrows: false,
};

/* ================================== MODAL ================================== */
export default function DetailModal({ item, onClose, placement = "center" }) {
  const isRightPlacement = placement === "right";
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();
  const { loading, data } = useDetailModalData(item);

  const scrollContainerRef = useRef(null);
  const panelRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollContainerRef });
  const [modalHostReady, setModalHostReady] = useState(false);

  useEffect(() => {
    setModalHostReady(true);
  }, []);

  // Parallax del hero: se mueve a 1/3 de la velocidad de scroll
  const yParallax = useTransform(scrollY, [0, 400], [0, 130]);
  
  // Escala del hero: hace un sutil zoom-in al hacer scroll
  const scale = useTransform(scrollY, [0, 400], [1, 1.08]);

  // Opacidad del logo/título: se desvanece más tarde al hacer scroll
  const logoOpacity = useTransform(scrollY, [0, 300], [1, 0]);

  // Parallax del logo/título: sube ligeramente al desvanecerse
  const logoY = useTransform(scrollY, [0, 300], [0, -20]);

  // Degradado oscuro: se oscurece sutilmente al hacer scroll
  const darkOverlayOpacity = useTransform(scrollY, [0, 300], [0, 0.5]);

  // Preview de EPISODIO: variante que reutiliza el mismo diseño (hero, valoraciones,
  // reparto, navegador de temporadas) pero con datos del episodio. Se detecta desde
  // el propio item (no solo desde `data`) para que la variante esté activa DESDE EL
  // PRIMER FRAME (evita un flash del layout de película antes de cargar los datos).
  const isEpisode = !!data.isEpisode || item?.media_type === "episode";
  const mediaType = isEpisode
    ? "tv"
    : data.mediaType || getMediaTypeForItem(item);
  const episodeMeta = data.episodeMeta || null;
  const title = data.title || item?.title || item?.name || "";
  const backdropPath = data.backdropPath || item?.backdrop_path || null;
  // HERO: usa SOLO el arte FINAL (heroBackdropPath / heroPosterPath), que se fija
  // una única vez y YA PRECARGADO en useDetailModalData. Nunca la semilla del item:
  // hasta que el arte final existe se muestra el esqueleto, así se ve una sola
  // imagen (sin el parpadeo de cargar antes otra backdrop).
  const heroBackdropSrc = data.heroBackdropPath
    ? buildImg(data.heroBackdropPath, "w1280")
    : null;
  const heroPosterSrc = data.heroPosterPath
    ? buildImg(data.heroPosterPath, "w780")
    : null;
  const desktopHeroSrc = heroBackdropSrc;
  const mobileHeroSrc = heroPosterSrc || heroBackdropSrc;
  const hasHeroArt = !!(desktopHeroSrc || mobileHeroSrc);
  const seasonSelectId = useId();
  const availableSeasons = useMemo(() => {
    const source = Array.isArray(data.seasons) ? data.seasons : [];
    return source
      .map((season) => ({
        ...season,
        season_number: normalizeSeasonNumber(season?.season_number),
        episode_count: Number(season?.episode_count || 0),
      }))
      .filter(
        (season) =>
          season.season_number != null &&
          season.season_number > 0 &&
          season.episode_count > 0,
      )
      .sort((a, b) => a.season_number - b.season_number);
  }, [data.seasons]);
  const availableSeasonsKey = useMemo(
    () => availableSeasons.map((season) => season.season_number).join(","),
    [availableSeasons],
  );
  const preferredSeasonNumber = normalizeSeasonNumber(
    item?.nextEpisode?.season ?? item?.seasonNumber,
  );
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(null);
  const [seasonPreview, setSeasonPreview] = useState({
    loading: false,
    error: "",
    data: null,
  });

  /* --------------------------- favorito / pendientes --------------------------- */
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  // Modal CENTRADO: el backdrop-blur del panel solo se aplica una vez TERMINADA la
  // animación de entrada; durante la entrada el panel se transforma (y/scale) y
  // tener el backdrop-filter activo obligaría a recalcular el desenfoque en cada
  // frame (lento, sobre todo en móvil). El fondo ya va difuminado por el dim.
  // Drawer DERECHO: no hay dim de fondo, así que el blur del panel debe estar
  // presente desde el primer frame (tanto en la apertura inicial como al cambiar
  // de título); si no, la tarjeta se ve sin fondo durante la animación.
  const [panelSettled, setPanelSettled] = useState(() => isRightPlacement);

  // Ancho del drawer derecho (redimensionable arrastrando el borde izquierdo).
  const [panelWidth, setPanelWidth] = useState(initialDrawerWidth);
  const panelWidthRef = useRef(panelWidth);

  // Reajusta el ancho si cambia el tamaño de la ventana (no desbordar / no romper).
  useEffect(() => {
    if (!isRightPlacement || typeof window === "undefined") return undefined;
    const onResize = () => {
      setPanelWidth((w) => {
        const next = clampDrawerWidth(w, window.innerWidth);
        panelWidthRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isRightPlacement]);

  // Arrastre del borde izquierdo. Durante el gesto se escribe el ancho DIRECTAMENTE
  // en el DOM del panel (sin re-render del modal, para que sea fluido); al soltar se
  // reconcilia el estado y se persiste.
  const beginResize = (event) => {
    if (!isRightPlacement || typeof window === "undefined") return;
    event.preventDefault();
    event.stopPropagation();
    const vw = window.innerWidth;
    panelWidthRef.current = panelWidth;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (moveEvent) => {
      // Drawer anclado a la derecha: el ancho = distancia del puntero al borde dcho.
      const next = clampDrawerWidth(vw - moveEvent.clientX, vw);
      panelWidthRef.current = next;
      if (panelRef.current) panelRef.current.style.width = `${next}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      setPanelWidth(panelWidthRef.current);
      try {
        window.localStorage.setItem(
          RESIZE_STORAGE_KEY,
          String(panelWidthRef.current),
        );
      } catch {
        // localStorage no disponible
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const [externalLinksOpen, setExternalLinksOpen] = useState(false);
  // Pestaña activa de la variante de episodio (Detalles / Sinopsis).
  const [episodeTab, setEpisodeTab] = useState("details");
  // Acciones de EPISODIO (visto Trakt + puntuación), como en EpisodeDetails.
  const [epWatch, setEpWatch] = useState({
    connected: false,
    watched: false,
    plays: 0,
    loading: false,
    busy: false,
  });
  const [epRate, setEpRate] = useState({
    value: null,
    loading: false,
    connected: true,
  });
  const [officialSiteState, setOfficialSiteState] = useState({
    itemKey: "",
    url: null,
  });
  const [resolvedExternalLinks, setResolvedExternalLinks] = useState({
    justwatch: null,
    letterboxd: null,
  });
  const [userRating, setUserRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [navigatingToFullDetails, setNavigatingToFullDetails] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!item || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        return;
      }
      try {
        setLoadingStates(true);
        const st = await getBackendItemStatus({
          type: mediaType,
          tmdbId: item.id,
        });
        if (!cancel) {
          setFavorite(!!st.favorite);
          setWatchlist(!!st.watchlist);
          if (st.rating !== undefined) {
            const rating =
              st.rating == null || !Number.isFinite(Number(st.rating))
                ? null
                : Number(st.rating);
            setUserRating(rating);
          }
        }
      } catch {
        // silencio
      } finally {
        if (!cancel) setLoadingStates(false);
      }
    };
    load();
    return () => {
      cancel = true;
    };
  }, [item, session, account, mediaType]);

  useEffect(() => {
    if (mediaType !== "tv" || availableSeasons.length === 0) {
      setSelectedSeasonNumber(null);
      return;
    }

    const preferred =
      preferredSeasonNumber != null &&
      availableSeasons.some(
        (season) => season.season_number === preferredSeasonNumber,
      )
        ? preferredSeasonNumber
        : availableSeasons[0].season_number;

    setSelectedSeasonNumber((current) =>
      availableSeasons.some((season) => season.season_number === current)
        ? current
        : preferred,
    );
  }, [
    mediaType,
    availableSeasons,
    availableSeasonsKey,
    preferredSeasonNumber,
    item?.id,
  ]);

  useEffect(() => {
    if (mediaType !== "tv" || !item?.id || selectedSeasonNumber == null) {
      setSeasonPreview({ loading: false, error: "", data: null });
      return undefined;
    }

    const controller = new AbortController();
    const showId = Number(item.id);
    const cacheKey = `${showId}:${selectedSeasonNumber}`;
    const cached = modalSeasonCache.get(cacheKey);
    if (cached) {
      setSeasonPreview({ loading: false, error: "", data: cached });
      return undefined;
    }

    setSeasonPreview({ loading: true, error: "", data: null });
    fetchModalSeasonEpisodes({
      showId,
      seasonNumber: selectedSeasonNumber,
      signal: controller.signal,
    })
      .then((seasonData) => {
        if (!controller.signal.aborted) {
          setSeasonPreview({ loading: false, error: "", data: seasonData });
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        setSeasonPreview({
          loading: false,
          error: "No se pudieron cargar los episodios.",
          data: null,
        });
      });

    return () => controller.abort();
  }, [mediaType, item?.id, selectedSeasonNumber]);

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  // ===== EPISODIO: carga de estado (visto + puntuación del usuario) =====
  useEffect(() => {
    if (item?.media_type !== "episode") return undefined;
    const showId = item.showId ?? item.id;
    const season = item.seasonNumber;
    const episode = item.episodeNumber;
    if (showId == null || season == null || episode == null) return undefined;

    let alive = true;
    setEpWatch((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        const plays = await traktGetEpisodePlays({
          tmdbId: showId,
          season,
          episode,
        });
        if (alive) {
          setEpWatch((s) => ({
            ...s,
            connected: plays?.connected !== false,
            watched: (plays?.plays ?? 0) > 0,
            plays: plays?.plays ?? 0,
            loading: false,
          }));
        }
      } catch {
        if (alive) setEpWatch((s) => ({ ...s, loading: false }));
      }
      try {
        const res = await fetch(
          `/api/trakt/ratings?type=episode&tmdbId=${showId}&season=${season}&episode=${episode}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (res.status === 401) {
          setEpRate({ value: null, loading: false, connected: false });
          return;
        }
        const j = await res.json().catch(() => ({}));
        setEpRate({
          value: typeof j?.rating === "number" ? j.rating : null,
          loading: false,
          connected: true,
        });
      } catch {
        // sin puntuación del usuario
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    item?.media_type,
    item?.id,
    item?.showId,
    item?.seasonNumber,
    item?.episodeNumber,
  ]);

  const handleEpisodeWatchedToggle = async () => {
    if (item?.media_type !== "episode" || epWatch.busy) return;
    if (requireLogin()) return;
    const showId = item.showId ?? item.id;
    const next = !epWatch.watched;
    setEpWatch((s) => ({ ...s, busy: true }));
    try {
      await traktSetEpisodeWatched({
        tmdbId: showId,
        season: item.seasonNumber,
        episode: item.episodeNumber,
        watched: next,
        title,
      });
      setEpWatch((s) => ({
        ...s,
        watched: next,
        plays: next ? Math.max(1, s.plays) : 0,
        connected: true,
      }));
    } catch {
      // error al marcar
    } finally {
      setEpWatch((s) => ({ ...s, busy: false }));
    }
  };

  const handleEpisodeRate = async (val) => {
    if (item?.media_type !== "episode") return;
    if (requireLogin()) return;
    const showId = item.showId ?? item.id;
    const next = val == null || Number(val) <= 0 ? null : Number(val);
    setEpRate((r) => ({ ...r, loading: true }));
    try {
      const res = await fetch("/api/trakt/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "episode",
          tmdbId: showId,
          season: item.seasonNumber,
          episode: item.episodeNumber,
          rating: next,
        }),
      });
      if (res.status === 401) {
        requireLogin();
        return;
      }
      if (res.ok) {
        setEpRate((r) => ({ ...r, value: next, connected: true }));
      }
    } catch {
      // error al puntuar
    } finally {
      setEpRate((r) => ({ ...r, loading: false }));
    }
  };

  const posterForMutation =
    data.posterPath ||
    item?.poster_path ||
    backdropPath ||
    item?.backdrop_path ||
    null;

  const handleToggleFavorite = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !item) return;
    try {
      setUpdating(true);
      setError("");
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: item.id,
        favorite: next,
        title,
        posterPath: posterForMutation,
      });
    } catch {
      setFavorite((v) => !v);
      setError("No se pudo actualizar favoritos.");
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleWatchlist = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating || !item) return;
    try {
      setUpdating(true);
      setError("");
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: item.id,
        watchlist: next,
        title,
        posterPath: posterForMutation,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  /* -------------------------------- puntuación -------------------------------- */
  const isLoggedIn = !!session && !!account?.id;

  // Al cambiar de título, resetea la nota local (no persiste entre items).
  useEffect(() => {
    setUserRating(null);
  }, [item]);

  const handleRate = async (value) => {
    const canRate = isLoggedIn || traktConnected || traktStatus.connected;
    if (!canRate) {
      requireLogin();
      return false;
    }
    if (ratingLoading || !item) return false;

    const previousRating =
      userRating ??
      (typeof traktStatus.rating === "number" ? traktStatus.rating : null);
    const optimisticRating = value == null ? null : Number(value);

    try {
      setRatingLoading(true);
      setError("");
      setUserRating(optimisticRating);
      setTraktStatus((prev) => ({ ...prev, rating: optimisticRating }));

      const res = await fetch("/api/trakt/item/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: mediaType,
          tmdbId: item.id,
          rating: value,
          title,
          posterPath: posterForMutation,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          window.location.assign(
            `/login?next=${encodeURIComponent(
              window.location.pathname + window.location.search,
            )}`,
          );
          return false;
        }
        throw new Error(json?.error || "No se pudo guardar la puntuación.");
      }

      const savedRating = json.rating == null ? null : Number(json.rating);
      setUserRating(savedRating);
      setTraktStatus((prev) => ({
        ...prev,
        connected: true,
        rating: savedRating,
      }));
      return true;
    } catch {
      setUserRating(previousRating);
      setTraktStatus((prev) => ({ ...prev, rating: previousRating }));
      setError("No se pudo guardar la puntuación.");
      return false;
    } finally {
      setRatingLoading(false);
    }
  };

  /* ------------------------------- añadir a lista ------------------------------ */
  const {
    lists: userLists,
    loading: listsLoadingHook,
    error: listsHookError,
    refresh: refreshLists,
  } = useTmdbLists();
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [membershipMap, setMembershipMap] = useState({});
  const [busyListId, setBusyListId] = useState(null);
  const [listsError, setListsError] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  // Al cambiar de título, olvida la pertenencia local (se calcula optimista).
  useEffect(() => {
    setMembershipMap({});
  }, [item]);

  const openListsModal = () => {
    if (requireLogin() || !item) return;
    setListsError("");
    setListQuery("");
    setListModalOpen(true);
  };

  const closeListsModal = () => {
    setListModalOpen(false);
    setListQuery("");
    setListsError("");
    setCreateOpen(false);
    setNewListName("");
    setNewListDesc("");
  };

  const handleAddToSpecificList = async (listId) => {
    const lid = listId != null ? String(listId) : null;
    if (!lid || !item || membershipMap[lid]) return;
    setBusyListId(lid);
    setListsError("");
    try {
      await backendAddMovieToList({
        listId: lid,
        movieId: item.id,
        mediaType,
        title: title || undefined,
        posterPath: posterForMutation || undefined,
      });
      setMembershipMap((prev) => ({ ...prev, [lid]: true }));
    } catch (e) {
      setListsError(e?.message || "Error añadiendo a la lista");
    } finally {
      setBusyListId(null);
    }
  };

  const handleCreateListAndAdd = async () => {
    const n = newListName.trim();
    if (!n || !item) return;
    setCreatingList(true);
    setListsError("");
    try {
      const created = await backendCreateUserList({
        name: n,
        description: newListDesc.trim(),
      });
      const newListId =
        created?.list_id != null ? String(created.list_id) : null;
      if (!newListId) throw new Error("No se pudo crear la lista");
      await backendAddMovieToList({
        listId: newListId,
        movieId: item.id,
        mediaType,
        title: title || undefined,
        posterPath: posterForMutation || undefined,
      });
      await refreshLists();
      setMembershipMap((prev) => ({ ...prev, [newListId]: true }));
      setCreateOpen(false);
      setNewListName("");
      setNewListDesc("");
    } catch (e) {
      setListsError(e?.message || "Error creando lista");
    } finally {
      setCreatingList(false);
    }
  };

  /* --------------------------------- trailer --------------------------------- */
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);

  const handleToggleTrailer = async (e) => {
    e.stopPropagation();
    if (showTrailer) {
      setShowTrailer(false);
      return;
    }
    try {
      setTrailerLoading(true);
      setError("");
      const t = await getBestTrailerCached(item.id, mediaType);
      if (!t?.key) {
        setTrailer(null);
        setShowTrailer(false);
        setError("No hay tráiler disponible para este título.");
        return;
      }
      setTrailer(t);
      setShowTrailer(true);
    } catch {
      setTrailer(null);
      setShowTrailer(false);
      setError("No se pudo cargar el tráiler.");
    } finally {
      setTrailerLoading(false);
    }
  };

  const trailerSrc = trailer?.key
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}` +
      `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
      `&controls=0&iv_load_policy=3&disablekb=1&fs=0` +
      `&enablejsapi=1&origin=${
        typeof window !== "undefined"
          ? encodeURIComponent(window.location.origin)
          : ""
      }`
    : null;

  /* --------------------------------- soundtrack -------------------------------- */
  const [soundtrackOpen, setSoundtrackOpen] = useState(false);
  const [soundtrackTracks, setSoundtrackTracks] = useState([]);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");

  // Consulta de búsqueda igual que DetailsClient (título + año + "soundtrack").
  // En EPISODIO el soundtrack es el de la SERIE (no el del episodio concreto).
  const soundtrackTitle = isEpisode ? episodeMeta?.showName || title : title;
  const soundtrackSearchQuery = useMemo(() => {
    if (!soundtrackTitle) return "";
    return [
      soundtrackTitle,
      isEpisode ? null : data.year,
      mediaType === "tv" ? "series soundtrack" : "movie soundtrack",
    ]
      .filter(Boolean)
      .join(" ");
  }, [soundtrackTitle, data.year, mediaType, isEpisode]);

  const soundtrackSpotifyUrl = soundtrackSearchQuery
    ? `https://open.spotify.com/search/${encodeURIComponent(
        soundtrackSearchQuery,
      )}`
    : "";

  // Versión mínima de la carga de soundtrack de DetailsClient: pide a
  // /api/soundtrack y alimenta el SoundtrackModal (que ya reproduce previews).
  const loadSoundtrack = async () => {
    if (!soundtrackTitle) return;
    setSoundtrackLoading(true);
    setSoundtrackError("");
    try {
      const params = new URLSearchParams({
        title: soundtrackTitle,
        type: mediaType === "tv" ? "tv" : "movie",
        country: "ES",
      });
      if (
        !isEpisode &&
        data.originalTitle &&
        data.originalTitle !== soundtrackTitle
      ) {
        params.set("originalTitle", data.originalTitle);
      }
      if (!isEpisode && data.year) params.set("year", String(data.year));
      if (item?.id) params.set("tmdbId", String(item.id));

      const res = await fetch(`/api/soundtrack?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "No se pudo cargar el soundtrack");
      }
      const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
      setSoundtrackTracks(tracks);
      if (!tracks.length) {
        setSoundtrackError("No se encontraron canciones para este título.");
      }
    } catch (e) {
      setSoundtrackTracks([]);
      setSoundtrackError(
        e?.message || "No se pudo cargar la música del título.",
      );
    } finally {
      setSoundtrackLoading(false);
    }
  };

  const openSoundtrack = () => {
    setSoundtrackOpen(true);
    void loadSoundtrack();
  };

  /* ------------------------------- reseñas Trakt ------------------------------- */
  // Estado de conexión de Trakt en cliente (localStorage). Sirve para mostrar el
  // botón de reseñas solo cuando procede, igual criterio que DetailsClient
  // (allí `trakt.connected` viene del servidor; aquí usamos la señal de cliente).
  const { isConnected: traktConnected } = useTraktAuth();
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const traktType = mediaType === "tv" ? "show" : "movie";

  const handleCommentSubmit = async ({ comment, spoiler }) => {
    await traktAddComment({ type: traktType, tmdbId: item.id, comment, spoiler });
  };
  const handleCommentUpdate = async ({ commentId, comment, spoiler }) => {
    await traktUpdateComment({
      commentId,
      comment,
      spoiler,
      type: traktType,
      tmdbId: item.id,
    });
  };
  const handleCommentDelete = async ({ commentId }) => {
    await traktDeleteComment({ commentId, type: traktType, tmdbId: item.id });
  };

  /* ------------------------------ visto en Trakt ------------------------------ */
  // Estado de visionado del título en Trakt. Un único endpoint genérico
  // (/api/trakt/item/status) devuelve connected/watched/plays/lastWatchedAt/
  // traktUrl/history tanto para películas como para series, así que sirve para
  // pintar el botón (ojo/ojo tachado) y alimentar el TraktWatchedModal (gestor de
  // reproducciones). No replicamos la máquina de episodios de DetailsClient (para
  // TV allí se abre TraktEpisodesWatchedModal); aquí el botón muestra visto/no
  // visto y abre el gestor de reproducciones, que es funcional en ambos tipos.
  const [traktStatus, setTraktStatus] = useState({
    connected: false,
    found: false,
    watched: false,
    plays: 0,
    lastWatchedAt: null,
    traktUrl: null,
    history: [],
    rating: null,
  });
  const [traktStatusLoading, setTraktStatusLoading] = useState(false);
  const [traktBusy, setTraktBusy] = useState("");
  const [traktWatchedOpen, setTraktWatchedOpen] = useState(false);
  // Modal de episodios vistos (solo series). Su máquina de estado vive en el
  // hook compartido; aquí solo controlamos abrir/cerrar.
  const [traktEpisodesOpen, setTraktEpisodesOpen] = useState(false);
  const episodesWatched = useTraktEpisodesWatched({
    mediaType,
    tmdbId: item?.id,
    title,
    connected: traktConnected || traktStatus.connected,
    seasons: data.seasons,
    episodesModalOpen: traktEpisodesOpen,
    onStatusShouldRefresh: () => refreshTraktStatus(true),
  });

  const applyTraktStatus = (st) => {
    const rating =
      st?.rating == null || !Number.isFinite(Number(st.rating))
        ? null
        : Number(st.rating);

    setTraktStatus({
      connected: !!st?.connected,
      found: !!st?.found,
      watched: !!st?.watched,
      plays: Number(st?.plays || 0),
      lastWatchedAt: st?.lastWatchedAt || null,
      traktUrl: st?.traktUrl || null,
      history: Array.isArray(st?.history) ? st.history : [],
      rating,
    });
    setUserRating(rating);
  };

  const refreshTraktStatus = async (force = false) => {
    if (!item) return;
    try {
      setTraktStatusLoading(true);
      const st = await traktGetItemStatus({
        type: traktType,
        tmdbId: item.id,
        force,
      });
      applyTraktStatus(st);
    } catch {
      // silencio: dejamos el estado por defecto (no visto)
    } finally {
      setTraktStatusLoading(false);
    }
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!item) return;
      try {
        setTraktStatusLoading(true);
        const st = await traktGetItemStatus({
          type: traktType,
          tmdbId: item.id,
        });
        if (!cancel) applyTraktStatus(st);
      } catch {
        // sin estado de Trakt: botón en "no visto"
      } finally {
        if (!cancel) setTraktStatusLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, traktType]);

  const openTraktWatched = () => {
    if (!traktStatus.connected && !traktConnected) {
      requireLogin();
      return;
    }
    // Series → modal de EPISODIOS vistos (temporadas, rewatches, plays), igual
    // que DetailsClient. Películas → gestor de reproducciones.
    if (mediaType === "tv") {
      setTraktEpisodesOpen(true);
      return;
    }
    setTraktWatchedOpen(true);
    void refreshTraktStatus(true);
  };

  const handleTraktAddPlay = async (watchedAt) => {
    setTraktBusy("add");
    setError("");
    try {
      await traktAddWatchPlay({
        type: traktType,
        tmdbId: item.id,
        watchedAt,
        title,
        posterPath: posterForMutation,
      });
      await refreshTraktStatus(true);
    } catch {
      setError("No se pudo añadir la reproducción.");
    } finally {
      setTraktBusy("");
    }
  };

  const handleTraktUpdatePlay = async (historyId, watchedAt) => {
    setTraktBusy("update");
    setError("");
    try {
      await traktUpdateWatchPlay({
        type: traktType,
        tmdbId: item.id,
        historyId,
        watchedAt,
        title,
        posterPath: posterForMutation,
      });
      await refreshTraktStatus(true);
    } catch {
      setError("No se pudo actualizar la reproducción.");
    } finally {
      setTraktBusy("");
    }
  };

  const handleTraktRemovePlay = async (historyId) => {
    setTraktBusy("remove");
    setError("");
    try {
      await traktRemoveWatchPlay({ historyId });
      await refreshTraktStatus(true);
    } catch {
      setError("No se pudo eliminar la reproducción.");
    } finally {
      setTraktBusy("");
    }
  };

  /* --------------------------- valoración de episodios (TV) --------------------------- */
  const [episodeRatingsOpen, setEpisodeRatingsOpen] = useState(false);

  /* ------------------------------ ficha completa ------------------------------ */
  // Prefetch de la ficha completa al abrir el modal: así, al pulsar "Ver ficha
  // completa", DetailsClient ya está (casi) listo y la espera antes de deslizar
  // el modal es mínima (transición sin cortes ni pausas perceptibles).
  useEffect(() => {
    if (!item?.id) return;
    try {
      router.prefetch(dashboardDetailHref(item, mediaType));
    } catch {
      // prefetch best-effort
    }
  }, [item?.id, mediaType, router]);

  const goToFullDetails = async () => {
    if (navigatingToFullDetails) return;
    const href = dashboardDetailHref(item, mediaType);

    try {
      window.sessionStorage?.setItem(
        DETAILS_ROUTE_TRANSITION_KEY,
        `${mediaType}:${item?.id ?? ""}`,
      );
    } catch {
      // sessionStorage best-effort
    }

    if (prefersReducedMotion) {
      router.push(href);
      return;
    }

    const routeTransition = startFullDetailsTransition(
      panelRef.current,
      isRightPlacement ? "right" : "center",
    );
    setNavigatingToFullDetails(true);

    if (routeTransition) {
      await nextAnimationFrame();
    }

    router.push(href);

    if (routeTransition) {
      Promise.all([waitForDetailsRoot(), wait(DETAILS_ROUTE_REVEAL_MIN_MS)])
        .catch(() => {})
        .finally(routeTransition.reveal);
    }
  };

  /* --------------------------------- derivados --------------------------------- */
  // Las pestañas (estado activo + cuerpos) las gestiona <DetailsInfoTabs>.
  const production = data.production || {};
  const statusLabel = production.status || null;

  const scoreboard = data.scoreboard || null;
  const scoreStats = scoreboard?.stats || {};
  const hasScoreStats = Object.values(scoreStats).some(
    (v) => typeof v === "number",
  );
  const hasRatings =
    !!data.tmdbRating ||
    typeof data.imdbRating === "number" ||
    typeof scoreboard?.rating === "number" ||
    hasScoreStats;

  const hasMetaRow =
    !!data.year ||
    !!data.runtime ||
    !!data.seasonEpisodeValue ||
    !!statusLabel ||
    data.genres?.length > 0;

  const streamingProviders = useMemo(() => {
    const providers = Array.isArray(data.providers) ? data.providers : [];
    return dedupeStreamingProviders(providers)
      .slice(0, 6)
      .map((provider) =>
        createPlatformItem(provider, {
          endpointType: mediaType,
          justwatchUrl: null,
          title,
        }),
      )
      .filter((provider) => provider.icon && provider.hasValidLink);
  }, [data.providers, mediaType, title]);
  const hasProviders = streamingProviders.length > 0;

  const titleQuery = title.trim();
  const yearIso = data.year ? String(data.year).trim() : "";
  const isMovie = mediaType === "movie";
  const externalItemKey = `${mediaType || ""}:${item?.id ?? ""}`;
  const tmdbOfficialSiteUrl = useMemo(
    () => normalizeUrl(data.homepage),
    [data.homepage],
  );
  const officialSiteUrl =
    officialSiteState.itemKey === externalItemKey
      ? officialSiteState.url
      : tmdbOfficialSiteUrl;

  useEffect(() => {
    setOfficialSiteState({
      itemKey: externalItemKey,
      url: tmdbOfficialSiteUrl,
    });
  }, [externalItemKey, tmdbOfficialSiteUrl]);

  useEffect(() => {
    if (!item?.id || !mediaType) return undefined;

    const ac = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams({
          type: mediaType === "tv" ? "tv" : "movie",
          tmdbId: String(item.id),
        });
        const resolved = await fetchResolvedExternalLink(
          `/api/trakt/official-site?${params.toString()}`,
          { signal: ac.signal },
        );
        if (!ac.signal.aborted && resolved) {
          setOfficialSiteState({
            itemKey: externalItemKey,
            url: normalizeUrl(resolved),
          });
        }
      } catch {
        // El enlace oficial es best-effort; se conserva el fallback de TMDb.
      }
    })();

    return () => ac.abort();
  }, [externalItemKey, item?.id, mediaType]);

  useEffect(() => {
    if (!titleQuery) {
      setResolvedExternalLinks((prev) => ({ ...prev, justwatch: null }));
      return undefined;
    }

    const ac = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams({
          country: "es",
          title: titleQuery,
        });
        if (yearIso) params.set("year", yearIso);

        const resolved = await fetchResolvedExternalLink(
          `/api/links/justwatch?${params.toString()}`,
          { signal: ac.signal },
        );
        if (!ac.signal.aborted) {
          setResolvedExternalLinks((prev) => ({
            ...prev,
            justwatch: resolved || null,
          }));
        }
      } catch {
        if (!ac.signal.aborted) {
          setResolvedExternalLinks((prev) => ({ ...prev, justwatch: null }));
        }
      }
    })();

    return () => ac.abort();
  }, [titleQuery, yearIso]);

  useEffect(() => {
    if (!isMovie || (!titleQuery && !data.imdbId)) {
      setResolvedExternalLinks((prev) => ({ ...prev, letterboxd: null }));
      return undefined;
    }

    const ac = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams();
        if (data.imdbId) params.set("imdb", data.imdbId);
        else params.set("title", titleQuery);

        const resolved = await fetchResolvedExternalLink(
          `/api/links/letterboxd?${params.toString()}`,
          { signal: ac.signal },
        );
        if (!ac.signal.aborted) {
          setResolvedExternalLinks((prev) => ({
            ...prev,
            letterboxd: resolved || null,
          }));
        }
      } catch {
        if (!ac.signal.aborted) {
          setResolvedExternalLinks((prev) => ({ ...prev, letterboxd: null }));
        }
      }
    })();

    return () => ac.abort();
  }, [data.imdbId, isMovie, titleQuery]);

  const justWatchFallbackUrl = titleQuery
    ? `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(titleQuery)}`
    : null;
  const justWatchHref = resolvedExternalLinks.justwatch || justWatchFallbackUrl;
  const letterboxdFallbackUrl =
    isMovie && titleQuery
      ? data.imdbId
        ? `https://letterboxd.com/imdb/${encodeURIComponent(data.imdbId)}/`
        : `https://letterboxd.com/search/${encodeURIComponent(titleQuery)}/`
      : null;
  const letterboxdHref =
    resolvedExternalLinks.letterboxd || letterboxdFallbackUrl;
  const seriesGraphTitle = data.originalTitle || titleQuery;
  const seriesGraphUrl =
    mediaType === "tv" && item?.id && seriesGraphTitle
      ? `https://seriesgraph.com/show/${item.id}-${slugifyForSeriesGraph(
          seriesGraphTitle,
        )}`
      : null;
  const filmAffinitySearchUrl = titleQuery
    ? `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(
        titleQuery,
      )}&stype=title`
    : null;
  const externalLinks = useMemo(() => {
    const links = [];

    if (officialSiteUrl) {
      links.push({
        id: "web",
        label: "Web oficial",
        title: "Web oficial",
        icon: "/logo-Web.png",
        href: officialSiteUrl,
        wrapperClassName: "hidden sm:block",
      });
    }

    if (justWatchHref) {
      links.push({
        id: "jw",
        label: "JustWatch",
        title: "JustWatch",
        icon: "/logo-JustWatch.png",
        href: justWatchHref,
        fallbackHref: justWatchFallbackUrl,
      });
    }

    if (isMovie && letterboxdHref) {
      links.push({
        id: "lb",
        label: "Letterboxd",
        title: "Letterboxd",
        icon: "/logo-Letterboxd.png",
        href: letterboxdHref,
      });
    }

    if (mediaType === "tv" && seriesGraphUrl) {
      links.push({
        id: "sg",
        label: "SeriesGraph",
        title: "SeriesGraph",
        icon: "/logoseriesgraph.png",
        href: seriesGraphUrl,
      });
    }

    if (filmAffinitySearchUrl) {
      links.push({
        id: "fa",
        label: "FilmAffinity",
        title: "FilmAffinity",
        icon: "/logoFilmaffinity.png",
        href: filmAffinitySearchUrl,
      });
    }

    return links;
  }, [
    filmAffinitySearchUrl,
    isMovie,
    justWatchFallbackUrl,
    justWatchHref,
    letterboxdHref,
    mediaType,
    officialSiteUrl,
    seriesGraphUrl,
  ]);
  const hasExternalLinks = externalLinks.length > 0;

  const ratingActionValue =
    userRating ??
    (typeof traktStatus.rating === "number" ? traktStatus.rating : null);
  const ratingActionLoading = ratingLoading || traktStatusLoading;
  const ratingActionConnected =
    isLoggedIn || traktConnected || traktStatus.connected;

  const sentiment = data.sentiment || { pros: [], cons: [] };
  const hasSentiment =
    (sentiment.pros?.length || 0) > 0 || (sentiment.cons?.length || 0) > 0;
  const selectedSeasonEpisodes = useMemo(() => {
    const episodes = Array.isArray(seasonPreview.data?.episodes)
      ? seasonPreview.data.episodes
      : [];
    return episodes
      .filter((episode) => Number.isFinite(Number(episode?.episode_number)))
      .sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
  }, [seasonPreview.data]);
  const showSeasonsSection =
    mediaType === "tv" && availableSeasons.length > 0 && item?.id;
  const prefetchEpisodeDetails = (episodeNumber) => {
    if (!item?.id || selectedSeasonNumber == null || !episodeNumber) return;
    const href = `/details/tv/${item.id}/season/${selectedSeasonNumber}/episode/${episodeNumber}`;
    router.prefetch(href);
    if (typeof window !== "undefined") {
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  const modalLayer = (
    <>
      {/* Modal "Añadir a una lista" — mismo componente que la ficha completa */}
      <AddToListModal
        open={listModalOpen}
        onClose={closeListsModal}
        lists={userLists}
        loading={listsLoadingHook}
        error={listsError || listsHookError}
        query={listQuery}
        setQuery={setListQuery}
        membershipMap={membershipMap}
        busyListId={busyListId}
        onAddToList={handleAddToSpecificList}
        creating={creatingList}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        newName={newListName}
        setNewName={setNewListName}
        newDesc={newListDesc}
        setNewDesc={setNewListDesc}
        onCreateList={handleCreateListAndAdd}
      />

      {/* Soundtrack — mismo modal reproductor que la ficha completa */}
      <SoundtrackModal
        open={soundtrackOpen}
        onClose={() => setSoundtrackOpen(false)}
        title={title}
        tracks={soundtrackTracks}
        loading={soundtrackLoading}
        error={soundtrackError}
        searchUrl={soundtrackSpotifyUrl}
      />

      {/* Reseñas en Trakt — mismo modal que la ficha completa */}
      <TraktCommentModal
        open={commentModalOpen}
        onClose={() => setCommentModalOpen(false)}
        onSubmit={handleCommentSubmit}
        onUpdate={handleCommentUpdate}
        onDelete={handleCommentDelete}
        title={title}
        myComments={[]}
      />

      {/* Enlaces externos — mismo listado que la ficha completa */}
      <ExternalLinksModal
        open={externalLinksOpen}
        onClose={() => setExternalLinksOpen(false)}
        links={externalLinks}
      />

      {/* Visto en Trakt — gestor de reproducciones (mismo modal que la ficha
          completa para películas). Muestra plays/historial y permite añadir,
          editar y borrar visionados. */}
      <TraktWatchedModal
        open={traktWatchedOpen}
        onClose={() => {
          setTraktWatchedOpen(false);
          setTraktBusy("");
        }}
        title={title}
        connected={traktStatus.connected}
        found={traktStatus.found}
        traktUrl={traktStatus.traktUrl}
        watched={traktStatus.watched}
        plays={traktStatus.plays}
        lastWatchedAt={traktStatus.lastWatchedAt}
        history={traktStatus.history}
        busyKey={traktBusy}
        onAddPlay={handleTraktAddPlay}
        onUpdatePlay={handleTraktUpdatePlay}
        onRemovePlay={handleTraktRemovePlay}
      />

      {/* Visto en Trakt (SERIES) — modal de EPISODIOS vistos: temporadas,
          rewatches y plays. MISMO componente + MISMA lógica (hook compartido)
          que DetailsClient. */}
      {mediaType === "tv" && (
        <TraktEpisodesWatchedModal
          key={`${item?.id}-episodes-${traktEpisodesOpen ? "open" : "closed"}`}
          open={traktEpisodesOpen}
          onClose={() => {
            setTraktEpisodesOpen(false);
            episodesWatched.reconcileAfterClose();
          }}
          mediaType={mediaType}
          tmdbId={Number(item?.id)}
          title={title}
          connected={traktConnected || traktStatus.connected}
          seasons={Array.isArray(data.seasons) ? data.seasons : []}
          watchedBySeason={episodesWatched.watchedBySeason}
          busyKey={episodesWatched.episodeBusyKey}
          episodeBusyKey={episodesWatched.episodeBusyKey}
          onToggleEpisodeWatched={episodesWatched.toggleEpisodeWatched}
          onToggleShowWatched={episodesWatched.onToggleShowWatched}
          showPlays={episodesWatched.showPlays}
          showReleaseDate={data.showReleaseDate || null}
          onAddShowPlay={episodesWatched.onAddShowPlay}
          rewatchRuns={episodesWatched.rewatchRuns}
          activeView={episodesWatched.activeEpisodesView}
          activeEpisodesView={episodesWatched.activeEpisodesView}
          onChangeView={episodesWatched.changeEpisodesView}
          onChangeEpisodesView={episodesWatched.changeEpisodesView}
          onCreateRewatchRun={episodesWatched.createRewatchRun}
          onDeleteRewatchRun={episodesWatched.deleteRewatchRun}
          rewatchStartAt={episodesWatched.rewatchStartAt}
          watchedBySeasonRewatch={episodesWatched.rewatchWatchedBySeason}
          rewatchWatchedBySeason={episodesWatched.rewatchWatchedBySeason}
          onToggleEpisodeRewatch={episodesWatched.toggleEpisodeRewatch}
        />
      )}

      {/* Valoración de episodios (solo series) — mismo modal que la ficha
          completa; se autoabastece (ratings + temporadas) al abrirse. */}
      {mediaType === "tv" && (
        <EpisodeRatingsModal
          open={episodeRatingsOpen}
          onClose={() => setEpisodeRatingsOpen(false)}
          showId={Number(item?.id)}
          title={isEpisode ? episodeMeta?.showName || title : title}
        />
      )}
    </>
  );

  return (
    <div
      className={`fixed inset-0 z-[9999] flex ${
        isRightPlacement
          ? "justify-end pointer-events-none"
          : "justify-center"
      }`}
      role="dialog"
      aria-modal={isRightPlacement ? undefined : "true"}
      aria-label={title || "Ficha rápida"}
    >
      {/* Backdrop difuminado — clic fuera cierra. Al ir a la ficha completa el
          modal real se oculta y la transición la asume una capa temporal sin
          backdrop-filter, para que el blur no pueda filtrarse bajo la ruta nueva.
          En el drawer derecho NO hay backdrop: se ve y se puede usar la página de
          fondo (scroll + pulsar otro título). */}
      {!isRightPlacement && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate={navigatingToFullDetails ? "navigate" : "visible"}
          exit="exit"
          className="fixed inset-0 bg-black/70 backdrop-blur-xl"
          onClick={navigatingToFullDetails ? undefined : onClose}
        />
      )}

      {/* Panel ancho anclado al borde inferior, esquinas superiores redondeadas.
          La transición a la ficha completa anima un clon inerte de este panel. */}
      <motion.div
        ref={panelRef}
        variants={isRightPlacement ? panelVariantsRight : panelVariants}
        initial="hidden"
        animate={navigatingToFullDetails ? "navigate" : "visible"}
        exit="exit"
        onAnimationComplete={(definition) => {
          if (definition === "visible") setPanelSettled(true);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          willChange: "transform, opacity",
          // Drawer derecho: ancho controlado (redimensionable). Centrado: Tailwind.
          ...(isRightPlacement ? { width: panelWidth } : null),
        }}
        className={`relative z-10 flex flex-col overflow-hidden bg-black/[0.35] bg-gradient-to-br from-white/[0.12] via-transparent to-white/[0.04] shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)] ${
          isRightPlacement
            ? "h-full max-w-[98vw] rounded-l-2xl pointer-events-auto"
            : "mt-[4vh] h-[96vh] w-[95vw] max-w-[1080px] rounded-t-2xl"
        } ${panelSettled ? "backdrop-blur-md" : ""}`}
      >
        {/* Tirador de redimensionado: arrastra el borde izquierdo (solo drawer). */}
        {isRightPlacement && (
          <div
            onPointerDown={beginResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel"
            title="Arrastra para redimensionar"
            className="group absolute inset-y-0 left-0 z-40 flex w-3 cursor-col-resize touch-none items-center justify-center"
          >
            <div className="h-16 w-1 rounded-full bg-white/15 transition-colors duration-200 group-hover:bg-white/45" />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Botón superior izquierdo: cierra el modal */}
          <button
            type="button"
            onClick={onClose}
            disabled={navigatingToFullDetails}
            className="absolute left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 opacity-100 backdrop-blur-md transition-all duration-300 hover:bg-black/60 hover:text-white disabled:pointer-events-none select-none shadow-[0_4px_12px_rgba(0,0,0,0.5)] group"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
          </button>

          {/* Botón superior derecho: abre la ficha completa */}
          <button
            type="button"
            onClick={goToFullDetails}
            disabled={navigatingToFullDetails}
            className="absolute right-4 top-4 z-30 group flex h-10 w-10 hover:w-[166px] items-center justify-center gap-0 overflow-hidden rounded-full border border-white/10 bg-black/40 px-0 hover:px-3 text-white/80 opacity-100 backdrop-blur-md transition-all duration-300 ease-out hover:gap-1.5 hover:bg-black/60 hover:text-white disabled:pointer-events-none select-none shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            aria-label="Ver ficha completa"
            aria-busy={navigatingToFullDetails ? "true" : undefined}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight className="h-5 w-5 shrink-0" />
            </div>
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold leading-normal tracking-wide opacity-0 transition-[max-width,opacity] duration-200 group-hover:max-w-[120px] group-hover:opacity-100 translate-y-[1px]">
              Ver ficha completa
            </span>
          </button>

          {/* Contenedor con scroll interno (barra oculta) */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
          {/* HERO: póster textless en móvil, backdrop panorámico en sm+.
              El fondo se desvanece a transparente por abajo (sin borde) para que la
              imagen (enmascarada) se funda con el panel translúcido de contenido y
              NO se vea una línea/escalón entre portada e información. */}
          <div className="relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-b from-neutral-950 from-30% to-transparent sm:aspect-video">
            <motion.div
              style={{
                y: yParallax,
                scale,
                WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
              }}
              className="absolute inset-0 w-full h-full"
            >
              {!showTrailer && hasHeroArt && (
                <>
                  {mobileHeroSrc && (
                    <img
                      key={`mobile-${mobileHeroSrc}`}
                      src={mobileHeroSrc}
                      alt={title}
                      className="block h-full w-full object-contain sm:hidden"
                      loading="eager"
                      fetchPriority="high"
                    />
                  )}

                  {desktopHeroSrc && (
                    <img
                      key={`desktop-${desktopHeroSrc}`}
                      src={desktopHeroSrc}
                      alt={title}
                      className={`h-full w-full ${
                        mobileHeroSrc
                          ? "hidden object-cover sm:block"
                          : backdropPath
                            ? "block object-contain sm:object-cover"
                            : "hidden object-cover sm:block"
                      }`}
                      loading="eager"
                      fetchPriority="high"
                    />
                  )}
                </>
              )}

              {!showTrailer && !hasHeroArt && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />
              )}

              {showTrailer && (
                <>
                  {(trailerLoading || !trailerSrc) && (
                    <div className="absolute inset-0 animate-pulse bg-neutral-900" />
                  )}
                  {trailerSrc && (
                    <div className="absolute inset-0 overflow-hidden">
                      <iframe
                        key={trailer.key}
                        ref={trailerIframeRef}
                        className="pointer-events-none absolute left-1/2 top-1/2 h-[180%] w-[140%] -translate-x-1/2 -translate-y-1/2"
                        src={trailerSrc}
                        title={`Tráiler - ${title}`}
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen={false}
                        onLoad={() => {
                          try {
                            const win = trailerIframeRef.current?.contentWindow;
                            if (!win) return;
                            const target = "https://www.youtube-nocookie.com";
                            const cmd = (func, args = []) =>
                              win.postMessage(
                                JSON.stringify({ event: "command", func, args }),
                                target,
                                );
                            setTimeout(() => {
                              cmd("unMute");
                              cmd("setVolume", [30]);
                            }, 120);
                          } catch {}
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </motion.div>

            {/* Dark overlay that increases as we scroll */}
            <motion.div
              style={{ opacity: darkOverlayOpacity }}
              className="pointer-events-none absolute inset-0 bg-black/60 z-10"
            />

            {/* Sombra para el logo. TRANSPARENTE justo en el límite inferior (para
                no crear escalón con el panel) y oscura un poco más arriba, detrás
                del logo: se funde suavemente por ambos lados. */}
            <motion.div
              style={{ opacity: logoOpacity }}
              className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-transparent via-black/45 via-45% to-transparent z-10"
            />

            {/* Logo del título sobre el hero (fallback al texto si no hay logo) */}
            <motion.div
              style={{ opacity: logoOpacity, y: logoY }}
              className="absolute inset-x-0 bottom-0 z-15 flex justify-center p-5 text-center sm:block sm:p-7 sm:text-left"
            >
              {data.logoPath ? (
                <NextImage
                  key={data.logoPath}
                  src={buildImg(data.logoPath, "w500")}
                  alt={title}
                  width={500}
                  height={200}
                  sizes="(min-width:920px) 460px, 70vw"
                  className="h-auto max-h-28 w-auto max-w-[85%] object-contain object-center drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)] sm:max-h-36 sm:object-left"
                  loading="eager"
                  priority
                />
              ) : (
                <h2 className="mx-auto max-w-[85%] text-3xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:mx-0 sm:text-5xl">
                  {title || <SkeletonBar className="h-8 w-64" />}
                </h2>
              )}
            </motion.div>
          </div>

          {/* CONTENIDO */}
          <div className="space-y-6 p-5 sm:p-7">
            {/* Fila de acciones — MISMO componente presentacional que la ficha
                completa (DetailsClient). El tráiler sigue reproduciéndose inline
                en el hero; el resto abre los modales reutilizables. Se omiten el
                control de "visto" de Trakt y la valoración de episodios (no se
                pasan sus handlers), por lo que no se renderizan. */}
            {!isEpisode && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
            >
              <div className="w-[calc(100%_+_1rem)] min-w-0 sm:w-auto sm:flex-1">
                <DetailActionsRow
                  fillMobile
                  mobileGapClass="gap-1.5"
                  onTrailer={handleToggleTrailer}
                  trailerAvailable
                  trailerLoading={trailerLoading}
                  onSoundtrack={openSoundtrack}
                  soundtrackAvailable={!!soundtrackSearchQuery}
                  onEpisodeRatings={
                    mediaType === "tv"
                      ? () => setEpisodeRatingsOpen(true)
                      : undefined
                  }
                  episodeRatingsOpen={episodeRatingsOpen}
                  trakt={{
                    connected: traktConnected || traktStatus.connected,
                    // Series: el ojo refleja "algún episodio visto" (misma señal que
                    // DetailsClient). Películas: estado de visionado del título.
                    watched:
                      mediaType === "tv"
                        ? episodesWatched.hasAnyWatchedEpisode(
                            episodesWatched.watchedBySeason,
                          )
                        : traktStatus.watched,
                    // Para series no mostramos recuento de plays en el ojo (igual que
                    // DetailsClient, que allí usa un badge de progreso %).
                    plays: mediaType === "tv" ? 0 : traktStatus.plays,
                    // Series En progreso: % de episodios vistos en el botón, igual
                    // que DetailsClient (mismo cálculo, desde el hook compartido).
                    badge:
                      mediaType === "tv" ? episodesWatched.tvProgressBadge : null,
                    busy: !!traktBusy,
                    // Para TV esperamos también a que cargue el estado de episodios
                    // (evita el parpadeo "visto sin %"): mismo criterio que el
                    // watchedActionLoading de DetailsClient.
                    loading:
                      mediaType === "tv"
                        ? traktStatusLoading ||
                          ((traktConnected || traktStatus.connected) &&
                            !episodesWatched.watchedBySeasonLoaded)
                        : traktStatusLoading,
                    onOpen: openTraktWatched,
                  }}
                  rate={{
                    rating: ratingActionValue,
                    max: 10,
                    loading: ratingActionLoading,
                    onRate: handleRate,
                    connected: ratingActionConnected,
                    onConnect: () => requireLogin(),
                  }}
                  favorite={favorite}
                  favoriteLoading={loadingStates || updating}
                  onToggleFavorite={handleToggleFavorite}
                  watchlist={watchlist}
                  watchlistLoading={loadingStates || updating}
                  onToggleWatchlist={handleToggleWatchlist}
                  onAddToList={mediaType === "tv" ? undefined : openListsModal}
                  listActive={
                    mediaType === "tv"
                      ? false
                      : Object.values(membershipMap || {}).some(Boolean)
                  }
                  showComments={traktConnected || traktStatus.connected}
                  commentsActive={false}
                  onComments={() => setCommentModalOpen(true)}
                />
              </div>

              {hasProviders && (
                <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 self-center sm:justify-end">
                  {streamingProviders.map((prov) => (
                    <a
                      key={prov.key}
                      href={prov.href}
                      target={prov.target}
                      rel={prov.rel}
                      title={prov.subtitle || prov.title}
                      aria-label={`Abrir ${prov.title}`}
                      className="relative shrink-0 transition-transform duration-300 hover:scale-110 active:scale-95"
                    >
                      <img
                        src={prov.icon}
                        alt=""
                        className="h-11 w-11 rounded-xl object-contain shadow-lg"
                      />
                      {prov.isPlexProvider && (
                        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-green-500 ring-2 ring-black" />
                      )}
                    </a>
                  ))}
                </div>
              )}
            </motion.div>
            )}

            {/* EPISODIO: fila de acciones FUERA del ScoreboardBar (como en pelis/
                series): botones de visionado + puntuación a la izquierda y las
                plataformas de streaming a la derecha. */}
            {isEpisode && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
              >
                <div className="w-[calc(100%_+_1rem)] min-w-0 sm:w-auto sm:flex-1">
                  <DetailActionsRow
                    fillMobile
                    mobileGapClass="gap-1.5"
                    onTrailer={handleToggleTrailer}
                    trailerAvailable
                    trailerLoading={trailerLoading}
                    onSoundtrack={openSoundtrack}
                    soundtrackAvailable={!!soundtrackSearchQuery}
                    onEpisodeRatings={() => setEpisodeRatingsOpen(true)}
                    episodeRatingsOpen={episodeRatingsOpen}
                    trakt={{
                      connected: epWatch.connected,
                      watched: epWatch.watched,
                      plays: epWatch.plays,
                      badge: null,
                      busy: epWatch.busy,
                      loading: epWatch.loading,
                      onOpen: handleEpisodeWatchedToggle,
                    }}
                    rate={{
                      rating: epRate.value,
                      max: 10,
                      loading: epRate.loading,
                      onRate: handleEpisodeRate,
                      connected: epRate.connected,
                      onConnect: requireLogin,
                    }}
                  />
                </div>

                {hasProviders && (
                  <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 self-center sm:justify-end">
                    {streamingProviders.map((prov) => (
                      <a
                        key={prov.key}
                        href={prov.href}
                        target={prov.target}
                        rel={prov.rel}
                        title={prov.subtitle || prov.title}
                        aria-label={`Abrir ${prov.title}`}
                        className="relative shrink-0 transition-transform duration-300 hover:scale-110 active:scale-95"
                      >
                        <img
                          src={prov.icon}
                          alt=""
                          className="h-11 w-11 rounded-xl object-contain shadow-lg"
                        />
                        {prov.isPlexProvider && (
                          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-green-500 ring-2 ring-black" />
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            <div className="space-y-3">
              {/* Premios / nominaciones: misma línea verde que las previews del
                  dashboard (InlinePreviewCard). Se alimenta de la cadena cruda de
                  OMDb (data.awards) formateada con formatDashboardAwards. */}
              {data.awards && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center justify-center gap-2 text-center text-xs font-bold text-emerald-300 drop-shadow-md sm:justify-start sm:text-left sm:text-sm"
                >
                  <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-1">
                    {formatDashboardAwards(data.awards)}
                  </span>
                </motion.div>
              )}

              {error && (
                <p className="line-clamp-1 text-xs font-medium text-red-400">
                  {error}
                </p>
              )}

              {/* Fila meta + géneros (componente real compartido con DetailsClient).
                  En EPISODIO: serie · T{n}·E{n} · fecha · duración. */}
              {isEpisode ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-1.5 text-center sm:text-left"
                >
                  {episodeMeta?.seasonNumber != null &&
                    episodeMeta?.episodeNumber != null && (
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Episodio {episodeMeta.episodeNumber} · Temporada{" "}
                        {episodeMeta.seasonNumber}
                      </div>
                    )}
                  <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
                    {title || <SkeletonBar className="h-7 w-52" />}
                  </h2>
                </motion.div>
              ) : hasMetaRow ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DetailsMetaGenresRow
                    yearIso={data.year}
                    displayRuntimeValue={
                      mediaType === "tv" ? data.seasonEpisodeValue : data.runtime
                    }
                    status={data.status}
                    genres={data.genreObjects}
                  />
                </motion.div>
              ) : (
                loading && <SkeletonBar className="h-4 w-52" />
              )}
            </div>

            {/* Panel de puntuaciones + plataformas: MISMO componente
                presentacional que DetailsClient (badges CompactBadge + fila de
                stats), con plataformas integradas en la barra superior. */}
            {(hasRatings || hasExternalLinks || isEpisode) && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailsScoreboardPanel
                  loading={loading}
                  tmdb={
                    data.tmdbRating != null
                      ? {
                          value: data.tmdbRating,
                          sub: formatCountShort(data.tmdbVotes),
                          href: item?.id
                            ? `https://www.themoviedb.org/${
                                mediaType === "tv" ? "tv" : "movie"
                              }/${item.id}`
                            : undefined,
                        }
                      : null
                  }
                  traktPublic={
                    typeof scoreboard?.rating === "number"
                      ? {
                          value: Number(scoreboard.rating).toFixed(1),
                          sub: scoreboard.votes
                            ? formatCountShort(scoreboard.votes)
                            : undefined,
                        }
                      : null
                  }
                  imdb={
                    typeof data.imdbRating === "number"
                      ? {
                          value: data.imdbRating.toFixed(1),
                          sub: formatCountShort(data.imdbVotes),
                          href: data.imdbId
                            ? `https://www.imdb.com/title/${data.imdbId}`
                            : undefined,
                        }
                      : null
                  }
                  rt={
                    data.rtScore != null
                      ? { value: Math.round(data.rtScore) }
                      : null
                  }
                  mc={
                    data.mcScore != null
                      ? { value: Math.round(data.mcScore) }
                      : null
                  }
                  externalLinks={externalLinks}
                  streamingProviders={[]}
                  onMoreLinks={() => setExternalLinksOpen(true)}
                  share={{
                    title,
                    text: `Echa un vistazo a ${title} en The Show Verse`,
                    url:
                      typeof window !== "undefined" && item?.id
                        ? `${window.location.origin}/details/${mediaType}/${item.id}`
                        : undefined,
                  }}
                  stats={scoreStats}
                  showFavoritedStat={!isEpisode}
                  className="max-sm:-mx-2 max-sm:w-[calc(100%+1rem)]"
                />
              </motion.div>
            )}

            {/* EPISODIO: pestañas Detalles/Sinopsis (mismos componentes que
                EpisodeDetails). Detalles = Serie/Emisión/Duración/Episodio. */}
            {isEpisode ? (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailsTabsMenu
                  tabs={[
                    { id: "details", label: "Detalles" },
                    { id: "synopsis", label: "Sinopsis" },
                  ]}
                  activeTab={episodeTab}
                  onChangeTab={setEpisodeTab}
                  layoutId="detailModalEpisodeTab"
                />
                <div className="relative min-h-[80px] pt-3">
                  <AnimatePresence mode="wait" initial={false}>
                    {episodeTab === "synopsis" ? (
                      <motion.div
                        key="synopsis"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
                          {data.overview?.trim() ||
                            "No hay descripción disponible."}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="details"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                      >
                        <VisualMetaCard
                          icon={MonitorPlay}
                          label="Serie"
                          value={episodeMeta?.showName || "—"}
                          className="w-full sm:w-auto sm:flex-1"
                        />
                        <VisualMetaCard
                          icon={Calendar}
                          label="Emisión"
                          value={episodeMeta?.airDate || "—"}
                          className="w-full sm:w-auto sm:flex-1"
                        />
                        <VisualMetaCard
                          icon={Clock}
                          label="Duración"
                          value={episodeMeta?.runtime || "—"}
                          className="w-full sm:w-auto sm:flex-1"
                        />
                        <VisualMetaCard
                          icon={Star}
                          label="Episodio"
                          value={
                            episodeMeta?.seasonNumber != null &&
                            episodeMeta?.episodeNumber != null
                              ? `T${episodeMeta.seasonNumber} · E${episodeMeta.episodeNumber}`
                              : "—"
                          }
                          className="w-full sm:w-auto sm:flex-1"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailsInfoTabs
                  variant="normal"
                  layoutId="detailModalTab"
                  mediaType={mediaType}
                  originalTitle={data.originalTitle}
                  formatValue={
                    mediaType === "tv" ? data.episodeRuntimeValue || "—" : "—"
                  }
                  releaseDateValue={data.releaseDateValue}
                  status={data.status}
                  lastAirDateValue={data.lastAirDateValue}
                  budgetValue={data.budgetValue}
                  revenueValue={data.revenueValue}
                  director={data.director}
                  creators={data.creators}
                  network={data.network}
                  productionText={data.productionText}
                  tagline={data.tagline}
                  overview={data.overview}
                  awards={data.awards}
                  showAwardsTab={false}
                  platforms={[]}
                />
              </motion.div>
            )}

            {/* Reparto */}
            {data.cast?.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Reparto
                </h3>
                <DetailsArrowCarousel
                  {...MODAL_ARROW_PROPS}
                  spaceBetween={12}
                  slidesPerView={3}
                  breakpointsBase="container"
                  breakpoints={{
                    460: { slidesPerView: 4, spaceBetween: 12 },
                    640: { slidesPerView: 5, spaceBetween: 14 },
                    840: { slidesPerView: 6, spaceBetween: 16 },
                  }}
                  className="!overflow-visible pb-1"
                >
                  {data.cast.map((person) => {
                    const photo = person?.profile_path
                      ? buildImg(person.profile_path, "w342")
                      : null;
                    return (
                      <SwiperSlide key={person?.id ?? person?.credit_id ?? person?.name}>
                        <Link
                          href={`/details/person/${person.id}`}
                          className="block group relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800/80 shadow-md lg:hover:shadow-yellow-900/20 hover:border-yellow-500/30 transition-all duration-300"
                        >
                          <div className="aspect-[2/3] overflow-hidden relative">
                            {photo ? (
                              <OptimizedImage
                                src={photo}
                                alt={person?.name || ""}
                                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 grayscale-[15%] group-hover:grayscale-0"
                              />
                            ) : (
                              <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500 transition-colors duration-500 group-hover:bg-neutral-700">
                                <Users className="h-10 w-10" />
                              </div>
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />

                            <div className="absolute bottom-0 left-0 right-0 p-3 pb-4 transition-transform duration-500 ease-out translate-y-2 group-hover:translate-y-0">
                              <p className="text-white font-extrabold text-xs sm:text-sm leading-tight line-clamp-1 drop-shadow-sm">
                                {person?.name}
                              </p>
                              {person?.character && (
                                <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[10px] sm:text-xs font-semibold leading-tight line-clamp-1 transition-colors duration-300 drop-shadow-sm">
                                  {person.character}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      </SwiperSlide>
                    );
                  })}
                </DetailsArrowCarousel>
              </motion.section>
            )}

            {/* Títulos similares */}
            {data.recommendations?.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <MonitorPlay className="h-4 w-4" aria-hidden="true" />
                  Títulos similares
                </h3>
                <DetailsArrowCarousel
                  {...MODAL_ARROW_PROPS}
                  spaceBetween={12}
                  slidesPerView={1.3}
                  breakpointsBase="container"
                  breakpoints={{
                    460: { slidesPerView: 2, spaceBetween: 12 },
                    640: { slidesPerView: 2.4, spaceBetween: 14 },
                    840: { slidesPerView: 3, spaceBetween: 16 },
                  }}
                  className="!overflow-visible pb-2"
                >
                  {data.recommendations.slice(0, 14).map((rec) => (
                    <SwiperSlide key={`${getMediaTypeForItem(rec)}-${rec?.id}`}>
                      <SimilarBackdrop rec={rec} onOpen={openDetailModal} />
                    </SwiperSlide>
                  ))}
                </DetailsArrowCarousel>
              </motion.section>
            )}

            {/* Sentimientos de la comunidad (pros / cons) */}
            {hasSentiment && (
              <motion.section
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Sentimientos de la comunidad
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {sentiment.pros?.length > 0 && (
                    <div className="relative isolate overflow-hidden rounded-2xl border border-emerald-500/5 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-5 backdrop-blur-md">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                          <ThumbsUp className="h-4 w-4" />
                        </div>
                        <span className="font-bold tracking-wide text-emerald-100">
                          Positivo
                        </span>
                      </div>
                      <ul className="space-y-3">
                        {sentiment.pros.map((s, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sentiment.cons?.length > 0 && (
                    <div className="relative isolate overflow-hidden rounded-2xl border border-rose-500/5 bg-gradient-to-br from-rose-500/10 via-transparent to-transparent p-5 backdrop-blur-md">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                          <ThumbsDown className="h-4 w-4" />
                        </div>
                        <span className="font-bold tracking-wide text-rose-100">
                          Negativo
                        </span>
                      </div>
                      <ul className="space-y-3">
                        {sentiment.cons.map((s, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </motion.section>
            )}

            {showSeasonsSection && (
              <motion.section
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4 pb-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    <Layers className="h-4 w-4" aria-hidden="true" />
                    Temporadas y episodios
                  </h3>

                  <span id={seasonSelectId} className="sr-only">
                    Seleccionar temporada
                  </span>
                  <SeasonDropdown
                    seasons={availableSeasons}
                    value={selectedSeasonNumber}
                    onChange={setSelectedSeasonNumber}
                    labelId={seasonSelectId}
                  />
                </div>

                {seasonPreview.loading ? (
                  <div className="flex gap-3 overflow-hidden pb-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="w-[78%] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] sm:w-[46%] lg:w-[32%]"
                      >
                        <SkeletonBar className="aspect-video h-auto rounded-none" />
                        <div className="space-y-2 p-3">
                          <SkeletonBar className="h-3 w-1/3 rounded-full" />
                          <SkeletonBar className="h-3 w-4/5 rounded-full" />
                          <SkeletonBar className="h-3 w-2/3 rounded-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : seasonPreview.error ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
                    {seasonPreview.error}
                  </div>
                ) : selectedSeasonEpisodes.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
                    No hay episodios disponibles para esta temporada.
                  </div>
                ) : (
                  <DetailsArrowCarousel
                    {...MODAL_ARROW_PROPS}
                    spaceBetween={12}
                    slidesPerView={1.25}
                    breakpointsBase="container"
                    breakpoints={{
                      560: { slidesPerView: 2, spaceBetween: 12 },
                      840: { slidesPerView: 3, spaceBetween: 14 },
                    }}
                    className="!overflow-visible pb-2"
                  >
                    {selectedSeasonEpisodes.map((episode) => {
                      const episodeNumber = Number(episode?.episode_number);
                      const episodeTitle =
                        episode?.name || `Episodio ${episodeNumber}`;
                      const episodeAirDate = episode?.air_date
                        ? formatDateEs(episode.air_date)
                        : null;
                      const episodeRuntime =
                        Number(episode?.runtime || 0) || null;
                      const episodeStill = episode?.still_path
                        ? buildImg(episode.still_path, "w780")
                        : null;
                      const episodeHref = `/details/tv/${item.id}/season/${selectedSeasonNumber}/episode/${episodeNumber}`;

                      return (
                        <SwiperSlide
                          key={`${selectedSeasonNumber}-${episodeNumber}`}
                          className="h-auto"
                        >
                        <Link
                          href={episodeHref}
                          prefetch={false}
                          onClick={(e) => {
                            if (
                              e.metaKey ||
                              e.ctrlKey ||
                              e.shiftKey ||
                              e.altKey ||
                              e.button === 1 ||
                              !openDetailModal
                            ) {
                              return;
                            }
                            // Apila la preview del episodio sobre la actual
                            // (Atrás vuelve a la serie).
                            e.preventDefault();
                            openDetailModal(
                              {
                                media_type: "episode",
                                id: item.id,
                                showId: item.id,
                                seasonNumber: selectedSeasonNumber,
                                episodeNumber,
                                name: episodeTitle,
                                still_path: episode?.still_path || null,
                                showName: isEpisode
                                  ? episodeMeta?.showName
                                  : title,
                              },
                              { drill: true },
                            );
                          }}
                          onMouseEnter={() =>
                            prefetchEpisodeDetails(episodeNumber)
                          }
                          onFocus={() => prefetchEpisodeDetails(episodeNumber)}
                          onTouchStart={() =>
                            prefetchEpisodeDetails(episodeNumber)
                          }
                          className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-white/25 hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/40"
                          title={episodeTitle}
                        >
                          <div className="relative aspect-video overflow-hidden bg-white/[0.04]">
                            {episodeStill ? (
                              <NextImage
                                src={episodeStill}
                                alt={episodeTitle}
                                fill
                                sizes="(min-width:1024px) 300px, (min-width:640px) 46vw, 78vw"
                                className="object-cover transition duration-500 group-hover:scale-[1.03]"
                                loading="lazy"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
                                <ImageOff className="h-7 w-7" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-2.5">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                                Episodio {episodeNumber}
                              </div>
                              <div className="mt-0.5 line-clamp-1 text-[13px] font-bold leading-snug text-white">
                                {episodeTitle}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-1 flex-col gap-1.5 p-3">
                            {episodeAirDate || episodeRuntime ? (
                              <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                                {episodeAirDate ? <span>{episodeAirDate}</span> : null}
                                {episodeAirDate && episodeRuntime ? (
                                  <span aria-hidden="true">·</span>
                                ) : null}
                                {episodeRuntime ? (
                                  <span>{episodeRuntime} min</span>
                                ) : null}
                              </div>
                            ) : null}
                            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">
                              {episode?.overview?.trim() || "Sin descripción."}
                            </p>
                          </div>
                        </Link>
                        </SwiperSlide>
                      );
                    })}
                  </DetailsArrowCarousel>
                )}
              </motion.section>
            )}
          </div>
          </div>
        </div>
      </motion.div>

      {modalHostReady ? createPortal(modalLayer, document.body) : modalLayer}
    </div>
  );
}
