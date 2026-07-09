"use client";

// /src/components/dashboard/DetailModal.jsx
// Ficha rápida (vista previa) que se abre desde las tarjetas del dashboard sobre
// el fondo difuminado. Panel ancho anclado al borde inferior, con esquinas
// superiores redondeadas y scroll interno (oculto, como AddToListModal). Réplica
// del lenguaje visual de DetailsClient (paneles glassy, badges de puntuación,
// pestañas Detalles/Producción/Sinopsis/Premios, reparto, similares y
// sentimientos) SIN importar sus internos: se replican los estilos.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

// Componentes reales de la ficha completa (standalone) para que las tarjetas,
// badges, pestañas y acciones sean IDÉNTICAS a DetailsClient.
import DetailsScoreboardPanel from "@/components/details/DetailsScoreboardPanel";
import { formatCountShort } from "@/lib/details/formatters";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import AddToListModal from "@/components/details/AddToListModal";
import SoundtrackModal from "@/components/details/SoundtrackModal";
import TraktCommentModal from "@/components/details/TraktCommentModal";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import TraktWatchedModal from "@/components/trakt/TraktWatchedModal";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
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
} from "@/lib/api/traktClient";

import { useDetailModalData } from "@/components/dashboard/useDetailModalData";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

// Resuelve la URL del logo de una plataforma: rutas de TMDb -> buildImg;
// URLs absolutas o assets locales (/logo-*) se usan tal cual.
function providerLogoSrc(provider) {
  const lp = provider?.logo_path || provider?.logo || null;
  if (!lp) return null;
  if (/^https?:\/\//.test(lp)) return lp;
  if (lp.startsWith("/logo") || lp.startsWith("/_next")) return lp;
  return buildImg(lp, "w45");
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

  const mediaType = data.mediaType || getMediaTypeForItem(item);
  const title = data.title || item?.title || item?.name || "";
  const backdropPath = data.backdropPath || item?.backdrop_path || null;
  const heroSrc = backdropPath ? buildImg(backdropPath, "w1280") : null;

  /* --------------------------- favorito / pendientes --------------------------- */
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [loadingStates, setLoadingStates] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

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
  const [userRating, setUserRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // Al cambiar de título, resetea la nota local (no persiste entre items).
  useEffect(() => {
    setUserRating(null);
  }, [item]);

  const handleRate = async (value) => {
    if (requireLogin() || ratingLoading || !item) return;
    setUserRating(value); // optimista
    // Persistencia best-effort en TMDb si hay sesión + API key; si no, queda local.
    if (!TMDB_API_KEY || !session) return;
    try {
      setRatingLoading(true);
      setError("");
      const url = `https://api.themoviedb.org/3/${mediaType}/${item.id}/rating?api_key=${TMDB_API_KEY}&session_id=${session}`;
      await fetch(url, {
        method: value == null ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json;charset=utf-8" },
        ...(value == null ? {} : { body: JSON.stringify({ value }) }),
      });
    } catch {
      setError("No se pudo guardar la puntuación.");
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

  /* ------------------------------ ficha completa ------------------------------ */
  const goToFullDetails = () => {
    router.push(`/details/${mediaType}/${item.id}`);
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

  const providers = Array.isArray(data.providers) ? data.providers : [];
  const hasProviders = providers.length > 0;

  const sentiment = data.sentiment || { pros: [], cons: [] };
  const hasSentiment =
    (sentiment.pros?.length || 0) > 0 || (sentiment.cons?.length || 0) > 0;

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
        className="relative z-10 mt-[4vh] flex h-[96vh] w-[95vw] max-w-[1200px] flex-col overflow-hidden rounded-t-2xl bg-black/50 bg-gradient-to-br from-white/10 to-white/[0.03] shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-3xl"
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
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* HERO: backdrop grande (o tráiler inline) + degradado */}
          <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
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

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/50 to-transparent" />

            {/* Logo del título sobre el hero (fallback al texto si no hay logo) */}
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              {data.logoPath ? (
                <NextImage
                  key={data.logoPath}
                  src={buildImg(data.logoPath, "w500")}
                  alt={title}
                  width={500}
                  height={200}
                  sizes="(min-width:920px) 460px, 70vw"
                  className="h-auto max-h-20 w-auto max-w-[75%] object-contain object-left drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)] sm:max-h-24"
                  loading="eager"
                  priority
                />
              ) : (
                <h2 className="max-w-[80%] text-2xl font-black leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-4xl">
                  {title || <SkeletonBar className="h-8 w-64" />}
                </h2>
              )}
            </div>
          </div>

          {/* CONTENIDO */}
          <div className="space-y-6 p-5 sm:p-7">
            {/* Fila de acciones — MISMO componente presentacional que la ficha
                completa (DetailsClient). El tráiler sigue reproduciéndose inline
                en el hero; el resto abre los modales reutilizables. Se omiten el
                control de "visto" de Trakt y la valoración de episodios (no se
                pasan sus handlers), por lo que no se renderizan. */}
            <DetailActionsRow
              onTrailer={handleToggleTrailer}
              trailerAvailable
              trailerLoading={trailerLoading}
              onSoundtrack={openSoundtrack}
              soundtrackAvailable={!!soundtrackSearchQuery}
              rate={{
                rating: userRating,
                max: 10,
                loading: ratingLoading,
                onRate: handleRate,
                connected: isLoggedIn,
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
              showComments={traktConnected}
              commentsActive={false}
              onComments={() => setCommentModalOpen(true)}
            />

            {/* Premios / nominaciones: misma línea verde que las previews del
                dashboard (InlinePreviewCard). Se alimenta de la cadena cruda de
                OMDb (data.awards) formateada con formatDashboardAwards. */}
            {data.awards && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 drop-shadow-md sm:text-sm">
                <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">
                  {formatDashboardAwards(data.awards)}
                </span>
              </div>
            )}

            {error && (
              <p className="line-clamp-1 text-xs font-medium text-red-400">
                {error}
              </p>
            )}

            {/* Fila meta + géneros (componente real compartido con DetailsClient) */}
            {hasMetaRow ? (
              <DetailsMetaGenresRow
                yearIso={data.year}
                displayRuntimeValue={data.runtime}
                status={data.status}
                genres={data.genreObjects}
              />
            ) : (
              loading && <SkeletonBar className="h-4 w-52" />
            )}

            {/* Panel de puntuaciones + plataformas: MISMO componente
                presentacional que DetailsClient (badges CompactBadge + fila de
                stats), para que se vea IDÉNTICO. La fila de "plataformas
                disponibles" se mantiene debajo, como children. */}
            {(hasRatings || hasProviders) && (
              <DetailsScoreboardPanel
                loading={loading}
                tmdb={
                  data.tmdbRating != null
                    ? {
                        value: data.tmdbRating,
                        sub: formatCountShort(data.tmdbVotes),
                        href: undefined,
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
                externalLinks={[
                  {
                    icon: "/logo-TMDb.png",
                    title: "TMDb",
                    href: `https://www.themoviedb.org/${
                      mediaType === "tv" ? "tv" : "movie"
                    }/${item?.id}`,
                  },
                  ...(data.imdbId
                    ? [
                        {
                          icon: "/logo-IMDb.svg",
                          title: "IMDb",
                          href: `https://www.imdb.com/title/${data.imdbId}`,
                        },
                      ]
                    : []),
                ]}
                share={{
                  title,
                  text: `Echa un vistazo a ${title} en The Show Verse`,
                  url:
                    typeof window !== "undefined" && item?.id
                      ? `${window.location.origin}/details/${mediaType}/${item.id}`
                      : undefined,
                }}
                stats={scoreStats}
              >
                {/* Plataformas de streaming disponibles */}
                {hasProviders && (
                  <div className="relative z-10 rounded-b-2xl border-t border-white/5 bg-black/[0.06]">
                    <div className="flex flex-wrap items-center gap-2.5 p-3 sm:px-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Disponible en
                      </span>
                      {providers.map((p) => {
                        const src = providerLogoSrc(p);
                        if (!src) return null;
                        return (
                          <a
                            key={`${p.name}-${p.url}`}
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            title={`Ver en ${p.name}`}
                            aria-label={`Ver en ${p.name}`}
                            className="group relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30 transition hover:scale-105 hover:border-white/30"
                          >
                            <NextImage
                              src={src}
                              alt={p.name}
                              fill
                              sizes="36px"
                              className="object-cover"
                              loading="lazy"
                            />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </DetailsScoreboardPanel>
            )}

            {/* Pestañas: Detalles · Producción · Sinopsis · Premios */}
            <div>
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
            </div>

            {/* Reparto */}
            {data.cast?.length > 0 && (
              <section className="space-y-3">
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
              </section>
            )}

            {/* Títulos similares */}
            {data.recommendations?.length > 0 && (
              <section className="space-y-3">
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
              </section>
            )}

            {/* Sentimientos de la comunidad (pros / cons) */}
            {hasSentiment && (
              <section className="space-y-3">
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
              </section>
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
    </div>
  );
}
