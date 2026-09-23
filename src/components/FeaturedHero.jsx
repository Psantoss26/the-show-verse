// /src/components/FeaturedHero.jsx
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import NextImage from "next/image";
import {
  Award,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import LiquidButton from "@/components/LiquidButton";
import HeroSoundtrackPlayer from "@/components/dashboard/HeroSoundtrackPlayer";
import EpisodeRatingsModal from "@/components/details/EpisodeRatingsModal";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";

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
import { resolveFeaturedHeroPoster } from "@/lib/dashboard/featuredHeroMedia";
import DetailActionsRow from "@/components/details/DetailActionsRow";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import { traktGetItemStatus, traktSetRating } from "@/lib/api/traktClient";

import {
  buildImg,
  GENRES,
  getMediaTypeForItem,
  getPreviewBackdropFallback,
  fetchBestBackdropNoLang,
  fetchBestPosterNoLang,
  fetchBestLogo,
  getBestTrailerCached,
  yearOf,
  ratingOf,
  getSpotlightBadge,
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
// Cuánto puede moverse el dedo y seguir contando como TOQUE (abrir la ficha).
//
// Estaba en 10px, y entre ese valor y el umbral de deslizamiento (60px) quedaba
// una franja muerta: un toque que se movía 15 o 20px no era ni toque ni
// deslizamiento, así que no pasaba NADA. En una tablet eso ocurre a todas horas
// —el hero ocupa media pantalla y se pulsa con el pulgar, sin precisión—, y es lo
// que se percibía como "muchas veces no se abre". 24px es la tolerancia habitual
// de un toque táctil y sigue muy por debajo de los 60px, así que un toque y un
// deslizamiento se distinguen igual de bien. Un arrastre para hacer scroll
// recorre mucho más que esto, por lo que tampoco se confunde con un toque.
const HERO_TAP_MAX_MOVE_PX = 24;
const YOUTUBE_QUALITY_HINT = "highres";
const YOUTUBE_QUALITY_MIN = "hd1080";
const YOUTUBE_QUALITY_RETRY_DELAYS = [150, 750, 1800, 3200];

// Layout ANCHO (backdrop + información en la esquina). Misma condición que la
// variante `hero-wide:` de globals.css; lo demás (móvil y tablet en vertical)
// usa el layout móvil con póster.
const HERO_WIDE_QUERY = "(min-width: 40rem) and (min-aspect-ratio: 4 / 5)";
const HERO_MOBILE_MEDIA = `not all and ${HERO_WIDE_QUERY}`;

// Escala del bloque de información en el layout ancho. Se diseña a tamaño de
// referencia (hero de un monitor FullHD) y se escala entero con `scale`, así
// ocupa siempre la misma fracción del hero sea cual sea la pantalla, en vez de
// medir lo mismo en px en un portátil de 13" que en un monitor de 27".
// El ALTO es el límite principal (el bloque vive en la franja inferior). El
// ancho solo frena cuando el bloque empezaría a comerse el centro de la
// imagen: con 1700 el bloque (más su margen) se queda en ~40% del ancho. Así,
// en un hero estrecho pero alto (ventana partida, panel lateral acoplado) no
// se encoge tanto como si también fuera bajo.
const HERO_UI_REF_WIDTH = 1700;
const HERO_UI_REF_HEIGHT = 1080;
const HERO_UI_MIN_SCALE = 0.6;
// Con puntero táctil (tablet en horizontal) no se baja de aquí para que los
// botones sigan siendo cómodos de pulsar.
const HERO_UI_MIN_SCALE_TOUCH = 0.66;
const HERO_UI_MAX_SCALE = 1.1;
// Alto de hero por debajo del cual los mínimos anteriores se relajan.
const HERO_UI_MIN_FIT_HEIGHT = 700;

function subscribeHeroWide(onChange) {
  const mq = window.matchMedia(HERO_WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useHeroMobileLayout() {
  return useSyncExternalStore(
    subscribeHeroWide,
    () => !window.matchMedia(HERO_WIDE_QUERY).matches,
    () => false,
  );
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

/* =================== PREFERENCIA GLOBAL DE SOUNDTRACK ===================
 * El soundtrack del Hero está SILENCIADO por defecto. Si el usuario activa el
 * sonido con el botón de volumen, la elección se guarda y aplica a TODOS los
 * FeaturedHero (y lo mismo si después lo vuelve a silenciar).
 */
const SOUNDTRACK_MUTED_KEY = "showverse:hero:soundtrack-muted";
const SOUNDTRACK_MUTED_EVENT = "showverse:hero-soundtrack-muted";

function readSoundtrackMuted() {
  if (typeof window === "undefined") return true;
  try {
    // Sin preferencia guardada ("nunca ha tocado el botón") → silenciado. Solo
    // un "0" explícito, que se guarda al activar el sonido, lo deja sonar.
    return window.localStorage.getItem(SOUNDTRACK_MUTED_KEY) !== "0";
  } catch {
    return true;
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
  // Arranca silenciado también antes de leer la preferencia: si empezara en
  // `false`, el reproductor podría sonar un instante hasta que corre el efecto.
  const [muted, setMuted] = useState(true);

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
      className={`group/hero-action relative isolate flex h-9 w-9 items-center justify-center overflow-visible rounded-full border border-white/10 bg-black/20 bg-gradient-to-br from-white/10 via-white/[0.02] to-black/40 text-white backdrop-blur-[50px] transition-[scale,background-color,color,box-shadow,border-color] duration-300 ease-out hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 cursor-default disabled:opacity-60 hero-wide:h-10 hero-wide:w-10 [&_svg]:h-5 [&_svg]:w-5 ${className}`}
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
  logoResolved,
  isActive,
  isMobile,
  shouldLoadMedia,
  onTrailerVisibilityChange,
  onEpisodeRatingsVisibilityChange,
  onSoundtrackInteractionChange,
  soundtrackVisible,
  soundtrackPreferenceReady,
  toggleSoundtrackVisible,
}) {
  const { session, account } = useAuth();
  const { openDetailModal } = useDetailModal();

  const mediaType = getMediaTypeForItem(movie);

  const [extras, setExtras] = useState({
    runtime: null,
    imdbRating: null,
    awards: null,
    status: null,
  });
  // Estado de Trakt para el control de "visto" y la puntuación (fila compartida).
  const [traktInfo, setTraktInfo] = useState({
    connected: false,
    watched: false,
    plays: 0,
    badge: null,
    loading: false,
  });
  const [rating, setRating] = useState(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [watchlist, setWatchlist] = useState(false);
  const [watched, setWatched] = useState(false);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [episodeRatingsOpen, setEpisodeRatingsOpen] = useState(false);
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
    setEpisodeRatingsOpen(false);
    onTrailerVisibilityChange?.(false);
    onEpisodeRatingsVisibilityChange?.(false);
  }, [
    isActive,
    onEpisodeRatingsVisibilityChange,
    onTrailerVisibilityChange,
  ]);

  useEffect(() => {
    setShowTrailer(false);
    setTrailer(null);
    setEpisodeRatingsOpen(false);
    onTrailerVisibilityChange?.(false);
    onEpisodeRatingsVisibilityChange?.(false);
  }, [
    movie?.id,
    onEpisodeRatingsVisibilityChange,
    onTrailerVisibilityChange,
  ]);

  // Carga la mejor pista del soundtrack (preview) del título activo.
  useEffect(() => {
    let abort = false;
    if (
      !isActive ||
      !secondaryReady ||
      !movie?.id ||
      !soundtrackPreferenceReady ||
      !soundtrackVisible
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
      !!soundtrackTrack;
    audio.muted = !soundtrackVisible || soundtrackMuted;

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
      !soundtrackMuted
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
        let status = null;
        let imdbId = movie?.imdb_id || null;

        if (mediaType === "movie") {
          const details = await getMovieDetails(movie.id).catch(() => null);
          runtime = details?.runtime ? formatRuntime(details.runtime) : null;
          status = details?.status || null;
        } else {
          const r = await fetch(
            `https://api.themoviedb.org/3/tv/${movie.id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
          ).catch(() => null);
          if (r?.ok) {
            const d = await r.json();
            status = d?.status || null;
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

        if (!abort) setExtras({ runtime, imdbRating, awards, status });
      } catch {
        if (!abort)
          setExtras({
            runtime: null,
            imdbRating: null,
            awards: null,
            status: null,
          });
      }
    };

    load();
    return () => {
      abort = true;
    };
  }, [isActive, secondaryReady, movie, mediaType]);

  // Estado de Trakt (visto/plays/puntuación) para la fila de acciones compartida.
  // Versión ligera del que usa la preview del dashboard: sin el badge de progreso
  // (%) de series para no cargar temporadas/episodios en el hero.
  useEffect(() => {
    let cancel = false;
    if (!isActive || !secondaryReady || !movie) {
      setTraktInfo({
        connected: false,
        watched: false,
        plays: 0,
        badge: null,
        loading: false,
      });
      setRating(null);
      return;
    }
    (async () => {
      try {
        setTraktInfo((prev) => ({ ...prev, loading: true }));
        setRatingLoading(true);
        const status = await traktGetItemStatus({
          type: mediaType === "tv" ? "show" : "movie",
          tmdbId: movie.id,
        });
        if (cancel) return;
        const connected = !!status?.connected;
        const ratingValue =
          status?.rating == null || !Number.isFinite(Number(status.rating))
            ? null
            : Number(status.rating);
        setRating(ratingValue);
        setRatingLoading(false);
        setTraktInfo({
          connected,
          watched: !!status?.watched,
          plays: Number(status?.plays || 0),
          badge: null,
          loading: false,
        });
      } catch {
        if (!cancel) {
          setRatingLoading(false);
          setTraktInfo((prev) => ({ ...prev, loading: false }));
        }
      }
    })();
    return () => {
      cancel = true;
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

  const openPreviewModal = () => openDetailModal?.(movie);

  // Puntuación en Trakt para el <StarRating> de la fila compartida (optimista,
  // mismo patrón que la preview del dashboard).
  const handleRate = async (value) => {
    if (!traktInfo.connected) {
      requireLogin();
      return false;
    }
    if (ratingLoading || !movie) return false;

    const previousRating = rating;
    const optimisticRating = value == null ? null : Number(value);

    try {
      setRatingLoading(true);
      setError("");
      setRating(optimisticRating);
      const res = await traktSetRating({
        type: mediaType === "tv" ? "show" : "movie",
        tmdbId: movie.id,
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

  const openEpisodeRatings = (event) => {
    event.stopPropagation();
    setEpisodeRatingsOpen(true);
    onEpisodeRatingsVisibilityChange?.(true);
  };

  const closeEpisodeRatings = () => {
    setEpisodeRatingsOpen(false);
    onEpisodeRatingsVisibilityChange?.(false);
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

  // Géneros como objetos [{id,name}] para la fila meta compartida
  // (<DetailsMetaGenresRow>), que ya limita/recorta según el ancho disponible.
  const genreObjects = useMemo(() => {
    const ids =
      movie.genre_ids ||
      (Array.isArray(movie.genres) ? movie.genres.map((g) => g.id) : []);
    return (Array.isArray(ids) ? ids : [])
      .map((id) => (GENRES[id] ? { id, name: GENRES[id] } : null))
      .filter(Boolean);
  }, [movie]);

  // Etiqueta contextual de la casilla (antes fija "MEJOR VALORADO"). Misma lógica
  // compartida que las tarjetas spotlight de los 3 dashboards (Estreno / Mejor
  // valorado / Destacado), ver getSpotlightBadge. Varía por título y solo usa
  // datos disponibles al instante, así que no parpadea ni reserva hueco de más.
  const featuredBadge = useMemo(() => getSpotlightBadge(movie), [movie]);

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
      className="relative w-full h-full bg-black hero-wide:bg-transparent cursor-pointer hero-wide:absolute hero-wide:inset-0 hero-wide:h-full hero-wide:w-full hero-wide:block select-none"
      onClick={openPreviewModal}
    >
      {/* FONDO enmascarado (solo desktop): envuelve imagen + sombras + base negra
          y las funde a TRANSPARENTE en el borde inferior con la MISMA máscara que
          la portada de DetailModal (`--sv-hero-fade`). Así, al aparecer el hover
          backdrop del dashboard detrás, el borde inferior NO se ve como un corte
          (antes fundía a negro sólido, que contra una imagen se marca).
          `contents` en móvil = sin caja (no altera el layout móvil, que muestra el
          póster en flujo relativo); en desktop es la caja absoluta enmascarada. El
          CONTENIDO (logo/botones/indicadores) queda FUERA del wrapper → nítido. */}
      <div className="contents hero-wide:absolute hero-wide:inset-0 hero-wide:block hero-wide:bg-black hero-wide:[-webkit-mask-image:var(--sv-hero-fade)] hero-wide:[mask-image:var(--sv-hero-fade)]">
      {/* Fondo/Poster: en móvil se muestra arriba (relative), en escritorio de fondo (absolute) */}
      <div
        className={`w-full ${
          showTrailer
            ? "absolute inset-0 h-full aspect-auto"
            : "relative aspect-[2/3]"
        } hero-wide:absolute hero-wide:inset-0 hero-wide:h-full hero-wide:aspect-auto`}
      >
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
                <source media={HERO_MOBILE_MEDIA} srcSet={posterSrc} />
              )}
              {maxBackdropSrc && (
                <source
                  media="(min-width: 1440px), (min-resolution: 1.5dppx)"
                  srcSet={maxBackdropSrc}
                />
              )}
              {backdropSrc && (
                <source media={HERO_WIDE_QUERY} srcSet={backdropSrc} />
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
                // Escritorio/tablet: `cover` para que el backdrop quede pegado
                // a los cuatro bordes del hero con cualquier proporción de
                // pantalla; se recorta lo que sobre, conservando la parte alta
                // (caras y sujeto suelen estar arriba del centro).
                className={`absolute inset-0 h-full w-full ${
                  isMobile
                    ? "object-contain object-top"
                    : "object-cover object-[50%_25%]"
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
              <div className="hero-trailer-reveal absolute inset-0 overflow-hidden">
                <div className="hero-trailer-viewport absolute inset-0 overflow-hidden">
                  <iframe
                    key={trailer.key}
                    ref={trailerIframeRef}
                    className="hero-trailer-iframe pointer-events-none absolute left-1/2 top-1/2 max-h-none max-w-none -translate-x-1/2 -translate-y-1/2 border-0"
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

      {/* Sombreado de la esquina inferior izquierda (solo layout ancho): oscurece
          SOLO la zona donde vive la información. Va en porcentajes del hero, y
          el bloque de información escala con el hero, así que ambos crecen y
          encogen juntos y el resto del backdrop queda limpio. */}
      <div
        className={`hero-side-shade pointer-events-none absolute inset-0 hidden hero-wide:block ${
          showTrailer ? "opacity-[0.24]" : "opacity-100"
        }`}
        style={{
          background:
            "radial-gradient(ellipse 62% 78% at 0% 100%," +
            " rgba(0,0,0,0.82) 0%," +
            " rgba(0,0,0,0.66) 30%," +
            " rgba(0,0,0,0.4) 55%," +
            " rgba(0,0,0,0.16) 78%," +
            " transparent 100%)," +
            "linear-gradient(to right," +
            " rgba(0,0,0,0.5) 0%," +
            " rgba(0,0,0,0.22) 22%," +
            " rgba(0,0,0,0.06) 38%," +
            " transparent 50%)",
        }}
      />

      </div>
      {/* Fin del FONDO enmascarado. El antiguo difuminado inferior NEGRO (que
          fundía el borde a negro sólido y por eso se marcaba como corte contra el
          hover backdrop) se sustituye por la máscara `--sv-hero-fade` del wrapper:
          ahora el borde funde a TRANSPARENTE y revela lo que hay detrás sin corte. */}

      {/* Contenido. Móvil/tablet vertical: franja inferior a todo el ancho con
          degradado. Layout ancho: bloque de ancho fijo de referencia anclado a
          la esquina inferior izquierda y escalado con --hero-ui-scale (ver
          .hero-info-panel en los estilos). */}
      <div className="hero-info-panel absolute bottom-0 left-0 right-0 z-10 w-full bg-gradient-to-t from-black via-black/95 to-transparent px-7 pb-3 pt-12">
        <div className="hero-info-inner flex max-w-full flex-col items-center text-center hero-wide:block hero-wide:text-left">
            {/* Solo el logo del título; no se muestra el título en texto. */}
            {logoSrc ? (
              <div
                className="hero-reveal hero-logo-reveal hero-info-logo relative mb-5 h-24 w-[72%] max-w-[17rem] hero-wide:mb-7 hero-wide:h-44 hero-wide:w-[74%] hero-wide:max-w-none"
                style={{ "--hero-delay": "80ms" }}
              >
                <NextImage
                  src={logoSrc}
                  alt={title}
                  fill
                  sizes="(min-width:640px) 440px, 72vw"
                  className="object-contain object-center hero-wide:object-left"
                  style={{
                    // SOLO si el logo es oscuro lo pasamos a blanco para que sea
                    // legible sobre el fondo oscuro; si no, sombra normal.
                    // Se añade un drop-shadow blanco de 1.2px para dar un efecto de trazo
                    // y hacer más negrita la tipografía muy fina en logos invertidos.
                    filter: logoIsDark
                      ? "brightness(0) invert(1) drop-shadow(0 0 1.2px rgba(255,255,255,0.85)) drop-shadow(0 3px 12px rgba(0,0,0,0.75))"
                      : "drop-shadow(0 4px 20px rgba(0,0,0,0.8))",
                  }}
                />
              </div>
            ) : logoResolved ? (
              <h2
                className="hero-reveal hero-title-reveal hero-info-title mb-5 text-3xl font-black uppercase tracking-wide text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] hero-wide:mb-8 hero-wide:text-6xl text-center hero-wide:text-left"
                style={{ "--hero-delay": "80ms" }}
              >
                {title}
              </h2>
            ) : (
              /* Cargando el logo: reservamos su hueco SIN mostrar texto, para
                 evitar el parpadeo texto→logo y el salto de layout (el título
                 de texto solo aparece si se confirma que NO hay logo). */
              <div
                aria-hidden="true"
                className="hero-info-logo mb-5 h-24 w-[72%] max-w-[17rem] hero-wide:mb-7 hero-wide:h-44 hero-wide:w-[74%] hero-wide:max-w-none"
              />
            )}

            {/* Botones de acción ARRIBA (sobre los datos y puntuaciones).
                Contenedor relativo: el indicador "ahora sonando" se posiciona de
                forma absoluta debajo para no desplazar la información. */}
            <div className="hero-info-actions relative mb-4 w-full max-w-full hero-wide:mb-6 hero-wide:w-auto">
            <div
              className="hero-reveal flex flex-nowrap items-center justify-center gap-1.5 hero-wide:justify-start hero-wide:gap-3 w-full max-w-full"
              style={{ "--hero-delay": "130ms" }}
            >
              {/* Fila de acciones COMPARTIDA con DetailsClient/DetailModal y las
                  vistas previas (MISMO componente y estilo, size="lg" para el
                  hero). Va en DOS bloques para intercalar el botón de sonido justo
                  tras el tráiler: 1) solo la píldora de tráiler. El contenedor
                  corta la propagación al onClick del hero (que abre la ficha). */}
              <div className="min-w-0 shrink-0" onClick={(e) => e.stopPropagation()}>
                <DetailActionsRow
                  size={isMobile ? "md" : "lg"}
                  className="labeled-row"
                  mobileGapClass="gap-1.5"
                  showSeparator={false}
                  onTrailer={handleToggleTrailer}
                  trailerAvailable
                  trailerLoading={trailerLoading}
                  trailerLabel={isMobile ? null : "Ver trailer"}
                  trailerPlaying={showTrailer}
                />
              </div>

              {/* Sonido: toggle del reproductor de soundtrack de fondo (extra
                  propio del hero), colocado JUSTO tras el tráiler. */}
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
                className={`shrink-0 ${
                  isMobile
                    ? "!h-10 !w-10 [&_svg]:!h-5 [&_svg]:!w-5"
                    : "!h-12 !w-12 [&_svg]:!h-6 [&_svg]:!w-6"
                } ${
                  soundtrackVisible ? "!bg-white !text-black" : ""
                } ${
                  soundtrackPreferenceReady ? "" : "invisible pointer-events-none"
                }`}
              >
                {soundtrackVisible ? <Volume2 /> : <VolumeX />}
              </LiquidButton>

              {/* 2) Resto de acciones compartidas: valoración episodios · Trakt ·
                  puntuar · favorito · pendiente. `labeled-row` mantiene el tamaño
                  uniforme de los iconos (igual que la píldora de arriba). El
                  control de "visto" lo aporta ya Trakt (no se duplica). */}
              <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                <DetailActionsRow
                  size={isMobile ? "md" : "lg"}
                  className="labeled-row"
                  mobileGapClass="gap-1.5"
                  showSeparator={mediaType === "tv"}
                  onEpisodeRatings={
                    mediaType === "tv" ? openEpisodeRatings : undefined
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
                      openPreviewModal();
                    },
                  }}
                  rate={{
                    rating,
                    max: 10,
                    loading: ratingLoading,
                    onRate: handleRate,
                    connected: traktInfo.connected,
                    onConnect: () => requireLogin(),
                  }}
                  favorite={favorite}
                  favoriteLoading={updating === "favorite"}
                  onToggleFavorite={handleToggleFavorite}
                  watchlist={watchlist}
                  watchlistLoading={updating === "watchlist"}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              </div>

              {soundtrackVisible && soundtrackTrack?.previewUrl && (
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
                      !soundtrackVisible || soundtrackMuted;
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
            </div>
            </div>

            {isMobile ? (
              <>
                {/* Fila 1: Premios y nominaciones */}
                {extras.awards && (
                  <div
                    className="hero-reveal mb-2 flex min-h-[1.25rem] items-center justify-center"
                    style={{ "--hero-delay": "140ms" }}
                  >
                    <span
                      key={extras.awards}
                      className="flex min-w-0 items-center gap-2 text-xs font-bold text-emerald-300 drop-shadow-md"
                    >
                      <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-1">{extras.awards}</span>
                    </span>
                  </div>
                )}

                {/* Fila 2: Puntuaciones TMDb e IMDb */}
                <div
                  className="hero-reveal mb-2 flex min-h-[1.25rem] items-center justify-center"
                  style={{ "--hero-delay": "155ms" }}
                >
                  <DetailsRatingsBadges
                    tmdb={
                      ratingOf(movie) !== "–"
                        ? {
                            value: ratingOf(movie),
                            sub: null,
                          }
                        : null
                    }
                    imdb={
                      typeof extras.imdbRating === "number"
                        ? { value: extras.imdbRating.toFixed(1), sub: null }
                        : null
                    }
                  />
                </div>
              </>
            ) : (
              <>
                {/* Premios + Puntuaciones en la misma línea en escritorio */}
                <div
                  className="hero-reveal hero-info-meta mb-2.5 flex min-h-[1.5rem] flex-row flex-nowrap justify-start gap-x-4 items-center"
                  style={{ "--hero-delay": "140ms" }}
                >
                  {extras.awards && (
                    <span
                      key={extras.awards}
                      className="flex min-w-0 items-center gap-2 text-sm font-bold text-emerald-300 drop-shadow-md"
                    >
                      <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="line-clamp-1">{extras.awards}</span>
                    </span>
                  )}
                  <DetailsRatingsBadges
                    tmdb={
                      ratingOf(movie) !== "–"
                        ? {
                            value: ratingOf(movie),
                            sub: null,
                          }
                        : null
                    }
                    imdb={
                      typeof extras.imdbRating === "number"
                        ? { value: extras.imdbRating.toFixed(1), sub: null }
                        : null
                    }
                  />
                </div>

                {/* Badge contextual + Metadatos en la misma línea en escritorio */}
                <div
                  className="hero-reveal hero-info-meta mb-2.5 flex w-full max-w-full flex-row flex-nowrap justify-start gap-x-2 items-center"
                  style={{ "--hero-delay": "170ms" }}
                >
                  {featuredBadge && (
                    <>
                      <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[0.8rem] font-black uppercase tracking-wide text-black">
                        {featuredBadge}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-white/30 shrink-0" />
                    </>
                  )}
                  <DetailsMetaGenresRow
                    yearIso={yearOf(movie)}
                    displayRuntimeValue={extras.runtime}
                    status={extras.status}
                    genres={genreObjects}
                  />
                </div>
              </>
            )}

            {overview && !isMobile && (
              <p
                className="hero-reveal hero-info-overview mb-4 line-clamp-2 max-w-xl text-xs leading-relaxed text-neutral-200/90 hero-wide:mb-5 hero-wide:line-clamp-3 hero-wide:text-base"
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
          // Ventana del soundtrack SOLO en escritorio (variante `desktop:`:
          // ancho de escritorio y puntero fino con hover). En tablet no se
          // muestra; el botón de sonido del hero sigue controlando la música.
          // `contents` no genera caja: el reproductor se sigue posicionando
          // respecto al slide.
          <div className="hidden desktop:contents">
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
          </div>
        )}

      {mediaType === "tv" && (
        <EpisodeRatingsModal
          open={episodeRatingsOpen}
          onClose={closeEpisodeRatings}
          showId={movie.id}
          title={title}
        />
      )}

      <style jsx>{`
        .hero-side-shade {
          transition: opacity 680ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity;
        }

        .hero-trailer-reveal {
          animation: heroTrailerReveal 520ms cubic-bezier(0.22, 1, 0.36, 1)
            both;
        }

        /* El hero puede ser mucho más ancho que 16:9 en pantallas panorámicas.
           El contenedor anterior calculaba el ancho solo desde la altura y
           dejaba una franja vacía a la izquierda. Estas unidades relativas al
           propio contenedor mantienen el iframe en 16:9 y aplican un "cover"
           real en cualquier proporción, con un pequeño overscan para ocultar
           por completo el chrome y los bordes internos de YouTube. */
        .hero-trailer-viewport {
          container-type: size;
        }

        .hero-trailer-iframe {
          width: max(108cqw, calc(108cqh * 16 / 9));
          height: max(108cqh, calc(108cqw * 9 / 16));
        }

        @keyframes heroTrailerReveal {
          from {
            opacity: 0;
            transform: scale(1.015);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .hero-backdrop-reveal {
          opacity: 0;
          transform: translate3d(0, 0, 0);
          filter: blur(0);
          will-change: opacity, transform, filter;
        }

        /* Bloque de información en layout ANCHO. Se maqueta SIEMPRE al mismo
           tamaño de referencia (36rem de ancho, logo 11rem...) y se escala
           entero con --hero-ui-scale, que FeaturedHero calcula a partir del
           tamaño real del hero. Así logo, botones y textos guardan la misma
           proporción entre sí y respecto al backdrop en cualquier pantalla,
           sin reflujo ni saltos por breakpoints, y el bloque se queda en su
           esquina ocupando solo una fracción del hero. scale no afecta al
           layout, así que el ancho fijo no desborda: se ve ya escalado.
           Tambien los margenes al borde escalan, con un minimo para no pisar
           las flechas laterales ni los indicadores.
           OJO: esto es un template literal, aqui NO pueden ir acentos graves. */
        @media (min-width: 40rem) and (min-aspect-ratio: 4 / 5) {
          .hero-info-panel {
            left: max(4.75rem, calc(var(--hero-ui-scale, 1) * 9rem));
            right: auto;
            bottom: max(3.5rem, calc(var(--hero-ui-scale, 1) * 7.5rem));
            width: 36rem;
            padding: 0;
            background: none;
            scale: var(--hero-ui-scale, 1);
            transform-origin: left bottom;
          }
        }

        /* Tablet en VERTICAL (layout movil a mas ancho que un telefono): el
           mismo bloque que en movil, ampliado para que no quede diminuto. */
        @media (min-width: 40rem) and (max-aspect-ratio: 4 / 5) {
          .hero-info-inner {
            zoom: 1.2;
          }
        }

        @media (min-width: 48rem) and (max-aspect-ratio: 4 / 5) {
          .hero-info-inner {
            zoom: 1.35;
          }
        }

        @media (min-width: 60rem) and (max-aspect-ratio: 4 / 5) {
          .hero-info-inner {
            zoom: 1.5;
          }
        }

        /* SOLO ESCRITORIO. En tablet el hero ya se lee con titulo, metadatos y
           acciones; la sinopsis obligaba a comprimir todo lo demas. Va como
           regla propia y no con utilidades de Tailwind porque line-clamp fija
           tambien el display y, al emitirse despues, ganaba a hidden. Misma
           condicion que el navbar: ancho de escritorio Y puntero fino con
           hover, de modo que una tablet grande no cuenta.
           OJO: esto es un template literal, aqui NO pueden ir acentos graves. */
        .hero-info-overview {
          display: none;
        }

        @media (min-width: 64rem) and (hover: hover) and (pointer: fine) {
          .hero-info-overview {
            display: -webkit-box;
          }
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
          .hero-side-shade {
            transition-duration: 100ms;
            will-change: auto;
          }

          .hero-trailer-reveal {
            animation: none;
          }

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
  deferInitialBackdrop = false,
}) {
  // El layout lo decide el propio hero (no el `isMobile` por ancho de los
  // dashboards): una tablet en vertical usa también el layout móvil.
  const isMobile = useHeroMobileLayout();
  const assetsRef = useRef({});
  const resolvingAssetsRef = useRef(new Set());
  const lastBackdropChoiceRef = useRef(new Map());
  const heroSectionRef = useRef(null);
  const pointerStartRef = useRef(null);
  const suppressClickRef = useRef(false);
  const { openDetailModal } = useDetailModal();
  const [activeIndex, setActiveIndex] = useState(0);
  const [assets, setAssets] = useState({}); // id -> { backdrop, backdrops, poster, logo }
  const [selectedBackdrops, setSelectedBackdrops] = useState({});
  const [isInteracting, setIsInteracting] = useState(false);
  const [soundtrackInteracting, setSoundtrackInteracting] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [episodeRatingsOpen, setEpisodeRatingsOpen] = useState(false);
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

  // Escala del bloque de información del layout ancho (ver .hero-info-panel).
  // Se escribe como variable CSS directamente en el <section> para no
  // re-renderizar al redimensionar. Layout effect: la primera medida se aplica
  // antes de pintar, sin salto de tamaño al montar.
  const hasHero = list.length > 0;
  useLayoutEffect(() => {
    const el = heroSectionRef.current;
    if (!el) return;
    const coarse = window.matchMedia("(pointer: coarse)");
    const apply = (width, height) => {
      if (!width || !height) return;
      const raw = Math.min(
        width / HERO_UI_REF_WIDTH,
        height / HERO_UI_REF_HEIGHT,
      );
      // El mínimo mantiene legibles textos y botones, pero cede en heros
      // muy bajos (p. ej. un móvil en horizontal) para que el bloque no
      // suba hasta la barra superior.
      const min = Math.min(
        coarse.matches ? HERO_UI_MIN_SCALE_TOUCH : HERO_UI_MIN_SCALE,
        height / HERO_UI_MIN_FIT_HEIGHT,
      );
      const scale = Math.min(HERO_UI_MAX_SCALE, Math.max(min, raw));
      el.style.setProperty("--hero-ui-scale", scale.toFixed(3));
    };
    const rect = el.getBoundingClientRect();
    apply(rect.width, rect.height);
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      apply(
        box?.inlineSize ?? entry.contentRect.width,
        box?.blockSize ?? entry.contentRect.height,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasHero]);

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
    async (movie, { priority } = {}) => {
      if (!movie?.id) return;
      const id = movie.id;
      if (assetsRef.current[id] || resolvingAssetsRef.current.has(id)) return;

      resolvingAssetsRef.current.add(id);
      const mediaType = getMediaTypeForItem(movie);
      let backdrop = null;
      let backdrops = [];
      let poster = null;
      let logo = null;

      // El backdrop primario, el póster y el logo son independientes entre sí
      // -- los tres leen la MISMA respuesta de `/images`, deduplicada por
      // `fetchTmdbImages`. Antes se encadenaban con `await` uno detrás de
      // otro: cada paso esperaba a que el anterior completara su vuelta de
      // red antes de empezar, así que para cuando arrancaba el logo la
      // petición compartida ya se había resuelto (y limpiado de la caché "en
      // vuelo"), y acababa disparando su PROPIA copia de `/images`. Lanzarlas
      // a la vez comparte esa única petición: el hero -lo primero que se ve
      // del dashboard- tarda ~1 vuelta de red en vez de varias encadenadas.
      // `priority: "high"` (solo para el slide activo) además la salta al
      // frente de la cola de `fetchTmdbImages` por delante del resto de
      // peticiones de fondo del dashboard.
      const [primaryBackdropResult, posterResult, logoResult] =
        await Promise.allSettled([
          fetchBestBackdropNoLang(id, mediaType, { priority }),
          fetchBestPosterNoLang(id, mediaType, { priority }),
          // Orden de preferencia: inglés → español → sin idioma → y, si no,
          // el más votado de cualquier idioma (el fetch trae logos de TODOS
          // los idiomas, así que nunca debería quedar vacío si TMDb tiene
          // alguno).
          fetchBestLogo(id, mediaType, ["en", "es", null], { priority }),
        ]);

      const primaryBackdrop =
        primaryBackdropResult.status === "fulfilled"
          ? primaryBackdropResult.value
          : null;
      poster = posterResult.status === "fulfilled" ? posterResult.value : null;
      logo = logoResult.status === "fulfilled" ? logoResult.value : null;

      try {
        // Para cuando llegamos aquí, `/images` de este título ya está en
        // caché (la petición de arriba la rellenó): esto resuelve sin vuelta
        // de red adicional, solo selección sobre datos ya en memoria.
        const secondaryBackdrop = await fetchBestBackdropNoLang(id, mediaType, {
          limit: 5,
          excludePaths: [primaryBackdrop],
          priority,
        });
        backdrops = uniquePaths([
          primaryBackdrop,
          secondaryBackdrop,
          getPreviewBackdropFallback(movie),
        ]).slice(0, 2);
        backdrop = backdrops[0] || null;
      } catch {
        backdrop = primaryBackdrop || getPreviewBackdropFallback(movie);
        backdrops = uniquePaths([backdrop]);
      }

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

  // El slide activo se resuelve inmediatamente y con prioridad alta: es lo
  // primero que se ve del dashboard, así que su petición de `/images` salta
  // por delante de las demás peticiones de fondo (filas, próximo slide...).
  useEffect(() => {
    if (!list.length) return;
    resolveAssetsFor(list[activeIndex], { priority: "high" });
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
      trailerOpen ||
      episodeRatingsOpen
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
    episodeRatingsOpen,
  ]);

  const activeMovie = list[activeIndex] || list[0] || null;
  const resolvedActiveAssets = activeMovie ? assets[activeMovie.id] : null;
  const activeAssets = resolvedActiveAssets || {};
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

  // En móvil esperamos a que termine la selección de assets. Así nunca se pinta
  // primero el póster provisional del dashboard para sustituirlo después.
  const activePoster = resolveFeaturedHeroPoster(
    resolvedActiveAssets,
    activeMovie,
  );

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
    const wasSwipe = suppressClickRef.current;
    if (start?.id === event.pointerId) pointerStartRef.current = null;
    window.setTimeout(() => {
      setIsInteracting(false);
    }, 120);

    // Navegación por "tap" en dispositivos táctiles. NO dependemos del evento
    // `click` sintetizado por el navegador: los motores móviles lo suprimen o
    // retrasan cuando el elemento pulsado se está animando, y la animación de
    // entrada del hero transforma el logo y los textos durante ~1s. Eso obligaba
    // en móvil a esperar a que terminara la animación para poder pulsar el título
    // y navegar. Con el pointerup real se puede pulsar en cualquier momento. En
    // ratón se mantiene el onClick normal del slide (escritorio no se ve afectado).
    if (
      event.type === "pointerup" &&
      event.pointerType !== "mouse" &&
      !wasSwipe &&
      start &&
      start.id === event.pointerId &&
      activeMovie?.id
    ) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const onInteractive = event.target?.closest?.(
        'button, a, input, label, select, textarea, [role="button"], [role="slider"]',
      );
      if (Math.hypot(dx, dy) <= HERO_TAP_MAX_MOVE_PX && !onInteractive) {
        // Si el navegador sí llega a emitir el click, handleClickCapture lo
        // cancelará al ver suppressClickRef activo, evitando doble navegación.
        suppressClickRef.current = true;
        openDetailModal?.(activeMovie);
      }
    }
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
      <span className="inline-flex translate-y-[6px] hero-wide:translate-y-0">
        <span className="hero-scroll-cue inline-flex drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          <ChevronDown
            aria-hidden="true"
            className="h-7 w-7 transition-transform duration-300 group-hover:translate-y-0.5 hero-wide:h-8 hero-wide:w-8"
          />
        </span>
      </span>
    </button>
  );

  return (
    <>
      <section
        ref={heroSectionRef}
        className="featured-hero-shell relative isolate w-full touch-pan-y overflow-hidden bg-black hero-wide:bg-transparent h-[calc(100svh-7.8rem-env(safe-area-inset-bottom))] hero-wide:h-[var(--hero-wide-height)]"
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
          logoResolved={!!resolvedActiveAssets}
          isActive
          isMobile={isMobile}
          shouldLoadMedia
          onTrailerVisibilityChange={setTrailerOpen}
          onEpisodeRatingsVisibilityChange={setEpisodeRatingsOpen}
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
              className="group/arrow absolute left-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 hero-wide:flex"
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
              className="group/arrow absolute right-4 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)] transition-transform duration-300 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300/70 hero-wide:flex"
            >
              <ChevronRight className="h-9 w-9 transition-transform duration-300 group-hover/arrow:translate-x-0.5" />
            </button>
          </>
        )}

        {!isMobile && (
          <div className="absolute bottom-[4.25rem] left-1/2 z-20 -translate-x-1/2">
            {indicators && indicators}
          </div>
        )}
      </section>

      {!isMobile && (
        <div className="pointer-events-none relative z-20 hidden h-0 hero-wide:block">
          <div className="pointer-events-auto absolute bottom-1.5 left-1/2 -translate-x-1/2">
            {scrollCue}
          </div>
        </div>
      )}

      {isMobile && (
        <div className="relative h-14 bg-black hero-wide:hidden">
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
        /* Alto del hero en layout ancho: TODO el alto visible, sin franja
           vacía debajo, sea cual sea la proporción del monitor (16:9, 16:10,
           4:3, ultrapanorámico...). El backdrop va en cover: en pantallas más
           altas que 16:9 se amplía y se recorta por los lados; en las más
           anchas, por arriba y abajo. svh y no dvh: en tablet el alto no salta
           al mostrarse u ocultarse la barra del navegador.
           Tope de 80vw (proporción 5:4): en ventanas casi cuadradas llenar el
           alto obligaría a recortar más de la mitad del ancho del backdrop, y
           ahí es preferible dejar algo de hueco debajo. */
        .featured-hero-shell {
          --hero-wide-height: min(100svh, 80vw);
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
