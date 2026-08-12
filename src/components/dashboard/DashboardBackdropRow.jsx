"use client";

// /src/components/dashboard/DashboardBackdropRow.jsx
// Fila del dashboard de Inicio con tarjetas LANDSCAPE (16:9) para contenido
// genérico (películas + series mezcladas). Comparte el lenguaje visual de
// "Continuar viendo" (ContinueWatchingSection) y "Calendario"
// (DashboardCalendarSection): tarjeta base con backdrop + degradado inferior y,
// en escritorio, una vista previa estilo Netflix al hacer hover con backdrop
// ampliado + panel de info + botones (trailer / favorito / pendientes).
//
// La carga es ligera: el backdrop se resuelve enseguida (compartiendo la misma
// caché que el resto del dashboard) y los extras/logo/trailer solo se piden al
// hacer hover, ya que la tarjeta de vista previa se monta en ese momento.

import { useCallback, useEffect, useRef, useState } from "react";
import usePreviewImageHalf from "@/hooks/usePreviewImageHalf";
import { useHoverCapable } from "@/lib/hooks/useMediaQuery";
import useTrailerAutoDismiss from "@/hooks/useTrailerAutoDismiss";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode } from "swiper/modules";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import "swiper/swiper-bundle.css";
import Link from "next/link";
import NextImage from "next/image";
import {
  Play,
  Pause,
  Music2,
  Loader2,
  X,
  Award,
  ChevronRight,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { getBackendItemStatus } from "@/lib/api/itemStatus";
import {
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getDetails,
  resolveImdbId,
} from "@/lib/api/tmdb";
import {
  traktGetItemStatus,
  traktGetShowWatched,
  traktSetRating,
} from "@/lib/api/traktClient";
import {
  getWatchedEpisodeCountForSeason,
  getAvailableEpisodeTotal,
} from "@/lib/hooks/useTraktEpisodesWatched";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import { formatCountShort } from "@/lib/details/formatters";
import {
  deriveSectionLabel,
  normalizeDashboardSectionTitle,
} from "@/lib/dashboard/sectionLabel";
import {
  DASHBOARD_PREVIEW_CLOSE_DELAY_MS,
  DASHBOARD_PREVIEW_ENTER_TRANSITION,
  DASHBOARD_PREVIEW_EXIT_TRANSITION,
  DASHBOARD_PREVIEW_OPEN_DELAY_MS,
  DASHBOARD_PREVIEW_REDUCED_TRANSITION,
} from "@/lib/dashboard/previewTiming";
import { useScrollRevealProps } from "@/lib/hooks/useHasScrolled";
import OptimizedImage from "@/components/OptimizedImage";
// Fila de acciones + fila meta/géneros + puntuaciones COMPARTIDAS con
// DetailsClient/DetailModal: misma UI que la ficha rápida del dashboard.
import DetailActionsRow from "@/components/details/DetailActionsRow";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import { useDashboardHoverBackdrop } from "@/components/dashboard/DashboardHoverBackdrop";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
import PreviewTrailerAudioButton, {
  usePreviewTrailerAudio,
} from "@/components/dashboard/PreviewTrailerAudioControl";

import {
  buildImg,
  fetchBestBackdrop,
  GENRES,
  PREVIEW_BACKDROP_SIZE,
  getBackdropCacheKey,
  movieBackdropCache,
  getPreviewBackdropFallback,
  getArtworkPreference,
  ratingOf,
  yearOf,
  formatRuntime,
  getMediaTypeForItem,
  getBestTrailerCached,
  movieExtrasCache,
  preloadImage,
} from "@/lib/dashboard/media";

/* =================== CONSTANTES / VARIANTES =================== */
const EMPTY_ARRAY = [];
// Mismo tamaño de backdrop que las previews del resto del dashboard, para que
// las imágenes ya cacheadas se reutilicen sin volver a descargar.
const BACKDROP_SIZE = PREVIEW_BACKDROP_SIZE;
const SECTION_ACCENTS = {
  amber: {
    line: "bg-amber-500",
    text: "text-amber-400",
    dot: "text-amber-500",
    chevron: "text-amber-400",
    hover: "hover:from-amber-100 hover:via-white hover:to-amber-200",
  },
  sky: {
    line: "bg-sky-500",
    text: "text-sky-400",
    dot: "text-sky-400",
    chevron: "text-sky-400",
    hover: "hover:from-sky-100 hover:via-white hover:to-sky-200",
  },
  fuchsia: {
    line: "bg-fuchsia-500",
    text: "text-fuchsia-400",
    dot: "text-fuchsia-400",
    chevron: "text-fuchsia-400",
    hover: "hover:from-fuchsia-100 hover:via-white hover:to-fuchsia-200",
  },
};

// Set a nivel de módulo con las URLs de backdrop ya cargadas: evita el shimmer
// cuando una imagen ya se pintó antes (al volver a montar la tarjeta).
const loadedBackdropSrcs = new Set();

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: { duration: 8, ease: "linear", repeat: Infinity },
  },
};

// La imagen se desvanece a transparente por abajo (como DetailModal) para fundir
// portada e info sobre el fondo uniforme de la tarjeta, sin línea de corte.
const dashboardPreviewBackdropFadeStyle = {
  WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
  maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
};

/* =================== HELPERS =================== */

// Backdrop inicial (síncrono) para pintar algo desde el primer render sin
// esperar a la petición: preferencia del usuario → override → caché → backdrop
// que ya trae el propio item.
function getInitialItemBackdrop(item, backdropOverride) {
  if (!item?.id) return null;
  const mediaType = getMediaTypeForItem(item);
  const key = getBackdropCacheKey(item, mediaType);
  const { backdrop: userBackdrop } = getArtworkPreference(item.id, mediaType);
  if (userBackdrop) return userBackdrop;
  if (backdropOverride) return backdropOverride;
  const cached = movieBackdropCache.get(key);
  if (cached !== undefined) return cached;
  return getPreviewBackdropFallback(item);
}

// Resuelve el mejor backdrop del título compartiendo `movieBackdropCache` con el
// resto del dashboard. Mismo criterio que InlinePreviewCard (rama no-spotlight).
function useItemBackdrop(item, backdropOverride) {
  const mediaType = getMediaTypeForItem(item);
  const [backdropPath, setBackdropPath] = useState(() =>
    getInitialItemBackdrop(item, backdropOverride),
  );

  useEffect(() => {
    let abort = false;
    if (!item?.id) return undefined;

    const type = getMediaTypeForItem(item);
    const key = getBackdropCacheKey(item, type);
    const reveal = (path) => {
      if (!abort) setBackdropPath(path);
    };

    const { backdrop: userBackdrop } = getArtworkPreference(item.id, type);
    if (userBackdrop) {
      movieBackdropCache.set(key, userBackdrop);
      reveal(userBackdrop);
      return () => {
        abort = true;
      };
    }
    if (backdropOverride) {
      movieBackdropCache.set(key, backdropOverride);
      reveal(backdropOverride);
      return () => {
        abort = true;
      };
    }
    const cached = movieBackdropCache.get(key);
    if (cached !== undefined) {
      reveal(cached);
      return () => {
        abort = true;
      };
    }

    (async () => {
      try {
        const preferred = await fetchBestBackdrop(item.id, type);
        const chosen = preferred || getPreviewBackdropFallback(item);
        movieBackdropCache.set(key, chosen);
        if (chosen) await preloadImage(buildImg(chosen, BACKDROP_SIZE));
        reveal(chosen);
      } catch {
        const fallback = getPreviewBackdropFallback(item);
        movieBackdropCache.set(key, fallback);
        reveal(fallback);
      }
    })();

    return () => {
      abort = true;
    };
  }, [item, backdropOverride]);

  return { backdropPath, mediaType };
}

/* ====================================================================
 * Tarjeta base (sin hover): backdrop 16:9 + degradado inferior con título
 * y badge de nota. Shimmer mientras carga la imagen.
 * ==================================================================== */
function BackdropBaseCard({ item, backdropOverride }) {
  const { backdropPath } = useItemBackdrop(item, backdropOverride);
  const bgSrc = backdropPath ? buildImg(backdropPath, BACKDROP_SIZE) : null;

  const [imgReady, setImgReady] = useState(() =>
    bgSrc ? loadedBackdropSrcs.has(bgSrc) : false,
  );
  useEffect(() => {
    setImgReady(bgSrc ? loadedBackdropSrcs.has(bgSrc) : false);
  }, [bgSrc]);
  const markImageReady = () => {
    if (bgSrc) loadedBackdropSrcs.add(bgSrc);
    setImgReady(true);
  };

  const title = item?.title || item?.name || "";

  // Tarjeta backdrop LIMPIA: sin título ni nota encima de la portada (esa info va
  // solo en el pop-out al hover). El backdrop ya suele traer su propio logo/título.
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-neutral-900">
      {!imgReady && (
        <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
            variants={shimmer}
            animate="animate"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>
      )}

      {bgSrc && (
        <NextImage
          key={bgSrc}
          src={bgSrc}
          alt={title}
          fill
          sizes="(min-width:1280px) 338px, (min-width:768px) 300px, 224px"
          className={`object-cover transition-opacity duration-200 ${
            imgReady ? "opacity-100" : "opacity-0"
          }`}
          loading="eager"
          onLoad={markImageReady}
        />
      )}
    </div>
  );
}

/* ====================================================================
 * Tarjeta hover (solo escritorio): vista previa estilo Netflix con backdrop
 * ampliado (16:9) + panel de info (logo/título · metadatos · acciones).
 * Acciones GENÉRICAS: ▶ trailer · ❤ favorito · 🔖 pendientes.
 * ==================================================================== */
export function BackdropPreviewCard({
  item,
  backdropOverride,
  index,
  totalCount,
  activeIndex,
  perView = 6,
  onPreviewMouseEnter,
  onPreviewMouseLeave,
  onNestedModalOpenChange,
}) {
  const reduceMotion = useReducedMotion();
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();
  const mediaType = getMediaTypeForItem(item);
  const { backdropPath } = useItemBackdrop(item, backdropOverride);

  const [extras, setExtras] = useState(
    () =>
      movieExtrasCache.get(item?.id) || {
        runtime: null,
        awards: null,
        imdbRating: null,
        overview: null,
        ratingsReady: false,
      },
  );

  const [loadingStates, setLoadingStates] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const trailerIframeRef = useRef(null);
  const {
    muted: trailerMuted,
    toggle: handleToggleTrailerAudio,
    sync: syncTrailerAudio,
  } = usePreviewTrailerAudio(trailerIframeRef, { volume: 30 });

  // Tráiler restringido (edad/embedding) o no disponible → ocultarlo (fallback
  // al backdrop). Hasta que `trailerPlaying` sea true el backdrop cubre el iframe,
  // así el mensaje de "no disponible" de YouTube nunca llega a verse.
  const { playing: trailerPlaying } = useTrailerAutoDismiss({
    open: showTrailer,
    iframeRef: trailerIframeRef,
    videoKey: trailer?.key,
    onUnavailable: () => setShowTrailer(false),
  });

  // Soundtrack (mismo mecanismo que InlinePreviewCard): búsqueda de la canción
  // con preview, reproducción en un overlay dentro de la propia tarjeta.
  const [soundtrackTrack, setSoundtrackTrack] = useState(null);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const [soundtrackOpen, setSoundtrackOpen] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");
  const audioRef = useRef(null);
  const soundtrackAbortRef = useRef(null);

  // Datos enriquecidos para la fila meta compartida (<DetailsMetaGenresRow>):
  // estado TMDb crudo, géneros [{id,name}], temporadas y duración de respaldo.
  // Espejo de useDetailModalData para que el diseño coincida con DetailModal.
  const [previewDetails, setPreviewDetails] = useState({
    status: null,
    genreObjects: [],
    seasons: [],
    runtimeFallback: null,
  });

  // Estado de Trakt para el control de "visto" (<TraktWatchedControl>): conexión,
  // visto, plays, badge de progreso (%) para series, y flag de carga.
  const [traktInfo, setTraktInfo] = useState({
    connected: false,
    watched: false,
    plays: 0,
    badge: null,
    loading: false,
  });

  // Puntuación del usuario (Trakt) para el <StarRating> de la fila de acciones.
  const [rating, setRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // Modal de valoración de episodios (solo series).
  const [episodeRatingsOpen, setEpisodeRatingsOpen] = useState(false);
  // Si la preview se desmonta con un modal anidado aún marcado como abierto,
  // limpiamos la señal para no dejar el cierre de la preview congelado en el row.
  useEffect(
    () => () => onNestedModalOpenChange?.(false),
    [onNestedModalOpenChange],
  );

  // Reinicio del soundtrack al cambiar de título.
  useEffect(() => {
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackTrack(null);
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
    setSoundtrackError("");
  }, [item?.id]);

  // Cierre del overlay de soundtrack con Escape.
  useEffect(() => {
    if (!soundtrackOpen) return;

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      soundtrackAbortRef.current?.abort();
      soundtrackAbortRef.current = null;
      audioRef.current?.pause();
      setSoundtrackLoading(false);
      setSoundtrackPlaying(false);
      setSoundtrackOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [soundtrackOpen]);

  // Estado favorito/pendientes en el backend.
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

  // Extras: duración/temporadas, premios (OMDb), nota IMDb y sinopsis. Mismo
  // criterio y forma de caché que InlinePreviewCard, para compartir la caché.
  useEffect(() => {
    let abort = false;
    if (!item?.id) return undefined;

    const cachedExtras = movieExtrasCache.get(item.id);
    if (cachedExtras) {
      setExtras({ ...cachedExtras, ratingsReady: true });
      return undefined;
    }

    // imdb_id + nota IMDb resueltos AL PRINCIPIO y en PARALELO con los detalles.
    // La UI de puntuaciones espera al paquete final para que TMDb e IMDb
    // aparezcan a la vez, reutilizando las promesas para premios y caché.
    const imdbIdPromise = resolveImdbId(item, mediaType);
    const imdbRatingPromise = imdbIdPromise.then((imdb) =>
      imdb
        ? fetchImdbRatingByImdb(imdb)
            .then((ds) => (typeof ds?.rating === "number" ? ds.rating : null))
            .catch(() => null)
        : null,
    );
    (async () => {
      try {
        let runtime = null;
        let overview = null;
        try {
          if (mediaType === "movie") {
            const details = await getMovieDetails(item.id);
            runtime = details?.runtime ?? null;
            overview =
              (typeof details?.overview === "string" &&
                details.overview.trim()) ||
              null;
          } else {
            const response = await fetch(
              `https://api.themoviedb.org/3/tv/${item.id}?append_to_response=external_ids&api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
            );
            if (response.ok) {
              const details = await response.json();
              overview =
                (typeof details?.overview === "string" &&
                  details.overview.trim()) ||
                null;
              if (details.number_of_seasons) {
                runtime = `${details.number_of_seasons} Temp.`;
                if (details.number_of_episodes) {
                  runtime += ` · ${details.number_of_episodes} Eps.`;
                }
              }
            }
          }
        } catch {}

        // Premios (OMDb): reutiliza el imdb_id ya resuelto (no re-pide).
        let awards = null;
        try {
          const imdb = await imdbIdPromise;
          if (imdb) {
            const omdb = await fetchOmdbByImdb(imdb).catch(() => null);
            const rawAwards = omdb?.Awards;
            if (rawAwards && typeof rawAwards === "string" && rawAwards.trim()) {
              awards = formatDashboardAwards(rawAwards);
            }
          }
        } catch {}

        const imdbRating = await imdbRatingPromise;
        const next = {
          runtime,
          awards,
          imdbRating,
          overview,
          ratingsReady: true,
        };
        movieExtrasCache.set(item.id, next);
        if (!abort) setExtras(next);
      } catch {
        if (!abort) {
          setExtras({
            runtime: null,
            awards: null,
            imdbRating: null,
            overview: null,
            ratingsReady: true,
          });
        }
      }
    })();

    return () => {
      abort = true;
    };
  }, [item, mediaType]);

  // Carga perezosa (al montar la vista previa en hover) de los datos que
  // alimentan la fila de acciones y la fila meta compartidas. Best-effort: nunca
  // lanza, degrada en silencio, se cancela al desmontar y NO bloquea el render.
  useEffect(() => {
    if (!item?.id) return undefined;

    let cancelled = false;
    const isTv = mediaType === "tv";

    // Detalles TMDb (espejo de useDetailModalData): estado crudo, géneros y
    // temporadas + una duración/duración-de-temporadas de respaldo.
    const detailsPromise = getDetails(mediaType, item.id).catch(() => null);

    (async () => {
      try {
        const details = await detailsPromise;
        if (cancelled || !details) return;

        let genreObjects = [];
        if (Array.isArray(details?.genres) && details.genres.length) {
          genreObjects = details.genres
            .filter((g) => g && g.name)
            .map((g) => ({ id: g.id ?? g.name, name: g.name }));
        } else {
          const ids = item.genre_ids || [];
          genreObjects = (Array.isArray(ids) ? ids : [])
            .map((gid) => (GENRES[gid] ? { id: gid, name: GENRES[gid] } : null))
            .filter(Boolean);
        }

        // Etiqueta de duración: minutos para películas; "N Temp. · M Eps." para
        // series (mismo formato que useDetailModalData / DetailModal).
        let runtimeFallback = null;
        if (isTv) {
          if (details?.number_of_seasons) {
            runtimeFallback = `${details.number_of_seasons} Temp.`;
            if (details?.number_of_episodes) {
              runtimeFallback += ` · ${details.number_of_episodes} Eps.`;
            }
          }
        } else {
          runtimeFallback = formatRuntime(details?.runtime) || null;
        }

        setPreviewDetails({
          status: details?.status || null,
          genreObjects,
          seasons: Array.isArray(details?.seasons) ? details.seasons : [],
          runtimeFallback,
        });
      } catch {
        // sin detalles: la fila meta se queda con el año que ya trae el item
      }
    })();

    // Estado de Trakt del título (visto/plays/puntuación) y, para series, el
    // badge de progreso (%) calculado con las temporadas de TMDb.
    (async () => {
      try {
        setTraktInfo((prev) => ({ ...prev, loading: true }));
        setRatingLoading(true);

        const status = await traktGetItemStatus({
          type: isTv ? "show" : "movie",
          tmdbId: item.id,
        });
        if (cancelled) return;

        const connected = !!status?.connected;
        const ratingValue =
          status?.rating == null || !Number.isFinite(Number(status.rating))
            ? null
            : Number(status.rating);
        setRating(ratingValue);
        setRatingLoading(false);

        if (!isTv) {
          setTraktInfo({
            connected,
            watched: !!status?.watched,
            plays: Number(status?.plays || 0),
            badge: null,
            loading: false,
          });
          return;
        }

        // Series: sin conexión, no hay progreso que mostrar.
        if (!connected) {
          setTraktInfo({
            connected: false,
            watched: false,
            plays: 0,
            badge: null,
            loading: false,
          });
          return;
        }

        // Series conectada: episodios vistos + temporadas -> % de progreso.
        const [watchedRes, details] = await Promise.all([
          traktGetShowWatched({ tmdbId: item.id }).catch(() => null),
          detailsPromise,
        ]);
        if (cancelled) return;

        const watchedBySeason = watchedRes?.watchedBySeason || {};
        const seasonsList = Array.isArray(details?.seasons)
          ? details.seasons
          : [];
        const usable = seasonsList.filter(
          (s) => typeof s?.season_number === "number" && s.season_number > 0,
        );
        const totalEpisodes = usable.reduce(
          (acc, s) => acc + getAvailableEpisodeTotal(s),
          0,
        );
        const watchedEpisodes = usable.reduce((acc, s) => {
          const total = getAvailableEpisodeTotal(s);
          return (
            acc +
            getWatchedEpisodeCountForSeason(watchedBySeason, s.season_number, total)
          );
        }, 0);
        const pct =
          totalEpisodes > 0
            ? Math.min(
                100,
                Math.max(0, Math.round((watchedEpisodes / totalEpisodes) * 100)),
              )
            : 0;
        const badge = pct > 0 ? `${pct}%` : null;

        const hasAnyWatched = Object.values(watchedBySeason || {}).some(
          (eps) => Array.isArray(eps) && eps.length > 0,
        );

        setTraktInfo({
          connected: true,
          watched: hasAnyWatched,
          plays: 0,
          badge,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setTraktInfo((prev) => ({ ...prev, loading: false }));
          setRatingLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item?.id, mediaType]);

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

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
        title: item.title || item.name,
        posterPath: item.poster_path || item.backdrop_path || null,
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
        title: item.title || item.name,
        posterPath: item.poster_path || item.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating(false);
    }
  };

  const closeSoundtrackOverlay = (e) => {
    e?.stopPropagation();
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
  };

  // Puntuación optimista en Trakt (StarRating). Revierte la nota local si falla.
  const handleRatePreview = async (value) => {
    if (!traktInfo.connected) {
      requireLogin();
      return false;
    }
    if (ratingLoading || !item) return false;

    const previousRating = rating;
    const optimisticRating = value == null ? null : Number(value);

    try {
      setRatingLoading(true);
      setError("");
      setRating(optimisticRating);
      const res = await traktSetRating({
        type: mediaType === "tv" ? "show" : "movie",
        tmdbId: item.id,
        rating: value,
      });
      const saved =
        res?.rating == null || !Number.isFinite(Number(res.rating))
          ? optimisticRating
          : Number(res.rating);
      setRating(saved);
      return true;
    } catch {
      setRating(previousRating);
      setError("No se pudo guardar la puntuación.");
      return false;
    } finally {
      setRatingLoading(false);
    }
  };

  const handleToggleTrailer = async (e) => {
    e?.stopPropagation?.();
    closeSoundtrackOverlay();
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
        setError("No hay trailer disponible para este título.");
        return;
      }
      setTrailer(t);
      setShowTrailer(true);
    } catch {
      setTrailer(null);
      setShowTrailer(false);
      setError("No se pudo cargar el trailer.");
    } finally {
      setTrailerLoading(false);
    }
  };

  // Autoplay del tráiler ~1s tras el hover: esta tarjeta se MONTA al hacer hover
  // (se renderiza dentro de {isActive ? …}), así que el temporizador al montar
  // equivale a "poco después del hover"; el cleanup lo cancela al des-hover.
  const autoTrailerRef = useRef(null);
  autoTrailerRef.current = {
    showTrailer,
    trailerLoading,
    play: handleToggleTrailer,
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      const s = autoTrailerRef.current;
      if (s && !s.showTrailer && !s.trailerLoading) s.play();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleToggleSoundtrack = async (e) => {
    e.stopPropagation();
    if (soundtrackLoading) return;

    if (soundtrackOpen) {
      closeSoundtrackOverlay();
      return;
    }

    if (showTrailer) setShowTrailer(false);
    setSoundtrackOpen(true);
    setSoundtrackError("");

    if (soundtrackTrack?.previewUrl) return;

    const controller = new AbortController();
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = controller;
    setSoundtrackLoading(true);

    try {
      const title = item.title || item.name || "";
      const params = new URLSearchParams({
        title,
        type: mediaType,
        country: "ES",
        tmdbId: String(item.id),
      });
      const originalTitle = item.original_title || item.original_name;
      if (originalTitle && originalTitle !== title) {
        params.set("originalTitle", originalTitle);
      }
      const year = yearOf(item);
      if (year) params.set("year", String(year));

      const response = await fetch(`/api/soundtrack?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Soundtrack HTTP ${response.status}`);

      const data = await response.json();
      const track = Array.isArray(data?.tracks)
        ? data.tracks.find((entry) => entry?.previewUrl)
        : null;

      if (!track?.previewUrl) {
        setSoundtrackError(
          "No se encontró una canción con preview para este título.",
        );
        return;
      }

      setSoundtrackTrack({
        id: track.id || track.previewUrl,
        previewUrl: track.previewUrl,
        trackName: track.trackName || track.name || "Soundtrack",
        artistName: track.artistName || "",
        artworkUrl: track.artworkUrl || "",
        source: track.source || "",
      });
    } catch (requestError) {
      if (requestError?.name !== "AbortError") {
        setSoundtrackError("No se pudo cargar el soundtrack.");
      }
    } finally {
      if (soundtrackAbortRef.current === controller) {
        soundtrackAbortRef.current = null;
        setSoundtrackLoading(false);
      }
    }
  };

  const handleToggleSoundtrackPlayback = async (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !soundtrackTrack?.previewUrl) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    audio.volume = 0.3;
    try {
      await audio.play();
    } catch {
      setSoundtrackPlaying(false);
    }
  };

  const bgSrc = backdropPath ? buildImg(backdropPath, BACKDROP_SIZE) : null;
  const title = item?.title || item?.name || "";
  const tmdbRating = ratingOf(item);
  const hasTmdbRating = tmdbRating !== "–";

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

  // Alineación de la vista previa según la tarjeta y las visibles del breakpoint.
  const activeIdx = typeof activeIndex === "number" ? activeIndex : 0;
  const visibleCount = Number.isFinite(perView) && perView > 0 ? perView : 6;
  const isLeftBoundary = index === activeIdx || index === 0;
  const isRightBoundary =
    index === activeIdx + visibleCount - 1 || index === totalCount - 1;

  // Centrado por-imagen: la IMAGEN backdrop del preview queda centrada sobre la
  // tarjeta (marginTop = -½ alto de imagen) y la escala crece desde ese centro.
  const [previewRef, previewImgHalf] = usePreviewImageHalf(true);

  let alignmentClass = "left-1/2 -translate-x-1/2";
  let originX = "center";
  if (isLeftBoundary) {
    alignmentClass = "left-0";
    originX = "left";
  } else if (isRightBoundary) {
    alignmentClass = "right-0";
    originX = "right";
  }
  const transformOrigin = `${originX} ${previewImgHalf}px`;

  const previewWidthPercent =
    visibleCount <= 3
      ? 160
      : visibleCount === 4
        ? 158
        : visibleCount === 5
          ? 156
          : 154;
  const previewScale = 1.04;
  const previewMaxWidth =
    visibleCount >= 6 ? "min(156%, 560px)" : `${previewWidthPercent}%`;
  const previewImageSizes =
    visibleCount <= 3
      ? "(min-width:1280px) 620px, (min-width:768px) 540px, 440px"
      : visibleCount === 4
        ? "(min-width:1280px) 560px, (min-width:768px) 500px, 420px"
        : "(min-width:1536px) 560px, (min-width:1280px) 500px, 420px";

  const previewBtnClass = "!h-9 !w-9 sm:!h-10 sm:!w-10 [&_svg]:!h-5 [&_svg]:!w-5";

  return (
    <>
    <motion.div
      initial={
        reduceMotion ? false : { opacity: 0, scale: 0.94, y: 8 }
      }
      animate={{ opacity: 1, scale: previewScale, y: -8 }}
      exit={{
        opacity: 0,
        scale: 0.97,
        y: 4,
        transition: reduceMotion
          ? DASHBOARD_PREVIEW_REDUCED_TRANSITION
          : DASHBOARD_PREVIEW_EXIT_TRANSITION,
      }}
      transition={
        reduceMotion
          ? DASHBOARD_PREVIEW_REDUCED_TRANSITION
          : DASHBOARD_PREVIEW_ENTER_TRANSITION
      }
      ref={previewRef}
      className={`absolute top-1/2 ${alignmentClass} z-50 flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] backdrop-blur-xl`}
      onClick={() => openDetailModal?.(item)}
      onMouseEnter={(event) => {
        onPreviewMouseEnter?.(event);
      }}
      onMouseLeave={onPreviewMouseLeave}
      style={{
        width: previewMaxWidth,
        marginTop: -previewImgHalf,
        willChange: "transform, opacity",
        transformOrigin,
      }}
    >
      {/* Backdrop ampliado 16:9 (+ trailer al pulsar ▶) */}
      <div className="relative aspect-video w-full overflow-hidden bg-transparent">
        {!showTrailer && !bgSrc && (
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
              variants={shimmer}
              animate="animate"
              style={{ backgroundSize: "200% 100%" }}
            />
          </div>
        )}

        {bgSrc && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 1.08 }}
            transition={{ duration: 4, ease: "easeOut" }}
            className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-300 ${
              showTrailer ? "z-[5]" : ""
            } ${showTrailer && trailerPlaying ? "opacity-0" : "opacity-100"}`}
          >
            <NextImage
              key={bgSrc}
              src={bgSrc}
              alt={title}
              fill
              sizes={previewImageSizes}
              className="object-cover"
              style={dashboardPreviewBackdropFadeStyle}
              loading="eager"
            />
          </motion.div>
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
                  title={`Trailer - ${title}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen={false}
                  onLoad={syncTrailerAudio}
                />
                {trailerPlaying && (
                  <PreviewTrailerAudioButton
                    muted={trailerMuted}
                    onToggle={handleToggleTrailerAudio}
                  />
                )}
              </div>
            )}
          </>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-transparent via-black/20 to-transparent" />
      </div>

      {/* Panel de info: acciones · metadatos */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25, ease: "easeOut" }}
        className="w-full bg-transparent px-4 py-3.5 sm:px-5 sm:py-4"
      >
        {/* Fila de acciones COMPARTIDA con DetailsClient/DetailModal. Va
            envuelta en un contenedor que corta la propagación al onClick de la
            card (que abre la ficha rápida): así los clics en los botones
            accionan su función y no abren el modal a la vez. Cada handler
            además llama a e.stopPropagation() por robustez. */}
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          <DetailActionsRow
            onTrailer={handleToggleTrailer}
            trailerAvailable
            trailerLoading={trailerLoading}
            trailerLabel="Ver tráiler"
            trailerPlaying={showTrailer}
            onSoundtrack={handleToggleSoundtrack}
            soundtrackAvailable
            onEpisodeRatings={
              mediaType === "tv"
                ? (e) => {
                    e?.stopPropagation?.();
                    // Señala al row que hay un modal anidado abierto ANTES de que
                    // el mouseleave (al ir al modal) intente cerrar la preview.
                    onNestedModalOpenChange?.(true);
                    setEpisodeRatingsOpen(true);
                  }
                : undefined
            }
            episodeRatingsOpen={episodeRatingsOpen}
            trakt={{
              connected: traktInfo.connected,
              watched: traktInfo.watched,
              plays: traktInfo.plays,
              badge: traktInfo.badge,
              busy: false,
              loading: traktInfo.loading,
              onOpen: (e) => {
                e?.stopPropagation?.();
                openDetailModal?.(item);
              },
            }}
            rate={{
              rating,
              max: 10,
              loading: ratingLoading,
              onRate: handleRatePreview,
              connected: traktInfo.connected,
              onConnect: () => requireLogin(),
            }}
            favorite={favorite}
            favoriteLoading={loadingStates || updating}
            onToggleFavorite={handleToggleFavorite}
            watchlist={watchlist}
            watchlistLoading={loadingStates || updating}
            onToggleWatchlist={handleToggleWatchlist}
          />
        </div>

        {/* Fila meta + géneros COMPARTIDA con DetailModal/DetailsClient:
            año · duración · estado · géneros (mismo componente y diseño).
            Se alimenta igual que useDetailModalData. */}
        <DetailsMetaGenresRow
          yearIso={yearOf(item)}
          displayRuntimeValue={previewDetails.runtimeFallback}
          status={previewDetails.status}
          genres={previewDetails.genreObjects}
        />

        {extras?.awards && (
          <div className="mt-1.5 mb-1.5 flex items-center gap-2 text-[11px] font-bold text-emerald-300 drop-shadow-md sm:text-xs">
            <motion.span
              key={extras.awards}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex min-w-0 items-center gap-1.5"
            >
              <Award className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{extras.awards}</span>
            </motion.span>
          </div>
        )}

        {/* Puntuaciones TMDb · IMDb con el MISMO componente compartido que usa
            DetailModal (mismo diseño). Orden espejo del modal: acciones →
            meta → premios → puntuaciones. */}
        {extras?.ratingsReady && (
          <DetailsRatingsBadges
            tmdb={
              hasTmdbRating
                ? { value: tmdbRating, sub: formatCountShort(item.vote_count) }
                : null
            }
            imdb={
              typeof extras?.imdbRating === "number"
                ? { value: extras.imdbRating.toFixed(1), sub: null }
                : null
            }
          />
        )}

        {error && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-red-400">{error}</p>
        )}
      </motion.div>

      {/* Overlay de soundtrack (mismo diseño que InlinePreviewCard): se pinta
          dentro de la propia tarjeta y corta la propagación de clics. */}
      <AnimatePresence>
        {soundtrackOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-[inherit] p-4"
            role="dialog"
            aria-label={`Soundtrack de ${title}`}
            onClick={(e) => e.stopPropagation()}
          >
            {bgSrc && (
              <NextImage
                src={bgSrc}
                alt=""
                aria-hidden="true"
                fill
                sizes={previewImageSizes}
                className="scale-110 object-cover opacity-55 blur-2xl"
              />
            )}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />

            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex min-h-32 w-full max-w-[32rem] items-center gap-4 overflow-hidden rounded-[1.75rem] bg-black/45 bg-gradient-to-br from-white/15 via-white/[0.06] to-black/35 p-4 pr-12 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.16),0_24px_50px_-18px_rgba(0,0,0,0.95)] backdrop-blur-3xl sm:gap-5 sm:p-5 sm:pr-14"
            >
              <button
                type="button"
                onClick={closeSoundtrackOverlay}
                autoFocus
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:h-10 sm:w-10"
                aria-label="Cerrar soundtrack"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {soundtrackLoading ? (
                <div
                  className="flex min-h-24 w-full items-center justify-center gap-3 text-zinc-300"
                  aria-live="polite"
                >
                  <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
                  <span className="text-sm font-semibold">
                    Buscando música...
                  </span>
                </div>
              ) : soundtrackTrack ? (
                <>
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_35px_-14px_rgba(0,0,0,0.95)] sm:h-32 sm:w-32">
                    {soundtrackTrack.artworkUrl ? (
                      <OptimizedImage
                        src={soundtrackTrack.artworkUrl}
                        alt={`Portada de ${soundtrackTrack.trackName}`}
                        decoding="async"
                        fetchPriority="high"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2
                          className="h-10 w-10 text-amber-300/60"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="mb-1 truncate text-[0.62rem] font-bold uppercase tracking-[0.18em] text-white/45 sm:text-[0.68rem]">
                      {title}
                    </p>
                    <h4 className="line-clamp-2 text-base font-black leading-tight text-white drop-shadow-md sm:text-xl">
                      {soundtrackTrack.trackName}
                    </h4>
                    {soundtrackTrack.artistName && (
                      <p className="mt-1 line-clamp-1 text-xs font-medium text-white/65 sm:text-sm">
                        {soundtrackTrack.artistName}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleToggleSoundtrackPlayback}
                      className="mt-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)] backdrop-blur-xl transition hover:scale-105 hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                      aria-label={
                        soundtrackPlaying ? "Pausar canción" : "Reproducir canción"
                      }
                    >
                      {soundtrackPlaying ? (
                        <Pause className="h-5 w-5 fill-current" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      )}
                    </button>

                    <audio
                      ref={audioRef}
                      src={soundtrackTrack.previewUrl}
                      autoPlay
                      loop
                      preload="metadata"
                      className="hidden"
                      onLoadedMetadata={(event) => {
                        event.currentTarget.volume = 0.3;
                      }}
                      onPlay={() => setSoundtrackPlaying(true)}
                      onPause={() => setSoundtrackPlaying(false)}
                    />
                  </div>
                </>
              ) : (
                <div
                  className="flex min-h-24 w-full flex-col items-center justify-center gap-2 text-center text-zinc-300"
                  aria-live="polite"
                >
                  <Music2 className="h-8 w-8 text-amber-300/50" />
                  <p className="max-w-72 text-sm font-medium">
                    {soundtrackError ||
                      "No se encontró música para este título."}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {/* Valoración de episodios (solo series) — mismo modal que la ficha
        completa y DetailModal. Fuera del área clicable de la card. */}
    {mediaType === "tv" && (
      <EpisodeRatingsModal
        open={episodeRatingsOpen}
        onClose={() => {
          setEpisodeRatingsOpen(false);
          onNestedModalOpenChange?.(false);
        }}
        showId={Number(item.id)}
        title={title}
      />
    )}
    </>
  );
}

/* ====================================================================
 * Fila: cabecera (título + punto ámbar + chevron) + carrusel de tarjetas
 * landscape. En escritorio, hover → vista previa estilo Netflix.
 * ==================================================================== */
export default function DashboardBackdropRow({
  title,
  href,
  items,
  isMobile,
  hydrated,
  backdropOverrides = {},
  accent = "amber",
  labelText,
}) {
  const reduceMotion = useReducedMotion();
  const { openDetailModal } = useDetailModal();
  const { showHoverBackdrop, clearHoverBackdrop, prewarmHoverBackdrop } =
    useDashboardHoverBackdrop();
  const revealProps = useScrollRevealProps();

  const swiperRef = useRef(null);
  const rowRef = useRef(null);
  const [isHoveredRow, setIsHoveredRow] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [animatingOutId, setAnimatingOutId] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [perView, setPerView] = useState(6);
  const hoverOpenTimeoutRef = useRef(null);
  const hoverCloseTimeoutRef = useRef(null);
  const hoveredIdRef = useRef(null);
  // Un modal anidado abierto DESDE la vista previa (p. ej. la tabla de valoraciones
  // de episodios, que se portaliza a body) no debe cerrarse cuando el cursor sale
  // de la preview para ir a él: ese mouseleave dispararía closePreview y desmontaría
  // la preview, y con ella el modal (su hijo). Mientras haya uno abierto, congelamos
  // el cierre de la preview.
  const nestedPreviewModalOpenRef = useRef(false);
  const handlePreviewNestedModalChange = useCallback((open) => {
    nestedPreviewModalOpenRef.current = open;
  }, []);

  useEffect(() => {
    return () => {
      if (hoverOpenTimeoutRef.current) {
        clearTimeout(hoverOpenTimeoutRef.current);
      }
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
      }
      clearHoverBackdrop();
    };
  }, [clearHoverBackdrop]);

  useEffect(() => {
    hoveredIdRef.current = hoveredId;
  }, [hoveredId]);

  const displayItems = Array.isArray(items) ? items : EMPTY_ARRAY;
  const sectionAccent = SECTION_ACCENTS[accent] || SECTION_ACCENTS.amber;
  const displayTitle = normalizeDashboardSectionTitle(title);
  const sectionLabel = deriveSectionLabel(title, labelText);
  if (displayItems.length === 0) return null;

  const getDisplayItemKey = (item) =>
    item?.id ? `${getMediaTypeForItem(item)}:${item.id}` : "";

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  };

  const clearHoverOpenTimer = () => {
    if (hoverOpenTimeoutRef.current) {
      clearTimeout(hoverOpenTimeoutRef.current);
      hoverOpenTimeoutRef.current = null;
    }
  };

  const puedePosarPuntero = useHoverCapable();

  const openPreview = (itemKey, index) => {
    // Puerta ÚNICA: aquí pasan TODOS los caminos que abren la vista previa
    // (el temporizador del hover, el propio panel al mantener el puntero
    // encima, y el reenganche del vecino). Guardar solo los manejadores no
    // bastaba: en tablet el toque sintetiza `mouseenter` y algunas rutas
    // llamaban aquí directamente, saltándose la comprobación.
    if (!puedePosarPuntero) return;
    clearHoverCloseTimer();
    const item = displayItems[index];
    const prev = hoveredIdRef.current;
    if (prev && prev !== itemKey) {
      setAnimatingOutId(prev);
    } else {
      setAnimatingOutId((prevOut) => (prevOut === itemKey ? null : prevOut));
    }
    hoveredIdRef.current = itemKey;
    setHoveredId(itemKey);
    if (typeof index === "number") setHoveredIndex(index);
    showHoverBackdrop(item);
  };

  const closePreview = (itemKey) => {
    // No cerrar la preview si tiene un modal anidado abierto (ver ref arriba).
    if (nestedPreviewModalOpenRef.current) return;
    if (hoveredIdRef.current !== itemKey) return;
    const item = displayItems.find((entry) => getDisplayItemKey(entry) === itemKey);
    hoveredIdRef.current = null;
    setAnimatingOutId(itemKey);
    setHoveredId(null);
    setHoveredIndex(null);
    clearHoverBackdrop(item);
  };

  const handleMouseEnterItem = (itemKey, index) => {
    // No basta con descartar el móvil por ancho: en una tablet el toque genera
    // un `mouseenter` sintético y la vista previa se abría sola.
    if (isMobile || !puedePosarPuntero) return;
    clearHoverCloseTimer();
    clearHoverOpenTimer();
    prewarmHoverBackdrop(displayItems[index]);
    hoverOpenTimeoutRef.current = window.setTimeout(() => {
      hoverOpenTimeoutRef.current = null;
      openPreview(itemKey, index);
    }, DASHBOARD_PREVIEW_OPEN_DELAY_MS);
  };

  const handleMouseLeaveItem = (itemKey) => {
    if (isMobile || !puedePosarPuntero) return;
    clearHoverOpenTimer();
    clearHoverCloseTimer();
    const activeItemKey = hoveredIdRef.current || itemKey;
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      closePreview(activeItemKey);
    }, DASHBOARD_PREVIEW_CLOSE_DELAY_MS);
  };

  const updateNav = (swiper) => {
    if (!swiper) return;
    const hasOverflow = !swiper.isLocked;
    setCanPrev(hasOverflow && !swiper.isBeginning);
    setCanNext(hasOverflow && !swiper.isEnd);
    setActiveIndex(swiper.activeIndex);
    const spv = swiper?.params?.slidesPerView;
    if (typeof spv === "number" && Number.isFinite(spv)) setPerView(spv);
  };

  const handleSwiper = (swiper) => {
    swiperRef.current = swiper;
    updateNav(swiper);
  };

  const moveSlides = (dir) => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    const count = isMobile ? 1 : Math.max(1, perView - 1);
    for (let i = 0; i < count; i += 1) {
      if (dir < 0) swiper.slidePrev();
      else swiper.slideNext();
    }
  };

  const hasActivePreview = !!hoveredId;
  const isHoveringFirstVisible =
    hoveredIndex !== null && hoveredIndex <= activeIndex;
  const isHoveringLastVisible =
    hoveredIndex !== null &&
    hoveredIndex >= activeIndex + Math.floor(perView) - 1;

  // Con una preview ACTIVA ignoramos la supresión por tarjeta-de-borde
  // (isHoveringFirst/LastVisible): así, al hacer preview de la primera/última
  // tarjeta visible, la flecha correspondiente sigue visible SUPERPUESTA sobre la
  // preview (z-[110]) y se puede seguir desplazando con el cursor en esa zona.
  // Sin preview conservamos la supresión (evita que la flecha tape la tarjeta de
  // borde en simple hover).
  const showPrev =
    (isHoveredRow || hasActivePreview) &&
    canPrev &&
    (hasActivePreview || !isHoveringFirstVisible);
  const showNext =
    (isHoveredRow || hasActivePreview) &&
    canNext &&
    (hasActivePreview || !isHoveringLastVisible);

  const breakpoints = isMobile
    ? {
        0: { slidesPerView: 2, spaceBetween: 10 },
        640: { slidesPerView: 2, spaceBetween: 12 },
      }
    : {
        768: { slidesPerView: 3, spaceBetween: 14 },
        1024: { slidesPerView: 4, spaceBetween: 16 },
        1280: { slidesPerView: 5, spaceBetween: 18 },
        1536: { slidesPerView: 6, spaceBetween: 20 },
      };

  const swiperKey = `backdrop-row-${hydrated ? "h" : "s"}-${
    isMobile ? "m" : "d"
  }`;

  const Header = (
    <motion.div
      variants={scaleIn}
      className="relative z-20 mb-5 px-1 pointer-events-none sm:px-0"
    >
      {sectionLabel && (
        <div className="mb-1.5 flex items-center gap-2">
          <div className={`h-px w-8 ${sectionAccent.line}`} />
          <span
            className={`text-[10px] font-bold uppercase tracking-widest ${sectionAccent.text}`}
          >
            {sectionLabel}
          </span>
        </div>
      )}
      {href ? (
        <Link
          href={href}
          className={`group/title pointer-events-auto inline-flex w-fit items-center bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent transition-all duration-200 ${sectionAccent.hover} active:scale-[0.98] active:opacity-90 sm:text-2xl md:text-3xl`}
          aria-label={`Ver todos los títulos de ${displayTitle}`}
        >
          <span>{displayTitle}</span>
          <span className={sectionAccent.dot}>.</span>
          <ChevronRight
            className={`ml-1 h-5 w-5 translate-x-[-4px] opacity-0 transition duration-200 group-hover/title:translate-x-0 group-hover/title:opacity-100 sm:h-6 sm:w-6 ${sectionAccent.chevron}`}
          />
        </Link>
      ) : (
        <h3 className="inline-flex w-fit items-center bg-gradient-to-r from-white via-neutral-100 to-neutral-200 bg-clip-text text-xl font-black tracking-tighter text-transparent sm:text-2xl md:text-3xl">
          <span>{displayTitle}</span>
          <span className={sectionAccent.dot}>.</span>
        </h3>
      )}
    </motion.div>
  );

  return (
    <motion.div
      ref={rowRef}
      {...revealProps}
      variants={fadeInUp}
      className={`group relative ${hasActivePreview ? "z-[100]" : ""}`}
    >
      {Header}

      <div
        className={`relative ${hasActivePreview ? "z-30" : ""}`}
        onMouseEnter={() => setIsHoveredRow(true)}
        onMouseLeave={() => {
          setIsHoveredRow(false);
          const currentHoveredId = hoveredIdRef.current;
          if (currentHoveredId) handleMouseLeaveItem(currentHoveredId);
        }}
      >
        <div className={!hydrated ? "pointer-events-none touch-none" : ""}>
          <Swiper
            key={swiperKey}
            slidesPerView={isMobile ? 2 : 3}
            spaceBetween={isMobile ? 10 : 16}
            onSwiper={handleSwiper}
            onSlideChange={updateNav}
            onResize={updateNav}
            onReachBeginning={updateNav}
            onReachEnd={updateNav}
            loop={false}
            watchOverflow={true}
            grabCursor={!isMobile}
            simulateTouch={true}
            allowTouchMove={true}
            preventClicks={true}
            preventClicksPropagation={true}
            threshold={isMobile ? 2 : 5}
            touchRatio={isMobile ? 1.5 : 1}
            freeMode={{ enabled: true, momentum: true, momentumRatio: 0.55 }}
            modules={[Navigation, FreeMode]}
            // Padding vertical amplio (con margen negativo que lo compensa, así
            // el espaciado entre filas no cambia) para reservar el hueco de la
            // vista previa sin que se recorte. Es ASIMÉTRICO: más abajo que
            // arriba, porque el preview se centra por su IMAGEN sobre la tarjeta y
            // la sección de info cuelga hacia abajo (necesita más hueco inferior).
            // El Swiper es pointer-events-none en escritorio para no robar
            // hover/clic a las filas vecinas; las tarjetas los reactivan.
            className={`group relative !pt-3 sm:!pt-16 md:!pt-44 !pb-2 sm:!pb-52 md:!pb-72 !-mt-3 sm:!-mt-16 md:!-mt-44 !-mb-2 sm:!-mb-52 md:!-mb-72 ${
              isMobile ? "" : "pointer-events-none"
            }`}
            wrapperClass="flex items-center"
            breakpoints={breakpoints}
          >
            {displayItems.map((item, i) => {
              const itemKey = getDisplayItemKey(item);
              const isActive = hydrated && !isMobile && hoveredId === itemKey;
              const isAnimatingOut = animatingOutId === itemKey;
              const backdropOverride = backdropOverrides[item.id];

              const base =
                "relative flex-shrink-0 transition-all duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]";

              return (
                <SwiperSlide
                  key={itemKey}
                  className={`${
                    isMobile
                      ? "select-none"
                      : "select-none pointer-events-auto"
                  } ${
                    isActive
                      ? "!relative !z-[100] !overflow-visible"
                      : isAnimatingOut
                        ? "!relative !z-[50] !overflow-visible"
                        : "!relative !z-10"
                  }`}
                >
                  <div
                    className={`${base} aspect-video w-full ${
                      isActive || isAnimatingOut
                        ? "overflow-visible"
                        : "overflow-hidden"
                    }`}
                    onMouseEnter={() => handleMouseEnterItem(itemKey, i)}
                    onMouseLeave={() => {
                      if (!isActive) handleMouseLeaveItem(itemKey);
                    }}
                  >
                    <AnimatePresence
                      initial={false}
                      mode="popLayout"
                      onExitComplete={() => {
                        setAnimatingOutId((prev) =>
                          prev === itemKey ? null : prev,
                        );
                      }}
                    >
                      {isActive ? (
                        <div
                          key="preview"
                          className="hidden sm:block"
                          onMouseEnter={() => openPreview(itemKey, i)}
                        >
                          <BackdropPreviewCard
                            item={item}
                            backdropOverride={backdropOverride}
                            index={i}
                            totalCount={displayItems.length}
                            activeIndex={activeIndex}
                            perView={perView}
                            onPreviewMouseEnter={() => openPreview(itemKey, i)}
                            onPreviewMouseLeave={() => closePreview(itemKey)}
                            onNestedModalOpenChange={
                              handlePreviewNestedModalChange
                            }
                          />
                        </div>
                      ) : (
                        <motion.div
                          key="base"
                          initial={
                            reduceMotion ? false : { opacity: 0, scale: 0.97 }
                          }
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{
                            opacity: 0,
                            scale: 0.97,
                            transition: reduceMotion
                              ? DASHBOARD_PREVIEW_REDUCED_TRANSITION
                              : DASHBOARD_PREVIEW_EXIT_TRANSITION,
                          }}
                          transition={
                            reduceMotion
                              ? DASHBOARD_PREVIEW_REDUCED_TRANSITION
                              : DASHBOARD_PREVIEW_ENTER_TRANSITION
                          }
                            className="h-full w-full cursor-pointer"
                            style={{ willChange: "transform, opacity" }}
                            onClick={() => openDetailModal?.(item)}
                          >
                          <BackdropBaseCard
                            item={item}
                            backdropOverride={backdropOverride}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SwiperSlide>
              );
            })}
          </Swiper>
        </div>

        <AnimatePresence>
          {showPrev && !isMobile && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveSlides(-1);
              }}
              // El botón es solo zona de pulsación (sin fondo). Inset vertical
              // ASIMÉTRICO (top=pt, bottom=pb) para centrar sobre la tarjeta base.
              // `-left-6` extiende el área hasta el borde lateral. z-[110] > z-[100]
              // de la preview activa: flecha y panel ENCIMA de la vista previa.
              className="absolute -left-6 top-14 bottom-40 z-[110] hidden w-32 items-center justify-start sm:top-16 sm:bottom-52 sm:flex md:top-44 md:bottom-72 group/nav"
            >
              {/* Panel difuminado que ocupa el alto completo y se integra de forma continua
                  con el fondo de la pantalla y las tarjetas sin cortes ni bordes (rounded-none, left-0 right-0). */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 right-0 rounded-none bg-gradient-to-r from-black/50 via-black/15 to-transparent backdrop-blur-[8px] sv-scroll-mask-l transition-colors duration-300 group-hover/nav:from-black/75"
              />
              <motion.span
                className="relative ml-12 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
                whileHover={{ x: -4 }}
              >
                ‹
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showNext && !isMobile && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                moveSlides(1);
              }}
              // Espejo de la izquierda: botón solo zona de pulsación (sin fondo).
              // `-right-6` extiende el área hasta el borde lateral. z-[110] > z-[100]
              // de la preview activa: flecha y panel ENCIMA de la vista previa.
              className="absolute -right-6 top-14 bottom-40 z-[110] hidden w-32 items-center justify-end sm:top-16 sm:bottom-52 sm:flex md:top-44 md:bottom-72 group/nav"
            >
              {/* Panel difuminado que ocupa el alto completo y se integra de forma continua
                  con el fondo de la pantalla y las tarjetas sin cortes ni bordes (rounded-none, right-0 left-0). */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 left-0 rounded-none bg-gradient-to-l from-black/50 via-black/15 to-transparent backdrop-blur-[8px] sv-scroll-mask-r transition-colors duration-300 group-hover/nav:from-black/75"
              />
              <motion.span
                className="relative mr-12 text-4xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.95)] transition-transform group-hover/nav:scale-110"
                whileHover={{ x: 4 }}
              >
                ›
              </motion.span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
