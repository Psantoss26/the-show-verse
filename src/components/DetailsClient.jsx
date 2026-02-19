// src/components/DetailsClient.jsx
// ---------------------------------------------------------------------------
// Componente principal de detalle de pelicula/serie.
// Renderiza toda la pagina de detalle: poster, backdrop, metadatos,
// puntuaciones (TMDb, Trakt, IMDb, RT, Metacritic), gestion de listas,
// episodios, temporadas, colecciones, comentarios, cast, recomendaciones,
// integracion con Trakt (watched, rewatch, plays) y Plex.
// ---------------------------------------------------------------------------
"use client";

// -- Hooks de React --
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useTransition,
} from "react";

// -- Navegacion de Next.js --
import { useRouter } from "next/navigation";

// -- Carrusel Swiper --
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";

// -- Animaciones con Framer Motion --
import { AnimatePresence, motion } from "framer-motion";

// -- Componentes internos del proyecto --
import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import { saveArtworkOverride } from "@/lib/artworkApi";
import Link from "next/link";

// Componentes de animacion reutilizables para secciones con entrada animada
import {
  AnimatedSection,
  FadeIn,
  ScaleIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/details/AnimatedSection";

// Skeletons de carga para cada tipo de seccion (poster, tarjeta, marcador, grid)
import {
  PosterSkeleton,
  CardSkeleton,
  ScoreboardSkeleton,
  GridSkeleton,
} from "@/components/details/LoadingSkeleton";

// -- Iconos de Lucide React usados en todo el componente --
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

// Boton con efecto liquido para acciones principales
import LiquidButton from "@/components/LiquidButton";

// -- Autenticacion y APIs de cuenta (TMDb) --
import { useAuth } from "@/context/AuthContext";
import {
  getMediaAccountStates,
  markAsFavorite,
  markInWatchlist,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchOmdbByImdb } from "@/lib/api/omdb"; // Datos extra de OMDb (IMDb rating, premios, RT, MC)
import StarRating from "./StarRating"; // Componente de puntuacion con estrellas
import TraktWatchedControl from "@/components/trakt/TraktWatchedControl"; // Boton de marcar visto en Trakt
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal"; // Modal de historial de visionados
import TraktEpisodesWatchedModal from "@/components/trakt/TraktEpisodesWatchedModal"; // Modal de episodios vistos
// -- API client de Trakt: estado, visionados, ratings, comentarios, listas, temporadas --
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

// Menu lateral/sticky de navegacion por secciones
import DetailsSectionMenu from "./DetailsSectionMenu";

// Cache de datos OMDb en localStorage para evitar peticiones repetidas
import {
  readOmdbCache,
  writeOmdbCache,
  runIdle,
  extractOmdbExtraScores,
} from "@/lib/details/omdbCache";

// -- Utilidades de imagenes TMDb: seleccion inteligente de poster/backdrop --
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

// -- Funciones de formato: numeros, fechas, HTML, conteos --
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

// Analisis de sentimiento: extrae pros/contras de comentarios de Trakt
import { buildSentimentFromComments } from "@/lib/details/sentiment";

// -- Gestion de listas de usuario en TMDb (CRUD) --
import {
  tmdbFetchAllUserLists,
  tmdbListItemStatus,
  tmdbAddMovieToList,
  tmdbCreateList,
} from "@/lib/details/tmdbListsClient";

// -- Utilidades de video: filtrado, ranking, URLs de embed/thumbnail --
import {
  uniqBy,
  isPlayableVideo,
  videoExternalUrl,
  videoEmbedUrl,
  videoThumbUrl,
  rankVideo,
  pickPreferredVideo,
} from "@/lib/details/videos";

// -- Componentes atomicos para la UI de detalle --
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

// -- Modales del componente --
import AddToListModal from "@/components/details/AddToListModal";
import VideoModal from "@/components/details/VideoModal";
import PosterStack from "@/components/details/PosterStack";
import ExternalLinksModal from "@/components/details/ExternalLinksModal";

// ---------------------------------------------------------------------------
// CONSTANTES GLOBALES
// ---------------------------------------------------------------------------

// Clave de API de TMDb inyectada como variable de entorno publica
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Cache en memoria para el scoreboard publico (evita refetches durante la sesion)
const PUBLIC_SCORE_CACHE = new Map(); // clave -> { ts, data }
const TTL = 1000 * 60 * 5; // Tiempo de vida del cache: 5 minutos

/**
 * Obtiene el scoreboard publico (puntuaciones agregadas de multiples fuentes).
 * Llama al endpoint /api/scoreboard/public con type, id e imdbId.
 */
async function fetchPublicScoreboard({ type, id, imdbId, signal }) {
  const url = `/api/scoreboard/public?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&imdb=${encodeURIComponent(imdbId || "")}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`scoreboard ${r.status}`);
  return r.json();
}

// =====================================================================
// COMPONENTE PRINCIPAL: DetailsClient
// =====================================================================

/**
 * DetailsClient - Componente principal de la pagina de detalle.
 *
 * Props:
 * @param {string}  type            - Tipo de contenido: "movie" o "tv"
 * @param {string}  id              - ID de TMDb del contenido
 * @param {Object}  data            - Objeto completo de datos de TMDb (titulo, sinopsis, fechas, etc.)
 * @param {Array}   recommendations - Lista de contenido recomendado similar
 * @param {Array}   castData        - Datos del reparto (actores, directores)
 * @param {Object}  providers       - Proveedores de streaming disponibles
 * @param {string}  watchLink       - URL directa para ver el contenido
 * @param {Array}   reviews         - Resenas de usuarios de TMDb
 */
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

  // -- Datos basicos derivados de las props --
  const title = data.title || data.name; // Peliculas usan "title", series usan "name"
  const endpointType = type === "tv" ? "tv" : "movie"; // Tipo normalizado para endpoints de API
  const yearIso = (data.release_date || data.first_air_date || "")?.slice(0, 4); // Ano de estreno

  // URLs de TMDb para enlace externo y pagina de "donde ver"
  const tmdbDetailUrl =
    type && id ? `https://www.themoviedb.org/${type}/${id}` : null;

  const tmdbWatchUrl =
    watchLink ||
    (type && id ? `https://www.themoviedb.org/${type}/${id}/watch` : null);

  // -- Estado general de la UI --
  const [showAdminImages, setShowAdminImages] = useState(false); // Panel admin de imagenes (solo admin)
  const [reviewLimit, setReviewLimit] = useState(2); // Numero de resenas visibles (expandible)
  const [useBackdrop, setUseBackdrop] = useState(true); // Alternar entre backdrop y poster como fondo

  // -- Autenticacion y permisos --
  const { session, account } = useAuth();
  const isAdmin =
    account?.username === "psantos26" || account?.name === "psantos26";

  // -- Estado de favoritos y watchlist (TMDb) --
  const [favLoading, setFavLoading] = useState(false); // Cargando accion de favorito
  const [wlLoading, setWlLoading] = useState(false); // Cargando accion de watchlist
  const [favorite, setFavorite] = useState(false); // Es favorito del usuario
  const [watchlist, setWatchlist] = useState(false); // Esta en la watchlist del usuario

  // -- Puntuacion del usuario en TMDb --
  const [userRating, setUserRating] = useState(null); // Rating actual (1-10)
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState("");

  // Indica si se estan cargando los estados de cuenta (favorito, watchlist, rating)
  const [accountStatesLoading, setAccountStatesLoading] = useState(false);

  // Pestana activa en la seccion de metadatos (details/produccion/sinopsis/premios)
  const [activeTab, setActiveTab] = useState("details");

  // ====== CLAVES DE LOCALSTORAGE PARA PREFERENCIAS DE IMAGENES ======
  // Cada clave es unica por tipo de contenido e ID para persistir selecciones del usuario
  const posterStorageKey = `showverse:${endpointType}:${id}:poster`;
  const previewBackdropStorageKey = `showverse:${endpointType}:${id}:backdrop`;
  const backgroundStorageKey = `showverse:${endpointType}:${id}:background`;
  // Modo de vista global (poster o preview) - se comparte entre todos los contenidos
  const globalViewModeStorageKey = "showverse:global:posterViewMode";
  // Claves de rewatch (Trakt) persistentes por show
  const rewatchStorageKey = `showverse:trakt:rewatchStartAt:${id}`;

  // Claves para multiples rewatches (runs) y vista activa del modal de episodios
  const rewatchRunsStorageKey = `showverse:trakt:rewatchRuns:${id}`;
  const episodesViewStorageKey = `showverse:trakt:episodesView:${id}`;

  // Lista de runs de rewatch: [{ id, startedAt, label }]
  const [rewatchRuns, setRewatchRuns] = useState([]);
  // Vista activa en el modal de episodios: "global" (todos) o el ID de un run especifico
  const [activeEpisodesView, setActiveEpisodesView] = useState("global");

  // Mapa de historial por episodio en rewatch para poder desmarcar: { "S1E2": historyId }
  const [rewatchHistoryByEpisode, setRewatchHistoryByEpisode] = useState({});

  // -- Rutas de imagen seleccionadas por el usuario --
  const [selectedPosterPath, setSelectedPosterPath] = useState(null);
  const [selectedPreviewBackdropPath, setSelectedPreviewBackdropPath] =
    useState(null);

  // posterViewMode: controla QUE imagen se muestra (poster vertical vs preview horizontal).
  // Se inicializa desde localStorage global para mantener la preferencia del usuario.
  const [posterViewMode, setPosterViewMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    try {
      return window.localStorage.getItem(globalViewModeStorageKey) || "poster";
    } catch {
      return "poster";
    }
  });

  // posterLayoutMode: controla el LAYOUT (ancho/ratio) de forma separada.
  // Esto permite redimensionar el contenedor antes de cargar la imagen de backdrop,
  // evitando saltos visuales durante la transicion.
  const [posterLayoutMode, setPosterLayoutMode] = useState(() => {
    if (typeof window === "undefined") return "poster";
    try {
      return window.localStorage.getItem(globalViewModeStorageKey) || "poster";
    } catch {
      return "poster";
    }
  });

  // -- Imagen de fondo (background) con transicion suave --
  const [selectedBackgroundPath, setSelectedBackgroundPath] = useState(null);
  const [prevBackgroundPath, setPrevBackgroundPath] = useState(null); // Fondo anterior (para crossfade)
  const [isTransitioning, setIsTransitioning] = useState(false); // Animacion de cambio de fondo activa

  // -- Imagenes base: evitan SSR/primer render con un poster provisional --
  const [basePosterPath, setBasePosterPath] = useState(null);
  const [baseBackdropPath, setBaseBackdropPath] = useState(null);
  const [artworkInitialized, setArtworkInitialized] = useState(false); // Se pone a true tras la carga inicial

  // -- Estados de carga progresiva del poster --
  // Se usan para mostrar primero una version de baja calidad y luego la alta
  const [posterResolved, setPosterResolved] = useState(false); // Ruta del poster determinada
  const [posterLowLoaded, setPosterLowLoaded] = useState(false); // Imagen baja calidad cargada
  const [posterHighLoaded, setPosterHighLoaded] = useState(false); // Imagen alta calidad cargada
  const [posterImgError, setPosterImgError] = useState(false); // Error al cargar poster
  const [posterTransitioning, setPosterTransitioning] = useState(false); // Transicion entre posters
  const [prevPosterPath, setPrevPosterPath] = useState(null); // Poster anterior (para crossfade)

  // -- Estados de carga progresiva del backdrop (misma logica que poster) --
  const [backdropResolved, setBackdropResolved] = useState(false);
  const [backdropLowLoaded, setBackdropLowLoaded] = useState(false);
  const [backdropHighLoaded, setBackdropHighLoaded] = useState(false);
  const [backdropImgError, setBackdropImgError] = useState(false);

  // -- Estado de imagenes disponibles (posters y backdrops) --
  // Se inicializa con la imagen principal de TMDb y se enriquece con fetchs adicionales
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
  const [activeImagesTab, setActiveImagesTab] = useState("posters"); // "posters" | "backdrops" | "backgrounds"

  // ====== PROVEEDORES DE STREAMING (JustWatch) ======
  const [streamingProviders, setStreamingProviders] = useState([]); // Lista de servicios disponibles
  const [providersLoading, setProvidersLoading] = useState(true);
  const [justwatchUrl, setJustwatchUrl] = useState(null); // URL directa a JustWatch

  // ====== INTEGRACION CON PLEX ======
  const [plexAvailable, setPlexAvailable] = useState(false); // Contenido disponible en Plex local
  const [plexUrl, setPlexUrl] = useState(null); // URL para abrir en Plex (web/app)
  const [plexLoading, setPlexLoading] = useState(true);

  // -- Refs y estado para scroll horizontal de la galeria de imagenes --
  const imagesScrollRef = useRef(null);
  const [isHoveredImages, setIsHoveredImages] = useState(false);
  const [canPrevImages, setCanPrevImages] = useState(false); // Hay scroll a la izquierda
  const [canNextImages, setCanNextImages] = useState(false); // Hay scroll a la derecha

  /**
   * Extrae la ruta de TMDb de un valor que puede ser string o { file_path }.
   * Devuelve null si el valor no es valido.
   */
  const asTmdbPath = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v === "object" && typeof v.file_path === "string")
      return v.file_path;
    return null;
  };

  /**
   * Normaliza una URL anadiendo https:// si no tiene protocolo.
   */
  const normalizeUrl = (u) => {
    if (!u) return null;
    const s = String(u).trim();
    if (!s) return null;
    return s.startsWith("http://") || s.startsWith("https://")
      ? s
      : `https://${s}`;
  };

  // =====================================================================
  // LISTAS DE USUARIO (TMDb) - solo disponible para peliculas
  // Permite agregar peliculas a listas personalizadas, crear nuevas listas,
  // y detectar en que listas ya esta presente la pelicula.
  // =====================================================================

  // Las listas de TMDb solo funcionan para peliculas (no series) y requieren API key
  const canUseLists = endpointType === "movie" && !!TMDB_API_KEY;

  // -- Estado del modal de listas --
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState("");
  const [userLists, setUserLists] = useState([]); // Todas las listas del usuario
  const [listQuery, setListQuery] = useState(""); // Filtro de busqueda en el modal

  // Mapa de pertenencia: { listId: true/false } indica si la pelicula esta en cada lista
  const [membershipMap, setMembershipMap] = useState({});
  const [listsPresenceLoading, setListsPresenceLoading] = useState(false);
  const [busyListId, setBusyListId] = useState(null); // Lista en proceso de modificacion

  // -- Estado para crear nueva lista desde el modal --
  const [createOpen, setCreateOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");

  // Ref del wrapper de rating para detectar clicks fuera en movil
  const ratingWrapRef = useRef(null);

  // -- Deteccion de capacidades del dispositivo --
  const [supportsHover, setSupportsHover] = useState(false); // true = desktop con raton
  const [mobileClearOpen, setMobileClearOpen] = useState(false); // Boton de limpiar rating visible en movil

  const [isMobileViewport, setIsMobileViewport] = useState(false); // Viewport <= 640px

  /**
   * Extrae un ID consistente de una lista (puede venir como objeto o como valor directo).
   * Soporta formatos de TMDb y Trakt.
   */
  const getListId = useCallback((lOrId) => {
    if (lOrId == null) return null;
    if (typeof lOrId === "string" || typeof lOrId === "number")
      return String(lOrId);

    const l = lOrId;
    const id = l?.id ?? l?._id ?? l?.ids?.tmdb ?? l?.slug ?? l?.name;
    return id != null ? String(id) : null;
  }, []);

  // Detecta las capacidades del dispositivo: hover (desktop) y viewport movil.
  // Usa matchMedia para reaccionar a cambios en tiempo real (ej. rotar tablet).
  useEffect(() => {
    if (typeof window === "undefined") return;

    // hover + puntero fino => escritorio con raton
    const mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateHover = () => setSupportsHover(!!mqHover.matches);
    updateHover();
    if (mqHover.addEventListener)
      mqHover.addEventListener("change", updateHover);
    else mqHover.addListener(updateHover);

    // Viewport movil (breakpoint sm = 640px)
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

  // Si pasamos a desktop, cerramos el boton de limpiar rating movil
  useEffect(() => {
    if (supportsHover) setMobileClearOpen(false);
  }, [supportsHover]);

  // Cierra el boton de limpiar rating al tocar fuera del wrapper en movil
  useEffect(() => {
    if (supportsHover || !mobileClearOpen) return;
    const onDown = (e) => {
      if (!ratingWrapRef.current) return;
      if (!ratingWrapRef.current.contains(e.target)) setMobileClearOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [supportsHover, mobileClearOpen]);

  // ID numerico de la pelicula (necesario para la API de listas de TMDb)
  const movieId = useMemo(() => {
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  }, [id]);

  // Comprueba si la pelicula esta en alguna lista del usuario
  const inAnyList = useMemo(() => {
    const vals = Object.values(membershipMap || {});
    return vals.some(Boolean);
  }, [membershipMap]);

  // Indicador visual: la pelicula esta en al menos una lista (y ya se cargo la presencia)
  const listActive = !listsPresenceLoading && inAnyList;

  /**
   * Redirige a login si el usuario no esta autenticado.
   * Devuelve true si se redirigió (para abortar la accion en curso).
   */
  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = "/login";
      return true;
    }
    return false;
  };

  /**
   * Carga las listas del usuario desde TMDb si aun no se han cargado.
   * Usa un abortRef para cancelar si el componente se desmonta.
   */
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

  /**
   * Comprueba en cuales listas esta presente la pelicula actual.
   * Realiza peticiones en paralelo (concurrencia 5) para cada lista del usuario.
   * @param {Object} options
   * @param {Array}  options.lists    - Listas a comprobar (si no se pasa, las carga)
   * @param {boolean} options.silent  - true = no muestra spinner de carga principal
   * @param {Object} options.abortRef - Referencia para cancelar si se desmonta
   */
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

  // Carga la presencia en listas al montar o al cambiar de contenido/sesion.
  // Se ejecuta en modo silencioso (sin spinner principal).
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

  // Abre el modal de listas: carga listas y presencia
  const openListsModal = async () => {
    if (requireLogin()) return;
    if (!canUseLists || !movieId) return;

    setListModalOpen(true);
    setListsError("");
    setListQuery("");

    const abortRef = { current: false };
    await loadPresenceForLists({ silent: false, abortRef });
  };

  // Cierra el modal y resetea todos los estados temporales
  const closeListsModal = () => {
    setListModalOpen(false);
    setListQuery("");
    setListsError("");
    setCreateOpen(false);
    setNewListName("");
    setNewListDesc("");
  };

  // Agrega la pelicula a una lista especifica con actualizacion optimista del estado
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

      // Actualizacion optimista: marca como presente antes de confirmar
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

  // Crea una nueva lista en TMDb y agrega la pelicula actual
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

      // Refresca todas las listas del usuario para reflejar la nueva lista
      const lists = await tmdbFetchAllUserLists({
        apiKey: TMDB_API_KEY,
        accountId: account.id,
        sessionId: session,
        language: "es-ES",
      });
      setUserLists(lists);

      // Marca la pelicula como presente en la nueva lista
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
  // VIDEOS / TRAILERS
  // Carga videos desde TMDb (en espanol e ingles), los fusiona, ordena
  // por relevancia y permite reproducirlos en un modal.
  // =====================================================================

  const [videos, setVideos] = useState([]); // Lista de videos disponibles
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState("");
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null); // Video seleccionado para el modal

  // Selecciona automaticamente el mejor video (trailer oficial preferido)
  const preferredVideo = useMemo(() => pickPreferredVideo(videos), [videos]);

  // Abre el modal de video con el video seleccionado
  const openVideo = (v) => {
    if (!v) return;
    setActiveVideo(v);
    setVideoModalOpen(true);
  };

  // Cierra el modal de video
  const closeVideo = () => {
    setVideoModalOpen(false);
    setActiveVideo(null);
  };

  // Resetea el modal de video al cambiar de contenido
  useEffect(() => {
    setVideoModalOpen(false);
    setActiveVideo(null);
  }, [id, endpointType]);

  // Carga los videos de TMDb en espanol e ingles, los fusiona eliminando
  // duplicados, filtra los reproducibles y los ordena por relevancia.
  useEffect(() => {
    let ignore = false;

    // Fetch seguro que devuelve array vacio en caso de error
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
  // FILTROS DE PORTADAS Y FONDOS
  // Controla la galeria de imagenes con filtros de resolucion e idioma.
  // =====================================================================

  const [imagesResFilter, setImagesResFilter] = useState("all"); // Filtro de resolucion: all | 720p | 1080p | 2k | 4k
  const [langES, setLangES] = useState(true); // Mostrar imagenes en espanol
  const [langEN, setLangEN] = useState(true); // Mostrar imagenes en ingles
  const [artworkPreloadCount, setArtworkPreloadCount] = useState(4); // Numero de imagenes a precargar antes de mostrar

  // Controla si la fila de artwork esta lista para mostrarse (precarga completada)
  const [artworkRowReady, setArtworkRowReady] = useState(false);

  // Panel movil de filtros (colapsable)
  const [artworkControlsOpen, setArtworkControlsOpen] = useState(false);

  // Ref del wrapper de controles de artwork para detectar click fuera
  const artworkControlsWrapRef = useRef(null);

  // Cierra el panel de filtros de artwork y el menu de resolucion con Escape
  // o al hacer click/touch fuera del wrapper
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setArtworkControlsOpen(false);
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

  // -- Dropdown de resolucion --
  const [resMenuOpen, setResMenuOpen] = useState(false);
  const resMenuRef = useRef(null);

  // Cierra el menu de resolucion al hacer click fuera
  useEffect(() => {
    if (!resMenuOpen) return;
    const onDown = (e) => {
      if (!resMenuRef.current) return;
      if (!resMenuRef.current.contains(e.target)) setResMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [resMenuOpen]);

  // Cierra el menu de resolucion al cambiar de pestana de imagenes
  useEffect(() => {
    setResMenuOpen(false);
  }, [activeImagesTab]);

  // -- Utilidades de resolucion de imagen --

  // Devuelve el lado mas largo de una imagen (ancho o alto)
  const imgLongSide = (img) =>
    Math.max(Number(img?.width || 0), Number(img?.height || 0));

  // Clasifica la resolucion de una imagen en categorias: 4k, 2k, 1080p, 720p, sd
  const imgResBucket = (img) => {
    const long = imgLongSide(img);
    if (long >= 3840) return "4k";
    if (long >= 2560) return "2k";
    if (long >= 1920) return "1080p";
    if (long >= 1280) return "720p";
    return "sd";
  };

  // Formatea las dimensiones de una imagen como "WxH" para mostrar en la UI
  const imgResLabel = (img) => {
    const w = Number(img?.width || 0);
    const h = Number(img?.height || 0);
    return w > 0 && h > 0 ? `${w}×${h}` : null;
  };

  // Calcula el numero de slides visibles en el carrusel segun el viewport y tipo de imagen
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

  /**
   * Selecciona el mejor backdrop para el modo preview.
   * Combina todas las fuentes de backdrops disponibles y usa un algoritmo
   * inteligente que prioriza imagenes con idioma ES/EN y buena resolucion.
   * Evita parpadeos: no devuelve fallback generico hasta que la inicializacion termine.
   */
  const previewBackdropFallback = useMemo(() => {
    // 1. Combinar todas las fuentes posibles de backdrops.
    //    Solo usamos data.images si artworkInitialized es true
    //    para evitar mostrar un backdrop que luego sera reemplazado.
    const allBackdrops = [
      ...(imagesState?.backdrops || []),
      ...(artworkInitialized && data?.images?.backdrops
        ? data.images.backdrops
        : []),
    ];

    // 2. Aplicar el filtro inteligente para encontrar el mejor backdrop
    if (allBackdrops.length > 0) {
      const bestPath = pickBestBackdropForPreview(allBackdrops);
      if (bestPath) return bestPath;
    }

    // 3. Si aun estamos inicializando, devolvemos null (se muestra skeleton)
    //    para evitar parpadeo de imagen incorrecta que luego se reemplaza.
    if (!artworkInitialized) return null;

    // 4. Fallback final: si ya terminamos y no hay nada mejor, usamos el generico
    return data?.backdrop_path || null;
  }, [
    imagesState?.backdrops,
    data?.images?.backdrops,
    data?.backdrop_path,
    artworkInitialized,
  ]);

  /**
   * Procesa y filtra la galeria de artwork segun la pestana activa (posters/backdrops/background),
   * filtros de resolucion e idioma. Devuelve la lista ordenada, el aspect ratio,
   * el tamano de imagen y la ruta activa actual.
   */
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

    // Backdrop de preview: misma logica de seleccion que MainDashboard
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

    // Filtrar imagenes por resolucion e idioma, siempre incluyendo la imagen activa
    const filtered = withPath.filter((img) => {
      const fp = img?.file_path;
      if (fp === activePath) return true; // Siempre incluir la imagen activa

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

    // Fallback relajado: si los filtros son demasiado restrictivos, se relajan
    const relaxed = (() => {
      if (!withPath.length) return [];
      if (isBackgroundTab) {
        const neutral = withPath.filter((img) => !img?.iso_639_1);
        return neutral.length ? neutral : withPath;
      }
      if (isBackdropTab) {
        // Vista previa: priorizar backdrops que tienen idioma asignado
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

    // Reordenar: en Vista previa, el backdrop activo va primero
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

  // Precarga las primeras N imagenes de la fila actual.
  // No muestra el carrusel hasta que todas las imagenes visibles esten cargadas
  // para evitar que aparezcan una por una (efecto "pop-in").
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Mientras las imagenes de TMDb estan cargando, ocultamos el carrusel
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
      // Precarga rapida (cache en memoria JS)
      preloadTmdb(fp, size);
      // Tambien esperamos la carga real del navegador
      urls.push(`https://image.tmdb.org/t/p/${size}${fp}`);
    }

    if (!urls.length) {
      setArtworkRowReady(true);
      return;
    }

    // Si las imagenes ya estan en cache del navegador, mostrar inmediatamente
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
      } catch {}
      img.onload = finishOne;
      img.onerror = finishOne; // Si una falla, no bloqueamos toda la fila
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [imagesLoading, artworkSelection, artworkPreloadCount]);

  // Recalcula cuantas imagenes precargar al cambiar el tamano del viewport
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

  /**
   * useLayoutEffect de inicializacion de artwork.
   * Resetea todos los estados de imagen y carga las preferencias guardadas
   * del usuario desde localStorage (poster, backdrop, background seleccionados).
   * Se ejecuta antes del paint para evitar flashes visuales.
   */
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
    // No activar posterResolved hasta que initArtwork termine

    setImagesState({
      posters: data.poster_path
        ? [{ file_path: data.poster_path, from: "main" }]
        : [],
      backdrops: [], // No inicializar con data.backdrop_path - esperar a initArtwork
    });
    setImagesLoading(false);
    setImagesError("");
    setActiveImagesTab("posters");

    setSelectedPosterPath(null);
    setSelectedPreviewBackdropPath(null);
    setSelectedBackgroundPath(null);

    // No resetear posterViewMode/posterLayoutMode - respetar la preferencia global
    // Ya se inicializan desde localStorage en el useState inicial

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
    // No activar artworkInitialized aqui - esperar a que initArtwork termine
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

  /**
   * Inicializacion asincrona del artwork.
   * Para series TV: carga imagenes extra de todas las temporadas y selecciona las mejores.
   * Para peliculas sin imagenes SSR: carga imagenes desde la API de TMDb.
   * Precarga las imagenes seleccionadas en el tamano adecuado.
   */
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
          const bestBackdropForPreviewCalc =
            pickBestBackdropForPreview(backdrops);

          const bestPosterPath = asTmdbPath(bestPoster);
          const bestBackdropPath = asTmdbPath(bestBackdropForBackground);
          const bestPreviewPath = asTmdbPath(bestBackdropForPreviewCalc);

          // Precargar backdrop de vista previa primero si estamos en modo preview
          const savedGlobalMode =
            typeof window !== "undefined"
              ? window.localStorage.getItem("showverse:global:posterViewMode")
              : null;

          if (savedGlobalMode === "preview" && bestPreviewPath) {
            await preloadTmdb(bestPreviewPath, "w780");
          }

          if (bestPosterPath) await preloadTmdb(bestPosterPath, "w780");

          if (!cancelled) {
            if (bestPosterPath) poster = bestPosterPath;
            if (bestBackdropPath) backdrop = bestBackdropPath;

            // Fusionar imagenes nuevas con las existentes (sin duplicados)
            setImagesState((prev) => ({
              posters: mergeUniqueImages(prev.posters, posters),
              backdrops: mergeUniqueImages(prev.backdrops, backdrops),
            }));
          }
        } catch (e) {
          if (!cancelled) console.error("Error cargando imagenes TV:", e);
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
          const bestBackdropForPreviewCalc =
            pickBestBackdropForPreview(backdrops);

          // Precargar backdrop de vista previa primero si estamos en modo preview
          const savedGlobalMode =
            typeof window !== "undefined"
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
        // No sobrescribir si ya habia un poster base (evita el "swap" visual)
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

  // ---------------------------------------------------------------------------
  // RUTAS DE IMAGEN PARA VISUALIZACION
  // Cadena de prioridad: seleccion del usuario > calculada > datos de TMDb
  // ---------------------------------------------------------------------------

  // Poster a mostrar: seleccion manual > calculado > datos originales
  const basePosterDisplayPath =
    asTmdbPath(selectedPosterPath) ||
    asTmdbPath(basePosterPath) ||
    asTmdbPath(data?.poster_path || data?.profile_path) ||
    null;

  // Backdrop para modo preview: seleccion manual > fallback inteligente
  const previewBackdropPath =
    (artworkInitialized ? asTmdbPath(selectedPreviewBackdropPath) : null) ||
    asTmdbPath(previewBackdropFallback) ||
    null;

  // Imagen principal del poster: en modo preview muestra backdrop, si no el poster
  const displayPosterPath =
    posterViewMode === "preview" ? previewBackdropPath : basePosterDisplayPath;

  // Comprueba si una ruta pertenece a la lista de backdrops (no posters)
  const isBackdropPath = useCallback(
    (path) => {
      if (!path) return false;
      const backdrops = imagesState?.backdrops || [];
      return backdrops.some((b) => b?.file_path === path);
    },
    [imagesState?.backdrops],
  );

  // Detecta si la portada actual se muestra como backdrop (horizontal).
  // Usa posterLayoutMode (no posterViewMode) para redimensionar la tarjeta
  // antes de cambiar la imagen, evitando saltos de layout.
  const isBackdropPoster = useMemo(
    () => posterLayoutMode === "preview" || isBackdropPath(displayPosterPath),
    [posterLayoutMode, displayPosterPath, isBackdropPath],
  );

  // Backdrop de fondo: seleccion manual > calculado > datos originales
  const displayBackdropPath =
    asTmdbPath(selectedBackgroundPath) ||
    asTmdbPath(baseBackdropPath) ||
    asTmdbPath(data?.backdrop_path) ||
    null;

  // Mejor poster neutro (sin texto/idioma) para uso en movil como fondo
  const mobileNeutralPosterPath = useMemo(() => {
    const best =
      pickBestNeutralPosterByResVotes(imagesState?.posters || [])?.file_path ||
      null;
    if (best) return best;
    // Fallback: primera imagen sin idioma si no hay metadata de tamanos/votos
    return (
      (imagesState?.posters || []).find((p) => p?.file_path && !p?.iso_639_1)
        ?.file_path || null
    );
  }, [imagesState?.posters]);

  // Selecciona la imagen de fondo del hero segun el viewport:
  // - Desktop: usa el backdrop horizontal
  // - Movil: usa un poster neutro (sin texto) para mejor visualizacion vertical
  const heroBackgroundPath = (() => {
    if (!useBackdrop || !artworkInitialized) return null;

    // Desktop: usa el backdrop horizontal seleccionado
    const desktop = displayBackdropPath;

    // Movil: prioriza poster sin idioma, pero respeta seleccion manual del usuario
    const mobile =
      selectedBackgroundPath || // Si el usuario eligio un fondo manual, respetarlo
      mobileNeutralPosterPath ||
      basePosterPath ||
      data.poster_path ||
      data.profile_path ||
      desktop ||
      null;

    return isMobileViewport ? mobile : desktop;
  })();

  // =====================================================================
  // ESTADOS DE CUENTA (TMDb)
  // Carga el estado de favorito, watchlist y puntuacion del usuario.
  // =====================================================================
  useEffect(() => {
    let cancel = false;

    const load = async () => {
      // Sin sesion activa no hay datos de cuenta que cargar
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
        // Si falla, al menos dejamos de "cargar" para no bloquear la UI
      } finally {
        if (!cancel) setAccountStatesLoading(false);
      }
    };

    load();
    return () => {
      cancel = true;
    };
  }, [type, id, session, account?.id]);

  // Alterna el estado de favorito con actualizacion optimista (cambio inmediato + rollback si falla)
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

  // Alterna el estado de watchlist con actualizacion optimista
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

  /**
   * Envia una puntuacion a TMDb y opcionalmente sincroniza con Trakt.
   * @param {number} value - Valor de la puntuacion (1-10)
   * @param {Object} options
   * @param {boolean} options.skipSync - true para no sincronizar con Trakt (evita bucles)
   */
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

      // Sincronizacion opcional hacia Trakt (skipSync evita bucle infinito)
      if (!skipSync && syncTrakt && trakt.connected) {
        await setTraktRatingSafe(Math.ceil(value));
      }
    } catch (err) {
      setRatingError(err?.message || "Error");
    } finally {
      setRatingLoading(false);
    }
  };

  // Elimina la puntuacion del usuario en TMDb y opcionalmente sincroniza con Trakt
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

  // Envia una puntuacion a Trakt y opcionalmente sincroniza con TMDb
  const sendTraktRating = async (value) => {
    if (!trakt.connected) {
      window.location.href = "/api/trakt/auth/start";
      return;
    }
    // Trakt acepta valores enteros de 1 a 10
    await setTraktRatingSafe(value == null ? null : Math.ceil(value));

    // Sincronizacion opcional hacia TMDb (skipSync evita bucle infinito)
    if (syncTrakt && session && TMDB_API_KEY) {
      if (value == null) await clearTmdbRating({ skipSync: true });
      else await sendTmdbRating(value, { skipSync: true });
    }
  };

  // Elimina la puntuacion en Trakt
  const clearTraktRating = async () => {
    await sendTraktRating(null);
  };

  // Tipo de contenido para la API de Trakt ("show" para series, "movie" para peliculas)
  const traktType = endpointType === "tv" ? "show" : "movie";

  // =====================================================================
  // INTEGRACION CON TRAKT
  // Estado completo de la conexion con Trakt: visto, historial, rating,
  // watchlist, progreso de episodios, comentarios, listas y estadisticas.
  // =====================================================================

  // Estado principal de Trakt para este contenido
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

  const [traktBusy, setTraktBusy] = useState(""); // Accion en curso: 'watched' | 'watchlist' | 'history' | ''
  const [traktWatchedOpen, setTraktWatchedOpen] = useState(false); // Modal de historial de visionados abierto
  const [traktEpisodesOpen, setTraktEpisodesOpen] = useState(false); // Modal de episodios vistos abierto

  // Cierra el modal de episodios limpiando estados transitorios
  const closeTraktEpisodesModal = useCallback(() => {
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey(""); // Evita que quede bloqueado al reabrir
  }, []);

  // -- Episodios vistos por temporada (solo TV) --
  const [watchedBySeason, setWatchedBySeason] = useState({}); // { seasonNumber: [episodeNumber, ...] }
  const [watchedBySeasonLoaded, setWatchedBySeasonLoaded] = useState(false); // true cuando se cargo el estado
  const [episodeBusyKey, setEpisodeBusyKey] = useState(""); // Episodio en proceso: "S1E3"

  // -- Historial de completados y rewatch --
  const [showPlays, setShowPlays] = useState([]); // Fechas ISO de cada visionado completo
  const [rewatchStartAt, setRewatchStartAt] = useState(null); // Fecha ISO de inicio del rewatch actual
  const [rewatchWatchedBySeason, setRewatchWatchedBySeason] = useState(null); // Episodios vistos en el rewatch actual

  // Badge de progreso para el boton "visto" en series: calcula el % de episodios vistos
  // (excluyendo especiales, solo temporadas regulares)
  const tvProgressBadge = useMemo(() => {
    if (endpointType !== "tv") return null;
    if (!trakt?.connected) return null;

    // Mientras no se haya cargado el estado de episodios vistos, no mostrar nada
    if (!watchedBySeasonLoaded) return null;

    const seasonsList = Array.isArray(data?.seasons) ? data.seasons : [];
    const usable = seasonsList.filter(
      (s) => typeof s?.season_number === "number" && s.season_number > 0,
    );

    // Si aun no hay temporadas validas, no mostrar nada
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

  // Sincroniza trakt.watched con el estado real de episodios vistos.
  // Si hay al menos un episodio visto, trakt.watched debe ser true.
  useEffect(() => {
    if (endpointType !== "tv") return;
    if (!trakt?.connected) return;
    if (!watchedBySeasonLoaded) return;

    // Comprobar si hay algun episodio visto en cualquier temporada
    const hasAnyWatchedEpisode = Object.values(watchedBySeason).some(
      (episodes) => Array.isArray(episodes) && episodes.length > 0,
    );

    // Actualizar el estado de trakt.watched si no coincide con la realidad
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

  // -- Estadisticas de Trakt (watchers, plays, etc.) --
  const [traktStats, setTraktStats] = useState(null);
  const [traktStatsLoading, setTraktStatsLoading] = useState(false);
  const [traktStatsError, setTraktStatsError] = useState("");

  // Carga los episodios vistos de una serie desde la API de Trakt
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
      // Marcar como cargado (aunque sea 0%) para que el badge de progreso se muestre
      setWatchedBySeasonLoaded(true);
    }
  }, [type, id, trakt?.connected]);

  // -- Scoreboard de la comunidad (puntuaciones agregadas de multiples fuentes) --
  const [tScoreboard, setTScoreboard] = useState({
    loading: false,
    error: "",
    found: false,
    rating: null, // Puntuacion de la comunidad (0..10)
    votes: null, // Numero de votos de la comunidad
    stats: {
      watchers: null, // Usuarios que estan viendo ahora
      plays: null, // Numero total de reproducciones
      collectors: null, // Usuarios que lo tienen en su biblioteca
      comments: null, // Numero de comentarios
      lists: null, // Numero de listas que lo incluyen
      favorited: null, // Usuarios que lo marcaron como favorito
    },
    external: {
      rtAudience: null, // Rotten Tomatoes audiencia (reservado)
      justwatchRank: null, // Ranking en JustWatch (reservado)
      justwatchDelta: null, // Cambio en el ranking (reservado)
      justwatchCountry: "ES",
    },
  });

  // Clave especial para indicar que una accion afecta al show completo (no un episodio)
  const SHOW_BUSY_KEY = "SHOW";

  // =====================================================================
  // TRAKT COMMUNITY: Sentimientos / Comentarios / Temporadas / Listas
  // Datos publicos de la comunidad de Trakt (no requiere autenticacion).
  // =====================================================================

  // -- Analisis de sentimiento: pros y contras extraidos de comentarios --
  const [tSentiment, setTSentiment] = useState({
    loading: false,
    error: "",
    pros: [],
    cons: [],
    sourceCount: 0,
  });

  // -- Comentarios de Trakt con paginacion y pestanas --
  const [tCommentsTab, setTCommentsTab] = useState("likes30"); // "likes30" (top 30 dias) | "likesAll" (top historico) | "recent"
  const [tComments, setTComments] = useState({
    loading: false,
    error: "",
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
  });

  // -- Temporadas de Trakt (datos de temporadas para series TV) --
  const [tSeasons, setTSeasons] = useState({
    loading: false,
    error: "",
    items: [],
  });

  // -- Listas de Trakt con paginacion (popular/trending) --
  const [tListsTab, setTListsTab] = useState("popular"); // "popular" | "trending"
  const [tLists, setTLists] = useState({
    loading: false,
    error: "",
    items: [],
    page: 1,
    hasMore: false,
    total: 0,
  });

  // Resetear todos los datos de la comunidad de Trakt al cambiar de contenido
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

  // Carga el analisis de sentimiento (pros/contras) de los 50 comentarios mas votados
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
  }, [id, traktType]); // Datos publicos: no depende de conexion del usuario

  // Carga los comentarios de Trakt segun la pestana activa.
  // likes30: top con likes de los ultimos 30 dias. likesAll: top historico. recent: mas recientes.
  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setTComments((p) => ({ ...p, loading: true, error: "" }));

      try {
        const isLikes30 = tCommentsTab === "likes30";
        const sort = tCommentsTab === "recent" ? "newest" : "likes";

        // Para likes30: pedimos mas y filtramos por fecha (ultimos 30 dias)
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
          // Limitar a 20 comentarios para la UI
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

  // Resetear paginacion de comentarios al cambiar de pestana
  useEffect(() => {
    setTComments((p) => ({
      ...p,
      items: [],
      page: 1,
      hasMore: false,
      total: 0,
    }));
  }, [tCommentsTab]);

  // Carga las temporadas de la serie desde Trakt (con datos extendidos)
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

  // Carga las listas de Trakt que contienen este contenido (popular o trending)
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

  // Resetear paginacion de listas al cambiar de pestana
  useEffect(() => {
    setTLists((p) => ({ ...p, items: [], page: 1, hasMore: false, total: 0 }));
  }, [tListsTab]);

  // -- Sincronizacion TMDb <-> Trakt --
  // Preferencia del usuario: si esta activa, los ratings se sincronizan entre ambas plataformas
  const [syncTrakt, setSyncTrakt] = useState(false);

  // Cargar preferencia de sincronizacion desde localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("showverse:trakt:sync") === "1";
      setSyncTrakt(v);
    } catch {}
  }, []);

  // Guardar preferencia de sincronizacion en localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "showverse:trakt:sync",
        syncTrakt ? "1" : "0",
      );
    } catch {}
  }, [syncTrakt]);

  // Recarga el estado de Trakt (visto, rating, historial, watchlist) para el contenido actual
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

  // Carga el scoreboard de Trakt (rating de la comunidad y estadisticas de uso)
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

        // Extraer estadisticas de uso de la comunidad
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

  // Carga las estadisticas detalladas de Trakt (watchers, plays, collectors, etc.)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        setTraktStatsLoading(true);
        setTraktStatsError("");

        const res = await traktGetStats({ type: traktType, tmdbId: id });
        if (cancelled) return;

        // El formato de respuesta puede variar: { stats } o directamente stats
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

  // Resetear estados de Trakt al cambiar de contenido
  useEffect(() => {
    setTraktWatchedOpen(false);
    setTraktEpisodesOpen(false);
    setEpisodeBusyKey("");
    setTraktBusy("");

    // Resetear episodios para evitar mostrar 0% mientras carga la nueva serie
    setWatchedBySeason({});
    setWatchedBySeasonLoaded(false);
  }, [id, endpointType]);

  // Recargar estado de Trakt al abrir el modal de historial
  useEffect(() => {
    if (!traktWatchedOpen) return;
    reloadTraktStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traktWatchedOpen]);

  // Carga inicial del estado de Trakt para el contenido actual
  // (visto, rating, historial, watchlist, progreso)
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

  // Trigger para cargar episodios vistos cuando cambian las dependencias
  useEffect(() => {
    loadTraktShowWatched();
  }, [loadTraktShowWatched]);

  /**
   * Carga los plays (visionados completos) de la serie desde Trakt.
   * Opcionalmente filtra por fecha de inicio (para rewatches).
   * Tambien carga los episodios vistos en el rewatch actual.
   */
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
          // Guardar los historyIds para poder desmarcar episodios en rewatch
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

  // Refrescar episodios vistos y plays al abrir el modal de episodios
  // (evita que se quede desincronizado con el estado real de Trakt)
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

  // Alterna el estado de "visto" del contenido completo en Trakt
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

  // Agrega un nuevo visionado (play) con fecha especifica al historial de Trakt
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

  // Actualiza la fecha de un visionado existente en el historial de Trakt
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

  // Elimina un visionado del historial de Trakt por su historyId
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

  // Establece o elimina la puntuacion del usuario en Trakt de forma segura
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

  /**
   * Marca/desmarca un episodio individual como visto en Trakt.
   * Usa actualizacion optimista con rollback en caso de error.
   */
  const toggleEpisodeWatched = async (seasonNumber, episodeNumber) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;
    if (episodeBusyKey) return;

    const key = `S${seasonNumber}E${episodeNumber}`;
    setEpisodeBusyKey(key);

    const currentlyWatched =
      !!watchedBySeason?.[seasonNumber]?.includes(episodeNumber);
    const next = !currentlyWatched;

    // Actualizacion optimista: cambiar UI antes de confirmar con el servidor
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

      // Si el endpoint devuelve el estado actualizado directamente, usarlo
      if (r?.watchedBySeason) {
        setWatchedBySeason(r.watchedBySeason);
      } else {
        // Fallback: recargar el estado completo desde Trakt
        const fresh = await traktGetShowWatched({ tmdbId: id });
        setWatchedBySeason(fresh?.watchedBySeason || {});
      }
    } catch {
      // Rollback: revertir cambio optimista si falla la peticion
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

  /**
   * Marca/desmarca un episodio en el contexto de un rewatch.
   * A diferencia de toggleEpisodeWatched, este agrega un nuevo play con fecha
   * y asocia el historyId para poder desmarcarlo despues.
   */
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

      // Actualizacion optimista del estado de rewatch
      setRewatchWatchedBySeason((prev) => {
        const p = prev && typeof prev === "object" ? prev : {};
        const cur = new Set(p?.[seasonNumber] || []);
        if (next) cur.add(episodeNumber);
        else cur.delete(episodeNumber);
        return { ...p, [seasonNumber]: Array.from(cur).sort((a, b) => a - b) };
      });

      try {
        if (next) {
          // Agregar play de rewatch: el endpoint devuelve el historyId
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
          // Quitar play de rewatch: necesita el historyId guardado
          const hid = rewatchHistoryByEpisode?.[key];
          if (!hid) {
            // Sin historyId no se puede desmarcar de forma fiable
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

        // Refrescar estado del run activo de rewatch
        await loadTraktShowPlays(rewatchStartAt);

        // Mantener el estado global actualizado tambien
        const fresh = await traktGetShowWatched({ tmdbId: id });
        setWatchedBySeason(fresh?.watchedBySeason || {});
      } catch (e) {
        // Rollback del estado optimista
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

  // Marca/desmarca TODA la serie como vista (todos los episodios de todas las temporadas)
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

      // Actualizacion optimista: marcar todos los episodios segun episode_count
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

      // Refrescar el estado real desde Trakt (por si difiere del optimista)
      await reloadTraktStatus();
      const fresh = await traktGetShowWatched({ tmdbId: tmdbIdNum });
      setWatchedBySeason(fresh?.watchedBySeason || {});
    } catch (e) {
      console.error("[DetailsClient] onToggleShowWatched error:", e);
    } finally {
      setEpisodeBusyKey("");
    }
  };

  // Agrega un visionado completo de la serie en Trakt (play de toda la serie)
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

  // Inicia un nuevo rewatch de la serie con fecha de inicio
  const onStartShowRewatch = async (startedAtIsoOrNull) => {
    if (type !== "tv") return;
    if (!trakt?.connected) return;

    const startIso = startedAtIsoOrNull || new Date().toISOString();
    setRewatchStartAt(startIso);

    // Persistir fecha de inicio del rewatch en localStorage
    try {
      window.localStorage.setItem(rewatchStorageKey, startIso);
    } catch {}

    await loadTraktShowPlays(startIso);
  };

  // Agrega un play individual de un episodio en un rewatch
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

      // Refrescar progreso del run activo
      await loadTraktShowPlays(rewatchStartAt);

      // Mantener watchedBySeason global coherente
      const fresh = await traktGetShowWatched({ tmdbId: id });
      setWatchedBySeason(fresh?.watchedBySeason || {});
    } finally {
      setEpisodeBusyKey("");
    }
  };

  // =====================================================================
  // COLECCION DE PELICULAS
  // Si la pelicula pertenece a una coleccion (ej. saga), carga sus datos.
  // =====================================================================

  const collectionId =
    typeof data?.belongs_to_collection?.id === "number"
      ? data.belongs_to_collection.id
      : null;

  const [collectionData, setCollectionData] = useState(null);
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Carga los datos de la coleccion si la pelicula pertenece a una
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

  // Carga las runs de rewatch desde localStorage.
  // Incluye migracion del formato legacy (un unico rewatch) al nuevo formato (multiples runs).
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
      // 1. Cargar runs del nuevo formato
      let runs = [];
      const rawRuns = window.localStorage.getItem(rewatchRunsStorageKey);
      if (rawRuns) {
        const parsed = JSON.parse(rawRuns);
        if (Array.isArray(parsed)) runs = parsed;
      }

      // 2. Compatibilidad: migrar formato legacy (un solo rewatch) al nuevo formato
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
          } catch {}
        }
      }

      setRewatchRuns(runs);

      // 3. Restaurar la vista activa (global o un run especifico)
      const savedView =
        window.localStorage.getItem(episodesViewStorageKey) || "global";
      const validView =
        savedView === "global" || runs.some((r) => r?.id === savedView)
          ? savedView
          : "global";

      setActiveEpisodesView(validView);

      // 4. Ajustar rewatchStartAt segun la vista activa
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

  // =====================================================================
  // DATOS EXTRA: IMDb, Rotten Tomatoes, Metacritic y Premios
  // Carga ratings de OMDb (IMDb, RT, MC) con cache en localStorage.
  // Los votos y premios se cargan en idle (requestIdleCallback) para no
  // bloquear la UI.
  // =====================================================================

  const [extras, setExtras] = useState({
    imdbRating: null,
    imdbVotes: null,
    awards: null,
    rtScore: null,
    mcScore: null,
  });
  const [imdbVotesLoading, setImdbVotesLoading] = useState(false);

  // ID de IMDb resuelto (puede venir directo de TMDb o cargarse via getExternalIds)
  const [resolvedImdbId, setResolvedImdbId] = useState(null);

  // Carga datos de OMDb: rating IMDb, votos, premios, RT y Metacritic.
  // Usa cache en localStorage para evitar peticiones repetidas.
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
        // Reset suave al cambiar de contenido
        setExtras({
          imdbRating: null,
          imdbVotes: null,
          awards: null,
          rtScore: null,
          mcScore: null,
        });
        setImdbVotesLoading(false);

        // Resetear el imdbId resuelto para este contenido
        setResolvedImdbId(null);

        const imdbId = await resolveImdbId();

        // Si el effect se cancelo (cambio de contenido), salir
        if (abort) return;

        // Guardar el imdbId resuelto para usarlo en enlaces y badges
        setResolvedImdbId(imdbId || null);

        // Sin imdbId no se puede consultar OMDb
        if (!imdbId) return;

        // Intentar cargar datos desde cache de localStorage
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

        // Si el cache esta fresco y completo, no hacer peticion de red
        if (
          cached?.fresh &&
          cached?.imdbRating != null &&
          cached?.imdbVotes != null
        )
          return;

        // Peticion a OMDb para obtener datos frescos
        const omdb = await fetchOmdbByImdb(imdbId);
        if (abort) return;

        const imdbRating =
          omdb?.imdbRating && omdb.imdbRating !== "N/A"
            ? Number(omdb.imdbRating)
            : null;

        const { rtScore, mcScore } = extractOmdbExtraScores(omdb);

        // Mostrar datos rapidos primero (IMDb + RT + MC)
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

        // Votos y premios se cargan en idle para no bloquear la UI
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

          // Resetear el resolvedImdbId si hay error
          setResolvedImdbId(null);
        }
      }
    };

    run();
    return () => {
      abort = true;
    };
  }, [type, id, data?.imdb_id, data?.external_ids?.imdb_id, endpointType]);

  /**
   * Puntuacion unificada: envia la puntuacion a TMDb y Trakt simultaneamente.
   * Si no hay sesion, redirige a login.
   */
  const handleUnifiedRate = async (value) => {
    // Sin sesion activa, redirigir a login
    if (!session) {
      window.location.href = "/login";
      return;
    }

    // 1. Enviar a TMDb (skipSync para evitar doble sincronizacion)
    if (value === null) {
      await clearTmdbRating({ skipSync: true });
    } else {
      await sendTmdbRating(value, { skipSync: true });
    }

    // 2. Enviar a Trakt si esta conectado (Trakt usa null para borrar)
    if (trakt.connected) {
      await sendTraktRating(value); // sendTraktRating ya maneja null internamente
    }
  };

  // Persiste las runs de rewatch en localStorage
  const persistRuns = useCallback(
    (nextRuns) => {
      try {
        window.localStorage.setItem(
          rewatchRunsStorageKey,
          JSON.stringify(nextRuns || []),
        );
      } catch {}
    },
    [rewatchRunsStorageKey],
  );

  // Cambia la vista de episodios entre "global" y un run de rewatch especifico
  const changeEpisodesView = useCallback(
    async (viewId) => {
      const v = viewId || "global";
      setActiveEpisodesView(v);
      try {
        window.localStorage.setItem(episodesViewStorageKey, v);
      } catch {}

      if (v === "global") {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null); // Refrescar a vista global
        return;
      }

      const run = (rewatchRuns || []).find((r) => r?.id === v);
      const startAt = run?.startedAt || v;

      setRewatchStartAt(startAt);
      await loadTraktShowPlays(startAt); // Refrescar al cambiar de run
    },
    [episodesViewStorageKey, rewatchRuns, loadTraktShowPlays],
  );

  // Crea un nuevo run de rewatch con fecha de inicio y lo establece como vista activa
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
      } catch {}
      setRewatchStartAt(run.startedAt);

      await loadTraktShowPlays(run.startedAt); // Cargar datos del run
    },
    [episodesViewStorageKey, persistRuns, loadTraktShowPlays],
  );

  // Elimina un run de rewatch y vuelve a vista global si era el activo
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
        } catch {}
        return nextView;
      });

      if (wasActive) {
        setRewatchStartAt(null);
        await loadTraktShowPlays(null); // Volver a vista global
      }
    },
    [
      activeEpisodesView,
      episodesViewStorageKey,
      persistRuns,
      loadTraktShowPlays,
    ],
  );

  // Puntuacion unificada del usuario: prioriza TMDb (con decimal) sobre Trakt (redondeado)
  const unifiedUserRating =
    userRating ?? (trakt.connected && trakt.rating ? trakt.rating : null);

  // ====== RATINGS DE EPISODIOS (solo TV) ======
  const [ratings, setRatings] = useState(null); // Ratings por episodio
  const [ratingsError, setRatingsError] = useState(null);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  // Carga los ratings de episodios para series TV (excluyendo especiales)
  useEffect(() => {
    const RATINGS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
    const cacheKey = `showverse:tv:${id}:episode-ratings:v2-imdb-trakt`;

    const readCache = () => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || !parsed?.data) return null;
        if (Date.now() - Number(parsed.ts) > RATINGS_CACHE_TTL_MS) return null;
        return parsed.data;
      } catch {
        return null;
      }
    };

    const writeCache = (data) => {
      if (typeof window === "undefined" || !data) return;
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({ ts: Date.now(), data }),
        );
      } catch {}
    };

    let ignore = false;
    async function load() {
      if (type !== "tv") {
        if (!ignore) {
          setRatings(null);
          setRatingsError(null);
          setRatingsLoading(false);
        }
        return;
      }

      if (!ignore) setRatingsError(null);

      const cached = readCache();
      if (cached) {
        if (!ignore) {
          setRatings(cached);
          setRatingsLoading(false);
        }
        return;
      }

      setRatingsLoading(true);
      try {
        const res = await fetch(`/api/tv/${id}/ratings?excludeSpecials=true`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        if (!ignore) {
          setRatings(json);
          writeCache(json);
        }
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

  // =====================================================================
  // HANDLERS DE SELECCION DE ARTWORK
  // Permiten al usuario elegir poster, preview backdrop y fondo.
  // Cada seleccion se persiste en localStorage y se guarda en la API.
  // =====================================================================

  const [posterToggleBusy, setPosterToggleBusy] = useState(false); // Transicion de poster en curso

  // Selecciona un poster especifico y lo persiste
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

  // Selecciona un backdrop para el modo preview y lo persiste
  const handleSelectPreviewBackdrop = (filePath) => {
    setSelectedPreviewBackdropPath(filePath);
    if (typeof window !== "undefined") {
      filePath
        ? window.localStorage.setItem(previewBackdropStorageKey, filePath)
        : window.localStorage.removeItem(previewBackdropStorageKey);
    }
    saveArtworkOverride({ type: endpointType, id, kind: "backdrop", filePath });
  };

  // Selecciona una imagen de fondo con transicion crossfade suave
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

    // Terminar transicion de crossfade despues de 600ms
    setTimeout(() => {
      setIsTransitioning(false);
      setPrevBackgroundPath(null);
    }, 600);
  };

  // Resetea todas las selecciones de artwork a los valores por defecto
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

  /**
   * Cicla entre modo poster y preview con animacion de layout.
   * 1) Si va a preview: primero cambia el layout (aspect-ratio) y luego la imagen.
   * 2) Si va a poster: primero cambia la imagen y luego reduce el layout.
   * Usa una secuencia incremental para manejar clicks rapidos y cancelar transiciones obsoletas.
   */
  const handleCyclePoster = useCallback(async () => {
    // Alternar entre poster actual y backdrop de vista previa (sin sobrescribir)
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

    // Determinar el siguiente modo basandose en el modo solicitado
    // Esto permite clicks rápidos seguidos incluso si todavía no hemos cambiado
    // posterViewMode (por ejemplo, mientras el layout se redimensiona).
    const currentMode = posterRequestedModeRef.current || posterViewMode;
    const nextMode = currentMode === "preview" ? "poster" : "preview";
    const targetPath = nextMode === "preview" ? previewPath : posterPath;

    // Incrementar secuencia antes de iniciar la transicion
    const seq = (posterToggleSeqRef.current += 1);
    posterRequestedModeRef.current = nextMode;
    setPosterToggleBusy(true);

    const abortIfStale = () =>
      posterToggleSeqRef.current !== seq ||
      posterRequestedModeRef.current !== nextMode;

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

    // 1) Si vamos a preview (backdrop), primero forzar el layout (ratio/ancho)
    // y esperamos a que la tarjeta se redimensione antes de cambiar la imagen.
    if (nextMode === "preview") {
      setPosterLayoutMode("preview");
      await waitFrames();
      // Esperar a la mitad de la transicion CSS (250ms de 500ms)
      // para que el aspect-ratio cambie primero
      await wait(250);
      if (abortIfStale()) return;
    }

    // Verificar si la imagen ya esta en cache (instantaneo)
    const checkCached = () => {
      const testImg = new Image();
      testImg.src = `https://image.tmdb.org/t/p/w780${targetPath}`;
      return testImg.complete && testImg.naturalWidth > 0;
    };

    const applyMode = () => {
      if (abortIfStale()) return;

      // Cambiar la imagen despues de que el layout haya empezado a cambiar
      setPosterViewMode(nextMode);

      // Si volvemos a poster, reducir el layout despues del swap
      if (nextMode === "poster") {
        // Esperar a la mitad de la transicion antes de cambiar el layout
        setTimeout(() => {
          if (abortIfStale()) return;
          setPosterLayoutMode("poster");
        }, 250);
      }

      safeFinish();
    };

    // Si ya esta en cache, cambiar sin precarga adicional
    if (checkCached()) {
      applyMode();
      return;
    }

    // Precargar la imagen con timeout (evita esperas eternas)
    await new Promise((resolve) => {
      const img = new Image();
      const timeout = setTimeout(() => {
        resolve(false); // timeout: continuar de todas formas
      }, 400); // Timeout corto ya que esperamos antes

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

  // Persistir el modo de vista globalmente y sincronizar layoutMode
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(globalViewModeStorageKey, posterViewMode);
      // Sincronizar layoutMode cuando posterViewMode cambie (excepto durante transiciones)
      // Esto asegura que ambos estados estén alineados después de navegaciones
      if (!posterToggleBusy) {
        setPosterLayoutMode(posterViewMode);
      }
    } catch {}
  }, [posterViewMode, globalViewModeStorageKey, posterToggleBusy]);

  // Copia la URL original de una imagen de TMDb al portapapeles
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

  // -- Navegacion por scroll horizontal de la galeria de imagenes --
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

  // =====================================================================
  // ENLACES EXTERNOS
  // URLs a sitios externos: FilmAffinity, JustWatch, Letterboxd,
  // SeriesGraph, sitio oficial. Se resuelven via API para obtener
  // URLs directas (no de busqueda) cuando es posible.
  // =====================================================================

  const [externalLinksOpen, setExternalLinksOpen] = useState(false); // Modal de enlaces externos abierto

  // URL de busqueda en FilmAffinity
  const filmAffinitySearchUrl = `https://www.filmaffinity.com/es/search.php?stext=${encodeURIComponent(
    data.title || data.name,
  )}`;

  const isMovie = endpointType === "movie";

  // URL de SeriesGraph (solo para series TV)
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
    } catch {}
  }, [jwCacheKey]);

  // 1) Hidratar desde cache para que el icono salga instantaneo en visitas posteriores
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = window.localStorage.getItem(jwCacheKey);
      if (cached) {
        setExtLinks((p) => ({ ...p, justwatch: cached || null }));
      }
    } catch {}
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
      } catch {}
      return;
    }

    const ac = new AbortController();

    const run = async () => {
      // Importante: marcamos loading pero NO ponemos justwatch:null (asi no "parpadea")
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

        // Cache: para que en siguientes visitas salga instantaneo
        try {
          if (typeof window !== "undefined") {
            if (resolved) window.localStorage.setItem(jwCacheKey, resolved);
            else window.localStorage.removeItem(jwCacheKey);
          }
        } catch {}
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

    // Letterboxd SOLO movies
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

  // Director (movie) - fallback si data no trae credits
  // Director (movie) - fallback si data no trae credits
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
      // FIX: Actualizamos tambien el string del nombre aqui
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
        // FIX: Actualizamos tambien el string del nombre tras el fetch
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

  // Menu global (nuevo)

  const [activeSection, setActiveSection] = useState(() => null);

  // Cuando cambie type, fijar una seccion inicial valida
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
  // CAST: mantener orden TMDb + evitar cast incompleto
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

    // Media = Imagenes + Videos (unificado)
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

    // Sentimientos
    items.push({
      id: "sentiment",
      label: "Sentimientos",
      icon: Sparkles,
    });

    // TV: Temporadas
    if (type === "tv") {
      items.push({
        id: "seasons",
        label: "Temporadas",
        icon: Layers,
        count: Array.isArray(tSeasons?.items)
          ? tSeasons.items.length
          : undefined,
      });
      // TV: Episodios
      items.push({
        id: "episodes",
        label: "Episodios",
        icon: TrendingUp,
        // si no tienes "ratings.length", puedes dejar count undefined
        count: Array.isArray(ratings) ? ratings.length : undefined,
      });
    }

    // Comentarios = Trakt + Criticas (unificado)
    const traktCommentsCount = Number(tComments?.total || 0) || 0;
    const reviewsCount = Array.isArray(reviews) ? reviews.length : 0;
    const commentsCount = traktCommentsCount + reviewsCount;

    items.push({
      id: "comments",
      label: "Comentarios",
      icon: MessageSquareIcon,
      count: commentsCount || undefined,
    });

    // Listas
    items.push({
      id: "lists",
      label: "Listas",
      icon: ListVideo,
      count: Array.isArray(tLists?.items) ? tLists.items.length : undefined,
    });

    // Coleccion
    if (collectionId) {
      items.push({
        id: "collection",
        label: "Colección",
        icon: Layers,
        count: collectionData?.items?.length || undefined,
        loading: collectionLoading && !collectionData,
      });
    }

    // Reparto
    items.push({
      id: "cast",
      label: "Reparto",
      icon: Users,
      count: castDataForUI?.length ? castDataForUI.length : undefined,
    });

    // Recomendaciones (texto completo)
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

  // Menu global (scroll + sticky + spy)
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
  // IMDb para recomendaciones: solo hover (no auto)
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
    const cacheKey = `plex-v9:${endpointType}:${id}`;
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días (1 semana)

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
          tmdbId: String(id), // <- NUEVO (para slug en Android)
        });

        if (yearIso) params.append("year", yearIso);
        if (data.imdb_id) params.append("imdbId", data.imdb_id);

        const response = await fetch(`/api/plex?${params.toString()}`);

        if (response.ok) {
          const result = await response.json();
          const available = result.available || false;

          const plexWebUrl = result.plexUrl || null;
          const plexMobileUrl = result.plexMobileUrl || null; // iOS deep link
          const plexUniversalUrl = result.plexUniversalUrl || null; // Android

          setPlexAvailable(available);

          setPlexUrl({
            web: plexWebUrl,
            mobile: plexMobileUrl,
            universal: plexUniversalUrl,
          });

          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              available,
              plexUrl: {
                web: plexWebUrl,
                mobile: plexMobileUrl,
                universal: plexUniversalUrl,
              },
              timestamp: Date.now(),
            }),
          );
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
        url: plexUrl, // Objeto con {web, mobile}
        isPlex: true,
      });
    }

    return providers.slice(0, 6);
  }, [streamingProviders, plexAvailable, plexUrl]);

  // Refs para gestion de carga de poster (los estados estan definidos al inicio)
  const prevDisplayPosterRef = useRef(null);
  const posterLoadTokenRef = useRef(0);
  const posterToggleSeqRef = useRef(0);
  const posterRequestedModeRef = useRef("poster");

  useEffect(() => {
    posterRequestedModeRef.current = posterViewMode;
  }, [posterViewMode]);

  // Activar posterResolved cuando displayPosterPath este disponible
  useEffect(() => {
    // Activar posterResolved inmediatamente si tenemos un path valido (igual que el poster)
    if (displayPosterPath && !posterResolved) {
      setPosterResolved(true);
    }
    // Incluimos artworkInitialized para evitar error de HMR "deps changed size"
  }, [displayPosterPath, posterResolved, artworkInitialized]);

  // Fallback automatico: si backdrop falla, cambiar a poster
  useEffect(() => {
    if (
      posterImgError &&
      posterViewMode === "preview" &&
      basePosterDisplayPath
    ) {
      console.warn("Backdrop failed to load, falling back to poster");
      setPosterViewMode("poster");
      setPosterLayoutMode("poster");
      // Resetear error para que el poster pueda cargar
      setPosterImgError(false);
      setPosterLowLoaded(false);
      setPosterHighLoaded(false);
    }
  }, [posterImgError, posterViewMode, basePosterDisplayPath]);

  // Fallback si no hay backdrop disponible en modo preview
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
  }, [
    posterViewMode,
    artworkInitialized,
    previewBackdropPath,
    basePosterDisplayPath,
  ]);

  // Timeout de seguridad: si despues de 3s no hay imagen en modo preview, cambiar a poster
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

    // Manejar cambio de imagen (incluyendo de null a valor)
    if (prev !== displayPosterPath) {
      // Si hay imagen anterior, guardarla para crossfade
      if (prev) {
        setPrevPosterPath(prev);
      }

      // Verificar si la nueva imagen ya esta precargada
      if (displayPosterPath) {
        const checkIfLoaded = (size) => {
          const testImg = new Image();
          testImg.src = `https://image.tmdb.org/t/p/${size}${displayPosterPath}`;
          return testImg.complete && testImg.naturalWidth > 0;
        };

        const isLowPreloaded = checkIfLoaded("w342");
        const isHighPreloaded = checkIfLoaded("w780");

        // Si esta precargada, marcar como cargada inmediatamente
        if (isLowPreloaded) {
          setPosterLowLoaded(true);
          setPosterHighLoaded(isHighPreloaded); // Tambien verificar HIGH
        } else {
          setPosterLowLoaded(false);
          setPosterHighLoaded(false);
        }

        setPosterTransitioning(!!prev); // Solo transición si había imagen anterior
        setPosterImgError(false);

        // Limpiar transicion despues del tiempo configurado
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

  // Resetear estados de carga del backdrop cuando cambia la vista o la imagen
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
        // Verificar si la nueva imagen ya esta precargada
        if (previewBackdropPath) {
          const checkIfLoaded = (size) => {
            const testImg = new Image();
            testImg.src = `https://image.tmdb.org/t/p/${size}${previewBackdropPath}`;
            return testImg.complete && testImg.naturalWidth > 0;
          };

          const isLowPreloaded = checkIfLoaded("w780");
          const isHighPreloaded = checkIfLoaded("w1280");

          // Si esta precargada, marcar como cargada inmediatamente
          if (isLowPreloaded) {
            setBackdropLowLoaded(true);
            setBackdropHighLoaded(isHighPreloaded);
            setBackdropResolved(true);
          } else {
            setBackdropLowLoaded(false);
            setBackdropHighLoaded(false);
            setBackdropResolved(true);
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

  // URLs basadas en el modo de vista
  const posterLowUrl =
    posterViewMode === "preview" && previewBackdropPath
      ? `https://image.tmdb.org/t/p/w780${previewBackdropPath}`
      : displayPosterPath
        ? `https://image.tmdb.org/t/p/w342${displayPosterPath}`
        : null;

  const posterHighUrl =
    posterViewMode === "preview" && previewBackdropPath
      ? `https://image.tmdb.org/t/p/w1280${previewBackdropPath}`
      : displayPosterPath
        ? `https://image.tmdb.org/t/p/w780${displayPosterPath}`
        : null;
  const posterLoadToken = posterLoadTokenRef.current;

  // Estados unificados: usar backdrop states si estamos en preview, sino poster states
  const currentLowLoaded =
    posterViewMode === "preview" ? backdropLowLoaded : posterLowLoaded;
  const currentHighLoaded =
    posterViewMode === "preview" ? backdropHighLoaded : posterHighLoaded;
  const currentImgError =
    posterViewMode === "preview" ? backdropImgError : posterImgError;
  const currentResolved =
    posterViewMode === "preview" ? backdropResolved : posterResolved;
  const currentImagePath =
    posterViewMode === "preview" ? posterLowUrl : displayPosterPath;
  const currentLoadToken =
    posterViewMode === "preview" ? backdropLoadToken : posterLoadToken;
  const currentLoadTokenRef =
    posterViewMode === "preview" ? backdropLoadTokenRef : posterLoadTokenRef;

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
  const posterTiltRef = useRef(null); // El recuadro completo que se inclina
  const posterAnimRafRef = useRef(0); // Un solo rAF
  const posterTargetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterStateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterLastInputRef = useRef(0);

  const POSTER_MAX = 12; // grados
  const POSTER_SCALE = 1.06; // escala al hover
  const POSTER_OVERSCAN = 1.02; // Minimo para no perder nitidez
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

  // Animacion 3D del poster/backdrop
  useEffect(() => {
    if (!poster3dEnabled) return;

    const el = posterTiltRef.current;
    if (!el) return;

    let mounted = true;

    // Resetear posterLastInputRef para que idle funcione inmediatamente al cambiar imagen
    posterLastInputRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const loop = (t) => {
      if (!mounted) return;

      const now =
        t ??
        (typeof performance !== "undefined" ? performance.now() : Date.now());
      const idle = now - posterLastInputRef.current > IDLE_DELAY;

      let target = posterTargetRef.current;

      // Idle automatico cuando no hay interaccion (mas visual pero estable)
      if (idle) {
        const dt = now / 1000;
        target = {
          rx: Math.sin(dt * 1.05) * 5.5,
          ry: Math.cos(dt * 0.9) * 8.5,
          s: 1.03 + Math.sin(dt * 1.6) * 0.01,
        };
      }

      const cur = posterStateRef.current;

      // LERP suave (fluido y responsivo)
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

            {/* Capa base: siempre cubre (evita marcos laterales) */}
            <div
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-500"
              style={{
                backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
                transform: "scale(1)",
                filter: "blur(14px) brightness(0.65) saturate(1.05)",
                opacity: isTransitioning ? 1 : 1,
              }}
            />

            {/* Capa detalle: zoom OUT (scale < 1) */}
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

        {/* Sombreado superior + laterales (sin "marcos") */}
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
            className={`w-full mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10 transition-all duration-500 ${
              isBackdropPoster
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
                {/* Este es el recuadro completo que se inclina */}
                <div
                  ref={posterTiltRef}
                  className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40 will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                    // NO transition en transform - manejado por requestAnimationFrame
                  }}
                >
                  {/* (Opcional) borde suave sin sombreado encima */}
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />

                  <div
                    className={`relative bg-neutral-950 will-change-auto ${
                      isBackdropPoster ? "aspect-[16/9]" : "aspect-[2/3]"
                    }`}
                    style={{
                      transition:
                        "aspect-ratio 500ms cubic-bezier(0.4, 0, 0.2, 1)",
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
                            if (
                              currentLoadTokenRef.current !== currentLoadToken
                            )
                              return;
                            // Usar el setState correcto segun el modo
                            if (posterViewMode === "preview") {
                              setBackdropLowLoaded(true);
                              setBackdropResolved(true);
                            } else {
                              setPosterLowLoaded(true);
                              setPosterResolved(true);
                            }
                          }}
                          onError={() => {
                            if (
                              currentLoadTokenRef.current !== currentLoadToken
                            )
                              return;
                            // Usar el setState correcto segun el modo
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
                              // Usar el setState correcto segun el modo
                              if (posterViewMode === "preview") {
                                setBackdropHighLoaded(true);
                              } else {
                                setPosterHighLoaded(true);
                              }
                            }}
                            onError={() => {}}
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
            {(limitedProviders && limitedProviders.length > 0) ||
            (isBackdropPoster && externalLinks.length > 0) ? (
              <div className="flex flex-row flex-nowrap justify-center items-center gap-3 w-full px-1 py-2 overflow-x-auto [scrollbar-width:none]">
                {/* Providers - Solo si hay plataformas */}
                {limitedProviders && limitedProviders.length > 0 && (
                  <div className="flex flex-row flex-nowrap items-center gap-2">
                    {limitedProviders.map((p) => {
                      const isPlexProvider = p.isPlex === true;

                      // Para Plex, manejar las URLs de forma especial
                      let providerLink;
                      let hasValidLink;

                      if (
                        isPlexProvider &&
                        p.url &&
                        typeof p.url === "object"
                      ) {
                        providerLink = "#";
                        hasValidLink = !!(
                          p.url.web ||
                          p.url.mobile ||
                          p.url.universal
                        );
                      } else {
                        providerLink = p.url || justwatchUrl || "#";
                        hasValidLink = p.url || justwatchUrl;
                      }

                      const handleClick = (e) => {
                        if (
                          isPlexProvider &&
                          p.url &&
                          typeof p.url === "object"
                        ) {
                          e.preventDefault();

                          const ua = navigator.userAgent || "";

                          // Detectar si es dispositivo táctil (móvil/tablet)
                          const isTouchDevice =
                            "ontouchstart" in window ||
                            navigator.maxTouchPoints > 0 ||
                            navigator.msMaxTouchPoints > 0;

                          const isAndroid = /Android/i.test(ua);
                          const isIOS = /iPad|iPhone|iPod/i.test(ua);

                          // Eleccion de URL segun dispositivo:
                          let urlToOpen;

                          if (isTouchDevice) {
                            // En movil/tablet SIEMPRE intentar deep link primero
                            // para abrir el detalle en la app Plex del servidor local.
                            if (isAndroid || isIOS) {
                              urlToOpen =
                                p.url.mobile || p.url.web || p.url.universal;
                            } else {
                              urlToOpen =
                                p.url.mobile || p.url.universal || p.url.web;
                            }
                          } else {
                            // Ordenador sin táctil: solo URL web
                            urlToOpen = p.url.web || p.url.universal;
                          }

                          if (!urlToOpen) {
                            console.warn("[Plex] No URL available");
                            return;
                          }

                          // En dispositivo táctil, usa navegación directa (mejor para app links)
                          if (isTouchDevice) {
                            window.location.href = urlToOpen;
                          } else {
                            window.open(
                              urlToOpen,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }
                        }
                      };

                      return (
                        <a
                          key={p.provider_id}
                          href={providerLink}
                          target={
                            hasValidLink && !isPlexProvider
                              ? "_blank"
                              : undefined
                          }
                          rel={
                            hasValidLink && !isPlexProvider
                              ? "noreferrer"
                              : undefined
                          }
                          onClick={isPlexProvider ? handleClick : undefined}
                          title={p.provider_name}
                          className="relative flex-shrink-0 transition-transform transform hover:scale-110 hover:brightness-110 hover:z-10 cursor-pointer"
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
                            className="w-7 h-7 lg:w-8 lg:h-8 rounded-xl shadow-lg object-contain"
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
          <div
            className={`flex-1 flex flex-col min-w-0 w-full ${
              isBackdropPoster ? "" : ""
            }`}
          >
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
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                        data.status === "Ended" || data.status === "Canceled"
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

            {/* =================================================================
                BARRA DE ACCIONES PRINCIPALES
               ================================================================= */}
            {/* Sección de botones de acción rápida: reproducir tráiler, marcar como visto,
                puntuar, agregar a favoritos, watchlist y listas, cambiar portada */}
            <div className="flex flex-wrap items-center gap-2 mb-6 px-1">
              {/* Botón de reproducción de tráiler - Solo habilitado si hay video disponible */}
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

              {/* Separador vertical entre el botón de tráiler y los controles de Trakt */}
              <div className="w-px h-8 bg-white/10 mx-1 hidden sm:block" />

              {/* Control de visto/no visto en Trakt - Muestra estado de visualización y plays */}
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

              {/* Componente de puntuación con estrellas - Rating unificado TMDb + Trakt */}
              {/* Permite al usuario puntuar el contenido, sincronizando entre ambas plataformas */}
              <StarRating
                rating={unifiedUserRating}
                max={10}
                loading={accountStatesLoading || ratingLoading || !!traktBusy}
                onRate={handleUnifiedRate}
                connected={!!session || trakt.connected}
                onConnect={() => {
                  window.location.href = "/login";
                }}
              />

              {/* Botón de Favoritos - Añade o quita el contenido de la lista de favoritos del usuario */}
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

              {/* Botón de Watchlist - Añade o quita el contenido de la lista de pendientes */}
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

              {/* Botón de añadir a listas personalizadas - Solo visible si el usuario tiene acceso a listas */}
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

              {/* Botón para cambiar entre vista de portada y vista previa (backdrop) */}
              {/* Permite alternar la imagen principal entre el póster y el backdrop */}
              <LiquidButton
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCyclePoster();
                }}
                active={posterViewMode === "preview"}
                activeColor="orange"
                groupId="details-actions"
                title={
                  posterViewMode === "preview"
                    ? "Mostrar portada"
                    : "Mostrar vista previa"
                }
              >
                {posterToggleBusy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </LiquidButton>
            </div>

            {/* =================================================================
                PANEL DE PUNTUACIONES Y ESTADÍSTICAS
               ================================================================= */}
            {/* Tarjeta compacta que muestra los ratings de diferentes plataformas
                (TMDb, Trakt, IMDb, Rotten Tomatoes, Metacritic) y estadísticas
                de visualización (watchers, plays, lists, favorited) */}
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
                {/* ========== A. RATINGS - Puntuaciones de diferentes plataformas ========== */}
                {/* Sección de badges compactos que muestran las puntuaciones y votos de cada plataforma */}
                <div className="flex items-center gap-4 sm:gap-5 shrink-0">
                  {/* Indicador de carga mientras se obtienen las puntuaciones de Trakt */}
                  {tScoreboard.loading && (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  )}

                  {/* Badge de TMDb - Muestra la puntuación promedio y número de votos */}
                  <CompactBadge
                    logo="/logo-TMDb.png"
                    logoClassName="h-2 sm:h-4"
                    value={data.vote_average?.toFixed(1)}
                    sub={formatCountShort(data.vote_count)}
                    href={tmdbDetailUrl}
                  />

                  {/* Badge de Trakt - Muestra puntuación en formato decimal cuando el usuario está conectado */}
                  {/* En móvil sin sufijo, en desktop con % */}
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

                  {/* Badge de Trakt alternativo cuando no hay conexión pero existe score público */}
                  {/* Se muestra solo si el usuario no está conectado a Trakt pero hay datos públicos disponibles */}
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

                  {/* Badge de IMDb - Muestra rating y votos, enlaza al título en IMDb */}
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

                  {/* Badge de Rotten Tomatoes - Solo visible en desktop (>= sm) */}
                  {/* Muestra el porcentaje de audiencia de RT, prioriza datos de Trakt sobre OMDb */}
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

                  {/* Badge de Metacritic - Solo visible en desktop (>= sm) */}
                  {/* Muestra la puntuación de Metacritic sobre 100 */}
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

                {/* ========== Separador vertical 1 ========== */}
                {/* Solo se muestra cuando NO estamos en modo backdrop */}
                {!isBackdropPoster && (
                  <div className="w-px h-6 bg-white/10 shrink-0" />
                )}

                {/* ========== B. ENLACES EXTERNOS ========== */}
                {/* Botones para acceder a páginas externas (Web oficial, FilmAffinity, JustWatch, etc.) */}
                {/* Solo se muestran aquí cuando NO estamos en modo backdrop (en ese modo se muestran abajo con las plataformas) */}
                {!isBackdropPoster && (
                  <div className="flex-1 min-w-0 flex items-center justify-end gap-2.5 sm:gap-3">
                    {/* Versión Desktop: iconos normales de enlaces externos */}
                    <div className="hidden sm:flex items-center gap-2.5 sm:gap-3">
                      {/* Sitio web oficial */}
                      <div className="hidden sm:block">
                        <ExternalLinkButton
                          icon="/logo-Web.png"
                          href={officialSiteUrl}
                        />
                      </div>

                      {/* FilmAffinity - búsqueda del título */}
                      <ExternalLinkButton
                        icon="/logoFilmaffinity.png"
                        href={filmAffinitySearchUrl}
                      />

                      {/* JustWatch - dónde ver el contenido */}
                      <ExternalLinkButton
                        icon="/logo-JustWatch.png"
                        title="JustWatch"
                        href={jwHref}
                        fallbackHref={justWatchUrl}
                      />

                      {/* Letterboxd - solo para películas */}
                      {isMovie && (
                        <ExternalLinkButton
                          icon="/logo-Letterboxd.png"
                          href={letterboxdUrl}
                        />
                      )}

                      {/* SeriesGraph - solo para series */}
                      {type === "tv" && (
                        <ExternalLinkButton
                          icon="/logoseriesgraph.png"
                          href={seriesGraphUrl}
                        />
                      )}
                    </div>

                    {/* Versión Móvil: botón "..." que abre modal de enlaces */}
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

                {/* ========== Separador vertical 2 ========== */}
                {/* Solo visible en desktop (>= md) y cuando NO estamos en modo backdrop */}
                {!isBackdropPoster && (
                  <div className="hidden md:block w-px h-6 bg-white/10 shrink-0" />
                )}

                {/* ========== Botón de Compartir ========== */}
                {/* Permite compartir el contenido usando la API Web Share o copiando el enlace */}
                {/* Se mantiene pegado al extremo derecho con ml-auto */}
                <div className="ml-auto shrink-0">
                  <ActionShareButton
                    title={title}
                    text={`Echa un vistazo a ${title} en The Show Verse`}
                    url={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/details/${type}/${id}`
                        : undefined
                    }
                  />
                </div>
              </div>
              {/* =================================================================
                  FOOTER DE ESTADÍSTICAS (Watchers, Plays, Lists, Favorited)
                 ================================================================= */}
              {/* Muestra estadísticas de Trakt en formato compacto con scroll horizontal */}
              {/* Visible en móvil sin recortes gracias al padding con safe-area */}
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
                    {/* Contenedor interno con min-w-max para evitar que se corten los últimos elementos */}
                    <div className="flex items-center gap-3 min-w-max">
                      {/* Watchers - Usuarios que siguen este contenido */}
                      <div className="shrink-0">
                        <MiniStat
                          icon={Eye}
                          value={formatVoteCount(
                            tScoreboard?.stats?.watchers ?? 0,
                          )}
                          tooltip="Watchers"
                        />
                      </div>

                      {/* Plays - Número de reproducciones totales */}
                      <div className="shrink-0">
                        <MiniStat
                          icon={Play}
                          value={formatVoteCount(
                            tScoreboard?.stats?.plays ?? 0,
                          )}
                          tooltip="Plays"
                        />
                      </div>

                      {/* Lists - Cantidad de listas que incluyen este contenido */}
                      <div className="shrink-0">
                        <MiniStat
                          icon={List}
                          value={formatVoteCount(
                            tScoreboard?.stats?.lists ?? 0,
                          )}
                          tooltip="Lists"
                        />
                      </div>

                      {/* Favorited - Usuarios que lo han marcado como favorito */}
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

            {/* =================================================================
                CONTENEDOR DE TABS Y CONTENIDO - Información detallada
               ================================================================= */}
            {/* Sistema de tabs para mostrar información adicional: Detalles, Producción, Sinopsis, Premios */}
            {/* Solo visible cuando NO estamos en modo backdrop (en ese modo se muestra más abajo) */}
            {!isBackdropPoster && (
              <div>
                {/* ========== MENÚ DE NAVEGACIÓN DE TABS ========== */}
                {/* Pestañas clicables para cambiar entre diferentes vistas de información */}
                {/* Incluye: Detalles, Producción, Sinopsis, y Premios (si están disponibles) */}
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
          ${
            activeTab === tab.id
              ? "text-white border-yellow-500"
              : "text-zinc-500 border-transparent hover:text-zinc-300"
          }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ========== ÁREA DE CONTENIDO DE TABS ========== */}
                {/* Muestra el contenido de la tab activa con animaciones de transición */}
                {/* Usa AnimatePresence de Framer Motion para animar cambios entre tabs */}
                <div className="relative min-h-[100px]">
                  <AnimatePresence mode="wait">
                    {/* ===== TAB 1: SINOPSIS ===== */}
                    {/* Muestra el tagline (si existe) y la descripción completa del contenido */}
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

                    {/* ===== TAB 2: DETALLES ===== */}
                    {/* Información técnica: título original, formato, fechas, presupuesto, recaudación */}
                    {activeTab === "details" && (
                      <motion.div
                        key="details"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                          {/* Tarjeta: Título Original - Nombre del contenido en su idioma original */}
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

                          {/* Tarjeta: Formato - Solo para series (número de temporadas y episodios) */}
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

                          {/* Tarjeta: Fecha de Estreno/Inicio - Película: fecha de estreno, Serie: fecha de inicio */}
                          <VisualMetaCard
                            icon={CalendarIcon}
                            label={type === "movie" ? "Estreno" : "Inicio"}
                            value={releaseDateValue || "—"}
                            className="w-full lg:w-auto lg:flex-auto lg:shrink-0"
                          />

                          {/* Tarjeta: Finalización/Última Emisión - Solo para series */}
                          {type !== "movie" && lastAirDateValue && (
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
                          )}

                          {/* Tarjetas de Presupuesto y Recaudación - Solo para películas */}
                          {type === "movie" && (
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
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* ===== TAB 3: PRODUCCIÓN Y EQUIPO ===== */}
                    {/* Información sobre el equipo creativo: director/creadores, canal, productoras */}
                    {activeTab === "production" && (
                      <motion.div
                        key="production"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-stretch lg:overflow-x-auto lg:pb-2 lg:[scrollbar-width:none]">
                          {/* Tarjeta: Director (Cine) / Creadores (TV) - Equipo principal creativo */}
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

        {/* Tabs y contenido debajo de la tarjeta (solo cuando es backdrop) */}
        {isBackdropPoster && (
          <div className="mt-8 w-full">
            {/* --- MENÚ DE NAVEGACIÓN --- */}
            <div className="flex flex-wrap items-center gap-6 mb-4 border-b border-white/10 pb-1">
              {[
                { id: "details", label: "Detalles" },
                { id: "production", label: "Producción" },
                { id: "synopsis", label: "Sinopsis" },
                ...(extras.awards ? [{ id: "awards", label: "Premios" }] : []),
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2 text-sm font-bold uppercase tracking-wider transition-colors border-b-2 
        ${
          activeTab === tab.id
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

                {/* ===== TAB 4: PREMIOS ===== */}
                {/* Muestra los reconocimientos y premios obtenidos */}
                {/* Solo visible si hay datos de premios disponibles desde OMDb */}
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

        {/* =================================================================
            MENÚ DE NAVEGACIÓN STICKY Y SECCIONES DE CONTENIDO
           ================================================================= */}
        {/* Sistema de navegación por secciones con detección de scroll */}
        {/* Incluye: Media, Actores, Recomendaciones, Comentarios, etc. */}
        <div className="sm:mt-10">
          {/* Elemento centinela para detectar cuándo el menú debe quedar sticky */}
          <div ref={sentinelRef} className="h-px w-full" />

          {/* Menú de navegación sticky que se queda fijo debajo del navbar al hacer scroll */}
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

          {/* =================================================================
              CONTENEDOR DE TODAS LAS SECCIONES
             ================================================================= */}
          {/* Todas las secciones se muestran en orden sin ocultarse */}
          {/* Cada sección se registra para el sistema de detección de scroll */}
          <div className="mt-6 space-y-14">
            {/* =================================================================
                SECCIÓN: MEDIA (Portadas y Fondos)
               ================================================================= */}
            <section id="section-media" ref={registerSection("media")}>
              {/* Galería de imágenes: pósters, backdrops y fondos del contenido */}
              {(type === "movie" || type === "tv") && (
                <section className="mb-16" ref={artworkControlsWrapRef}>
                  {/* ========== Header de la Sección de Media ========== */}
                  {/* Incluye título y controles (tabs y filtros) */}
                  <div className="mb-6 flex items-center justify-between gap-3">
                    {/* Título de la sección - Alineado a la izquierda */}
                    <SectionTitle
                      title="Portadas y fondos"
                      icon={ImageIcon}
                      className="mb-0 mt-4"
                    />

                    {/* ========== Controles de Filtrado ========== */}
                    {/* Desktop: Tabs + Filtros en línea | Móvil: Botón que abre modal */}
                    <div className="flex items-center gap-2 sm:gap-3 h-10 md:h-11">
                      {/* VERSIÓN DESKTOP: Tabs y filtros visibles */}
                      <div className="hidden sm:flex items-center gap-3 flex-wrap justify-end h-10 md:h-11">
                        {/* Tabs de tipo de imagen: Portada, Vista previa, Fondo */}
                        <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10 w-fit h-10 md:h-11">
                          {["posters", "backdrops", "background"].map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setActiveImagesTab(tab)}
                              className={`h-8 md:h-9 px-3 rounded-lg text-xs font-semibold transition-all
              ${
                activeImagesTab === tab
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

                  {/* Panel movil desplegable en 2 filas maximo */}
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
                                className={`p-2 rounded-lg transition-all ${
                                  activeImagesTab === "posters"
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
                                className={`p-2 rounded-lg transition-all ${
                                  activeImagesTab === "backdrops"
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
                                className={`p-2 rounded-lg transition-all ${
                                  activeImagesTab === "background"
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
                                  className={`px-3 rounded-lg text-xs font-medium transition-all ${
                                    langES
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
                                  className={`px-3 rounded-lg text-xs font-medium transition-all ${
                                    langEN
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

                    // 2 en movil y 4 en desktop para backdrops (vista previa / fondo)
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
                        ${
                          isActive
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

              {/* =================================================================
                  SECCIÓN: TRÁILER Y VÍDEOS
                 ================================================================= */}
              {/* Carrusel de vídeos (tráilers, teasers, clips, etc.) del contenido */}
              {/* Solo se muestra si hay una API key de TMDb configurada */}
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
                                  {/* Titulo arriba (1 linea siempre) */}
                                  <div className="w-full min-h-[22px]">
                                    <div className="font-bold text-white leading-snug text-sm sm:text-[16px] line-clamp-1 truncate">
                                      {v.name || "Vídeo"}
                                    </div>
                                  </div>

                                  {/* Propiedades debajo, alineadas a la izquierda */}
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

                                  {/* Fuente y fecha abajo, mismo margen izquierdo */}
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
              {/* Trakt: sentimientos (AI summary) - Solo mostrar si no hay error */}
              {!tSentiment.error && (
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
                      {/* Sin mostrar error, directamente el contenido */}
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
                    </div>
                  </div>
                </section>
              )}
            </section>

            {/* =================================================================
                SECCIÓN: TEMPORADAS (solo para series)
               ================================================================= */}
            {/* Muestra las temporadas disponibles de la serie con información resumida */}
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

            {/* =================================================================
                SECCIÓN: VALORACIÓN DE EPISODIOS (solo para series)
               ================================================================= */}
            {/* Gráfico de valoraciones por episodio mostrando la evolución de ratings */}
            {type === "tv" && (
              <section id="section-episodes" ref={registerSection("episodes")}>
                {/* Subsección: Episodios y sus valoraciones */}
                {type === "tv" ? (
                  <section className="mb-10">
                    <SectionTitle
                      title="Valoración de Episodios"
                      icon={TrendingUp}
                    />
                    <div className="p-0">
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
                          density="compact"
                          fallbackSource="trakt"
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
              {/* Trakt: comentarios */}
              <section className="mb-10">
                <div className="mb-2 flex items-center justify-between gap-4">
                  {/* Mantiene SectionTitle (mismo tamano), pero sin mb interno aqui */}
                  <SectionTitle
                    title="Comentarios"
                    icon={MessageSquareIcon}
                    className="mb-0"
                  />

                  {/* Bloque derecho centrado al titulo */}
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
                          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                            tCommentsTab === t.id
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
                    {!tComments.loading &&
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
              {/* Trakt: listas - Solo mostrar si no hay error */}
              {!tLists.error && (
                <section className="mb-12">
                  <div className="mb-6 flex items-center justify-between">
                    <SectionTitle title="Listas Populares" icon={ListVideo} />

                    {/* Selector de Listas */}
                    <div className="flex rounded-lg bg-white/5 p-1 border border-white/10 backdrop-blur-md">
                      {["popular", "trending"].map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setTListsTab(tab)}
                          className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all rounded-md ${
                            tListsTab === tab
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

                        // Ruta interna (slug si existe; si no, traktId)
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
                            key={String(
                              traktId || `${username}-${slug}` || name,
                            )}
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
              )}
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
                                    className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shadow-sm backdrop-blur-md ${
                                      isMovie
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

      {/* =================================================================
          MODALES Y DIÁLOGOS
         ================================================================= */}

      {/* Modal de reproducción de vídeos y tráilers */}
      <VideoModal
        open={videoModalOpen}
        onClose={closeVideo}
        video={activeVideo}
      />

      {/* Modal de enlaces externos - Muestra todos los enlaces a páginas externas */}
      {/* Solo visible en móvil, en desktop se muestran inline */}
      <ExternalLinksModal
        open={externalLinksOpen}
        onClose={() => setExternalLinksOpen(false)}
        links={externalLinks}
      />

      {/* Modal de control de visto en Trakt - Para marcar películas como vistas */}
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

      {/* Modal de episodios de Trakt - Para marcar episodios de series como vistos */}
      {/* Incluye gestión de runs de rewatch y visualización por temporadas */}
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

      {/* Modal de añadir a lista - Permite agregar el contenido a listas personalizadas del usuario */}
      {/* Incluye funcionalidad para crear nuevas listas directamente desde el modal */}
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

// =============================================================================
// Componente auxiliar: UsersIconComponent
// =============================================================================
/**
 * Componente de icono SVG personalizado para representar el reparto/usuarios
 *
 * Este icono se utiliza en la interfaz para mostrar secciones relacionadas
 * con el elenco y equipo del contenido.
 *
 * @param {Object} props - Propiedades del componente
 * @param {number} [props.size=24] - Tamaño del icono en píxeles
 * @param {string} [props.className] - Clases CSS adicionales para estilizar el icono
 * @returns {JSX.Element} Elemento SVG del icono de usuarios
 */
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
