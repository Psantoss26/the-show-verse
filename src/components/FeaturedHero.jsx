// /src/components/FeaturedHero.jsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  Play,
  X,
  Heart,
  BookmarkPlus,
  Eye,
  EyeOff,
  Award,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import LiquidButton from "@/components/LiquidButton";
import HeroSoundtrackPlayer from "@/components/dashboard/HeroSoundtrackPlayer";

import { useAuth } from "@/context/AuthContext";
import {
  markAsFavorite,
  markInWatchlist,
  getMovieDetails,
  getExternalIds,
} from "@/lib/api/tmdb";
import { fetchImdbRatingByImdb } from "@/lib/api/imdbRatings";
import { fetchOmdbByImdb } from "@/lib/api/omdb";
import { formatDashboardAwards } from "@/lib/details/awardsText";
import { getBackendItemStatus } from "@/lib/api/itemStatus";

import {
  buildImg,
  GENRES,
  getMediaTypeForItem,
  getPreviewBackdropFallback,
  fetchBestBackdropNoLang,
  fetchBestPosterNoLang,
  fetchBestLogo,
  getBestTrailerCached,
  getArtworkPreference,
  yearOf,
  ratingOf,
  formatRuntime,
} from "@/lib/dashboard/media";

// El backdrop se carga directamente desde TMDb. El <picture> usa `original`
// únicamente cuando w1280 tendría que ampliarse (viewport ancho o pantalla de
// alta densidad), manteniendo una sola descarga por slide y sin coste de Vercel.
const HERO_BACKDROP_SIZE = "w1280";
const HERO_BACKDROP_MAX_SIZE = "original";
const HERO_POSTER_SIZE = "w780";
const HERO_AUTO_ADVANCE_MS = 6000;
const HERO_SWIPE_THRESHOLD_PX = 60;
const YOUTUBE_QUALITY_HINT = "highres";
const YOUTUBE_QUALITY_MIN = "hd1080";
const YOUTUBE_QUALITY_RETRY_DELAYS = [150, 750, 1800, 3200];

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

/* =================== PREFERENCIA GLOBAL DE SOUNDTRACK ===================
 * El soundtrack del Hero suena por defecto. Si el usuario lo silencia con el
 * botón de volumen, la elección se guarda y aplica a TODOS los FeaturedHero.
 */
const SOUNDTRACK_MUTED_KEY = "showverse:hero:soundtrack-muted";
const SOUNDTRACK_MUTED_EVENT = "showverse:hero-soundtrack-muted";

function readSoundtrackMuted() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUNDTRACK_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSoundtrackMuted(muted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUNDTRACK_MUTED_KEY, muted ? "1" : "0");
  } catch {}
  // Sincroniza al instante todas las instancias montadas (el evento `storage`
  // no se dispara en la misma pestaña, así que usamos uno propio).
  window.dispatchEvent(new CustomEvent(SOUNDTRACK_MUTED_EVENT, { detail: muted }));
}

// Hook compartido: lee la preferencia, escucha cambios y permite alternarla o
// asignarla explícitamente desde los controles del reproductor.
function useSoundtrackMuted() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(readSoundtrackMuted());
    const onChange = (e) => setMuted(!!e.detail);
    window.addEventListener(SOUNDTRACK_MUTED_EVENT, onChange);
    return () => window.removeEventListener(SOUNDTRACK_MUTED_EVENT, onChange);
  }, []);

  const toggle = useCallback(() => {
    writeSoundtrackMuted(!readSoundtrackMuted());
  }, []);

  const update = useCallback((nextMuted) => {
    writeSoundtrackMuted(Boolean(nextMuted));
  }, []);

  return [muted, toggle, update];
}

/* =================== VISIBILIDAD DE SOUNDTRACK =================== */
const SOUNDTRACK_VISIBLE_KEY = "showverse:hero:soundtrack-visible";
const SOUNDTRACK_VISIBLE_EVENT = "showverse:hero-soundtrack-visible";
let soundtrackVisibleValue = true;
let soundtrackVisibleInitialized = false;

function readSoundtrackVisible() {
  if (typeof window === "undefined") return soundtrackVisibleValue;
  if (soundtrackVisibleInitialized) return soundtrackVisibleValue;

  soundtrackVisibleInitialized = true;
  try {
    const val = window.localStorage.getItem(SOUNDTRACK_VISIBLE_KEY);
    soundtrackVisibleValue = val === null ? true : val === "1";
  } catch {}
  return soundtrackVisibleValue;
}

function writeSoundtrackVisible(visible) {
  if (typeof window === "undefined") return;
  soundtrackVisibleValue = Boolean(visible);
  soundtrackVisibleInitialized = true;
  try {
    window.localStorage.setItem(
      SOUNDTRACK_VISIBLE_KEY,
      soundtrackVisibleValue ? "1" : "0",
    );
  } catch {}
  window.dispatchEvent(
    new CustomEvent(SOUNDTRACK_VISIBLE_EVENT, {
      detail: soundtrackVisibleValue,
    }),
  );
}

function subscribeSoundtrackVisible(onStoreChange) {
  const onVisibleChange = (event) => {
    soundtrackVisibleValue = Boolean(event.detail);
    soundtrackVisibleInitialized = true;
    onStoreChange();
  };
  const onStorageChange = (event) => {
    if (event.key !== SOUNDTRACK_VISIBLE_KEY) return;
    soundtrackVisibleValue =
      event.newValue === null ? true : event.newValue === "1";
    soundtrackVisibleInitialized = true;
    onStoreChange();
  };

  window.addEventListener(SOUNDTRACK_VISIBLE_EVENT, onVisibleChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    window.removeEventListener(SOUNDTRACK_VISIBLE_EVENT, onVisibleChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

function useSoundtrackVisible() {
  const visible = useSyncExternalStore(
    subscribeSoundtrackVisible,
    readSoundtrackVisible,
    () => true,
  );

  const toggle = useCallback(() => {
    writeSoundtrackVisible(!readSoundtrackVisible());
  }, []);

  return [visible, toggle];
}

/* =================== VOLUMEN DE SOUNDTRACK =================== */
const DEFAULT_SOUNDTRACK_VOLUME = 0.3;
const SOUNDTRACK_VOLUME_KEY = "showverse:hero:soundtrack-volume";
const SOUNDTRACK_VOLUME_EVENT = "showverse:hero-soundtrack-volume";

function readSoundtrackVolume() {
  if (typeof window === "undefined") return DEFAULT_SOUNDTRACK_VOLUME;
  try {
    const val = window.localStorage.getItem(SOUNDTRACK_VOLUME_KEY);
    if (val === null) return DEFAULT_SOUNDTRACK_VOLUME;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? DEFAULT_SOUNDTRACK_VOLUME : parsed;
  } catch {
    return DEFAULT_SOUNDTRACK_VOLUME;
  }
}

function writeSoundtrackVolume(vol) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUNDTRACK_VOLUME_KEY, String(vol));
  } catch {}
  window.dispatchEvent(new CustomEvent(SOUNDTRACK_VOLUME_EVENT, { detail: vol }));
}

function useSoundtrackVolume() {
  const [volume, setVolume] = useState(DEFAULT_SOUNDTRACK_VOLUME);

  useEffect(() => {
    setVolume(readSoundtrackVolume());
    const onChange = (e) => setVolume(Number(e.detail));
    window.addEventListener(SOUNDTRACK_VOLUME_EVENT, onChange);
    return () => window.removeEventListener(SOUNDTRACK_VOLUME_EVENT, onChange);
  }, []);

  const update = useCallback((nextVol) => {
    writeSoundtrackVolume(Number(nextVol));
  }, []);

  return [volume, update];
}

const HERO_ACTION_COLORS = {
  blue: {
    rgb: "59, 130, 246",
    secondary: "147, 197, 253",
    glow: "rgba(59, 130, 246, 0.5)",
  },
  red: {
    rgb: "239, 68, 68",
    secondary: "252, 165, 165",
    glow: "rgba(239, 68, 68, 0.5)",
  },
  yellow: {
    rgb: "234, 179, 8",
    secondary: "253, 224, 71",
    glow: "rgba(234, 179, 8, 0.5)",
  },
  green: {
    rgb: "34, 197, 94",
    secondary: "134, 239, 172",
    glow: "rgba(34, 197, 94, 0.5)",
  },
};

function HeroActionButton({
  children,
  active = false,
  activeColor = "blue",
  disabled = false,
  loading = false,
  solid = false,
  title,
  onClick,
  className = "",
}) {
  const colors = HERO_ACTION_COLORS[activeColor] || HERO_ACTION_COLORS.blue;
  const [ripples, setRipples] = useState([]);

  const handleClick = (event) => {
    if (disabled || loading) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setRipples((prev) => [
      ...prev,
      {
        id,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
    ]);

    window.setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
    }, 620);

    onClick?.(event);
  };

  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      disabled={disabled || loading}
      data-hero-action-button="true"
      onClick={handleClick}
      className={`group/hero-action relative isolate flex h-9 w-9 items-center justify-center overflow-visible rounded-full border border-white/10 bg-black/20 bg-gradient-to-br from-white/10 via-white/[0.02] to-black/40 text-white backdrop-blur-[50px] transition-[scale,background-color,color,box-shadow,border-color] duration-300 ease-out hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 cursor-default disabled:opacity-60 sm:h-10 sm:w-10 [&_svg]:h-5 [&_svg]:w-5 ${className}`}
      style={{
        containerType: "inline-size",
        backgroundColor:
          solid && !disabled
            ? "#fff"
            : active && !disabled
              ? `rgba(${colors.rgb}, 0.3)`
              : undefined,
        backgroundImage: solid && !disabled ? "none" : undefined,
        color:
          solid && !disabled
            ? "#000"
            : active && !disabled
              ? `rgb(${colors.secondary})`
              : undefined,
        boxShadow:
          solid && !disabled
            ? "inset 0 1.5px 2px rgba(255,255,255,0.15), 0 10px 30px -10px rgba(255,255,255,0.55)"
            : active && !disabled
              ? `inset 0 1.5px 2px rgba(255,255,255,0.15), 0 0 20px ${colors.glow}`
              : "inset 0 1.5px 2px rgba(255,255,255,0.15), 0 10px 30px -10px rgba(0,0,0,0.5)",
      }}
    >
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <span
          className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover/hero-action:opacity-100"
          style={{
            background: `linear-gradient(135deg, rgba(${colors.secondary}, 0.22), transparent 42%, rgba(${colors.rgb}, 0.14), transparent 78%)`,
            animation:
              active && !loading
                ? "heroLiquidShine 3s ease-in-out infinite"
                : undefined,
          }}
        />
        <span
          className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 group-hover/hero-action:opacity-60"
          style={{
            border: `2px solid rgb(${colors.rgb})`,
            animation:
              active && !loading
                ? "heroLiquidPulse 2s ease-in-out infinite"
                : undefined,
          }}
        />
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: ripple.x,
              top: ripple.y,
              background: `rgba(${colors.secondary}, 0.65)`,
              animation: "heroActionRipple 620ms ease-out forwards",
            }}
          />
        ))}
      </span>

      <span className="relative z-10 flex h-full w-full items-center justify-center">
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          children
        )}
      </span>

      <style jsx>{`
        @keyframes heroLiquidShine {
          0%,
          100% {
            transform: translateX(-100%) translateY(-100%) rotate(0deg);
            opacity: 0;
          }
          50% {
            transform: translateX(100%) translateY(100%) rotate(180deg);
            opacity: 1;
          }
        }

        @keyframes heroLiquidPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.7;
          }
        }

        @keyframes heroActionRipple {
          from {
            opacity: 0.75;
            scale: 0;
          }
          to {
            opacity: 0;
            scale: 16;
          }
        }
      `}</style>
    </button>
  );
}

/* ====================================================================
 * Slide individual del hero a pantalla completa
 * ==================================================================== */
function FeaturedSlide({
  movie,
  backdropPath,
  posterPath,
  logoPath,
  isActive,
  isMobile,
  shouldLoadMedia,
  onTrailerVisibilityChange,
  onSoundtrackInteractionChange,
  soundtrackVisible,
  soundtrackPreferenceReady,
  toggleSoundtrackVisible,
}) {
  const { session, account } = useAuth();
  const router = useRouter();

  const mediaType = getMediaTypeForItem(movie);
  const href = `/details/${mediaType}/${movie.id}`;

  const [extras, setExtras] = useState({
    runtime: null,
    imdbRating: null,
    awards: null,
  });
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [watched, setWatched] = useState(false);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [loadedBackdropSrc, setLoadedBackdropSrc] = useState("");
  const trailerIframeRef = useRef(null);

  // Soundtrack: suena por defecto al mostrar el título; su visibilidad y el
  // silencio se conservan como preferencias globales para todos los FeaturedHero.
  const [soundtrackMuted, , setSoundtrackMuted] = useSoundtrackMuted();
  const [soundtrackVolume, setSoundtrackVolume] = useSoundtrackVolume();
  const [soundtrackTracks, setSoundtrackTracks] = useState([]);
  const [soundtrackTrack, setSoundtrackTrack] = useState(null);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const [soundtrackProgress, setSoundtrackProgress] = useState(0);
  const [soundtrackDuration, setSoundtrackDuration] = useState(0);
  const audioRef = useRef(null);

  // Caso concreto: algunos logos son oscuros (texto/arte casi negro) y NO se leen
  // sobre el fondo oscuro de la sección de información. SOLO en ese caso los
  // pasamos a blanco. Detectamos la oscuridad muestreando la luminancia media de
  // los píxeles opacos de una versión pequeña del logo (TMDb permite CORS para
  // leer el canvas). Si no es oscuro, no se toca nada.
  const [logoIsDark, setLogoIsDark] = useState(false);
  useEffect(() => {
    setLogoIsDark(false);
    if (!logoPath || typeof document === "undefined") return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let lumSum = 0;
        let opaque = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue; // ignora píxeles transparentes
          lumSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          opaque += 1;
        }
        if (opaque < size * size * 0.02) return; // logo casi vacío: no tocar
        if (!cancelled) setLogoIsDark(lumSum / opaque < 75); // 0-255; <75 = oscuro
      } catch {
        // canvas "tainted" u otro error: dejamos el logo tal cual
      }
    };
    img.src = buildImg(logoPath, "w185");
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  // Prioridad de carga: backdrop/póster/logo + interactividad primero. Las
  // cargas secundarias (soundtrack, duración/notas) se difieren a un hueco de
  // inactividad para no competir por la red ni bloquear el hilo principal
  // durante la animación de entrada.
  const [secondaryReady, setSecondaryReady] = useState(false);
  useEffect(() => {
    if (!isActive) {
      setSecondaryReady(false);
      return;
    }
    const ric =
      typeof window !== "undefined" && window.requestIdleCallback
        ? window.requestIdleCallback
        : (cb) => window.setTimeout(() => cb(), 250);
    const cic =
      typeof window !== "undefined" && window.cancelIdleCallback
        ? window.cancelIdleCallback
        : (id) => window.clearTimeout(id);
    const id = ric(() => setSecondaryReady(true), { timeout: 1500 });
    return () => cic(id);
  }, [isActive]);

  // Al dejar de ser el slide activo, cerramos el trailer.
  useEffect(() => {
    if (isActive) return;
    setShowTrailer(false);
    onTrailerVisibilityChange?.(false);
  }, [isActive, onTrailerVisibilityChange]);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    onTrailerVisibilityChange?.(false);
  }, [movie?.id, onTrailerVisibilityChange]);

  // Carga la mejor pista del soundtrack (preview) del título activo.
  useEffect(() => {
    let abort = false;
    if (
      !isActive ||
      !secondaryReady ||
      !movie?.id ||
      !soundtrackPreferenceReady ||
      !soundtrackVisible ||
      isMobile
    )
      return;
    setSoundtrackTracks([]);
    setSoundtrackTrack(null);
    setSoundtrackPlaying(false);
    setSoundtrackProgress(0);
    setSoundtrackDuration(0);

    const load = async () => {
      try {
        const baseTitle = movie.title || movie.name || "";
        const params = new URLSearchParams({
          title: baseTitle,
          type: mediaType === "tv" ? "tv" : "movie",
          country: "ES",
        });
        const original = movie.original_title || movie.original_name;
        if (original && original !== baseTitle) {
          params.set("originalTitle", original);
        }
        const year = yearOf(movie);
        if (year) params.set("year", String(year));
        params.set("tmdbId", String(movie.id));

        const res = await fetch(`/api/soundtrack?${params.toString()}`, {
          priority: "low",
        });
        if (!res.ok) return;
        const data = await res.json();
        const tracks = Array.isArray(data?.tracks) ? data.tracks : [];
        const playableTracks = tracks
          .filter((track) => track?.previewUrl)
          .map((track, index) => ({
            ...track,
            id:
              track.id ||
              track.isrc ||
              `${track.previewUrl}-${index}`,
            trackName: track.trackName || track.name || "",
            artistName: track.artistName || "",
            artworkUrl: track.artworkUrl || "",
          }));
        if (!abort && playableTracks.length > 0) {
          setSoundtrackTracks(playableTracks);
          setSoundtrackTrack(playableTracks[0]);
        }
      } catch {
        // silencio
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [
    isActive,
    secondaryReady,
    movie,
    mediaType,
    soundtrackPreferenceReady,
    soundtrackVisible,
    isMobile,
  ]);

  // Reproduce el soundtrack cuando el título está activo, no está silenciado y
  // no se está viendo el trailer (que tiene su propio audio). Si el navegador
  // bloquea el autoplay con sonido, arranca tras la primera interacción.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const shouldPlay =
      isActive &&
      !showTrailer &&
      soundtrackPreferenceReady &&
      soundtrackVisible &&
      !soundtrackMuted &&
      !!soundtrackTrack &&
      !isMobile;
    audio.muted = !soundtrackVisible || soundtrackMuted || isMobile;

    if (!shouldPlay) {
      audio.pause();
      return;
    }

    let unlock = null;

    const play = () =>
      audio.play().catch(() => {
        if (unlock) return;
        unlock = () => {
          audio.play().catch(() => {});
          window.removeEventListener("pointerdown", unlock);
          window.removeEventListener("keydown", unlock);
          unlock = null;
        };
        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
      });

    play();

    return () => {
      if (unlock) {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        unlock = null;
      }
    };
  }, [
    isActive,
    showTrailer,
    soundtrackMuted,
    soundtrackPreferenceReady,
    soundtrackVisible,
    soundtrackTrack,
    isMobile,
  ]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = soundtrackVolume;
  }, [soundtrackTrack, soundtrackVolume]);

  const soundtrackTrackIndex = soundtrackTrack
    ? soundtrackTracks.findIndex(
        (track) => track.id === soundtrackTrack.id,
      )
    : -1;
  const soundtrackHasPrevious = soundtrackTrackIndex > 0;
  const soundtrackHasNext =
    soundtrackTrackIndex >= 0 &&
    soundtrackTrackIndex < soundtrackTracks.length - 1;

  const selectSoundtrackTrack = (nextTrack) => {
    if (!nextTrack) return;
    setSoundtrackProgress(0);
    setSoundtrackDuration(0);
    setSoundtrackTrack(nextTrack);
  };

  const handleSoundtrackPrevious = () => {
    if (!soundtrackHasPrevious) return;
    selectSoundtrackTrack(soundtrackTracks[soundtrackTrackIndex - 1]);
  };

  const handleSoundtrackNext = () => {
    if (!soundtrackHasNext) return;
    selectSoundtrackTrack(soundtrackTracks[soundtrackTrackIndex + 1]);
  };

  const handleSoundtrackTogglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (soundtrackMuted) {
      setSoundtrackMuted(false);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  };

  const handleSoundtrackSeek = (event) => {
    const nextTime = Number(event.target.value);
    if (!audioRef.current || !Number.isFinite(nextTime)) return;
    audioRef.current.currentTime = nextTime;
    setSoundtrackProgress(nextTime);
  };

  const handleSoundtrackVolumeChange = (event) => {
    const nextVolume = Number(event.target.value);
    if (!Number.isFinite(nextVolume)) return;
    const clampedVolume = Math.min(1, Math.max(0, nextVolume));
    setSoundtrackVolume(clampedVolume);
    setSoundtrackMuted(clampedVolume === 0);
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
      audioRef.current.muted = clampedVolume === 0;
    }
  };

  const handleSoundtrackToggleMute = () => {
    if (soundtrackMuted || soundtrackVolume === 0) {
      if (soundtrackVolume === 0) {
        setSoundtrackVolume(DEFAULT_SOUNDTRACK_VOLUME);
      }
      setSoundtrackMuted(false);
      return;
    }
    setSoundtrackMuted(true);
  };

  const handleSoundtrackEnded = () => {
    if (soundtrackHasNext) {
      handleSoundtrackNext();
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setSoundtrackProgress(0);
    if (
      isActive &&
      !showTrailer &&
      soundtrackPreferenceReady &&
      soundtrackVisible &&
      !soundtrackMuted &&
      !isMobile
    ) {
      audio.play().catch(() => setSoundtrackPlaying(false));
    }
  };

  // Estado de cuenta (favorito/pendiente/visto). El backend devuelve los tres
  // estados en una sola llamada (igual que DetailsClient), con source "backend".
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!isActive || !movie || !account?.id) {
        setFavorite(false);
        setWatchlist(false);
        setWatched(false);
        return;
      }
      // Al cambiar de título reseteamos a estado neutro (sin spinner de carga) y
      // solo pintamos la versión final de los botones cuando llega la respuesta.
      setFavorite(false);
      setWatchlist(false);
      setWatched(false);
      try {
        // Estado leído del backend/BBDD propio (nunca Trakt).
        const status = await getBackendItemStatus({
          type: mediaType,
          tmdbId: movie.id,
        }).catch(() => null);
        if (!cancel && status) {
          setFavorite(!!status.favorite);
          setWatchlist(!!status.watchlist);
          setWatched(!!status.watched);
        }
      } catch {
        // silencio
      }
    };
    load();
    return () => {
      cancel = true;
    };
  }, [isActive, movie, account, mediaType]);

  // Extras: duración/temporadas + nota IMDb
  useEffect(() => {
    let abort = false;
    if (!isActive || !secondaryReady || !movie) return;

    const load = async () => {
      try {
        let runtime = null;
        let imdbId = movie?.imdb_id || null;

        if (mediaType === "movie") {
          const details = await getMovieDetails(movie.id).catch(() => null);
          runtime = details?.runtime ? formatRuntime(details.runtime) : null;
        } else {
          const r = await fetch(
            `https://api.themoviedb.org/3/tv/${movie.id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
          ).catch(() => null);
          if (r?.ok) {
            const d = await r.json();
            if (d?.number_of_seasons) {
              runtime = `${d.number_of_seasons} Temp.`;
              if (d.number_of_episodes)
                runtime += ` · ${d.number_of_episodes} Eps.`;
            }
          }
        }

        let imdbRating = null;
        let awards = null;
        try {
          if (!imdbId) {
            const ext = await getExternalIds(mediaType, movie.id);
            imdbId = ext?.imdb_id || null;
          }
          if (imdbId) {
            // Mismo origen que la sección de información del spotlight: OMDb para
            // premios + IMDb para la nota.
            const [omdb, ds] = await Promise.all([
              fetchOmdbByImdb(imdbId).catch(() => null),
              fetchImdbRatingByImdb(imdbId).catch(() => null),
            ]);
            if (typeof ds?.rating === "number") imdbRating = ds.rating;
            const rawAwards = omdb?.Awards;
            if (
              rawAwards &&
              typeof rawAwards === "string" &&
              rawAwards.trim()
            ) {
              awards = formatDashboardAwards(rawAwards);
            }
          }
        } catch { }

        if (!abort) setExtras({ runtime, imdbRating, awards });
      } catch {
        if (!abort)
          setExtras({ runtime: null, imdbRating: null, awards: null });
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [isActive, secondaryReady, movie, mediaType]);

  const requireLogin = () => {
    if (!session || !account?.id) {
      window.location.href = `/login?next=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
      return true;
    }
    return false;
  };

  const navigateToDetails = () => router.push(href);

  const handleToggleTrailer = async (e) => {
    e.stopPropagation();
    if (showTrailer) {
      setShowTrailer(false);
      onTrailerVisibilityChange?.(false);
      return;
    }
    try {
      setTrailerLoading(true);
      setError("");
      const t = await getBestTrailerCached(movie.id, mediaType);
      if (!t?.key) {
        setError("No hay trailer disponible.");
        return;
      }
      setTrailer(t);
      setShowTrailer(true);
      onTrailerVisibilityChange?.(true);
    } catch {
      setError("No se pudo cargar el trailer.");
    } finally {
      setTrailerLoading(false);
    }
  };

  const handleToggleFavorite = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating) return;
    const next = !favorite;
    setUpdating("favorite");
    setFavorite(next);
    try {
      await markAsFavorite({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        favorite: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
      });
    } catch {
      setFavorite((v) => !v);
      setError("No se pudo actualizar favoritos.");
    } finally {
      setUpdating("");
    }
  };

  const handleToggleWatchlist = async (e) => {
    e.stopPropagation();
    if (requireLogin() || updating) return;
    const next = !watchlist;
    setUpdating("watchlist");
    setWatchlist(next);
    try {
      await markInWatchlist({
        accountId: account.id,
        sessionId: session,
        type: mediaType,
        mediaId: movie.id,
        watchlist: next,
        title: movie.title || movie.name,
        posterPath: movie.poster_path || movie.backdrop_path || null,
      });
    } catch {
      setWatchlist((v) => !v);
      setError("No se pudo actualizar pendientes.");
    } finally {
      setUpdating("");
    }
  };

  const genresList = useMemo(() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    const limit = isMobile ? 2 : 3;
    return ids
      .map((id) => GENRES[id])
      .filter(Boolean)
      .slice(0, limit);
  }, [movie, isMobile]);

  const posterSrc = posterPath
    ? buildImg(posterPath, HERO_POSTER_SIZE)
    : null;
  const backdropSrc = backdropPath
    ? buildImg(backdropPath, HERO_BACKDROP_SIZE)
    : null;
  const maxBackdropSrc = backdropPath
    ? buildImg(backdropPath, HERO_BACKDROP_MAX_SIZE)
    : null;
  const bgSrc = isMobile ? posterSrc : backdropSrc;
  const logoSrc = logoPath ? buildImg(logoPath, "original") : null;
  const title = movie.title || movie.name || "";
  const overview =
    typeof movie.overview === "string" && movie.overview.trim()
      ? movie.overview.trim()
      : "";

  const trailerSrc = trailer?.key
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}` +
    `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
    `&controls=0&iv_load_policy=3&disablekb=1&fs=0&enablejsapi=1` +
    `&vq=${YOUTUBE_QUALITY_HINT}&hd=1` + // pista de máxima calidad
    `&origin=${typeof window !== "undefined"
      ? encodeURIComponent(window.location.origin)
      : ""
    }`
    : null;

  return (
    <div
      className="relative w-full h-full bg-black cursor-pointer sm:absolute sm:inset-0 sm:h-full sm:w-full sm:block select-none"
      onClick={navigateToDetails}
    >
      {/* Fondo/Poster: en móvil se muestra arriba (relative), en escritorio de fondo (absolute) */}
      <div className="relative w-full aspect-[2/3] sm:absolute sm:inset-0 sm:aspect-auto sm:h-full">
        {!showTrailer && shouldLoadMedia && bgSrc && (
          <div
            key={bgSrc}
            className={`hero-backdrop-reveal absolute inset-0 ${
              isMobile
                ? "hero-backdrop-reveal-mobile"
                : "hero-backdrop-reveal-desktop"
            } ${loadedBackdropSrc === bgSrc ? "hero-backdrop-ready" : "hero-backdrop-loading"}`}
          >
            <picture className="absolute inset-0 block h-full w-full">
              {posterSrc && (
                <source media="(max-width: 639px)" srcSet={posterSrc} />
              )}
              {maxBackdropSrc && (
                <source
                  media="(min-width: 1440px), (min-resolution: 1.5dppx)"
                  srcSet={maxBackdropSrc}
                />
              )}
              {backdropSrc && (
                <source media="(min-width: 640px)" srcSet={backdropSrc} />
              )}
              {/* La selección responsive requiere <picture>; Next Image está
                  configurado como unoptimized y no generaría srcset. */}
              <img
                src={bgSrc}
                alt={title}
                width={isMobile ? 780 : 1280}
                height={isMobile ? 1170 : 720}
                loading="eager"
                decoding="async"
                fetchPriority={isActive ? "high" : "low"}
                onLoad={() => setLoadedBackdropSrc(bgSrc)}
                className={`absolute inset-0 h-full w-full ${
                  isMobile
                    ? "object-contain object-top"
                    : "object-contain object-right"
                }`}
                // Fundido mínimo en el borde inferior de la propia imagen para
                // que su corte nunca sea una línea dura durante la carga.
                style={
                  isMobile
                    ? {
                        WebkitMaskImage:
                          "linear-gradient(to bottom, black 90%, transparent 100%)",
                        maskImage:
                          "linear-gradient(to bottom, black 90%, transparent 100%)",
                      }
                    : {
                        WebkitMaskImage:
                          "linear-gradient(to bottom, black 92%, transparent 100%)",
                        maskImage:
                          "linear-gradient(to bottom, black 92%, transparent 100%)",
                      }
                }
              />
            </picture>
          </div>
        )}

        {showTrailer && (
          <>
            {(trailerLoading || !trailerSrc) && (
              <div className="absolute inset-0 animate-pulse bg-neutral-900" />
            )}
            {trailerSrc && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-y-0 right-0 aspect-video h-full max-w-full overflow-hidden">
                  <iframe
                    key={trailer.key}
                    ref={trailerIframeRef}
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[116%] w-[116%] -translate-x-1/2 -translate-y-1/2"
                    src={trailerSrc}
                    title={`Trailer - ${title}`}
                    width="3840"
                    height="2160"
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
                        const requestBestQuality = () => {
                          cmd("unMute");
                          cmd("setVolume", [25]);
                          // Pide la máxima resolución disponible; YouTube ajusta
                          // al mejor nivel real que tenga cada trailer.
                          cmd("setPlaybackQualityRange", [
                            YOUTUBE_QUALITY_MIN,
                            YOUTUBE_QUALITY_HINT,
                          ]);
                          cmd("setPlaybackQuality", [YOUTUBE_QUALITY_HINT]);
                        };
                        YOUTUBE_QUALITY_RETRY_DELAYS.forEach((delay) => {
                          setTimeout(requestBestQuality, delay);
                        });
                      } catch { }
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Difuminado lateral izquierdo (solo escritorio): oscurece la zona de
          logo/información/botones, fundiéndose hacia el centro-derecha. */}
      <div
        className="pointer-events-none absolute inset-0 hidden sm:block transition-opacity duration-500"
        style={{
          background: showTrailer
            ? // Al reproducir el trailer el difuminado lateral se recoge para
              // mostrar más parte del vídeo (termina antes, ~62%).
              "linear-gradient(to right," +
              " #000 0%," +
              " rgba(0,0,0,0.9) 12%," +
              " rgba(0,0,0,0.62) 24%," +
              " rgba(0,0,0,0.36) 34%," +
              " rgba(0,0,0,0.18) 44%," +
              " rgba(0,0,0,0.06) 54%," +
              " transparent 62%)"
            : "linear-gradient(to right," +
              " #000 0%," +
              " rgba(0,0,0,0.93) 16%," +
              " rgba(0,0,0,0.74) 30%," +
              " rgba(0,0,0,0.52) 42%," +
              " rgba(0,0,0,0.32) 52%," +
              " rgba(0,0,0,0.17) 62%," +
              " rgba(0,0,0,0.07) 70%," +
              " rgba(0,0,0,0.02) 78%," +
              " transparent 86%)",
        }}
      />

      {/* Tapa-hueco lateral izquierdo (solo escritorio): el backdrop es
          object-contain object-right, así que al ensanchar la ventana queda un
          hueco a la izquierda cuyo tamaño = 100% - anchoImagen, donde
          anchoImagen = alto máximo del hero * 16/9. Este panel negro cubre
          SIEMPRE ese hueco (+2rem de margen) y se funde 14rem dentro de la
          imagen, escalando con el ancho de la ventana para que el borde
          izquierdo del backdrop no sea visible nunca. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 hidden sm:block"
        style={{
          width:
            "calc(100% - var(--hero-desktop-max-height, 88dvh) * 16 / 9 + 42rem)",
          background:
            "linear-gradient(to right," +
            " #000 0%," +
            " #000 calc(100% - 40rem)," +
            " rgba(0,0,0,0.88) calc(100% - 34rem)," +
            " rgba(0,0,0,0.72) calc(100% - 28rem)," +
            " rgba(0,0,0,0.56) calc(100% - 23rem)," +
            " rgba(0,0,0,0.42) calc(100% - 18rem)," +
            " rgba(0,0,0,0.29) calc(100% - 14rem)," +
            " rgba(0,0,0,0.19) calc(100% - 10rem)," +
            " rgba(0,0,0,0.11) calc(100% - 7rem)," +
            " rgba(0,0,0,0.055) calc(100% - 4.5rem)," +
            " rgba(0,0,0,0.022) calc(100% - 2.5rem)," +
            " rgba(0,0,0,0.006) calc(100% - 1rem)," +
            " transparent 100%)",
        }}
      />

      {/* Difuminado inferior (solo escritorio): negro sólido en el borde para
          ocultar el corte de la imagen contra el fin de FeaturedHero, fundiendo
          suavemente hacia arriba y cubriendo los puntos indicadores. */}
      <div
        className="pointer-events-none absolute inset-x-0 -bottom-px hidden h-[22%] sm:block"
        style={{
          background:
            "linear-gradient(to top, #000 0%, rgba(0,0,0,0.85) 14%, rgba(0,0,0,0.4) 46%, transparent 100%)",
        }}
      />

      {/* Contenido: relativo debajo en móvil, absoluto en escritorio */}
      <div className="absolute bottom-0 left-0 right-0 z-10 w-full bg-gradient-to-t from-black via-black/95 to-transparent px-7 pb-8 pt-12 sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-none sm:px-20 sm:pb-28 lg:px-40 lg:pb-32 sm:pt-0">
        <div className="flex max-w-full flex-col items-center text-center sm:block sm:max-w-xl sm:text-left">
            {/* Solo el logo del título; no se muestra el título en texto. */}
            {logoSrc && (
              <div
                className="hero-reveal hero-logo-reveal relative mb-5 h-24 w-[72%] max-w-[17rem] sm:mb-8 sm:h-48 sm:max-w-xl lg:h-56 lg:max-w-2xl"
                style={{ "--hero-delay": "80ms" }}
              >
                <NextImage
                  src={logoSrc}
                  alt={title}
                  fill
                  sizes="(min-width:1024px) 580px, (min-width:640px) 510px, 72vw"
                  className="object-contain object-center sm:object-left"
                  style={{
                    // SOLO si el logo es oscuro lo pasamos a blanco para que sea
                    // legible sobre el fondo oscuro; si no, sombra normal.
                    filter: logoIsDark
                      ? "brightness(0) invert(1) drop-shadow(0 3px 12px rgba(0,0,0,0.7))"
                      : "drop-shadow(0 4px 20px rgba(0,0,0,0.8))",
                  }}
                />
              </div>
            )}

            {/* Botones de acción ARRIBA (sobre los datos y puntuaciones).
                Contenedor relativo: el indicador "ahora sonando" se posiciona de
                forma absoluta debajo para no desplazar la información. */}
            <div className="relative mb-4 w-full sm:mb-6 sm:w-auto">
            <div
              className="hero-reveal flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:justify-start sm:gap-3"
              style={{ "--hero-delay": "130ms" }}
            >
              {/* Píldora "Ver trailer" — mismo diseño que la sección de
                  información del spotlight (×1,6): blanca, icono + texto. */}
              <button
                type="button"
                onClick={handleToggleTrailer}
                disabled={trailerLoading}
                aria-label={showTrailer ? "Cerrar trailer" : "Ver trailer"}
                className="featured-info-button inline-flex min-h-11 cursor-default items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-black shadow-[0_10px_30px_-12px_rgba(255,255,255,0.8)] transition hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:min-h-12 sm:px-5 sm:text-base"
              >
                {showTrailer ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 fill-current" />
                )}
                <span>{showTrailer ? "Cerrar" : "Ver trailer"}</span>
              </button>

              {/* Botones de acción: MISMO diseño liquid glass que la sección
                  spotlight (componente LiquidButton). */}
              <LiquidButton
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSoundtrackVisible();
                }}
                disabled={!soundtrackPreferenceReady}
                active={soundtrackPreferenceReady && soundtrackVisible}
                aria-pressed={soundtrackVisible}
                activeColor="yellow"
                groupId="featured-hero-actions"
                title={
                  soundtrackVisible ? "Ocultar soundtrack" : "Mostrar soundtrack"
                }
                className={`!h-11 !w-11 sm:!h-12 sm:!w-12 [&_svg]:!h-6 [&_svg]:!w-6 ${
                  soundtrackPreferenceReady ? "" : "invisible pointer-events-none"
                }`}
              >
                {soundtrackVisible ? <Volume2 /> : <VolumeX />}
              </LiquidButton>

              {!isMobile &&
                soundtrackVisible &&
                soundtrackTrack?.previewUrl && (
                  <audio
                    ref={audioRef}
                    src={soundtrackTrack.previewUrl}
                    preload="metadata"
                    aria-hidden="true"
                    className="hidden"
                    onTimeUpdate={(event) =>
                      setSoundtrackProgress(event.currentTarget.currentTime)
                    }
                    onLoadedMetadata={(event) => {
                      event.currentTarget.volume = soundtrackVolume;
                      event.currentTarget.muted =
                        !soundtrackVisible || soundtrackMuted || isMobile;
                      setSoundtrackDuration(event.currentTarget.duration || 0);
                    }}
                    onDurationChange={(event) =>
                      setSoundtrackDuration(event.currentTarget.duration || 0)
                    }
                    onEnded={handleSoundtrackEnded}
                    onPlay={() => setSoundtrackPlaying(true)}
                    onPause={() => setSoundtrackPlaying(false)}
                  />
                )}

              <LiquidButton
                onClick={handleToggleFavorite}
                loading={updating === "favorite"}
                active={favorite}
                activeColor="red"
                groupId="featured-hero-actions"
                title={favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
                className="!h-11 !w-11 sm:!h-12 sm:!w-12 [&_svg]:!h-6 [&_svg]:!w-6"
              >
                <Heart className={favorite ? "fill-current" : ""} />
              </LiquidButton>

              <LiquidButton
                onClick={handleToggleWatchlist}
                loading={updating === "watchlist"}
                active={watchlist}
                activeColor="blue"
                groupId="featured-hero-actions"
                title={watchlist ? "Quitar de pendientes" : "Añadir a pendientes"}
                className="!h-11 !w-11 sm:!h-12 sm:!w-12 [&_svg]:!h-6 [&_svg]:!w-6"
              >
                <BookmarkPlus className={watchlist ? "fill-current" : ""} />
              </LiquidButton>

              {/* Indicador de visionado: solo informativo. No se puede accionar
                  desde aquí para evitar borrar el historial de visionado con un
                  único clic. */}
              <LiquidButton
                active={watched}
                activeColor="green"
                groupId="featured-hero-actions"
                title={watched ? "Visto" : "No visto"}
                className="pointer-events-none !h-11 !w-11 sm:!h-12 sm:!w-12 [&_svg]:!h-6 [&_svg]:!w-6"
              >
                {watched ? <Eye /> : <EyeOff />}
              </LiquidButton>
            </div>
            </div>

            {/* Premios — mismo estilo que el spotlight (icono + texto esmeralda),
                situado sobre los metadatos. */}
            {extras.awards && (
              <div
                className="hero-reveal mb-2 flex items-center justify-center gap-2 text-xs font-bold text-emerald-300 drop-shadow-md sm:mb-2.5 sm:justify-start sm:text-sm"
                style={{ "--hero-delay": "140ms" }}
              >
                <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">{extras.awards}</span>
              </div>
            )}

            {/* Metadatos — MISMO estilo que la sección de información de las
                tarjetas ×1,6 (DashboardSpotlightPreview): fila 1 con badge
                "Mejor valorado" + tipo + año + duración; fila 2 con géneros +
                puntuaciones, tipografía/colores (zinc). Se conservan la
                animación de entrada del hero, la alineación (centro en móvil,
                izquierda en escritorio) y la ubicación del bloque. */}
            <div
              className="hero-reveal mb-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs font-semibold text-zinc-200 sm:mb-2.5 sm:justify-start sm:text-sm"
              style={{ "--hero-delay": "170ms" }}
            >
              {Number(ratingOf(movie)) >= 7.5 && (
                <span className="mr-1 rounded bg-white px-1.5 py-0.5 text-[0.72rem] font-black uppercase tracking-wide text-black sm:text-[0.8rem]">
                  Mejor valorado
                </span>
              )}
              {(() => {
                const items = [];
                items.push(<span key="type">{mediaType === "tv" ? "Serie" : "Película"}</span>);
                if (yearOf(movie)) {
                  items.push(<span key="year">{yearOf(movie)}</span>);
                }
                if (extras.runtime) {
                  items.push(<span key="runtime">{extras.runtime}</span>);
                }
                return items.reduce((acc, item, index) => {
                  if (index === 0) return [item];
                  return [
                    ...acc,
                    <span key={`sep-${index}`} className="text-zinc-500/70 select-none font-bold text-[0.8em]" aria-hidden="true">•</span>,
                    item
                  ];
                }, []);
              })()}
            </div>

            <div
              className="hero-reveal mb-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-xs text-zinc-200 sm:mb-4 sm:justify-start sm:text-sm"
              style={{ "--hero-delay": "230ms" }}
            >
              {(() => {
                const items = [];
                if (Array.isArray(genresList)) {
                  genresList.forEach((genre, idx) => {
                    items.push(<span key={`genre-${idx}`}>{genre}</span>);
                  });
                }
                const ratings = [];
                ratings.push(
                  <span key="tmdb" className="inline-flex items-center gap-1.5">
                    <NextImage
                      src="/logo-TMDb.png"
                      alt="TMDb"
                      className="h-3 w-auto"
                      width={2560}
                      height={1846}
                      sizes="32px"
                      loading="lazy"
                    />
                    <span className="font-bold">{ratingOf(movie)}</span>
                  </span>
                );
                if (typeof extras.imdbRating === "number") {
                  ratings.push(
                    <span key="imdb" className="inline-flex items-center gap-1.5">
                      <NextImage
                        src="/logo-IMDb.svg"
                        alt="IMDb"
                        className="h-4 w-auto"
                        width={575}
                        height={290}
                        sizes="40px"
                        loading="lazy"
                      />
                      <span className="font-bold">
                        {extras.imdbRating.toFixed(1)}
                      </span>
                    </span>
                  );
                }
                items.push(
                  <span key="ratings" className="inline-flex items-center gap-x-3">
                    {ratings}
                  </span>
                );
                return items.reduce((acc, item, index) => {
                  if (index === 0) return [item];
                  return [
                    ...acc,
                    <span key={`sep-${index}`} className="text-zinc-500/70 select-none font-bold text-[0.8em]" aria-hidden="true">•</span>,
                    item
                  ];
                }, []);
              })()}
            </div>

            {overview && !isMobile && (
              <p
                className="hero-reveal mb-4 line-clamp-2 max-w-xl text-xs leading-relaxed text-neutral-200/90 sm:mb-5 sm:line-clamp-3 sm:text-base"
                style={{ "--hero-delay": "290ms" }}
              >
                {overview}
              </p>
            )}

            {error && (
              <p
                className="hero-reveal mt-2 text-xs text-red-400"
                style={{ "--hero-delay": "420ms" }}
              >
                {error}
              </p>
            )}
          </div>
      </div>

      {isActive &&
        !showTrailer &&
        soundtrackPreferenceReady &&
        soundtrackVisible &&
        soundtrackTrack &&
        !isMobile && (
          <HeroSoundtrackPlayer
            track={soundtrackTrack}
            isPlaying={soundtrackPlaying}
            progress={soundtrackProgress}
            duration={soundtrackDuration}
            volume={soundtrackVolume}
            muted={soundtrackMuted}
            position={soundtrackTrackIndex + 1}
            total={soundtrackTracks.length}
            hasPrevious={soundtrackHasPrevious}
            hasNext={soundtrackHasNext}
            onPrevious={handleSoundtrackPrevious}
            onNext={handleSoundtrackNext}
            onTogglePlayback={handleSoundtrackTogglePlayback}
            onSeek={handleSoundtrackSeek}
            onToggleMute={handleSoundtrackToggleMute}
            onVolumeChange={handleSoundtrackVolumeChange}
            onInteractionChange={onSoundtrackInteractionChange}
          />
        )}

      <style jsx>{`
        .hero-backdrop-reveal {
          opacity: 0;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
          will-change: opacity, transform, filter;
        }

        .hero-backdrop-loading {
          opacity: 0;
        }

        .hero-backdrop-ready {
          animation: heroBackdropReveal 920ms cubic-bezier(0.16, 1, 0.3, 1)
            both;
        }

        .hero-backdrop-reveal-mobile.hero-backdrop-ready {
          animation-name: heroPosterRevealMobile;
        }

        .hero-reveal {
          animation: heroContentReveal 680ms cubic-bezier(0.22, 1, 0.36, 1)
            both;
          animation-delay: var(--hero-delay, 0ms);
          transform-origin: left center;
          will-change: opacity, transform, filter;
        }

        .hero-nowplaying {
          animation: heroNowPlayingIn 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
          /* Entra después de la sección de información (los botones están a
             360ms) para no aparecer antes que el resto en la animación de
             entrada. */
          animation-delay: 440ms;
        }

        .hero-eq-bar {
          height: 35%;
          animation: heroEqualizer 900ms ease-in-out infinite;
          will-change: height;
        }

        @keyframes heroNowPlayingIn {
          from {
            opacity: 0;
            filter: blur(4px);
          }
          to {
            opacity: 1;
            filter: blur(0);
          }
        }

        @keyframes heroEqualizer {
          0%,
          100% {
            height: 28%;
          }
          50% {
            height: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-eq-bar {
            animation: none;
            height: 70%;
          }
        }

        @keyframes heroBackdropReveal {
          from {
            opacity: 0;
            transform: translate3d(18px, 0, 0) scale(1.025);
            filter: blur(10px) saturate(0.9);
          }
          55% {
            opacity: 1;
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
            filter: blur(0) saturate(1);
          }
        }

        @keyframes heroPosterRevealMobile {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0);
            filter: blur(8px) saturate(0.92);
          }
          60% {
            opacity: 1;
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0) saturate(1);
          }
        }

        .hero-logo-reveal,
        .hero-title-reveal {
          animation-name: heroTitleReveal;
        }

        @keyframes heroContentReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 18px, 0);
            filter: blur(8px);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
            filter: blur(0);
          }
        }

        @keyframes heroTitleReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 24px, 0) scale(0.96);
            filter: blur(10px);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
            filter: blur(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-backdrop-reveal,
          .hero-backdrop-loading,
          .hero-backdrop-ready,
          .hero-reveal,
          .hero-logo-reveal,
          .hero-title-reveal {
            animation: none;
            opacity: 1;
            transform: none;
            filter: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ====================================================================
 * Hero destacado a pantalla completa (carrusel)
 * ==================================================================== */
export default function FeaturedHero({
  items = [],
  isMobile,
  deferInitialBackdrop = false,
}) {
  const assetsRef = useRef({});
  const resolvingAssetsRef = useRef(new Set());
  const lastBackdropChoiceRef = useRef(new Map());
  const heroSectionRef = useRef(null);
  const pointerStartRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [assets, setAssets] = useState({}); // id -> { backdrop, backdrops, poster, logo }
  const [selectedBackdrops, setSelectedBackdrops] = useState({});
  const [isInteracting, setIsInteracting] = useState(false);
  const [soundtrackInteracting, setSoundtrackInteracting] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [scrollCueVisible, setScrollCueVisible] = useState(true);
  const [soundtrackVisible, toggleSoundtrackVisible] = useSoundtrackVisible();
  const [soundtrackPreferenceReady, setSoundtrackPreferenceReady] =
    useState(false);

  useEffect(() => {
    setSoundtrackPreferenceReady(true);
  }, []);

  const list = useMemo(
    () => (Array.isArray(items) ? items.filter((m) => m?.id) : []),
    [items],
  );

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    if (activeIndex >= list.length) setActiveIndex(0);
  }, [activeIndex, list.length]);

  useEffect(() => {
    const heroHost = heroSectionRef.current?.parentElement;
    const dashboardContent = heroHost?.nextElementSibling;
    if (!dashboardContent || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setScrollCueVisible(!entry.isIntersecting);
      },
      {
        // Oculta la ayuda cuando la siguiente sección alcanza el 75% superior
        // de la pantalla, evitando que desaparezca por un pequeño vistazo inicial.
        rootMargin: "0px 0px -25% 0px",
        threshold: 0,
      },
    );

    observer.observe(dashboardContent);
    return () => observer.disconnect();
  }, []);

  const resolveAssetsFor = useCallback(
    async (movie) => {
      if (!movie?.id) return;
      const id = movie.id;
      if (assetsRef.current[id] || resolvingAssetsRef.current.has(id)) return;

      resolvingAssetsRef.current.add(id);
      const mediaType = getMediaTypeForItem(movie);
      let backdrop = null;
      let backdrops = [];
      let poster = null;
      let logo = null;

      try {
        const { backdrop: userBackdrop } = getArtworkPreference(id);
        const primaryBackdrop =
          userBackdrop || (await fetchBestBackdropNoLang(id, mediaType));
        const secondaryBackdrop = await fetchBestBackdropNoLang(id, mediaType, {
          limit: 5,
          excludePaths: [primaryBackdrop],
        });
        backdrops = uniquePaths([
          primaryBackdrop,
          secondaryBackdrop,
          getPreviewBackdropFallback(movie),
        ]).slice(0, 2);
        backdrop = backdrops[0] || null;
      } catch {
        backdrop = getPreviewBackdropFallback(movie);
        backdrops = uniquePaths([backdrop]);
      }

      try {
        poster = await fetchBestPosterNoLang(id, mediaType);
      } catch {
        poster = null;
      }

      try {
        // Orden de preferencia: inglés → español → sin idioma → y, si no, el más
        // votado de cualquier idioma (el fetch trae logos de TODOS los idiomas,
        // así que nunca debería quedar vacío si TMDb tiene algún logo).
        logo = await fetchBestLogo(id, mediaType, ["en", "es", null]);
      } catch { }

      const backdropSignature = backdrops.join("|");
      if (deferInitialBackdrop && backdropSignature) {
        const lastIndex = lastBackdropChoiceRef.current.get(id);
        let nextIndex = 0;

        if (backdrops.length > 1) {
          nextIndex =
            typeof lastIndex === "number"
              ? lastIndex === 0
                ? 1
                : 0
              : Math.floor(Math.random() * backdrops.length);
        }

        lastBackdropChoiceRef.current.set(id, nextIndex);
        setSelectedBackdrops((prev) =>
          prev[id]?.signature === backdropSignature
            ? prev
            : {
                ...prev,
                [id]: {
                  path: backdrops[nextIndex],
                  signature: backdropSignature,
                },
              },
        );
      }

      setAssets((prev) =>
        prev[id] ? prev : { ...prev, [id]: { backdrop, backdrops, poster, logo } },
      );
      resolvingAssetsRef.current.delete(id);
    },
    [deferInitialBackdrop],
  );

  // El slide activo se resuelve inmediatamente.
  useEffect(() => {
    if (!list.length) return;
    resolveAssetsFor(list[activeIndex]);
  }, [list, activeIndex, resolveAssetsFor]);

  // Preparamos únicamente los metadatos del siguiente título cuando el
  // navegador queda libre. No descargamos su imagen, por lo que las filas del
  // dashboard conservan el ancho de banda y el siguiente cambio evita esperas
  // de selección de backdrop/logo.
  useEffect(() => {
    if (list.length <= 1) return;
    const nextMovie = list[(activeIndex + 1) % list.length];
    const prepareNext = () => resolveAssetsFor(nextMovie);

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(prepareNext, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(prepareNext, 1200);
    return () => window.clearTimeout(timer);
  }, [activeIndex, list, resolveAssetsFor]);

  const goToPrevious = useCallback(() => {
    setActiveIndex((current) =>
      current <= 0 ? list.length - 1 : current - 1,
    );
  }, [list.length]);

  const goToNext = useCallback(() => {
    setActiveIndex((current) =>
      current >= list.length - 1 ? 0 : current + 1,
    );
  }, [list.length]);

  useEffect(() => {
    if (
      list.length <= 1 ||
      isInteracting ||
      soundtrackInteracting ||
      trailerOpen
    )
      return;

    let timer;
    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        const player = heroSectionRef.current?.querySelector(
          "[data-hero-soundtrack-player]",
        );
        const playerIsActive =
          player?.matches(":hover") || player?.contains(document.activeElement);

        if (playerIsActive) {
          scheduleNext();
          return;
        }
        goToNext();
      }, HERO_AUTO_ADVANCE_MS);
    };

    scheduleNext();
    return () => window.clearTimeout(timer);
  }, [
    activeIndex,
    goToNext,
    isInteracting,
    list.length,
    soundtrackInteracting,
    trailerOpen,
  ]);

  const activeMovie = list[activeIndex] || list[0] || null;
  const activeAssets = activeMovie ? assets[activeMovie.id] || {} : {};
  const activeBackdropOptions = useMemo(() => {
    if (!activeMovie) return [];

    const resolvedBackdrops = uniquePaths([
      ...(Array.isArray(activeAssets.backdrops) ? activeAssets.backdrops : []),
      activeAssets.backdrop,
    ]);

    if (resolvedBackdrops.length > 0) return resolvedBackdrops;
    return deferInitialBackdrop
      ? []
      : uniquePaths([getPreviewBackdropFallback(activeMovie)]);
  }, [
    activeAssets.backdrop,
    activeAssets.backdrops,
    activeMovie,
    deferInitialBackdrop,
  ]);
  const activeBackdropSignature = activeBackdropOptions.join("|");
  const selectedBackdrop = activeMovie ? selectedBackdrops[activeMovie.id] : null;
  const activeBackdrop =
    selectedBackdrop?.signature === activeBackdropSignature
      ? selectedBackdrop.path
      : activeBackdropOptions[0] || null;

  useEffect(() => {
    if (
      deferInitialBackdrop ||
      !activeMovie?.id ||
      activeBackdropOptions.length === 0
    )
      return;

    const lastIndex = lastBackdropChoiceRef.current.get(activeMovie.id);
    let nextIndex = 0;

    if (activeBackdropOptions.length > 1) {
      nextIndex =
        typeof lastIndex === "number"
          ? lastIndex === 0
            ? 1
            : 0
          : Math.floor(Math.random() * activeBackdropOptions.length);
    }

    lastBackdropChoiceRef.current.set(activeMovie.id, nextIndex);
    setSelectedBackdrops((prev) => ({
      ...prev,
      [activeMovie.id]: {
        path: activeBackdropOptions[nextIndex],
        signature: activeBackdropSignature,
      },
    }));
  }, [
    activeMovie?.id,
    activeIndex,
    activeBackdropOptions,
    activeBackdropSignature,
    deferInitialBackdrop,
  ]);

  if (!list.length) return null;

  // Fallback inmediato del póster (móvil) con el dato ya disponible del servidor
  // para pintar al instante, mientras se resuelve en segundo plano el mejor.
  const activePoster =
    activeAssets.poster || activeMovie.poster_path || activeMovie.backdrop_path || null;

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    suppressClickRef.current = false;
    setIsInteracting(true);
  };

  const handlePointerMove = (event) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (
      Math.abs(dx) > HERO_SWIPE_THRESHOLD_PX &&
      Math.abs(dx) > Math.abs(dy) * 1.35
    ) {
      suppressClickRef.current = true;
      pointerStartRef.current = null;
      if (dx < 0) {
        goToNext();
      } else {
        goToPrevious();
      }
    }
  };

  const handlePointerEnd = (event) => {
    const start = pointerStartRef.current;
    if (start?.id === event.pointerId) pointerStartRef.current = null;
    window.setTimeout(() => {
      setIsInteracting(false);
    }, 120);
  };

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const scrollToDashboardContent = () => {
    const heroHost = heroSectionRef.current?.parentElement;
    const content = heroHost?.nextElementSibling;
    if (!content) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    content.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const indicators = list.length > 1 && (
    <div className="flex items-center justify-center gap-2" aria-label="Diapositivas destacadas">
      {list.map((movie, index) => (
        <button
          key={movie.id}
          type="button"
          aria-label={`Ver destacado ${index + 1}`}
          aria-current={index === activeIndex ? "true" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            setActiveIndex(index);
          }}
          className={`h-2 rounded-full transition-colors ${
            index === activeIndex
              ? "w-6 bg-amber-500"
              : "w-2 bg-white/45 hover:bg-white/70"
          }`}
        />
      ))}
    </div>
  );

  const scrollCue = (
    <button
      type="button"
      aria-label="Ver más contenido"
      aria-hidden={!scrollCueVisible}
      title="Ver más contenido"
      tabIndex={scrollCueVisible ? 0 : -1}
      onClick={scrollToDashboardContent}
      className={`group flex h-10 w-10 items-center justify-center text-white/65 transition-[color,opacity,visibility] duration-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
        scrollCueVisible
          ? "visible opacity-100"
          : "pointer-events-none invisible opacity-0"
      }`}
    >
      <span className="inline-flex translate-y-[6px] sm:translate-y-0">
        <span className="hero-scroll-cue inline-flex drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          <ChevronDown
            aria-hidden="true"
            className="h-7 w-7 transition-transform duration-300 group-hover:translate-y-0.5 sm:h-8 sm:w-8"
          />
        </span>
      </span>
    </button>
  );

  return (
    <>
      <section
        ref={heroSectionRef}
        className="featured-hero-shell relative isolate w-full touch-pan-y overflow-hidden bg-black h-[calc(100svh-7.8rem-env(safe-area-inset-bottom))] sm:h-auto sm:aspect-video sm:max-h-[var(--hero-desktop-max-height)]"
        aria-label="Contenido destacado"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onClickCapture={handleClickCapture}
      >
        <FeaturedSlide
          key={activeMovie.id}
          movie={activeMovie}
          backdropPath={activeBackdrop}
          posterPath={activePoster}
          logoPath={activeAssets.logo || null}
          isActive
          isMobile={isMobile}
          shouldLoadMedia
          onTrailerVisibilityChange={setTrailerOpen}
          onSoundtrackInteractionChange={setSoundtrackInteracting}
          soundtrackVisible={soundtrackVisible}
          soundtrackPreferenceReady={soundtrackPreferenceReady}
          toggleSoundtrackVisible={toggleSoundtrackVisible}
        />

        {/* Flechas (solo desktop) */}
        {!isMobile && list.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              onClick={(event) => {
                event.stopPropagation();
                goToPrevious();
              }}
              className="group/arrow absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
            >
              <ChevronLeft className="h-9 w-9 transition-transform duration-300 group-hover/arrow:-translate-x-0.5" />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={(event) => {
                event.stopPropagation();
                goToNext();
              }}
              className="group/arrow absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 sm:flex"
            >
              <ChevronRight className="h-9 w-9 transition-transform duration-300 group-hover/arrow:translate-x-0.5" />
            </button>
          </>
        )}

        {!isMobile && (
          <div className="absolute bottom-[3.25rem] left-1/2 z-20 -translate-x-1/2">
            {indicators && indicators}
          </div>
        )}
      </section>

      {!isMobile && (
        <div className="pointer-events-none relative z-20 hidden h-0 sm:block">
          <div className="pointer-events-auto absolute left-1/2 top-2 -translate-x-1/2">
            {scrollCue}
          </div>
        </div>
      )}

      {isMobile && (
        <div className="relative h-14 bg-black sm:hidden">
          {indicators && (
            <div className="absolute left-1/2 top-1 -translate-x-1/2">
              {indicators}
            </div>
          )}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            {scrollCue}
          </div>
        </div>
      )}

      <style jsx>{`
        .featured-hero-shell {
          --hero-desktop-max-height: 92dvh;
        }

        /* Pantallas grandes (FullHD y panorámicas): el hero ocupa casi toda la
           altura visible, dejando solo un pequeño margen inferior. Se amplía el
           rango de relación de aspecto hasta 3/1 para cubrir también monitores
           anchos/ultrapanorámicos, donde antes quedaba demasiado negro abajo. */
        @media (min-width: 100rem) and (min-height: 53.125rem) and (min-aspect-ratio: 3 / 2) and (max-aspect-ratio: 3 / 1) {
          .featured-hero-shell {
            --hero-desktop-max-height: 95dvh;
          }
        }

        .hero-scroll-cue {
          animation: heroScrollCue 1.8s cubic-bezier(0.45, 0, 0.55, 1)
            infinite;
          will-change: transform, opacity;
        }

        @keyframes heroScrollCue {
          0%,
          100% {
            opacity: 0.52;
            transform: translate3d(0, -4px, 0);
          }
          50% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-scroll-cue {
            animation: none;
            opacity: 0.8;
            transform: none;
            will-change: auto;
          }
        }
      `}</style>
    </>
  );
}
