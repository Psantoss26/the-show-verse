"use client";
import { useOfflineTitle } from "@/lib/offline/useOfflineTitle";
import { isServerReachable } from "@/lib/offline/client";
import { openSavedRoute } from "@/lib/offline/navigation";

// /src/components/dashboard/DetailModal.jsx
// Ficha rápida (vista previa) que se abre desde las tarjetas del dashboard sobre
// el fondo difuminado. Panel ancho anclado al borde inferior, con esquinas
// superiores redondeadas y scroll interno (oculto, como AddToListModal). Réplica
// del lenguaje visual de DetailsClient (paneles glassy, badges de puntuación,
// pestañas Detalles/Producción/Sinopsis, reparto, similares y
// sentimientos) SIN importar sus internos: se replican los estilos.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import NextImage from "next/image";
import { createPortal } from "react-dom";
import OptimizedImage from "@/components/OptimizedImage";
import {
  X,
  Play,
  Heart,
  BookmarkPlus,
  Pin,
  PanelRight,
  Smartphone,
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
  Calendar,
  Clock,
  Star,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  clampDrawerWidth,
  clampMobileDetailsWidth,
  MOBILE_DETAILS_ASPECT_RATIO,
  phoneContentScale,
} from "@/lib/ui/detailModalSizing";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import { markAsFavorite, markInWatchlist } from "@/lib/api/tmdb";
import {
  cacheAddRating,
  cacheRemoveRating,
} from "@/lib/userLists/optimisticListCache";
import {
  addMovieToList as backendAddMovieToList,
  createUserList as backendCreateUserList,
  removeMovieFromList as backendRemoveMovieFromList,
} from "@/lib/api/backendLists";
import useTmdbLists from "@/lib/hooks/useTmdbLists";
import LiquidButton from "@/components/LiquidButton";
import {
  selectOwnedComments,
} from "@/lib/details/detailActionState";

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
import useRatingLinks from "@/lib/details/useRatingLinks";
import {
  buildTmdbHref,
  buildTraktHref,
  buildImdbHref,
} from "@/lib/details/ratingLinks";
import {
  formatCountShort,
  formatDateEs,
  slugifyForSeriesGraph,
} from "@/lib/details/formatters";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import AddToListModal from "@/components/details/AddToListModal";
import SoundtrackModal from "@/components/details/SoundtrackModal";
import VideoModal from "@/components/details/VideoModal";
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
import PhoneDetailsSections from "@/components/dashboard/PhoneDetailsSections";
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
  traktGetComments,
  traktGetItemStatus,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
  traktGetEpisodePlays,
  traktAddEpisodePlay,
} from "@/lib/api/traktClient";

import { useDetailModalData } from "@/components/dashboard/useDetailModalData";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
// Máquina de episodios vistos (series) COMPARTIDA con DetailsClient: misma
// lógica de toggles, rewatches, plays y persistencia en localStorage.
import { useTraktEpisodesWatched } from "@/lib/hooks/useTraktEpisodesWatched";
import { statusRetryDelay } from "@/lib/trakt/statusRetry";

const DETAILS_ROUTE_TRANSITION_KEY = "showverse:details-route-transition";
const DETAILS_ROUTE_REVEAL_MIN_MS = 500;
const DETAILS_ROUTE_CLEANUP_MS = 420;
const DETAIL_MODAL_GLASS_CONTROL = `${LIQUID_GLASS_PANEL} border-0 text-white/80 hover:bg-black/[0.34] hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 disabled:pointer-events-none disabled:opacity-60`;

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

function cleanupFullDetailsTransitionLayers() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll("[data-details-route-transition]")
    .forEach((element) => element.remove());
}

function startFullDetailsTransition(panelElement, variant = "center") {
  if (typeof document === "undefined" || !panelElement) return null;

  cleanupFullDetailsTransitionLayers();

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
// NO se anima `filter: blur` ni la opacidad de entrada: ambas propiedades
// atenuaban el liquid glass durante la carga. La hoja conserva su movimiento
// mediante y + scale, que se componen en GPU.
const panelVariants = {
  hidden: { opacity: 1, y: 86, scale: 0.965 },
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
// Curva de apertura: [0.32, 0.72, 0, 1], la misma que usan las hojas de iOS y
// Vaul. Arranca rápido y asienta suave SIN overshoot (requisito: un rebote
// dejaría asomar hueco tras el borde derecho). Sustituye a [0.22, 1, 0.36, 1]
// (easeOutQuint), cuya cola era tan larga y lenta que el panel parecía seguir
// flotando al final en vez de asentarse.
//
// En la apertura NO se anima ya `opacity`: un drawer sólido que entra deslizando
// se lee más nítido y directo que uno que además aparece de la nada, y se anima
// una propiedad menos. El fundido se conserva SOLO para `switching` (cambio de
// título con el drawer abierto), donde el crossfade sí es el efecto buscado.
const DRAWER_EASE_IN = [0.16, 1, 0.3, 1];
const DRAWER_EASE_OUT = [0.32, 0, 0.67, 0];

const panelVariantsRight = {
  hidden: (switching) =>
    switching ? { opacity: 0 } : { opacity: 1, x: "100%" },
  visible: (switching) => ({
    opacity: 1,
    x: 0,
    transition: switching
      ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
      : { duration: 0.32, ease: DRAWER_EASE_IN },
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
      ? { opacity: 0, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }
      : {
          // Sale deslizando sólido sin lag en la GPU: simétrico y fluido.
          opacity: 1,
          x: "100%",
          transition: { duration: 0.24, ease: DRAWER_EASE_OUT },
        },
};

// ---- Redimensionado del drawer derecho -------------------------------------
// El usuario puede arrastrar el borde izquierdo para agrandar/encoger el ancho.
// Se persiste en localStorage y se acota a límites seguros que no rompen el
// layout (mínimo cómodo, y como mucho casi todo el viewport).
const RESIZE_STORAGE_KEY = "showverse:detailModalWidth";

// Propiedad de la CSS var `--sv-drawer-width` (la publica el efecto de más abajo
// para que otros overlays se centren en el espacio libre). Un contador de "dueño"
// evita que, al CAMBIAR de título, el cleanup del drawer SALIENTE (que
// AnimatePresence mantiene montado) borre la var del nuevo que sigue abierto.
let drawerWidthVarSeq = 0;
let drawerWidthVarOwner = 0;

// Límites del drawer.
//
// MÁXIMO: media pantalla.
//
// MÍNIMO: un ancho al que el panel sigue siendo legible.
//
// AQUÍ HABÍA 896px, Y CONGELABA EL REDIMENSIONADO.
// Ese valor no era un mínimo de usabilidad sino una PREFERENCIA DE MAQUETACIÓN:
// el punto exacto en el que la fila de Reparto pasa de 6 a 5 tarjetas (su Swiper
// usa `breakpointsBase="container"`, con el breakpoint de 6 tarjetas en 840px de
// contenedor, más 56px del padding horizontal del área de secciones).
// El problema es que el máximo es media pantalla: en cualquier ventana de menos
// de 1792px el mínimo ALCANZABA al máximo (p. ej. a 1440px: min 896 → acotado a
// 720, max 720) y el rango se quedaba en cero. Resultado: arrastrar el tirador
// no hacía absolutamente nada en prácticamente ningún portátil ni monitor.
// La fila de Reparto ya baja a 5 tarjetas por sí sola —para eso están sus
// breakpoints—, así que no hay nada que proteger con un mínimo tan alto.

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

// La fila se monta ya en su posición final. Esperar sus consultas asíncronas
// antes de mostrarla introducía una pausa perceptible; cada control conserva su
// indicador de carga estable hasta que conoce su propio estado.
function DetailModalActionsReveal({ children, className = "" }) {
  return <div className={className}>{children}</div>;
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
      className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-neutral-800 shadow-md transition duration-300 hover:shadow-lg hover:shadow-black/40"
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
        className={`group flex h-11 w-full items-center justify-between rounded-xl border-0 px-4 text-left text-sm font-bold transition-all duration-300 select-none outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-yellow-400/70 active:outline-none ${
          open
            ? "bg-white/[0.08] text-white shadow-[0_0_15px_rgba(234,179,8,0.1)]"
            : "bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
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
            className="absolute right-0 z-50 mt-2 max-h-72 w-full min-w-[200px] overflow-y-auto rounded-xl border-0 bg-zinc-950/95 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl soundtrack-scrollbar outline-none focus:outline-none"
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
// Bloques de la ficha de teléfono que se escalan con el ancho del panel en
// escritorio (`--sv-phone-scale`, ver `phoneContentScale`). `zoom` y no
// `transform`: cambia también el espacio que ocupan, así que no se solapan con
// lo de debajo, y sus reglas internas por ancho (container queries) siguen
// viendo "un teléfono" y se reparten igual que en FullHD, solo que más grandes.
const PHONE_SCALED_BLOCK_STYLE = { zoom: "var(--sv-phone-scale, 1)" };

export default function DetailModal({
  item,
  onClose,
  placement = "center",
  switching = false,
  drawerView = "overlay",
  contentView = "modal",
  tabletViewport = false,
  onContentViewChange,
  onDrawerViewChange,
  onDrawerWidthChange,
  // Solo en los dashboards: alterna entre modal centrado y panel lateral.
  onPlacementChange,
}) {
  const isRightPlacement = placement === "right";
  const isDocked = isRightPlacement && drawerView === "docked";
  const mobileDetails = isRightPlacement && contentView === "mobile";
  const clampPanelWidth = useCallback(
    (width, viewportWidth) => mobileDetails
      ? clampMobileDetailsWidth(width, viewportWidth, window.innerHeight)
      : clampDrawerWidth(width, viewportWidth, { tablet: tabletViewport }),
    [mobileDetails, tabletViewport],
  );
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();
  const { loading, data, applyArtworkSelection } = useDetailModalData(item);
  useOfflineTitle(item?.media_type || item?.mediaType || (item?.first_air_date ? "tv" : "movie"), item?.id || item?.tmdbId, data);

  const scrollContainerRef = useRef(null);
  const panelRef = useRef(null);
  // Momento de apertura, para descartar el clic que viene del MISMO gesto que
  // abrió la ficha (ver la nota del cierre por clic fuera, más abajo). El modal
  // centrado lo necesita igual que el drawer: su velo ocupa toda la pantalla, así
  // que ese clic rezagado caía sobre él y lo cerraba al instante.
  const openedAtRef = useRef(0);
  if (openedAtRef.current === 0 && typeof performance !== "undefined") {
    openedAtRef.current = performance.now();
  }
  const isOpeningClick = () =>
    typeof performance !== "undefined" &&
    performance.now() - openedAtRef.current < 350;
  const { scrollY } = useScroll({ container: scrollContainerRef });
  const [modalHostReady, setModalHostReady] = useState(false);

  useEffect(() => {
    setModalHostReady(true);
  }, []);

  // ANIMACIÓN DEL HERO AL HACER SCROLL.
  //
  // Con "reducir movimiento" los recorridos se quedan a cero: además de ser lo
  // correcto, ahorra el trabajo por fotograma a quien menos lo tolera. Los
  // valores se siguen creando siempre (son hooks) y solo cambia su rango.
  const heroRange = (value) => (prefersReducedMotion ? [0, 0] : [0, value]);

  // Parallax del hero: se mueve a 1/3 de la velocidad de scroll
  const yParallax = useTransform(scrollY, [0, 400], heroRange(130));

  // Escala del hero: hace un sutil zoom-in al hacer scroll
  const scale = useTransform(
    scrollY,
    [0, 400],
    prefersReducedMotion ? [1, 1] : [1, 1.08],
  );

  // Degradado oscuro: se oscurece sutilmente al hacer scroll
  const darkOverlayOpacity = useTransform(scrollY, [0, 300], heroRange(0.5));

  // Preview de EPISODIO: variante que reutiliza el mismo diseño (hero, valoraciones,
  // reparto, navegador de temporadas) pero con datos del episodio. Se detecta desde
  // el propio item (no solo desde `data`) para que la variante esté activa DESDE EL
  // PRIMER FRAME (evita un flash del layout de película antes de cargar los datos).
  const isEpisode = !!data.isEpisode || item?.media_type === "episode";
  const mediaType = isEpisode
    ? "tv"
    : data.mediaType || getMediaTypeForItem(item);
  const detailKey = `${mediaType}:${item?.id ?? ""}`;
  const metadataLoading =
    !isEpisode &&
    (!data.detailsResolved || data.detailsKey !== detailKey);
  const episodeMeta = data.episodeMeta || null;
  const title = data.title || item?.title || item?.name || "";
  const ratingLinks = useRatingLinks({
    type: mediaType,
    tmdbId: item?.id,
    enabled: !isEpisode,
  });
  // Insignia de Rotten Tomatoes / Metacritic para el marcador.
  //
  // Las dos llegan en la MISMA respuesta que la nota de IMDb, así que
  // `imdbRatingResolved` es también su señal de "ya se sabe si hay dato". Mientras
  // no se sabe se manda `pending` en lugar de `null`: así la insignia reserva su
  // hueco en vez de ocupar cero. Sin eso, la barra nacía con las puntuaciones
  // ausentes, los botones de la derecha recibían más ancho del que les va a tocar
  // y se pintaban con etiqueta hasta que llegaban las notas y se compactaban de
  // golpe. Ya resuelto y sin dato vuelve a ser `null`: la insignia no se pinta, que
  // es lo correcto para una película sin nota en esos sitios.
  const optionalScoreBadge = (value, href) => {
    // Fuera de la ficha de teléfono: cinco insignias no caben en ese ancho y
    // empujaban los botones de la derecha fuera del panel. Las tres que se
    // conservan (TMDb, Trakt e IMDb) son las que llevan votos.
    if (mobileDetails) return null;
    if (value != null) return { value: Math.round(value), href };
    return data.imdbRatingResolved ? null : { pending: true };
  };

  const backdropPath = data.backdropPath || item?.backdrop_path || null;
  // HERO: usa SOLO el arte FINAL (heroBackdropPath / heroPosterPath), que se fija
  // una única vez y YA PRECARGADO en useDetailModalData. Nunca la semilla del item:
  // hasta que el arte final existe se muestra el esqueleto, así se ve una sola
  // imagen (sin el parpadeo de cargar antes otra backdrop).
  // `original` (y no w1280): el hero ocupa ~1080px CSS, que en pantallas de alta
  // densidad pedía más resolución de la que daba el w1280. Se pide el MISMO
  // tamaño que precargó el hook, para reutilizar esa descarga y que la imagen
  // aparezca ya pintada.
  const heroBackdropSrc = data.heroBackdropPath
    ? buildImg(data.heroBackdropPath, "original")
    : null;
  const heroPosterSrc = data.heroPosterPath
    ? buildImg(data.heroPosterPath, "w780")
    : null;
  const desktopHeroSrc = heroBackdropSrc;
  // TELÉFONO: el hero ES la portada, igual que en la ficha móvil completa.
  //
  // El `|| heroBackdropSrc` de siempre es un respaldo para cuando un título no
  // tiene portada, pero aquí se leía desde el primer frame: la backdrop suele
  // resolverse antes que la portada —y más aún cuando hay una selección del
  // usuario, que añade la comprobación de overrides— así que se pintaba la
  // backdrop recortada a 9:19.5 y un instante después la sustituía la portada.
  // Ese es el parpadeo.
  //
  // Con `heroPosterResolved` el respaldo solo entra cuando se SABE que no hay
  // portada; hasta entonces se ve el esqueleto. Es exactamente lo que hace la
  // ficha móvil, que no calcula ningún arte "por defecto" mientras no ha
  // resuelto la selección del usuario (`remoteArtworkChecked`).
  const mobileHeroSrc = mobileDetails
    ? heroPosterSrc || (data.heroPosterResolved ? heroBackdropSrc : null)
    : heroPosterSrc || heroBackdropSrc;
  const hasHeroArt = mobileDetails
    ? !!mobileHeroSrc
    : !!(desktopHeroSrc || mobileHeroSrc);
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
  // Arranca en `true`: el modal MONTA FRESCO por apertura (key en el provider), y
  // el estado favorito/pendiente se resuelve con un fetch post-montaje. Si empezara
  // en `false`, el botón mostraría icono → (efecto pone true) spinner → icono, es
  // decir un PARPADEO. Empezando en `true` es un único asentamiento spinner→icono
  // (normalmente ya resuelto durante la animación de apertura). La rama sin sesión
  // del efecto lo vuelve a poner en `false` para no quedarse colgado.
  const [loadingStates, setLoadingStates] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  // Modal CENTRADO: el backdrop-blur del panel solo se aplica una vez TERMINADA la
  // animación de entrada; durante la entrada el panel se transforma (y/scale) y
  // tener el backdrop-filter activo obligaría a recalcular el desenfoque en cada
  // frame (lento, sobre todo en móvil). El fondo ya va difuminado por el dim.
  // Drawer DERECHO: el blur va activo desde el primer frame, para que el cristal
  // difumine EN DIRECTO lo que el panel va pisando durante el recorrido y no
  // aparezca de golpe al terminar. Además, sin dim detrás, un panel sin blur se
  // vería casi transparente (es bg-black/35).
  //
  // Que esto sea asumible depende de dos cosas, ambas resueltas más abajo:
  //   1) NO animar `opacity` a la vez (ver panelVariantsRight). Animar opacidad
  //      sobre un elemento con backdrop-filter es patológico: obliga a pintarlo
  //      en un búfer aparte y recomponer el desenfoque con alfa cada frame.
  //   2) NO declarar `will-change: opacity` en el drawer, que forzaba esa misma
  //      capa con alfa aunque ya no animemos la opacidad.
  //
  // `panelSettled` solo limita `will-change` mientras se anima. El cristal del
  // drawer se mantiene montado durante toda su vida: al cambiar de título el
  // modal entrante arranca su fundido con este estado en false y, si el blur
  // dependiera de él, se vería un flash transparente hasta que terminase.
  const [panelSettled, setPanelSettled] = useState(false);

  // Las secciones de la ficha de TELÉFONO no se montan hasta que el panel ha
  // terminado de entrar.
  //
  // Son diez secciones con sus carruseles, sus paneles de cristal y nueve
  // consultas de red que salen todas a la vez. Montándolas durante la entrada,
  // ese trabajo cae justo encima de los 320ms de la animación y se lleva por
  // delante los fotogramas: el panel entra a tirones. Esperando a que se
  // asiente, la entrada solo tiene que pintar portada, logo y botones -- que es
  // además lo único que se ve sin hacer scroll.
  //
  // El temporizador es una RED DE SEGURIDAD, no el camino normal: si la
  // animación se interrumpe (cambio de título a medias, pestaña en segundo
  // plano) `onAnimationComplete` puede no llegar nunca, y las secciones no
  // pueden quedarse sin montar por eso.
  const [phoneSectionsReady, setPhoneSectionsReady] = useState(false);
  useEffect(() => {
    if (!mobileDetails) {
      setPhoneSectionsReady(false);
      return undefined;
    }
    if (panelSettled) {
      setPhoneSectionsReady(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setPhoneSectionsReady(true), 500);
    return () => window.clearTimeout(timer);
  }, [mobileDetails, panelSettled]);

  // Ancho del drawer derecho (redimensionable arrastrando el borde izquierdo).
  const [panelWidth, setPanelWidth] = useState(initialDrawerWidth);
  const panelWidthRef = useRef(panelWidth);
  // ¿Se está arrastrando el tirador? (lo marca `beginResize`).
  const resizingRef = useRef(false);
  // EL ANCHO QUE PINTA EL PANEL vive en un MotionValue, no en el estado.
  //
  // Durante el arrastre del tirador el ancho se escribe en el DOM en cada
  // fotograma, pero el estado `panelWidth` no cambia hasta soltar. Con
  // `style={{ width: panelWidth }}`, cualquier render de este componente a
  // mitad del gesto hacía que Framer REAPLICARA el ancho antiguo: el panel
  // volvía un fotograma a su tamaño anterior y al siguiente saltaba al nuevo.
  // Ese era el parpadeo, y en tablet se disparaba mucho más porque un gesto
  // táctil provoca renders (el navegador emite `resize` al mostrar u ocultar su
  // barra, por ejemplo). Un MotionValue no lo toca React: un render ya no puede
  // devolver el panel a un ancho viejo.
  const panelWidthMotion = useMotionValue(panelWidth);
  useEffect(() => {
    // Fuera del arrastre, el estado manda (apertura, ajuste a la ventana).
    if (resizingRef.current) return;
    panelWidthMotion.set(panelWidth);
  }, [panelWidth, panelWidthMotion]);

  useEffect(() => {
    // El hueco de la ficha "mobile" va a los DOS lados (ver `marginLeft` del
    // panel), así que lo reservado para el resto de la página es el doble.
    if (isRightPlacement) onDrawerWidthChange?.(panelWidth);
  }, [isRightPlacement, panelWidth, onDrawerWidthChange]);

  // Reajusta el ancho si cambia el tamaño de la ventana (no desbordar / no romper).
  useEffect(() => {
    if (!isRightPlacement || typeof window === "undefined") return undefined;
    const onResize = () => {
      // Arrastrando, el ancho lo lleva el gesto: este reajuste partiría del
      // ancho de ANTES del arrastre y lo devolvería a él a mitad del gesto.
      if (resizingRef.current) return;
      setPanelWidth((w) => {
        const next = clampPanelWidth(w, window.innerWidth);
        panelWidthRef.current = next;
        return next;
      });
    };
    let preferredWidth = initialDrawerWidth();
    if (mobileDetails) {
      preferredWidth = window.innerHeight * MOBILE_DETAILS_ASPECT_RATIO;
      try {
        const stored = Number(window.localStorage.getItem("showverse:mobileDetailsWidth"));
        if (stored > 0) preferredWidth = stored;
      } catch {
        // El panel funciona también sin almacenamiento.
      }
    }
    const nextWidth = clampPanelWidth(preferredWidth, window.innerWidth);
    panelWidthRef.current = nextWidth;
    setPanelWidth(nextWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isRightPlacement, clampPanelWidth, mobileDetails]);

  // Expone el ancho del drawer en una CSS var global mientras está abierto, para
  // que otros overlays superpuestos (p. ej. el modal de episodios agrupados del
  // Historial) puedan centrarse en el espacio libre a la IZQUIERDA sin taparlo.
  // Se limpia al cerrar (y en centrado/móvil nunca se pone → los overlays ocupan
  // la ventana completa como siempre).
  useEffect(() => {
    if (!isRightPlacement || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    const id = ++drawerWidthVarSeq;
    drawerWidthVarOwner = id;
    root.style.setProperty("--sv-drawer-width", `${panelWidth}px`);
    return () => {
      // Solo limpia si NINGUNA instancia posterior tomó el relevo. Al cambiar de
      // título, el drawer saliente que AnimatePresence mantiene montado ejecuta su
      // cleanup DESPUÉS de que el nuevo ya fijó la var; sin este guard borraría la
      // var del que sigue abierto y el overlay se expandiría tapando la preview.
      if (drawerWidthVarOwner === id) {
        drawerWidthVarOwner = 0;
        root.style.removeProperty("--sv-drawer-width");
      }
    };
  }, [isRightPlacement, panelWidth]);

  // RECORRIDO DEL LOGO AL HACER SCROLL.
  //
  // Iba fijo en 300px para las dos vistas. En el modal ancho eso es buena parte
  // de su hero (2:3 o panorámico), pero la ficha de TELÉFONO tiene un hero de
  // la altura del panel entero: a los 300px la portada apenas ha empezado a
  // irse y el logo ya había desaparecido.
  //
  // En el teléfono el recorrido se ata al alto del panel, que su proporción
  // deja en `ancho / (9/19.5)`. Empieza a desvanecerse pasada la mitad y
  // termina justo cuando el logo sale por arriba, en vez de mucho antes.
  // Con el ancho mínimo en pantallas bajas el panel se para en el alto de la
  // ventana (`max-h-full`), así que el recorrido usa el alto REAL.
  const phonePanelHeight = Math.min(
    panelWidth / MOBILE_DETAILS_ASPECT_RATIO,
    typeof window !== "undefined" ? window.innerHeight : Infinity,
  );
  const logoFadeFrom = mobileDetails ? Math.round(phonePanelHeight * 0.4) : 0;
  const logoFadeTo = mobileDetails ? Math.round(phonePanelHeight * 0.75) : 300;

  // Opacidad del logo/título: se desvanece al acercarse al borde superior
  const logoOpacity = useTransform(
    scrollY,
    [logoFadeFrom, logoFadeTo],
    prefersReducedMotion ? [1, 1] : [1, 0],
  );

  // Parallax del logo/título: sube ligeramente al desvanecerse
  const logoY = useTransform(
    scrollY,
    [logoFadeFrom, logoFadeTo],
    heroRange(-20),
  );

  const resizeCleanupRef = useRef(null);

  useEffect(() => () => resizeCleanupRef.current?.(), [isRightPlacement, isDocked, mobileDetails]);

  const nestedModalOpenRef = useRef(false);

  const stopNestedModalOpeningEvent = (event) => {
    if (!isRightPlacement) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.nativeEvent?.stopImmediatePropagation?.();
    nestedModalOpenRef.current = true;
  };

  const stopDrawerActionEvent = (event) => {
    if (!isRightPlacement) {
      event?.stopPropagation?.();
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.nativeEvent?.stopImmediatePropagation?.();
  };

  // Cierre al pulsar FUERA del drawer.
  //
  // El centrado ya se cierra así mediante su backdrop, pero el drawer derecho no
  // tiene backdrop a propósito: su contenedor es `pointer-events-none` para poder
  // seguir usando la página de fondo (hacer scroll y pulsar otro título). Por eso
  // el cierre se resuelve escuchando en el documento en vez de con una capa que
  // taparía la página y rompería justo eso.
  //
  // Se escucha en `click` (no en `pointerdown`) porque el descarte clave depende
  // de `defaultPrevented`, y eso solo está disponible una vez el clic ha burbujeado.
  useEffect(() => {
    if (!isRightPlacement || typeof document === "undefined") return undefined;

    if (isDocked) return undefined;

    // EL CLIC QUE ABRE NO PUEDE CERRAR.
    //
    // En táctil, quien abre la ficha lo hace en `pointerup` (ver FeaturedHero: el
    // `click` sintetizado llega tarde o no llega mientras el hero anima). El
    // navegador emite ese `click` JUSTO DESPUÉS, cuando este listener ya está
    // puesto, y como su destino queda fuera del panel se leía como "clic fuera":
    // el drawer se abría y se cerraba solo. No vale con que el que abre cancele
    // su propio clic, porque ese clic puede dispararse sobre otro elemento —el
    // panel recién montado tapa el punto que se tocó— y no pasar por él.
    //
    // La ventana es corta a propósito: solo cubre el clic que viene arrastrado
    // del mismo gesto. Nadie cierra a propósito un modal 300 ms después de abrirlo.
    const openedAt = performance.now();
    const CLOSING_GRACE_MS = 350;

    const onDocumentClick = (event) => {
      if (performance.now() - openedAt < CLOSING_GRACE_MS) return;
      // 1) Otra tarjeta de preview: `usePreviewOpen` llama a preventDefault() justo
      //    en ese caso, así que el drawer CAMBIA de título en vez de cerrarse, que
      //    es el comportamiento que el diseño actual permite. Un clic con
      //    cmd/ctrl (que sí navega) no llega aquí como preventDefault y sí cierra.
      if (event.defaultPrevented) return;
      // 2) Se acaba de soltar un arrastre del tirador de redimensionado.
      if (resizingRef.current) return;
      // 3) Hay un modal hijo abierto o acaba de abrirse/cerrarse con este mismo
      //    click. En el drawer lateral esos modales viven en document.body, fuera
      //    del panel, así que el listener global debe ignorarlos.
      if (nestedModalOpenRef.current) return;
      // 4) Clic dentro del propio panel.
      if (panelRef.current?.contains(event.target)) return;
      // 5) Modales anidados (listas, soundtrack, tráiler, comentarios…): se montan
      //    con createPortal en document.body, así que quedan FUERA del panel y sin
      //    esto un clic dentro de ellos cerraría el drawer entero.
      if (event.target?.closest?.("[data-detail-modal-layer]")) return;

      onClose?.();
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [isRightPlacement, isDocked, onClose]);

  // Arrastre del borde izquierdo. Durante el gesto se escribe el ancho DIRECTAMENTE
  // en el DOM del panel (sin re-render del modal, para que sea fluido); al soltar se
  // reconcilia el estado y se persiste.
  const beginResize = (event) => {
    if (!isRightPlacement || typeof window === "undefined" || event.button !== 0) return;
    resizeCleanupRef.current?.();
    event.preventDefault();
    event.stopPropagation();
    // El cierre por clic fuera debe ignorar este gesto: si arrastras el tirador y
    // sueltas el puntero fuera del panel, el `click` resultante se dispara en el
    // ancestro común (el documento), que cuenta como "fuera" y cerraría el drawer
    // justo al terminar de redimensionar.
    resizingRef.current = true;
    const vw = window.innerWidth;
    const startX = event.clientX;
    const startWidth = panelWidth;
    panelWidthRef.current = panelWidth;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    // TÁCTIL (tablet) → el ancho se aplica AL SOLTAR; mientras dura el gesto
    // solo se mueve una GUÍA del nuevo borde.
    //
    // Redimensionar en directo cambia en cada fotograma el ancho del panel y el
    // margen de la página acoplada: los dos se vuelven a maquetar y a pintar
    // enteros. Un ordenador lo absorbe; una tablet no llega a tiempo y enseña
    // zonas sin pintar o del fotograma anterior, que es el PARPADEO del panel y
    // de la página. La guía se mueve solo con `transform` —no maqueta ni
    // repinta nada—, así que sigue al dedo sin coste, y el panel y la página se
    // recolocan UNA vez. Con ratón (ordenador) nada cambia: sigue en directo.
    const ghostResize = event.pointerType !== "mouse";
    let ghost = null;
    let ghostStartLeft = 0;
    if (ghostResize && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      ghostStartLeft = rect.left;
      ghost = document.createElement("div");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "fixed",
        left: "0px",
        top: `${rect.top}px`,
        height: `${rect.height}px`,
        // Más ancho que la ventana: lo que sobra a la derecha no se ve, y así
        // la guía cubre siempre hasta el borde sin recalcular su ancho.
        width: `${vw}px`,
        transform: `translate3d(${rect.left}px, 0, 0)`,
        zIndex: "10000",
        pointerEvents: "none",
        borderLeft: "2px solid rgba(255, 255, 255, 0.75)",
        borderTopLeftRadius: "1rem",
        borderBottomLeftRadius: "1rem",
        background: "rgba(255, 255, 255, 0.06)",
        boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.45)",
        willChange: "transform",
      });
      document.body.appendChild(ghost);
    } else {
      // Marca el arrastre en <html> para que lo que sigue al ancho del panel
      // (hoy, el bloque derecho del navbar) se mueva PEGADO al tirador en vez
      // de ir 320ms por detrás con su transición de apertura.
      document.documentElement.dataset.svDrawerResizing = "";
    }

    // SEGUIMIENTO 1:1 con el puntero, una escritura por fotograma.
    //
    // Aquí hubo un suavizado que acercaba el ancho al objetivo una fracción por
    // fotograma, para que un frame perdido no se viera como un salto. Absorbía
    // los saltos, sí, pero a cambio el canto del panel iba ~100ms por detrás
    // del tirador y el gesto se percibía lento y pesado, que es peor: un
    // tirador tiene que estar pegado al dedo. El coste hay que quitarlo de
    // donde está (ver `content-visibility` en las secciones), no disimularlo
    // retrasando el movimiento.
    let frame = 0;
    let appliedWidth = panelWidth;
    const pointerId = event.pointerId;
    const resizeHandle = event.currentTarget;
    resizeHandle.setPointerCapture?.(pointerId);

    const writeWidth = (width) => {
      // El MotionValue es la fuente de verdad del ancho pintado (ver su nota);
      // la escritura directa lo aplica en este mismo fotograma, sin esperar al
      // ciclo de Framer.
      panelWidthMotion.set(width);
      if (panelRef.current) {
        panelRef.current.style.width = `${width}px`;
        // La escala del contenido sigue al ancho también durante el gesto.
        if (mobileDetails && !tabletViewport) {
          panelRef.current.style.setProperty(
            "--sv-phone-scale",
            String(phoneContentScale(width)),
          );
        }
      }
      // También SUPERPUESTO: el margen del contenido solo importa acoplado,
      // pero el ancho publicado lo usa además el navbar para apartarse, y el
      // panel tapa su borde derecho en los dos modos.
      onDrawerWidthChange?.(width);
    };

    const applyWidth = () => {
      frame = 0;
      const next = panelWidthRef.current;
      if (next === appliedWidth) return;
      appliedWidth = next;
      writeWidth(next);
    };

    // Modo guía: solo se desplaza la guía (compositor), nada más.
    const moveGhost = () => {
      frame = 0;
      if (!ghost) return;
      const left = ghostStartLeft + (startWidth - panelWidthRef.current);
      ghost.style.transform = `translate3d(${left}px, 0, 0)`;
    };

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      panelWidthRef.current = clampPanelWidth(startWidth + startX - moveEvent.clientX, vw);
      // Agrupa los eventos de puntero: llegan más a menudo que los fotogramas,
      // así que se escribe una sola vez por frame, sin lecturas de layout ni
      // renders de React.
      if (!frame) {
        frame = window.requestAnimationFrame(ghostResize ? moveGhost : applyWidth);
      }
    };

    const cleanup = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (resizeHandle.hasPointerCapture?.(pointerId)) resizeHandle.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      ghost?.remove();
      ghost = null;
      delete document.documentElement.dataset.svDrawerResizing;
      resizeCleanupRef.current = null;
      // El click posterior al pointerup no debe cerrar el modo superpuesto.
      window.setTimeout(() => {
        resizingRef.current = false;
      }, 0);
    };
    const finish = () => {
      // `cleanup()` va PRIMERO: retira la marca de arrastre, que devuelve al
      // panel su cristal y a la página sus transiciones.
      cleanup();
      // Al soltar se cuadra con el ancho EXACTO del puntero: el último
      // fotograma pendiente puede no haberse aplicado todavía. `applyWidth`
      // se corta solo cuando el ancho no cambió —soltar sin mover—, así que la
      // publicación se repite para que el margen de la página acoplada (que
      // ya ha ido siguiendo al tirador durante el gesto) quede en su valor
      // final.
      // (En modo guía esta es la ÚNICA escritura del gesto: el panel y la
      // página pasan de una vez al ancho final.)
      if (!ghostResize) applyWidth();
      writeWidth(panelWidthRef.current);
      setPanelWidth(panelWidthRef.current);
      try {
        window.localStorage.setItem(mobileDetails ? "showverse:mobileDetailsWidth" : RESIZE_STORAGE_KEY, String(panelWidthRef.current));
      } catch {
        // localStorage no disponible
      }
    };
    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      panelWidthRef.current = clampPanelWidth(startWidth + startX - upEvent.clientX, vw);
      finish();
    };
    const onCancel = (cancelEvent) => {
      if (cancelEvent.type === "pointercancel" && cancelEvent.pointerId !== pointerId) return;
      finish();
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
  };

  const [externalLinksOpen, setExternalLinksOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(false);
  // Pestaña activa de la variante de episodio (Detalles / Sinopsis).
  const [episodeTab, setEpisodeTab] = useState("details");
  // Acciones de EPISODIO (visto Trakt + puntuación), como en EpisodeDetails.
  const [epWatch, setEpWatch] = useState({
    connected: false,
    watched: false,
    plays: 0,
    loading: true,
    busy: false,
  });
  const [episodePlaysOpen, setEpisodePlaysOpen] = useState(false);
  const [episodePlays, setEpisodePlays] = useState({
    plays: 0,
    history: [],
  });
  const [epRate, setEpRate] = useState({
    value: null,
    loading: true,
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
    if (typeof window === "undefined") return undefined;
    const restorePreviewAfterBackNavigation = () => {
      cleanupFullDetailsTransitionLayers();
      setNavigatingToFullDetails(false);
    };
    window.addEventListener("pageshow", restorePreviewAfterBackNavigation);
    return () => {
      window.removeEventListener("pageshow", restorePreviewAfterBackNavigation);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!item || !session || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        // Sin sesión no hay fetch: salimos del estado de carga inicial (que arranca
        // en `true`) para que los botones no se queden con el spinner.
        setLoadingStates(false);
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
          setEpisodePlays({
            plays: plays?.plays ?? 0,
            history: Array.isArray(plays?.history) ? plays.history : [],
          });
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
        if (alive) setEpRate((state) => ({ ...state, loading: false }));
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

  const refreshEpisodePlays = async () => {
    if (item?.media_type !== "episode") return null;
    const showId = item.showId ?? item.id;
    if (
      showId == null ||
      item.seasonNumber == null ||
      item.episodeNumber == null
    ) {
      return null;
    }

    const plays = await traktGetEpisodePlays({
      tmdbId: showId,
      season: item.seasonNumber,
      episode: item.episodeNumber,
    });
    const nextPlays = Number(plays?.plays ?? 0);
    setEpisodePlays({
      plays: nextPlays,
      history: Array.isArray(plays?.history) ? plays.history : [],
    });
    setEpWatch((state) => ({
      ...state,
      connected: plays?.connected !== false,
      watched: nextPlays > 0,
      plays: nextPlays,
    }));
    return plays;
  };

  const openEpisodePlays = async () => {
    if (item?.media_type !== "episode" || epWatch.busy) return;
    if (requireLogin()) return;
    setEpWatch((s) => ({ ...s, busy: true }));
    try {
      await refreshEpisodePlays();
    } catch {
      setError("No se pudo cargar el historial de visionados.");
    } finally {
      setEpWatch((s) => ({ ...s, busy: false }));
      // Aunque la recarga puntual falle, el usuario debe poder abrir el gestor
      // y registrar un visionado nuevo, igual que en EpisodeDetails.
      setEpisodePlaysOpen(true);
    }
  };

  const handleEpisodeAddPlay = async (watchedAt) => {
    if (item?.media_type !== "episode" || epWatch.busy) return;
    const showId = item.showId ?? item.id;
    setEpWatch((s) => ({ ...s, busy: true }));
    setError("");
    try {
      await traktAddEpisodePlay({
        tmdbId: showId,
        season: item.seasonNumber,
        episode: item.episodeNumber,
        watchedAt,
        title: episodeMeta?.showName || title,
      });
      await refreshEpisodePlays();
    } catch {
      setError("No se pudo añadir el visionado.");
    } finally {
      setEpWatch((s) => ({ ...s, busy: false }));
    }
  };

  const handleEpisodeUpdatePlay = async (historyId, watchedAt) => {
    if (item?.media_type !== "episode" || epWatch.busy) return;
    const showId = item.showId ?? item.id;
    setEpWatch((s) => ({ ...s, busy: true }));
    setError("");
    try {
      await traktRemoveWatchPlay({ historyId });
      await traktAddEpisodePlay({
        tmdbId: showId,
        season: item.seasonNumber,
        episode: item.episodeNumber,
        watchedAt,
        title: episodeMeta?.showName || title,
      });
      await refreshEpisodePlays();
    } catch {
      setError("No se pudo actualizar el visionado.");
    } finally {
      setEpWatch((s) => ({ ...s, busy: false }));
    }
  };

  const handleEpisodeRemovePlay = async (historyId) => {
    if (item?.media_type !== "episode" || epWatch.busy) return;
    setEpWatch((s) => ({ ...s, busy: true }));
    setError("");
    try {
      await traktRemoveWatchPlay({ historyId });
      await refreshEpisodePlays();
    } catch {
      setError("No se pudo eliminar el visionado.");
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
    stopDrawerActionEvent(e);
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
    stopDrawerActionEvent(e);
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
      if (savedRating == null) {
        cacheRemoveRating({ type: mediaType, mediaId: item.id });
      } else {
        const resolvedPosterPath =
          json?.source === "backend" && json?.item
            ? json.item.posterPath || null
            : posterForMutation;
        cacheAddRating({
          type: mediaType,
          mediaId: item.id,
          title,
          posterPath: resolvedPosterPath,
          rating: savedRating,
        });
      }
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
  const [listsPresenceLoading, setListsPresenceLoading] = useState(true);
  const [busyListId, setBusyListId] = useState(null);
  const [listsError, setListsError] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  // Al cambiar de título, olvida la pertenencia local mientras se consulta el
  // estado persistido de todas las listas del usuario.
  useEffect(() => {
    setMembershipMap({});
    setListsPresenceLoading(true);
  }, [item?.id, mediaType]);

  useEffect(() => {
    let cancelled = false;

    if (listsLoadingHook) {
      setListsPresenceLoading(true);
      return () => {
        cancelled = true;
      };
    }

    const lists = Array.isArray(userLists) ? userLists : [];
    if (!item?.id || lists.length === 0) {
      setMembershipMap({});
      setListsPresenceLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setListsPresenceLoading(true);
    const controller = new AbortController();
    const membershipParams = new URLSearchParams({
      tmdbId: String(item.id),
      mediaType: mediaType === "tv" ? "tv" : "movie",
    });

    fetch(`/api/lists?${membershipParams.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || "Error cargando listas");
        }
        return payload?.membership;
      })
      .then((membership) => {
        if (cancelled) return;
        setMembershipMap(
          membership && typeof membership === "object" && !Array.isArray(membership)
            ? membership
            : {},
        );
      })
      .catch((error) => {
        if (cancelled || error?.name === "AbortError") return;
        setMembershipMap({});
      })
      .finally(() => {
        if (!cancelled) setListsPresenceLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [item?.id, listsLoadingHook, mediaType, userLists]);

  const openListsModal = (event) => {
    stopNestedModalOpeningEvent(event);
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

  const handleRemoveFromSpecificList = async (listId) => {
    const lid = listId != null ? String(listId) : null;
    if (!lid || !item || !membershipMap[lid]) return;
    setBusyListId(lid);
    setListsError("");
    try {
      await backendRemoveMovieFromList({
        listId: lid,
        movieId: item.id,
        mediaType,
      });
      setMembershipMap((prev) => ({ ...prev, [lid]: false }));
    } catch (e) {
      setListsError(e?.message || "Error quitando de la lista");
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
  // El tráiler se abre en el MISMO modal de vídeo que la ficha completa
  // (DetailsClient), con sus controles y su sonido. Antes se reproducía dentro
  // de la portada del propio drawer, sustituyendo a la imagen.
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);

  const handleToggleTrailer = async (e) => {
    stopNestedModalOpeningEvent(e);
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
      setTrailer({ ...t, name: t.name || `Tráiler - ${title}` });
      setShowTrailer(true);
    } catch {
      setTrailer(null);
      setShowTrailer(false);
      setError("No se pudo cargar el tráiler.");
    } finally {
      setTrailerLoading(false);
    }
  };

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
  // UNA petición por título, compartida por todos los que la piden.
  //
  // Llaman aquí el botón de la fila de acciones, el reproductor y la sección de
  // Soundtrack de la ficha de teléfono. Sin guardián, cada uno lanzaba su propia
  // consulta a `/api/soundtrack`, y la sección —que la pide al pintarse— la
  // repetía además en cada render, porque esta función se recrea en cada uno.
  //
  // Se guarda la PROMESA, no solo una bandera: dos llamadas simultáneas (abrir
  // el reproductor mientras la sección aún está cargando) comparten la misma
  // petición en vez de encadenar dos. El fallo limpia la referencia para que
  // reintentarlo desde el botón vuelva a pedirla.
  const soundtrackRequestRef = useRef({ key: null, promise: null });

  const loadSoundtrack = ({ force = false } = {}) => {
    if (!soundtrackTitle) return Promise.resolve();

    const requestKey = [
      soundtrackTitle,
      mediaType,
      isEpisode ? "episode" : "title",
      item?.id ?? "",
    ].join("|");
    const pending = soundtrackRequestRef.current;
    if (!force && pending.key === requestKey && pending.promise) {
      return pending.promise;
    }

    const promise = runSoundtrackRequest();
    soundtrackRequestRef.current = { key: requestKey, promise };
    return promise;
  };

  const runSoundtrackRequest = async () => {
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
      // Una petición fallida no se cachea: si no, el botón de reintentar
      // devolvería siempre el mismo error sin volver a pedir nada.
      soundtrackRequestRef.current = { key: null, promise: null };
    } finally {
      setSoundtrackLoading(false);
    }
  };

  useEffect(() => {
    soundtrackRequestRef.current = { key: null, promise: null };
  }, [item?.id, mediaType]);

  const openSoundtrack = (event) => {
    stopNestedModalOpeningEvent(event);
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
  const [titleComments, setTitleComments] = useState([]);
  const [ownedCommentIds, setOwnedCommentIds] = useState(() => new Set());
  const [traktUsername, setTraktUsername] = useState(null);
  const myComments = useMemo(
    () =>
      selectOwnedComments(titleComments, {
        appUsername: account?.username,
        traktUsername,
        ownedCommentIds,
      }),
    [account?.username, ownedCommentIds, titleComments, traktUsername],
  );

  useEffect(() => {
    if (!traktConnected) {
      setTraktUsername(null);
      return undefined;
    }

    let cancelled = false;
    fetch("/api/trakt/profile?userOnly=1", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) {
          setTraktUsername(payload?.user?.username || null);
        }
      })
      .catch(() => {
        if (!cancelled) setTraktUsername(null);
      });

    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  useEffect(() => {
    setTitleComments([]);
    setOwnedCommentIds(new Set());
    if (!item?.id || isEpisode) return undefined;

    let cancelled = false;
    traktGetComments({
      type: traktType,
      tmdbId: item.id,
      sort: "newest",
      page: 1,
      limit: 50,
    })
      .then((payload) => {
        if (!cancelled) {
          setTitleComments(
            Array.isArray(payload?.items) ? payload.items : [],
          );
        }
      })
      .catch(() => {
        if (!cancelled) setTitleComments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isEpisode, item?.id, traktType]);

  const handleCommentSubmit = async ({ comment, spoiler }) => {
    const result = await traktAddComment({
      type: traktType,
      tmdbId: item.id,
      comment,
      spoiler,
    });
    const commentId = result?.id || Date.now();
    const nextComment = {
      ...result,
      id: commentId,
      comment: result?.comment || comment,
      spoiler: result?.spoiler ?? spoiler,
      created_at: result?.created_at || new Date().toISOString(),
      user: result?.user || {
        username: account?.username || "Tú",
        name: account?.name || account?.username || "Tú",
        images: { avatar: { full: account?.avatarUrl || "" } },
      },
    };

    setOwnedCommentIds((previous) => {
      const next = new Set(previous);
      next.add(String(commentId));
      return next;
    });
    setTitleComments((previous) => [
      nextComment,
      ...previous.filter(
        (entry) => String(entry?.id) !== String(commentId),
      ),
    ]);
    return result;
  };
  const handleCommentUpdate = async ({ commentId, comment, spoiler }) => {
    const result = await traktUpdateComment({
      commentId,
      comment,
      spoiler,
      type: traktType,
      tmdbId: item.id,
    });
    setTitleComments((previous) =>
      previous.map((entry) =>
        String(entry?.id) === String(commentId)
          ? {
              ...entry,
              ...result,
              comment: result?.comment || comment,
              spoiler: result?.spoiler ?? spoiler,
            }
          : entry,
      ),
    );
    return result;
  };
  const handleCommentDelete = async ({ commentId }) => {
    await traktDeleteComment({ commentId, type: traktType, tmdbId: item.id });
    setOwnedCommentIds((previous) => {
      const next = new Set(previous);
      next.delete(String(commentId));
      return next;
    });
    setTitleComments((previous) =>
      previous.filter((entry) => String(entry?.id) !== String(commentId)),
    );
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
  // Arranca en `true` por el mismo motivo que `loadingStates`: evita el parpadeo
  // icono→spinner→icono en los botones de "visto" y valoración al abrir. El efecto
  // de montaje siempre hace el fetch y lo cierra a `false` (item garantizado aquí).
  const [traktStatusLoading, setTraktStatusLoading] = useState(true);
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
    let retryTimer = null;
    let intentos = 0;
    const load = async () => {
      if (!item) return;
      try {
        setTraktStatusLoading(true);
        const st = await traktGetItemStatus({
          type: traktType,
          tmdbId: item.id,
          force: intentos > 0,
        });
        if (cancel) return;
        applyTraktStatus(st);
        setTraktStatusLoading(false);
      } catch (e) {
        if (cancel) return;
        // `traktGetItemStatus` solo lanza ante fallos que no dicen nada del
        // estado real (503 degradado, 429, red, timeout). Se reintenta como en
        // DetailsClient en vez de dar el título por "no visto".
        const status = e?.status;
        const reintentable =
          e?.code === "TRAKT_TRANSIENT" ||
          e?.name === "TimeoutError" ||
          typeof status !== "number" ||
          status >= 500 ||
          status === 429 ||
          status === 401;
        if (reintentable) {
          intentos += 1;
          retryTimer = window.setTimeout(load, statusRetryDelay(intentos));
          return;
        }
        // sin estado de Trakt: botón en "no visto"
        setTraktStatusLoading(false);
      }
    };
    void load();
    return () => {
      cancel = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, traktType]);

  const openTraktWatched = (event) => {
    stopNestedModalOpeningEvent(event);
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
      // La temporada se precarga igual: es el otro destino del mismo grupo de
      // botones y comparte su transición, así que debe llegar igual de listo.
      const showId = data.episodeMeta?.showId;
      const seasonNumber = data.episodeMeta?.seasonNumber;
      if (showId != null && seasonNumber != null) {
        router.prefetch(`/details/tv/${showId}/season/${seasonNumber}`);
      }
    } catch {
      // prefetch best-effort
    }
  }, [
    item?.id,
    mediaType,
    router,
    data.episodeMeta?.showId,
    data.episodeMeta?.seasonNumber,
  ]);

  // Navegación del modal a una ruta de `/details` con la transición de morfeo.
  // Está extraída de `goToFullDetails` porque ahora hay DOS destinos: la ficha
  // del episodio y la de su temporada. `transitionKey` solo lo usa
  // DetailsClient para reconocer que viene de aquí; la ruta de temporada no
  // participa en ese apretón de manos, así que no lo escribe (dejar una clave
  // que nadie consume la deja colgada en sessionStorage).
  const goToDetailsRoute = async (href, transitionKey) => {
    if (navigatingToFullDetails || !href) return;
    if (!isServerReachable()) {
      await openSavedRoute(href);
      return;
    }

    if (transitionKey) {
      try {
        window.sessionStorage?.setItem(
          DETAILS_ROUTE_TRANSITION_KEY,
          transitionKey,
        );
      } catch {
        // sessionStorage best-effort
      }
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

  const goToFullDetails = () =>
    goToDetailsRoute(
      dashboardDetailHref(item, mediaType),
      `${mediaType}:${item?.id ?? ""}`,
    );

  // Ficha de la TEMPORADA a la que pertenece el episodio. Solo existe en la
  // variante de episodio y cuando se conocen serie y temporada: en un episodio
  // suelto (sin `showId`) no hay a dónde ir, y es mejor no pintar el botón que
  // pintarlo roto.
  const seasonHref =
    isEpisode &&
    episodeMeta?.showId != null &&
    episodeMeta?.seasonNumber != null
      ? `/details/tv/${episodeMeta.showId}/season/${episodeMeta.seasonNumber}`
      : null;

  const goToSeasonDetails = () => goToDetailsRoute(seasonHref);

  /* --------------------------------- derivados --------------------------------- */
  // Las pestañas (estado activo + cuerpos) las gestiona <DetailsInfoTabs>.
  const production = data.production || {};
  const statusLabel = production.status || null;

  const scoreboard = data.scoreboard || null;
  const scoreStats = scoreboard?.stats || {};
  const hasMetaRow =
    !!data.year ||
    !!data.runtime ||
    !!data.seasonEpisodeValue ||
    !!statusLabel ||
    data.genres?.length > 0;

  const streamingProviders = useMemo(() => {
    const providers = Array.isArray(data.providers) ? data.providers : [];
    return dedupeStreamingProviders(providers)
      .map((provider) =>
        createPlatformItem(provider, {
          endpointType: mediaType,
          justwatchUrl: null,
          title,
        }),
      )
      .filter((provider) => provider.icon && provider.hasValidLink);
  }, [data.providers, mediaType, title]);

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
  const stopNestedModalEvent = (event) => {
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
  };
  const hasNestedModalOpen =
    listModalOpen ||
    soundtrackOpen ||
    commentModalOpen ||
    externalLinksOpen ||
    platformsOpen ||
    traktWatchedOpen ||
    traktEpisodesOpen ||
    episodeRatingsOpen ||
    showTrailer;

  useEffect(() => {
    if (hasNestedModalOpen) {
      nestedModalOpenRef.current = true;
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      nestedModalOpenRef.current = false;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasNestedModalOpen]);

  // Fila de acciones (película/serie y episodio). Vive en una constante y no
  // suelta dentro del JSX porque tiene DOS sitios posibles: en la vista normal
  // encabeza la columna de contenido, bajo el hero; en la ficha de TELÉFONO es
  // la segunda mitad del primer pantallazo, pegada a la portada, y el resto del
  // contenido queda por debajo (scroll). Es la MISMA fila configurada una sola
  // vez: duplicarla en las dos ramas habría dejado dos copias de ~120 líneas de
  // props que se separarían al primer cambio.
  const actionsNode = (
    <>
    {/* Fila de acciones — MISMO componente presentacional que la ficha
        completa (DetailsClient). Todas las acciones, tráiler incluido,
        abren los mismos modales reutilizables. Se omiten el
        control de "visto" de Trakt y la valoración de episodios (no se
        pasan sus handlers), por lo que no se renderizan. */}
    {!isEpisode && (
    <DetailModalActionsReveal
      className={`flex items-center gap-4 ${
        mobileDetails
          ? "w-full justify-center text-center"
          : "flex-col text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
      }`}
    >
      <div
        className={
          mobileDetails
            // `sv-phone-actions-reveal` escalona a sus NIETOS, así que tiene que
            // ir en el elemento que envuelve la fila: `este > fila > botón`.
            ? "sv-phone-actions-reveal w-full min-w-0"
            : "w-[calc(100%_+_1rem)] min-w-0 sm:w-auto sm:flex-1"
        }
      >
        <DetailActionsRow
          mobileGapClass="gap-1.5"
          forceMobile={mobileDetails}
          onTrailer={handleToggleTrailer}
          trailerAvailable
          trailerLoading={trailerLoading}
          onSoundtrack={openSoundtrack}
          soundtrackAvailable={!!soundtrackSearchQuery}
          onEpisodeRatings={
            mediaType === "tv"
              ? (event) => {
                  stopNestedModalOpeningEvent(event);
                  setEpisodeRatingsOpen(true);
                }
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
          onAddToList={openListsModal}
          listBusy={listsLoadingHook || listsPresenceLoading}
          listActive={Object.values(membershipMap || {}).some(Boolean)}
          showComments={ratingActionConnected}
          commentsActive={myComments.length > 0}
          onComments={(event) => {
            stopNestedModalOpeningEvent(event);
            setCommentModalOpen(true);
          }}
        />
      </div>
    </DetailModalActionsReveal>
    )}

    {/* EPISODIO: fila de acciones FUERA del ScoreboardBar (como en pelis/
        series): botones de visionado y puntuación. */}
    {isEpisode && (
      <DetailModalActionsReveal
        className={`flex items-center gap-4 ${
          mobileDetails
            ? "w-full justify-center text-center"
            : "flex-col text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
        }`}
      >
        <div
          className={
            mobileDetails
              ? "sv-phone-actions-reveal w-full min-w-0"
              : "w-[calc(100%_+_1rem)] min-w-0 sm:w-auto sm:flex-1"
          }
        >
          <DetailActionsRow
            mobileGapClass="gap-1.5"
            forceMobile={mobileDetails}
            onTrailer={handleToggleTrailer}
            trailerAvailable
            trailerLoading={trailerLoading}
              onSoundtrack={openSoundtrack}
            soundtrackAvailable={!!soundtrackSearchQuery}
            onEpisodeRatings={(event) => {
              stopNestedModalOpeningEvent(event);
              setEpisodeRatingsOpen(true);
            }}
            episodeRatingsOpen={episodeRatingsOpen}
            trakt={{
              connected: epWatch.connected,
              watched: epWatch.watched,
              plays: epWatch.plays,
              badge: null,
              busy: epWatch.busy,
              loading: epWatch.loading,
              onOpen: openEpisodePlays,
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
      </DetailModalActionsReveal>
    )}
    </>
  );

  const modalLayer = (
    <>
      {/* Tráiler: el MISMO modal de vídeo que la ficha completa. */}
      <VideoModal
        open={showTrailer}
        onClose={() => setShowTrailer(false)}
        video={trailer}
        videos={trailer ? [trailer] : []}
        onVideoChange={setTrailer}
      />

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
        onRemoveFromList={handleRemoveFromSpecificList}
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
        myComments={myComments}
      />

      <ExternalLinksModal
        open={platformsOpen}
        onClose={() => setPlatformsOpen(false)}
        links={streamingProviders}
        mode="platforms"
        loading={!data.providersResolved}
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

      {/* Historial de visionados del episodio: el mismo gestor que usa
          EpisodeDetails, para añadir, editar o borrar plays explícitamente. */}
      <TraktWatchedModal
        open={episodePlaysOpen}
        onClose={() => {
          setEpisodePlaysOpen(false);
          void refreshEpisodePlays().catch(() => {});
        }}
        plays={episodePlays.plays}
        history={episodePlays.history}
        busy={epWatch.busy}
        onAddPlay={handleEpisodeAddPlay}
        onUpdatePlay={handleEpisodeUpdatePlay}
        onRemovePlay={handleEpisodeRemovePlay}
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
      className={`fixed inset-y-0 z-[9999] flex ${
        // `left-0 w-screen` en vez de `inset-x-0` (equivalente a `right-0`):
        // <html> reserva SIEMPRE el hueco de la scrollbar (`scrollbar-gutter:
        // stable`, ver globals.css), y ese hueco reduce el viewport que usa
        // `right: 0` aunque no haya scrollbar real pintada. El resultado era un
        // margen fantasma de ~15px entre el panel y el borde de la ventana.
        // `100vw` no se ve afectado por esa reserva, así que el panel llega de
        // verdad hasta el borde. El modal centrado no ancla a un borde, así que
        // mantiene `inset-x-0` (sin este desajuste).
        isRightPlacement
          ? "left-0 w-screen justify-end pointer-events-none"
          : "inset-x-0 justify-center"
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
          // SIN velo oscuro: solo desenfoque.
          //
          // El drawer de las páginas de usuario no tiene overlay, así que su
          // cristal muestrea la página directamente y por eso se lee como
          // cristal. Aquí, cualquier velo se acumula con el 35% del propio fondo
          // del panel y aplana el efecto: con /70 el cristal veía un 80% de negro
          // y quedaba muerto; con /40 seguía en 61%. Como el velo entra con
          // fundido, ese oscurecido se percibía además como algo que "se aplica
          // al terminar la animación".
          //
          // Sin velo, el cristal del panel ve exactamente el mismo 35% que en el
          // drawer: los dos modales quedan igualados.
          //
          // La separación con el fondo la da `backdrop-blur-xl`, que es lo que de
          // verdad aísla el modal. El elemento se mantiene (sin fondo) porque es
          // la superficie que captura el clic-fuera para cerrar.
          className="fixed inset-0 backdrop-blur-xl"
          onClick={navigatingToFullDetails ? undefined : onClose}
        />
      )}

      {/* Panel ancho anclado al borde inferior, esquinas superiores redondeadas.
          La transición a la ficha completa anima un clon inerte de este panel. */}
      <motion.div
        ref={panelRef}
        // `custom` alimenta las variantes del panel ENTRANTE (hidden/visible).
        // Con `switching` true → fundido cruzado (opacity); false → deslizar.
        // El panel SALIENTE recibe su `custom` del AnimatePresence del provider.
        custom={switching}
        variants={isRightPlacement ? panelVariantsRight : panelVariants}
        initial="hidden"
        animate={navigatingToFullDetails ? "navigate" : "visible"}
        exit="exit"
        onAnimationStart={(definition) => {
          if (definition === "exit" || definition === "hidden") {
            setPanelSettled(false);
          }
        }}
        onAnimationComplete={(definition) => {
          if (definition === "visible") setPanelSettled(true);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          // La apertura del drawer y del panel centrado mantiene opacidad 1:
          // anunciar `opacity` aquí atenuaría el cristal y además crearía una
          // capa con alfa que encarece el backdrop-filter durante el recorrido.
          // Se RETIRA al asentarse (`auto`), no solo se ajusta por placement.
          //
          // `will-change: opacity` crea un Backdrop Root: los descendientes dejan
          // de poder muestrear más allá de este panel. Las tarjetas de info son
          // casi transparentes y viven de ver el fondo, por eso solo anticipamos
          // la transformación geométrica.
          //
          // Mantenerlo tras la animación tampoco aporta nada: `will-change` es
          // una pista para lo que está POR animarse. Ya quieto, sobra.
          willChange: panelSettled ? "auto" : "transform",
          // Drawer derecho: ancho controlado (redimensionable). Centrado: Tailwind.
          ...(isRightPlacement ? { width: panelWidthMotion } : null),
          // Escala de puntuaciones, pestañas y tarjetas de la ficha de
          // teléfono (ver `phoneContentScale`). Solo en ordenador: en tablet el
          // panel ya tiene el tamaño de un teléfono real.
          ...(mobileDetails
            ? {
                "--sv-phone-scale": tabletViewport
                  ? 1
                  : phoneContentScale(panelWidth),
              }
            : null),
          // La ficha "mobile" flota separada del borde: el hueco de la derecha
          // ya lo pone `paddingRight` en el contenedor; este margen replica el
          // mismo valor a la izquierda para que quede centrada en su columna.
          ...(mobileDetails
            ? { aspectRatio: MOBILE_DETAILS_ASPECT_RATIO }
            : null),
        }}
        // OJO: el panel NO lleva `backdrop-blur`. Su desenfoque lo pinta la capa
        // hermana de abajo. Motivo: un elemento con `backdrop-filter` crea un
        // "Backdrop Root", y sus DESCENDIENTES ya no pueden muestrear más allá
        // de él. El scoreboard y las tarjetas de info son casi transparentes
        // (bg-black/[0.08] + backdrop-blur-[4px]): dependen de ver la página
        // detrás. Con el blur aquí, solo veían el propio fondo oscuro del panel
        // y perdían el cristal — y solo al ASENTARSE la animación, que es cuando
        // se activaba. Con el blur en una capa hermana, el panel deja de ser
        // backdrop root y los hijos vuelven a muestrear el fondo, igual que en
        // DetailsClient.
        // Fondo del cristal: 0.35 → 0.47. El liquid glass dejaba ver demasiado
        // fondo. Este es el ÚNICO sitio donde se fija, así que sube por igual en
        // el modal centrado y en el drawer y siguen siendo idénticos.
        className={`sv-drawer-panel relative z-10 flex flex-col overflow-hidden bg-black/[0.47] bg-gradient-to-br from-white/[0.12] via-transparent to-white/[0.04] shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)] ${
          isRightPlacement
            ? mobileDetails
              // PEGADA AL BORDE DERECHO, igual que el panel ancho.
              //
              // Antes flotaba separada del canto (24px a cada lado y las cuatro
              // esquinas redondeadas). Eso dejaba un hueco muerto contra el
              // borde y, sumado al margen que la propia página deja a su
              // derecha, el panel se veía descentrado en el hueco libre.
              // Repartir ese hueco moviendo el panel solo cambiaba el problema
              // de sitio: o seguía descuadrado, o se metía encima de los
              // botones del navbar. Pegada al borde no hay hueco que repartir.
              //
              // Las esquinas de la derecha no se ven, así que no se redondean.
              // Lo único propio de esta vista es el alto, que lo fija su
              // proporción de teléfono.
              // de la derecha no se ven, así que no se redondean. Solo cambia
              // el alto, que lo fija su proporción de teléfono.
              // `max-h-full`: si el ancho mínimo no deja sitio a la proporción
              // de teléfono (pantallas bajas), el alto se para en el de la
              // ventana y el panel queda más ancho que 9:19.5.
              ? "h-auto max-h-full min-h-0 self-center rounded-l-2xl pointer-events-auto"
              : "h-full rounded-l-2xl pointer-events-auto"
            : "mt-[4vh] h-[96vh] w-[95vw] max-w-[1080px] rounded-t-2xl"
        }`}
      >
        {/* Cristal del panel — SOLO en el drawer.
            Va aquí y no en el panel para no convertirlo en Backdrop Root (ver
            nota arriba). `-z-10` lo deja por detrás del contenido pero por
            delante del fondo del panel; es hermano, así que no limita el
            backdrop-filter de las tarjetas de info.

            El CENTRADO no lo lleva: su overlay ya aplica `backdrop-blur-xl` a
            toda la página, así que el fondo que el panel deja ver YA está
            desenfocado. Añadir aquí un segundo desenfoque sobre el primero era
            redundante y ensuciaba el resultado — y como esta capa solo se monta
            al asentarse, se percibía como "un extra oscuro que se aplica al
            terminar la carga", mientras que durante la transición (aún sin
            montar) el cristal se veía correcto.

            El drawer sí la necesita: no tiene overlay detrás, así que sin esto
            no habría desenfoque ninguno. Se mantiene desde el primer frame y
            también durante el fundido entre títulos; solo se retira al cerrar
            el modal. */}
        {isRightPlacement && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 backdrop-blur-md"
          />
        )}

        {/* Tirador de redimensionado: arrastra el borde izquierdo (solo drawer). */}
        {isRightPlacement && (
          <div
            onPointerDown={beginResize}
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel"
            title="Arrastra para redimensionar"
            className={`group absolute inset-y-0 left-0 z-40 flex cursor-col-resize touch-none items-center justify-center ${tabletViewport ? "w-6" : "w-3"}`}
          >
            <div className={`h-16 w-1 rounded-full transition-colors duration-200 group-hover:bg-white/45 ${tabletViewport ? "bg-white/35" : "bg-white/15"}`} />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Botón superior izquierdo: cierra el modal */}
          <button
            type="button"
            onClick={onClose}
            disabled={navigatingToFullDetails}
            className={`absolute left-4 top-4 z-30 flex h-10 w-10 select-none items-center justify-center rounded-full transition-all duration-300 group ${DETAIL_MODAL_GLASS_CONTROL}`}
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
          </button>

          {/* Controles superiores derechos.
              Van en un contenedor ANCLADO A LA DERECHA en vez de posicionar
              cada botón por su cuenta: las píldoras se ensanchan al pasar por
              encima (hasta 166px), así que con dos posiciones absolutas fijas se
              solaparían. Anclado solo por `right`, el contenedor mide lo que
              miden sus hijos y crece hacia la izquierda, de modo que al
              expandirse una, la otra se aparta sola. */}
          <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
            {/* Centrado ↔ lateral (solo dashboards). En lateral aparecen además
                los mismos controles que en las páginas de usuario: acoplar y
                vista de teléfono. */}
            {onPlacementChange && (
              <button
                type="button"
                onClick={(event) => {
                  stopNestedModalOpeningEvent(event);
                  onPlacementChange(isRightPlacement ? "center" : "right");
                }}
                disabled={navigatingToFullDetails}
                aria-label={
                  isRightPlacement
                    ? "Mostrar como modal centrado"
                    : "Mostrar como panel lateral"
                }
                title={
                  isRightPlacement
                    ? "Mostrar como modal centrado"
                    : "Mostrar como panel lateral"
                }
                aria-pressed={isRightPlacement}
                className={`group flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${DETAIL_MODAL_GLASS_CONTROL}`}
              >
                <PanelRight
                  aria-hidden="true"
                  className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none ${isRightPlacement ? "text-white" : ""}`}
                />
              </button>
            )}
            {isRightPlacement && onDrawerViewChange && (
              <button
                type="button"
                onClick={() => onDrawerViewChange(isDocked ? "overlay" : "docked")}
                disabled={navigatingToFullDetails}
                aria-label="Acoplar panel lateral"
                aria-pressed={isDocked}
                className={`group flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${DETAIL_MODAL_GLASS_CONTROL}`}
              >
                <Pin
                  aria-hidden="true"
                  fill={isDocked ? "currentColor" : "none"}
                  className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none ${isDocked ? "text-white" : ""}`}
                />
              </button>
            )}
            {isRightPlacement && onContentViewChange && (
              <button
                type="button"
                onClick={() => onContentViewChange(mobileDetails ? "modal" : "mobile")}
                disabled={navigatingToFullDetails}
                aria-label="Mostrar ficha móvil"
                aria-pressed={mobileDetails}
                className={`group flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-all duration-300 ${DETAIL_MODAL_GLASS_CONTROL}`}
              >
                <Smartphone
                  aria-hidden="true"
                  fill={mobileDetails ? "currentColor" : "none"}
                  className={`h-5 w-5 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none ${mobileDetails ? "text-white" : ""}`}
                />
              </button>
            )}
            {/* Ficha de la temporada: solo en la variante de episodio. */}
            {seasonHref && (
              <button
                type="button"
                onClick={goToSeasonDetails}
                disabled={navigatingToFullDetails}
                className={`group flex h-10 w-10 select-none items-center justify-center gap-0 overflow-hidden rounded-full px-0 transition-all duration-300 ease-out ${mobileDetails ? "" : "hover:w-[150px] hover:gap-1.5 hover:px-3"} ${DETAIL_MODAL_GLASS_CONTROL}`}
                // La temporada 0 son los especiales: "Ver temporada 0" no dice
                // nada a quien lo escuche en un lector de pantalla.
                aria-label={
                  episodeMeta.seasonNumber === 0
                    ? "Ver especiales"
                    : `Ver temporada ${episodeMeta.seasonNumber}`
                }
                aria-busy={navigatingToFullDetails ? "true" : undefined}
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-110">
                  <Layers className="h-5 w-5 shrink-0" />
                </div>
                <span className={`max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold leading-normal tracking-wide opacity-0 transition-[max-width,opacity] duration-200 ${mobileDetails ? "hidden" : "group-hover:max-w-[104px] group-hover:opacity-100"} translate-y-[1px]`}>
                  Ver temporada
                </span>
              </button>
            )}

            {/* Abre la ficha completa */}
            <button
              type="button"
              onClick={goToFullDetails}
              disabled={navigatingToFullDetails}
              className={`group flex h-10 w-10 select-none items-center justify-center gap-0 overflow-hidden rounded-full px-0 transition-all duration-300 ease-out ${mobileDetails ? "" : "hover:w-[166px] hover:gap-1.5 hover:px-3"} ${DETAIL_MODAL_GLASS_CONTROL}`}
              aria-label="Ver ficha completa"
              aria-busy={navigatingToFullDetails ? "true" : undefined}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-300 group-hover:rotate-45">
                <ArrowUpRight className="h-5 w-5 shrink-0" />
              </div>
              <span className={`max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold leading-normal tracking-wide opacity-0 transition-[max-width,opacity] duration-200 ${mobileDetails ? "hidden" : "group-hover:max-w-[120px] group-hover:opacity-100"} translate-y-[1px]`}>
                Ver ficha completa
              </span>
            </button>
          </div>

          {/* Contenedor con scroll interno (barra oculta).

              SIN REBOTE DE OVERSCROLL (`overscroll-y-none`). Al llegar al tope, el
              estirado elástico mueve la imagen del hero unos píxeles pero NO su
              máscara, que vive en el contenedor: al desincronizarse se marca el
              canto del difuminado y la portada parece deformarse en ese último
              tirón, en vez de quedarse quieta. Sin rebote no hay estirado.

              En globals.css hay una nota que dice no volver a poner esto: es para
              el póster de la ficha MÓVIL, que se desplaza con el documento y ahí
              `overscroll-behavior` desactivaría además el «tirar para recargar» de
              Chrome. Aquí el scroll es de un CONTENEDOR interno, y el gesto de
              recarga solo lo gobierna el scroller raíz, así que esa contrapartida
              no existe. De paso, el gesto tampoco se encadena a la página de
              debajo al llegar al tope. */}
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
          {/* PRIMER PANTALLAZO DE LA FICHA DE TELÉFONO.

              En esa vista lo único que se ve sin hacer scroll es portada +
              logo + botones, igual que en la ficha móvil real. Se consigue con
              una columna de la ALTURA EXACTA del panel: la portada se queda con
              el hueco sobrante (`flex-1`) y los botones ocupan el suyo, así que
              el resto del contenido empieza justo por debajo del borde
              inferior. No hay ninguna altura medida ni descontada a mano: si la
              fila de botones cambia de alto, la portada se ajusta sola.

              `contents` deja la vista normal EXACTAMENTE como estaba: el
              envoltorio desaparece de la maquetación y hero y contenido siguen
              siendo hermanos directos de la columna con scroll. */}
          <div className={mobileDetails ? "flex h-full flex-col" : "contents"}>
          {/* HERO: póster textless en móvil, backdrop panorámico en sm+.
              El fondo se desvanece a transparente por abajo (sin borde) para que la
              imagen (enmascarada) se funda con el panel translúcido de contenido y
              NO se vea una línea/escalón entre portada e información. */}
          {/* La máscara va en ESTE contenedor, no en la capa de parallax de
              dentro.

              Motivo: esa capa se traslada con el scroll (`y: yParallax`). Si la
              máscara viaja con ella, el difuminado se despega del borde inferior
              del contenedor y deja de coincidir con él: a partir de ahí manda el
              `overflow-hidden`, que recorta la imagen EN SECO. Eso es la línea
              horizontal de corte que aparecía al hacer scroll.

              En el contenedor, la máscara es fija respecto al borde: el parallax
              mueve la imagen por debajo, pero el difuminado se queda siempre
              donde debe. Enmascarar también su degradado de fondo es inocuo:
              abajo ya es transparente.

              `sv-hero-fade` usa la misma CURVA (smoothstep) que el póster móvil de
              DetailsClient, pero corta (85%-100%): aquí solo hay que esconder el canto,
              no fundir media imagen. Sustituye a una rampa lineal inline: una rampa pasa
              de alfa constante a decreciente de golpe, y esa discontinuidad de
              pendiente se percibe como un corte donde arranca el difuminado. */}
          {/* El degradado de fondo muere en el 78%, justo donde ARRANCA el
              difuminado de la imagen (`--sv-hero-fade`), y no en el 100%.

              Antes llegaba hasta abajo, así que dentro de la zona de difuminado
              todavía aportaba ~21% de negro que iba cayendo a 0. Al desvanecerse
              la imagen no aparecía el panel limpio, sino el panel MÁS ese velo:
              un gradiente oscuro extra que no existe por debajo, y que sobre
              imágenes claras se leía como una banda/línea oscura. Sobre imágenes
              oscuras no se notaba, de ahí que solo pasara "en algunos casos".

              Terminándolo en el 85%, la máscara revela el panel y nada más: la
              transición es la de la imagen al panel, sin oscuros añadidos. */}
          <div
            className={
              mobileDetails
                // Teléfono: la portada se come todo el hueco que dejan los
                // botones. Sin `aspect-*` y sin el degradado de fondo: aquí la
                // imagen llega hasta abajo y se funde con el panel por su
                // propia máscara (`sv-phone-fade`), que es mucho más larga que
                // la del modal y es la que deja logo y botones sobre oscuro.
                ? "relative min-h-0 w-full flex-1 overflow-hidden"
                : "relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-b from-neutral-950 from-30% to-transparent to-78% sm:aspect-video"
            }
          >
            {/* Wrapper ESTÁTICO y enmascarado: contiene SOLO la imagen.
                - Estático (no lleva el parallax): la máscara queda fija
                  respecto al borde inferior, así que al hacer scroll el
                  difuminado no se despega y no aparece el corte en seco.
                - Envuelve solo la imagen: el logo y las demás capas quedan
                  FUERA, así que no se difuminan. Antes la máscara estaba en
                  el contenedor y se comía el logo, que es su hermano. */}
            <div className={`absolute inset-0 ${mobileDetails ? "sv-phone-fade" : "sv-hero-fade"}`}>
            <motion.div
              style={{
                y: yParallax,
                scale,
                // CAPA PROPIA, o la imagen se rasteriza entera en cada
                // fotograma del scroll.
                //
                // Esta capa se mueve Y se escala dentro de un contenedor
                // ENMASCARADO (`sv-hero-fade` / `sv-phone-fade`), y en la
                // variante ancha la propia imagen lleva además su máscara de
                // canto (`sv-hero-art-edge`). Sin promocionarla, cada paso del
                // scroll obliga a repintar el mapa de bits y a volver a aplicar
                // las máscaras sobre el resultado: eso es lo que se veía como
                // una imagen que se deforma y un desplazamiento a tirones.
                // Promocionada, se rasteriza UNA vez y el compositor la mueve y
                // la escala sin repintar nada.
                //
                // OJO con la nota del panel sobre `will-change` y los Backdrop
                // Root: allí el problema era anunciar `opacity` en un elemento
                // con descendientes de cristal, que dejaban de muestrear el
                // fondo. Aquí solo hay imágenes, ningún `backdrop-filter`
                // debajo, y se anuncia `transform`, que es justo lo que se
                // anima.
                willChange: "transform",
                backfaceVisibility: "hidden",
              }}
              className="absolute inset-0 w-full h-full"
            >
              {hasHeroArt && (
                <>
                  {mobileHeroSrc && (
                    <img
                      key={`mobile-${mobileHeroSrc}`}
                      src={mobileHeroSrc}
                      alt={title}
                      className={`sv-hero-art-in block h-full w-full ${
                        // `sm:hidden` mira el VIEWPORT: en el drawer de un
                        // escritorio casa siempre y ocultaría justo la imagen
                        // que la ficha de teléfono tiene que enseñar.
                        mobileDetails ? "object-cover" : "object-contain sm:hidden"
                      }`}
                      loading="eager"
                      fetchPriority="high"
                    />
                  )}

                  {desktopHeroSrc && !mobileDetails && (
                    <img
                      key={`desktop-${desktopHeroSrc}`}
                      src={desktopHeroSrc}
                      alt={title}
                      className={`sv-hero-art-in sv-hero-art-edge h-full w-full ${
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

              {!hasHeroArt && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" />
              )}

            </motion.div>
            </div>

            {/* Dark overlay that increases as we scroll */}
            <motion.div
              style={{ opacity: darkOverlayOpacity, willChange: "opacity" }}
              className="pointer-events-none absolute inset-0 bg-black/60 z-10"
            />

            {/* El arte de portada abre la ficha completa con la misma transición
                que el control superior derecho. El botón queda bajo el logo y
                los controles, para no interceptar sus interacciones. */}
            {hasHeroArt && (
              <button
                type="button"
                onClick={goToFullDetails}
                disabled={navigatingToFullDetails}
                aria-label="Ver ficha completa"
                aria-busy={navigatingToFullDetails ? "true" : undefined}
                className="absolute inset-0 z-[11] cursor-pointer touch-pan-y focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-yellow-400 disabled:cursor-default"
              />
            )}

            {/* Aquí había una sombra de 10rem para el logo, la MISMA que ya se
                retiró del póster móvil de DetailsClient por este mismo motivo.

                No era un degradado anclado sino una FRANJA flotante: transparente
                arriba, 45% de negro en su punto medio y transparente abajo. Al no
                estar anclada a ningún borde, sobre imágenes claras se leía como
                una zona/banda oscura suspendida en mitad de la portada — y sobre
                oscuras pasaba desapercibida, de ahí que solo se viera en algunos
                títulos.

                No hace falta: el logo lleva su propio drop-shadow fuerte
                (0.85 alfa, 14px) para el contraste local, exactamente igual que
                en DetailsClient. */}

            {/* Logo del título sobre el hero (fallback al texto si no hay logo).

                En la ficha de TELÉFONO desaparece cuando la portada ya trae el
                título impreso: `heroPosterPath` cae a un póster localizado en
                los títulos sin ninguna versión textless, y ahí el logo
                duplicaba el título. Mismo criterio que la ficha móvil completa
                (`mobilePosterHasBurnedTitle`). */}
            {!(mobileDetails && data.heroPosterHasBurnedTitle && mobileHeroSrc) && (
            <motion.div
              // Mismo motivo que la capa del póster: el logo se desvanece y se
              // desplaza a la vez, y su imagen lleva un `drop-shadow` fuerte.
              // Un filtro dentro de un elemento que cambia de opacidad se
              // recalcula en cada fotograma si la capa no está promocionada, y
              // ese recálculo es lo que hacía que el logo pareciera
              // distorsionarse al hacer scroll.
              style={{
                opacity: logoOpacity,
                y: logoY,
                willChange: "opacity, transform",
              }}
              className={`absolute inset-x-0 bottom-0 z-15 flex justify-center p-5 text-center ${
                // Teléfono: el logo respira por debajo. Ese `pb` ES la
                // separación con la fila de botones, que arranca justo donde
                // acaba la portada.
                mobileDetails ? "pb-8" : "sm:block sm:p-7 sm:text-left"
              }`}
            >
              {data.logoPath ? (
                <NextImage
                  key={data.logoPath}
                  src={buildImg(data.logoPath, "w500")}
                  alt={title}
                  width={500}
                  height={200}
                  sizes="(min-width:920px) 460px, 70vw"
                  className={`h-auto max-h-28 w-auto max-w-[85%] object-contain object-center drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)] ${
                    mobileDetails ? "" : "sm:max-h-36 sm:object-left"
                  }`}
                  loading="eager"
                  priority
                />
              ) : data.logoResolved ? (
                // El título de texto SOLO cuando la búsqueda del logo ha
                // TERMINADO y no hay ninguno. Antes colgaba solo de
                // `data.logoPath`, que empieza en null: mientras el logo
                // cargaba se mostraba el texto y luego saltaba al logo.
                // Con `logoPath` a secas no se distingue "aún no llegó" de
                // "no existe"; `logoResolved` sí.
                <h2
                  className={`mx-auto max-w-[85%] text-3xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] ${
                    mobileDetails ? "" : "sm:mx-0 sm:text-5xl"
                  }`}
                >
                  {title || <SkeletonBar className="h-8 w-64" />}
                </h2>
              ) : null}
            </motion.div>
            )}
          </div>

          {/* TELÉFONO: la fila de botones cierra el primer pantallazo, igual que
              en la ficha móvil, donde queda justo encima del navbar. `shrink-0`
              la protege: la portada es quien cede espacio, nunca los botones.

              Este `pb` sube a la vez los botones Y el logo: la portada es
              `flex-1`, así que lo que se le quita por abajo la encoge, y el
              logo va anclado a SU borde inferior. Por eso el aire del final se
              ajusta aquí y no en los dos sitios por separado. */}
          {mobileDetails && (
            <div className="shrink-0 px-5 pb-10">
              {actionsNode}
            </div>
          )}
          </div>

          {/* CONTENIDO */}
          <div className={`space-y-8 p-5 ${mobileDetails ? "" : "sm:p-7"}`}>
            {mobileDetails ? null : actionsNode}

            {/* La línea de premios y la fila de meta+géneros NO se pintan en la
                ficha de TELÉFONO: en la ficha móvil completa van dentro de un
                bloque `hidden sm:flex`, porque esos mismos datos ya están en
                las pestañas de información que hay justo debajo. Repetirlos
                aquí sería información duplicada que allí no aparece. */}
            <div className={mobileDetails ? "hidden" : "space-y-3"}>
              {/* Premios / nominaciones: misma línea verde que las previews del
                  dashboard (InlinePreviewCard). Se alimenta de la cadena cruda de
                  OMDb (data.awards) formateada con formatDashboardAwards. */}
              {data.awards ? (
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
              ) : !data.imdbRatingResolved ? (
                /* HUECO RESERVADO mientras OMDb no ha contestado.
                   Los premios llegan en un efecto INDEPENDIENTE que termina
                   después del resto, así que esta fila aparecía la última y
                   empujaba hacia abajo características, marcador y pestañas.
                   `imdbRatingResolved` se marca en las DOS salidas de ese
                   efecto (con y sin imdbId) y en el mismo `setData` que
                   `awards`, así que es exactamente su señal de "ya se sabe".
                   El hueco se clona de la fila real —mismas clases, mismo
                   icono, una línea— en vez de fijar una altura a mano: así no
                   puede descuadrarse si cambia la tipografía. */
                <div
                  aria-hidden="true"
                  className="invisible flex items-center justify-center gap-2 text-center text-xs font-bold sm:justify-start sm:text-left sm:text-sm"
                >
                  <Award className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">&nbsp;</span>
                </div>
              ) : null}

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
            <div style={mobileDetails ? PHONE_SCALED_BLOCK_STYLE : undefined}>
              <DetailsScoreboardPanel
                loading={loading}
                // El pie de estadísticas de Trakt llega en su propia consulta
                // y, al montarse, hacía crecer el panel y empujaba hacia
                // abajo las pestañas. Con esto el panel nace ya con su alto
                // final. `scoreboardResolved` se marca en TODAS las salidas
                // de esa consulta —incluida "este título no está en
                // Trakt"—, así que el hueco siempre acaba liberándose.
                statsPending={!data.scoreboardResolved}
                tmdb={{
                  value:
                    data.tmdbRating != null
                      ? data.tmdbRating
                      : data.tmdbRatingResolved
                        ? null
                        : undefined,
                  sub:
                    data.tmdbRating != null
                      ? formatCountShort(data.tmdbVotes)
                      : undefined,
                  href: buildTmdbHref({ type: mediaType, tmdbId: item?.id }),
                  pending:
                    !data.tmdbRatingResolved && data.tmdbRating == null,
                }}
                // Trakt conserva enlace (canónico o búsqueda por TMDb). El badge
                // no aparece mientras la nota está pendiente; "-" queda solo
                // para ausencia confirmada.
                trakt={{
                  value:
                    typeof scoreboard?.rating === "number"
                      ? Number(scoreboard.rating).toFixed(1)
                      : data.scoreboardResolved
                        ? null
                        : undefined,
                  sub: scoreboard?.votes
                    ? formatCountShort(scoreboard.votes)
                    : undefined,
                  href: buildTraktHref({
                    href: scoreboard?.traktUrl || traktStatus?.traktUrl,
                    title,
                  }),
                  pending:
                    !data.scoreboardResolved &&
                    typeof scoreboard?.rating !== "number",
                }}
                traktPublic={null}
                imdb={{
                  value:
                    typeof data.imdbRating === "number"
                      ? data.imdbRating.toFixed(1)
                      : data.imdbRatingResolved
                        ? null
                        : undefined,
                  sub:
                    typeof data.imdbRating === "number"
                      ? formatCountShort(data.imdbVotes)
                      : undefined,
                  href: buildImdbHref({ imdbId: data.imdbId, title }),
                  pending:
                    !data.imdbRatingResolved &&
                    typeof data.imdbRating !== "number",
                }}
                // Ver `optionalScoreBadge`: fuera de la ficha de teléfono, y con
                // hueco reservado mientras la respuesta de OMDb está en vuelo.
                rt={optionalScoreBadge(data.rtScore, ratingLinks.rt)}
                mc={optionalScoreBadge(data.mcScore, ratingLinks.mc)}
                compactToolbar={mobileDetails}
                // En tablet la ventana supera `sm` aunque el drawer sea
                // estrecho: sin esto el marcador salía con la disposición
                // ancha y puntuaciones y stats se partían en dos filas.
                phoneLayout={mobileDetails}
                externalLinks={externalLinks}
                onMorePlatforms={(event) => {
                  stopNestedModalOpeningEvent(event);
                  setPlatformsOpen(true);
                }}
                platformsMenuOnly
                onMoreLinks={(event) => {
                  stopNestedModalOpeningEvent(event);
                  setExternalLinksOpen(true);
                }}
                externalLinksMenuOnly
                showExternalLinksLabel
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
            </div>

            {/* EPISODIO: pestañas Detalles/Sinopsis (mismos componentes que
                EpisodeDetails). Detalles = Serie/Emisión/Duración/Episodio. */}
            {/* El menú de pestañas y sus tarjetas forman un bloque, pero necesitan
                aire antes de la siguiente sección. La columna deja 32px entre
                secciones y este margen mantiene una transición intermedia. */}
            {isEpisode ? (
              <motion.div
                className="mb-5"
                style={mobileDetails ? PHONE_SCALED_BLOCK_STYLE : undefined}
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
                <div className="relative min-h-[80px] pt-4">
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
              <div
                className="mb-5"
                style={mobileDetails ? PHONE_SCALED_BLOCK_STYLE : undefined}
              >
                <DetailsInfoTabs
                  variant="normal"
                  layoutId="detailModalTab"
                  // TELÉFONO: las tarjetas se APILAN en vez de ir en una fila
                  // que se desplaza. Esa fila es `lg:flex-row`, y ese `lg:`
                  // mira el viewport: en el drawer casa siempre, así que las
                  // tarjetas salían en horizontal y se cortaban contra el borde
                  // del panel. Son las mismas props que usa la ficha móvil.
                  mobileLayout={mobileDetails}
                  enableMobileTabSwipe={mobileDetails}
                  phoneMenu={mobileDetails}
                  // Las tarjetas ENVUELVEN en vez de irse a una fila que se
                  // desplaza: el panel se puede estrechar, y en esa fila las
                  // últimas quedaban fuera de vista a la derecha, alcanzables
                  // solo desplazando algo que no parece desplazable.
                  wrapCards
                  showPlatformsTab={false}
                  // TELÉFONO: los enlaces externos son una PESTAÑA más, igual
                  // que en la ficha móvil (Detalles · Producción · Sinopsis ·
                  // Enlaces). Ahí es donde viven, y por eso la barra del
                  // marcador se queda solo con plataformas y compartir.
                  showExternalLinksTab={mobileDetails}
                  externalLinks={externalLinks}
                  mediaType={mediaType}
                  originalTitle={data.originalTitle}
                  // `formatValue` NO significa lo mismo en las dos
                  // disposiciones de <DetailsInfoTabs>, y hay que pasarle lo
                  // que espera cada una:
                  //  - ancha: solo hay tarjeta "Duración" y solo en series, y
                  //    sale de aquí (la duración de una película vive en la
                  //    fila de meta, no en una tarjeta).
                  //  - teléfono: en películas esta ES la "Duración", y en
                  //    series es el "Formato" (temporadas · capítulos), con la
                  //    duración del episodio aparte en `durationValue`.
                  //
                  // La ficha completa no se topa con esto porque monta DOS
                  // instancias, una por disposición; el modal monta una sola y
                  // conmuta. Pasando el valor de la instancia ancha, en el
                  // teléfono las películas se quedaban con un "—" y las series
                  // enseñaban la duración en "Formato" y nada en "Duración".
                  formatValue={
                    mobileDetails
                      ? mediaType === "tv"
                        ? data.seasonEpisodeValue || "—"
                        : data.runtime || "—"
                      : mediaType === "tv"
                        ? data.episodeRuntimeValue || "—"
                        : "—"
                  }
                  durationValue={
                    mediaType === "tv" ? data.episodeRuntimeValue || "—" : null
                  }
                  // La tarjeta "Premios" de Producción se alimenta de aquí. Sin
                  // esta prop se quedaba en "—" aunque el título tuviera
                  // premios: es la MISMA cadena de OMDb que ya formatea la
                  // línea verde de la cabecera.
                  awardsValue={
                    data.awards ? formatDashboardAwards(data.awards) : null
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
                  genres={data.genres}
                  metadataLoading={metadataLoading}
                />
              </div>
            )}

            {/* SECCIONES DEL MODAL (vista normal).

                En la ficha de TELÉFONO no se pintan: allí van las secciones de
                la ficha móvil completa, que son más y con otro diseño (ver
                <PhoneDetailsSections/> justo debajo). */}
            {!mobileDetails && (
            <>
            {/* Reparto */}
            {data.cast?.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15px" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="sv-drawer-section space-y-4"
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
                  {data.cast.slice(0, 20).map((person) => {
                    const photo = person?.profile_path
                      ? buildImg(person.profile_path, "w342")
                      : null;
                    return (
                      <SwiperSlide key={person?.id ?? person?.credit_id ?? person?.name}>
                        <Link
                          href={`/details/person/${person.id}`}
                          className="block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md lg:hover:shadow-yellow-900/20 transition-all duration-300"
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
                              <p className="text-white font-extrabold text-[11px] sm:text-xs leading-tight line-clamp-1 drop-shadow-sm">
                                {person?.name}
                              </p>
                              {person?.character && (
                                <p className="mt-0.5 text-zinc-300 group-hover:text-yellow-400 text-[9px] sm:text-[10px] font-semibold leading-tight line-clamp-1 transition-colors duration-300 drop-shadow-sm">
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
                className="sv-drawer-section space-y-4"
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
                className="sv-drawer-section space-y-4"
              >
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Sentimientos de la comunidad
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* MISMAS TARJETAS QUE EN LA FICHA (`DetailsClient`, sección
                      "Análisis de sentimientos"): solo TINTE de color, sin
                      contorno y sin cristal propio.
                      - El borde se va porque dibujaba un canto por columna y el
                        bloque dejaba de leerse como una superficie continua.
                      - El `backdrop-blur` propio también: el cristal lo pone la
                        superficie de debajo (allí el panel de sección, aquí el
                        del modal con su capa hermana de desenfoque). Repetirlo
                        por tarjeta es lo que en la ficha se retiró por añadir un
                        canto luminoso a cada una.
                      - El tinte sube a `/15` con una parada intermedia, que es
                        lo que compensa el cristal que ya no aporta la tarjeta. */}
                  {sentiment.pros?.length > 0 && (
                    <div className="relative isolate overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-emerald-500/15 via-emerald-500/[0.04] to-transparent">
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
                    <div className="relative isolate overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-rose-500/15 via-rose-500/[0.04] to-transparent">
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
                className="space-y-5 pb-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                          className="group relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-white/[0.03] text-left transition hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/40"
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
            </>
            )}

            {/* Todo lo que va por debajo de los botones en la ficha de
                TELÉFONO: menú de secciones y secciones, igual que la vista
                móvil de DetailsClient. */}
            {mobileDetails && phoneSectionsReady && (
              <PhoneDetailsSections
                item={item}
                data={data}
                mediaType={mediaType}
                title={title}
                scrollContainerRef={scrollContainerRef}
                onOpenTitle={(rec) => openDetailModal?.(rec)}
                onOpenSeason={(seasonNumber) =>
                  goToDetailsRoute(`/details/tv/${item?.id}/season/${seasonNumber}`)
                }
                episodesWatched={episodesWatched}
                imdbId={data.imdbId}
                canLikeComments={ratingActionConnected}
                onArtworkSelection={applyArtworkSelection}
                soundtrack={{
                  query: soundtrackSearchQuery,
                  tracks: soundtrackTracks,
                  loading: soundtrackLoading,
                  error: soundtrackError,
                  spotifyUrl: soundtrackSpotifyUrl,
                  // La sección pide las pistas la primera vez que se pinta: sin
                  // esto solo se cargarían al abrir el modal de soundtrack, y
                  // aquí se ven en la propia ficha.
                  onEnsureLoaded: loadSoundtrack,
                  onOpen: () => {
                    setSoundtrackOpen(true);
                    void loadSoundtrack();
                  },
                }}
              />
            )}
          </div>
          </div>
        </div>
      </motion.div>

      {/* `data-detail-modal-layer` marca esta capa para que el cierre por clic
          fuera del drawer la reconozca como "dentro". Al ir portada a
          document.body queda fuera del panel, y sin esta marca un clic en
          cualquiera de estos modales cerraría el drawer que hay debajo.
          El div envoltorio es inerte: no crea contexto de apilamiento (sin
          transform/opacity/z-index) y todos sus hijos son `fixed`, así que no
          altera su posicionamiento. */}
      {modalHostReady
        ? createPortal(
            <div
              data-detail-modal-layer=""
              onPointerDown={stopNestedModalEvent}
              onMouseDown={stopNestedModalEvent}
              onClick={stopNestedModalEvent}
            >
              {modalLayer}
            </div>,
            document.body,
          )
        : modalLayer}
    </div>
  );
}
