"use client";

// /src/components/dashboard/PhoneDetailsSections.jsx
// Todo lo que va POR DEBAJO de la fila de botones en la ficha de TELÉFONO del
// DetailModal (`contentView === "mobile"`): el menú de secciones pegajoso y las
// secciones en el mismo orden, con la misma información y el mismo diseño que
// la vista móvil de DetailsClient.
//
// POR QUÉ ES UN ARCHIVO APARTE Y NO ESTÁ DENTRO DE DetailModal
// Son ~1.500 líneas con su propio estado (galería de artwork, vídeos,
// soundtrack, colección, comentarios y listas). Metidas en DetailModal, que ya
// pasa de 4.000, ese archivo dejaría de ser navegable. Aquí el modal le pasa lo
// que ya tiene cargado y este componente resuelve el resto.
//
// QUÉ SE COMPARTE Y QUÉ SE COPIA
// Lo que ya estaba extraído se usa tal cual (`SectionTitle`, `AwardCard`,
// `DetailsSectionMenu`, `DetailsArrowCarousel`, `AnimatedSection`), y los
// ayudantes puros de premios se movieron a `@/components/details/AwardCard` al
// escribir esto. El JSX de cada sección sí es una copia del de DetailsClient:
// es una decisión consciente y tiene un coste conocido -- las dos superficies
// se separarán en cuanto se toque una sola de ellas.
//
// DIFERENCIAS DELIBERADAS CON LA FICHA MÓVIL
//  - ESCALA. En un teléfono de verdad manda la mitad móvil de cada clase
//    (`text-[10px]`, `grid-cols-2`...). Aquí el panel mide 320-639px pero está
//    en una ventana de ESCRITORIO, así que los `sm:`/`md:` casan y se queda la
//    escala grande: la letra se lee igual que en el resto del modal en vez de
//    quedarse diminuta en un monitor. Lo único que se corrige a mano son los
//    RECUENTOS de columnas y de tarjetas por vista, que sin tocar convertirían
//    una rejilla de 5 columnas en un panel de 400px.
//  - NAVEGACIÓN. Un título relacionado abre la ficha EN EL PROPIO PANEL
//    (`onOpenTitle`) en lugar de navegar fuera, que cerraría el drawer entero.
//    Las personas sí navegan: no tienen ficha en el modal.
//  - DESPLAZAMIENTO. El menú pegajoso y el resaltado de la sección activa
//    miran el contenedor con scroll DEL PANEL, no la ventana.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Layers,
  ListVideo,
  Loader2,
  MessageSquare,
  MonitorPlay,
  Sparkles,
  Image as ImageIcon,
  Link as LinkIcon,
  Music2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  Users,
} from "lucide-react";

import OptimizedImage from "@/components/OptimizedImage";
import Avatar from "@/components/ui/Avatar";
import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import CommentLikeButton from "@/components/community/CommentLikeButton";
import PosterStack from "@/components/details/PosterStack";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import {
  LIQUID_GLASS_BAR,
  LIQUID_GLASS_CARD,
  LIQUID_GLASS_ELEVATION,
  LIQUID_GLASS_HOST,
} from "@/lib/ui/liquidGlass";
import { traktGetComments, traktGetLists } from "@/lib/api/traktClient";
import { stripHtml, formatDateTimeEs } from "@/lib/details/formatters";
import { getSeriesGraphSeasonAverages } from "@/lib/details/seriesGraphRatings";
import { seasonStructuresAlign } from "@/lib/details/episodeRatingsStructure";
import { getWatchedEpisodeCountForSeason } from "@/lib/hooks/useTraktEpisodesWatched";
import DetailsSectionMenu from "@/components/DetailsSectionMenu";
import DetailsArrowCarousel, {
  SwiperSlide,
} from "@/components/details/DetailsArrowCarousel";
import SectionTitle from "@/components/details/SectionTitle";
import AwardCard, {
  flattenAwardItems,
  sortAwardItemsForDisplay,
} from "@/components/details/AwardCard";
import { AnimatedSection } from "@/components/details/AnimatedSection";
import VideoModal from "@/components/details/VideoModal";
import { fetchTmdbAwards } from "@/lib/api/tmdbAwards";
import { getMediaTypeForItem, getMovieImages } from "@/lib/dashboard/media";
import { getVideos } from "@/lib/api/tmdb";
import { buildOriginalImageUrl } from "@/lib/details/images";
import {
  uniqBy,
  isPlayableVideo,
  rankVideo,
  videoThumbUrl,
} from "@/lib/details/videos";
import { useAuth } from "@/context/AuthContext";
import {
  readArtworkPreference,
  writeArtworkPreference,
  readPersistedArtworkOverride,
  saveArtworkOverride,
  saveArtworkOverrides,
} from "@/lib/artworkApi";

// El menú se pega por debajo de los controles flotantes del panel (cerrar,
// acoplar, ficha completa): están en `top-4` y miden 40px, así que 56px es
// justo donde dejan de estorbar. En la ficha completa este hueco lo marca el
// navbar; aquí no hay navbar dentro del panel.
const PHONE_STICKY_TOP = 56;

// Las tarjetas por vista NO se heredan de la ficha móvil: allí los saltos son
// por VIEWPORT y aquí el ancho lo pone el panel. Con `breakpointsBase="container"`
// los mismos carruseles responden al panel, que es lo que hace que una rejilla
// pensada para 1280px no acabe metiendo seis tarjetas en 400px.
const PHONE_CAROUSEL = {
  breakpointsBase: "container",
  showArrows: false,
};

// Los carruseles NO llevan `!overflow-visible` (que es lo que usan las secciones
// del modal ancho para que el hover no se recorte). Aquí no hay hover, y con
// desbordamiento visible las tarjetas que no caben se pintan FUERA del carrusel
// y las acaba cortando el borde redondeado del panel: se ve media tarjeta
// pegada al canto. Recortando en el propio carrusel, el corte cae en el margen
// del contenido, alineado con todo lo demás.

function toRatingNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const COMMENTS_PAGE_SIZE = 5;

// Cubo de resolución de una imagen, igual que en la ficha completa.
function imgResBucket(img) {
  const long = Math.max(Number(img?.width || 0), Number(img?.height || 0));
  if (long >= 3840) return "4k";
  if (long >= 2560) return "2k";
  if (long >= 1920) return "1080p";
  if (long >= 1280) return "720p";
  return "sd";
}

function imgResLabel(img) {
  const w = Number(img?.width || 0);
  const h = Number(img?.height || 0);
  return w > 0 && h > 0 ? `${w}×${h}` : null;
}

const RES_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "2k", label: "2K" },
  { id: "4k", label: "4K" },
];

function getSoundtrackSourceBadge(source) {
  const key = String(source || "Spotify").toLowerCase();
  if (key === "itunes") {
    return {
      label: "iTunes",
      textClass: "text-fuchsia-300",
      dotClass: "bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.8)]",
    };
  }
  if (key === "deezer") {
    return {
      label: "Deezer",
      textClass: "text-orange-300",
      dotClass: "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]",
    };
  }
  return {
    label: "Spotify",
    textClass: "text-emerald-400",
    dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  };
}

// TRES tarjetas COMPLETAS por fila, exactamente como la ficha móvil, que usa
// `slidesPerView={3}` en todas sus filas de portadas y no cambia ese número en
// ningún salto. Nada de valores fraccionarios "para insinuar que hay más": en
// este ancho una cuarta tarjeta a medias deja las tres primeras más estrechas y
// la fila se lee como recortada.
const PHONE_POSTER_CAROUSEL = {
  ...PHONE_CAROUSEL,
  spaceBetween: 12,
  slidesPerView: 3,
  breakpoints: {
    480: { slidesPerView: 3, spaceBetween: 14 },
  },
};

// Las tarjetas APAISADAS (logos, vídeos, soundtrack) van de dos en dos, que es
// lo que hace la ficha móvil con ellas: a tres serían ilegibles.
const PHONE_WIDE_CAROUSEL = {
  ...PHONE_CAROUSEL,
  spaceBetween: 12,
  slidesPerView: 2,
  breakpoints: {
    480: { slidesPerView: 2, spaceBetween: 14 },
  },
};

export default function PhoneDetailsSections({
  item,
  data,
  mediaType,
  title,
  scrollContainerRef,
  onOpenTitle,
  // Progreso de visionado por temporada. Sale del MISMO hook que la ficha
  // completa (`useTraktEpisodesWatched`), que el modal ya tiene montado: no
  // hace falta volver a pedir nada.
  episodesWatched,
  imdbId,
  canLikeComments = false,
  onOpenSeason,
  onArtworkSelection,
  soundtrack,
}) {
  const { cacheArtworkOverrides } = useAuth();
  const id = item?.id ?? null;
  const type = mediaType === "tv" ? "tv" : "movie";

  /* ----------------------------- PREMIOS ----------------------------- */
  // Misma consulta que la ficha completa: la sección de premios es
  // independiente de la nota de OMDb y llega por su cuenta.
  const [awardsDetails, setAwardsDetails] = useState(null);
  const [awardsLoading, setAwardsLoading] = useState(true);

  useEffect(() => {
    if (id == null) return undefined;
    let abort = false;
    setAwardsLoading(true);
    setAwardsDetails(null);
    (async () => {
      try {
        const result = await fetchTmdbAwards(type, id);
        if (!abort) setAwardsDetails(result || null);
      } finally {
        if (!abort) setAwardsLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [type, id]);

  const awardItems = useMemo(
    () => sortAwardItemsForDisplay(flattenAwardItems(awardsDetails)),
    [awardsDetails],
  );

  /* ------------------- MEDIA: GALERÍA DE ARTWORK ------------------- */
  // `getMovieImages` está cacheado y es la MISMA consulta que ya hizo el hook
  // del modal para resolver la portada del hero: aquí no se pide nada nuevo.
  const [images, setImages] = useState(null);
  const [imagesLoading, setImagesLoading] = useState(true);

  useEffect(() => {
    if (id == null) return undefined;
    let cancelled = false;
    setImagesLoading(true);
    (async () => {
      const result = await getMovieImages(id, type).catch(() => null);
      if (cancelled) return;
      setImages(result);
      setImagesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  // En un teléfono solo se editan las DOS capas del hero: portada neutra y
  // logo. Es exactamente el conjunto de pestañas que enseña la ficha móvil.
  const [activeImagesTab, setActiveImagesTab] = useState("posters");
  const [imagesResFilter, setImagesResFilter] = useState("all");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [resMenuOpen, setResMenuOpen] = useState(false);

  // Selección del usuario. Se siembra igual que la ficha completa: instantánea
  // persistida si la hay y, si no, la copia local por título.
  const overrideType = type;
  const mobilePosterKey = `showverse:${overrideType}:${id}:mobilePoster`;
  const logoKey = `showverse:${overrideType}:${id}:logo`;
  const [selectedMobilePoster, setSelectedMobilePoster] = useState(null);
  const [selectedLogo, setSelectedLogo] = useState(null);

  useEffect(() => {
    if (id == null) return;
    const snapshot = readPersistedArtworkOverride({ type: overrideType, id });
    const pick = (kind, key) =>
      snapshot ? snapshot[kind] || null : readArtworkPreference(key) || null;
    setSelectedMobilePoster(pick("mobilePoster", mobilePosterKey));
    setSelectedLogo(pick("logo", logoKey));
    setActiveImagesTab("posters");
    setImagesResFilter("all");
    setControlsOpen(false);
  }, [id, overrideType, mobilePosterKey, logoKey]);

  const persistSelection = useCallback(
    (kind, key, filePath, setLocal, chosen) => {
      setLocal(filePath);
      writeArtworkPreference(key, filePath);
      cacheArtworkOverrides?.({
        type: overrideType,
        id,
        changes: [{ kind, filePath }],
      });
      saveArtworkOverride({ type: overrideType, id, kind, filePath });
      // El hero vive en el modal y su arte se fija UNA vez por título: sin este
      // aviso, elegir una portada aquí no cambiaría nada hasta reabrir.
      onArtworkSelection?.({
        kind,
        filePath,
        hasBurnedTitle:
          kind === "mobilePoster"
            ? typeof chosen?.iso_639_1 === "string" &&
              chosen.iso_639_1.trim() !== ""
            : false,
      });
    },
    [cacheArtworkOverrides, overrideType, id, onArtworkSelection],
  );

  const handleSelectMobilePoster = useCallback(
    (filePath, chosen) =>
      persistSelection(
        "mobilePoster",
        mobilePosterKey,
        filePath,
        setSelectedMobilePoster,
        chosen,
      ),
    [persistSelection, mobilePosterKey],
  );

  const handleSelectLogo = useCallback(
    (filePath, chosen) =>
      persistSelection("logo", logoKey, filePath, setSelectedLogo, chosen),
    [persistSelection, logoKey],
  );

  const handleResetArtwork = useCallback(() => {
    setSelectedMobilePoster(null);
    setSelectedLogo(null);
    writeArtworkPreference(mobilePosterKey, null);
    writeArtworkPreference(logoKey, null);
    // Se restauran TODAS las capas, no solo las dos que se editan aquí: es lo
    // que hace el mismo botón en la ficha completa, y dejar a medias el resto
    // convertiría "restaurar" en algo distinto según desde dónde se pulse.
    const changes = [
      { kind: "poster", filePath: null },
      { kind: "backdrop", filePath: null },
      { kind: "background", filePath: null },
      { kind: "mobilePoster", filePath: null },
      { kind: "logo", filePath: null },
    ];
    cacheArtworkOverrides?.({ type: overrideType, id, changes });
    saveArtworkOverrides({ type: overrideType, id, changes });
    onArtworkSelection?.({ kind: "logo", filePath: null });
  }, [cacheArtworkOverrides, overrideType, id, mobilePosterKey, logoKey, onArtworkSelection]);

  const handleCopyImageUrl = useCallback(async (filePath) => {
    const url = buildOriginalImageUrl(filePath);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt("Copiar URL:", url);
      }
    } catch {
      window.prompt("Copiar URL:", url);
    }
  }, []);

  const isLogoTab = activeImagesTab === "logos";

  const artworkSelection = useMemo(() => {
    const rawList = isLogoTab ? images?.logos : images?.posters;
    const activePath = isLogoTab
      ? selectedLogo || data?.logoPath || null
      : selectedMobilePoster || data?.heroPosterPath || null;

    const withPath = (rawList || []).filter((img) => !!img?.file_path);

    const filtered = withPath.filter((img) => {
      if (img.file_path === activePath) return true;
      if (imagesResFilter !== "all" && imgResBucket(img) !== imagesResFilter) {
        return false;
      }
      // La pestaña de PORTADA del teléfono es la del hero móvil: solo arte sin
      // idioma, porque encima va el logo y una portada rotulada lo duplicaría.
      if (!isLogoTab) return !img?.iso_639_1;
      return true;
    });

    // Si los filtros dejan la fila vacía se relajan, igual que en la ficha
    // completa: una galería vacía se lee como un fallo, no como un filtro.
    const relaxed = (() => {
      if (!withPath.length) return [];
      if (isLogoTab) return withPath;
      const neutral = withPath.filter((img) => !img?.iso_639_1);
      return neutral.length ? neutral : withPath;
    })();

    return {
      ordered: filtered.length ? filtered : relaxed,
      activePath,
      aspect: isLogoTab ? "aspect-[16/9]" : "aspect-[2/3]",
      size: isLogoTab ? "w500" : "w342",
    };
  }, [
    isLogoTab,
    images?.logos,
    images?.posters,
    selectedLogo,
    selectedMobilePoster,
    data?.logoPath,
    data?.heroPosterPath,
    imagesResFilter,
  ]);

  /* --------------------------- MEDIA: VÍDEOS --------------------------- */
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);

  useEffect(() => {
    if (id == null) return undefined;
    let cancelled = false;
    setVideosLoading(true);
    (async () => {
      try {
        const raw = await getVideos(type, id);
        if (cancelled) return;
        const source = Array.isArray(raw?.results)
          ? raw.results
          : Array.isArray(raw)
            ? raw
            : [];
        const merged = uniqBy(source, (v) => `${v?.site}:${v?.key}`).filter(
          isPlayableVideo,
        );
        merged.sort((a, b) => rankVideo(a) - rankVideo(b));
        setVideos(merged);
      } catch {
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  // La sección de soundtrack se ve DENTRO de la ficha, así que sus pistas hay
  // que pedirlas al pintarla; el modal solo las cargaba al abrir su reproductor.
  //
  // El callback NO puede estar en las dependencias: llega dentro de un objeto
  // literal y es una función declarada en el cuerpo de DetailModal, así que
  // cambia de identidad en CADA render. Con él en la lista, el efecto se
  // disparaba en cada render, la petición ponía `loading` a true, eso
  // re-renderizaba, y vuelta a empezar: `/api/soundtrack` en bucle.
  //
  // Se lee por ref y se pide UNA vez por consulta (que es lo que identifica al
  // título), no una por render.
  const ensureSoundtrackRef = useRef(null);
  const requestedSoundtrackRef = useRef(null);
  const soundtrackQuery = soundtrack?.query;

  useEffect(() => {
    ensureSoundtrackRef.current = soundtrack?.onEnsureLoaded ?? null;
  });

  useEffect(() => {
    if (!soundtrackQuery) return;
    if (requestedSoundtrackRef.current === soundtrackQuery) return;
    requestedSoundtrackRef.current = soundtrackQuery;
    void ensureSoundtrackRef.current?.();
  }, [soundtrackQuery]);

  /* ---------------------------- COLECCIÓN ---------------------------- */
  const collectionId = data?.belongsToCollectionId ?? null;
  const [collectionData, setCollectionData] = useState(null);
  const [collectionLoading, setCollectionLoading] = useState(false);

  useEffect(() => {
    if (!collectionId) {
      setCollectionData(null);
      setCollectionLoading(false);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        setCollectionLoading(true);
        const res = await fetch(`/api/tmdb/collection?id=${collectionId}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setCollectionData(res.ok && json?.collection ? json : null);
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

  /* ------------------- VALORACIÓN DE EPISODIOS (TV) ------------------- */
  const [episodeRatings, setEpisodeRatings] = useState(null);
  const [episodeRatingsError, setEpisodeRatingsError] = useState(null);
  const [episodeRatingsLoading, setEpisodeRatingsLoading] = useState(false);

  useEffect(() => {
    if (type !== "tv" || id == null) {
      setEpisodeRatings(null);
      setEpisodeRatingsError(null);
      setEpisodeRatingsLoading(false);
      return undefined;
    }
    let ignore = false;
    setEpisodeRatingsError(null);
    setEpisodeRatingsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/seriesgraph/episode-ratings?tmdbId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error);
        if (!ignore) setEpisodeRatings(json);
      } catch (error) {
        if (!ignore) setEpisodeRatingsError(error?.message || "Error");
      } finally {
        if (!ignore) setEpisodeRatingsLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [type, id]);

  const tmdbSeasons = useMemo(
    () => (Array.isArray(data?.seasons) ? data.seasons : []),
    [data?.seasons],
  );

  // Temporadas visibles: las emitidas, sin los especiales (temporada 0), igual
  // que `visibleTraktSeasons` en la ficha completa.
  const visibleSeasons = useMemo(
    () =>
      tmdbSeasons.filter(
        (season) =>
          Number(season?.season_number) > 0 &&
          Number(season?.episode_count) > 0,
      ),
    [tmdbSeasons],
  );

  const seriesGraphSeasonRatings = useMemo(() => {
    const averages = getSeriesGraphSeasonAverages({
      ratings: episodeRatings,
      tmdbSeasons,
    });
    const map = new Map();
    averages.forEach((aggregate, seasonNumber) => {
      if (aggregate?.rating != null) map.set(seasonNumber, aggregate.rating);
    });
    return map;
  }, [episodeRatings, tmdbSeasons]);

  // SeriesGraph e IMDb pueden agrupar un anime de forma distinta a TMDb, y ahí
  // un mismo número de temporada no representa los mismos episodios.
  const seasonStructuresMismatch = useMemo(() => {
    const sgSeasons = Array.isArray(episodeRatings?.seasons)
      ? episodeRatings.seasons
      : [];
    if (!sgSeasons.length || !visibleSeasons.length) return false;
    return !seasonStructuresAlign(sgSeasons, visibleSeasons);
  }, [episodeRatings, visibleSeasons]);

  // Nota de IMDb por temporada. Comparte CLAVE DE CACHÉ con la ficha completa,
  // así que si ya se visitó esa ficha en esta pestaña no se pide nada.
  const [seasonImdbRatings, setSeasonImdbRatings] = useState({});
  const visibleSeasonNumbersKey = visibleSeasons
    .map((season) => Number(season.season_number))
    .join(",");

  useEffect(() => {
    if (type !== "tv" || !imdbId || !visibleSeasonNumbersKey || seasonStructuresMismatch) {
      setSeasonImdbRatings({});
      return undefined;
    }
    const seasonNumbers = visibleSeasonNumbersKey.split(",").map(Number);
    let ignore = false;
    const controller = new AbortController();
    const cacheKey = `showverse:tv:${id}:season-imdb-ratings:${imdbId}`;

    const readCache = () => {
      try {
        const raw = window.sessionStorage.getItem(cacheKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    };

    (async () => {
      const cached = readCache();
      if (!ignore) setSeasonImdbRatings(cached);
      const missing = seasonNumbers.filter(
        (seasonNumber) =>
          !Object.prototype.hasOwnProperty.call(cached, String(seasonNumber)),
      );
      if (!missing.length) return;

      const next = { ...cached };
      for (const seasonNumber of missing) {
        if (ignore) return;
        try {
          const params = new URLSearchParams({
            showId: String(id),
            imdbId,
            season: String(seasonNumber),
          });
          const res = await fetch(`/api/ratings/season?${params}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const json = await res.json().catch(() => ({}));
          next[seasonNumber] = res.ok ? toRatingNumber(json?.rating) : null;
        } catch (error) {
          if (error?.name === "AbortError") return;
          next[seasonNumber] = null;
        }
      }
      if (ignore) return;
      try {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {
        // La nota por temporada se vuelve a pedir en la próxima visita.
      }
      setSeasonImdbRatings(next);
    })();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [type, id, imdbId, visibleSeasonNumbersKey, seasonStructuresMismatch]);

  /* --------------------------- COMENTARIOS --------------------------- */
  const [commentsTab, setCommentsTab] = useState("recent");
  const [comments, setComments] = useState({
    loading: true,
    error: "",
    items: [],
    page: 1,
    pageCount: 0,
    total: 0,
  });

  const selectCommentsTab = useCallback((tab) => {
    setCommentsTab((current) => {
      if (current === tab) return current;
      setComments((previous) => ({
        ...previous,
        items: [],
        page: 1,
        pageCount: 0,
        total: 0,
        loading: true,
        error: "",
      }));
      return tab;
    });
  }, []);

  const selectCommentsPage = useCallback((page) => {
    setComments((previous) => {
      const nextPage = Math.min(
        Math.max(1, Number(page) || 1),
        Math.max(1, previous.pageCount || 1),
      );
      if (previous.loading || nextPage === previous.page) return previous;
      return { ...previous, page: nextPage, loading: true, error: "" };
    });
  }, []);

  const commentsPage = comments.page;
  useEffect(() => {
    if (id == null) return undefined;
    let ignore = false;
    (async () => {
      setComments((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        const sort =
          commentsTab === "recent"
            ? "newest"
            : commentsTab === "likes30"
              ? "likes30"
              : "likes";
        const result = await traktGetComments({
          type: type === "tv" ? "show" : "movie",
          tmdbId: id,
          sort,
          page: commentsPage,
          limit: COMMENTS_PAGE_SIZE,
        });
        if (ignore) return;
        const items = Array.isArray(result?.items) ? result.items : [];
        const pageCount = Number(result?.pagination?.pageCount || 0);
        setComments({
          loading: false,
          error: "",
          items,
          page: Number(result?.pagination?.page || commentsPage) || 1,
          pageCount,
          total: Number(result?.pagination?.itemCount || 0),
        });
      } catch (error) {
        if (!ignore) {
          setComments((previous) => ({
            ...previous,
            loading: false,
            error: error?.message || "Error",
          }));
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id, type, commentsTab, commentsPage]);

  /* ------------------------------ LISTAS ------------------------------ */
  const [lists, setLists] = useState({ loading: true, error: "", items: [] });

  useEffect(() => {
    if (id == null) return undefined;
    let ignore = false;
    (async () => {
      setLists((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        const result = await traktGetLists({
          type: type === "tv" ? "show" : "movie",
          tmdbId: id,
          sort: "popular",
          page: 1,
          limit: 6,
        });
        if (ignore) return;
        const items = Array.isArray(result?.items)
          ? result.items
          : Array.isArray(result)
            ? result
            : [];
        setLists({ loading: false, error: "", items });
      } catch (error) {
        if (!ignore) {
          setLists({ loading: false, error: error?.message || "Error", items: [] });
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [id, type]);

  /* ------------------- MENÚ PEGAJOSO Y SECCIÓN ACTIVA ------------------- */
  const sectionElsRef = useRef({});
  const menuStickyRef = useRef(null);
  const [menuHeight, setMenuHeight] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState(null);

  const registerSection = useCallback(
    (sid) => (el) => {
      if (el) sectionElsRef.current[sid] = el;
      else delete sectionElsRef.current[sid];
    },
    [],
  );

  useEffect(() => {
    const el = menuStickyRef.current;
    if (!el) return undefined;

    // Se lee del propio `entry` y se redondea. `getBoundingClientRect()` dentro
    // del observador fuerza una medición, y el alto del menú no cambia al
    // arrastrar el tirador: sin redondear, una fracción de píxel bastaba para
    // provocar un `setState` —y con él un render y el remontaje del efecto de
    // la sección activa— en cada fotograma del arrastre.
    const apply = (height) => {
      const next = Math.round(height || 0);
      setMenuHeight((current) => (current === next ? current : next));
    };

    apply(el.getBoundingClientRect().height);

    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize?.[0];
      apply(box ? box.blockSize : entry?.contentRect?.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sección activa. En la ficha completa esto lo resuelve un IntersectionObserver
  // contra la VENTANA; aquí el recorrido ocurre dentro del panel, así que se
  // mide contra su contenedor con scroll. Se lee en un rAF por evento para no
  // forzar un reflow por cada tick de la rueda.
  useEffect(() => {
    const scroller = scrollContainerRef?.current;
    if (!scroller) return undefined;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const limit = scroller.getBoundingClientRect().top + PHONE_STICKY_TOP + menuHeight + 12;
      let current = null;
      for (const [sid, el] of Object.entries(sectionElsRef.current)) {
        if (!el) continue;
        if (el.getBoundingClientRect().top <= limit) current = sid;
      }
      setActiveSectionId((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [scrollContainerRef, menuHeight]);

  const sectionsRef = useRef(null);

  const scrollToSection = useCallback(
    (sid) => {
      const scroller = scrollContainerRef?.current;
      const el = sectionElsRef.current[sid];
      if (!scroller || !el) return;

      // Las secciones se saltan la maquetación mientras están fuera de la
      // ventana (`content-visibility: auto`), y una que no se ha visto nunca
      // mide su tamaño ESTIMADO. Medir el salto con eso lo dejaría en el sitio
      // equivocado, así que se revelan todas mientras dura la medición: una
      // maquetación completa, una vez por pulsación.
      const sections = sectionsRef.current;
      sections?.classList.add("sv-phone-sections--measuring");

      const offset = PHONE_STICKY_TOP + menuHeight + 12;
      const top =
        scroller.scrollTop +
        el.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        offset;

      sections?.classList.remove("sv-phone-sections--measuring");

      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      setActiveSectionId(sid);
    },
    [scrollContainerRef, menuHeight],
  );

  const sentimentPros = Array.isArray(data?.sentiment?.pros)
    ? data.sentiment.pros
    : [];
  const sentimentCons = Array.isArray(data?.sentiment?.cons)
    ? data.sentiment.cons
    : [];

  const cast = Array.isArray(data?.cast) ? data.cast : [];
  const recommendations = Array.isArray(data?.recommendations)
    ? data.recommendations
    : [];

  const sectionItems = useMemo(() => {
    const items = [];
    items.push({
      id: "cast",
      label: "Reparto",
      icon: Users,
      count: cast.length || undefined,
    });
    items.push({
      id: "recs",
      label: "Recomendaciones",
      icon: MonitorPlay,
      count: recommendations.length || undefined,
    });
    if (collectionId) {
      items.push({
        id: "collection",
        label: "Colección",
        icon: Layers,
        count: collectionData?.items?.length || undefined,
        loading: collectionLoading && !collectionData,
      });
    }
    if (awardsLoading || awardItems.length > 0) {
      items.push({
        id: "awards",
        label: "Premios",
        icon: Trophy,
        count: awardItems.length || undefined,
        loading: awardsLoading && awardItems.length === 0,
      });
    }
    // Media agrupa portadas, vídeos y soundtrack, igual que en la ficha
    // completa: es una sola entrada del menú aunque sean tres bloques.
    items.push({
      id: "media",
      label: "Media",
      icon: ImageIcon,
      count:
        (images?.posters?.length || 0) +
          (images?.logos?.length || 0) +
          videos.length || undefined,
    });
    items.push({ id: "sentiment", label: "Sentimientos", icon: Sparkles });
    if (type === "tv") {
      items.push({ id: "seasons", label: "Temporadas", icon: Layers });
      items.push({ id: "episodes", label: "Episodios", icon: BarChart3 });
    }
    items.push({
      id: "comments",
      label: "Comentarios",
      icon: MessageSquare,
      count: comments.total || undefined,
    });
    items.push({
      id: "lists",
      label: "Listas",
      icon: ListVideo,
      count: lists.items.length || undefined,
    });
    return items;
  }, [
    cast.length,
    recommendations.length,
    awardItems.length,
    awardsLoading,
    collectionId,
    collectionData,
    collectionLoading,
    comments.total,
    lists.items.length,
    images?.posters?.length,
    images?.logos?.length,
    videos.length,
    type,
  ]);

  return (
    <div ref={sectionsRef} className="sv-phone-sections mt-2">
      <div
        ref={menuStickyRef}
        className="sticky z-30 py-2"
        style={{
          top: PHONE_STICKY_TOP,
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        <DetailsSectionMenu
          items={sectionItems}
          activeId={activeSectionId}
          onChange={scrollToSection}
          // Diez secciones no caben rotuladas en el ancho de un teléfono: los
          // botones se encogían por debajo de su texto y lo cortaban a media
          // palabra ("REPART", "RECOMENDACIO").
          iconsOnly
        />
      </div>

      <div className="mt-10 space-y-10">
        {/* === REPARTO PRINCIPAL === */}
        <section className="sv-phone-section" id="phone-section-cast" ref={registerSection("cast")}>
          <AnimatedSection delay={0.04}>
            {cast.length > 0 && (
              <section className="group/section">
                <SectionTitle title="Reparto Principal" icon={Users} />
                <DetailsArrowCarousel
                  {...PHONE_POSTER_CAROUSEL}
                  className="pb-2"
                >
                  {cast.slice(0, 20).map((actor) => (
                    <SwiperSlide key={actor.id ?? actor.credit_id ?? actor.name}>
                      <Link
                        href={`/details/person/${actor.id}`}
                        className="block group relative bg-zinc-900 rounded-xl overflow-hidden shadow-md transition-all duration-300"
                      >
                        <div className="aspect-[2/3] overflow-hidden relative">
                          {actor.profile_path ? (
                            <OptimizedImage
                              src={`https://image.tmdb.org/t/p/w342${actor.profile_path}`}
                              alt={actor.name}
                              className="w-full h-full object-cover grayscale-[15%]"
                            />
                          ) : (
                            <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-neutral-500">
                              <Users size={40} />
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-80" />

                          <div className="absolute bottom-0 left-0 right-0 p-3 pb-4">
                            <p className="text-white font-extrabold text-sm leading-tight line-clamp-1 drop-shadow-sm">
                              {actor.name}
                            </p>
                            <p className="mt-0.5 text-zinc-300 text-xs font-semibold leading-tight line-clamp-1 drop-shadow-sm">
                              {actor.character}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </SwiperSlide>
                  ))}
                </DetailsArrowCarousel>
              </section>
            )}
          </AnimatedSection>
        </section>

        {/* === RECOMENDACIONES === */}
        <section className="sv-phone-section" id="phone-section-recs" ref={registerSection("recs")}>
          <AnimatedSection delay={0.04}>
            {recommendations.length > 0 && (
              <section className="group/section">
                <SectionTitle title="Recomendaciones" icon={MonitorPlay} />
                <DetailsArrowCarousel
                  {...PHONE_POSTER_CAROUSEL}
                  className="pb-2"
                >
                  {recommendations.slice(0, 15).map((rec) => (
                    <SwiperSlide key={`${getMediaTypeForItem(rec)}-${rec.id}`}>
                      {/* Abre EN EL PANEL, no navega: salir de aquí cerraría el
                          drawer y la página que hay debajo perdería el sitio. */}
                      <button
                        type="button"
                        onClick={() => onOpenTitle?.(rec)}
                        className="block w-full text-left relative bg-zinc-900 rounded-xl overflow-hidden shadow-md"
                      >
                        <div className="aspect-[2/3] overflow-hidden relative">
                          <OptimizedImage
                            src={
                              rec.poster_path
                                ? `https://image.tmdb.org/t/p/w342${rec.poster_path}`
                                : "/placeholder.png"
                            }
                            alt={rec.title || rec.name || ""}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </button>
                    </SwiperSlide>
                  ))}
                </DetailsArrowCarousel>
              </section>
            )}
          </AnimatedSection>
        </section>

        {/* === COLECCIÓN === */}
        {collectionId && (
          <section className="sv-phone-section" id="phone-section-collection" ref={registerSection("collection")}>
            <AnimatedSection delay={0.04}>
              <section className="group/section">
                {/* El encabezado no usa <SectionTitle/>: aquí el título entero
                    es un enlace a la ficha de la saga y lleva su propia flecha,
                    igual que en la ficha completa. */}
                <Link
                  href={`/lists/collection/${collectionId}`}
                  className="group/collection-title flex items-center gap-3 sm:gap-4 mb-8 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
                  aria-label="Ver detalles de la colección"
                >
                  <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-yellow-500/5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(234,179,8,0.12)] shrink-0 overflow-hidden transition-all duration-500">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-transparent to-transparent opacity-60" />
                    <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
                    <Layers className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 transition-all duration-500 drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]" />
                  </div>
                  <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white drop-shadow-md shrink-0 flex items-center">
                    Colección
                    <ChevronRight className="ml-1 sm:ml-2 h-6 w-6 sm:h-7 sm:w-7 text-yellow-500/70 transition-transform duration-300 group-hover/collection-title:translate-x-1 group-hover/collection-title:text-yellow-400" />
                  </h2>
                  <div className="ml-2 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center">
                    <div className="absolute left-0 w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,1)] opacity-40" />
                  </div>
                </Link>

                {collectionLoading ? (
                  <div className="mt-3 sm:mt-4 text-sm text-zinc-400">
                    Cargando colección…
                  </div>
                ) : collectionData?.items?.length ? (
                  <DetailsArrowCarousel
                    {...PHONE_POSTER_CAROUSEL}
                    className="pb-2"
                  >
                    {collectionData.items.map((movie) => (
                      <SwiperSlide key={movie.id}>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenTitle?.({ ...movie, media_type: "movie" })
                          }
                          className="block w-full text-left relative bg-zinc-900 rounded-xl overflow-hidden shadow-md"
                        >
                          <div className="aspect-[2/3] overflow-hidden relative">
                            <OptimizedImage
                              src={
                                movie.poster_path
                                  ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                                  : "/placeholder.png"
                              }
                              alt={movie.title || movie.name || ""}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </button>
                      </SwiperSlide>
                    ))}
                  </DetailsArrowCarousel>
                ) : null}
              </section>
            </AnimatedSection>
          </section>
        )}

        {/* === PREMIOS === */}
        {awardItems.length > 0 && (
          <section className="sv-phone-section" id="phone-section-awards" ref={registerSection("awards")}>
            <AnimatedSection delay={0.04}>
              <section className="group/section">
                <SectionTitle title="Premios" icon={Trophy} />
                <DetailsArrowCarousel
                  {...PHONE_POSTER_CAROUSEL}
                  className="pb-2"
                >
                  {awardItems.map((award, index) => {
                    const previous = awardItems[index - 1] || null;
                    const startsNominations =
                      award?.result === "nominee" && previous?.result === "winner";
                    return (
                      <SwiperSlide key={award.id}>
                        <div
                          className={
                            startsNominations
                              ? "relative before:absolute before:-left-2.5 before:top-3 before:bottom-3 before:w-px before:bg-white/10"
                              : ""
                          }
                        >
                          {/* Sin hover, igual que en un teléfono real: el panel
                              está en un escritorio y el ratón SÍ puede posarse,
                              pero el diseño que se replica es el táctil. */}
                          <AwardCard item={award} enableHover={false} />
                        </div>
                      </SwiperSlide>
                    );
                  })}
                </DetailsArrowCarousel>
              </section>
            </AnimatedSection>
          </section>
        )}

        {/* === MEDIA: PORTADAS Y FONDOS === */}
        <section className="sv-phone-section" id="phone-section-media" ref={registerSection("media")}>
          <AnimatedSection delay={0.04}>
            <section className="group/section">
              {/* El encabezado y los controles comparten fila, igual que en la
                  ficha móvil: el botón de filtros abre el panel desplegable y
                  el de restaurar deshace las selecciones. */}
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SectionTitle title="Portadas y fondos" icon={ImageIcon} />
                </div>
                <div className="mb-8 flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setControlsOpen((open) => !open);
                      setResMenuOpen(false);
                    }}
                    className="inline-flex isolate items-center justify-center w-10 h-10 rounded-2xl transition-all duration-300 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] text-zinc-200 hover:bg-black/30 transform-gpu"
                    aria-label="Filtros"
                    aria-expanded={controlsOpen}
                  >
                    <SlidersHorizontal className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetArtwork}
                    className="inline-flex isolate items-center justify-center w-10 h-10 rounded-2xl transition-all bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transform-gpu text-red-400 hover:bg-red-500/20 hover:text-red-300"
                    aria-label="Restaurar valores por defecto"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {controlsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="mb-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex isolate transform-gpu rounded-2xl p-1 h-10 items-center bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
                        <button
                          type="button"
                          onClick={() => setActiveImagesTab("posters")}
                          className={`px-2.5 h-full rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                            activeImagesTab === "posters"
                              ? "bg-white/10 text-white shadow-md"
                              : "text-zinc-400 hover:text-white hover:bg-white/10"
                          }`}
                          aria-label="Portada"
                          aria-pressed={activeImagesTab === "posters"}
                        >
                          <ImageIcon className="w-4 h-4" />
                          <span className="text-xs font-semibold">Portada</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveImagesTab("logos")}
                          className={`px-2.5 h-full rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                            activeImagesTab === "logos"
                              ? "bg-white/10 text-white shadow-md"
                              : "text-zinc-400 hover:text-white hover:bg-white/10"
                          }`}
                          aria-label="Logo"
                          aria-pressed={activeImagesTab === "logos"}
                        >
                          <Sparkles className="w-4 h-4" />
                          <span className="text-xs font-semibold">Logo</span>
                        </button>
                      </div>

                      <div className="relative min-w-[6.25rem] flex-1">
                        <button
                          type="button"
                          onClick={() => setResMenuOpen((open) => !open)}
                          className="h-10 w-full inline-flex isolate transform-gpu items-center justify-between gap-2 px-3 rounded-2xl transition text-sm bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] text-zinc-200 hover:bg-black/30"
                          aria-label="Resolución"
                          aria-expanded={resMenuOpen}
                        >
                          <span className="inline-flex items-center gap-2 truncate">
                            <span className="text-[10px] font-extrabold tracking-wider text-zinc-400/90">
                              RES
                            </span>
                            <span className="font-semibold truncate">
                              {RES_FILTERS.find((f) => f.id === imagesResFilter)
                                ?.label || "Todas"}
                            </span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 shrink-0 transition-transform ${resMenuOpen ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {resMenuOpen && (
                            <motion.ul
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: 0.14 }}
                              className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl bg-black/70 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
                            >
                              {RES_FILTERS.map((filter) => (
                                <li key={filter.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setImagesResFilter(filter.id);
                                      setResMenuOpen(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm transition ${
                                      imagesResFilter === filter.id
                                        ? "bg-white/10 font-bold text-white"
                                        : "text-zinc-300 hover:bg-white/5 hover:text-white"
                                    }`}
                                  >
                                    {filter.label}
                                  </button>
                                </li>
                              ))}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {imagesLoading && artworkSelection.ordered.length === 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className={`w-full overflow-hidden rounded-xl bg-zinc-900 shadow-md animate-pulse ${artworkSelection.aspect}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
              ) : artworkSelection.ordered.length === 0 ? (
                <div className="text-sm text-zinc-400">
                  No hay imágenes disponibles con los filtros actuales.
                </div>
              ) : (
                <DetailsArrowCarousel
                  key={activeImagesTab}
                  {...(isLogoTab ? PHONE_WIDE_CAROUSEL : PHONE_POSTER_CAROUSEL)}
                  className="pt-1 pb-3"
                >
                  {artworkSelection.ordered.map((img) => {
                    const filePath = img?.file_path;
                    if (!filePath) return null;
                    const isActive = artworkSelection.activePath === filePath;
                    const resText = imgResLabel(img);
                    const select = () =>
                      isLogoTab
                        ? handleSelectLogo(filePath, img)
                        : handleSelectMobilePoster(filePath, img);

                    return (
                      <SwiperSlide key={filePath} className="h-full pt-1 pb-3">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={select}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              select();
                            }
                          }}
                          // Tarjeta VERBATIM de la ficha móvil, indicadores
                          // incluidos: la resolución y el botón de copiar URL
                          // solo aparecen al pasar por encima. Al portarla les
                          // quité esa condición pensando que en un teléfono no
                          // se verían nunca -- y es cierto, ahí están ocultos--,
                          // pero dejarlos fijos ensucia cada tarjeta con un
                          // rótulo y un botón permanentes que la ficha no tiene.
                          // Con la condición puesta, este panel se comporta
                          // exactamente como esa misma tarjeta cuando se abre
                          // con ratón.
                          className={`group relative w-full rounded-xl overflow-hidden bg-zinc-900 shadow-md cursor-pointer
                        transition-all duration-300 transform-gpu hover:-translate-y-1
                        after:pointer-events-none after:absolute after:inset-0 after:z-30 after:rounded-[inherit] after:content-[''] after:transition-shadow after:duration-300
                        ${
                          isActive
                            ? "shadow-[0_0_12px_rgba(16,185,129,0.35)] after:shadow-[inset_0_0_0_2px_rgba(52,211,153,1)] hover:shadow-[0_0_16px_rgba(16,185,129,0.45)]"
                            : "hover:shadow-yellow-900/20"
                        }`}
                          aria-label="Seleccionar"
                        >
                          <div
                            className={`relative w-full overflow-hidden ${artworkSelection.aspect} ${
                              isLogoTab
                                ? "bg-gradient-to-br from-white/10 via-black/50 to-black/70 p-4"
                                : "bg-black/40"
                            }`}
                          >
                            <OptimizedImage
                              src={`https://image.tmdb.org/t/p/${artworkSelection.size}${filePath}`}
                              alt={
                                isLogoTab
                                  ? `Logo de ${title}`
                                  : `Portada sin idioma de ${title}`
                              }
                              loading="lazy"
                              decoding="async"
                              className={`w-full h-full ${isLogoTab ? "object-contain" : "object-cover"} transition-transform duration-500 ease-out transform-gpu
                            group-hover:scale-[1.08]`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          </div>

                          {isActive && (
                            <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-400 rounded-full shadow-lg shadow-emerald-500/50 ring-2 ring-white/20" />
                          )}

                          {resText && (
                            <div className="absolute bottom-2.5 left-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-10 pointer-events-none">
                              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shadow-[0_0_6px_rgba(255,255,255,0.4)]" />
                                {resText}
                              </span>
                            </div>
                          )}

                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCopyImageUrl(filePath);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                handleCopyImageUrl(filePath);
                              }
                            }}
                            className="group/link absolute bottom-0 right-0 z-20 p-2.5 rounded-tl-xl border-l border-t backdrop-blur-md shadow-sm transition-all duration-300 ease-out transform-gpu origin-bottom-right scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100 bg-black/40 border-white/10 text-zinc-300 hover:bg-white/20 hover:text-white"
                            aria-label="Copiar URL"
                          >
                            <LinkIcon className="w-[18px] h-[18px]" />
                            <div className="pointer-events-none absolute bottom-full mb-2 right-0 z-[100] scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/link:scale-100 group-hover/link:opacity-100 group-hover/link:delay-[2000ms]">
                              Copiar URL
                            </div>
                          </div>
                        </div>
                      </SwiperSlide>
                    );
                  })}
                </DetailsArrowCarousel>
              )}
            </section>
          </AnimatedSection>

          {/* === TRÁILER Y VÍDEOS === */}
          <AnimatedSection delay={0.04}>
            <section className="mt-6 group/section">
              <SectionTitle title="Tráiler y vídeos" icon={MonitorPlay} />
              {videosLoading && videos.length === 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={index}
                      className="relative isolate overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg animate-pulse"
                      aria-hidden="true"
                    >
                      <div className="aspect-video bg-white/5" />
                      <div className="h-[120px] p-4">
                        <div className="h-4 w-3/4 rounded bg-white/10" />
                        <div className="mt-3 h-5 w-16 rounded-full bg-white/10" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : videos.length === 0 ? (
                <div className="text-sm text-zinc-400">
                  No hay tráileres o vídeos disponibles en TMDb para este título.
                </div>
              ) : (
                <DetailsArrowCarousel {...PHONE_WIDE_CAROUSEL} className="pb-2">
                  {videos.slice(0, 20).map((video) => {
                    const thumb = videoThumbUrl(video);
                    const fallback = data?.backdropPath
                      ? `https://image.tmdb.org/t/p/w780${data.backdropPath}`
                      : "/placeholder.png";

                    return (
                      <SwiperSlide
                        key={`${video.site}:${video.key}`}
                        className="h-full"
                      >
                        <button
                          type="button"
                          onClick={() => setActiveVideo(video)}
                          aria-label={video.name || "Ver vídeo"}
                          className="relative isolate w-full h-full text-left flex flex-col rounded-2xl overflow-hidden bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu group"
                        >
                          <div className="relative z-10 aspect-video overflow-hidden">
                            <OptimizedImage
                              src={thumb || fallback}
                              alt={video.name || "Video"}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-14 h-14 rounded-full bg-yellow-400/15 flex items-center justify-center backdrop-blur-md">
                                <Play className="w-7 h-7 text-yellow-200 translate-x-[1px]" />
                              </div>
                            </div>
                          </div>

                          <div className="relative z-10 flex flex-col shrink-0 h-[120px] p-4 items-start w-full">
                            <div className="w-full min-h-[22px]">
                              <div className="font-bold text-white leading-snug text-[16px] line-clamp-1 truncate">
                                {video.name || "Vídeo"}
                              </div>
                            </div>

                            <div className="mt-2 flex items-center gap-3 w-full overflow-hidden">
                              <div className="flex items-center gap-3 flex-nowrap overflow-x-auto no-scrollbar pb-1">
                                {video.official && (
                                  <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
                                    OFFICIAL
                                  </span>
                                )}
                                {video.type && (
                                  <span
                                    className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
                                      video.type.toLowerCase() === "trailer"
                                        ? "text-red-300"
                                        : "text-sky-300"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        video.type.toLowerCase() === "trailer"
                                          ? "bg-red-400"
                                          : "bg-sky-400"
                                      }`}
                                    />
                                    {video.type}
                                  </span>
                                )}
                                {video.iso_639_1 && (
                                  <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                                    {video.iso_639_1}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 text-xs text-zinc-400 flex items-center gap-2">
                              <span className="font-semibold text-zinc-200">
                                {video.site || "—"}
                              </span>
                              {video.published_at && (
                                <>
                                  <span className="text-zinc-600">·</span>
                                  <span className="shrink-0">
                                    {new Date(
                                      video.published_at,
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
                </DetailsArrowCarousel>
              )}
            </section>
          </AnimatedSection>

          {/* === SOUNDTRACK Y MÚSICA === */}
          {soundtrack?.query ? (
            <AnimatedSection delay={0.06}>
              <section className="mt-6 group/section">
                <SectionTitle title="Soundtrack y música" icon={Music2} />
                {soundtrack.loading && soundtrack.tracks.length === 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <div
                        key={index}
                        className="relative isolate overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg animate-pulse"
                        aria-hidden="true"
                      >
                        <div className="aspect-square bg-white/5" />
                        <div className="h-[144px] p-4">
                          <div className="h-4 w-3/4 rounded bg-white/10" />
                          <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : soundtrack.tracks.length === 0 ? (
                  <div className="relative isolate overflow-hidden rounded-2xl bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg p-5 text-sm text-zinc-400">
                    <div className="relative z-10">
                      {soundtrack.error ||
                        "No se encontraron canciones de Spotify para este título."}
                      {soundtrack.spotifyUrl && (
                        <a
                          href={soundtrack.spotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 font-bold text-yellow-300 hover:text-yellow-200"
                        >
                          Buscar en Spotify
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <DetailsArrowCarousel {...PHONE_WIDE_CAROUSEL} className="pb-2">
                    {soundtrack.tracks.map((track) => {
                      const badge = getSoundtrackSourceBadge(track.source);
                      return (
                        <SwiperSlide key={track.id} className="h-full">
                          <button
                            type="button"
                            onClick={() => soundtrack.onOpen?.(track.id)}
                            aria-label={track.trackName || "Reproducir música"}
                            className="relative isolate w-full h-full text-left flex flex-col rounded-2xl overflow-hidden bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-lg shadow-lg transform-gpu group"
                          >
                            <div className="relative z-10 aspect-square overflow-hidden bg-black/40">
                              <OptimizedImage
                                src={track.artworkUrl || "/placeholder.png"}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-xl transform-gpu scale-110"
                                aria-hidden="true"
                              />
                              <OptimizedImage
                                src={track.artworkUrl || "/placeholder.png"}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-14 h-14 rounded-full bg-yellow-400/15 flex items-center justify-center backdrop-blur-md">
                                  <Music2 className="w-7 h-7 text-yellow-200" />
                                </div>
                              </div>
                            </div>

                            <div className="relative z-10 flex flex-col shrink-0 h-[144px] p-4 items-start w-full overflow-hidden">
                              <div className="w-full h-[44px] mb-1">
                                <div
                                  className="font-bold text-white leading-snug text-[16px] line-clamp-2"
                                  title={track.trackName}
                                >
                                  {track.trackName}
                                </div>
                              </div>
                              <div className="w-full">
                                <div
                                  className="truncate text-xs font-medium text-zinc-400"
                                  title={track.artistName}
                                >
                                  {track.artistName}
                                </div>
                              </div>
                              <div className="mt-auto flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${badge.textClass}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`}
                                  />
                                  {badge.label}
                                </span>
                              </div>
                            </div>
                          </button>
                        </SwiperSlide>
                      );
                    })}
                  </DetailsArrowCarousel>
                )}
              </section>
            </AnimatedSection>
          ) : null}
        </section>

        {/* === ANÁLISIS DE SENTIMIENTOS === */}
        <section className="sv-phone-section" id="phone-section-sentiment" ref={registerSection("sentiment")}>
          <AnimatedSection delay={0.04} renderImmediately>
            <section className="group/section">
              <SectionTitle title="Análisis de sentimientos" icon={Sparkles} />
              <div
                className={`mt-3 sm:mt-4 relative isolate overflow-hidden rounded-2xl transform-gpu ${LIQUID_GLASS_BAR}`}
              >
                <LiquidGlassOpticalLayers />
                <div className="relative z-10 flex items-center justify-between border-b border-transparent bg-white/5 px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-inner">
                      <OptimizedImage
                        src="/logo-Trakt.png"
                        alt="Trakt"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="text-base font-bold leading-tight text-white">
                        Opiniones de la comunidad de Trakt
                      </h3>
                      <p className="text-xs font-medium text-zinc-400">
                        Resumen oficial de sentimientos de Trakt sobre{" "}
                        <span className="text-zinc-200">{title}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 p-6">
                  {/* UNA columna, no dos: el `md:grid-cols-2` de la ficha
                      completa mira el VIEWPORT y aquí casaría siempre, metiendo
                      dos columnas de texto en un panel de 400px. */}
                  <div className="grid grid-cols-1 gap-5">
                    <div className="relative isolate overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-emerald-500/15 via-emerald-500/[0.04] to-transparent">
                      <div className="relative z-10 mb-4 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                          <ThumbsUp className="h-4 w-4" />
                        </div>
                        <span className="font-bold tracking-wide text-emerald-100">
                          Positivo
                        </span>
                      </div>
                      {sentimentPros.length ? (
                        <ul className="relative z-10 space-y-3">
                          {sentimentPros.map((value, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                              <span>{value}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="relative z-10 text-sm italic text-zinc-500">
                          No hay suficientes datos positivos.
                        </div>
                      )}
                    </div>

                    <div className="relative isolate overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-rose-500/15 via-rose-500/[0.04] to-transparent">
                      <div className="relative z-10 mb-4 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                          <ThumbsDown className="h-4 w-4" />
                        </div>
                        <span className="font-bold tracking-wide text-rose-100">
                          Negativo
                        </span>
                      </div>
                      {sentimentCons.length ? (
                        <ul className="relative z-10 space-y-3">
                          {sentimentCons.map((value, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                              <span>{value}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="relative z-10 text-sm italic text-zinc-500">
                          No hay suficientes datos negativos.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </AnimatedSection>
        </section>

        {/* === TEMPORADAS (solo series) === */}
        {type === "tv" && (
          <section className="sv-phone-section" id="phone-section-seasons" ref={registerSection("seasons")}>
            <AnimatedSection delay={0.04} renderImmediately>
              <section className="group/section">
                <SectionTitle title="Temporadas" icon={Layers} />
                {/* Una tarjeta por fila: los `sm:`/`lg:grid-cols` de la ficha
                    completa van por viewport y aquí darían tres columnas. */}
                <div className="grid grid-cols-1 gap-4">
                  {visibleSeasons.map((season) => {
                    const sn = Number(season.season_number);
                    const imdbRating = toRatingNumber(seasonImdbRatings?.[sn]);
                    const graphRating = seriesGraphSeasonRatings.get(sn) ?? null;
                    const rating = seasonStructuresMismatch
                      ? graphRating
                      : (imdbRating ?? graphRating);
                    const imdbSeasonUrl = imdbId
                      ? `https://www.imdb.com/title/${imdbId}/episodes/?season=${sn}`
                      : null;
                    const totalEp = Number(season?.episode_count || 0) || null;
                    const watchedEp = getWatchedEpisodeCountForSeason(
                      episodesWatched?.watchedBySeason,
                      sn,
                      totalEp || 0,
                    );
                    const percentage = totalEp
                      ? Math.round((watchedEp / totalEp) * 100)
                      : 0;
                    const barColor =
                      percentage === 100 ? "bg-emerald-500" : "bg-yellow-500";

                    return (
                      <button
                        key={sn}
                        type="button"
                        onClick={() => onOpenSeason?.(sn)}
                        className={`group relative isolate overflow-hidden rounded-2xl transform-gpu text-left w-full ${LIQUID_GLASS_CARD} transition-all`}
                        aria-label={`Ver Temporada ${sn}`}
                      >
                        <LiquidGlassOpticalLayers />
                        <div className="absolute -right-4 -top-6 text-[100px] font-black text-white/5 select-none z-0">
                          {sn}
                        </div>

                        <div className="relative z-10 p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-lg font-extrabold text-white">
                                Temporada {sn}
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

                            {imdbSeasonUrl && (
                              <a
                                href={imdbSeasonUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  window.open(
                                    imdbSeasonUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-zinc-400 transition hover:bg-white hover:text-black"
                                aria-label="Ver temporada en IMDb"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>

                          {totalEp != null && (
                            <div className="mt-6">
                              <div className="mb-1.5 flex items-end justify-between text-xs font-bold">
                                <span
                                  className={
                                    percentage > 0 ? "text-white" : "text-zinc-500"
                                  }
                                >
                                  {watchedEp}{" "}
                                  <span className="text-zinc-500 font-normal">
                                    vistos
                                  </span>
                                </span>
                                <span className="text-zinc-500">{percentage}%</span>
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
            </AnimatedSection>
          </section>
        )}

        {/* === VALORACIÓN DE EPISODIOS (solo series) === */}
        {type === "tv" && (
          <section className="sv-phone-section" id="phone-section-episodes" ref={registerSection("episodes")}>
            <AnimatedSection delay={0.04}>
              <section className="group/section">
                <SectionTitle title="Valoración de Episodios" icon={BarChart3} />
                {episodeRatingsError && (
                  <p className="text-sm text-red-400 mb-2">
                    {episodeRatingsError}
                  </p>
                )}
                {!episodeRatingsLoading &&
                  !episodeRatingsError &&
                  !episodeRatings && (
                    <p className="text-sm text-zinc-400 mb-2">
                      No hay datos de episodios disponibles.
                    </p>
                  )}
                {!!episodeRatings && !episodeRatingsError && (
                  <EpisodeRatingsGrid
                    ratings={episodeRatings}
                    showId={Number(id)}
                    tmdbSeasons={tmdbSeasons}
                    density="compact"
                  />
                )}
              </section>
            </AnimatedSection>
          </section>
        )}

        {/* === COMENTARIOS === */}
        <section className="sv-phone-section" id="phone-section-comments" ref={registerSection("comments")}>
          <AnimatedSection delay={0.04} renderImmediately>
            <section className="group/section">
              <SectionTitle title="Comentarios" icon={MessageSquare} />
              <div
                className={`relative isolate overflow-hidden rounded-2xl transform-gpu ${LIQUID_GLASS_HOST} ${LIQUID_GLASS_ELEVATION}`}
              >
                <LiquidGlassOpticalLayers />
                {/* Las pestañas se desplazan en horizontal: los tres rótulos no
                    caben en el ancho de un teléfono y cortarlos dejaría el
                    filtro histórico inalcanzable. */}
                <div className="relative z-10 flex items-center justify-between gap-2 border-b border-transparent bg-white/5 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {[
                      { id: "likes30", label: "Top 30 Días" },
                      { id: "likesAll", label: "Top Histórico" },
                      { id: "recent", label: "Recientes" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => selectCommentsTab(tab.id)}
                        aria-pressed={commentsTab === tab.id}
                        className={`relative isolate flex shrink-0 transform-gpu items-center justify-center rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                          commentsTab === tab.id
                            ? `${LIQUID_GLASS_CARD} text-white`
                            : "bg-transparent text-zinc-400 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {commentsTab === tab.id && <LiquidGlassOpticalLayers />}
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                  {comments.loading && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-500" />
                  )}
                </div>

                <div className="relative z-10 space-y-4 p-4 sm:p-6">
                  {!comments.loading && comments.items.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                      <MessageSquare className="mb-2 h-8 w-8 opacity-20" />
                      <p className="text-sm">Sé el primero en comentar.</p>
                    </div>
                  )}

                  {comments.items.map((comment) => {
                    const user = comment?.user || {};
                    const avatar =
                      user?.images?.avatar?.full ||
                      user?.images?.avatar?.medium ||
                      null;
                    const text = stripHtml(
                      comment?.comment?.comment ?? comment?.comment ?? "",
                    );
                    const created = comment?.created_at
                      ? formatDateTimeEs(comment.created_at)
                      : "";
                    const authorName = user?.name || user?.username || "Usuario";

                    return (
                      <div
                        key={String(comment?.id || `${user?.username}-${created}`)}
                        className="group relative isolate flex gap-4 overflow-hidden rounded-2xl bg-black/10 p-5 transform-gpu transition-colors duration-300"
                      >
                        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-lg font-black text-white shadow-lg ring-2 ring-white/10">
                          <Avatar
                            src={avatar}
                            name={authorName}
                            alt={user?.username}
                          />
                        </div>

                        <div className="relative z-10 min-w-0 flex-1">
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">
                                {authorName}
                              </span>
                              {user?.vip && (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
                                  VIP
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-zinc-500">{created}</span>
                          </div>

                          <div className="relative text-sm leading-relaxed text-zinc-300">
                            <span className="absolute -left-3 -top-1 font-serif text-4xl text-white/5">
                              “
                            </span>
                            <p className="whitespace-pre-line">{text}</p>
                          </div>

                          <div className="mt-3 flex items-center gap-4 border-t border-white/5 pt-3">
                            <CommentLikeButton
                              commentId={comment?.id}
                              mediaType={type}
                              tmdbId={id}
                              likes={Number(comment?.likes || 0)}
                              liked={Boolean(comment?.liked)}
                              canLike={canLikeComments}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {comments.pageCount > 1 && (
                    <nav
                      className="flex flex-wrap items-center justify-between gap-3 pt-2"
                      aria-label="Paginación de comentarios"
                    >
                      <p className="text-xs text-zinc-500" aria-live="polite">
                        Página {comments.page} de {comments.pageCount}
                        {comments.total > 0
                          ? ` · ${comments.total} comentarios`
                          : ""}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => selectCommentsPage(comments.page - 1)}
                          disabled={comments.loading || comments.page <= 1}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => selectCommentsPage(comments.page + 1)}
                          disabled={
                            comments.loading ||
                            comments.page >= comments.pageCount
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Siguiente
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </nav>
                  )}
                </div>
              </div>
            </section>
          </AnimatedSection>
        </section>

        {/* === LISTAS === */}
        {!lists.error && (
          <section className="sv-phone-section" id="phone-section-lists" ref={registerSection("lists")}>
            <AnimatedSection delay={0.04} renderImmediately>
              <section className="group/section">
                <SectionTitle title="Listas" icon={ListVideo} />
                {/* Una tarjeta por fila, por el mismo motivo que Temporadas. */}
                <div className="grid grid-cols-1 gap-6">
                  {lists.loading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                      <span className="text-sm font-medium animate-pulse">
                        Buscando listas y portadas...
                      </span>
                    </div>
                  ) : (
                    lists.items.map((row) => {
                      const list = row?.list || row || {};
                      const user = row?.user || list?.user || {};
                      const previews = row?.previewPosters || [];
                      const name = list?.name || "Lista";
                      const itemCount = Number(list?.item_count || list?.items || 0);
                      const likes = Number(list?.likes || 0);
                      const username = user?.username || user?.name || null;
                      const listId = list?.id || null;
                      const internalUrl = listId
                        ? `/lists/community/${encodeURIComponent(String(listId))}`
                        : null;

                      return (
                        <Link
                          key={String(listId || `${username}-${name}` || name)}
                          href={internalUrl || "#"}
                          aria-disabled={!internalUrl}
                          className={`group relative isolate flex flex-col overflow-hidden rounded-3xl transform-gpu transition-all duration-500 ${LIQUID_GLASS_CARD} ${
                            internalUrl ? "" : "pointer-events-none opacity-60"
                          }`}
                        >
                          <LiquidGlassOpticalLayers />
                          <div className="relative z-10 h-52 w-full bg-gradient-to-b from-white/5 to-transparent p-6 overflow-visible">
                            {previews.length > 0 ? (
                              <div className="h-full w-full flex items-center justify-center overflow-visible">
                                <PosterStack posters={previews} />
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center opacity-10">
                                <ListVideo className="h-20 w-20" />
                              </div>
                            )}
                          </div>

                          <div className="relative z-10 flex flex-1 flex-col justify-between bg-black/25 p-5">
                            <div>
                              <h4 className="line-clamp-1 text-lg font-bold text-white">
                                {name}
                              </h4>
                              {list?.description && (
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                  {stripHtml(list.description)}
                                </p>
                              )}
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[10px] font-black text-white ring-1 ring-white/20">
                                  <Avatar
                                    src={user?.images?.avatar?.full || null}
                                    name={username || "user"}
                                  />
                                </span>
                                <span className="text-xs font-medium text-zinc-300 truncate max-w-[120px]">
                                  {username || "—"}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-xs font-bold text-zinc-500">
                                <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-zinc-300">
                                  {itemCount} items
                                </span>
                                <span className="flex items-center gap-1">
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
              </section>
            </AnimatedSection>
          </section>
        )}
      </div>

      {/* Reproductor de vídeo, el MISMO componente que la ficha completa. */}
      <VideoModal
        open={!!activeVideo}
        video={activeVideo}
        onClose={() => setActiveVideo(null)}
      />
    </div>
  );
}
