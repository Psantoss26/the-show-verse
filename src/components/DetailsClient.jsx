// src/components/DetailsClient.jsx
"use client";

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";
import { AnimatePresence, motion } from "framer-motion";
import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import { saveArtworkOverride } from "@/lib/artworkApi";
import Link from "next/link";

// Nuevos componentes de animación
import {
  AnimatedSection,
  FadeIn,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/details/AnimatedSection";
import {
  PosterSkeleton,
  CardSkeleton,
  ScoreboardSkeleton,
  GridSkeleton,
} from "@/components/details/LoadingSkeleton";

import {
  CalendarIcon,
  ClockIcon,
  FilmIcon,
  StarIcon,
  MessageSquareIcon,
  BadgeDollarSignIcon,
  LinkIcon,
  ImageIcon,
  ImageOff,
  Heart,
  BookmarkPlus,
  BookmarkMinus,
  Loader2,
  ChevronDown,
  ChevronUp,
  MonitorPlay,
  TrendingUp,
  Layers,
  Users,
  Building2,
  MapPin,
  Languages,
  Trophy,
  ListVideo,
  Check,
  X,
  Plus,
  Search,
  RotateCcw,
  Play,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Star,
  Eye,
  List,
  LibraryBig,
  MessageSquare,
  MoreHorizontal,
  SlidersHorizontal,
} from "lucide-react";

import LiquidButton from "@/components/LiquidButton";

/* === cuenta / api === */
import { useAuth } from "@/context/AuthContext";
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import StarRating from "./StarRating";
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl";
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal";
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal";
import {
  traktGetItemStatus,
  traktSetWatched,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
  traktGetShowWatched,
  traktSetEpisodeWatched,
  traktGetComments,
  traktGetLists,
  traktGetShowSeasons,
  traktGetStats,
  traktGetScoreboard,
  traktSetRating,
  traktGetShowPlays,
  traktAddShowPlay,
  traktAddEpisodePlay,
} from "@/lib/api/traktClient";
import DetailsSectionMenu from "./DetailsSectionMenu";
import {
  readOmdbCache,
  writeOmdbCache,
  runIdle,
  extractOmdbExtraScores,
} from "@/lib/details/omdbCache";

import {
  mergeUniqueImages,
  buildOriginalImageUrl,
  preloadTmdb,
  fetchTVImages,
  pickBestImage,
  pickBestNeutralPosterByResVotes,
  pickBestBackdropByLangResVotes,
  pickBestPosterTV,
  pickBestBackdropTVNeutralFirst,
  pickBestBackdropForPreview,
} from "@/lib/details/tmdbImages";

import {
  formatShortNumber,
  slugifyForSeriesGraph,
  formatDateEs,
  formatVoteCount,
  formatCountShort,
  stripHtml,
  formatDateTimeEs,
  mixedCount,
  sumCount,
} from "@/lib/details/formatters";

import { buildSentimentFromComments } from "@/lib/details/sentiment";

import {
  tmdbFetchAllUserLists,
  tmdbListItemStatus,
  tmdbAddMovieToList,
  tmdbCreateList,
} from "@/lib/details/tmdbListsClient";

import {
  uniqBy,
  isPlayableVideo,
  videoExternalUrl,
  videoEmbedUrl,
  videoThumbUrl,
  rankVideo,
  pickPreferredVideo,
} from "@/lib/details/videos";

import {
  VisualMetaCard,
  SectionTitle,
  MetaItem,
  ScoreBadge,
  StatChip,
} from "@/components/details/DetailAtoms";
import {
  CompactBadge,
  ExternalLinkButton,
  MiniStat,
  UnifiedRateButton,
  ActionShareButton,
} from "@/components/details/DetailHeaderBits";

import AddToListModal from "@/components/details/AddToListModal";
import VideoModal from "@/components/details/VideoModal";
import PosterStack from "@/components/details/PosterStack";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

const PUBLIC_SCORE_CACHE = new Map(); // key -> { ts, data }
const TTL = 1000 * 60 * 5; // 5 min

async function fetchPublicScoreboard({ type, id, imdbId, signal }) {
  const url = `/api/scoreboard/public?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&imdb=${encodeURIComponent(imdbId || "")}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`scoreboard ${r.status}`);
  return r.json();
}

// =====================================================================

export default function DetailsClient({
  type,
  id,
  data,
  recommendations,
  castData,
  providers,
  watchLink,
  reviews,
}) {
  const router = useRouter();

  const title = data.title || data.name;
  const endpointType = type === "tv" ? "tv" : "movie";
  const yearIso = (data.release_date || data.first_air_date || "")?.slice(0, 4);

  const tmdbDetailUrl =
    type && id ? `https://www.themoviedb.org/${type}/${id}` : null;

  const tmdbWatchUrl =
    watchLink ||
    (type && id ? `https://www.themoviedb.org/${type}/${id}/watch` : null);

  const [showAdminImages, setShowAdminImages] = useState(false);
  const [reviewLimit, setReviewLimit] = useState(2);
  const [useBackdrop, setUseBackdrop] = useState(true);

  const { session, account } = useAuth();
  const isAdmin =
    account?.username === "psantos26" || account?.name === "psantos26";

  const [favLoading, setFavLoading] = useState(false);
  const [wlLoading, setWlLoading] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);

  const [userRating, setUserRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState("");

  const [accountStatesLoading, setAccountStatesLoading] = useState(false);

  // ✅ Resumen plegable (por defecto oculto)
  const [activeTab, setActiveTab] = useState("details");

  // ====== PREFERENCIAS DE IMÁGENES ======
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`;
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`;
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`;
  // ✅ PERSISTENCIA GLOBAL del modo de vista (poster/preview)
  const globalViewModeStorageKey = "showverse:global:posterViewMode";
  // ✅ Rewatch (Trakt) persistente por show
  const rewatchStorageKey = `showverse:trakt:rewatchStartAt:${id}`;

  // ✅ NUEVO: múltiples runs + vista activa del modal
  const rewatchRunsStorageKey = `showverse:trakt:rewatchRuns:${id}`;
  const episodesViewStorageKey = `showverse:trakt:episodesView:${id}`;

  // runs: [{ id: startedAtISO, startedAt: ISO, label: string }]
  const [rewatchRuns, setRewatchRuns] = useState([]);
  const [activeEpisodesView, setActiveEpisodesView] = useState("global"); // 'global' | runId

  // para poder “desmarcar” episodios en rewatch
  const [rewatchHistoryByEpisode, setRewatchHistoryByEpisode] = useState({}); // { "S1E2": historyId }

  const [selectedPosterPath, setSelectedPosterPath] = useState(null);
  const [selectedPreviewBackdropPath, setSelectedPreviewBackdropPath] =
    useState(null);
  // posterViewMode: controla QUÉ imagen se muestra (poster vs preview)
  // ✅ Se inicializa desde localStorage global
  const [posterViewMode, setPosterViewMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    try {
      return window.localStorage.getItem(globalViewModeStorageKey) || "poster";
    } catch {
      return "poster";
    }
  });
  // posterLayoutMode: controla el LAYOUT (ancho/ratio). Lo separamos para poder
  // redimensionar antes de empezar a cargar la imagen de backdrop.
  const [posterLayoutMode, setPosterLayoutMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    try {
      return window.localStorage.getItem(globalViewModeStorageKey) || "poster";
    } catch {
      return "poster";
    }
  });
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState(null);
  const [prevBackgroundPath, setPrevBackgroundPath] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // ✅ Evita SSR/primer render con un poster “provisional”
  const [basePosterPath, setBasePosterPath] = useState(null);
  const [baseBackdropPath, setBaseBackdropPath] = useState(null);
  const [artworkInitialized, setArtworkInitialized] = useState(false);

  // ✅ Estados de carga de imagen (definidos aquí para estar disponibles en useLayoutEffect)
  const [posterResolved, setPosterResolved] = useState(false);
  const [posterLowLoaded, setPosterLowLoaded] = useState(false);
  const [posterHighLoaded, setPosterHighLoaded] = useState(false);
  const [posterImgError, setPosterImgError] = useState(false);
  const [posterTransitioning, setPosterTransitioning] = useState(false);
  const [prevPosterPath, setPrevPosterPath] = useState(null);

  // ✅ Estados de carga para backdrop (misma lógica que poster)
  const [backdropResolved, setBackdropResolved] = useState(false);
  const [backdropLowLoaded, setBackdropLowLoaded] = useState(false);
  const [backdropHighLoaded, setBackdropHighLoaded] = useState(false);
  const [backdropImgError, setBackdropImgError] = useState(false);

  const [imagesState, setImagesState] = useState(() => ({
    posters: data.poster_path
      ? [{ file_path: data.poster_path, from: "main" }]
      : [],
    backdrops: data.backdrop_path
      ? [{ file_path: data.backdrop_path, from: "main" }]
      : [],
  }));
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [activeImagesTab, setActiveImagesTab] = useState("posters");

  // ====== JUSTWATCH PROVIDERS ======
  const [streamingProviders, setStreamingProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [justwatchUrl, setJustwatchUrl] = useState(null);

  // ====== PLEX INTEGRATION ======
  const [plexAvailable, setPlexAvailable] = useState(false);
  const [plexUrl, setPlexUrl] = useState(null);
  const [plexLoading, setPlexLoading] = useState(true);

  const imagesScrollRef = useRef(null);
  const [isHoveredImages, setIsHoveredImages] = useState(false);
  const [canPrevImages, setCanPrevImages] = useState(false);
  const [canNextImages, setCanNextImages] = useState(false);

  const asTmdbPath = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && typeof v.file_path === "string")
      return v.file_path;
    return null;
  };

  const normalizeUrl = (u) => {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    return s.startsWith("http://") || s.startsWith("https://")
      ? s
      : `https://${s}`;
  };

  // =====================================================================
  // ✅ LISTAS (estado + modal + detección)
  // =====================================================================

  const canUseLists = endpointType === "movie" && !!TMDB_API_KEY;

  const [listModalOpen, setListModalOpen] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [userLists, setUserLists] = useState([]);
  const [listQuery, setListQuery] = useState("");

  const [membershipMap, setMembershipMap] = useState({});
  const [listsPresenceLoading, setListsPresenceLoading] = useState(false);
  const [busyListId, setBusyListId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  const ratingWrapRef = useRef(null);

  const [supportsHover, setSupportsHover] = useState(false);
  const [mobileClearOpen, setMobileClearOpen] = useState(false);

  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const getListId = useCallback((lOrId) => {
    if (lOrId == null) return null;
    if (typeof lOrId === "string" || typeof lOrId === "number")
      return String(lOrId);

    const l = lOrId;
    const id = l?.id ?? l?._id ?? l?.ids?.tmdb ?? l?.slug ?? l?.name;
    return id != null ? String(id) : null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // hover/puntero fino => desktop
    const mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateHover = () => setSupportsHover(!!mqHover.matches);
    updateHover();
    if (mqHover.addEventListener)
      mqHover.addEventListener("change", updateHover);
    else mqHover.addListener(updateHover);

    // viewport móvil (ajusta breakpoint si quieres)
    const mqMobile = window.matchMedia("(max-width: 640px)");
    const updateMobile = () => setIsMobileViewport(!!mqMobile.matches);
    updateMobile();
    if (mqMobile.addEventListener)
      mqMobile.addEventListener("change", updateMobile);
    else mqMobile.addListener(updateMobile);

    return () => {
      if (mqHover.removeEventListener)
        mqHover.removeEventListener("change", updateHover);
      else mqHover.removeListener(updateHover);

      if (mqMobile.removeEventListener)
        mqMobile.removeEventListener("change", updateMobile);
      else mqMobile.removeListener(updateMobile);
    };
  }, []);

  useEffect(() => {
    // si pasamos a desktop, cerramos el modo móvil del botón
    if (supportsHover) setMobileClearOpen(false);
  }, [supportsHover]);

  useEffect(() => {
    // cerrar al tocar fuera en móvil
    if (supportsHover || !mobileClearOpen) return;
    const onDown = (e) => {
      if (!ratingWrapRef.current) return;
      if (!ratingWrapRef.current.contains(e.target)) setMobileClearOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [supportsHover, mobileClearOpen]);

  const movieId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  }, [id]);

  const inAnyList = useMemo(() => {
    const vals = Object.values(membershipMap || {});
    return vals.some(Boolean);
  }, [membershipMap]);

  const listActive = !listsPresenceLoading && inAnyList;

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = "/login";
      return true;
    }
    return false;
  };

  const loadListsIfNeeded = async ({ abortRef } = {}) => {
    if (!session || !account?.id) return [];
    if (!canUseLists) return [];
    if (Array.isArray(userLists) && userLists.length > 0) return userLists;

    const lists = await tmdbFetchAllUserLists({
      apiKey: TMDB_API_KEY,
      accountId: account.id,
      sessionId: session,
      language: "es-ES",
    });

    if (abortRef?.current) return [];
    setUserLists(lists);
    return lists;
  };

  const loadPresenceForLists = async ({
    lists,
    silent = false,
    abortRef,
  } = {}) => {
    if (!session || !account?.id || !movieId) return;
    if (!canUseLists) return;

    if (!silent) setListsLoading(true);
    else setListsPresenceLoading(true);

    setListsError("");

    try {
      const base =
        Array.isArray(lists) && lists.length
          ? lists
          : await loadListsIfNeeded({ abortRef });
      if (abortRef?.current) return;

      const ids = base.map(getListId).filter(Boolean);
      const concurrency = 5;
      let idx = 0;
      const nextMap = {};

      const worker = async () => {
        while (!abortRef?.current && idx < ids.length) {
          const listId = ids[idx++];
          try {
            const lid = String(listId);
            const present = await tmdbListItemStatus({
              apiKey: TMDB_API_KEY,
              listId: lid,
              movieId,
              sessionId: session,
            });
            nextMap[lid] = !!present;
          } catch {
            nextMap[listId] = false;
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(concurrency, ids.length) }, () =>
          worker(),
        ),
      );
      if (abortRef?.current) return;
      setMembershipMap(nextMap);
    } catch (e) {
      if (!abortRef?.current)
        setListsError(e?.message || "Error cargando listas");
    } finally {
      if (!abortRef?.current) {
        if (!silent) setListsLoading(false);
        else setListsPresenceLoading(false);
      }
    }
  };

  useEffect(() => {
    const abortRef = { current: false };
    if (!session || !account?.id || !canUseLists || !movieId) {
      setMembershipMap({});
      setListsPresenceLoading(false);
      return;
    }

    loadPresenceForLists({ silent: true, abortRef });
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, account?.id, canUseLists, movieId]);

  const openListsModal = async () => {
    if (requireLogin()) return;
    if (!canUseLists || !movieId) return;

    setListModalOpen(true);
    setListsError("");
    setListQuery("");

    const abortRef = { current: false };
    await loadPresenceForLists({ silent: false, abortRef });
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
    if (!session || !account?.id || !movieId) return;
    if (!canUseLists) return;

    const lid = getListId(listId);
    if (!lid) return;
    if (membershipMap?.[lid]) return;

    setBusyListId(lid);
    setListsError("");

    try {
      const res = await tmdbAddMovieToList({
        apiKey: TMDB_API_KEY,
        listId: lid,
        movieId,
        sessionId: session,
      });

      // ✅ optimista
      setMembershipMap((prev) => ({ ...(prev || {}), [lid]: true }));
      setUserLists((prev) =>
        (prev || []).map((l) => {
          const id = getListId(l);
          return id === lid
            ? {
              ...l,
              item_count: (l.item_count || 0) + (res?.duplicate ? 0 : 1),
            }
            : l;
        }),
      );
    } catch (e) {
      setListsError(e?.message || "Error añadiendo a la lista");
    } finally {
      setBusyListId(null);
    }
  };

  const handleCreateListAndAdd = async () => {
    if (!session || !account?.id || !movieId) return;
    if (!canUseLists) return;

    const n = newListName.trim();
    if (!n) return;

    setCreatingList(true);
    setListsError("");

    try {
      const newIdRaw = await tmdbCreateList({
        apiKey: TMDB_API_KEY,
        name: n,
        description: newListDesc.trim(),
        sessionId: session,
        language: "es-ES",
      });

      const newListId = getListId(newIdRaw);
      if (!newListId) throw new Error("No se pudo crear la lista");

      await tmdbAddMovieToList({
        apiKey: TMDB_API_KEY,
        listId: newListId,
        movieId,
        sessionId: session,
      });

      // refresca listas (para que aparezca y con count correcto)
      const lists = await tmdbFetchAllUserLists({
        apiKey: TMDB_API_KEY,
        accountId: account.id,
        sessionId: session,
        language: "es-ES",
      });
      setUserLists(lists);

      // marca presencia
      setMembershipMap((prev) => ({ ...(prev || {}), [newListId]: true }));

      setCreateOpen(false);
      setNewListName("");
      setNewListDesc("");
    } catch (e) {
      setListsError(e?.message || "Error creando lista");
    } finally {
      setCreatingList(false);
    }
  };

  // =====================================================================
  // ✅ VIDEOS / TRAILERS
  // =====================================================================

  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);

  const preferredVideo = useMemo(() => pickPreferredVideo(videos), [videos]);

  const openVideo = (v) => {
    if (!v) return;
    setActiveVideo(v);
    setVideoModalOpen(true);
  };

  const closeVideo = () => {
    setVideoModalOpen(false);
    setActiveVideo(null);
  };

  useEffect(() => {
    setVideoModalOpen(false);
    setActiveVideo(null);
  }, [id, endpointType]);

  useEffect(() => {
    let ignore = false;

    const safeFetchVideos = async (language) => {
      if (!TMDB_API_KEY) return [];
      try {
        const url = `https://api.themoviedb.org/3/${endpointType}/${id}/videos?api_key=${TMDB_API_KEY}&language=${language}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) return [];
        return Array.isArray(json?.results) ? json.results : [];
      } catch {
        return [];
      }
    };

    const load = async () => {
      if (!TMDB_API_KEY || !id) {
        setVideos([]);
        setVideosError("");
        setVideosLoading(false);
        return;
      }

      setVideosLoading(true);
      setVideosError("");

      try {
        const [es, en] = await Promise.all([
          safeFetchVideos("es-ES"),
          safeFetchVideos("en-US"),
        ]);
        if (ignore) return;

        const merged = uniqBy(
          [...es, ...en],
          (v) => `${v.site}:${v.key}`,
        ).filter(isPlayableVideo);

        merged.sort((a, b) => rankVideo(a) - rankVideo(b));
        setVideos(merged);
      } catch (e) {
        if (!ignore) setVideosError(e?.message || "Error cargando vídeos");
      } finally {
        if (!ignore) setVideosLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, endpointType]);

  // =====================================================================

  // ====== Filtros Portadas y fondos ======
  const [imagesResFilter, setImagesResFilter] = useState("all"); // all | 720p | 1080p | 2k | 4k
  const [langES, setLangES] = useState(true);
  const [langEN, setLangEN] = useState(true);
  const [artworkPreloadCount, setArtworkPreloadCount] = useState(4);

  // Render "a la vez": no mostramos la fila hasta tener precargadas las primeras N imágenes
  const [artworkRowReady, setArtworkRowReady] = useState(false);

  // Panel móvil de filtros (Portadas y fondos)
  const [artworkControlsOpen, setArtworkControlsOpen] = useState(false);

  // Wrapper para detectar click fuera / cerrar panel
  const artworkControlsWrapRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setArtworkControlsOpen(false);
        // si tienes el dropdown de resolución abierto, también lo cerramos
        setResMenuOpen?.(false);
      }
    };

    const onDown = (e) => {
      const wrap = artworkControlsWrapRef.current;
      if (!wrap) return;
      if (!wrap.contains(e.target)) {
        setArtworkControlsOpen(false);
        setResMenuOpen?.(false);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const [resMenuOpen, setResMenuOpen] = useState(false);
  const resMenuRef = useRef(null);

  // Cierra el menú al hacer click fuera
  useEffect(() => {
    if (!resMenuOpen) return;
    const onDown = (e) => {
      if (!resMenuRef.current) return;
      if (!resMenuRef.current.contains(e.target)) setResMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [resMenuOpen]);

  // Cierra el menú si cambias de tab
  useEffect(() => {
    setResMenuOpen(false);
  }, [activeImagesTab]);

  const imgLongSide = (img) =>
    Math.max(Number(img?.width || 0), Number(img?.height || 0));

  const imgResBucket = (img) => {
    const long = imgLongSide(img);
    if (long >= 3840) return "4k";
    if (long >= 2560) return "2k";
    if (long >= 1920) return "1080p";
    if (long >= 1280) return "720p";
    return "sd";
  };

  const imgResLabel = (img) => {
    const w = Number(img?.width || 0);
    const h = Number(img?.height || 0);
    return w > 0 && h > 0 ? `${w}×${h}` : null;
  };

  const getArtworkSlidesPerView = (width, isPoster) => {
    if (isPoster) {
      if (width >= 1280) return 7;
      if (width >= 1024) return 6;
      if (width >= 768) return 5;
      if (width >= 640) return 4;
      if (width >= 500) return 3;
      return 3;
    }
    if (width >= 1280) return 6;
    if (width >= 1024) return 5;
    return 4;
  };

  const previewBackdropFallback = useMemo(() => {
    // ✅ CRITERIO INTELIGENTE (COMO FAVORITOS/PENDIENTES)
    // Buscamos activamente la mejor imagen (con idioma ES/EN) usando todas las fuentes disponibles.

    // 1. Combinar todas las fuentes posibles de backdrops
    // ⚠️ IMPORTANTE: Solo usamos data.images si artworkInitialized es true
    // para evitar mostrar un backdrop que luego será reemplazado por uno mejor
    const allBackdrops = [
      ...(imagesState?.backdrops || []), // Cargadas dinámicamente
      ...(artworkInitialized && data?.images?.backdrops ? data.images.backdrops : []) // Solo si ya terminamos
    ];

    // 2. Si tenemos candidatos, aplicar el filtro inteligente INMEDIATAMENTE
    if (allBackdrops.length > 0) {
      const bestPath = pickBestBackdropForPreview(allBackdrops);
      if (bestPath) return bestPath;
    }

    // 3. ✨ SOLUCIÓN AL PARPADEO:
    // Si todavía estamos inicializando (cargando imágenes extra), NO mostramos el genérico todavía.
    // Preferimos esperar (skeleton) unos milisegundos a mostrar una imagen incorrecta y luego cambiarla.
    if (!artworkInitialized) return null;

    // 4. Fallback final: Si ya terminamos de cargar y no hubo nada mejor, usamos el genérico.
    return data?.backdrop_path || null;
  }, [imagesState?.backdrops, data?.images?.backdrops, data?.backdrop_path, artworkInitialized]);

  const artworkSelection = useMemo(() => {
    const rawList =
      activeImagesTab === "posters"
        ? imagesState?.posters
        : imagesState?.backdrops;

    const isPoster = activeImagesTab === "posters";
    const isBackdropTab = activeImagesTab === "backdrops";
    const isBackgroundTab = activeImagesTab === "background";
    const aspect = isPoster ? "aspect-[2/3]" : "aspect-[16/9]";
    const size = isPoster ? "w342" : "w780";

    const currentPosterActive =
      (selectedPosterPath ||
        basePosterPath ||
        data?.poster_path ||
        data?.profile_path) ??
      null;

    // Usar el mismo criterio que MainDashboard para el backdrop de preview
    const previewFallback = previewBackdropFallback;

    const currentPreviewActive = selectedPreviewBackdropPath || previewFallback;

    const currentBackgroundActive =
      (selectedBackgroundPath || baseBackdropPath || data?.backdrop_path) ??
      null;

    const activePath = isPoster
      ? currentPosterActive
      : isBackdropTab
        ? currentPreviewActive
        : currentBackgroundActive;

    const withPath = (rawList || []).filter((img) => !!img?.file_path);

    const normLang = (lang) =>
      String(lang || "")
        .trim()
        .toLowerCase();

    const isLangES = (lang) => lang === "es" || lang === "es-es";
    const isLangEN = (lang) => lang === "en" || lang === "en-us";

    const matchesLang = (img) => {
      const lang = normLang(img?.iso_639_1);
      if (!lang) return false;
      return (langES && isLangES(lang)) || (langEN && isLangEN(lang));
    };

    const filtered = withPath.filter((img) => {
      const fp = img?.file_path;
      // Siempre incluir la imagen activa
      if (fp === activePath) return true;

      if (imagesResFilter !== "all") {
        const b = imgResBucket(img);
        const target = imagesResFilter === "2k" ? "2k" : imagesResFilter;
        if (b !== target) return false;
      }

      if (isBackgroundTab) {
        return !img?.iso_639_1;
      }

      if (isBackdropTab) {
        // Vista previa: backdrops CON idioma (ES o EN, independiente de filtros)
        const lang = normLang(img?.iso_639_1);
        return isLangES(lang) || isLangEN(lang);
      }

      // Posters: solo ES/EN según filtros activos
      return matchesLang(img);
    });

    const relaxed = (() => {
      if (!withPath.length) return [];
      if (isBackgroundTab) {
        const neutral = withPath.filter((img) => !img?.iso_639_1);
        return neutral.length ? neutral : withPath;
      }
      if (isBackdropTab) {
        // Vista previa: priorizar backdrops con idioma
        const withLang = withPath.filter((img) => !!img?.iso_639_1);
        return withLang.length ? withLang : withPath;
      }
      if (isPoster) {
        const neutral = withPath.filter((img) => !img?.iso_639_1);
        return neutral.length ? neutral : withPath;
      }
      return withPath;
    })();

    const usable = filtered.length ? filtered : relaxed;

    // Ordenar para poner el backdrop activo primero en Vista previa
    const ordered = (() => {
      if (isBackdropTab && activePath && usable.length > 0) {
        const activeIdx = usable.findIndex((x) => x?.file_path === activePath);
        if (activeIdx > 0) {
          // Mover el activo al principio
          return [
            usable[activeIdx],
            ...usable.slice(0, activeIdx),
            ...usable.slice(activeIdx + 1),
          ];
        }
      }
      return usable;
    })();

    return {
      ordered,
      isPoster,
      isBackdropTab,
      isBackgroundTab,
      aspect,
      size,
      activePath,
    };
  }, [
    activeImagesTab,
    imagesState?.posters,
    imagesState?.backdrops,
    imagesResFilter,
    langES,
    langEN,
    selectedPosterPath,
    basePosterPath,
    data?.poster_path,
    data?.profile_path,
    previewBackdropFallback,
    selectedPreviewBackdropPath,
    selectedBackgroundPath,
    baseBackdropPath,
    data?.backdrop_path,
  ]);

  // Precarga las primeras N imágenes de la fila actual y solo entonces mostramos el carrusel
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Mientras TMDb images está cargando, NO mostramos el carrusel
    if (imagesLoading) {
      setArtworkRowReady(false);
      return;
    }

    const { ordered, size, isPoster } = artworkSelection;
    if (!ordered || ordered.length === 0) {
      setArtworkRowReady(true);
      return;
    }

    const limit = Math.max(1, Math.min(ordered.length, artworkPreloadCount));
    const urls = [];
    for (let i = 0; i < limit; i += 1) {
      const fp = ordered[i]?.file_path;
      if (!fp) continue;
      // Mantén tu precarga "rápida" (cache)
      preloadTmdb(fp, size);
      // Y además esperamos a que el navegador confirme carga
      urls.push(`https://image.tmdb.org/t/p/${size}${fp}`);
    }

    if (!urls.length) {
      setArtworkRowReady(true);
      return;
    }

    // Mostrar inmediatamente en cambios de tab (las imágenes ya están en cache del navegador)
    const isCached = urls.every((url) => {
      const img = new Image();
      img.src = url;
      return img.complete;
    });

    if (isCached) {
      setArtworkRowReady(true);
      return;
    }

    let cancelled = false;
    setArtworkRowReady(false);

    let done = 0;
    const finishOne = () => {
      done += 1;
      if (!cancelled && done >= urls.length) setArtworkRowReady(true);
    };

    for (const url of urls) {
      const img = new Image();
      img.decoding = "async";
      try {
        img.fetchPriority = "high";
      } catch { }
      img.onload = finishOne;
      img.onerror = finishOne; // si una falla, no bloqueamos toda la fila
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [imagesLoading, artworkSelection, artworkPreloadCount]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateCount = () => {
      const { isPoster } = artworkSelection;
      const count = getArtworkSlidesPerView(window.innerWidth, isPoster);
      setArtworkPreloadCount(count);
    };

    updateCount();
    window.addEventListener("resize", updateCount);
    return () => window.removeEventListener("resize", updateCount);
  }, [artworkSelection]);

  useLayoutEffect(() => {
    setPosterResolved(false);
    setPosterLowLoaded(false);
    setPosterHighLoaded(false);
    setPosterImgError(false);
    setArtworkInitialized(false);

    const initialPoster =
      (typeof window !== "undefined"
        ? window.localStorage.getItem(posterStorageKey)
        : null) ||
      data?.poster_path ||
      data?.profile_path ||
      null;

    const initialBackdrop =
      (typeof window !== "undefined"
        ? window.localStorage.getItem(backgroundStorageKey)
        : null) ||
      data?.backdrop_path ||
      null;

    setBaseBackdropPath(initialBackdrop);
    setBasePosterPath(initialPoster);
    // ✅ NO activar posterResolved hasta que initArtwork termine
    // setPosterResolved(!!initialPoster);

    setImagesState({
      posters: data.poster_path
        ? [{ file_path: data.poster_path, from: "main" }]
        : [],
      backdrops: [], // ✅ NO inicializar con data.backdrop_path - esperar a initArtwork
    });
    setImagesLoading(false);
    setImagesError("");
    setActiveImagesTab("posters");

    setSelectedPosterPath(null);
    setSelectedPreviewBackdropPath(null);
    setSelectedBackgroundPath(null);

    // ✅ NO resetear posterViewMode/posterLayoutMode - respetar la preferencia global
    // Ya se inicializan correctamente desde localStorage en el useState inicial

    setActiveTab("details");
    setActiveSection(null);

    if (typeof window !== "undefined") {
      try {
        const savedPoster = window.localStorage.getItem(posterStorageKey);
        const savedPreviewBackdrop = window.localStorage.getItem(
          previewBackdropStorageKey,
        );
        const savedBackground =
          window.localStorage.getItem(backgroundStorageKey);

        if (savedPoster) setSelectedPosterPath(savedPoster);
        if (savedPreviewBackdrop)
          setSelectedPreviewBackdropPath(savedPreviewBackdrop);
        if (savedBackground) setSelectedBackgroundPath(savedBackground);
      } catch {
        // ignore
      }
    }
    // ✅ NO activar artworkInitialized aquí - esperar a que initArtwork termine
    // setArtworkInitialized(true);
  }, [
    id,
    endpointType,
    data?.poster_path,
    data?.backdrop_path,
    data?.profile_path,
    posterStorageKey,
    backgroundStorageKey,
    previewBackdropStorageKey,
  ]);

  useEffect(() => {
    let cancelled = false;

    const initArtwork = async () => {
      setArtworkInitialized(false);

      let poster = data.poster_path || data.profile_path || null;
      let backdrop = data.backdrop_path || null;

      if (data?.images) {
        const bestPoster = pickBestImage(data.images.posters || []);
        if (bestPoster?.file_path) poster = bestPoster.file_path;

        setImagesState((prev) => ({
          posters: mergeUniqueImages(prev.posters, data.images.posters || []),
          backdrops: mergeUniqueImages(
            prev.backdrops,
            data.images.backdrops || [],
          ),
        }));
      }

      if (endpointType === "tv" && TMDB_API_KEY) {
        try {
          setImagesLoading(true);
          setImagesError("");

          const { posters, backdrops } = await fetchTVImages({
            showId: id,
            apiKey: TMDB_API_KEY,
          });
          const bestPoster = pickBestPosterTV(posters);
          const bestBackdropForBackground =
            pickBestBackdropTVNeutralFirst(backdrops);
          const bestBackdropForPreviewCalc = pickBestBackdropForPreview(backdrops);

          const bestPosterPath = asTmdbPath(bestPoster);
          const bestBackdropPath = asTmdbPath(bestBackdropForBackground);
          const bestPreviewPath = asTmdbPath(bestBackdropForPreviewCalc);

          // ✅ Precargar backdrop de vista previa PRIMERO (si estamos en modo preview)
          const savedGlobalMode = typeof window !== "undefined"
            ? window.localStorage.getItem("showverse:global:posterViewMode")
            : null;

          if (savedGlobalMode === "preview" && bestPreviewPath) {
            await preloadTmdb(bestPreviewPath, "w780");
          }

          if (bestPosterPath) await preloadTmdb(bestPosterPath, "w780");

          if (!cancelled) {
            if (bestPosterPath) poster = bestPosterPath;
            if (bestBackdropPath) backdrop = bestBackdropPath;

            setImagesState((prev) => ({
              posters: mergeUniqueImages(prev.posters, posters),
              backdrops: mergeUniqueImages(prev.backdrops, backdrops),
            }));
          }
        } catch (e) {
          if (!cancelled) console.error("Error cargando imágenes TV:", e);
        } finally {
          if (!cancelled) setImagesLoading(false);
        }
      }

      if (endpointType === "movie" && !data?.images && TMDB_API_KEY) {
        try {
          setImagesLoading(true);
          setImagesError("");

          const url = `https://api.themoviedb.org/3/movie/${id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null,es`;
          const res = await fetch(url);
          const json = await res.json();
          if (!res.ok)
            throw new Error(json?.status_message || "Error al cargar imágenes");

          const posters = json.posters || [];
          const backdrops = json.backdrops || [];

          const bestPoster = pickBestImage(posters);
          const bestBackdropForPreviewCalc = pickBestBackdropForPreview(backdrops);

          // ✅ Precargar backdrop de vista previa PRIMERO (si estamos en modo preview)
          const savedGlobalMode = typeof window !== "undefined"
            ? window.localStorage.getItem("showverse:global:posterViewMode")
            : null;

          if (savedGlobalMode === "preview" && bestBackdropForPreviewCalc) {
            await preloadTmdb(bestBackdropForPreviewCalc, "w780");
          }

          if (bestPoster?.file_path) {
            await preloadTmdb(bestPoster.file_path, "w780");
            poster = bestPoster.file_path;
          }

          if (!cancelled) {
            setImagesState((prev) => ({
              posters: mergeUniqueImages(prev.posters, posters),
              backdrops: mergeUniqueImages(prev.backdrops, backdrops),
            }));
          }
        } catch (err) {
          if (!cancelled) setImagesError(err.message);
        } finally {
          if (!cancelled) setImagesLoading(false);
        }
      }

      if (!cancelled) {
        // NO sobrescribas si ya había un póster base (evita el “swap” al terminar de cargar)
        if (poster) {
          setBasePosterPath((prev) => prev || asTmdbPath(poster));
        }
        if (backdrop) {
          setBaseBackdropPath((prev) => prev || asTmdbPath(backdrop));
        }

        setPosterResolved(true);
        setArtworkInitialized(true);
      }
    };

    initArtwork();
    return () => {
      cancelled = true;
    };
  }, [
    id,
    endpointType,
    data?.images,
    data?.poster_path,
    data?.backdrop_path,
    data?.profile_path,
  ]);

  const basePosterDisplayPath =
    asTmdbPath(selectedPosterPath) ||
    asTmdbPath(basePosterPath) ||
    asTmdbPath(data?.poster_path || data?.profile_path) ||
    null;

  const previewBackdropPath =
    (artworkInitialized ? asTmdbPath(selectedPreviewBackdropPath) : null) ||
    asTmdbPath(previewBackdropFallback) ||
    null;

  const displayPosterPath =
    posterViewMode === "preview"
      ? previewBackdropPath // ✅ Si estamos en preview, solo mostrar backdrop (o null si no está listo)
      : basePosterDisplayPath;

  const isBackdropPath = useCallback(
    (path) => {
      if (!path) return false;
      const backdrops = imagesState?.backdrops || [];
      return backdrops.some((b) => b?.file_path === path);
    },
    [imagesState?.backdrops],
  );

  // ✅ Detectar si la portada actual se muestra como backdrop (horizontal)
  // Nota: usamos posterLayoutMode para poder redimensionar la tarjeta ANTES
  // de cambiar (y cargar) la imagen.
  const isBackdropPoster = useMemo(
    () => posterLayoutMode === "preview" || isBackdropPath(displayPosterPath),
    [posterLayoutMode, displayPosterPath, isBackdropPath],
  );

  const displayBackdropPath =
    asTmdbPath(selectedBackgroundPath) ||
    asTmdbPath(baseBackdropPath) ||
    asTmdbPath(data?.backdrop_path) ||
    null;

  const mobileNeutralPosterPath = useMemo(() => {
    const best =
      pickBestNeutralPosterByResVotes(imagesState?.posters || [])?.file_path ||
      null;
    if (best) return best;
    // fallback: primera sin idioma si no hay metadata de tamaños/votos
    return (
      (imagesState?.posters || []).find((p) => p?.file_path && !p?.iso_639_1)
        ?.file_path || null
    );
  }, [imagesState?.posters]);

  const heroBackgroundPath = (() => {
    if (!useBackdrop || !artworkInitialized) return null;

    // desktop: tu lógica actual
    const desktop = displayBackdropPath;

    // móvil: si NO hay override, preferimos poster sin idioma
    const mobile =
      selectedBackgroundPath || // si el usuario eligió un fondo manual, respétalo
      mobileNeutralPosterPath ||
      basePosterPath ||
      data.poster_path ||
      data.profile_path ||
      desktop ||
      null;

    return isMobileViewport ? mobile : desktop;
  })();

  // ====== Account States ======
  useEffect(() => {
    let cancel = false;

    const load = async () => {
      // si no hay sesión, no hay nada que cargar para “tu puntuación”
      if (!session || !account?.id) {
        setAccountStatesLoading(false);
        return;
      }

      setAccountStatesLoading(true);

      try {
        const st = await getMediaAccountStates(type, id, session);
        if (cancel) return;

        setFavorite(!!st.favorite);
        setWatchlist(!!st.watchlist);

        const ratedValue =
          st?.rated && typeof st.rated.value === "number"
            ? st.rated.value
            : null;
        setUserRating(ratedValue);
      } catch {
        // si falla, al menos dejamos de “cargar” para no bloquear la UI
      } finally {
        if (!cancel) setAccountStatesLoading(false);
      }
    };

    load();
    return () => {
      cancel = true;
    };
  }, [type, id, session, account?.id]);

  const toggleFavorite = async () => {
    if (requireLogin() || favLoading) return;
    try {
      setFavLoading(true);
      const next = !favorite;
      setFavorite(next);
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId: id,
        favorite: next,
      });
    } catch {
      setFavorite((v) => !v);
    } finally {
      setFavLoading(false);
    }
  };

  const toggleWatchlist = async () => {
    if (requireLogin() || wlLoading) return;
    try {
      setWlLoading(true);
      const next = !watchlist;
      setWatchlist(next);
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type,
        mediaId: id,
        watchlist: next,
      });
    } catch {
      setWatchlist((v) => !v);
    } finally {
      setWlLoading(false);
    }
  };

  const sendTmdbRating = async (value, { skipSync = false } = {}) => {
    if (requireLogin() || ratingLoading || !TMDB_API_KEY) return;
    try {
      setRatingLoading(true);
      setRatingError("");
      setUserRating(value);

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=utf-8" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Error al guardar puntuación en TMDb");

      // ✅ sync opcional hacia Trakt (sin bucle)
      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(Math.round(value));
      }
    } catch (err) {
      setRatingError(err?.message || "Error");
    } finally {
      setRatingLoading(false);
    }
  };

  const clearTmdbRating = async ({ skipSync = false } = {}) => {
    if (requireLogin() || ratingLoading || userRating == null || !TMDB_API_KEY)
      return;
    try {
      setRatingLoading(true);
      setRatingError("");
      setUserRating(null);

      const url = `https://api.themoviedb.org/3/${endpointType}/${id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json;charset=utf-8" },
      });
      if (!res.ok) throw new Error("Error al borrar puntuación en TMDb");

      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(null);
      }
    } catch (err) {
      setRatingError(err?.message || "Error");
    } finally {
      setRatingLoading(false);
    }
  };

  const sendTraktRating = async (value) => {
    if (!trakt.connected) {
      window.location.href = "/api/trakt/auth/start";
      return;
    }
    // value Trakt: 1..10 entero
    await setTraktRatingSafe(value == null ? null : Math.round(value));

    // ✅ sync opcional hacia TMDb (sin bucle)
    if (syncTrakt && session && TMDB_API_KEY) {
      if (value == null) await clearTmdbRating({ skipSync: true });
      else await sendTmdbRating(value, { skipSync: true });
    }
  };

  const clearTraktRating = async () => {
    await sendTraktRating(null);
  };

  const traktType = endpointType === "tv" ? "show" : "movie";

  const [trakt, setTrakt] = useState({
    loading: false,
    connected: false,
    found: false,
    traktUrl: null,
    watched: false,
    plays: 0,
    lastWatchedAt: null,
    rating: null,
    inWatchlist: false,
    progress: null,
    history: [],
    error: "",
  });

  const [traktBusy, setTraktBusy] = useState(""); // 'watched' | 'watchlist' | 'history' | ''
  const [traktWatchedOpen, setTraktWatchedOpen] = useState(false);
  const [traktEpisodesOpen, setTraktEpisodesOpen] = useState(false);

  // ===== modal: cerrar limpiando estados transitorios =====
  const closeTraktEpisodesModal = useCallback(() => {
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey(""); // evita que quede bloqueado al reabrir
  }, []);
  // ✅ EPISODIOS VISTOS (solo TV)
  const [watchedBySeason, setWatchedBySeason] = useState({}); // { [seasonNumber]: [episodeNumber] }
  const [watchedBySeasonLoaded, setWatchedBySeasonLoaded] = useState(false); // ✅ NUEVO
  const [episodeBusyKey, setEpisodeBusyKey] = useState(""); // "S1E3" etc
  // ✅ NUEVO: historial de completados + rewatch "run"
  const [showPlays, setShowPlays] = useState([]); // fechas ISO (completados)
  const [rewatchStartAt, setRewatchStartAt] = useState(null); // ISO
  const [rewatchWatchedBySeason, setRewatchWatchedBySeason] = useState(null); // { [sn]: [en...] }

  // ✅ Badge del botón "visto" en series: % completado (sin especiales)
  const tvProgressBadge = useMemo(() => {
    if (endpointType !== "tv") return null;
    if (!trakt?.connected) return null;

    // ✅ clave: mientras no cargue watchedBySeason, NO mostramos nada
    if (!watchedBySeasonLoaded) return null;

    const seasonsList = Array.isArray(data?.seasons) ? data.seasons : [];
    const usable = seasonsList.filter(
      (s) => typeof s?.season_number === "number" && s.season_number > 0,
    );

    // si aún no hay temporadas válidas, tampoco mostramos nada
    if (usable.length === 0) return null;

    const totalEpisodes = usable.reduce(
      (acc, s) => acc + Math.max(0, Number(s?.episode_count || 0)),
      0,
    );
    if (totalEpisodes <= 0) return null;

    const watchedEpisodes = usable.reduce((acc, s) => {
      const sn = s.season_number;
      const arr = watchedBySeason?.[sn];
      return acc + (Array.isArray(arr) ? arr.length : 0);
    }, 0);

    const pct = Math.round((watchedEpisodes / totalEpisodes) * 100);
    const safePct = Math.min(100, Math.max(0, pct));
    if (safePct <= 0) return null;
    return `${safePct}%`;
  }, [
    endpointType,
    trakt?.connected,
    watchedBySeasonLoaded,
    data?.seasons,
    watchedBySeason,
  ]);

  // ✅ NUEVO: Sincronizar trakt.watched con watchedBySeason para series
  // Cuando hay episodios vistos, trakt.watched debe ser true
  useEffect(() => {
    if (endpointType !== "tv") return;
    if (!trakt?.connected) return;
    if (!watchedBySeasonLoaded) return;

    // Calcular si hay algún episodio visto
    const hasAnyWatchedEpisode = Object.values(watchedBySeason).some(
      (episodes) => Array.isArray(episodes) && episodes.length > 0,
    );

    // Actualizar trakt.watched si no coincide
    if (hasAnyWatchedEpisode !== trakt.watched) {
      setTrakt((prev) => ({
        ...prev,
        watched: hasAnyWatchedEpisode,
      }));
    }
  }, [
    endpointType,
    trakt?.connected,
    trakt.watched,
    watchedBySeasonLoaded,
    watchedBySeason,
  ]);

  const [traktStats, setTraktStats] = useState(null);
  const [traktStatsLoading, setTraktStatsLoading] = useState(false);
  const [traktStatsError, setTraktStatsError] = useState("");

  // ✅ Helper: cargar episodios vistos (TV) desde Trakt
  const loadTraktShowWatched = useCallback(async () => {
    if (type !== "tv") return;

    if (!trakt?.connected) {
      setWatchedBySeason({});
      setWatchedBySeasonLoaded(false);
      return;
    }

    try {
      const r = await traktGetShowWatched({ tmdbId: Number(id) });
      setWatchedBySeason(r?.watchedBySeason || {});
    } catch {
      setWatchedBySeason({});
    } finally {
      // ✅ NUEVO: ya tenemos un estado definitivo (aunque sea 0%)
      setWatchedBySeasonLoaded(true);
    }
  }, [type, id, trakt?.connected]);

  const [tScoreboard, setTScoreboard] = useState({
    loading: false,
    error: "",
    found: false,
    rating: null, // community rating (0..10)
    votes: null, // community votes
    stats: {
      watchers: null,
      plays: null,
      collectors: null, // lo usamos como "libraries"
      comments: null,
      lists: null,
      favorited: null,
    },
    external: {
      rtAudience: null, // 🔌 preparado (si lo devuelves)
      justwatchRank: null, // 🔌 preparado (si lo devuelves)
      justwatchDelta: null, // 🔌 preparado (si lo devuelves)
      justwatchCountry: "ES",
    },
  });

  const SHOW_BUSY_KEY = "SHOW";

  // =====================================================================
  // ✅ TRAKT COMMUNITY: Sentimientos / Comentarios / Temporadas / Listas
  // =====================================================================

  const [tSentiment, setTSentiment] = useState({
    loading: false,
    error: "",
    pros: [],
    cons: [],
    sourceCount: 0,
  });

  const [tCommentsTab, setTCommentsTab] = useState("likes30"); // likes30 | likesAll | recent
  const [tComments, setTComments] = useState({
    loading: false,
    error: "",
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
  });

  const [tSeasons, setTSeasons] = useState({
    loading: false,
    error: "",
    items: [],
  });

  const [tListsTab, setTListsTab] = useState("popular"); // popular | trending (lo mostramos como "Following")
  const [tLists, setTLists] = useState({
    loading: false,
    error: "",
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
  });

  // Reset al cambiar de título
  useEffect(() => {
    setTSentiment({
      loading: false,
      error: "",
      pros: [],
      cons: [],
      sourceCount: 0,
    });
    setTComments({
      loading: false,
      error: "",
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    });
    setTCommentsTab("likes30");
    setTSeasons({ loading: false, error: "", items: [] });
    setTLists({
      loading: false,
      error: "",
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    });
    setTListsTab("popular");
  }, [id, traktType]);

  // 1) Sentimientos (derivados de comentarios top)
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setTSentiment((p) => ({ ...p, loading: true, error: "" }));
      try {
        const r = await traktGetComments({
          type: traktType, // 'movie' | 'show'
          tmdbId: id,
          sort: "likes",
          page: 1,
          limit: 50,
        });
        if (ignore) return;
        const items = Array.isArray(r?.items) ? r.items : [];
        const { pros, cons } = buildSentimentFromComments(items);
        setTSentiment({
          loading: false,
          error: "",
          pros,
          cons,
          sourceCount: items.length,
        });
      } catch (e) {
        if (!ignore)
          setTSentiment({
            loading: false,
            error: e?.message || "Error",
            pros: [],
            cons: [],
            sourceCount: 0,
          });
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, traktType]); // público: no depende de conexión

  // 2) Comentarios (tabs)
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setTComments((p) => ({ ...p, loading: true, error: "" }));

      try {
        const isLikes30 = tCommentsTab === "likes30";
        const sort = tCommentsTab === "recent" ? "newest" : "likes";

        // Para likes30: pedimos más y filtramos por fecha
        const reqLimit = isLikes30 ? 50 : 20;
        const page = isLikes30 ? 1 : tComments.page;

        const r = await traktGetComments({
          type: traktType,
          tmdbId: id,
          sort,
          page,
          limit: reqLimit,
        });

        if (ignore) return;

        let items = Array.isArray(r?.items) ? r.items : [];
        const total = Number(r?.pagination?.itemCount || 0);
        const hasMore = !!(
          r?.pagination?.pageCount &&
          r?.pagination?.page < r?.pagination?.pageCount
        );

        if (isLikes30) {
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
          items = items.filter((c) => {
            const t = new Date(c?.created_at || 0).getTime();
            return Number.isFinite(t) && t >= cutoff;
          });
          // Mantén máximo 20 para UI (puedes subirlo si quieres)
          items = items.slice(0, 20);
        }

        setTComments((p) => ({
          ...p,
          loading: false,
          error: "",
          items:
            p.page > 1 && !isLikes30 ? [...(p.items || []), ...items] : items,
          hasMore: !isLikes30 ? hasMore : false,
          total,
        }));
      } catch (e) {
        if (!ignore)
          setTComments((p) => ({
            ...p,
            loading: false,
            error: e?.message || "Error",
          }));
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, traktType, tCommentsTab, tComments.page]);

  // si cambia tab => resetea paginación
  useEffect(() => {
    setTComments((p) => ({
      ...p,
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    }));
  }, [tCommentsTab]);

  // 3) Temporadas (solo show)
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (type !== "tv") return;
      setTSeasons((p) => ({ ...p, loading: true, error: "" }));
      try {
        const r = await traktGetShowSeasons({ tmdbId: id, extended: "full" });
        if (ignore) return;
        setTSeasons({
          loading: false,
          error: "",
          items: Array.isArray(r?.items) ? r.items : [],
        });
      } catch (e) {
        if (!ignore)
          setTSeasons({
            loading: false,
            error: e?.message || "Error",
            items: [],
          });
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [id, type]);

  // 4) Listas (popular / trending)
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setTLists((p) => ({ ...p, loading: true, error: "" }));
      try {
        const r = await traktGetLists({
          type: traktType,
          tmdbId: id,
          tab: tListsTab,
          page: tLists.page,
          limit: 6,
        });
        if (ignore) return;

        const items = Array.isArray(r?.items) ? r.items : [];
        const total = Number(r?.pagination?.itemCount || 0);
        const hasMore = !!(
          r?.pagination?.pageCount &&
          r?.pagination?.page < r?.pagination?.pageCount
        );

        setTLists((p) => ({
          ...p,
          loading: false,
          error: "",
          items: p.page > 1 ? [...(p.items || []), ...items] : items,
          hasMore,
          total,
        }));
      } catch (e) {
        if (!ignore)
          setTLists((p) => ({
            ...p,
            loading: false,
            error: e?.message || "Error",
          }));
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, traktType, tListsTab, tLists.page]);

  useEffect(() => {
    setTLists((p) => ({ ...p, items: [], page: 1, hasMore: false, total: 0 }));
  }, [tListsTab]);

  const [syncTrakt, setSyncTrakt] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("showverse:trakt:sync") === "1";
      setSyncTrakt(v);
    } catch { }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "showverse:trakt:sync",
        syncTrakt ? "1" : "0",
      );
    } catch { }
  }, [syncTrakt]);

  const reloadTraktStatus = async () => {
    setTrakt((p) => ({ ...p, loading: true, error: "" }));
    const json = await traktGetItemStatus({ type: traktType, tmdbId: id });

    setTrakt({
      loading: false,
      connected: !!json.connected,
      found: !!json.found,
      traktUrl: json.traktUrl || null,
      watched: !!json.watched,
      plays: Number(json.plays || 0),
      lastWatchedAt: json.lastWatchedAt || null,
      rating: typeof json.rating === "number" ? json.rating : null, // si no usas rating, pon null
      inWatchlist: !!json.inWatchlist,
      progress: json.progress || null,
      history: Array.isArray(json.history) ? json.history : [],
      error: "",
    });
  };

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setTScoreboard((p) => ({ ...p, loading: true, error: "" }));
      try {
        const r = await traktGetScoreboard({ type: traktType, tmdbId: id });
        if (ignore) return;

        const rating =
          typeof r?.community?.rating === "number" ? r.community.rating : null;
        const votes =
          typeof r?.community?.votes === "number" ? r.community.votes : null;

        // stats (si vienen)
        const st = r?.stats || {};
        setTScoreboard({
          loading: false,
          error: "",
          found: !!r?.found,
          rating,
          votes,
          stats: {
            watchers: typeof st?.watchers === "number" ? st.watchers : null,
            plays: typeof st?.plays === "number" ? st.plays : null,
            collectors:
              typeof st?.collectors === "number" ? st.collectors : null,
            comments: typeof st?.comments === "number" ? st.comments : null,
            lists: typeof st?.lists === "number" ? st.lists : null,
            favorited: typeof st?.favorited === "number" ? st.favorited : null,
          },
          external: {
            rtAudience: r?.external?.rtAudience ?? null,
            justwatchRank: r?.external?.justwatchRank ?? null,
            justwatchDelta: r?.external?.justwatchDelta ?? null,
            justwatchCountry: r?.external?.justwatchCountry ?? "ES",
          },
        });
      } catch (e) {
        if (!ignore) {
          setTScoreboard((p) => ({
            ...p,
            loading: false,
            found: false,
            error: e?.message || "Error cargando scoreboard",
          }));
        }
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, traktType]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        setTraktStatsLoading(true);
        setTraktStatsError("");

        const res = await traktGetStats({ type: traktType, tmdbId: id });
        if (cancelled) return;

        // res puede venir como { stats } o directamente stats según lo implementes:
        setTraktStats(res?.stats ?? res ?? null);
      } catch (e) {
        if (cancelled) return;
        setTraktStatsError(
          e?.message || "No se pudieron cargar estadísticas de Trakt",
        );
        setTraktStats(null);
      } finally {
        if (!cancelled) setTraktStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, traktType]);

  useEffect(() => {
    setTraktWatchedOpen(false);
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey("");
    setTraktBusy("");

    // Evitar que salga 0% al cambiar de serie antes de cargar
    setWatchedBySeason({});
    setWatchedBySeasonLoaded(false);
  }, [id, endpointType]);

  useEffect(() => {
    if (!traktWatchedOpen) return;
    reloadTraktStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traktWatchedOpen]);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setTrakt((p) => ({ ...p, loading: true, error: "" }));
      try {
        const json = await traktGetItemStatus({ type: traktType, tmdbId: id });
        if (ignore) return;

        setTrakt({
          loading: false,
          connected: !!json.connected,
          found: !!json.found,
          traktUrl: json.traktUrl || null,
          watched: !!json.watched,
          plays: Number(json.plays || 0),
          lastWatchedAt: json.lastWatchedAt || null,
          rating: typeof json.rating === "number" ? json.rating : null, // si no usas rating, pon null
          inWatchlist: !!json.inWatchlist,
          progress: json.progress || null,
          history: Array.isArray(json.history) ? json.history : [],
          error: "",
        });
      } catch (e) {
        if (ignore) return;
        setTrakt((p) => ({
          ...p,
          loading: false,
          error: e?.message || "Error cargando Trakt",
        }));
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [id, traktType]);

  useEffect(() => {
    loadTraktShowWatched();
  }, [loadTraktShowWatched]);

  const loadTraktShowPlays = useCallback(
    async (startAtIso = null) => {
      if (type !== "tv") return;
      if (!trakt?.connected) {
        setShowPlays([]);
        setRewatchWatchedBySeason(null);
        setRewatchHistoryByEpisode({});
        return;
      }

      try {
        const r = await traktGetShowPlays({
          tmdbId: id,
          startAt: startAtIso || undefined,
        });

        setShowPlays(
          Array.isArray(r?.showPlays)
            ? r.showPlays
            : Array.isArray(r?.plays)
              ? r.plays
              : [],
        );

        if (startAtIso) {
          setRewatchWatchedBySeason(r?.watchedBySeasonSince || {});
          // ✅ NUEVO: necesario para poder “desmarcar” en rewatch
          setRewatchHistoryByEpisode(r?.historyIdsByEpisodeSince || {});
        } else {
          setRewatchWatchedBySeason(null);
          setRewatchHistoryByEpisode({});
        }
      } catch (e) {
        setShowPlays([]);
        if (startAtIso) {
          setRewatchWatchedBySeason({});
          setRewatchHistoryByEpisode({});
        }
      }
    },
    [id, type, trakt?.connected],
  );

  // ✅ Refrescar episodios vistos al ABRIR el modal (evita que se quede en 0 o desincronizado)
  useEffect(() => {
    let ignore = false;

    const refreshOnOpen = async () => {
      if (!traktEpisodesOpen) return;
      if (type !== "tv") return;
      if (!trakt?.connected) return;

      try {
        await loadTraktShowWatched();
        if (ignore) return;

        await loadTraktShowPlays(rewatchStartAt || null);
      } catch {
        // no machacamos UI si falla
      }
    };

    refreshOnOpen();
    return () => {
      ignore = true;
    };
  }, [
    traktEpisodesOpen,
    type,
    trakt?.connected,
    rewatchStartAt,
    loadTraktShowWatched,
    loadTraktShowPlays,
  ]);

  const toggleTraktWatched = async () => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("watched");
    try {
      const next = !trakt.watched;
      await traktSetWatched({ type: traktType, tmdbId: id, watched: next });
      setTrakt((p) => ({
        ...p,
        watched: next,
        lastWatchedAt: next ? new Date().toISOString() : null,
        plays: next ? Math.max(1, p.plays || 0) : 0,
      }));
    } finally {
      setTraktBusy("");
    }
  };

  const handleTraktAddPlay = async (yyyyMmDd) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("history");
    try {
      await traktAddWatchPlay({
        type: traktType,
        tmdbId: id,
        watchedAt: yyyyMmDd,
      });
      await reloadTraktStatus();
    } finally {
      setTraktBusy("");
    }
  };

  const handleTraktUpdatePlay = async (historyId, yyyyMmDd) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("history");
    try {
      await traktUpdateWatchPlay({
        type: traktType,
        tmdbId: id,
        historyId,
        watchedAt: yyyyMmDd,
      });
      await reloadTraktStatus();
    } finally {
      setTraktBusy("");
    }
  };

  const handleTraktRemovePlay = async (historyId) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("history");
    try {
      await traktRemoveWatchPlay({ historyId });
      await reloadTraktStatus();
    } finally {
      setTraktBusy("");
    }
  };

  const setTraktRatingSafe = async (valueOrNull) => {
    if (!trakt.connected || traktBusy) return;
    setTraktBusy("rating");
    try {
      await traktSetRating({
        type: traktType, // 'movie' | 'show'
        ids: { tmdb: Number(id) }, // lo que tu API route espera
        tmdbId: Number(id),
        rating: valueOrNull, // puede ser number o null
      });
      setTrakt((p) => ({
        ...p,
        rating: valueOrNull == null ? null : Math.round(valueOrNull),
      }));
    } finally {
      setTraktBusy("");
    }
  };

  const toggleEpisodeWatched = async (seasonNumber, episodeNumber) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    const key = `S${seasonNumber}E${episodeNumber}`;
    setEpisodeBusyKey(key);

    const currentlyWatched =
      !!watchedBySeason?.[seasonNumber]?.includes(episodeNumber);
    const next = !currentlyWatched;

    // ✅ optimista
    setWatchedBySeason((prev) => {
      const cur = new Set(prev?.[seasonNumber] || []);
      if (next) cur.add(episodeNumber);
      else cur.delete(episodeNumber);
      return { ...prev, [seasonNumber]: Array.from(cur).sort((a, b) => a - b) };
    });

    try {
      const r = await traktSetEpisodeWatched({
        tmdbId: id,
        season: seasonNumber,
        episode: episodeNumber,
        watched: next,
        watchedAt: null,
      });

      // ✅ Si el endpoint ya devuelve watchedBySeason (con el fix del backend), úsalo
      if (r?.watchedBySeason) {
        setWatchedBySeason(r.watchedBySeason);
      } else {
        // ✅ Fallback robusto: refetch del estado real
        const fresh = await traktGetShowWatched({ tmdbId: id });
        setWatchedBySeason(fresh?.watchedBySeason || {});
      }
    } catch {
      // rollback si falla
      setWatchedBySeason((prev) => {
        const cur = new Set(prev?.[seasonNumber] || []);
        if (!next) cur.add(episodeNumber);
        else cur.delete(episodeNumber);
        return {
          ...prev,
          [seasonNumber]: Array.from(cur).sort((a, b) => a - b),
        };
      });
    } finally {
      setEpisodeBusyKey("");
    }
  };

  const toggleEpisodeRewatch = useCallback(
    async (seasonNumber, episodeNumber) => {
      if (type !== "tv") return;
      if (!trakt?.connected) return;
      if (!rewatchStartAt) return;
      if (episodeBusyKey) return;

      const key = `S${seasonNumber}E${episodeNumber}`;
      setEpisodeBusyKey(key);

      const currentlyWatched =
        !!rewatchWatchedBySeason?.[seasonNumber]?.includes(episodeNumber);
      const next = !currentlyWatched;

      // optimista
      setRewatchWatchedBySeason((prev) => {
        const p = prev && typeof prev === "object" ? prev : {};
        const cur = new Set(p?.[seasonNumber] || []);
        if (next) cur.add(episodeNumber);
        else cur.delete(episodeNumber);
        return { ...p, [seasonNumber]: Array.from(cur).sort((a, b) => a - b) };
      });

      try {
        if (next) {
          // ✅ añadir play (rewatch)
          // IMPORTANTE: tu endpoint debería devolver historyId
          const r = await traktAddEpisodePlay({
            tmdbId: id,
            season: seasonNumber,
            episode: episodeNumber,
            watchedAt: new Date().toISOString(),
            startedAt: rewatchStartAt,
          });
          const hid = r?.historyId || r?.id || null;
          if (hid)
            setRewatchHistoryByEpisode((p) => ({ ...(p || {}), [key]: hid }));
        } else {
          // ✅ quitar play (rewatch)
          const hid = rewatchHistoryByEpisode?.[key];
          if (!hid) {
            // si no tienes historyId, sin backend extra no puedes desmarcar de forma fiable
            throw new Error(
              "No hay historyId para desmarcar este episodio en rewatch.",
            );
          }
          await traktRemoveWatchPlay({ historyId: hid });
          setRewatchHistoryByEpisode((p) => {
            const nextMap = { ...(p || {}) };
            delete nextMap[key];
            return nextMap;
          });
        }

        // refresca run activo
        await loadTraktShowPlays(rewatchStartAt);

        // opcional: mantener global actualizado
        const fresh = await traktGetShowWatched({ tmdbId: id });
        setWatchedBySeason(fresh?.watchedBySeason || {});
      } catch (e) {
        // rollback
        setRewatchWatchedBySeason((prev) => {
          const p = prev && typeof prev === "object" ? prev : {};
          const cur = new Set(p?.[seasonNumber] || []);
          if (!next) cur.add(episodeNumber);
          else cur.delete(episodeNumber);
          return {
            ...p,
            [seasonNumber]: Array.from(cur).sort((a, b) => a - b),
          };
        });
      } finally {
        setEpisodeBusyKey("");
      }
    },
    [
      type,
      trakt?.connected,
      rewatchStartAt,
      episodeBusyKey,
      rewatchWatchedBySeason,
      rewatchHistoryByEpisode,
      id,
      loadTraktShowPlays,
    ],
  );

  const onToggleShowWatched = async (watchedAtOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    const tmdbIdNum = Number(id);
    if (!Number.isFinite(tmdbIdNum)) return;

    const seasonsList = Array.isArray(data?.seasons) ? data.seasons : [];
    const seasonNumbers = seasonsList
      .map((s) => s?.season_number)
      .filter((n) => typeof n === "number" && n > 0);

    if (seasonNumbers.length === 0) {
      console.warn(
        "[DetailsClient] No hay temporadas válidas para marcar la serie completa.",
      );
      return;
    }

    setEpisodeBusyKey(SHOW_BUSY_KEY);

    try {
      const res = await fetch("/api/trakt/history/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: tmdbIdNum,
          seasonNumbers,
          watchedAt: watchedAtOrNull, // ISO string (marcar) o null (desmarcar)
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json?.error || "Error marcando serie en Trakt");

      // ✅ Optimista: actualiza watchedBySeason según episode_count
      setWatchedBySeason(() => {
        if (!watchedAtOrNull) return {};
        const next = {};
        for (const s of seasonsList) {
          const sn = s?.season_number;
          const total = Number(s?.episode_count || 0);
          if (typeof sn === "number" && sn > 0 && total > 0) {
            next[sn] = Array.from({ length: total }, (_, i) => i + 1);
          }
        }
        return next;
      });

      // ✅ Refresca el estado real (por si Trakt devuelve algo distinto)
      await reloadTraktStatus();
      const fresh = await traktGetShowWatched({ tmdbId: tmdbIdNum });
      setWatchedBySeason(fresh?.watchedBySeason || {});
    } catch (e) {
      console.error("[DetailsClient] onToggleShowWatched error:", e);
    } finally {
      setEpisodeBusyKey("");
    }
  };

  const onAddShowPlay = async (watchedAtIsoOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    setEpisodeBusyKey(SHOW_BUSY_KEY);
    try {
      await traktAddShowPlay({ tmdbId: id, watchedAt: watchedAtIsoOrNull });
      await reloadTraktStatus();

      const fresh = await traktGetShowWatched({ tmdbId: id });
      setWatchedBySeason(fresh?.watchedBySeason || {});

      await loadTraktShowPlays(rewatchStartAt || null);
    } finally {
      setEpisodeBusyKey("");
    }
  };

  const onStartShowRewatch = async (startedAtIsoOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;

    const startIso = startedAtIsoOrNull || new Date().toISOString();
    setRewatchStartAt(startIso);

    // persist opcional
    try {
      window.localStorage.setItem(rewatchStorageKey, startIso);
    } catch { }

    await loadTraktShowPlays(startIso);
  };

  const onAddEpisodePlay = async (season, episode, watchedAtIso) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (!rewatchStartAt) return;
    if (episodeBusyKey) return;

    const key = `S${season}E${episode}`;
    setEpisodeBusyKey(key);

    try {
      await traktAddEpisodePlay({
        tmdbId: id,
        season,
        episode,
        watchedAt: watchedAtIso || new Date().toISOString(),
      });

      // refresca progreso del run + (de rebote) showPlays
      await loadTraktShowPlays(rewatchStartAt);

      // opcional: mantener watchedBySeason global coherente
      const fresh = await traktGetShowWatched({ tmdbId: id });
      setWatchedBySeason(fresh?.watchedBySeason || {});
    } finally {
      setEpisodeBusyKey("");
    }
  };

  const collectionId =
    typeof data?.belongs_to_collection?.id === "number"
      ? data.belongs_to_collection.id
      : null;

  const [collectionData, setCollectionData] = useState(null);
  const [collectionLoading, setCollectionLoading] = useState(false);

  useEffect(() => {
    if (!collectionId) {
      setCollectionData(null);
      setCollectionLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        setCollectionLoading(true);
        const res = await fetch(`/api/tmdb/collection?id=${collectionId}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        setCollectionData(res.ok && j?.collection ? j : null);
      } catch {
        if (alive) setCollectionData(null);
      } finally {
        if (alive) setCollectionLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [collectionId]);

  useEffect(() => {
    if (type !== "tv") {
      setRewatchStartAt(null);
      setRewatchWatchedBySeason(null);
      setShowPlays([]);
      setRewatchRuns([]);
      setActiveEpisodesView("global");
      setRewatchHistoryByEpisode({});
      return;
    }

    try {
      // 1) Cargar runs (nuevo formato)
      let runs = [];
      const rawRuns = window.localStorage.getItem(rewatchRunsStorageKey);
      if (rawRuns) {
        const parsed = JSON.parse(rawRuns);
        if (Array.isArray(parsed)) runs = parsed;
      }

      // 2) Compat: si no hay runs pero existe legacy rewatchStorageKey -> conviértelo
      if (!runs.length) {
        const legacy = window.localStorage.getItem(rewatchStorageKey);
        if (legacy) {
          runs = [
            {
              id: legacy,
              startedAt: legacy,
              label: `Rewatch · ${legacy.slice(0, 10)}`,
            },
          ];
          try {
            window.localStorage.setItem(
              rewatchRunsStorageKey,
              JSON.stringify(runs),
            );
          } catch { }
        }
      }

      setRewatchRuns(runs);

      // 3) Vista activa (global o run)
      const savedView =
        window.localStorage.getItem(episodesViewStorageKey) || "global";
      const validView =
        savedView === "global" || runs.some((r) => r?.id === savedView)
          ? savedView
          : "global";

      setActiveEpisodesView(validView);

      // 4) Ajusta rewatchStartAt según vista
      if (validView === "global") {
        setRewatchStartAt(null);
      } else {
        const run = runs.find((r) => r.id === validView);
        setRewatchStartAt(run?.startedAt || validView); // fallback
      }
    } catch {
      setRewatchRuns([]);
      setActiveEpisodesView("global");
      setRewatchStartAt(null);
      setRewatchHistoryByEpisode({});
    }
  }, [
    type,
    id,
    rewatchRunsStorageKey,
    rewatchStorageKey,
    episodesViewStorageKey,
  ]);

  // =====================================================
  // ✅ Extras: IMDb rating rápido + votos/premios en idle
  // =====================================================

  const [extras, setExtras] = useState({
    imdbRating: null,
    imdbVotes: null,
    awards: null,
    rtScore: null,
    mcScore: null,
  });
  const [imdbVotesLoading, setImdbVotesLoading] = useState(false);

  const [resolvedImdbId, setResolvedImdbId] = useState(null);

  useEffect(() => {
    let abort = false;

    const resolveImdbId = async () => {
      const direct = data?.imdb_id || data?.external_ids?.imdb_id || null;
      if (direct) return direct;

      try {
        const ext = await getExternalIds(endpointType, id);
        return ext?.imdb_id || null;
      } catch {
        return null;
      }
    };

    const run = async () => {
      try {
        // reset “suave” al cambiar de título
        setExtras({
          imdbRating: null,
          imdbVotes: null,
          awards: null,
          rtScore: null,
          mcScore: null,
        });
        setImdbVotesLoading(false);

        // ✅ NUEVO: resetea el imdbId resuelto para este título
        setResolvedImdbId(null);

        const imdbId = await resolveImdbId();

        // ✅ NUEVO: si el effect ya se canceló, salimos
        if (abort) return;

        // ✅ NUEVO: guarda el imdbId resuelto (o null) para usarlo en links/badges
        setResolvedImdbId(imdbId || null);

        // ✅ NUEVO: si no hay imdbId, no seguimos (no se puede pedir OMDb)
        if (!imdbId) return;

        // ✅ cache instantáneo
        const cached = readOmdbCache(imdbId);
        if (cached?.imdbRating != null) {
          setExtras((prev) => ({ ...prev, imdbRating: cached.imdbRating }));
        }
        if (cached?.imdbVotes != null) {
          setExtras((prev) => ({ ...prev, imdbVotes: cached.imdbVotes }));
        }
        if (cached?.awards) {
          setExtras((prev) => ({ ...prev, awards: cached.awards }));
        }
        if (cached?.rtScore != null) {
          setExtras((prev) => ({ ...prev, rtScore: cached.rtScore }));
        }
        if (cached?.mcScore != null) {
          setExtras((prev) => ({ ...prev, mcScore: cached.mcScore }));
        }

        // si el cache está fresco y ya hay rating/votos, no hace falta pedir nada
        if (
          cached?.fresh &&
          cached?.imdbRating != null &&
          cached?.imdbVotes != null
        )
          return;

        // ✅ pide OMDb (rating primero)
        const omdb = await fetchOmdbByImdb(imdbId);
        if (abort) return;

        const imdbRating =
          omdb?.imdbRating && omdb.imdbRating !== "N/A"
            ? Number(omdb.imdbRating)
            : null;

        const { rtScore, mcScore } = extractOmdbExtraScores(omdb);

        // ✅ pinta lo “rápido” cuanto antes (IMDb + RT + MC)
        setExtras((prev) => ({
          ...prev,
          imdbRating: Number.isFinite(imdbRating) ? imdbRating : null,
          rtScore,
          mcScore,
        }));

        writeOmdbCache(imdbId, {
          imdbRating: Number.isFinite(imdbRating) ? imdbRating : null,
          rtScore,
          mcScore,
        });

        // votos/premios en idle
        setImdbVotesLoading(true);
        runIdle(() => {
          if (abort) return;

          const votes =
            omdb?.imdbVotes && omdb.imdbVotes !== "N/A"
              ? Number(String(omdb.imdbVotes).replace(/,/g, ""))
              : null;

          const awards =
            typeof omdb?.Awards === "string" && omdb.Awards.trim()
              ? omdb.Awards.trim()
              : null;

          setExtras((prev) => ({
            ...prev,
            imdbVotes: Number.isFinite(votes) ? votes : null,
            awards,
          }));

          writeOmdbCache(imdbId, {
            imdbVotes: Number.isFinite(votes) ? votes : null,
            awards,
          });

          setImdbVotesLoading(false);
        });
      } catch {
        if (!abort) {
          setExtras({
            imdbRating: null,
            imdbVotes: null,
            awards: null,
            rtScore: null,
            mcScore: null,
          });
          setImdbVotesLoading(false);

          // ✅ NUEVO: también resetea el resolvedImdbId si hay error
          setResolvedImdbId(null);
        }
      }
    };

    run();
    return () => {
      abort = true;
    };
  }, [type, id, data?.imdb_id, data?.external_ids?.imdb_id, endpointType]);

  // Lógica unificada para puntuar en ambos sitios
  const handleUnifiedRate = async (value) => {
    // Si no está conectado a nada, redirigir a login (TMDb es la base)
    if (!session) {
      window.location.href = "/login";
      return;
    }

    // 1. Gestionar TMDb
    if (value === null) {
      await clearTmdbRating({ skipSync: true });
    } else {
      await sendTmdbRating(value, { skipSync: true });
    }

    // 2. Gestionar Trakt (si está conectado)
    if (trakt.connected) {
      // Trakt usa null para borrar, o número entero
      await sendTraktRating(value); // sendTraktRating ya maneja null internamente
    }
  };

  const persistRuns = useCallback(
    (nextRuns) => {
      try {
        window.localStorage.setItem(
          rewatchRunsStorageKey,
          JSON.stringify(nextRuns || []),
        );
      } catch { }
    },
    [rewatchRunsStorageKey],
  );

  const changeEpisodesView = useCallback(
    async (viewId) => {
      const v = viewId || "global";
      setActiveEpisodesView(v);
      try {
        window.localStorage.setItem(episodesViewStorageKey, v);
      } catch { }

      if (v === "global") {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null); // ✅ refresca a global
        return;
      }

      const run = (rewatchRuns || []).find((r) => r?.id === v);
      const startAt = run?.startedAt || v;

      setRewatchStartAt(startAt);
      await loadTraktShowPlays(startAt); // ✅ refrescaFRESCO al cambiar de run
    },
    [episodesViewStorageKey, rewatchRuns, loadTraktShowPlays],
  );

  const createRewatchRun = useCallback(
    async (startedAtIsoOrNull) => {
      const startedAt = startedAtIsoOrNull || new Date().toISOString();
      const run = {
        id: startedAt,
        startedAt,
        label: `Rewatch · ${startedAt.slice(0, 10)}`,
      };

      setRewatchRuns((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const next = [run, ...base.filter((r) => r?.id !== run.id)];
        persistRuns(next);
        return next;
      });

      setActiveEpisodesView(run.id);
      try {
        window.localStorage.setItem(episodesViewStorageKey, run.id);
      } catch { }
      setRewatchStartAt(run.startedAt);

      await loadTraktShowPlays(run.startedAt); // ✅ clave
    },
    [episodesViewStorageKey, persistRuns, loadTraktShowPlays],
  );

  const deleteRewatchRun = useCallback(
    async (runId) => {
      if (!runId) return;

      setRewatchRuns((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const next = base.filter((r) => r?.id !== runId);
        persistRuns(next);
        return next;
      });

      const wasActive = activeEpisodesView === runId;

      setActiveEpisodesView((prev) => {
        const nextView = prev === runId ? "global" : prev;
        try {
          window.localStorage.setItem(episodesViewStorageKey, nextView);
        } catch { }
        return nextView;
      });

      if (wasActive) {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null); // ✅ vuelve a global “de verdad”
      }
    },
    [
      activeEpisodesView,
      episodesViewStorageKey,
      persistRuns,
      loadTraktShowPlays,
    ],
  );

  // Calculamos una nota "visual" única (prioridad Trakt si existe, sino TMDb)
  const unifiedUserRating =
    trakt.connected && trakt.rating ? trakt.rating : userRating;

  // ====== Ratings Episodios (TV) ======
  const [ratings, setRatings] = useState(null);
  const [ratingsError, setRatingsError] = useState(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  useEffect(() => {
    let ignore = false;
    async function load() {
      if (type !== "tv") return;
      setRatingsLoading(true);
      try {
        const res = await fetch(`/api/tv/${id}/ratings?excludeSpecials=true`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        if (!ignore) setRatings(json);
      } catch (e) {
        if (!ignore) setRatingsError(e.message);
      } finally {
        if (!ignore) setRatingsLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [id, type]);

  // ====== Handlers Artwork ======
  const [posterToggleBusy, setPosterToggleBusy] = useState(false);

  const handleSelectPoster = (filePath) => {
    setPosterViewMode("poster");
    setPosterLayoutMode("poster");
    setSelectedPosterPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(posterStorageKey, filePath)
        : window.localStorage.removeItem(posterStorageKey);
    }
    saveArtworkOverride({ type: endpointType, id, kind: "poster", filePath });
  };

  const handleSelectPreviewBackdrop = (filePath) => {
    setSelectedPreviewBackdropPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(previewBackdropStorageKey, filePath)
        : window.localStorage.removeItem(previewBackdropStorageKey);
    }
    saveArtworkOverride({ type: endpointType, id, kind: "backdrop", filePath });
  };

  const handleSelectBackground = (filePath) => {
    // Guardar la imagen anterior para el fade
    setPrevBackgroundPath(
      selectedBackgroundPath || baseBackdropPath || data?.backdrop_path,
    );
    setIsTransitioning(true);

    setSelectedBackgroundPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(backgroundStorageKey, filePath)
        : window.localStorage.removeItem(backgroundStorageKey);
    }
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "background",
      filePath,
    });

    // Terminar transición después de un breve delay
    setTimeout(() => {
      setIsTransitioning(false);
      setPrevBackgroundPath(null);
    }, 600);
  };

  const handleResetArtwork = () => {
    setSelectedPosterPath(null);
    setSelectedPreviewBackdropPath(null);
    setSelectedBackgroundPath(null);
    setPosterViewMode("poster");
    setPosterLayoutMode("poster");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(posterStorageKey);
      window.localStorage.removeItem(previewBackdropStorageKey);
      window.localStorage.removeItem(backgroundStorageKey);
    }
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "poster",
      filePath: null,
    });
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "backdrop",
      filePath: null,
    });
    saveArtworkOverride({
      type: endpointType,
      id,
      kind: "background",
      filePath: null,
    });
  };

  const handleCyclePoster = useCallback(async () => {
    // ✅ Alternar entre poster actual y backdrop de vista previa (sin sobrescribir)
    const posterPath =
      asTmdbPath(selectedPosterPath) ||
      asTmdbPath(basePosterPath) ||
      asTmdbPath(data?.poster_path || data?.profile_path) ||
      null;

    const previewPath =
      asTmdbPath(selectedPreviewBackdropPath) ||
      asTmdbPath(previewBackdropFallback) ||
      null;

    if (!posterPath || !previewPath) return;

    // ✅ Determinar el siguiente modo basándose en el modo SOLICITADO.
    // Esto permite clicks rápidos seguidos incluso si todavía no hemos cambiado
    // posterViewMode (por ejemplo, mientras el layout se redimensiona).
    const currentMode = posterRequestedModeRef.current || posterViewMode;
    const nextMode = currentMode === "preview" ? "poster" : "preview";
    const targetPath = nextMode === "preview" ? previewPath : posterPath;

    // ✅ Incrementar secuencia ANTES de iniciar la transición
    const seq = (posterToggleSeqRef.current += 1);
    posterRequestedModeRef.current = nextMode;
    setPosterToggleBusy(true);

    const abortIfStale = () =>
      posterToggleSeqRef.current !== seq || posterRequestedModeRef.current !== nextMode;

    const safeFinish = () => {
      if (posterToggleSeqRef.current === seq) {
        // Pequeño delay para evitar parpadeos de estado busy
        setTimeout(() => {
          if (posterToggleSeqRef.current === seq) setPosterToggleBusy(false);
        }, 150);
      }
    };

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const waitFrames = () =>
      new Promise((resolve) => {
        if (typeof requestAnimationFrame !== "function") return resolve();
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

    // ✅ 1) Si vamos a PREVIEW (backdrop), primero forzamos el layout (ratio/ancho)
    // y esperamos a que la tarjeta se redimensione antes de cambiar la imagen.
    if (nextMode === "preview") {
      setPosterLayoutMode("preview");
      await waitFrames();
      // ✅ Esperar a la MITAD de la transición CSS (250ms de 500ms)
      // para que el aspect-ratio cambie primero
      await wait(250);
      if (abortIfStale()) return;
    }

    // ✅ Verificar si la imagen ya está en caché (instantáneo)
    const checkCached = () => {
      const testImg = new Image();
      testImg.src = `https://image.tmdb.org/t/p/w780${targetPath}`;
      return testImg.complete && testImg.naturalWidth > 0;
    };

    const applyMode = () => {
      if (abortIfStale()) return;

      // ✅ Cambiar la imagen DESPUÉS de que el layout haya empezado a cambiar
      setPosterViewMode(nextMode);

      // ✅ Si volvemos a POSTER, reducimos el layout DESPUÉS del swap
      if (nextMode === "poster") {
        // ✅ Esperar a la mitad de la transición antes de cambiar el layout
        setTimeout(() => {
          if (abortIfStale()) return;
          setPosterLayoutMode("poster");
        }, 250);
      }

      safeFinish();
    };

    // ✅ Si ya está en caché, cambiar sin precarga adicional
    if (checkCached()) {
      applyMode();
      return;
    }

    // ✅ Precargar la imagen con timeout (evita esperas eternas)
    await new Promise((resolve) => {
      const img = new Image();
      const timeout = setTimeout(() => {
        resolve(false); // timeout: continuar de todas formas
      }, 400); // ✅ Timeout más corto ya que esperamos antes

      img.onload = () => {
        clearTimeout(timeout);
        resolve(true);
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
      img.src = `https://image.tmdb.org/t/p/w780${targetPath}`;
    });

    applyMode();
  }, [
    selectedPosterPath,
    basePosterPath,
    data?.poster_path,
    data?.profile_path,
    selectedPreviewBackdropPath,
    previewBackdropFallback,
    posterViewMode,
    globalViewModeStorageKey,
  ]);

  // ✅ Persistir el modo de vista globalmente y sincronizar layoutMode
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(globalViewModeStorageKey, posterViewMode);
      // ✅ Sincronizar layoutMode cuando posterViewMode cambie (excepto durante transiciones)
      // Esto asegura que ambos estados estén alineados después de navegaciones
      if (!posterToggleBusy) {
        setPosterLayoutMode(posterViewMode);
      }
    } catch { }
  }, [posterViewMode, globalViewModeStorageKey, posterToggleBusy]);

  const handleCopyImageUrl = async (filePath) => {
    const url = buildOriginalImageUrl(filePath);
    try {
      navigator?.clipboard?.writeText
        ? await navigator.clipboard.writeText(url)
        : window.prompt("Copiar URL:", url);
    } catch {
      window.prompt("Copiar URL:", url);
    }
  };

  // Scroll Nav Logic
  const updateImagesNav = () => {
    const el = imagesScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth + 1;
    setCanPrevImages(hasOverflow && scrollLeft > 0);
    setCanNextImages(hasOverflow && scrollLeft + clientWidth < scrollWidth - 1);
  };
  const handleImagesScroll = () => updateImagesNav();
  const handlePrevImagesClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    imagesScrollRef.current?.scrollBy({ left: -400, behavior: "smooth" });
  };
  const handleNextImagesClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    imagesScrollRef.current?.scrollBy({ left: 400, behavior: "smooth" });
  };
  useEffect(() => {
    updateImagesNav();
    window.addEventListener("resize", updateImagesNav);
    return () => window.removeEventListener("resize", updateImagesNav);
  }, [imagesState, activeImagesTab]);

  const showPrevImages = isHoveredImages && canPrevImages;
  const showNextImages = isHoveredImages && canNextImages;

  const [externalLinksOpen, setExternalLinksOpen] = useState(false);

  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(
    data.title || data.name,
  )}`;

  const isMovie = endpointType === "movie";

  const seriesGraphUrl =
    type === "tv" && data?.id && (data.name || data.original_name)
      ? `https://seriesgraph.com/show/${data.id}-${slugifyForSeriesGraph(
        data.original_name || data.name,
      )}`
      : null;

  const [traktHomepage, setTraktHomepage] = useState(null);

  const tmdbOfficialSiteUrl = useMemo(
    () => normalizeUrl(data?.homepage),
    [data?.homepage],
  );
  const [officialSiteUrl, setOfficialSiteUrl] = useState(tmdbOfficialSiteUrl);

  // reset al cambiar de item (deja el de TMDb como fallback)
  useEffect(() => {
    setOfficialSiteUrl(tmdbOfficialSiteUrl);
  }, [tmdbOfficialSiteUrl, id]);

  // pedir official site a Trakt (si existe, pisa el de TMDb)
  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();

    (async () => {
      try {
        const r = await fetch(
          `/api/trakt/official-site?type=${endpointType}&tmdbId=${encodeURIComponent(id)}`,
          {
            signal: ac.signal,
            cache: "no-store",
          },
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return;
        const u = normalizeUrl(j?.url);
        if (u) setOfficialSiteUrl(u);
      } catch {
        // ignore
      }
    })();

    return () => ac.abort();
  }, [id, endpointType]);

  const justWatchUrl = title
    ? `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(title)}`
    : null;

  const letterboxdUrl =
    isMovie && title
      ? resolvedImdbId
        ? `https://letterboxd.com/imdb/${encodeURIComponent(resolvedImdbId)}/`
        : `https://letterboxd.com/search/${encodeURIComponent(title)}/`
      : null;

  // ====== External links (resolved) ======
  const [extLinks, setExtLinks] = useState({
    justwatch: null,
    letterboxd: null,
    loadingJW: false,
    loadingLB: false,
    errorJW: "",
    errorLB: "",
  });

  async function fetchResolvedLink(url, { signal } = {}) {
    const r = await fetch(url, { signal, cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Request failed: ${r.status}`);
    return j?.url || null;
  }

  const jwCacheKey = useMemo(
    () => `showverse:jw:${endpointType}:${id}:${(yearIso || "").trim()}`,
    [endpointType, id, yearIso],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(jwCacheKey);
      if (cached) {
        setExtLinks((p) => ({ ...p, justwatch: cached || null }));
      }
    } catch { }
  }, [jwCacheKey]);

  // ✅ 1) hidratar desde cache para que el icono salga instantáneo en visitas posteriores
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(jwCacheKey);
      if (cached) {
        setExtLinks((p) => ({ ...p, justwatch: cached || null }));
      }
    } catch { }
  }, [jwCacheKey]);

  useEffect(() => {
    // Si no hay title, reseteamos estado y cache
    if (!title) {
      setExtLinks((p) => ({
        ...p,
        justwatch: null,
        loadingJW: false,
        errorJW: "",
      }));
      try {
        if (typeof window !== "undefined")
          window.localStorage.removeItem(jwCacheKey);
      } catch { }
      return;
    }

    const ac = new AbortController();

    const run = async () => {
      // ✅ Importante: marcamos loading pero NO ponemos justwatch:null (así no “parpadea”)
      setExtLinks((p) => ({ ...p, loadingJW: true, errorJW: "" }));

      try {
        const country = "es";

        const watchnow =
          watchLink &&
            typeof watchLink === "string" &&
            !watchLink.includes("themoviedb.org")
            ? watchLink
            : null;

        const qs = new URLSearchParams();
        qs.set("country", country);
        if (yearIso) qs.set("year", yearIso);

        if (watchnow) qs.set("watchnow", watchnow);
        else qs.set("title", title);

        const resolved = await fetchResolvedLink(
          `/api/links/justwatch?${qs.toString()}`,
          {
            signal: ac.signal,
          },
        );

        if (ac.signal.aborted) return;

        setExtLinks((p) => ({
          ...p,
          justwatch: resolved || null,
          loadingJW: false,
          errorJW: "",
        }));

        // ✅ cache: para que en siguientes visitas salga instantáneo
        try {
          if (typeof window !== "undefined") {
            if (resolved) window.localStorage.setItem(jwCacheKey, resolved);
            else window.localStorage.removeItem(jwCacheKey);
          }
        } catch { }
      } catch (e) {
        if (ac.signal.aborted) return;
        setExtLinks((p) => ({
          ...p,
          loadingJW: false,
          errorJW: e?.message || "Error",
        }));

        // (opcional) si falla, no machacamos cache automáticamente
        // si quieres limpiar cache al fallar:
        // try { if (typeof window !== 'undefined') window.localStorage.removeItem(jwCacheKey) } catch {}
      }
    };

    run();
    return () => ac.abort();
  }, [title, watchLink, yearIso, jwCacheKey]);

  useEffect(() => {
    if (!title && !resolvedImdbId) {
      setExtLinks((p) => ({
        ...p,
        letterboxd: null,
        loadingLB: false,
        errorLB: "",
      }));
      return;
    }

    const ac = new AbortController();

    const run = async () => {
      setExtLinks((p) => ({ ...p, loadingLB: true, errorLB: "" }));

      try {
        const qs = new URLSearchParams();
        if (resolvedImdbId) qs.set("imdb", resolvedImdbId);
        else if (title) qs.set("title", title);

        const resolved = await fetchResolvedLink(
          `/api/links/letterboxd?${qs.toString()}`,
          {
            signal: ac.signal,
          },
        );

        setExtLinks((p) => ({
          ...p,
          letterboxd: resolved || null,
          loadingLB: false,
        }));
      } catch (e) {
        if (ac.signal.aborted) return;
        setExtLinks((p) => ({
          ...p,
          loadingLB: false,
          errorLB: e?.message || "Error",
        }));
      }
    };

    run();
    return () => ac.abort();
  }, [title, resolvedImdbId]);

  const jwHref = justwatchUrl || extLinks.justwatch || null;

  const externalLinks = useMemo(() => {
    const items = [];

    if (officialSiteUrl)
      items.push({
        id: "web",
        label: "Web oficial",
        icon: "/logo-Web.png",
        href: officialSiteUrl,
      });
    if (filmAffinitySearchUrl)
      items.push({
        id: "fa",
        label: "FilmAffinity",
        icon: "/logoFilmaffinity.png",
        href: filmAffinitySearchUrl,
      });
    if (jwHref)
      items.push({
        id: "jw",
        label: "JustWatch",
        icon: "/logo-JustWatch.png",
        href: jwHref,
      });

    // ✅ Letterboxd SOLO movies
    if (isMovie && letterboxdUrl)
      items.push({
        id: "lb",
        label: "Letterboxd",
        icon: "/logo-Letterboxd.png",
        href: letterboxdUrl,
      });

    if (type === "tv" && seriesGraphUrl)
      items.push({
        id: "sg",
        label: "SeriesGraph",
        icon: "/logoseriesgraph.png",
        href: seriesGraphUrl,
      });

    // (opcional) TMDb detail/watch si quieres:
    // if (tmdbDetailUrl) items.push({ id: 'tmdb', label: 'TMDb', icon: '/logo-TMDb.png', href: tmdbDetailUrl })

    return items;
  }, [
    officialSiteUrl,
    filmAffinitySearchUrl,
    justWatchUrl,
    extLinks.justwatch,
    isMovie,
    letterboxdUrl,
    type,
    seriesGraphUrl,
  ]);

  // ====== Datos meta / características (reorganizadas) ======
  const directorsOrCreators =
    type === "movie"
      ? data.credits?.crew?.filter((c) => c.job === "Director") || []
      : data.created_by || [];

  const directorNames =
    type === "movie" && directorsOrCreators.length
      ? directorsOrCreators.map((d) => d.name).join(", ")
      : null;

  const createdByNames =
    type === "tv" && directorsOrCreators.length
      ? directorsOrCreators.map((d) => d.name).join(", ")
      : null;

  const production =
    data.production_companies
      ?.slice(0, 3)
      .map((c) => c.name)
      .join(", ") || null;

  const hasProduction = !!production;
  const hasAwards = !!extras?.awards;

  const countries = (() => {
    const pc = Array.isArray(data.production_countries)
      ? data.production_countries
      : [];
    if (pc.length)
      return (
        pc
          .map((c) => c.iso_3166_1)
          .filter(Boolean)
          .join(", ") || null
      );
    const oc = Array.isArray(data.origin_country) ? data.origin_country : [];
    return oc.length ? oc.join(", ") : null;
  })();

  const languages =
    data.spoken_languages
      ?.map((l) => l.english_name || l.name)
      .filter(Boolean)
      .join(", ") ||
    (Array.isArray(data.languages) ? data.languages.join(", ") : null);

  const network =
    type === "tv"
      ? data.networks?.[0]?.name || data.networks?.[0]?.original_name || null
      : null;

  const releaseDateLabel = type === "movie" ? "Estreno" : "Primera emisión";

  const releaseDateValue =
    type === "movie"
      ? formatDateEs(data.release_date)
      : formatDateEs(data.first_air_date);

  const lastAirDateValue =
    type === "tv" ? formatDateEs(data.last_air_date) : null;

  const runtimeValue =
    type === "movie" && data.runtime
      ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`
      : null;

  const budgetValue =
    type === "movie" && data.budget > 0
      ? `$${(data.budget / 1_000_000).toFixed(1)}M`
      : null;

  const revenueValue =
    type === "movie" && data.revenue > 0
      ? `$${(data.revenue / 1_000_000).toFixed(1)}M`
      : null;

  // ✅ Director (movie) — fallback si data no trae credits
  // ✅ Director (movie) — fallback si data no trae credits
  const [movieDirector, setMovieDirector] = useState(null);
  const [movieDirectorsCrew, setMovieDirectorsCrew] = useState([]);

  useEffect(() => {
    const isMovie = type === "movie";
    if (!isMovie || !id) {
      setMovieDirectorsCrew([]);
      setMovieDirector(null);
      return;
    }

    // Función helper para formatear nombres: "Nolan, Spielberg"
    const formatDirectorNames = (list) => {
      if (!list || !list.length) return null;
      return list.map((d) => d.name).join(", ");
    };

    // 1) CASO A: Si ya vienen credits en "data" (Server Side)
    const crew = data?.credits?.crew;
    if (Array.isArray(crew) && crew.length) {
      const dirsCrew = crew.filter(
        (c) => c?.job === "Director" || c?.job === "Co-Director",
      );

      setMovieDirectorsCrew(dirsCrew);
      // ✅ FIX: Actualizamos también el string del nombre aquí
      setMovieDirector(formatDirectorNames(dirsCrew));
      return;
    }

    // 2) CASO B: Si no vienen, pide credits a la API (Client Side Fallback)
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/tmdb/movies/${id}/credits`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMovieDirectorsCrew([]);
          setMovieDirector(null);
          return;
        }

        const dirsCrew = (json?.crew || []).filter(
          (c) => c?.job === "Director" || c?.job === "Co-Director",
        );

        setMovieDirectorsCrew(dirsCrew);
        // ✅ FIX: Actualizamos también el string del nombre tras el fetch
        setMovieDirector(formatDirectorNames(dirsCrew));
      } catch (e) {
        if (e?.name !== "AbortError") {
          setMovieDirectorsCrew([]);
          setMovieDirector(null);
        }
      }
    })();

    return () => ac.abort();
  }, [type, id, data?.credits?.crew]);

  useEffect(() => {
    const isMovie = type === "movie";
    if (!isMovie || !id) {
      setMovieDirectorsCrew([]);
      return;
    }

    // 1) Si ya vienen credits en "data", úsalo
    const crew = data?.credits?.crew;
    if (Array.isArray(crew) && crew.length) {
      const dirsCrew = crew.filter(
        (c) => c?.job === "Director" || c?.job === "Co-Director",
      );
      setMovieDirectorsCrew(dirsCrew);
      return;
    }

    // 2) Si no vienen, pide credits a tu API route
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/tmdb/movies/${id}/credits`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMovieDirectorsCrew([]);
          return;
        }

        const dirsCrew = (json?.crew || []).filter(
          (c) => c?.job === "Director" || c?.job === "Co-Director",
        );

        setMovieDirectorsCrew(dirsCrew);
      } catch (e) {
        if (e?.name !== "AbortError") setMovieDirectorsCrew([]);
      }
    })();

    return () => ac.abort();
  }, [type, id, data?.credits?.crew]);

  const [tvCreators, setTvCreators] = useState([]);

  useEffect(() => {
    const isTv = type === "tv";
    if (!isTv || !id) {
      setTvCreators([]);
      return;
    }

    // 1) Si ya viene created_by en "data", úsalo
    const creators = data?.created_by;
    if (Array.isArray(creators) && creators.length) {
      setTvCreators(creators);
      return;
    }

    // 2) Si no viene, pide details a tu API route (ajusta la ruta si difiere)
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/tmdb/tv/${id}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setTvCreators([]);
          return;
        }

        setTvCreators(Array.isArray(json?.created_by) ? json.created_by : []);
      } catch (e) {
        if (e?.name !== "AbortError") setTvCreators([]);
      }
    })();

    return () => ac.abort();
  }, [type, id, data?.created_by]);

  // ✅ MENÚ GLOBAL (nuevo)

  const [activeSection, setActiveSection] = useState(() => null);

  // ✅ cuando cambie type, fija una sección inicial válida
  useEffect(() => {
    setActiveSection(null);
  }, [type, id]);

  // Dentro del componente:
  const postersCount = imagesState?.posters?.length || 0;
  const backdropsCount = imagesState?.backdrops?.length || 0;
  const videosCount = videos?.length || 0;
  const mediaCount = sumCount(postersCount, backdropsCount, videosCount);

  // Trakt comments + TMDb reviews (para el badge tipo "448+4")
  const traktCommentsCount = Number(tComments?.total || 0);
  const reviewsCount = Array.isArray(reviews) ? reviews.length : 0;
  const commentsCount = mixedCount(traktCommentsCount, reviewsCount);

  // Otros counts
  const listsCount = Array.isArray(tLists?.items) ? tLists.items.length : 0;
  const castCount = Array.isArray(castData) ? castData.length : 0;
  const recsCount = Array.isArray(recommendations) ? recommendations.length : 0;

  const [isSwitchingSection, startSectionTransition] = useTransition();

  const handleSectionChange = useCallback((nextId) => {
    startSectionTransition(() => {
      setActiveSection((cur) => (cur === nextId ? null : nextId));
    });
  }, []);

  const traktDecimal = useMemo(() => {
    if (tScoreboard.rating == null) return null;
    const v = Number(tScoreboard.rating); // Trakt ya viene 0..10
    if (!Number.isFinite(v) || v <= 0) return null;
    return v.toFixed(1); // punto
  }, [tScoreboard.rating]);

  // =====================================================
  // ✅ CAST: mantener orden TMDb + evitar cast incompleto
  // =====================================================
  const [tmdbCast, setTmdbCast] = useState([]);
  const [tmdbCastLoading, setTmdbCastLoading] = useState(false);
  const [tmdbCastError, setTmdbCastError] = useState("");

  const pickBestRoleName = (roles) => {
    const arr = Array.isArray(roles) ? roles : [];
    if (!arr.length) return "";
    // coge el rol con más episodios (suele ser el “principal”)
    const best = [...arr].sort(
      (a, b) => Number(b?.episode_count || 0) - Number(a?.episode_count || 0),
    )[0];
    return best?.character || "";
  };

  const normalizeCastFromTmdb = (raw = [], { isAggregate = false } = {}) => {
    const list = Array.isArray(raw) ? raw : [];

    // normaliza a tu shape: { id, name, profile_path, character, order }
    const normalized = list
      .filter((p) => p?.id && p?.name)
      .map((p, idx) => {
        const order = Number.isFinite(Number(p?.order))
          ? Number(p.order)
          : Number.isFinite(Number(p?.cast_id))
            ? Number(p.cast_id)
            : idx;

        const character =
          p?.character || (isAggregate ? pickBestRoleName(p?.roles) : "") || "";

        return {
          ...p,
          character,
          order,
        };
      });

    // dedup por id respetando el PRIMER aparecido (que ya viene en orden TMDb)
    const seen = new Set();
    const unique = [];
    for (const item of normalized) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      unique.push(item);
    }

    // orden TMDb: por `order` asc
    unique.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
    return unique;
  };

  useEffect(() => {
    let ignore = false;
    const ac = new AbortController();

    const fetchJson = async (url) => {
      const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.status_message || `TMDb ${r.status}`);
      return j;
    };

    const run = async () => {
      // fallback: si no hay apiKey, nos quedamos con castData
      if (
        !TMDB_API_KEY ||
        !id ||
        (endpointType !== "tv" && endpointType !== "movie")
      ) {
        setTmdbCast([]);
        setTmdbCastError("");
        setTmdbCastLoading(false);
        return;
      }

      setTmdbCastLoading(true);
      setTmdbCastError("");

      try {
        if (endpointType === "tv") {
          // 1) aggregate_credits (lo más parecido a lo que ves en TMDb web)
          const aggUrl = `https://api.themoviedb.org/3/tv/${id}/aggregate_credits?api_key=${TMDB_API_KEY}`;
          const agg = await fetchJson(aggUrl);
          const aggCast = normalizeCastFromTmdb(agg?.cast, {
            isAggregate: true,
          });

          // 2) fallback a credits si aggregate viene raro/vacío
          if (!aggCast.length) {
            const url = `https://api.themoviedb.org/3/tv/${id}/credits?api_key=${TMDB_API_KEY}`;
            const j = await fetchJson(url);
            const c = normalizeCastFromTmdb(j?.cast, { isAggregate: false });
            if (!ignore) setTmdbCast(c);
          } else {
            if (!ignore) setTmdbCast(aggCast);
          }
        } else {
          // movie credits
          const url = `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${TMDB_API_KEY}`;
          const j = await fetchJson(url);
          const c = normalizeCastFromTmdb(j?.cast, { isAggregate: false });
          if (!ignore) setTmdbCast(c);
        }
      } catch (e) {
        if (!ignore) {
          setTmdbCast([]);
          setTmdbCastError(e?.message || "Error cargando reparto en TMDb");
        }
      } finally {
        if (!ignore) setTmdbCastLoading(false);
      }
    };

    run();
    return () => {
      ignore = true;
      ac.abort();
    };
  }, [id, endpointType]);

  const castDataForUI = useMemo(() => {
    // 1) Base cast: preferimos TMDb (más completo); si no, usamos castData tal cual
    const base =
      Array.isArray(tmdbCast) && tmdbCast.length
        ? tmdbCast
        : Array.isArray(castData)
          ? castData
          : [];

    // 2) Extras (Director / Creador)
    const extras =
      type === "movie"
        ? (Array.isArray(movieDirectorsCrew) ? movieDirectorsCrew : [])
          .filter((d) => d?.id && d?.name)
          .map((d, idx) => ({
            ...d,
            character: "Director",
            // orden negativo para que vaya arriba si luego hay sort por order
            order: -1000 + idx,
          }))
        : type === "tv"
          ? (Array.isArray(tvCreators) ? tvCreators : [])
            .filter((c) => c?.id && c?.name)
            .map((c, idx) => ({
              ...c,
              character: "Creador",
              order: -1000 + idx,
            }))
          : [];

    // 3) ¿Hay order real en el base? (si viene de TMDb normalmente sí)
    const baseHasOrder = base.some((p) => Number.isFinite(Number(p?.order)));

    // 4) Normalizamos base: filtramos y garantizamos un order numérico
    const normalizedBase = base
      .filter((p) => p?.id && p?.name)
      .map((p, idx) => ({
        ...p,
        order: Number.isFinite(Number(p?.order))
          ? Number(p.order)
          : baseHasOrder
            ? 1000 + idx
            : idx, // si hay order, los sin order al final
      }));

    // 5) Unimos (extras primero para que “ganen” en dedupe) y deduplicamos por id
    const seen = new Set();
    const mergedUnique = [];

    for (const item of [...extras, ...normalizedBase]) {
      if (!item?.id) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      mergedUnique.push(item);
    }

    // 6) Si el cast base tiene order, ordenamos por order (extras quedan arriba por order negativo)
    if (baseHasOrder) {
      mergedUnique.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
    }

    return mergedUnique;
  }, [tmdbCast, castData, type, movieDirectorsCrew, tvCreators]);

  const sectionItems = useMemo(() => {
    const items = [];

    // ✅ Media = Imágenes + Vídeos (unificado)
    const postersCount = imagesState?.posters?.length || 0;
    const backdropsCount = imagesState?.backdrops?.length || 0;
    const videosCount = Array.isArray(videos) ? videos.length : 0;
    const mediaCount = postersCount + backdropsCount + videosCount;

    items.push({
      id: "media",
      label: "Media",
      icon: ImageIcon,
      count: mediaCount || undefined,
    });

    // ✅ Sentimientos
    items.push({
      id: "sentiment",
      label: "Sentimientos",
      icon: Sparkles,
    });

    // ✅ TV: Temporadas
    if (type === "tv") {
      items.push({
        id: "seasons",
        label: "Temporadas",
        icon: Layers,
        count: Array.isArray(tSeasons?.items)
          ? tSeasons.items.length
          : undefined,
      });
      // ✅ TV: Episodios
      items.push({
        id: "episodes",
        label: "Episodios",
        icon: TrendingUp,
        // si no tienes "ratings.length", puedes dejar count undefined
        count: Array.isArray(ratings) ? ratings.length : undefined,
      });
    }

    // ✅ Comentarios = Trakt + Críticas (unificado)
    const traktCommentsCount = Number(tComments?.total || 0) || 0;
    const reviewsCount = Array.isArray(reviews) ? reviews.length : 0;
    const commentsCount = traktCommentsCount + reviewsCount;

    items.push({
      id: "comments",
      label: "Comentarios",
      icon: MessageSquareIcon,
      count: commentsCount || undefined,
    });

    // ✅ Listas
    items.push({
      id: "lists",
      label: "Listas",
      icon: ListVideo,
      count: Array.isArray(tLists?.items) ? tLists.items.length : undefined,
    });

    // ✅ Colección
    if (collectionId) {
      items.push({
        id: "collection",
        label: "Colección",
        icon: Layers,
        count: collectionData?.items?.length || undefined,
        loading: collectionLoading && !collectionData,
      });
    }

    // ✅ Reparto
    items.push({
      id: "cast",
      label: "Reparto",
      icon: Users,
      count: castDataForUI?.length ? castDataForUI.length : undefined,
    });

    // ✅ Recomendaciones (texto completo)
    items.push({
      id: "recs",
      label: "Recomendaciones",
      icon: MonitorPlay,
      count: Array.isArray(recommendations)
        ? recommendations.length
        : undefined,
    });

    return items;
  }, [
    type,
    ratings,
    imagesState?.posters,
    imagesState?.backdrops,
    videos,
    tComments?.total,
    reviews,
    tSeasons?.items,
    tLists?.items,
    castData,
    castDataForUI,
    recommendations,
    collectionId,
    collectionData,
  ]);

  // ✅ MENÚ GLOBAL (scroll + sticky + spy)
  const STICKY_TOP = 72; // ajusta si tu navbar mide otra cosa (px)

  const sentinelRef = useRef(null);
  const menuStickyRef = useRef(null);
  const sectionElsRef = useRef({});

  const [menuCompact, setMenuCompact] = useState(false);
  const [menuH, setMenuH] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState(null);

  const registerSection = useCallback(
    (sid) => (el) => {
      if (el) sectionElsRef.current[sid] = el;
    },
    [],
  );

  useEffect(() => {
    if (!menuStickyRef.current) return;
    const el = menuStickyRef.current;

    const update = () => setMenuH(el.getBoundingClientRect().height || 0);
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        // cuando el sentinel deja de verse => el menú ya está “pegado”
        setMenuCompact(!entry.isIntersecting);
      },
      {
        threshold: 0,
        root: null,
        rootMargin: `-${STICKY_TOP}px 0px 0px 0px`,
      },
    );

    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, []);

  const scrollToSection = useCallback(
    (sid) => {
      const el =
        sectionElsRef.current[sid] || document.getElementById(`section-${sid}`);
      if (!el) return;

      const offset = STICKY_TOP + (menuH || 0) + 10;
      const y = window.scrollY + el.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    },
    [menuH],
  );

  // Scroll-spy (qué sección está “activa”)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = (sectionItems || []).map((x) => x?.id).filter(Boolean);
    if (!ids.length) return;

    let raf = 0;
    const compute = () => {
      const offset = STICKY_TOP + (menuH || 0) + 16;
      let current = ids[0];

      for (const sid of ids) {
        const el = sectionElsRef.current[sid];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = sid;
        else break;
      }

      setActiveSectionId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [sectionItems, menuH]);

  useEffect(() => {
    if (!Array.isArray(sectionItems) || sectionItems.length === 0) return;
    if (activeSection == null) return;
    if (!sectionItems.some((it) => it.id === activeSection)) {
      setActiveSection(null);
    }
  }, [sectionItems, activeSection]);

  // =====================================================
  // ✅ IMDb para RECOMENDACIONES: SOLO HOVER (no auto)
  // =====================================================
  const [recImdbRatings, setRecImdbRatings] = useState({});
  const recImdbRatingsRef = useRef({});
  const recImdbInFlightRef = useRef(new Set());
  const recImdbTimersRef = useRef({});
  const recImdbIdCacheRef = useRef({});

  useEffect(() => {
    recImdbRatingsRef.current = recImdbRatings;
  }, [recImdbRatings]);

  useEffect(() => {
    // reset al cambiar de item
    setRecImdbRatings({});
    recImdbInFlightRef.current = new Set();
    recImdbTimersRef.current = {};
    recImdbIdCacheRef.current = {};
  }, [id, type]);

  const prefetchRecImdb = useCallback(
    (rec) => {
      if (!rec?.id) return;
      if (typeof window === "undefined") return;

      const rid = rec.id;
      // si ya está (aunque sea null) no vuelvas a pedir
      if (recImdbRatingsRef.current?.[rid] !== undefined) return;
      if (recImdbInFlightRef.current.has(rid)) return;

      // pequeño delay para evitar peticiones al pasar el ratón rápido
      if (recImdbTimersRef.current[rid]) return;
      recImdbTimersRef.current[rid] = window.setTimeout(async () => {
        recImdbInFlightRef.current.add(rid);

        try {
          const mediaType =
            rec.media_type === "movie" || rec.media_type === "tv"
              ? rec.media_type
              : type === "tv"
                ? "tv"
                : "movie";

          let imdbId = recImdbIdCacheRef.current?.[rid] || null;
          if (!imdbId) {
            const ext = await getExternalIds(mediaType, rid);
            imdbId = ext?.imdb_id || null;
            if (imdbId) recImdbIdCacheRef.current[rid] = imdbId;
          }

          if (!imdbId) {
            setRecImdbRatings((prev) => ({ ...prev, [rid]: null }));
            return;
          }

          // cache
          const cached = readOmdbCache(imdbId);
          if (cached?.imdbRating != null) {
            setRecImdbRatings((prev) => ({
              ...prev,
              [rid]: cached.imdbRating,
            }));
            if (cached?.fresh) return;
          }

          const omdb = await fetchOmdbByImdb(imdbId);
          const r =
            omdb?.imdbRating && omdb.imdbRating !== "N/A"
              ? Number(omdb.imdbRating)
              : null;

          const safe = Number.isFinite(r) ? r : null;
          setRecImdbRatings((prev) => ({ ...prev, [rid]: safe }));
          writeOmdbCache(imdbId, { imdbRating: safe });
        } catch {
          setRecImdbRatings((prev) => ({ ...prev, [rid]: null }));
        } finally {
          recImdbInFlightRef.current.delete(rid);
          if (recImdbTimersRef.current[rid]) {
            window.clearTimeout(recImdbTimersRef.current[rid]);
            delete recImdbTimersRef.current[rid];
          }
        }
      }, 180);
    },
    [type],
  );

  // Cargar providers desde JustWatch con caché en sessionStorage
  useEffect(() => {
    if (!title || !id) return;

    const cacheKey = `streaming:${endpointType}:${id}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

    // Intentar cargar desde caché primero
    const loadFromCache = () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { providers, justwatchUrl, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;

          if (age < CACHE_TTL) {
            setStreamingProviders(providers || []);
            setJustwatchUrl(justwatchUrl || null);
            setProvidersLoading(false);
            return true;
          }
        }
      } catch (error) {
        console.error("Error loading providers from cache:", error);
      }
      return false;
    };

    // Si hay caché válido, usarlo y terminar
    if (loadFromCache()) return;

    // Si no hay caché, hacer la petición
    const fetchProviders = async () => {
      setProvidersLoading(true);
      try {
        const params = new URLSearchParams({
          title: title,
          type: endpointType,
        });

        if (yearIso) {
          params.append("year", yearIso);
        }

        if (data.imdb_id) {
          params.append("imdbId", data.imdb_id);
        }

        params.append("tmdbId", id);

        const response = await fetch(`/api/streaming?${params.toString()}`);

        if (response.ok) {
          const result = await response.json();
          const providers = result.providers || [];
          const justwatchUrl = result.justwatchUrl || null;

          setStreamingProviders(providers);
          setJustwatchUrl(justwatchUrl);

          // Guardar en caché
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                providers,
                justwatchUrl,
                timestamp: Date.now(),
              }),
            );
          } catch (error) {
            console.error("Error saving providers to cache:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching streaming providers:", error);
      } finally {
        setProvidersLoading(false);
      }
    };

    fetchProviders();
  }, [title, id, endpointType, yearIso, data.imdb_id]);

  // ====== PLEX: Cargar disponibilidad desde servidor local ======
  useEffect(() => {
    if (!title || !id) return;

    // Cambiar clave de caché para forzar recarga con nuevas URLs corregidas
    const cacheKey = `plex-v4:${endpointType}:${id}`;
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

    // Intentar cargar desde caché primero
    const loadFromCache = () => {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { available, plexUrl, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;

          if (age < CACHE_TTL) {
            setPlexAvailable(available || false);
            setPlexUrl(plexUrl || null);
            setPlexLoading(false);
            return true;
          }
        }
      } catch (error) {
        console.error("Error loading Plex from cache:", error);
      }
      return false;
    };

    // Si hay caché válido, usarlo y terminar
    if (loadFromCache()) return;

    // Si no hay caché, hacer la petición
    const fetchPlex = async () => {
      setPlexLoading(true);
      try {
        const params = new URLSearchParams({
          title: title,
          type: endpointType,
        });

        if (yearIso) {
          params.append("year", yearIso);
        }

        if (data.imdb_id) {
          params.append("imdbId", data.imdb_id);
        }

        const response = await fetch(`/api/plex?${params.toString()}`);

        if (response.ok) {
          const result = await response.json();
          const available = result.available || false;
          const plexUrl = result.plexUrl || null;
          const plexAppUrl = result.plexAppUrl || null;

          setPlexAvailable(available);
          
          // Detectar si es móvil para usar la URL de la app
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const urlToUse = isMobile && plexAppUrl ? plexAppUrl : plexUrl;
          
          setPlexUrl(urlToUse);

          // Guardar en caché
          try {
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                available,
                plexUrl: urlToUse,
                timestamp: Date.now(),
              }),
            );
          } catch (error) {
            console.error("Error saving Plex to cache:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching Plex availability:", error);
      } finally {
        setPlexLoading(false);
      }
    };

    fetchPlex();
  }, [title, id, endpointType, yearIso, data.imdb_id]);

  // ====== COMBINAR PROVIDERS: JustWatch + Plex ======
  const limitedProviders = useMemo(() => {
    const providers = Array.isArray(streamingProviders)
      ? [...streamingProviders]
      : [];

    // Si Plex está disponible, agregarlo al final
    if (plexAvailable && plexUrl) {
      providers.push({
        provider_id: "plex",
        provider_name: "Plex",
        logo_path: "/logo-Plex.png",
        url: plexUrl,
        isPlex: true,
      });
    }

    return providers.slice(0, 6);
  }, [streamingProviders, plexAvailable, plexUrl]);

  // ✅ Refs para gestión de carga de poster (los estados están definidos al inicio)
  const prevDisplayPosterRef = useRef(null);
  const posterLoadTokenRef = useRef(0);
  const posterToggleSeqRef = useRef(0);
  const posterRequestedModeRef = useRef("poster");

  useEffect(() => {
    posterRequestedModeRef.current = posterViewMode;
  }, [posterViewMode]);

  // ✅ Activar posterResolved cuando displayPosterPath esté disponible
  useEffect(() => {
    // ✅ Activar posterResolved INMEDIATAMENTE si tenemos un path válido (igual que el poster)
    if (displayPosterPath && !posterResolved) {
      setPosterResolved(true);
    }
    // Incluimos artworkInitialized para evitar error de HMR "deps changed size"
  }, [displayPosterPath, posterResolved, artworkInitialized]);

  // ✅ Fallback automático: si backdrop falla, cambiar a poster
  useEffect(() => {
    if (posterImgError && posterViewMode === "preview" && basePosterDisplayPath) {
      console.warn("Backdrop failed to load, falling back to poster");
      setPosterViewMode("poster");
      setPosterLayoutMode("poster");
      // Resetear error para que el poster pueda cargar
      setPosterImgError(false);
      setPosterLowLoaded(false);
      setPosterHighLoaded(false);
    }
  }, [posterImgError, posterViewMode, basePosterDisplayPath]);

  // ✅ Fallback si no hay backdrop disponible en modo preview
  useEffect(() => {
    if (
      posterViewMode === "preview" &&
      artworkInitialized &&
      !previewBackdropPath &&
      basePosterDisplayPath
    ) {
      console.warn("No backdrop available, falling back to poster");
      setPosterViewMode("poster");
      setPosterLayoutMode("poster");
    }
  }, [posterViewMode, artworkInitialized, previewBackdropPath, basePosterDisplayPath]);

  // ✅ Timeout de seguridad: si después de 3s no hay imagen en modo preview, cambiar a poster
  useEffect(() => {
    if (posterViewMode !== "preview" || posterResolved) return;

    const timeoutId = setTimeout(() => {
      if (!posterResolved && basePosterDisplayPath) {
        console.warn("Backdrop loading timeout, falling back to poster");
        setPosterViewMode("poster");
        setPosterLayoutMode("poster");
      }
    }, 3000); // 3 segundos de timeout

    return () => clearTimeout(timeoutId);
  }, [posterViewMode, posterResolved, basePosterDisplayPath]);

  useEffect(() => {
    const prev = prevDisplayPosterRef.current;
    prevDisplayPosterRef.current = displayPosterPath;
    posterLoadTokenRef.current += 1;

    // ✅ Manejar cambio de imagen (incluyendo de null a valor)
    if (prev !== displayPosterPath) {
      // Si hay imagen anterior, guardarla para crossfade
      if (prev) {
        setPrevPosterPath(prev);
      }

      // ✅ Verificar si la nueva imagen ya está precargada
      if (displayPosterPath) {
        const checkIfLoaded = (size) => {
          const testImg = new Image();
          testImg.src = `https://image.tmdb.org/t/p/${size}${displayPosterPath}`;
          return testImg.complete && testImg.naturalWidth > 0;
        };

        const isLowPreloaded = checkIfLoaded('w342');
        const isHighPreloaded = checkIfLoaded('w780');

        // ✅ Si está precargada, marcar como cargada inmediatamente
        if (isLowPreloaded) {
          setPosterLowLoaded(true);
          setPosterHighLoaded(isHighPreloaded); // ✅ También verificar HIGH
        } else {
          setPosterLowLoaded(false);
          setPosterHighLoaded(false);
        }

        setPosterTransitioning(!!prev); // Solo transición si había imagen anterior
        setPosterImgError(false);

        // ✅ Limpiar transición después del tiempo configurado
        if (prev) {
          const timer = setTimeout(() => {
            setPosterTransitioning(false);
            setPrevPosterPath(null);
          }, 500);

          return () => {
            clearTimeout(timer);
          };
        }
      } else {
        // Si displayPosterPath es null, resetear estados
        setPosterLowLoaded(false);
        setPosterHighLoaded(false);
        setPosterTransitioning(false);
        setPrevPosterPath(null);
      }
    }
  }, [displayPosterPath]);

  // ✅ Resetear estados de carga del backdrop cuando cambia la vista o la imagen
  const prevDisplayBackdropRef = useRef(null);
  const backdropLoadTokenRef = useRef(0);
  const backdropLoadToken = backdropLoadTokenRef.current;

  useEffect(() => {
    const prev = prevDisplayBackdropRef.current;
    prevDisplayBackdropRef.current = previewBackdropPath;
    backdropLoadTokenRef.current += 1;

    // Solo manejar cuando estamos en modo preview
    if (posterViewMode === "preview") {
      if (prev !== previewBackdropPath) {
        // ✅ Verificar si la nueva imagen ya está precargada
        if (previewBackdropPath) {
          const checkIfLoaded = (size) => {
            const testImg = new Image();
            testImg.src = `https://image.tmdb.org/t/p/${size}${previewBackdropPath}`;
            return testImg.complete && testImg.naturalWidth > 0;
          };

          const isLowPreloaded = checkIfLoaded('w780');
          const isHighPreloaded = checkIfLoaded('w1280');

          // ✅ Si está precargada, marcar como cargada inmediatamente
          if (isLowPreloaded) {
            setBackdropLowLoaded(true);
            setBackdropHighLoaded(isHighPreloaded);
            setBackdropResolved(true);
          } else {
            setBackdropLowLoaded(false);
            setBackdropHighLoaded(false);
          }

          setBackdropImgError(false);
        } else {
          // Si previewBackdropPath es null, resetear estados
          setBackdropLowLoaded(false);
          setBackdropHighLoaded(false);
        }
      }
    } else {
      // Si no estamos en modo preview, resetear estados del backdrop
      setBackdropLowLoaded(false);
      setBackdropHighLoaded(false);
      setBackdropImgError(false);
      setBackdropResolved(false);
    }
  }, [previewBackdropPath, posterViewMode]);

  const posterAspectIsBackdrop =
    posterTransitioning && prevPosterPath
      ? isBackdropPath(prevPosterPath)
      : isBackdropPoster;

  // ✅ URLs basadas en el modo de vista
  const posterLowUrl = posterViewMode === "preview" && previewBackdropPath
    ? `https://image.tmdb.org/t/p/w780${previewBackdropPath}`
    : displayPosterPath
      ? `https://image.tmdb.org/t/p/w342${displayPosterPath}`
      : null;

  const posterHighUrl = posterViewMode === "preview" && previewBackdropPath
    ? `https://image.tmdb.org/t/p/w1280${previewBackdropPath}`
    : displayPosterPath
      ? `https://image.tmdb.org/t/p/w780${displayPosterPath}`
      : null;
  const posterLoadToken = posterLoadTokenRef.current;

  // ✅ Estados unificados: usar backdrop states si estamos en preview, sino poster states
  const currentLowLoaded = posterViewMode === "preview" ? backdropLowLoaded : posterLowLoaded;
  const currentHighLoaded = posterViewMode === "preview" ? backdropHighLoaded : posterHighLoaded;
  const currentImgError = posterViewMode === "preview" ? backdropImgError : posterImgError;
  const currentResolved = posterViewMode === "preview" ? backdropResolved : posterResolved;
  const currentImagePath = posterViewMode === "preview" ? posterLowUrl : displayPosterPath;
  const currentLoadToken = posterViewMode === "preview" ? backdropLoadToken : posterLoadToken;
  const currentLoadTokenRef = posterViewMode === "preview" ? backdropLoadTokenRef : posterLoadTokenRef;

  // Skeleton mientras:
  // - no hemos “resuelto” si hay poster
  // - o existe poster pero aún no ha cargado el low
  const showPosterSkeleton =
    !currentResolved ||
    (currentImagePath && !currentLowLoaded && !currentImgError);

  // Icono NO IMAGE solo si ya hemos resuelto, NO hay imagen (o falló) y NO estamos esperando carga inicial en modo preview
  const showNoPoster =
    currentResolved &&
    (!currentImagePath || currentImgError) &&
    // Si estamos en preview, esperar a que termine initArtwork antes de declarar "No Image"
    (posterViewMode !== "preview" || artworkInitialized);

  // ====== Poster 3D Tilt / Shine ======
  const posterWrapRef = useRef(null);
  const posterCardRef = useRef(null);
  const posterShineRef = useRef(null);
  const posterRafRef = useRef(0);
  const [poster3dEnabled, setPoster3dEnabled] = useState(true);
  // ====== Poster 3D Idle / Tilt (ORDEN CORRECTO) ======
  const posterIdleRafRef = useRef(0);
  const posterIsInteractingRef = useRef(false);
  const posterIdleStartRef = useRef(0);
  const posterTiltRef = useRef(null); // ✅ el recuadro completo que se inclina
  const posterAnimRafRef = useRef(0); // ✅ un solo rAF
  const posterTargetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterStateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterLastInputRef = useRef(0);

  const POSTER_MAX = 12; // grados
  const POSTER_SCALE = 1.06; // escala al hover
  const POSTER_OVERSCAN = 1.02; // ✅ mínimo para NO perder nitidez
  const IDLE_DELAY = 220; // ms sin interacción => idle

  // Overscan
  const posterImgOverscan = poster3dEnabled ? 1.12 : 1;

  const setPosterTargetFromPointer = useCallback(
    (clientX, clientY) => {
      if (!poster3dEnabled) return;

      const wrapper = posterWrapRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const rx = ((y - cy) / cy) * -POSTER_MAX;
      const ry = ((x - cx) / cx) * POSTER_MAX;

      posterTargetRef.current = { rx, ry, s: POSTER_SCALE };
      posterLastInputRef.current =
        typeof performance !== "undefined" ? performance.now() : Date.now();
    },
    [poster3dEnabled],
  );

  const resetPosterTarget = useCallback(() => {
    posterTargetRef.current = { rx: 0, ry: 0, s: 1 };
    posterLastInputRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }, []);

  // ✅ Animación 3D del poster/backdrop
  useEffect(() => {
    if (!poster3dEnabled) return;

    const el = posterTiltRef.current;
    if (!el) return;

    let mounted = true;

    // ✅ Resetear posterLastInputRef para que idle funcione inmediatamente al cambiar imagen
    posterLastInputRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const loop = (t) => {
      if (!mounted) return;

      const now =
        t ??
        (typeof performance !== "undefined" ? performance.now() : Date.now());
      const idle = now - posterLastInputRef.current > IDLE_DELAY;

      let target = posterTargetRef.current;

      // ✅ Idle automático cuando no hay interacción (más visual pero estable)
      if (idle) {
        const dt = now / 1000;
        target = {
          rx: Math.sin(dt * 1.05) * 5.5,
          ry: Math.cos(dt * 0.9) * 8.5,
          s: 1.03 + Math.sin(dt * 1.6) * 0.01,
        };
      }

      const cur = posterStateRef.current;

      // ✅ LERP suave (fluido y responsivo)
      const k = 0.14;
      cur.rx += (target.rx - cur.rx) * k;
      cur.ry += (target.ry - cur.ry) * k;
      cur.s += (target.s - cur.s) * k;

      el.style.transform =
        `translateZ(0px) rotateX(${cur.rx.toFixed(3)}deg) rotateY(${cur.ry.toFixed(3)}deg) ` +
        `scale3d(${cur.s.toFixed(4)}, ${cur.s.toFixed(4)}, ${cur.s.toFixed(4)})`;

      posterAnimRafRef.current = requestAnimationFrame(loop);
    };

    posterAnimRafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      if (posterAnimRafRef.current)
        cancelAnimationFrame(posterAnimRafRef.current);
      posterAnimRafRef.current = 0;
    };
  }, [poster3dEnabled, displayPosterPath]);



  return (
    <div className="relative min-h-screen bg-[#101010] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* --- BACKGROUND & OVERLAY --- */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
        {useBackdrop && artworkInitialized && heroBackgroundPath ? (
          <>
            {/* Imagen anterior (fade out) */}
            {isTransitioning && prevBackgroundPath && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/original${prevBackgroundPath})`,
                    transform: "scale(1)",
                    filter: "blur(14px) brightness(0.65) saturate(1.05)",
                    opacity: 0,
                  }}
                />
                <div
                  className="absolute inset-0 bg-cover transition-opacity duration-500"
                  style={{
                    backgroundImage: `url(https://image.tmdb.org/t/p/original${prevBackgroundPath})`,
                    backgroundPosition: "center top",
                    transform: "scale(1)",
                    transformOrigin: "center top",
                    opacity: 0,
                  }}
                />
              </>
            )}

            {/* ✅ Capa base: SIEMPRE cubre (evita marcos laterales) */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                transform: "scale(1)",
                filter: "blur(14px) brightness(0.65) saturate(1.05)",
                opacity: isTransitioning ? 1 : 1,
              }}
            />

            {/* ✅ Capa detalle: zoom OUT (scale < 1) */}
            <div
              className="absolute inset-0 bg-cover transition-opacity duration-500"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                backgroundPosition: "center top",
                transform: "scale(1)",
                transformOrigin: "center top",
                opacity: isTransitioning ? 1 : 1,
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        {/* ✅ Sombreado superior + laterales (sin “marcos”) */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />

        {/* Tus overlays originales */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div className="relative z-10 px-4 py-8 lg:py-12 max-w-7xl mx-auto">
        {/* =================================================================
            HEADER HERO SECTION (Diseño Final Solicitado)
           ================================================================= */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12 animate-in fade-in duration-700 slide-in-from-bottom-4 items-start">
          {/* --- COLUMNA IZQUIERDA: POSTER + PROVIDERS + ENLACES (cuando es backdrop) --- */}
          <div
            className={`w-full mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10 transition-all duration-500 ${isBackdropPoster
              ? "max-w-full lg:max-w-[600px]"
              : "max-w-[280px] lg:max-w-[320px]"
              }`}
          >
            {/* Poster Card */}
            <div className="relative">
              {/* Wrapper: solo perspectiva + captura puntero */}
              <div
                ref={posterWrapRef}
                onPointerMove={(e) =>
                  setPosterTargetFromPointer(e.clientX, e.clientY)
                }
                onPointerLeave={resetPosterTarget}
                onPointerDown={(e) => {
                  // mejora tactil (evita pérdidas de tracking)
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setPosterTargetFromPointer(e.clientX, e.clientY);
                }}
                className="relative"
                style={{
                  perspective: poster3dEnabled ? 1100 : undefined,
                  transformStyle: "preserve-3d",
                  touchAction: "none",
                }}
              >
                {/* ✅ Este es el recuadro completo que se inclina */}
                <div
                  ref={posterTiltRef}
                  className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40 will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                    // ✅ NO transition en transform - manejado por requestAnimationFrame
                  }}
                >
                  {/* (Opcional) borde suave sin sombreado encima */}
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />

                  <div
                    className={`relative bg-neutral-950 will-change-auto ${isBackdropPoster ? "aspect-[16/9]" : "aspect-[2/3]"
                      }`}
                    style={{
                      transition: "aspect-ratio 500ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    {/* Imagen anterior (permanece visible durante la transición) */}
                    {prevPosterPath && posterTransitioning && (
                      <div
                        className="absolute inset-0 transition-opacity duration-500 ease-in-out"
                        style={{ opacity: currentLowLoaded ? 0 : 1 }}
                      >
                        <img
                          src={`https://image.tmdb.org/t/p/w780${prevPosterPath}`}
                          alt={title}
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{
                            transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                          }}
                        />
                      </div>
                    )}

                    {posterLowUrl && !currentImgError && (
                      <div key={displayPosterPath} className="absolute inset-0">
                        {/* LOW */}
                        <img
                          src={posterLowUrl}
                          alt={title}
                          loading="eager"
                          fetchPriority="high"
                          decoding="async"
                          onLoad={() => {
                            if (currentLoadTokenRef.current !== currentLoadToken)
                              return;
                            // ✅ Usar el setState correcto según el modo
                            if (posterViewMode === "preview") {
                              setBackdropLowLoaded(true);
                              setBackdropResolved(true);
                            } else {
                              setPosterLowLoaded(true);
                              setPosterResolved(true);
                            }
                          }}
                          onError={() => {
                            if (currentLoadTokenRef.current !== currentLoadToken)
                              return;
                            // ✅ Usar el setState correcto según el modo
                            if (posterViewMode === "preview") {
                              setBackdropImgError(true);
                              setBackdropResolved(true);
                            } else {
                              setPosterImgError(true);
                              setPosterResolved(true);
                            }
                          }}
                          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-in-out
${currentHighLoaded ? "opacity-0" : currentLowLoaded ? "opacity-100" : "opacity-0"}`}
                          style={{
                            transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                          }}
                        />

                        {/* HIGH */}
                        {currentLowLoaded && posterHighUrl && (
                          <img
                            src={posterHighUrl}
                            alt={title}
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                            onLoad={() => {
                              if (
                                currentLoadTokenRef.current !== currentLoadToken
                              )
                                return;
                              // ✅ Usar el setState correcto según el modo
                              if (posterViewMode === "preview") {
                                setBackdropHighLoaded(true);
                              } else {
                                setPosterHighLoaded(true);
                              }
                            }}
                            onError={() => { }}
                            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-in-out
${currentHighLoaded ? "opacity-100" : "opacity-0"}`}
                            style={{
                              transform: `translateZ(0) scale(${POSTER_OVERSCAN})`,
                            }}
                          />
                        )}
                      </div>
                    )}

                    {showNoPoster && !prevPosterPath && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ImageOff className="w-10 h-10 text-neutral-700" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Providers Grid + Enlaces Externos (cuando es backdrop) */}
            {(limitedProviders && limitedProviders.length > 0) || (isBackdropPoster && externalLinks.length > 0) ? (
              <div className="flex flex-row flex-nowrap justify-center items-center gap-3 w-full px-1 py-2 overflow-x-auto [scrollbar-width:none]">
                {/* Providers - Solo si hay plataformas */}
                {limitedProviders && limitedProviders.length > 0 && (
                  <div className="flex flex-row flex-nowrap items-center gap-2">
                    {limitedProviders.map((p) => {
                      const providerLink = p.url || justwatchUrl || "#";
                      const hasValidLink = p.url || justwatchUrl;
                      const isPlexProvider = p.isPlex === true;

                      return (
                        <a
                          key={p.provider_id}
                          href={providerLink}
                          target={hasValidLink ? "_blank" : undefined}
                          rel={hasValidLink ? "noreferrer" : undefined}
                          title={p.provider_name}
                          className="relative flex-shrink-0 transition-transform transform hover:scale-110 hover:brightness-110 hover:z-10"
                        >
                          <img
                            src={
                              p.logo_path?.startsWith("http")
                                ? p.logo_path
                                : p.logo_path?.startsWith("/logo-")
                                  ? p.logo_path
                                  : p.logo_path?.startsWith("/")
                                    ? `https://image.tmdb.org/t/p/original${p.logo_path}`
                                    : p.logo_path
                            }
                            alt={p.provider_name}
                            className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl shadow-lg object-contain bg-white/5"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                          {isPlexProvider && (
                            <div 
                              className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full ring-2 ring-black" 
                              title="Disponible en tu servidor local" 
                            />
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Barra vertical + Enlaces externos (cuando es backdrop) */}
                {isBackdropPoster && externalLinks.length > 0 && (
                  <>
                    {/* Separador solo si hay plataformas */}
                    {limitedProviders && limitedProviders.length > 0 && (
                      <div className="w-px h-8 bg-white/20 flex-shrink-0" />
                    )}
                    <div className="flex flex-row flex-nowrap items-center gap-2">
                      {externalLinks.slice(0, 5).map((link) => (
                        <a
                          key={link.id}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          title={link.label}
                          className="relative flex-shrink-0 transition-transform transform hover:scale-110 hover:brightness-110 hover:z-10"
                        >
                          <img
                            src={link.icon}
                            alt={link.label}
                            className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl shadow-lg object-contain bg-white/5 p-1"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* --- COLUMNA DERECHA: INFO (sin tabs cuando es backdrop) --- */}
          <div className={`flex-1 flex flex-col min-w-0 w-full ${isBackdropPoster ? "" : ""
            }`}>
            {/* 1. TÍTULO Y CABECERA */}
            <div className="mb-5 px-1">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3">
                {title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                {yearIso && (
                  <span className="text-white font-bold tracking-wide">
                    {yearIso}
                  </span>
                )}

                {runtimeValue && (
                  <>
                    <span className="text-white text-[10px]">●</span>
                    <span>{runtimeValue}</span>
                  </>
                )}

                {data.status && (
                  <>
                    <span className="text-white text-[10px]">●</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${data.status === "Ended" || data.status === "Canceled"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                    >
                      {data.status}
                    </span>
                  </>
                )}

                {/* Géneros */}
                <div className="flex flex-wrap items-center gap-2">
                  {data.genres?.slice(0, 3).map((g) => (
                    <span
                      key={g.id}
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 text-zinc-400 bg-white/5"
                    >
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. BARRA DE ACCIONES PRINCIPALES */}
            <div className="flex flex-wrap items-center gap-2 mb-6 px-1">
              {/* Botón Tráiler */}
              <LiquidButton
                onClick={() => openVideo(preferredVideo)}
                disabled={!preferredVideo}
                activeColor="yellow"
                groupId="details-actions"
                className={preferredVideo ? "!bg-white !text-black" : ""}
                title={preferredVideo ? "Ver Tráiler" : "Sin Tráiler"}
              >
                <Play
                  className={`w-5 h-5 fill-current ${preferredVideo ? "ml-0.5" : ""}`}
                />
              </LiquidButton>

              <div className="w-px h-8 bg-white/10 mx-1 hidden sm:block" />

              <TraktWatchedControl
                connected={trakt.connected}
                watched={trakt.watched}
                plays={endpointType === "tv" ? 0 : trakt.plays}
                badge={endpointType === "tv" ? tvProgressBadge : null}
                busy={!!traktBusy}
                onOpen={() => {
                  if (!trakt.connected) {
                    window.location.assign(
                      `/api/trakt/auth/start?next=/details/${type}/${id}`,
                    );
                  } else if (endpointType === "tv") {
                    setTraktEpisodesOpen(true);
                  } else {
                    setTraktWatchedOpen(true);
                  }
                }}
              />

              <LiquidButton
                onClick={toggleFavorite}
                disabled={favLoading}
                active={favorite}
                activeColor="red"
                groupId="details-actions"
                title="Favorito"
              >
                {favLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Heart
                    className={`w-5 h-5 ${favorite ? "fill-current" : ""}`}
                  />
                )}
              </LiquidButton>

              <LiquidButton
                onClick={toggleWatchlist}
                disabled={wlLoading}
                active={watchlist}
                activeColor="blue"
                groupId="details-actions"
                title="Watchlist"
              >
                {wlLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <BookmarkPlus
                    className={`w-5 h-5 ${watchlist ? "fill-current" : ""}`}
                  />
                )}
              </LiquidButton>

              {canUseLists && (
                <LiquidButton
                  onClick={openListsModal}
                  disabled={listsPresenceLoading}
                  active={listActive}
                  activeColor="purple"
                  groupId="details-actions"
                  title="Añadir a lista"
                >
                  {listsPresenceLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ListVideo className="w-5 h-5" />
                  )}
                </LiquidButton>
              )}

              {/* Botón de Compartir */}
              <ActionShareButton
                title={title}
                text={`Echa un vistazo a ${title} en The Show Verse`}
                url={
                  typeof window !== "undefined"
                    ? `${window.location.origin}/details/${type}/${id}`
                    : undefined
                }
              />

              {/* Botón Cambiar Portada */}
              <LiquidButton
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCyclePoster();
                }}
                active={posterViewMode === "preview"}
                activeColor="yellow"
                groupId="details-actions"
                title={posterViewMode === "preview" ? "Mostrar portada" : "Mostrar vista previa"}
              >
                {posterToggleBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </LiquidButton>
            </div>


            <div className="w-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden mb-6">
              <div
                className="
      py-3
      pl-[calc(1rem+env(safe-area-inset-left))]
      pr-[calc(1.25rem+env(safe-area-inset-right))]
      sm:px-4
      flex items-center gap-3 sm:gap-4
      overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
    "
              >
                {/* A. Ratings */}
                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                  {tScoreboard.loading && (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  )}

                  <CompactBadge
                    logo="/logo-TMDb.png"
                    logoClassName="h-2 sm:h-4"
                    value={data.vote_average?.toFixed(1)}
                    sub={formatCountShort(data.vote_count)}
                    href={tmdbDetailUrl}
                  />

                  {/* Trakt (móvil sin sufijo / desktop con %) */}
                  {traktDecimal && (
                    <CompactBadge
                      logo="/logo-Trakt.png"
                      value={traktDecimal}
                      sub={
                        tScoreboard.votes
                          ? formatCountShort(tScoreboard.votes)
                          : undefined
                      }
                      href={trakt?.traktUrl}
                      onClick={
                        !trakt?.connected
                          ? () =>
                            window.location.assign(
                              `/api/trakt/auth/start?next=/details/${type}/${id}`,
                            )
                          : undefined
                      }
                    />
                  )}

                  {/* Badge de Trakt cuando no está conectado pero hay score público */}
                  {!traktDecimal &&
                    !trakt?.connected &&
                    tScoreboard?.rating && (
                      <CompactBadge
                        logo="/logo-Trakt.png"
                        value={Number(tScoreboard.rating).toFixed(1)}
                        sub={
                          tScoreboard.votes
                            ? formatCountShort(tScoreboard.votes)
                            : undefined
                        }
                        onClick={() =>
                          window.location.assign(
                            `/api/trakt/auth/start?next=/details/${type}/${id}`,
                          )
                        }
                      />
                    )}

                  {extras.imdbRating && (
                    <CompactBadge
                      logo="/logo-IMDb.png"
                      logoClassName="h-5 sm:h-5"
                      value={Number(extras.imdbRating).toFixed(1)}
                      sub={formatCountShort(extras.imdbVotes)}
                      href={
                        resolvedImdbId
                          ? `https://www.imdb.com/title/${resolvedImdbId}`
                          : undefined
                      }
                    />
                  )}

                  {/* ✅ Rotten Tomatoes: SOLO desktop (>= sm) */}
                  {(tScoreboard?.external?.rtAudience != null ||
                    extras.rtScore != null) && (
                      <div className="hidden sm:block">
                        <CompactBadge
                          logo="/logo-RottenTomatoes.png"
                          value={
                            tScoreboard?.external?.rtAudience != null
                              ? Math.round(tScoreboard.external.rtAudience)
                              : extras.rtScore != null
                                ? Math.round(extras.rtScore)
                                : null
                          }
                          suffix="%"
                        />
                      </div>
                    )}

                  {/* ✅ Metacritic: SOLO desktop (>= sm) */}
                  {extras.mcScore != null && (
                    <div className="hidden sm:block">
                      <CompactBadge
                        logo="/logo-Metacritic.png"
                        value={Math.round(extras.mcScore)}
                        suffix="/100"
                      />
                    </div>
                  )}
                </div>

                {/* ✅ SEPARADOR 1 - SOLO si NO es backdrop */}
                {!isBackdropPoster && (
                  <div className="w-px h-6 bg-white/10 shrink-0" />
                )}

                {/* ✅ B. Links externos - SOLO si NO es backdrop (se muestran abajo con plataformas en modo backdrop) */}
                {!isBackdropPoster && (
                  <div className="flex-1 min-w-0 flex items-center justify-end gap-2.5 sm:gap-3">
                    {/* ✅ DESKTOP: iconos normales */}
                    <div className="hidden sm:flex items-center gap-2.5 sm:gap-3">
                      <div className="hidden sm:block">
                        <ExternalLinkButton
                          icon="/logo-Web.png"
                          href={officialSiteUrl}
                        />
                      </div>

                      <ExternalLinkButton
                        icon="/logoFilmaffinity.png"
                        href={filmAffinitySearchUrl}
                      />
                      <ExternalLinkButton
                        icon="/logo-JustWatch.png"
                        title="JustWatch"
                        href={jwHref}
                        fallbackHref={justWatchUrl}
                      />

                      {isMovie && (
                        <ExternalLinkButton
                          icon="/logo-Letterboxd.png"
                          href={letterboxdUrl}
                        />
                      )}

                      {type === "tv" && (
                        <ExternalLinkButton
                          icon="/logoseriesgraph.png"
                          href={seriesGraphUrl}
                        />
                      )}
                    </div>

                    {/* ✅ MÓVIL: botón "..." */}
                    <button
                      type="button"
                      onClick={() => setExternalLinksOpen(true)}
                      className="sm:hidden w-10 h-10 rounded-full flex items-center justify-center
                 border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                      title="Enlaces"
                      aria-label="Abrir enlaces externos"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* ✅ SEPARADOR 2 - SOLO si NO es backdrop */}
                {!isBackdropPoster && (
                  <div className="hidden md:block w-px h-6 bg-white/10 shrink-0" />
                )}

                {/* C. Puntuación Usuario - con margen automático cuando es backdrop */}
                <div
                  className={`flex items-center gap-3 shrink-0 ${isBackdropPoster ? "ml-auto" : ""}`}
                >
                  <StarRating
                    rating={unifiedUserRating}
                    max={10}
                    loading={
                      accountStatesLoading || ratingLoading || !!traktBusy
                    }
                    onRate={handleUnifiedRate}
                    connected={!!session || trakt.connected}
                    onConnect={() => (window.location.href = "/login")}
                  />
                </div>
              </div>
              {/* Footer de Estadísticas (VISIBLE EN MÓVIL, SIN RECORTES) */}
              {!tScoreboard.loading && (
                <div className="border-t border-white/5 bg-black/10">
                  {/* Scroller con padding + safe-area para que no se recorte en bordes */}
                  <div
                    className="
        overflow-x-auto
        [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
        py-2
        pl-[calc(1rem+env(safe-area-inset-left))]
        pr-[calc(1rem+env(safe-area-inset-right))]
      "
                  >
                    {/* Inner: min-w-max evita que “aplasten”/corten el último item */}
                    <div className="flex items-center gap-3 min-w-max">
                      <div className="shrink-0">
                        <MiniStat
                          icon={Eye}
                          value={formatVoteCount(
                            tScoreboard?.stats?.watchers ?? 0,
                          )}
                          tooltip="Watchers"
                        />
                      </div>
                      <div className="shrink-0">
                        <MiniStat
                          icon={Play}
                          value={formatVoteCount(
                            tScoreboard?.stats?.plays ?? 0,
                          )}
                          tooltip="Plays"
                        />
                      </div>
                      <div className="shrink-0">
                        <MiniStat
                          icon={List}
                          value={formatVoteCount(
                            tScoreboard?.stats?.lists ?? 0,
                          )}
                          tooltip="Lists"
                        />
                      </div>
                      <div className="shrink-0">
                        <MiniStat
                          icon={Heart}
                          value={formatVoteCount(
                            tScoreboard?.stats?.favorited ?? 0,
                          )}
                          tooltip="Favorited"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. CONTENEDOR TABS Y CONTENIDO - Oculto si es backdrop (se muestra abajo) */}
            {!isBackdropPoster && (
              <div>
                {/* --- MENÚ DE NAVEGACIÓN --- */}
                <div className="flex flex-wrap items-center gap-6 mb-4 border-b border-white/10 pb-1">
                  {[
                    { id: "details", label: "Detalles" },
                    { id: "production", label: "Producción" },
                    { id: "synopsis", label: "Sinopsis" },
                    ...(extras.awards
                      ? [{ id: "awards", label: "Premios" }]
                      : []),
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`pb-2 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 
          ${activeTab === tab.id
                          ? "text-white border-yellow-500"
                          : "text-zinc-500 border-transparent hover:text-zinc-300"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* --- ÁREA DE CONTENIDO --- */}
                <div className="relative min-h-[100px]">
                  <AnimatePresence mode="wait">
                    {/* 1. SINOPSIS */}
                    {activeTab === "synopsis" && (
                      <motion.div
                        key="synopsis"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                          {data.tagline && (
                            <div className="text-yellow-500/80 text-lg font-serif italic mb-3">
                              “{data.tagline}”
                            </div>
                          )}
                          <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                            {data.overview || "No hay descripción disponible."}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {/* 2. DETALLES */}
                    {activeTab === "details" && (
                      <motion.div
                        key="details"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                          <VisualMetaCard
                            icon={type === "movie" ? FilmIcon : MonitorPlay}
                            label="Título Original"
                            value={
                              type === "movie"
                                ? data.original_title
                                : data.original_name
                            }
                            expanded={true}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />

                          {/* Formato (solo TV) */}
                          {type !== "movie" ? (
                            <VisualMetaCard
                              icon={Layers}
                              label="Formato"
                              value={
                                data.number_of_seasons
                                  ? `${data.number_of_seasons} Temp. / ${data.number_of_episodes} Caps.`
                                  : "—"
                              }
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          ) : null}

                          <VisualMetaCard
                            icon={CalendarIcon}
                            label={type === "movie" ? "Estreno" : "Inicio"}
                            value={releaseDateValue || "—"}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />

                          {/* Finalización / Última emisión (solo TV) */}
                          {type !== "movie" ? (
                            <VisualMetaCard
                              icon={CalendarIcon}
                              label={
                                data.status === "Ended"
                                  ? "Finalización"
                                  : "Última emisión"
                              }
                              value={lastAirDateValue || "En emisión"}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          ) : null}

                          {/* Presupuesto + Recaudación (solo Cine) */}
                          {type === "movie" ? (
                            <>
                              <VisualMetaCard
                                icon={BadgeDollarSignIcon}
                                label="Presupuesto"
                                value={budgetValue || "—"}
                                className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                              />
                              <VisualMetaCard
                                icon={TrendingUp}
                                label="Recaudación"
                                value={revenueValue || "—"}
                                className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                              />
                            </>
                          ) : null}
                        </div>
                      </motion.div>
                    )}

                    {/* 3. PRODUCCIÓN Y EQUIPO */}
                    {activeTab === "production" && (
                      <motion.div
                        key="production"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                          {/* Director (Cine) / Creadores (TV) */}
                          <VisualMetaCard
                            icon={Users}
                            label={type === "movie" ? "Director" : "Creadores"}
                            value={
                              type === "movie"
                                ? movieDirector || "Desconocido"
                                : createdByNames || "Desconocido"
                            }
                            expanded={true}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />

                          {/* Canal (solo TV) */}
                          {type !== "movie" ? (
                            <VisualMetaCard
                              icon={MonitorPlay}
                              label="Canal"
                              value={network || "—"}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          ) : null}

                          {/* Producción (ambos) */}
                          <VisualMetaCard
                            icon={Building2}
                            label="Producción"
                            value={production || "—"}
                            expanded={true}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* 4. PREMIOS */}
                    {activeTab === "awards" && extras.awards && (
                      <motion.div
                        key="awards"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent p-6">
                          <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none" />

                          <div className="flex items-start gap-4 relative z-10">
                            <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
                              <Trophy className="w-8 h-8" />
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-white mb-2">
                                Reconocimientos
                              </h3>
                              <p className="text-base font-medium text-yellow-100/90 leading-relaxed whitespace-pre-line">
                                {extras.awards}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ✅ TABS Y CONTENIDO DEBAJO DE LA TARJETA (solo cuando es backdrop) */}
        {isBackdropPoster && (
          <div className="mt-8 w-full">
            {/* --- MENÚ DE NAVEGACIÓN --- */}
            <div className="flex flex-wrap items-center gap-6 mb-4 border-b border-white/10 pb-1">
              {[
                { id: "details", label: "Detalles" },
                { id: "production", label: "Producción" },
                { id: "synopsis", label: "Sinopsis" },
                ...(extras.awards
                  ? [{ id: "awards", label: "Premios" }]
                  : []),
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 
        ${activeTab === tab.id
                      ? "text-white border-yellow-500"
                      : "text-zinc-500 border-transparent hover:text-zinc-300"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* --- ÁREA DE CONTENIDO --- */}
            <div className="relative min-h-[100px]">
              <AnimatePresence mode="wait">
                {/* 1. SINOPSIS */}
                {activeTab === "synopsis" && (
                  <motion.div
                    key="synopsis-backdrop"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                      {data.tagline && (
                        <div className="text-yellow-500/80 text-lg font-serif italic mb-3">
                          "{data.tagline}"
                        </div>
                      )}
                      <p className="text-zinc-200 text-base md:text-lg leading-relaxed text-justify whitespace-pre-line">
                        {data.overview || "No hay descripción disponible."}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* 2. DETALLES */}
                {activeTab === "details" && (
                  <motion.div
                    key="details-backdrop"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                      <VisualMetaCard
                        icon={type === "movie" ? FilmIcon : MonitorPlay}
                        label="Título Original"
                        value={
                          type === "movie"
                            ? data.original_title
                            : data.original_name
                        }
                        expanded={true}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />

                      {type !== "movie" ? (
                        <VisualMetaCard
                          icon={Layers}
                          label="Formato"
                          value={
                            data.number_of_seasons
                              ? `${data.number_of_seasons} Temp. / ${data.number_of_episodes} Caps.`
                              : "—"
                          }
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      ) : null}

                      <VisualMetaCard
                        icon={CalendarIcon}
                        label={type === "movie" ? "Estreno" : "Inicio"}
                        value={releaseDateValue || "—"}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />

                      {type !== "movie" && lastAirDateValue && (
                        <VisualMetaCard
                          icon={CalendarIcon}
                          label={
                            data.status === "Ended"
                              ? "Finalización"
                              : "Última emisión"
                          }
                          value={lastAirDateValue}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      )}

                      {type === "movie" && (
                        <>
                          {budgetValue && (
                            <VisualMetaCard
                              icon={BadgeDollarSignIcon}
                              label="Presupuesto"
                              value={budgetValue}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          )}
                          {revenueValue && (
                            <VisualMetaCard
                              icon={TrendingUp}
                              label="Recaudación"
                              value={revenueValue}
                              className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* 3. PRODUCCIÓN */}
                {activeTab === "production" && (
                  <motion.div
                    key="production-backdrop"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                      <VisualMetaCard
                        icon={Users}
                        label={type === "movie" ? "Director" : "Creadores"}
                        value={
                          type === "movie"
                            ? movieDirector || "Desconocido"
                            : createdByNames || "Desconocido"
                        }
                        expanded={true}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />

                      {type !== "movie" && network && (
                        <VisualMetaCard
                          icon={MonitorPlay}
                          label="Canal"
                          value={network}
                          className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                        />
                      )}

                      <VisualMetaCard
                        icon={Building2}
                        label="Producción"
                        value={production || "—"}
                        expanded={true}
                        className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                      />
                    </div>
                  </motion.div>
                )}

                {/* 4. PREMIOS */}
                {activeTab === "awards" && extras.awards && (
                  <motion.div
                    key="awards-backdrop"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="relative overflow-hidden rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent p-6">
                      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none" />

                      <div className="flex items-start gap-4 relative z-10">
                        <div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500 shrink-0">
                          <Trophy className="w-8 h-8" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-2">
                            Reconocimientos
                          </h3>
                          <p className="text-base font-medium text-yellow-100/90 leading-relaxed whitespace-pre-line">
                            {extras.awards}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* ✅ MENÚ GLOBAL + CONTENIDO (tipo ActorDetails) */}
        <div className="sm:mt-10">
          {/* sentinel para detectar cuándo el menú “pega” */}
          <div ref={sentinelRef} className="h-px w-full" />

          {/* ✅ Sticky debajo del navbar */}
          <div
            ref={menuStickyRef}
            className="sticky z-30 py-2"
            style={{
              top: STICKY_TOP,
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          >
            <DetailsSectionMenu
              items={sectionItems}
              activeId={activeSectionId}
              onChange={scrollToSection}
            />
          </div>

          {/* ✅ TODAS las secciones en orden (sin ocultar) */}
          <div className="mt-6 space-y-14">
            <section id="section-media" ref={registerSection("media")}>
              {/* ✅ PORTADAS Y FONDOS */}
              {(type === "movie" || type === "tv") && (
                <section className="mb-16" ref={artworkControlsWrapRef}>
                  {/* ✅ Header: TODO alineado en UNA SOLA FILA con el título */}
                  <div className="mb-6 flex items-center justify-between gap-3">
                    {/* ✅ Mantiene tamaño del título como antes, y quitamos el mb interno para no desalinear */}
                    <SectionTitle
                      title="Portadas y fondos"
                      icon={ImageIcon}
                      className="mb-0 mt-4"
                    />

                    {/* ✅ Misma altura que el título en desktop (md:text-3xl + py-1 ≈ 44px) */}
                    <div className="flex items-center gap-2 sm:gap-3 h-10 md:h-11">
                      {/* ===================== DESKTOP: tabs + filtros en línea ===================== */}
                      <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end h-10 md:h-11">
                        {/* Tabs */}
                        <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10 w-fit h-10 md:h-11">
                          {["posters", "backdrops", "background"].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setActiveImagesTab(tab)}
                              className={`h-8 md:h-9 px-3 rounded-lg text-xs font-semibold transition-all
              ${activeImagesTab === tab
                                  ? "bg-white/10 text-white shadow"
                                  : "text-zinc-400 hover:text-zinc-200"
                                }`}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {tab === "posters"
                                ? "Portada"
                                : tab === "backdrops"
                                  ? "Vista previa"
                                  : "Fondo"}
                            </button>
                          ))}
                        </div>

                        {/* Resolución (sin label superior) */}
                        <div ref={resMenuRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setResMenuOpen((v) => !v)}
                            className="h-10 md:h-11 inline-flex items-center justify-between gap-2 min-w-[150px]
            px-3 rounded-xl bg-neutral-800/80 border border-white/10
            hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/15 transition-all duration-300
            text-sm text-zinc-200"
                            title="Resolución"
                            aria-label="Resolución"
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span className="text-[10px] font-extrabold tracking-wider text-zinc-400/90">
                                RES
                              </span>
                              <span className="font-semibold">
                                {imagesResFilter === "all"
                                  ? "Todas"
                                  : imagesResFilter === "720p"
                                    ? "720p"
                                    : imagesResFilter === "1080p"
                                      ? "1080p"
                                      : imagesResFilter === "2k"
                                        ? "2K"
                                        : "4K"}
                              </span>
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${resMenuOpen ? "rotate-180" : ""}`}
                            />
                          </button>

                          <AnimatePresence>
                            {resMenuOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                transition={{ duration: 0.14, ease: "easeOut" }}
                                className="absolute left-0 top-full z-[9999] mt-2 w-44 rounded-2xl
                border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden backdrop-blur"
                              >
                                <div className="py-1">
                                  {[
                                    { id: "all", label: "Todas" },
                                    { id: "720p", label: "720p" },
                                    { id: "1080p", label: "1080p" },
                                    { id: "2k", label: "2K" },
                                    { id: "4k", label: "4K" },
                                  ].map((opt) => {
                                    const active = imagesResFilter === opt.id;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                          setImagesResFilter(opt.id);
                                          setResMenuOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between
                        transition ${active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5"}`}
                                      >
                                        <span className="font-semibold">
                                          {opt.label}
                                        </span>
                                        {active && (
                                          <Check className="w-4 h-4 text-emerald-300" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Idioma (sin label) */}
                        {activeImagesTab !== "background" && (
                          <div
                            className="h-10 md:h-11 flex items-center rounded-xl bg-neutral-800/80 border border-white/10 p-1"
                            title="Idioma"
                            aria-label="Idioma"
                          >
                            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                              <button
                                type="button"
                                onClick={() => setLangES((v) => !v)}
                                className={`h-8 md:h-9 px-3 rounded-md text-xs font-semibold transition-all
                ${langES ? "bg-white/10 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
                                style={{
                                  WebkitTapHighlightColor: "transparent",
                                }}
                              >
                                ES
                              </button>
                              <button
                                type="button"
                                onClick={() => setLangEN((v) => !v)}
                                className={`h-8 md:h-9 px-3 rounded-md text-xs font-semibold transition-all
                ${langEN ? "bg-white/10 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
                                style={{
                                  WebkitTapHighlightColor: "transparent",
                                }}
                              >
                                EN
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ===================== MÓVIL: botón filtros + reset ===================== */}
                      <button
                        type="button"
                        onClick={() => {
                          setArtworkControlsOpen((v) => !v);
                          setResMenuOpen(false);
                        }}
                        className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl
        border border-white/10 bg-neutral-800/80 text-zinc-200
        hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/20 transition-all duration-300
        transform-gpu hover:-translate-y-0.5"
                        title="Filtros"
                        aria-label="Filtros"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <SlidersHorizontal className="w-5 h-5" />
                      </button>

                      <button
                        type="button"
                        onClick={handleResetArtwork}
                        className="inline-flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl
        border border-red-500/30 bg-red-500/10 text-red-400
        hover:text-red-300 hover:bg-red-500/15 hover:border-red-500/45 transition"
                        title="Restaurar valores por defecto"
                        aria-label="Restaurar valores por defecto"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* ✅ Panel móvil desplegable en 2 filas máximo */}
                  <AnimatePresence>
                    {artworkControlsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="sm:hidden mb-4"
                      >
                        <div>
                          {/* Todo en una sola fila con iconos */}
                          <div className="flex items-center gap-2">
                            {/* Tabs con iconos - compacto */}
                            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
                              <button
                                type="button"
                                onClick={() => setActiveImagesTab("posters")}
                                className={`p-2 rounded-lg transition-all ${activeImagesTab === "posters"
                                  ? "bg-white/10 text-white shadow"
                                  : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                style={{
                                  WebkitTapHighlightColor: "transparent",
                                }}
                                title="Portada"
                              >
                                <ImageIcon className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveImagesTab("backdrops")}
                                className={`p-2 rounded-lg transition-all ${activeImagesTab === "backdrops"
                                  ? "bg-white/10 text-white shadow"
                                  : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                style={{
                                  WebkitTapHighlightColor: "transparent",
                                }}
                                title="Vista previa"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveImagesTab("background")}
                                className={`p-2 rounded-lg transition-all ${activeImagesTab === "background"
                                  ? "bg-white/10 text-white shadow"
                                  : "text-zinc-400 hover:text-zinc-200"
                                  }`}
                                style={{
                                  WebkitTapHighlightColor: "transparent",
                                }}
                                title="Fondo"
                              >
                                <Layers className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Resolución móvil - más compacto */}
                            <div ref={resMenuRef} className="relative flex-1">
                              <button
                                type="button"
                                onClick={() => setResMenuOpen((v) => !v)}
                                className="h-10 w-full inline-flex items-center justify-between gap-2
                  px-3 rounded-xl bg-black/35 border border-white/10
                  hover:bg-black/45 hover:border-white/15 transition text-sm text-zinc-200"
                                title="Resolución"
                                aria-label="Resolución"
                                style={{
                                  WebkitTapHighlightColor: "transparent",
                                }}
                              >
                                <span className="inline-flex items-center gap-2 truncate">
                                  <span className="text-[10px] font-extrabold tracking-wider text-zinc-400/90">
                                    RES
                                  </span>
                                  <span className="font-semibold truncate">
                                    {imagesResFilter === "all"
                                      ? "Todas"
                                      : imagesResFilter === "720p"
                                        ? "720p"
                                        : imagesResFilter === "1080p"
                                          ? "1080p"
                                          : imagesResFilter === "2k"
                                            ? "2K"
                                            : "4K"}
                                  </span>
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 shrink-0 transition-transform ${resMenuOpen ? "rotate-180" : ""}`}
                                />
                              </button>

                              <AnimatePresence>
                                {resMenuOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                    transition={{
                                      duration: 0.14,
                                      ease: "easeOut",
                                    }}
                                    className="absolute left-0 top-full z-[9999] mt-2 w-full rounded-2xl
                      border border-white/10 bg-[#101010]/95 shadow-2xl overflow-hidden backdrop-blur"
                                  >
                                    <div className="py-1">
                                      {[
                                        { id: "all", label: "Todas" },
                                        { id: "720p", label: "720p" },
                                        { id: "1080p", label: "1080p" },
                                        { id: "2k", label: "2K" },
                                        { id: "4k", label: "4K" },
                                      ].map((opt) => {
                                        const active =
                                          imagesResFilter === opt.id;
                                        return (
                                          <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => {
                                              setImagesResFilter(opt.id);
                                              setResMenuOpen(false);
                                            }}
                                            className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between
                              transition ${active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5"}`}
                                          >
                                            <span className="font-semibold">
                                              {opt.label}
                                            </span>
                                            {active && (
                                              <Check className="w-4 h-4 text-emerald-300" />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>

                            {/* Idioma móvil - compacto */}
                            {activeImagesTab !== "background" && (
                              <div className="flex gap-1.5 bg-black/35 border border-white/10 rounded-xl p-1.5 h-10">
                                <button
                                  type="button"
                                  onClick={() => setLangES((v) => !v)}
                                  className={`px-3 rounded-lg text-xs font-medium transition-all ${langES
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                                    }`}
                                  style={{
                                    WebkitTapHighlightColor: "transparent",
                                  }}
                                >
                                  ES
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLangEN((v) => !v)}
                                  className={`px-3 rounded-lg text-xs font-medium transition-all ${langEN
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                                    }`}
                                  style={{
                                    WebkitTapHighlightColor: "transparent",
                                  }}
                                >
                                  EN
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!!imagesError && (
                    <div className="text-sm text-red-400 mb-3">
                      {imagesError}
                    </div>
                  )}

                  {(() => {
                    const {
                      ordered,
                      isPoster,
                      isBackdropTab,
                      aspect,
                      size,
                      activePath,
                    } = artworkSelection;

                    if (!ordered || ordered.length === 0) {
                      return (
                        <div className="text-sm text-zinc-400">
                          No hay imágenes disponibles con los filtros actuales.
                        </div>
                      );
                    }

                    // ✅ 2 en móvil y 4 en desktop para backdrops (vista previa / fondo)
                    const isBackdropLike = activeImagesTab !== "posters";

                    const breakpoints = isPoster
                      ? {
                        500: { slidesPerView: 3, spaceBetween: 14 },
                        640: { slidesPerView: 4, spaceBetween: 14 },
                        768: { slidesPerView: 5, spaceBetween: 16 },
                        1024: { slidesPerView: 6, spaceBetween: 18 },
                        1280: { slidesPerView: 7, spaceBetween: 18 },
                      }
                      : {
                        0: { slidesPerView: 2, spaceBetween: 12 },
                        640: { slidesPerView: 3, spaceBetween: 14 },
                        768: { slidesPerView: 4, spaceBetween: 16 },
                        1024: { slidesPerView: 4, spaceBetween: 18 },
                        1280: { slidesPerView: 4, spaceBetween: 20 },
                      };

                    return (
                      <div className="relative overflow-x-hidden overflow-y-visible">
                        {/* Skeleton mientras se precargan las primeras N */}
                        {!artworkRowReady && (
                          <div
                            className="grid pb-8 pt-3"
                            style={{
                              gridTemplateColumns: `repeat(${Math.min(artworkPreloadCount, isPoster ? 7 : 4)}, 1fr)`,
                              gap: isPoster ? "18px" : "20px",
                            }}
                          >
                            {Array.from({
                              length: Math.min(
                                artworkPreloadCount,
                                isPoster ? 7 : 4,
                              ),
                            }).map((_, i) => (
                              <div
                                key={i}
                                className={`rounded-2xl bg-white/5 animate-pulse ${aspect}`}
                              />
                            ))}
                          </div>
                        )}

                        {/* Carrusel: aparece "de golpe" cuando ya están cargadas */}
                        <div
                          style={{
                            opacity: artworkRowReady ? 1 : 0,
                            pointerEvents: artworkRowReady ? "auto" : "none",
                          }}
                        >
                          <Swiper
                            key={activeImagesTab}
                            spaceBetween={12}
                            slidesPerView={isBackdropLike ? 2 : 3}
                            breakpoints={breakpoints}
                            className="pb-8"
                          >
                            {ordered.map((img, index) => {
                              const filePath = img?.file_path;
                              if (!filePath) return null;

                              const isActive = activePath === filePath;
                              const resText = imgResLabel(img);
                              const isPriority = index < artworkPreloadCount;
                              const imgAlt = isPoster
                                ? `Portada de ${title}`
                                : isBackdropTab
                                  ? `Vista previa de ${title}`
                                  : `Fondo de ${title}`;

                              const imgSrc = `https://image.tmdb.org/t/p/${size}${filePath}`;
                              const imgSrcSet = isPoster
                                ? `https://image.tmdb.org/t/p/w185${filePath} 185w, https://image.tmdb.org/t/p/w342${filePath} 342w, https://image.tmdb.org/t/p/w500${filePath} 500w`
                                : `https://image.tmdb.org/t/p/w300${filePath} 300w, https://image.tmdb.org/t/p/w780${filePath} 780w, https://image.tmdb.org/t/p/w1280${filePath} 1280w`;
                              const imgSizes = isPoster
                                ? "(max-width: 640px) 32vw, (max-width: 1024px) 20vw, 140px"
                                : "(max-width: 640px) 50vw, (max-width: 1024px) 30vw, 240px";

                              return (
                                <SwiperSlide
                                  key={filePath}
                                  className="h-full pt-3 pb-3"
                                >
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      if (activeImagesTab === "posters")
                                        handleSelectPoster(filePath);
                                      else if (activeImagesTab === "backdrops")
                                        handleSelectPreviewBackdrop(filePath);
                                      else handleSelectBackground(filePath);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        if (activeImagesTab === "posters")
                                          handleSelectPoster(filePath);
                                        else if (
                                          activeImagesTab === "backdrops"
                                        )
                                          handleSelectPreviewBackdrop(filePath);
                                        else handleSelectBackground(filePath);
                                      }
                                    }}
                                    className={`group relative w-full rounded-2xl overflow-hidden border-2 cursor-pointer
                        transition-all duration-300 transform-gpu hover:-translate-y-1
                        ${isActive
                                        ? "border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/30"
                                        : "border-white/10 bg-black/25 hover:bg-black/35 hover:border-yellow-500/40"
                                      }`}
                                    title="Seleccionar"
                                    style={{
                                      WebkitTapHighlightColor: "transparent",
                                    }}
                                  >
                                    <div
                                      className={`w-full ${aspect} bg-black/40`}
                                    >
                                      <img
                                        src={imgSrc}
                                        srcSet={imgSrcSet}
                                        sizes={imgSizes}
                                        alt={imgAlt}
                                        loading={isPriority ? "eager" : "lazy"}
                                        fetchPriority={
                                          isPriority ? "high" : "auto"
                                        }
                                        decoding="async"
                                        className="w-full h-full object-cover transition-transform duration-700 transform-gpu
                            group-hover:scale-[1.08]"
                                      />
                                    </div>

                                    {isActive && (
                                      <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-400 rounded-full shadow-lg shadow-emerald-500/50 ring-2 ring-white/20" />
                                    )}

                                    {resText && (
                                      <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span
                                          className="text-[10px] font-bold tracking-wide px-2 py-1 rounded-full
                            bg-black/70 border border-white/15 text-zinc-100"
                                        >
                                          {resText}
                                        </span>
                                      </div>
                                    )}

                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyImageUrl(filePath);
                                      }}
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === " "
                                        ) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleCopyImageUrl(filePath);
                                        }
                                      }}
                                      className="absolute bottom-2 right-2 p-1.5 bg-black/60 rounded-lg text-white
                          opacity-0 group-hover:opacity-100 hover:bg-black transition-opacity"
                                      title="Copiar URL"
                                    >
                                      <LinkIcon size={14} />
                                    </div>
                                  </div>
                                </SwiperSlide>
                              );
                            })}
                          </Swiper>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              )}

              {/* === TRÁILER Y VÍDEOS === */}
              {TMDB_API_KEY && (
                <section className="mt-6">
                  <SectionTitle title="Tráiler y vídeos" icon={MonitorPlay} />

                  <div className="rounded-2xl p-0 mb-10">
                    {videosLoading && (
                      <div className="text-sm text-zinc-400 inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando
                        vídeos…
                      </div>
                    )}

                    {!!videosError && (
                      <div className="text-sm text-red-400">{videosError}</div>
                    )}

                    {!videosLoading && !videosError && videos.length === 0 && (
                      <div className="text-sm text-zinc-400">
                        No hay tráileres o vídeos disponibles en TMDb para este
                        título.
                      </div>
                    )}

                    {videos.length > 0 && (
                      <Swiper
                        spaceBetween={12}
                        slidesPerView={2}
                        breakpoints={{
                          640: { slidesPerView: 2, spaceBetween: 16 },
                          768: { slidesPerView: 3, spaceBetween: 16 },
                          1024: { slidesPerView: 4, spaceBetween: 16 },
                          1280: { slidesPerView: 4, spaceBetween: 16 },
                        }}
                        className="pb-2"
                      >
                        {videos.slice(0, 20).map((v) => {
                          const thumb = videoThumbUrl(v);
                          const fallbackPath =
                            displayBackdropPath || displayPosterPath;
                          const fallback = fallbackPath
                            ? `https://image.tmdb.org/t/p/w780${fallbackPath}`
                            : "/placeholder.png";

                          return (
                            <SwiperSlide
                              key={`${v.site}:${v.key}`}
                              className="h-full"
                            >
                              <button
                                type="button"
                                onClick={() => openVideo(v)}
                                title={v.name || "Ver vídeo"}
                                className="w-full h-full text-left flex flex-col rounded-2xl overflow-hidden
                            border border-white/10 bg-black/25 hover:bg-black/35 hover:border-yellow-500/30 transition"
                              >
                                <div className="relative aspect-video overflow-hidden">
                                  <img
                                    src={thumb || fallback}
                                    alt={v.name || "Video"}
                                    className="w-full h-full object-cover transform-gpu transition-transform duration-500 hover:scale-[1.05]"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-14 h-14 rounded-full bg-black/55 border border-white/15 flex items-center justify-center transition-transform hover:scale-105">
                                      <Play className="w-7 h-7 text-yellow-300 translate-x-[1px]" />
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col flex-1 p-4 items-start">
                                  {/* ✅ Título arriba (1 línea siempre) */}
                                  <div className="w-full min-h-[22px]">
                                    <div className="font-bold text-white leading-snug text-sm sm:text-[16px] line-clamp-1 truncate">
                                      {v.name || "Vídeo"}
                                    </div>
                                  </div>

                                  {/* ✅ Propiedades debajo, alineadas a la izquierda */}
                                  <div className="mt-3 flex items-center gap-1.5 w-full overflow-hidden">
                                    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar">
                                      {/* Label de Oficial - Agregado shrink-0 */}
                                      {v.official && (
                                        <span className="shrink-0 whitespace-nowrap text-[9px] sm:text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 flex items-center gap-0.5">
                                          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                                          OFFICIAL
                                        </span>
                                      )}

                                      {/* Label de Tipo (Trailer, Teaser, etc) - Agregado shrink-0 */}
                                      {v.type && (
                                        <span className="shrink-0 whitespace-nowrap text-[9px] sm:text-[10px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded bg-zinc-800 border border-white/10 text-zinc-300">
                                          {v.type}
                                        </span>
                                      )}

                                      {/* Label de Idioma - Agregado shrink-0 */}
                                      {v.iso_639_1 && (
                                        <span className="shrink-0 whitespace-nowrap text-[9px] sm:text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                                          {v.iso_639_1}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* ✅ Fuente y fecha abajo, mismo margen izquierdo */}
                                  <div className="mt-auto pt-3 text-xs text-zinc-400 flex items-center gap-2">
                                    <span className="font-semibold text-zinc-200">
                                      {v.site || "—"}
                                    </span>
                                    {v.published_at && (
                                      <>
                                        <span className="text-zinc-600">·</span>
                                        <span className="shrink-0">
                                          {new Date(
                                            v.published_at,
                                          ).toLocaleDateString("es-ES")}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </button>
                            </SwiperSlide>
                          );
                        })}
                      </Swiper>
                    )}
                  </div>
                </section>
              )}
            </section>

            <section id="section-sentiment" ref={registerSection("sentiment")}>
              {/* ===================================================== */}
              {/* ✅ TRAKT: SENTIMIENTOS (AI SUMMARY) */}
              <section className="mb-12">
                <SectionTitle
                  title="Análisis de Sentimientos"
                  icon={Sparkles}
                />

                <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm shadow-2xl">
                  {/* Header del bloque */}
                  <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-inner">
                        <img
                          src="/logo-Trakt.png"
                          alt="Trakt"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <h3 className="text-base font-bold leading-tight text-white">
                          Trakt Community Pulse
                        </h3>
                        <p className="text-xs font-medium text-zinc-400">
                          Resumen por IA basado en comentarios sobre{" "}
                          <span className="text-zinc-200">{title}</span>
                        </p>
                      </div>
                    </div>
                    {tSentiment.loading && (
                      <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                    )}
                  </div>

                  <div className="p-6">
                    {tSentiment.error ? (
                      <div className="rounded-xl bg-red-500/10 p-4 text-center text-sm font-medium text-red-400 border border-red-500/20">
                        {tSentiment.error}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        {/* Columna Positiva */}
                        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-transparent p-5">
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                              <ThumbsUp className="h-4 w-4" />
                            </div>
                            <span className="font-bold tracking-wide text-emerald-100">
                              Lo Bueno
                            </span>
                          </div>

                          {tSentiment.pros?.length ? (
                            <ul className="space-y-3">
                              {tSentiment.pros.map((s, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                                >
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm italic text-zinc-500">
                              No hay suficientes datos positivos.
                            </div>
                          )}
                        </div>

                        {/* Columna Negativa */}
                        <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-500/10 to-transparent p-5">
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                              <ThumbsDown className="h-4 w-4" />
                            </div>
                            <span className="font-bold tracking-wide text-rose-100">
                              Lo Malo
                            </span>
                          </div>

                          {tSentiment.cons?.length ? (
                            <ul className="space-y-3">
                              {tSentiment.cons.map((s, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                                >
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm italic text-zinc-500">
                              No hay suficientes datos negativos.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </section>

            {type === "tv" && (
              <section id="section-seasons" ref={registerSection("seasons")}>
                <section className="mb-12">
                  <SectionTitle title="Temporadas" icon={Layers} />

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tSeasons.loading && (
                      <div className="col-span-full py-10 flex justify-center">
                        <Loader2 className="animate-spin text-white/50" />
                      </div>
                    )}

                    {!tSeasons.loading &&
                      (tSeasons.items || []).map((s) => {
                        const sn = Number(s?.number);
                        const titleSeason =
                          sn === 0 ? "Especiales" : `Temporada ${sn}`;
                        const rating =
                          typeof s?.rating === "number" ? s.rating : null;

                        // Lógica de progreso (usa TMDb para saber total)
                        const tmdbSeason = (data?.seasons || []).find(
                          (x) => Number(x?.season_number) === sn,
                        );
                        const totalEp =
                          Number(tmdbSeason?.episode_count || 0) || null;
                        const watchedEp = Array.isArray(watchedBySeason?.[sn])
                          ? watchedBySeason[sn].length
                          : 0;
                        const percentage = totalEp
                          ? Math.round((watchedEp / totalEp) * 100)
                          : 0;

                        const isComplete = percentage === 100;
                        const barColor = isComplete
                          ? "bg-emerald-500"
                          : "bg-yellow-500";

                        return (
                          <button
                            key={sn}
                            type="button"
                            onClick={() =>
                              router.push(`/details/tv/${id}/season/${sn}`)
                            }
                            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5
                             transition-all hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 hover:shadow-xl
                             text-left w-full"
                            title={`Ver ${titleSeason}`}
                          >
                            {/* Fondo decorativo del número de temporada */}
                            <div className="absolute -right-4 -top-6 text-[100px] font-black text-white/5 select-none transition group-hover:text-white/10">
                              {sn}
                            </div>

                            <div className="relative p-5">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="text-lg font-extrabold text-white">
                                    {titleSeason}
                                  </h4>

                                  <div className="mt-1 flex items-center gap-2 text-xs font-medium text-zinc-400">
                                    {rating != null && (
                                      <span className="flex items-center gap-1 text-yellow-400">
                                        <Star className="h-3 w-3 fill-yellow-400" />{" "}
                                        {rating.toFixed(1)}
                                      </span>
                                    )}
                                    {totalEp != null && (
                                      <span>• {totalEp} episodios</span>
                                    )}
                                  </div>
                                </div>

                                {/* Botón externo a Trakt (NO navega a la season page) */}
                                {trakt?.traktUrl && (
                                  <a
                                    href={`${trakt.traktUrl}/seasons/${sn}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.open(
                                        `${trakt.traktUrl}/seasons/${sn}`,
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-zinc-400 transition hover:bg-white hover:text-black"
                                    title="Ver en Trakt"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                              </div>

                              {/* Barra de Progreso */}
                              {totalEp != null && (
                                <div className="mt-6">
                                  <div className="mb-1.5 flex items-end justify-between text-xs font-bold">
                                    <span
                                      className={
                                        percentage > 0
                                          ? "text-white"
                                          : "text-zinc-500"
                                      }
                                    >
                                      {watchedEp}{" "}
                                      <span className="text-zinc-500 font-normal">
                                        vistos
                                      </span>
                                    </span>
                                    <span className="text-zinc-500">
                                      {percentage}%
                                    </span>
                                  </div>

                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </section>
              </section>
            )}

            {type === "tv" && (
              <section id="section-episodes" ref={registerSection("episodes")}>
                {/* --- EPISODIOS --- */}
                {type === "tv" ? (
                  <section className="mb-10">
                    <SectionTitle
                      title="Valoración de Episodios"
                      icon={TrendingUp}
                    />
                    <div className="p-2">
                      {ratingsLoading && (
                        <p className="text-sm text-gray-300 mb-2">
                          Cargando ratings…
                        </p>
                      )}
                      {ratingsError && (
                        <p className="text-sm text-red-400 mb-2">
                          {ratingsError}
                        </p>
                      )}
                      {!ratingsLoading && !ratingsError && !ratings && (
                        <p className="text-sm text-zinc-400 mb-2">
                          No hay datos de episodios disponibles.
                        </p>
                      )}
                      {!!ratings && !ratingsError && (
                        <EpisodeRatingsGrid
                          ratings={ratings}
                          showId={Number(id)}
                          initialSource="avg"
                          density="compact"
                          traktConnected={trakt.connected}
                          watchedBySeason={watchedBySeason}
                          episodeBusyKey={episodeBusyKey}
                          onToggleEpisodeWatched={toggleEpisodeWatched}
                        />
                      )}
                    </div>
                  </section>
                ) : (
                  <div className="text-sm text-zinc-400">
                    Esta sección solo aplica a series.
                  </div>
                )}
              </section>
            )}

            <section id="section-comments" ref={registerSection("comments")}>
              {/* CRÍTICAS */}
              {reviews && reviews.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center justify-between mb-2">
                    <SectionTitle
                      title="Críticas de Usuarios"
                      icon={MessageSquareIcon}
                    />
                    {reviewLimit < reviews.length && (
                      <button
                        onClick={() => setReviewLimit((prev) => prev + 2)}
                        className="text-sm text-yellow-500 hover:text-yellow-400 font-semibold uppercase tracking-wide"
                      >
                        Ver más
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reviews.slice(0, reviewLimit).map((r) => {
                      const avatar = r.author_details?.avatar_path
                        ? r.author_details.avatar_path.startsWith("/https")
                          ? r.author_details.avatar_path.slice(1)
                          : `https://image.tmdb.org/t/p/w185${r.author_details.avatar_path}`
                        : `https://ui-avatars.com/api/?name=${r.author}&background=random`;

                      return (
                        <div
                          key={r.id}
                          className="bg-neutral-800/40 p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-colors flex flex-col gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <img
                              src={avatar}
                              alt={r.author}
                              className="w-12 h-12 rounded-full object-cover shadow-lg"
                            />
                            <div>
                              <h4 className="font-bold text-white">
                                {r.author}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span>
                                  {new Date(r.created_at).toLocaleDateString()}
                                </span>
                                {r.author_details?.rating && (
                                  <span className="text-yellow-500 bg-yellow-500/10 px-2 rounded font-bold">
                                    ★ {r.author_details.rating}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-gray-300 text-sm leading-relaxed line-clamp-4 italic">
                            "{r.content.replace(/<[^>]*>?/gm, "")}"
                          </div>

                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 text-xs font-semibold hover:underline mt-auto self-start"
                          >
                            Leer review completa en TMDb &rarr;
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              {/* ===================================================== */}
              {/* ✅ TRAKT: COMENTARIOS */}
              <section className="mb-10">
                <div className="mb-2 flex items-center justify-between gap-4">
                  {/* ✅ Mantiene SectionTitle (mismo tamaño), pero sin mb interno aquí */}
                  <SectionTitle
                    title="Comentarios"
                    icon={MessageSquareIcon}
                    className="mb-0"
                  />

                  {/* ✅ Bloque derecho centrado al título */}
                  <div className="flex items-center gap-2 h-10 md:h-11 transform-gpu -translate-y-[3px] md:-translate-y-[10px]">
                    <a
                      href={
                        trakt?.traktUrl
                          ? `${trakt.traktUrl}/comments`
                          : `https://trakt.tv/search?query=${encodeURIComponent(title)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/5
        px-4 h-10 md:h-11 text-xs font-bold uppercase tracking-wider text-zinc-300 transition
        hover:border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-400"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <span className="hidden sm:inline">Ver en Trakt</span>
                      {tComments.total > 0 && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white">
                          {tComments.total}
                        </span>
                      )}
                      <ExternalLink className="h-3 w-3 opacity-50 transition group-hover:opacity-100" />
                    </a>

                    <a
                      href={
                        trakt?.traktUrl
                          ? `${trakt.traktUrl}/comments`
                          : `https://trakt.tv/search?query=${encodeURIComponent(title)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-full bg-white text-black
        px-4 h-10 md:h-11 text-xs font-bold uppercase tracking-wider transition hover:bg-zinc-200"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <Plus className="h-3 w-3" />
                      <span className="hidden sm:inline">Escribir</span>
                    </a>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur-sm">
                  {/* Filtros estilo Tabs Modernos */}
                  <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-4 py-3">
                    <div className="flex gap-1 rounded-xl bg-black/40 p-1">
                      {[
                        { id: "likes30", label: "Top 30 Días" },
                        { id: "likesAll", label: "Top Histórico" },
                        { id: "recent", label: "Recientes" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTCommentsTab(t.id)}
                          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${tCommentsTab === t.id
                            ? "bg-zinc-700 text-white shadow-md"
                            : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {tComments.loading && (
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                    )}
                  </div>

                  <div className="space-y-4 p-4 sm:p-6">
                    {tComments.error && (
                      <div className="text-center text-sm text-red-400">
                        {tComments.error}
                      </div>
                    )}

                    {!tComments.loading &&
                      !tComments.error &&
                      (tComments.items || []).length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                          <MessageSquareIcon className="mb-2 h-8 w-8 opacity-20" />
                          <p className="text-sm">Sé el primero en comentar.</p>
                        </div>
                      )}

                    {(tComments.items || []).slice(0, 10).map((c) => {
                      const user = c?.user || {};
                      const avatar =
                        user?.images?.avatar?.full ||
                        user?.images?.avatar?.medium ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || user?.username || "User")}`;
                      const text = stripHtml(
                        c?.comment?.comment ?? c?.comment ?? "",
                      );
                      const created = c?.created_at
                        ? formatDateTimeEs(c.created_at)
                        : "";
                      const likes = Number(c?.likes || 0);

                      return (
                        <div
                          key={String(c?.id || `${user?.username}-${created}`)}
                          className="group relative flex gap-4 rounded-2xl bg-white/5 p-5 transition hover:bg-white/10"
                        >
                          {/* Avatar */}
                          <div className="shrink-0">
                            <img
                              src={avatar}
                              alt={user?.username}
                              className="h-12 w-12 rounded-full object-cover shadow-lg ring-2 ring-white/10 transition group-hover:ring-white/20"
                            />
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white group-hover:text-yellow-400 transition-colors cursor-pointer">
                                  {user?.name || user?.username || "Usuario"}
                                </span>
                                {user?.vip && (
                                  <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold text-yellow-500">
                                    VIP
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-zinc-500">
                                {created}
                              </span>
                            </div>

                            <div className="relative text-sm leading-relaxed text-zinc-300">
                              {/* Icono de comillas decorativo */}
                              <span className="absolute -left-3 -top-1 font-serif text-4xl text-white/5">
                                “
                              </span>
                              <p className="whitespace-pre-line">{text}</p>
                            </div>

                            {/* Actions Footer */}
                            <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
                              <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-xs font-medium text-emerald-400">
                                <ThumbsUp className="h-3 w-3" /> {likes}
                              </div>
                              <a
                                href={
                                  trakt?.traktUrl
                                    ? `${trakt.traktUrl}/comments`
                                    : undefined
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="ml-auto text-xs font-semibold text-zinc-500 hover:text-white transition-colors"
                              >
                                Responder en Trakt →
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {tComments.hasMore && (
                      <button
                        type="button"
                        onClick={() =>
                          setTComments((p) => ({
                            ...p,
                            page: (p.page || 1) + 1,
                          }))
                        }
                        className="w-full rounded-xl border border-dashed border-white/10 py-4 text-xs font-bold uppercase tracking-widest text-zinc-400 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                      >
                        Cargar más comentarios
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </section>

            <section id="section-lists" ref={registerSection("lists")}>
              {/* ===================================================== */}
              {/* ✅ TRAKT: LISTAS (DISEÑO MEJORADO) */}
              <section className="mb-12">
                <div className="mb-6 flex items-center justify-between">
                  <SectionTitle title="Listas Populares" icon={ListVideo} />

                  {/* Selector de Listas */}
                  <div className="flex rounded-lg bg-white/5 p-1 border border-white/10 backdrop-blur-md">
                    {["popular", "trending"].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setTListsTab(tab)}
                        className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all rounded-md ${tListsTab === tab
                          ? "bg-white text-black shadow-lg scale-105"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                          }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {tLists.loading ? (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                      <span className="text-sm font-medium animate-pulse">
                        Buscando listas y portadas...
                      </span>
                    </div>
                  ) : (
                    (tLists.items || []).map((row) => {
                      const list = row?.list || row || {};
                      const user = row?.user || list?.user || {};
                      const previews = row?.previewPosters || [];

                      const name = list?.name || "Lista";
                      const itemCount = Number(
                        list?.item_count || list?.items || 0,
                      );
                      const likes = Number(list?.likes || 0);
                      const username = user?.username || user?.name || null;
                      const slug = list?.ids?.slug || null;
                      const traktId = list?.ids?.trakt || null;

                      // ✅ Ruta interna (slug si existe; si no, traktId)
                      const internalUrl =
                        username && (slug || traktId)
                          ? `/lists/trakt/${encodeURIComponent(username)}/${encodeURIComponent(String(slug || traktId))}`
                          : null;

                      // (opcional) enlace externo a Trakt, pero ya NO es el click principal
                      const traktUrl =
                        username && (slug || traktId)
                          ? `https://trakt.tv/users/${username}/lists/${slug || traktId}`
                          : null;

                      const avatar =
                        user?.images?.avatar?.full ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(username || "user")}&background=random`;

                      const disabled = !internalUrl;

                      return (
                        <Link
                          key={String(traktId || `${username}-${slug}` || name)}
                          href={internalUrl || "#"}
                          aria-disabled={disabled}
                          className={[
                            "group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm transition-all duration-500",
                            "hover:border-indigo-500/30 hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]",
                            disabled ? "pointer-events-none opacity-60" : "",
                          ].join(" ")}
                        >
                          {/* 1. SECCIÓN VISUAL (PORTADAS APILADAS) */}
                          <div className="relative h-52 w-full bg-gradient-to-b from-white/5 to-transparent p-6 overflow-visible">
                            {previews.length > 0 ? (
                              <div className="h-full w-full flex items-center justify-center overflow-visible">
                                <PosterStack posters={previews} />
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center opacity-10">
                                <ListVideo className="h-20 w-20" />
                              </div>
                            )}

                            {/* Botón externo (opcional) sin romper el Link */}
                            {traktUrl && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(
                                    traktUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }}
                                className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold text-zinc-200 border border-white/10 hover:border-indigo-400/30 hover:text-white"
                                title="Ver en Trakt"
                              >
                                Trakt
                              </button>
                            )}
                          </div>

                          {/* 2. CONTENIDO DE TEXTO */}
                          <div className="relative flex flex-1 flex-col justify-between bg-black/20 p-5 backdrop-blur-md">
                            <div>
                              <h4 className="line-clamp-1 text-lg font-bold text-white transition-colors group-hover:text-indigo-400">
                                {name}
                              </h4>

                              {list?.description && (
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                  {stripHtml(list.description)}
                                </p>
                              )}
                            </div>

                            {/* Footer */}
                            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={avatar}
                                  alt={username || "user"}
                                  className="h-6 w-6 rounded-full ring-1 ring-white/20"
                                />
                                <span className="text-xs font-medium text-zinc-300 group-hover:text-white truncate max-w-[120px]">
                                  {username || "—"}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-xs font-bold text-zinc-500">
                                <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                                  {itemCount} items
                                </span>
                                <span className="flex items-center gap-1 transition-colors group-hover:text-pink-500">
                                  <ThumbsUp className="h-3 w-3" /> {likes}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>

                {tLists.hasMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      onClick={() =>
                        setTLists((p) => ({ ...p, page: (p.page || 1) + 1 }))
                      }
                      className="group relative inline-flex items-center justify-center overflow-hidden rounded-full p-0.5 font-bold focus:outline-none"
                    >
                      <span className="absolute h-full w-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
                      <span className="relative flex items-center gap-2 rounded-full bg-black px-6 py-2.5 transition-all duration-300 group-hover:bg-opacity-0">
                        <span className="bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent group-hover:text-white">
                          Cargar más listas
                        </span>
                        <ChevronDown className="h-4 w-4 text-indigo-300 group-hover:text-white" />
                      </span>
                    </button>
                  </div>
                )}
              </section>
            </section>

            {collectionId && (
              <section
                id="section-collection"
                ref={registerSection("collection")}
              >
                {/* --- COLECCIÓN --- */}
                <section className="mb-10">
                  <SectionTitle title="Colección" icon={Layers} />

                  {collectionLoading ? (
                    <div className="mt-4 text-sm text-zinc-400">
                      Cargando colección…
                    </div>
                  ) : collectionData?.items?.length ? (
                    <Swiper
                      spaceBetween={12}
                      slidesPerView={3}
                      breakpoints={{
                        500: { slidesPerView: 3, spaceBetween: 14 },
                        768: { slidesPerView: 4, spaceBetween: 16 },
                        1024: { slidesPerView: 5, spaceBetween: 18 },
                        1280: { slidesPerView: 6, spaceBetween: 20 },
                      }}
                      className="pb-8"
                    >
                      {collectionData.items.map((m) => (
                        <SwiperSlide key={m.id}>
                          <a
                            href={`/details/movie/${m.id}`}
                            className="mt-3 block group relative bg-neutral-800/80 rounded-xl overflow-hidden shadow-lg border border-transparent hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:-translate-y-1"
                            title={m.title}
                          >
                            <div className="aspect-[2/3] overflow-hidden relative">
                              {m.poster_path ? (
                                <img
                                  src={`https://image.tmdb.org/t/p/w342${m.poster_path}`}
                                  alt={m.title}
                                  className="w-full h-full object-cover transition-transform duration-500 transform-gpu group-hover:scale-[1.06]"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                                  <ImageOff className="w-10 h-10 opacity-60" />
                                </div>
                              )}

                              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-75 group-hover:opacity-90 transition-opacity duration-300" />
                              <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                                <p className="text-white font-extrabold text-[11px] sm:text-sm leading-tight line-clamp-1">
                                  {m.title}
                                </p>
                                {m.release_date ? (
                                  <p className="text-gray-300 text-[10px] sm:text-xs leading-tight line-clamp-1">
                                    {m.release_date?.slice(0, 4)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </a>
                        </SwiperSlide>
                      ))}
                    </Swiper>
                  ) : (
                    <div className="mt-4 text-sm text-zinc-400">
                      No hay datos de colección.
                    </div>
                  )}
                </section>
              </section>
            )}

            <section id="section-cast" ref={registerSection("cast")}>
              {/* === REPARTO PRINCIPAL (Cast) === */}
              {castData && castData.length > 0 && (
                <section className="mb-16">
                  <SectionTitle title="Reparto Principal" icon={Users} />
                  <Swiper
                    spaceBetween={12}
                    slidesPerView={3}
                    breakpoints={{
                      500: { slidesPerView: 3, spaceBetween: 14 },
                      768: { slidesPerView: 4, spaceBetween: 16 },
                      1024: { slidesPerView: 5, spaceBetween: 18 },
                      1280: { slidesPerView: 6, spaceBetween: 20 },
                    }}
                    className="pb-8"
                  >
                    {castDataForUI.slice(0, 20).map((actor) => (
                      <SwiperSlide key={actor.id}>
                        <a
                          href={`/details/person/${actor.id}`}
                          className="mt-3 block group relative bg-neutral-800/80 rounded-xl overflow-hidden shadow-lg border border-transparent hover:border-yellow-500/60 hover:shadow-2xl hover:shadow-yellow-500/25 transition-all duration-300 transform-gpu hover:-translate-y-1"
                        >
                          <div className="aspect-[2/3] overflow-hidden relative">
                            {actor.profile_path ? (
                              <img
                                src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                                alt={actor.name}
                                className="w-full h-full object-cover transition-transform duration-500 transform-gpu group-hover:scale-[1.10] group-hover:-translate-y-1 group-hover:rotate-[0.4deg] group-hover:grayscale-0 grayscale-[18%]"
                              />
                            ) : (
                              <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500">
                                <UsersIconComponent size={40} />
                              </div>
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-75 group-hover:opacity-90 transition-opacity duration-300" />

                            <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
                              <p className="text-white font-extrabold text-[11px] sm:text-sm leading-tight line-clamp-1">
                                {actor.name}
                              </p>
                              <p className="text-gray-300 text-[10px] sm:text-xs leading-tight line-clamp-1">
                                {actor.character}
                              </p>
                            </div>
                          </div>
                        </a>
                      </SwiperSlide>
                    ))}
                  </Swiper>
                </section>
              )}
            </section>

            <section id="section-recs" ref={registerSection("recs")}>
              {/* === RECOMENDACIONES === */}
              {recommendations && recommendations.length > 0 && (
                <section className="mb-16">
                  <SectionTitle title="Recomendaciones" icon={MonitorPlay} />

                  <Swiper
                    spaceBetween={12}
                    slidesPerView={3}
                    breakpoints={{
                      500: { slidesPerView: 3, spaceBetween: 14 },
                      768: { slidesPerView: 4, spaceBetween: 16 },
                      1024: { slidesPerView: 5, spaceBetween: 18 },
                      1280: { slidesPerView: 6, spaceBetween: 20 },
                    }}
                  >
                    {recommendations.slice(0, 15).map((rec) => {
                      const recTitle = rec.title || rec.name;
                      const recDate =
                        rec.release_date || rec.first_air_date || "";
                      const recYear = recDate ? recDate.slice(0, 4) : "";
                      const isMovie = rec.media_type
                        ? rec.media_type === "movie"
                        : type === "movie";

                      const tmdbScore =
                        typeof rec.vote_average === "number" &&
                          rec.vote_average > 0
                          ? rec.vote_average
                          : null;

                      const imdbScore =
                        recImdbRatings[rec.id] != null
                          ? recImdbRatings[rec.id]
                          : undefined;

                      return (
                        <SwiperSlide key={rec.id}>
                          <a
                            href={`/details/${rec.media_type || type}/${rec.id}`}
                            className="block group"
                            onMouseEnter={() => prefetchRecImdb(rec)}
                            onFocus={() => prefetchRecImdb(rec)}
                          >
                            <div className="mt-3 relative rounded-xl overflow-hidden shadow-lg ring-1 ring-white/5 transition-all duration-500 group-hover:shadow-[0_0_25px_rgba(255,255,255,0.08)] bg-neutral-900 aspect-[2/3]">
                              <img
                                src={
                                  rec.poster_path
                                    ? `https://image.tmdb.org/t/p/w342${rec.poster_path}`
                                    : "/placeholder.png"
                                }
                                alt={recTitle}
                                className="absolute inset-0 w-full h-full object-cover"
                              />

                              {/* Overlay con gradientes */}
                              <div className="absolute inset-0 transition-opacity duration-300 flex flex-col justify-between opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                                {/* Top gradient con tipo y ratings */}
                                <div className="p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start transform -translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 transition-transform duration-300">
                                  <span
                                    className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${isMovie
                                      ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                      : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                      }`}
                                  >
                                    {isMovie ? "PELÍCULA" : "SERIE"}
                                  </span>

                                  <div className="flex flex-col items-end gap-1">
                                    {tmdbScore && (
                                      <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                        <span className="text-emerald-400 text-xs font-black font-mono tracking-tight">
                                          {tmdbScore.toFixed(1)}
                                        </span>
                                        <img
                                          src="/logo-TMDb.png"
                                          alt=""
                                          className="w-auto h-2.5 opacity-100"
                                        />
                                      </div>
                                    )}
                                    {imdbScore != null && (
                                      <div className="flex items-center gap-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                                        <span className="text-yellow-400 text-xs font-black font-mono tracking-tight">
                                          {Number(imdbScore).toFixed(1)}
                                        </span>
                                        <img
                                          src="/logo-IMDb.png"
                                          alt=""
                                          className="w-auto h-3 opacity-100"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Bottom gradient con título y año */}
                                <div className="p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transform translate-y-4 group-hover:translate-y-0 group-focus-within:translate-y-0 transition-transform duration-300">
                                  <div className="flex items-end justify-between gap-3">
                                    <div className="min-w-0 text-left">
                                      <h3 className="text-white font-bold leading-tight line-clamp-2 drop-shadow-md text-xs sm:text-sm">
                                        {recTitle}
                                      </h3>
                                      {recYear && (
                                        <p className="text-yellow-500 text-[10px] sm:text-xs font-bold mt-0.5 drop-shadow-md">
                                          {recYear}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </a>
                        </SwiperSlide>
                      );
                    })}
                  </Swiper>
                </section>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* ✅ MODAL: Vídeos / Trailer */}
      <VideoModal
        open={videoModalOpen}
        onClose={closeVideo}
        video={activeVideo}
      />

      {/* ✅ MODAL: Enlaces externos */}
      <ExternalLinksModal
        open={externalLinksOpen}
        onClose={() => setExternalLinksOpen(false)}
        links={externalLinks}
      />

      <TraktWatchedModal
        open={traktWatchedOpen}
        onClose={() => {
          setTraktWatchedOpen(false);
          setTraktBusy("");
        }}
        title={title}
        connected={trakt.connected}
        found={trakt.found}
        traktUrl={trakt.traktUrl}
        watched={trakt.watched}
        plays={trakt.plays}
        lastWatchedAt={trakt.lastWatchedAt}
        history={trakt.history}
        busyKey={traktBusy}
        onToggleWatched={toggleTraktWatched}
        onAddPlay={handleTraktAddPlay}
        onUpdatePlay={handleTraktUpdatePlay}
        onRemovePlay={handleTraktRemovePlay}
      />

      <TraktEpisodesWatchedModal
        key={`${id}-episodes-${traktEpisodesOpen ? "open" : "closed"}`}
        open={traktEpisodesOpen}
        onClose={closeTraktEpisodesModal}
        mediaType={type}
        tmdbId={Number(id)}
        title={title}
        connected={!!trakt?.connected}
        seasons={Array.isArray(data?.seasons) ? data.seasons : []}
        watchedBySeason={watchedBySeason}
        busyKey={episodeBusyKey}
        episodeBusyKey={episodeBusyKey}
        onToggleEpisodeWatched={toggleEpisodeWatched}
        // serie completa + plays
        onToggleShowWatched={onToggleShowWatched}
        showPlays={showPlays}
        showReleaseDate={data?.first_air_date || data?.release_date || null}
        onAddShowPlay={onAddShowPlay}
        // rewatch runs + vista activa
        rewatchRuns={rewatchRuns}
        activeEpisodesView={activeEpisodesView}
        onChangeEpisodesView={changeEpisodesView}
        onCreateRewatchRun={createRewatchRun}
        onDeleteRewatchRun={deleteRewatchRun}
        rewatchStartAt={rewatchStartAt}
        rewatchWatchedBySeason={rewatchWatchedBySeason}
        onToggleEpisodeRewatch={toggleEpisodeRewatch}
      />

      {/* ✅ MODAL: Añadir a lista */}
      <AddToListModal
        open={listModalOpen}
        onClose={closeListsModal}
        lists={userLists}
        loading={listsLoading}
        error={listsError}
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
    </div>
  );
}

// Icon helper para el reparto
const UsersIconComponent = ({ size = 24, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
