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
import {
  DETAILS_MOBILE_COVER_PROPS,
  MobileHeroCover,
} from "@/components/details/MobileDetailsHero";
import { useDetailModal } from "@/components/dashboard/DetailModalProvider";
import { dashboardDetailHref } from "@/lib/dashboard/detailHref";

import { useAuth } from "@/context/AuthContext";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import { isSoundtrackAutoplayOn } from "@/lib/soundtrack/autoplayPreference";
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
  featuredHeroAssetsOutcome,
  resolveFeaturedHeroPoster,
  shouldResolveFeaturedHeroAssets,
} from "@/lib/dashboard/featuredHeroMedia";
import {
  DEFAULT_SOUNDTRACK_VOLUME,
  resolveHeroSoundtrackVolume,
} from "@/lib/dashboard/heroSoundtrack";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import DetailActionsRow from "@/components/details/DetailActionsRow";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import { traktGetItemStatus, traktSetRating } from "@/lib/api/traktClient";
import {
  fetchCommunityArtwork,
  subscribeCommunityArtwork,
  withoutArtworkVotes,
} from "@/lib/artworkApi";
import { useOwnArtwork } from "@/lib/hooks/useOwnCardPoster";

import {
  buildImg,
  GENRES,
  getMediaTypeForItem,
  getPreviewBackdropFallback,
  fetchBestBackdropNoLang,
  fetchBestPosterNoLang,
  fetchBestLogo,
  hasCachedTitleImages,
  HERO_LOGO_LANGS,
  getBestTrailerCached,
  yearOf,
  ratingOf,
  getSpotlightBadge,
  formatRuntime,
} from "@/lib/dashboard/media";
import {
  getCachedTrailerAspect,
  getTrailerContentAspect,
} from "@/lib/dashboard/trailerAspect";

// Fundido a negro del pie del hero en móvil (ver el div que lo usa): curva
// smootherstep en 12 tramos, sin esquinas que se lean como banda.
const HERO_MOBILE_FOOT_FADE = "linear-gradient(to top, #000 0, #000 2px, rgba(0,0,0,0.995) 8.3%, rgba(0,0,0,0.965) 16.7%, rgba(0,0,0,0.896) 25.0%, rgba(0,0,0,0.790) 33.3%, rgba(0,0,0,0.653) 41.7%, rgba(0,0,0,0.500) 50.0%, rgba(0,0,0,0.347) 58.3%, rgba(0,0,0,0.210) 66.7%, rgba(0,0,0,0.104) 75.0%, rgba(0,0,0,0.035) 83.3%, rgba(0,0,0,0.005) 91.7%, transparent)";

// El backdrop se carga directamente desde TMDb. El <picture> usa `original`
// únicamente cuando w1280 tendría que ampliarse (viewport ancho o pantalla de
// alta densidad), manteniendo una sola descarga por slide y sin coste de Vercel.
const HERO_BACKDROP_SIZE = "w1280";
const HERO_BACKDROP_MAX_SIZE = "original";
const HERO_POSTER_SIZE = "w780";
const HERO_AUTO_ADVANCE_MS = 6000;
// Lo que el contenido espera al fondo como mucho antes de entrar sin él.
const HERO_ENTRANCE_MAX_WAIT_MS = 1200;
// Lo que el logo espera como mucho a saber cuál es el MÁS VOTADO (mismo tope
// que la portada de las colecciones). Va en paralelo con `/images`, así que
// normalmente no añade espera; si tarda más, entra el automático y el votado
// lo sustituye al llegar.
const HERO_COMMUNITY_WAIT_MS = 1500;
const COMMUNITY_TIMED_OUT = Symbol("community-timed-out");
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
// Relevo imagen ↔ tráiler (ver .hero-media-swap en los estilos). La salida
// dura lo que el fundido del tráiler; el tope de arranque cubre que YouTube
// no llegue a avisar de que reproduce.
const HERO_TRAILER_SWAP_OUT_MS = 820;
const HERO_TRAILER_START_TIMEOUT_MS = 3500;

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
const SOUNDTRACK_VOLUME_KEY = "showverse:hero:soundtrack-volume";
const SOUNDTRACK_VOLUME_EVENT = "showverse:hero-soundtrack-volume";

function readSoundtrackVolume() {
  if (typeof window === "undefined") return DEFAULT_SOUNDTRACK_VOLUME;
  try {
    const val = window.localStorage.getItem(SOUNDTRACK_VOLUME_KEY);
    if (val === null) return DEFAULT_SOUNDTRACK_VOLUME;
    const parsed = parseFloat(val);
    return resolveHeroSoundtrackVolume(parsed, true);
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
  staticEntrance = false,
  onOpenDetails,
}) {
  const { session, account, preferences } = useAuth();
  // Ajustes > Reproducción automática del soundtrack (desactivada por
  // defecto): sin ella, el soundtrack solo suena en el título donde se pulsa.
  const soundtrackAutoplay = isSoundtrackAutoplayOn(preferences);
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
  // Relevo imagen ↔ tráiler. El iframe se monta oculto bajo la imagen al
  // pulsar y solo se funde por encima cuando YouTube dice que ya reproduce
  // (`trailerStarted`): antes se desmontaba la imagen al momento y quedaba
  // un esqueleto gris y el negro del reproductor cargando. Al cerrar, el
  // iframe sigue montado (`trailerMounted`) mientras la imagen vuelve por
  // encima y se desmonta al acabar el fundido.
  const [trailerStarted, setTrailerStarted] = useState(false);
  const [trailerMounted, setTrailerMounted] = useState(false);
  // Proporción real de la imagen del tráiler (sin sus bandas negras), medida
  // en sus fotogramas de YouTube. El relevo espera a tenerla para que el
  // vídeo no aparezca con bandas y luego salte de tamaño.
  const [trailerAspect, setTrailerAspect] = useState(null);
  const trailerAspectReady = Boolean(trailer?.key) && trailerAspect?.key === trailer.key;

  useEffect(() => {
    if (showTrailer) {
      setTrailerMounted(true);
      return undefined;
    }
    // Cerrado sin llegar a verse: no hay fundido que esperar.
    if (!trailerStarted) {
      setTrailerMounted(false);
      return undefined;
    }
    const id = window.setTimeout(() => {
      setTrailerMounted(false);
      setTrailerStarted(false);
    }, HERO_TRAILER_SWAP_OUT_MS + 80);
    return () => window.clearTimeout(id);
  }, [showTrailer, trailerStarted]);

  // YouTube avisa del estado del reproductor por postMessage cuando el
  // padre se suscribe («listening»); playerState 1 = reproduciendo. Con
  // tope: si el aviso no llega, el relevo se hace igual.
  useEffect(() => {
    if (!showTrailer || trailerStarted) return undefined;
    const reveal = () => setTrailerStarted(true);
    const onMessage = (event) => {
      const win = trailerIframeRef.current?.contentWindow;
      if (!win || event.source !== win) return;
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const state =
        data?.event === "onStateChange"
          ? data.info
          : data?.event === "infoDelivery"
            ? data.info?.playerState
            : undefined;
      if (state === 1) reveal();
    };
    window.addEventListener("message", onMessage);
    const fallback = window.setTimeout(reveal, HERO_TRAILER_START_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(fallback);
    };
  }, [showTrailer, trailerStarted]);

  const trailerPhase = showTrailer
    ? trailerStarted && trailerAspectReady
      ? "playing"
      : "loading"
    : trailerMounted
      ? "closing"
      : "off";

  const infoPanelRef = useRef(null);
  const infoExtraRef = useRef(null);
  const infoTrailerModeRef = useRef(showTrailer);

  // Con el tráiler el bloque de información se queda en logo + botones. El
  // layout cambia de golpe (la información secundaria sale del flujo) y el
  // salto se anima con FLIP: el panel parte desplazado lo que medía esa
  // información y vuelve a 0 con `translate`, que corre en el compositor.
  // Animar el alto (filas de grid) recalculaba el layout en cada fotograma
  // justo cuando se monta el iframe del tráiler y daba tirones. `translate`
  // (y no `transform`) porque el panel ya lleva `scale` en layout ancho:
  // `translate` se aplica fuera de la escala, en píxeles de pantalla, que es
  // lo que se mide. Nada de opacidad en el panel: apagaría el cristal de los
  // botones; solo se funde la información secundaria.
  useLayoutEffect(() => {
    if (infoTrailerModeRef.current === showTrailer) return;
    infoTrailerModeRef.current = showTrailer;
    const panel = infoPanelRef.current;
    const extra = infoExtraRef.current;
    if (!panel || !extra || typeof panel.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Si se interrumpe una animación a medias, se parte de donde iba.
    const currentShift =
      parseFloat(getComputedStyle(panel).translate.split(" ")[1]) || 0;
    // La clase oculta ya está aplicada al llegar aquí: la opacidad calculada
    // solo vale como punto de partida si había un fundido a medias.
    const fadeRunning = extra
      .getAnimations()
      .some((a) => a.id === "sv-hero-info-fade" && a.playState === "running");
    const currentOpacity = fadeRunning
      ? parseFloat(getComputedStyle(extra).opacity)
      : showTrailer
        ? 1
        : 0;
    panel.getAnimations().forEach((a) => {
      if (a.id === "sv-hero-info-shift") a.cancel();
    });
    extra.getAnimations().forEach((a) => {
      if (a.id === "sv-hero-info-fade") a.cancel();
    });

    // Desplazamiento real del panel: se vuelve un instante al layout anterior
    // (la clase oculta es lo único que cambia) y se compara su borde superior
    // con el nuevo. La altura del bloque no vale: oculto es un bloque
    // absoluto y sus márgenes ya no colapsan hacia fuera (17 px de más), y
    // el panel arrancaba desplazado y daba un salto.
    const hiddenClass = "hero-info-extra-hidden";
    extra.classList.toggle(hiddenClass, !showTrailer);
    const previousTop = panel.getBoundingClientRect().top;
    extra.classList.toggle(hiddenClass, showTrailer);
    const delta = previousTop - panel.getBoundingClientRect().top;
    if (!delta && !currentShift) return;
    const from = delta + currentShift;
    const easing = "cubic-bezier(0.25, 0.8, 0.3, 1)";

    const shift = panel.animate(
      { translate: [`0px ${from}px`, "0px 0px"] },
      { duration: 580, easing },
    );
    shift.id = "sv-hero-info-shift";

    const fade = showTrailer
      ? extra.animate(
          { opacity: [currentOpacity, 0] },
          { duration: 260, easing: "cubic-bezier(0.4, 0, 1, 1)" },
        )
      : extra.animate(
          { opacity: [currentOpacity, 1] },
          { duration: 380, delay: 160, easing: "ease-out", fill: "backwards" },
        );
    fade.id = "sv-hero-info-fade";
  }, [showTrailer]);

  // Soundtrack: su visibilidad y el silencio se conservan como preferencias
  // globales para todos los FeaturedHero. Solo arranca solo con la
  // reproducción automática activada; si no, únicamente tras pulsar play en
  // ESTE título (`soundtrackStartedHere`), y al dejar de estar activo se olvida:
  // activar el sonido en un título no hace que el siguiente suene solo.
  const [soundtrackMuted, , setSoundtrackMuted] = useSoundtrackMuted();
  const [soundtrackStartedHere, setSoundtrackStartedHere] = useState(false);
  const soundtrackMayPlay = soundtrackAutoplay || soundtrackStartedHere;
  const [soundtrackVolume, setSoundtrackVolume] = useSoundtrackVolume();
  const [soundtrackTracks, setSoundtrackTracks] = useState([]);
  const [soundtrackTrack, setSoundtrackTrack] = useState(null);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const [soundtrackProgress, setSoundtrackProgress] = useState(0);
  const [soundtrackDuration, setSoundtrackDuration] = useState(0);
  const audioRef = useRef(null);
  const desktopSoundtrackLayout = useMediaQuery(
    "(min-width: 64rem) and (hover: hover) and (pointer: fine)",
  );
  const hasSoundtrackPlayer =
    soundtrackPreferenceReady && desktopSoundtrackLayout && !isMobile;
  const playbackVolume = resolveHeroSoundtrackVolume(
    soundtrackVolume,
    hasSoundtrackPlayer,
  );
  // En táctil la pista debe estar preparada antes de pulsar: el botón es el
  // único control de audio y play() debe ejecutarse dentro de ese gesto.
  const shouldLoadSoundtrack = soundtrackVisible || !hasSoundtrackPlayer;
  const soundtrackButtonActive = hasSoundtrackPlayer
    ? soundtrackVisible
    : soundtrackPlaying && !soundtrackMuted && playbackVolume > 0;

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
        let valueSum = 0;
        let opaque = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 40) continue; // ignora píxeles transparentes
          lumSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          valueSum += Math.max(data[i], data[i + 1], data[i + 2]);
          opaque += 1;
        }
        if (opaque < size * size * 0.02) return; // logo casi vacío: no tocar
        // La luminancia sola confunde los colores saturados con oscuros: un rojo
        // puro (220,30,30) da ~70 y el logo rojo/azul de «Spider-Man: Brand New
        // Day» acababa como silueta blanca. Exigimos además poco brillo en el
        // canal más alto (valor HSV): negros, grises y azul marino sí; rojos no.
        if (!cancelled) {
          setLogoIsDark(lumSum / opaque < 75 && valueSum / opaque < 110); // 0-255
        }
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
      !shouldLoadSoundtrack
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
    shouldLoadSoundtrack,
  ]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = playbackVolume;
  }, [soundtrackTrack, playbackVolume]);

  useEffect(() => {
    if (!isActive) setSoundtrackStartedHere(false);
  }, [isActive]);

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
      soundtrackMayPlay &&
      !!soundtrackTrack;
    audio.muted = !soundtrackVisible || soundtrackMuted;

    if (!shouldPlay) {
      audio.pause();
      return;
    }

    let unlock = null;
    let canceled = false;

    const play = () =>
      audio.play().catch(() => {
        if (canceled || unlock) return;
        unlock = () => {
          audio.play().catch(() => {});
          window.removeEventListener("click", unlock);
          window.removeEventListener("keydown", unlock);
          unlock = null;
        };
        window.addEventListener("click", unlock);
        window.addEventListener("keydown", unlock);
      });

    play();

    return () => {
      canceled = true;
      if (unlock) {
        window.removeEventListener("click", unlock);
        window.removeEventListener("keydown", unlock);
        unlock = null;
      }
    };
  }, [
    isActive,
    showTrailer,
    soundtrackMayPlay,
    soundtrackMuted,
    soundtrackPreferenceReady,
    soundtrackVisible,
    soundtrackTrack,
  ]);

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

  const startSoundtrack = () => {
    const audio = audioRef.current;
    if (!audio || !soundtrackTrack) return;
    const volume = playbackVolume > 0
      ? playbackVolume
      : DEFAULT_SOUNDTRACK_VOLUME;
    if (hasSoundtrackPlayer && soundtrackVolume === 0) setSoundtrackVolume(volume);
    setSoundtrackStartedHere(true);
    setSoundtrackMuted(false);
    audio.volume = volume;
    audio.muted = false;
    // No diferir a un efecto: Safari necesita la activación del usuario.
    audio.play().catch(() => setSoundtrackPlaying(false));
  };

  const handleSoundtrackButton = () => {
    if (hasSoundtrackPlayer) {
      toggleSoundtrackVisible();
      return;
    }
    if (soundtrackButtonActive) {
      setSoundtrackMuted(true);
      if (audioRef.current) {
        audioRef.current.muted = true;
        audioRef.current.pause();
      }
      return;
    }
    if (!soundtrackVisible) toggleSoundtrackVisible();
    setShowTrailer(false);
    startSoundtrack();
  };

  const handleSoundtrackTogglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (soundtrackMuted || playbackVolume === 0 || audio.paused) {
      startSoundtrack();
      return;
    }
    audio.pause();
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
    if (soundtrackMuted || playbackVolume === 0) {
      startSoundtrack();
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
      soundtrackMayPlay
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

  const openPreviewModal = () => onOpenDetails?.(movie);

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
      const cachedAspect = getCachedTrailerAspect(t.key);
      if (cachedAspect) {
        setTrailerAspect({ key: t.key, value: cachedAspect });
      } else {
        getTrailerContentAspect(t.key).then((value) =>
          setTrailerAspect({ key: t.key, value }),
        );
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

  // ENTRADA COORDINADA: el contenido (logo, botones, datos) espera a que el
  // fondo esté cargado y entran juntos; antes aparecía sobre negro y el fondo
  // llegaba después por su cuenta. Con tope: si la imagen tarda, el contenido
  // no se queda esperando.
  // Sin ruta de fondo puede ser que aún se esté resolviendo (no que no haya):
  // solo cuenta como «sin fondo» cuando las imágenes del título ya llegaron.
  const backdropReady = bgSrc ? loadedBackdropSrc === bgSrc : logoResolved;
  const [entranceTimedOut, setEntranceTimedOut] = useState(false);
  useEffect(() => {
    if (backdropReady || staticEntrance) return undefined;
    const timer = window.setTimeout(() => setEntranceTimedOut(true), HERO_ENTRANCE_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [backdropReady, staticEntrance]);
  const entranceReady = staticEntrance || backdropReady || entranceTimedOut || showTrailer;

  return (
    <div
      className={`hero-slide relative w-full h-full bg-black hero-wide:bg-transparent cursor-pointer hero-wide:absolute hero-wide:inset-0 hero-wide:h-full hero-wide:w-full hero-wide:block select-none ${
        entranceReady ? "hero-slide-ready" : ""
      } ${staticEntrance ? "hero-slide-static" : ""}`}
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
          showTrailer || isMobile
            ? "absolute inset-0 h-full aspect-auto"
            : "relative aspect-[2/3]"
        } hero-wide:absolute hero-wide:inset-0 hero-wide:h-full hero-wide:aspect-auto`}
      >
        {shouldLoadMedia && bgSrc && (
          <div
            className="hero-media-swap hero-media-backdrop absolute inset-0"
            data-trailer-phase={trailerPhase}
          >
          <div
            key={bgSrc}
            className={`hero-backdrop-reveal absolute inset-0 ${
              isMobile
                ? "hero-backdrop-reveal-mobile"
                : "hero-backdrop-reveal-desktop"
            } ${loadedBackdropSrc === bgSrc ? "hero-backdrop-ready" : "hero-backdrop-loading"}`}
          >
            {isMobile ? (
              // Móvil: la MISMA portada que la ficha (details/MobileHeroCover
              // con DETAILS_MOBILE_COVER_PROPS, los ajustes de DetailsClient): el
              // póster entero a todo el ancho, su borde inferior prolongado y
              // difuminado, el reflejo del póster debajo y el velo de
              // contraste medido bajo el logo y los botones.
              <MobileHeroCover
                inPanel
                src={posterSrc}
                onLoad={() => setLoadedBackdropSrc(bgSrc)}
                ready
                animate={false}
                collage={null}
                {...DETAILS_MOBILE_COVER_PROPS}
                // Sin reflejo de otro color: bajo el póster, su borde
                // difuminado sigue igual hasta el pie (ver `edgeFill`).
                blurredUnderlay={false}
                edgeFill
              />
            ) : (
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
            )}
          </div>
          </div>
        )}

        {/* Tráiler: va por encima de la imagen pero invisible hasta que
            reproduce; el relevo lo hacen las transiciones de .hero-media-swap. */}
        {(showTrailer || trailerMounted) && trailerSrc && (
              <div
                className="hero-media-swap hero-media-trailer absolute inset-0 overflow-hidden"
                data-trailer-phase={trailerPhase}
              >
                <div
                  className="hero-trailer-viewport absolute inset-0 overflow-hidden"
                  style={
                    trailerAspectReady
                      ? { "--hero-trailer-aspect": trailerAspect.value }
                      : undefined
                  }
                >
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
                        // Suscripción a los avisos de estado (para saber
                        // cuándo empieza a reproducir); se repite porque el
                        // reproductor puede no estar listo en el primer aviso.
                        [0, 300, 1000].forEach((delay) => {
                          setTimeout(() => {
                            win.postMessage(
                              JSON.stringify({ event: "listening", id: 1, channel: "widget" }),
                              target,
                            );
                          }, delay);
                        });
                      } catch { }
                    }}
                  />
                </div>
              </div>
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

      {/* Pie del hero en móvil: funde a negro el fondo (portada, su
          prolongación y el tráiler) solo al final, detrás del navbar inferior,
          donde sigue la página (al hacer scroll no se ve corte). El
          alto del hero cae en fracción de píxel (svh − rem), y lo que hubiera
          debajo asomaba recortado en esa última fila como una línea clara;
          aquí los últimos píxeles son negro sólido y la capa rebasa el borde
          en 1 px, así que esa fila es siempre negra. Largo (15rem) y con
          curva smootherstep: un fundido corto y lineal se veía como una banda
          al hacer scroll. Va encima del fondo y debajo del contenido (z-10). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-60 hero-wide:hidden"
        style={{ background: HERO_MOBILE_FOOT_FADE }}
      />

      {/* Contenido. Móvil/tablet vertical: franja inferior a todo el ancho con
          degradado. Layout ancho: bloque de ancho fijo de referencia anclado a
          la esquina inferior izquierda y escalado con --hero-ui-scale (ver
          .hero-info-panel en los estilos). */}
      <div ref={infoPanelRef} className="hero-info-panel absolute bottom-[calc(7.8rem+var(--sv-safe-bottom,0px))] left-0 right-0 z-10 w-full px-7 pb-3 pt-12">
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
              className="hero-reveal hero-reveal-glass flex flex-nowrap items-center justify-center gap-1.5 hero-wide:justify-start hero-wide:gap-3 w-full max-w-full"
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

              {/* En escritorio abre el reproductor; en táctil controla el sonido. */}
              <LiquidButton
                onClick={(e) => {
                  e.stopPropagation();
                  handleSoundtrackButton();
                }}
                disabled={!soundtrackPreferenceReady || (!hasSoundtrackPlayer && !soundtrackTrack)}
                active={soundtrackPreferenceReady && soundtrackButtonActive}
                aria-pressed={soundtrackButtonActive}
                activeColor="yellow"
                groupId="featured-hero-actions"
                title={
                  hasSoundtrackPlayer
                    ? soundtrackVisible ? "Ocultar soundtrack" : "Mostrar soundtrack"
                    : !soundtrackTrack
                      ? "Sonido no disponible"
                      : soundtrackButtonActive ? "Silenciar sonido" : "Reproducir sonido"
                }
                className={`shrink-0 ${
                  isMobile
                    ? "!h-10 !w-10 [&_svg]:!h-5 [&_svg]:!w-5"
                    : "!h-12 !w-12 [&_svg]:!h-6 [&_svg]:!w-6"
                } ${
                  soundtrackButtonActive ? "!bg-white !text-black" : ""
                } ${
                  soundtrackPreferenceReady ? "" : "invisible pointer-events-none"
                }`}
              >
                {soundtrackButtonActive ? <Volume2 /> : <VolumeX />}
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

              {soundtrackTrack?.previewUrl && (
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
                    event.currentTarget.volume = playbackVolume;
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

            {/* Con el tráiler en marcha el bloque se queda en logo + botones:
                puntuaciones, metadatos y sinopsis salen del flujo (quedan
                justo debajo, invisibles) y el panel, anclado abajo, baja a
                ocupar el hueco; la animación la hace el efecto FLIP de arriba. */}
            <div
              ref={infoExtraRef}
              className={`hero-info-extra ${showTrailer ? "hero-info-extra-hidden" : ""}`}
              aria-hidden={showTrailer || undefined}
              inert={showTrailer || undefined}
            >
            {isMobile ? (
              <>
                {/* Puntuaciones TMDb e IMDb (sin premios en móvil) */}
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
            </div>

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

        /* Relevo imagen <-> trailer. Al pulsar, la imagen se acerca un poco
           (respuesta inmediata) mientras el iframe carga invisible encima.
           Cuando reproduce, el trailer se funde encima asentandose desde una
           escala algo mayor y la imagen sigue acercandose; la imagen solo se
           apaga cuando el trailer ya la tapa entera, para que no haya un
           bajon a negro a mitad del fundido. Al cerrar, la imagen vuelve
           opaca enseguida (debajo) y se aleja a su tamano mientras el
           trailer se desvanece por encima. Solo opacidad y transform: los
           mueve el compositor, y las transiciones CSS se invierten solas si
           se cambia de idea a mitad.
           OJO: template literal, aqui NO pueden ir acentos graves. */
        .hero-media-swap {
          transform-origin: 50% 40%;
          transition:
            opacity 820ms cubic-bezier(0.33, 0, 0.2, 1),
            transform 1600ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: opacity, transform;
        }

        .hero-media-backdrop[data-trailer-phase="loading"] {
          transform: scale(1.035);
        }

        .hero-media-backdrop[data-trailer-phase="playing"] {
          opacity: 0;
          transform: scale(1.08);
          transition-duration: 220ms, 900ms;
          transition-delay: 440ms, 0ms;
        }

        .hero-media-backdrop[data-trailer-phase="closing"] {
          transition-duration: 320ms, 1400ms;
        }

        .hero-media-trailer {
          opacity: 0;
          transform: scale(1.06);
          pointer-events: none;
        }

        .hero-media-trailer[data-trailer-phase="playing"] {
          opacity: 1;
          transform: scale(1);
          transition-duration: 460ms, 900ms;
        }

        .hero-media-trailer[data-trailer-phase="closing"] {
          opacity: 0;
          transform: scale(1.03);
        }

        /* Encaje del tráiler: "cover" exacto sobre la imagen útil del
           vídeo, sin ampliación extra. Muchos tráileres son un 16:9 con
           bandas negras de panorámico dentro (2:1, 2,39:1…);
           --hero-trailer-aspect es la proporción de la imagen sin bandas,
           medida en sus fotogramas (lib/dashboard/trailerAspect.js). El
           iframe sigue siendo 16:9, pero se dimensiona para que esa zona útil
           cubra el hero: siempre toca los cuatro bordes, las bandas quedan
           fuera y solo se recorta lo imprescindible (arriba y abajo si el
           hero es más ancho que la imagen, a los lados si es más alto).
           Sin medida, 16:9. Los 2 px extra evitan una línea de subpíxel. */
        .hero-trailer-viewport {
          container-type: size;
          --hero-trailer-aspect: 1.7778;
        }

        .hero-trailer-iframe {
          --hero-trailer-w: max(100cqw, 100cqh * var(--hero-trailer-aspect));
          width: calc(var(--hero-trailer-w) + 2px);
          height: calc(var(--hero-trailer-w) * 9 / 16 + 2px);
        }

        /* Solo opacidad y transform: los compone la GPU sin repintar. El
           desenfoque animado sobre una imagen a pantalla completa (y dentro
           de una mascara) era lo que daba tirones, sobre todo en la primera
           carga, cuando coincide con el arranque de la pagina. */
        .hero-backdrop-reveal {
          opacity: 0;
          transform: translate3d(0, 0, 0);
          will-change: opacity, transform;
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

        /* Informacion secundaria con el trailer: fuera del flujo, justo
           debajo de los botones (donde estaba) e invisible. El paso de un
           estado a otro lo anima el efecto FLIP del panel. */
        .hero-info-inner {
          position: relative;
        }

        .hero-info-extra-hidden {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          opacity: 0;
          pointer-events: none;
        }

        .hero-backdrop-loading {
          opacity: 0;
        }

        .hero-backdrop-ready {
          animation: heroBackdropReveal 1100ms cubic-bezier(0.22, 1, 0.36, 1)
            both;
        }

        .hero-backdrop-reveal-mobile.hero-backdrop-ready {
          animation-name: heroPosterRevealMobile;
        }

        /* backwards (no both) y sin will-change de opacidad: un ancestro con
           opacidad (animada o con will-change) apaga el cristal de los
           botones; asi, al terminar no queda ninguna capa promovida. */
        .hero-reveal {
          animation: heroContentReveal 640ms cubic-bezier(0.22, 1, 0.36, 1)
            backwards;
          animation-delay: var(--hero-delay, 0ms);
          transform-origin: left center;
        }

        /* Fila de botones de CRISTAL: solo desplazamiento, nunca opacidad ni
           filtro, para que el cristal funcione durante toda la entrada. */
        .hero-reveal-glass {
          animation-name: heroGlassReveal;
        }

        /* Hasta que el fondo esta listo el contenido espera en su primer
           fotograma (oculto); la fila de cristal, con visibility, que no
           apaga el cristal como lo haria la opacidad. */
        .hero-slide:not(.hero-slide-ready) .hero-reveal {
          animation-play-state: paused;
        }

        .hero-slide:not(.hero-slide-ready) .hero-reveal-glass {
          visibility: hidden;
        }

        /* Al volver atras: el destacado ya esta colocado, sin repetir la
           entrada. El fondo solo hace un fundido corto si aun no ha cargado. */
        .hero-slide-static .hero-reveal,
        .hero-slide-static .hero-backdrop-ready {
          animation: none;
        }

        .hero-slide-static .hero-backdrop-reveal {
          transition: opacity 180ms ease-out;
        }

        .hero-slide-static .hero-backdrop-ready {
          opacity: 1;
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

        /* Sin filter: el reproductor es de cristal (backdrop-filter) y
           animar un filtro sobre él hace que el desenfoque del fondo entre de
           golpe al terminar, en vez de con la pieza. */
        @keyframes heroNowPlayingIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
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

          .hero-media-swap {
            transition: none;
          }

          .hero-eq-bar {
            animation: none;
            height: 70%;
          }
        }

        @keyframes heroBackdropReveal {
          from {
            opacity: 0;
            transform: scale(1.04);
          }
          60% {
            opacity: 1;
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes heroPosterRevealMobile {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0);
          }
          60% {
            opacity: 1;
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        .hero-logo-reveal,
        .hero-title-reveal {
          animation-name: heroTitleReveal;
        }

        @keyframes heroContentReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 12px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes heroGlassReveal {
          from {
            transform: translate3d(0, 12px, 0);
          }
          to {
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes heroTitleReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 16px, 0) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
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

          .hero-slide:not(.hero-slide-ready) .hero-reveal-glass {
            visibility: visible;
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
  // Reintentos del arte cuando /images falla (ver featuredHeroAssetsOutcome).
  const assetAttemptsRef = useRef(new Map());
  const assetRetryTimersRef = useRef(new Map());
  const resolveAssetsRef = useRef(null);
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

  // Abrir un título del hero guarda el orden del hero: en su ficha, Anterior y
  // Siguiente (flechas en escritorio, deslizar en móvil) recorren esta sección.
  const openHeroDetails = (item) =>
    openDetailModal?.(item, {
      sequence: list.map((entry) => dashboardDetailHref(entry)),
    });

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
      if (
        !shouldResolveFeaturedHeroAssets(assetsRef.current[id]) ||
        resolvingAssetsRef.current.has(id)
      )
        return;

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
      // El logo, con el MISMO criterio que la ficha y la ficha rápida: la
      // elección propia (ver `ownLogo` abajo) -> el más votado por todos ->
      // el automático (inglés -> sin idioma -> español; si no, el más votado
      // de TMDb en cualquier idioma).
      const communityPromise = fetchCommunityArtwork({ type: mediaType, id });
      const [primaryBackdropResult, posterResult, logoResult, communityResult] =
        await Promise.allSettled([
          fetchBestBackdropNoLang(id, mediaType, { priority }),
          fetchBestPosterNoLang(id, mediaType, { priority }),
          fetchBestLogo(id, mediaType, HERO_LOGO_LANGS, { priority }),
          Promise.race([
            communityPromise,
            new Promise((resolve) =>
              setTimeout(() => resolve(COMMUNITY_TIMED_OUT), HERO_COMMUNITY_WAIT_MS),
            ),
          ]),
        ]);
      const communityArtwork =
        communityResult.status === "fulfilled" ? communityResult.value : null;
      const communityTimedOut = communityArtwork === COMMUNITY_TIMED_OUT;
      const communityLogo = communityTimedOut ? null : communityArtwork?.logo || null;
      if (communityTimedOut) {
        communityPromise.then((artwork) => {
          if (!artwork?.logo) return;
          setAssets((prev) =>
            prev[id] ? { ...prev, [id]: { ...prev[id], communityLogo: artwork.logo } } : prev,
          );
        });
      }

      const primaryBackdrop =
        primaryBackdropResult.status === "fulfilled"
          ? primaryBackdropResult.value
          : null;
      poster = posterResult.status === "fulfilled" ? posterResult.value : null;
      logo = logoResult.status === "fulfilled" ? logoResult.value : null;

      // Un fallo de red NO es «sin póster sin idioma ni logo»: se reintenta y
      // el hero sigue en su estado de carga (sin póster provisional ni título
      // en texto) en vez de quedarse con el respaldo hasta recargar.
      const attempt = assetAttemptsRef.current.get(id) || 0;
      const outcome = featuredHeroAssetsOutcome({
        imagesLoaded: hasCachedTitleImages(id, mediaType),
        attempt,
      });
      if (outcome.action === "retry") {
        assetAttemptsRef.current.set(id, attempt + 1);
        resolvingAssetsRef.current.delete(id);
        window.clearTimeout(assetRetryTimersRef.current.get(id));
        assetRetryTimersRef.current.set(
          id,
          window.setTimeout(() => {
            assetRetryTimersRef.current.delete(id);
            resolveAssetsRef.current?.(movie, { priority });
          }, outcome.delay),
        );
        return;
      }
      assetAttemptsRef.current.delete(id);
      const incomplete = outcome.incomplete;

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
        !shouldResolveFeaturedHeroAssets(prev[id])
          ? prev
          : {
              ...prev,
              [id]: { backdrop, backdrops, poster, logo, communityLogo, incomplete },
            },
      );
      resolvingAssetsRef.current.delete(id);
    },
    [deferInitialBackdrop],
  );
  useEffect(() => {
    resolveAssetsRef.current = resolveAssetsFor;
  }, [resolveAssetsFor]);

  useEffect(() => {
    const timers = assetRetryTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // El slide activo se resuelve inmediatamente y con prioridad alta: es lo
  // primero que se ve del dashboard, así que su petición de `/images` salta
  // por delante de las demás peticiones de fondo (filas, próximo slide...).
  useEffect(() => {
    if (!list.length) return;
    resolveAssetsFor(list[activeIndex], { priority: "high" });
  }, [list, activeIndex, resolveAssetsFor]);

  // Al volver a primer plano o recuperar la red, el arte que se quedó con el
  // respaldo (`incomplete`) o a medio reintentar se vuelve a pedir YA: es
  // justo el momento en que la app reanudada tenía la red aún caída.
  useEffect(() => {
    if (!list.length) return;
    const retryNow = () => {
      if (document.visibilityState === "hidden") return;
      const movie = list[activeIndex];
      if (!movie?.id || !shouldResolveFeaturedHeroAssets(assetsRef.current[movie.id])) return;
      window.clearTimeout(assetRetryTimersRef.current.get(movie.id));
      assetRetryTimersRef.current.delete(movie.id);
      assetAttemptsRef.current.delete(movie.id);
      resolveAssetsFor(movie, { priority: "high" });
    };
    window.addEventListener("online", retryNow);
    window.addEventListener("pageshow", retryNow);
    document.addEventListener("visibilitychange", retryNow);
    return () => {
      window.removeEventListener("online", retryNow);
      window.removeEventListener("pageshow", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
    };
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

  // AL VOLVER ATRÁS el primer destacado aparece ya colocado (sin repetir la
  // entrada). Solo ese: los cambios de destacado posteriores se animan.
  const isBackNav = useIsHistoryNavigation();
  const [firstSlideId, setFirstSlideId] = useState(null);
  if (firstSlideId == null && activeMovie) setFirstSlideId(activeMovie.id);
  const staticEntrance = isBackNav && activeMovie != null && activeMovie.id === firstSlideId;
  const resolvedActiveAssets = activeMovie ? assets[activeMovie.id] : null;
  const activeAssets = resolvedActiveAssets || {};
  const activeMediaType = activeMovie ? getMediaTypeForItem(activeMovie) : null;
  // Logo elegido en la ficha o en la ficha rápida: cambia al momento, también
  // con el dashboard vivo en segundo plano.
  const ownLogo = useOwnArtwork(activeMediaType, activeMovie?.id, "logo");
  // Votos nuevos del título activo (alguien elige o restaura su logo): el más
  // votado se vuelve a pedir, o se retira el voto propio al momento.
  const activeId = activeMovie?.id ?? null;
  useEffect(() => {
    if (activeId == null || !activeMediaType) return undefined;
    let cancelled = false;
    const setCommunityLogo = (update) =>
      setAssets((prev) => {
        const current = prev[activeId];
        if (!current) return prev;
        const communityLogo = update(current.communityLogo || null);
        return communityLogo === current.communityLogo
          ? prev
          : { ...prev, [activeId]: { ...current, communityLogo } };
      });
    const unsubscribe = subscribeCommunityArtwork(
      { type: activeMediaType, id: activeId },
      (event) => {
        if (event.retract) {
          setCommunityLogo(
            (current) => withoutArtworkVotes({ logo: current }, event.retract)?.logo || null,
          );
        }
        if (event.refresh) {
          fetchCommunityArtwork({ type: activeMediaType, id: activeId }).then((artwork) => {
            // `null` = la consulta falló: se queda el que había.
            if (!cancelled && artwork) setCommunityLogo(() => artwork.logo || null);
          });
        }
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeId, activeMediaType]);
  const activeLogoPath = ownLogo || activeAssets.communityLogo || activeAssets.logo || null;
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
        openHeroDetails(activeMovie);
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
        className="featured-hero-shell relative isolate w-full touch-pan-y overflow-hidden bg-black hero-wide:bg-transparent h-[100svh] hero-wide:h-[var(--hero-wide-height)]"
        // Alto de la portada móvil (MobileHeroCover): el póster 2:3 a todo el ancho.
        style={isMobile ? { "--mobile-cover-h": "150vw" } : undefined}
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
          logoPath={activeLogoPath}
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
          staticEntrance={staticEntrance}
          onOpenDetails={openHeroDetails}
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

        {/* Móvil: el hero ocupa la pantalla entera (también detrás del
            navbar inferior) y el difuminado del borde del póster llega hasta
            abajo sin ningún corte. Indicadores y flecha van dentro, justo
            encima del navbar (4.3rem + zona segura); el contenido, 3.5rem más
            arriba. */}
        {isMobile && (
          <div className="absolute inset-x-0 bottom-[calc(4.3rem+var(--sv-safe-bottom,0px))] z-20 h-14 hero-wide:hidden">
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

        {!isMobile && (
          <div className="hero-wide-indicators absolute bottom-[4.25rem] left-1/2 z-20 -translate-x-1/2">
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

        /* Tablet con navbar inferior: 3.75rem de barra + 0.75rem de margen
           al borde + 1rem de separación, además del área segura. */
        @media (min-width: 768px) and (max-width: 1023px),
          (min-width: 768px) and (hover: none),
          (min-width: 768px) and (pointer: coarse) {
          .hero-wide-indicators {
            bottom: calc(5.5rem + var(--sv-safe-bottom,0px));
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
