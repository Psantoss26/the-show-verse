"use client";

// /src/components/dashboard/DetailModal.jsx
// Ficha rápida (vista previa) que se abre desde las tarjetas del dashboard sobre
// el fondo difuminado. Panel ancho anclado al borde inferior, con esquinas
// superiores redondeadas y scroll interno (oculto, como AddToListModal). Réplica
// del lenguaje visual de DetailsClient (paneles glassy, badges de puntuación,
// pestañas Detalles/Producción/Sinopsis/Premios, reparto, similares y
// sentimientos) SIN importar sus internos: se replican los estilos.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
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
  Calendar,
  Clock,
  Layers,
  Info,
  Users,
  ListPlus,
  ImageOff,
  ChevronDown,
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
import ExternalLinksModal from "@/components/details/ExternalLinksModal";
// Fila de botones de acción principal (tráiler, favorito, pendiente, puntuar,
// listas, reseñas, soundtrack…): MISMO componente presentacional que la ficha
// completa (DetailsClient) para que la fila sea IDÉNTICA.
import DetailActionsRow from "@/components/details/DetailActionsRow";
// Sección de pestañas (Detalles/Producción/Sinopsis/Premios) compartida con la
// ficha completa: renderiza EXACTAMENTE las mismas tarjetas que DetailsClient.
import DetailsInfoTabs from "@/components/details/DetailsInfoTabs";
import { useTraktAuth } from "@/lib/trakt/useTraktAuth";
import {
  traktAddComment,
  traktUpdateComment,
  traktDeleteComment,
  traktGetItemStatus,
  traktAddWatchPlay,
  traktUpdateWatchPlay,
  traktRemoveWatchPlay,
} from "@/lib/api/traktClient";

import { useDetailModalData } from "@/components/dashboard/useDetailModalData";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
// Máquina de episodios vistos (series) COMPARTIDA con DetailsClient: misma
// lógica de toggles, rewatches, plays y persistencia en localStorage.
import { useTraktEpisodesWatched } from "@/lib/hooks/useTraktEpisodesWatched";

// Resuelve la URL del logo de una plataforma: rutas de TMDb -> buildImg;
// URLs absolutas o assets locales (/logo-*) se usan tal cual.
function providerLogoSrc(provider) {
  const lp = provider?.logo_path || provider?.logo || null;
  if (!lp) return null;
  if (/^https?:\/\//.test(lp)) return lp;
  if (lp.startsWith("/logo") || lp.startsWith("/_next")) return lp;
  return buildImg(lp, "w45");
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
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

// Panel anclado abajo: entra deslizando desde el borde inferior.
const panelVariants = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: 32,
    transition: { duration: 0.2, ease: "easeInOut" },
  },
};

/* ============================== SUBCOMPONENTES ============================== */
function SkeletonBar({ className = "" }) {
  return (
    <div className={`animate-pulse rounded-full bg-white/10 ${className}`} />
  );
}

/* ================================== MODAL ================================== */
export default function DetailModal({ item, onClose }) {
  const router = useRouter();
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();
  const { loading, data } = useDetailModalData(item);

  const scrollContainerRef = useRef(null);
  const { scrollY } = useScroll({ container: scrollContainerRef });

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

  const mediaType = data.mediaType || getMediaTypeForItem(item);
  const title = data.title || item?.title || item?.name || "";
  const backdropPath = data.backdropPath || item?.backdrop_path || null;
  const heroSrc = backdropPath ? buildImg(backdropPath, "w1280") : null;
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
  const preferredSeasonNumber = normalizeSeasonNumber(item?.nextEpisode?.season);
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
  const [externalLinksOpen, setExternalLinksOpen] = useState(false);
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
  const soundtrackSearchQuery = useMemo(() => {
    if (!title) return "";
    return [
      title,
      data.year,
      mediaType === "tv" ? "series soundtrack" : "movie soundtrack",
    ]
      .filter(Boolean)
      .join(" ");
  }, [title, data.year, mediaType]);

  const soundtrackSpotifyUrl = soundtrackSearchQuery
    ? `https://open.spotify.com/search/${encodeURIComponent(
        soundtrackSearchQuery,
      )}`
    : "";

  // Versión mínima de la carga de soundtrack de DetailsClient: pide a
  // /api/soundtrack y alimenta el SoundtrackModal (que ya reproduce previews).
  const loadSoundtrack = async () => {
    if (!title) return;
    setSoundtrackLoading(true);
    setSoundtrackError("");
    try {
      const params = new URLSearchParams({
        title,
        type: mediaType === "tv" ? "tv" : "movie",
        country: "ES",
      });
      if (data.originalTitle && data.originalTitle !== title) {
        params.set("originalTitle", data.originalTitle);
      }
      if (data.year) params.set("year", String(data.year));
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
  const goToFullDetails = () => {
    router.push(dashboardDetailHref(item, mediaType));
    onClose();
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
    !!data.year || !!data.runtime || !!statusLabel || data.genres?.length > 0;

  const streamingProviders = useMemo(() => {
    const providers = Array.isArray(data.providers) ? data.providers : [];
    return providers
      .map((provider) => {
        const icon = providerLogoSrc(provider);
        if (!icon || !provider?.url || !provider?.name) return null;
        return {
          key: `${provider.name}-${provider.url}`,
          title: `Ver en ${provider.name}`,
          href: provider.url,
          icon,
        };
      })
      .filter(Boolean);
  }, [data.providers]);
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
  const selectedSeasonMeta = availableSeasons.find(
    (season) => season.season_number === selectedSeasonNumber,
  );
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
  const seasonTitle =
    seasonPreview.data?.name ||
    selectedSeasonMeta?.name ||
    (selectedSeasonNumber != null ? `Temporada ${selectedSeasonNumber}` : "");
  const prefetchEpisodeDetails = (episodeNumber) => {
    if (!item?.id || selectedSeasonNumber == null || !episodeNumber) return;
    const href = `/details/tv/${item.id}/season/${selectedSeasonNumber}/episode/${episodeNumber}`;
    router.prefetch(href);
    if (typeof window !== "undefined") {
      fetch(href, { priority: "low" }).catch(() => {});
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Ficha rápida"}
    >
      {/* Backdrop difuminado — clic fuera cierra */}
      <motion.div
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Panel ancho anclado al borde inferior, esquinas superiores redondeadas */}
      <motion.div
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 mt-[4vh] flex h-[96vh] w-[95vw] max-w-[1080px] flex-col overflow-hidden rounded-t-2xl bg-black/50 bg-gradient-to-br from-white/10 to-white/[0.03] shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-3xl"
      >
        {/* Botón superior derecho: abre la ficha completa */}
        <button
          type="button"
          onClick={goToFullDetails}
          className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur-md transition hover:bg-black/60 hover:text-white"
          aria-label="Ver ficha completa"
          title="Ver ficha completa"
        >
          <ArrowUpRight className="h-5 w-5" />
        </button>

        {/* Contenedor con scroll interno (barra oculta) */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* HERO: backdrop grande (o tráiler inline) + degradado */}
          <div className="relative aspect-video w-full overflow-hidden bg-neutral-950 border-b border-white/[0.06]">
            <motion.div
              style={{
                y: yParallax,
                scale,
                WebkitMaskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
                maskImage: "linear-gradient(to bottom, black 65%, transparent 100%)",
              }}
              className="absolute inset-0 w-full h-full"
            >
              {!showTrailer && heroSrc && (
                <NextImage
                  key={heroSrc}
                  src={heroSrc}
                  alt={title}
                  fill
                  sizes="(min-width:920px) 920px, 94vw"
                  className="object-cover"
                  loading="eager"
                  priority
                />
              )}

              {!showTrailer && !heroSrc && (
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

            {/* Bottom shadow gradient (fades with logo) */}
            <motion.div
              style={{ opacity: logoOpacity }}
              className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-neutral-950 via-neutral-950/70 to-transparent z-10"
            />

            {/* Logo del título sobre el hero (fallback al texto si no hay logo) */}
            <motion.div
              style={{ opacity: logoOpacity, y: logoY }}
              className="absolute inset-x-0 bottom-0 p-5 sm:p-7 z-15"
            >
              {data.logoPath ? (
                <NextImage
                  key={data.logoPath}
                  src={buildImg(data.logoPath, "w500")}
                  alt={title}
                  width={500}
                  height={200}
                  sizes="(min-width:920px) 460px, 70vw"
                  className="h-auto max-h-28 w-auto max-w-[85%] object-contain object-left drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)] sm:max-h-36"
                  loading="eager"
                  priority
                />
              ) : (
                <h2 className="max-w-[85%] text-3xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-5xl">
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
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 min-w-0">
                <DetailActionsRow
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
                    badge: null,
                    busy: !!traktBusy,
                    loading: traktStatusLoading,
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
                  listActive={Object.values(membershipMap || {}).some(Boolean)}
                  showComments={traktConnected || traktStatus.connected}
                  commentsActive={false}
                  onComments={() => setCommentModalOpen(true)}
                />
              </div>

              {hasProviders && (
                <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                  {streamingProviders.map((prov) => (
                    <a
                      key={prov.key}
                      href={prov.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={prov.title}
                      className="transition-transform duration-300 hover:scale-110 active:scale-95 shrink-0"
                    >
                      <img
                        src={prov.icon}
                        alt={prov.title}
                        className="h-11 w-11 rounded-xl object-contain shadow-lg"
                      />
                    </a>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Premios / nominaciones: misma línea verde que las previews del
                dashboard (InlinePreviewCard). Se alimenta de la cadena cruda de
                OMDb (data.awards) formateada con formatDashboardAwards. */}
            {data.awards && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10px" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-2 text-xs font-bold text-emerald-300 drop-shadow-md sm:text-sm"
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

            {/* Fila meta + géneros (componente real compartido con DetailsClient) */}
            {hasMetaRow ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10px" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailsMetaGenresRow
                  yearIso={data.year}
                  displayRuntimeValue={data.runtime}
                  status={data.status}
                  genres={data.genreObjects}
                />
              </motion.div>
            ) : (
              loading && <SkeletonBar className="h-4 w-52" />
            )}

            {/* Panel de puntuaciones + plataformas: MISMO componente
                presentacional que DetailsClient (badges CompactBadge + fila de
                stats), con plataformas integradas en la barra superior. */}
            {(hasRatings || hasExternalLinks) && (
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
                />
              </motion.div>
            )}

            {/* Pestañas: Detalles · Producción · Sinopsis · Premios */}
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
                  data.numberOfSeasons
                    ? `${data.numberOfSeasons} Temp. / ${data.numberOfEpisodes} Caps.`
                    : "—"
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
              />
            </motion.div>

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
                <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {data.cast.map((person) => {
                    const photo = person?.profile_path
                      ? buildImg(person.profile_path, "w185")
                      : null;
                    return (
                      <div
                        key={person?.id ?? person?.credit_id ?? person?.name}
                        className="group relative w-[30%] shrink-0 overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-md transition-colors hover:border-yellow-500/30 sm:w-[calc((100%-2.25rem)/4)] lg:w-[calc((100%-3.75rem)/6)]"
                      >
                        <div className="relative aspect-[2/3] overflow-hidden">
                          {photo ? (
                            <NextImage
                              src={photo}
                              alt={person?.name || ""}
                              fill
                              sizes="(min-width:1024px) 130px, (min-width:640px) 200px, 30vw"
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-neutral-500">
                              <Users className="h-8 w-8" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                          <div className="absolute inset-x-0 bottom-0 p-2.5">
                            <p className="line-clamp-1 text-xs font-extrabold leading-tight text-white drop-shadow-sm">
                              {person?.name}
                            </p>
                            {person?.character && (
                              <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold leading-tight text-zinc-300 drop-shadow-sm">
                                {person.character}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {data.recommendations.slice(0, 14).map((rec) => {
                    const art = rec?.backdrop_path
                      ? buildImg(rec.backdrop_path, "w300")
                      : rec?.poster_path
                        ? buildImg(rec.poster_path, "w342")
                        : null;
                    const recTitle = rec?.title || rec?.name || "";
                    return (
                      <button
                        key={`${getMediaTypeForItem(rec)}-${rec?.id}`}
                        type="button"
                        onClick={() => openDetailModal?.(rec)}
                        disabled={!openDetailModal}
                        className="group w-[72%] shrink-0 text-left sm:w-[calc((100%-1.5rem)/3)] lg:w-[calc((100%-2.25rem)/4)]"
                        title={recTitle}
                      >
                        <div className="relative mb-1.5 aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-neutral-800 transition group-hover:border-white/30">
                          {art ? (
                            <NextImage
                              src={art}
                              alt={recTitle}
                              fill
                              sizes="(min-width:1024px) 210px, (min-width:640px) 280px, 72vw"
                              className="object-cover transition duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] font-bold text-zinc-500">
                              {recTitle}
                            </div>
                          )}
                        </div>
                        <div className="truncate text-[11px] font-semibold text-zinc-300 group-hover:text-white">
                          {recTitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
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
                    Temporadas
                  </h3>

                  <div className="relative w-full sm:w-auto">
                    <label className="sr-only" htmlFor={seasonSelectId}>
                      Seleccionar temporada
                    </label>
                    <select
                      id={seasonSelectId}
                      value={selectedSeasonNumber ?? ""}
                      onChange={(event) =>
                        setSelectedSeasonNumber(Number(event.target.value))
                      }
                      className="h-10 w-full appearance-none rounded-full border border-white/10 bg-black/35 px-4 pr-10 text-xs font-bold uppercase tracking-wide text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] outline-none transition hover:border-white/20 focus-visible:border-yellow-400/50 focus-visible:ring-2 focus-visible:ring-yellow-400/20 sm:min-w-[190px]"
                    >
                      {availableSeasons.map((season) => (
                        <option
                          key={season.season_number}
                          value={season.season_number}
                        >
                          Temporada {season.season_number}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-zinc-400">
                  <span className="text-white">{seasonTitle}</span>
                  {selectedSeasonMeta?.episode_count ? (
                    <>
                      <span className="text-zinc-600" aria-hidden="true">
                        •
                      </span>
                      <span>{selectedSeasonMeta.episode_count} episodios</span>
                    </>
                  ) : null}
                </div>

                {seasonPreview.loading ? (
                  <div className="flex gap-3 overflow-hidden pb-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="w-[78%] shrink-0 sm:w-[46%] lg:w-[32%]"
                      >
                        <SkeletonBar className="aspect-video h-auto rounded-xl" />
                        <SkeletonBar className="mt-3 h-3 w-4/5 rounded-full" />
                        <SkeletonBar className="mt-2 h-3 w-2/3 rounded-full" />
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
                  <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                        <Link
                          key={`${selectedSeasonNumber}-${episodeNumber}`}
                          href={episodeHref}
                          prefetch={false}
                          onMouseEnter={() =>
                            prefetchEpisodeDetails(episodeNumber)
                          }
                          onFocus={() => prefetchEpisodeDetails(episodeNumber)}
                          onTouchStart={() =>
                            prefetchEpisodeDetails(episodeNumber)
                          }
                          className="group block w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 bg-black/25 text-left transition hover:border-yellow-400/30 hover:bg-black/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/40 sm:w-[46%] lg:w-[32%]"
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
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-90" />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                                Episodio {episodeNumber}
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-sm font-extrabold leading-snug text-white">
                                {episodeTitle}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 p-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-zinc-400">
                              {episodeAirDate ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {episodeAirDate}
                                </span>
                              ) : null}
                              {episodeRuntime ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  {episodeRuntime} min
                                </span>
                              ) : null}
                            </div>
                            <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-zinc-300">
                              {episode?.overview?.trim() || "Sin descripción."}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </motion.section>
            )}
          </div>
        </div>
      </motion.div>

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
          title={title}
        />
      )}
    </div>
  );
}
