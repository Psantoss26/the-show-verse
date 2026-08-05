"use client";
import { LIQUID_GLASS_BAR, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import OptimizedImage from "@/components/OptimizedImage";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import "@/app/globals.css";
import { useAuth } from "@/context/AuthContext";
import UserAvatar from "@/components/auth/UserAvatar";
import { useTranslation } from "@/lib/i18n";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  FilmIcon,
  TvIcon,
  CalendarDaysIcon,
  Heart,
  Bookmark,
  ListVideo,
  Search as SearchIcon,
  X as XIcon,
  Menu as MenuIcon,
  HomeIcon,
  Compass,
  Play,
  Eye,
  FolderKanban,
  ThumbsUp,
  History,
  Trash2,
  Users,
  Check,
  SlidersHorizontal,
  UserRoundSearch,
} from "lucide-react";
import WatchNextAssistant from "@/components/WatchNextAssistant";
import NetflixSyncListener from "@/components/NetflixSyncListener";
import { fuzzySimilarity, tokenFuzzyMatches } from "@/lib/search/fuzzy";
import {
  addSearchHistory,
  clearSearchHistory,
  readSearchHistory,
  removeSearchHistory,
} from "@/lib/search/history";
import {
  getPrimarySearchTitle,
  getTitleCandidates,
  normalizeSearchText,
} from "@/lib/search/titleMatching";

// Búsqueda tolerante a erratas: por debajo de esta longitud de consulta el fuzzy
// es ruido (todo "se parece"), así que se mantiene el comportamiento por substring.
const FUZZY_MIN_QUERY_LEN = 4;
// Similitud mínima [0,1] para dar puntos fuzzy (~1-2 letras de diferencia).
const FUZZY_MIN_SIMILARITY = 0.7;
// Prefix-fallback: TMDB NO tolera erratas, pero SÍ busca por prefijo. Si una
// consulta (≥ esta longitud) no devuelve nada, se reintenta con un prefijo
// recortado (la errata suele ir al final) y el fuzzy re-rankea el resultado real.
const SEARCH_FALLBACK_MIN_LEN = 5;
// Relevancia mínima de título (fuzzy) para conservar un candidato del fallback,
// y así no colar ruido del prefijo corto (que puede devolver cientos de títulos).
const FALLBACK_TITLE_MIN_SIMILARITY = 0.6;
const SEARCH_LANGUAGES = ["es-ES", "en-US"];
const SEARCH_FILTER_OPTIONS = [
  {
    id: "all",
    labelKey: "search_filter_all",
    fallbackLabel: "Todo",
    Icon: SlidersHorizontal,
  },
  {
    id: "movies",
    labelKey: "search_filter_movies",
    fallbackLabel: "Películas",
    Icon: FilmIcon,
  },
  {
    id: "series",
    labelKey: "search_filter_series",
    fallbackLabel: "Series",
    Icon: TvIcon,
  },
  {
    id: "collections",
    labelKey: "search_filter_collections",
    fallbackLabel: "Colecciones",
    Icon: FolderKanban,
  },
  {
    id: "users",
    labelKey: "search_filter_users",
    fallbackLabel: "Usuarios",
    Icon: Users,
  },
  {
    id: "people",
    labelKey: "search_filter_people",
    fallbackLabel: "Actores y directores",
    Icon: UserRoundSearch,
  },
];

function isActorOrDirector(item) {
  return ["Acting", "Directing"].includes(item?.known_for_department);
}

function normalizeUserSearchResult(user) {
  if (!user?.username) return null;
  return {
    ...user,
    id: user.id || user.username,
    media_type: "user",
    title: user.displayName || user.username,
  };
}

function getSearchInitials(source) {
  return String(source || "TSV")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function scoreSearchResult(item, normalizedQuery) {
  const titles = getTitleCandidates(item);
  if (!titles.length || !normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  let bestTitleScore = 0;

  for (const candidate of titles) {
    const title = normalizeSearchText(candidate);
    if (!title) continue;

    let titleScore = 0;
    if (title === normalizedQuery) titleScore += 10000;
    else if (title.startsWith(normalizedQuery)) titleScore += 7000;
    else if (title.includes(normalizedQuery)) titleScore += 5000;
    else if (normalizedQuery.length >= FUZZY_MIN_QUERY_LEN) {
      // Sin coincidencia por substring: puntuación tolerante a erratas para que
      // un título en cualquiera de los dos idiomas siga apareciendo arriba.
      const sim = fuzzySimilarity(normalizedQuery, title);
      if (sim >= FUZZY_MIN_SIMILARITY) titleScore += sim * 5000;
    }

    const titleTokens = title.split(" ").filter(Boolean);
    const matchedTokens = queryTokens.filter((token) =>
      token.length >= FUZZY_MIN_QUERY_LEN
        ? tokenFuzzyMatches(token, titleTokens)
        : title.includes(token),
    );
    if (queryTokens.length) {
      titleScore += (matchedTokens.length / queryTokens.length) * 3000;
    }

    bestTitleScore = Math.max(bestTitleScore, titleScore);
  }

  let score = bestTitleScore;
  const popularity = Number(item?.popularity || 0);
  const votes = Number(item?.vote_count || 0);
  score += Math.min(popularity, 500) * 6;
  score += Math.min(votes, 2500) * 0.2;

  return score;
}

function normalizeSearchResult(item, fallbackMediaType = null) {
  if (!item?.id) return null;
  const mediaType = item.media_type || fallbackMediaType;
  if (!["movie", "tv", "person"].includes(mediaType)) return null;
  return { ...item, media_type: mediaType };
}

function addLocalizedSearchTitles(item) {
  if (!item?._search_language) return item;
  const lang = item._search_language.startsWith("en")
    ? "en"
    : item._search_language.startsWith("es")
      ? "es"
      : "";
  if (!lang) return item;
  return {
    ...item,
    [`title_${lang}`]: item.title || item[`title_${lang}`],
    [`name_${lang}`]: item.name || item[`name_${lang}`],
  };
}

function dedupeSearchResults(results) {
  const seen = new Set();
  const byKey = new Map();
  const out = [];
  for (const item of results) {
    const normalized = addLocalizedSearchTitles(normalizeSearchResult(item));
    if (!normalized) continue;
    const key = `${normalized.media_type}:${normalized.id}`;
    if (seen.has(key)) {
      const existing = byKey.get(key);
      for (const field of [
        "title_es",
        "name_es",
        "title_en",
        "name_en",
        "original_title",
        "original_name",
      ]) {
        if (!existing[field] && normalized[field]) {
          existing[field] = normalized[field];
        }
      }
      continue;
    }
    seen.add(key);
    byKey.set(key, normalized);
    out.push(normalized);
  }
  return out;
}

/* ====================================================================
 * Componente de Búsqueda Reutilizable (Lógica y UI)
 * ==================================================================== */
function SearchBar({
  onResultClick,
  isMobile = false,
  formClassName = "",
  autoFocus = false,
  onEscape,
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [completedSearch, setCompletedSearch] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterMenuRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownId = useId();
  const filterMenuId = useId();
  const [showCollection, setShowCollection] = useState(false);
  const [portalHostReady, setPortalHostReady] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState(null);
  const pendingCollectionRef = useRef(null); // colección precargada lista para mostrar
  const activeFilterOption =
    SEARCH_FILTER_OPTIONS.find((option) => option.id === activeFilter) ||
    SEARCH_FILTER_OPTIONS[0];
  const ActiveFilterIcon = activeFilterOption.Icon;
  const translatedFilterOptions = SEARCH_FILTER_OPTIONS.map((option) => ({
    ...option,
    label: t(option.labelKey, option.fallbackLabel),
  }));

  useEffect(() => {
    setPortalHostReady(true);
  }, []);

  useEffect(() => {
    if (isMobile) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMobile]);

  // Activar colección tras 600ms de pausa
  useEffect(() => {
    setShowCollection(false);
    if (!query.trim()) return;
    const t = setTimeout(() => setShowCollection(true), 600);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target) &&
        !dropdownRef.current?.contains(e.target) &&
        !filterMenuRef.current?.contains(e.target)
      ) {
        setShowDropdown(false);
        setShowFilterMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown || !searchRef.current) {
      setDropdownPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      frameId = 0;
      const rect = searchRef.current?.getBoundingClientRect();
      if (!rect) return;

      const next = {
        top: rect.bottom + (isMobile ? 16 : 8),
        left: rect.left,
        width: rect.width,
      };
      setDropdownPosition((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width
          ? current
          : next,
      );
    };
    const schedulePositionUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
    };
  }, [showDropdown, isMobile]);

  useLayoutEffect(() => {
    if (!showFilterMenu || !filterButtonRef.current || !searchRef.current) {
      setFilterMenuPosition(null);
      return undefined;
    }

    let frameId = 0;
    const updatePosition = () => {
      frameId = 0;
      const filterBtnRect = filterButtonRef.current?.getBoundingClientRect();
      const searchRect = searchRef.current?.getBoundingClientRect();
      if (!filterBtnRect || !searchRect) return;

      const viewportPadding = 16;
      const width = Math.min(272, window.innerWidth - viewportPadding * 2);
      const left = Math.min(
        window.innerWidth - width - viewportPadding,
        Math.max(viewportPadding, filterBtnRect.right - width),
      );
      const next = {
        top: searchRect.bottom + (isMobile ? 16 : 8),
        left,
        width,
      };

      setFilterMenuPosition((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width
          ? current
          : next,
      );
    };
    const schedulePositionUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
    };
  }, [showFilterMenu, isMobile]);

  const openSearchHistory = () => {
    const history = readSearchHistory();
    setSearchHistory(history);
    setShowDropdown(true);
  };

  // Búsqueda multi y colección en paralelo
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setCompletedSearch(null);
      if (inputRef.current === document.activeElement) {
        openSearchHistory();
      } else {
        setShowDropdown(false);
      }
      setIsSearching(false);
      pendingCollectionRef.current = null;
      return;
    }

    pendingCollectionRef.current = null;

    setIsSearching(true);
    setCompletedSearch(null);
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeSearchText(trimmedQuery);
    const controller = new AbortController();

    const searchTimer = setTimeout(async () => {
      try {
        const fetchUserResults = async () => {
          try {
            const params = new URLSearchParams({
              q: trimmedQuery,
              limit: "12",
            });
            const response = await fetch(
              `/api/users/search?${params.toString()}`,
              {
                signal: controller.signal,
              },
            );
            if (!response.ok) return [];
            const payload = await response.json();
            return (payload.results || [])
              .map(normalizeUserSearchResult)
              .filter(Boolean);
          } catch (error) {
            if (error?.name === "AbortError") throw error;
            return [];
          }
        };

        if (activeFilter === "users") {
          const userResults = await fetchUserResults();
          setResults(userResults);
          setShowDropdown(true);
          setIsSearching(false);
          setCompletedSearch({ query: trimmedQuery, filter: activeFilter });
          return;
        }

        // Motor de fetch+ensamblado, reutilizable para la consulta original y para
        // el prefijo del fallback. El scoring es SIEMPRE contra la consulta original
        // normalizada, así el fuzzy elige el título correcto aunque hayamos buscado
        // por prefijo.
        const fetchAndAssemble = async (searchQuery) => {
          const buildSearchUrl = (path, page = 1, language = "es-ES") => {
            const params = new URLSearchParams({
              api_key: apiKey || "",
              language,
              query: searchQuery,
              page: String(page),
              include_adult: "false",
            });
            return `https://api.themoviedb.org/3${path}?${params.toString()}`;
          };

          const fetchJson = async (path, page = 1, language = "es-ES") => {
            const res = await fetch(buildSearchUrl(path, page, language), {
              signal: controller.signal,
            });
            if (!res.ok) return { results: [] };
            return res.json();
          };

          const fetchResults = async (path, page = 1) => {
            const payloads = await Promise.all(
              SEARCH_LANGUAGES.map((language) =>
                fetchJson(path, page, language).then((payload) => ({
                  language,
                  payload,
                })),
              ),
            );
            return payloads.flatMap(({ language, payload }) =>
              (payload.results || []).map((item) => ({
                ...item,
                _search_language: language,
              })),
            );
          };

          const [
            multiRaw,
            moviePage1Raw,
            moviePage2Raw,
            tvPage1Raw,
            tvPage2Raw,
            personPage1Raw,
            personPage2Raw,
            collRaw,
          ] = await Promise.all([
            activeFilter === "all"
              ? fetchResults("/search/multi")
              : Promise.resolve([]),
            ["all", "movies"].includes(activeFilter)
              ? fetchResults("/search/movie")
              : Promise.resolve([]),
            ["all", "movies"].includes(activeFilter)
              ? fetchResults("/search/movie", 2)
              : Promise.resolve([]),
            ["all", "series"].includes(activeFilter)
              ? fetchResults("/search/tv")
              : Promise.resolve([]),
            ["all", "series"].includes(activeFilter)
              ? fetchResults("/search/tv", 2)
              : Promise.resolve([]),
            ["all", "people"].includes(activeFilter)
              ? fetchResults("/search/person")
              : Promise.resolve([]),
            ["all", "people"].includes(activeFilter)
              ? fetchResults("/search/person", 2)
              : Promise.resolve([]),
            ["all", "collections"].includes(activeFilter)
              ? fetchResults("/search/collection")
              : Promise.resolve([]),
          ]);

          const multiResults = multiRaw
            .map((item) => normalizeSearchResult(item))
            .filter(Boolean);
          const movieResults = [...moviePage1Raw, ...moviePage2Raw]
            .map((item) => normalizeSearchResult(item, "movie"))
            .filter(Boolean);
          const tvResults = [...tvPage1Raw, ...tvPage2Raw]
            .map((item) => normalizeSearchResult(item, "tv"))
            .filter(Boolean);
          const personResults = [...personPage1Raw, ...personPage2Raw]
            .map((item) => normalizeSearchResult(item, "person"))
            .filter(Boolean);

          const items = dedupeSearchResults([
            ...multiResults,
            ...movieResults,
            ...tvResults,
            ...personResults,
          ]).sort(
            (a, b) =>
              scoreSearchResult(b, normalizedQuery) -
                scoreSearchResult(a, normalizedQuery) ||
              (b.popularity || 0) - (a.popularity || 0),
          );

          const seenCollections = new Set();
          const collResults = collRaw
            .filter((collection) => {
              if (!collection?.id || seenCollections.has(collection.id)) {
                return false;
              }
              seenCollections.add(collection.id);
              return true;
            })
            .map((collection) => ({
              ...collection,
              media_type: "collection",
              title: collection.name,
            }));

          return { items, collResults };
        };

        const userResultsPromise =
          activeFilter === "all" ? fetchUserResults() : Promise.resolve([]);
        let { items, collResults } = await fetchAndAssemble(trimmedQuery);
        if (activeFilter === "people") {
          items = items.filter(isActorOrDirector);
        }

        // Sin resultados y consulta con cuerpo: TMDB no tolera erratas pero SÍ busca
        // por prefijo. Reintentamos con un prefijo recortado (la errata suele ir al
        // final) y conservamos solo candidatos con relevancia fuzzy real respecto a
        // la consulta ORIGINAL (para no colar el ruido de un prefijo corto).
        if (
          activeFilter !== "collections" &&
          items.length === 0 &&
          normalizedQuery.length >= SEARCH_FALLBACK_MIN_LEN
        ) {
          const prefix = trimmedQuery
            .slice(0, Math.max(4, trimmedQuery.length - 2))
            .trim();
          if (prefix.length >= 4 && prefix !== trimmedQuery) {
            const alt = await fetchAndAssemble(prefix);
            const isRelevant = (it) => {
              const titles = getTitleCandidates(it)
                .map((title) => normalizeSearchText(title))
                .filter(Boolean);
              return titles.some((title) => {
                if (
                  title.includes(normalizedQuery) ||
                  title.startsWith(normalizedQuery)
                ) {
                  return true;
                }
                if (
                  fuzzySimilarity(normalizedQuery, title) >=
                  FALLBACK_TITLE_MIN_SIMILARITY
                ) {
                  return true;
                }
                const titleTokens = title.split(" ").filter(Boolean);
                return normalizedQuery
                  .split(" ")
                  .filter((tok) => tok.length >= FUZZY_MIN_QUERY_LEN)
                  .some((tok) => tokenFuzzyMatches(tok, titleTokens));
              });
            };
            const filtered = alt.items
              .filter(isRelevant)
              .filter(
                (item) =>
                  activeFilter !== "people" || isActorOrDirector(item),
              );
            if (filtered.length) {
              items = filtered;
              collResults = alt.collResults;
            }
          }
        }

        const sortedCollections = collResults
          .slice()
          .sort(
            (a, b) =>
              scoreSearchResult(b, normalizedQuery) -
              scoreSearchResult(a, normalizedQuery),
          );
        const userResults = await userResultsPromise;

        let nextResults =
          activeFilter === "all"
            ? items.filter(
                (item) =>
                  item.media_type !== "person" || isActorOrDirector(item),
              )
            : items;
        if (activeFilter === "people") {
          nextResults = items.filter(isActorOrDirector);
        } else if (activeFilter === "collections") {
          nextResults = sortedCollections;
        } else if (activeFilter === "all" && userResults.length > 0) {
          const TOP_MULTI = 3;
          nextResults = [
            ...nextResults.slice(0, TOP_MULTI),
            ...userResults.slice(0, 2),
            ...nextResults.slice(TOP_MULTI),
          ];
        }

        // En el filtro general se conserva la inserción diferida de la mejor
        // colección para que no desplace los títulos más relevantes al escribir.
        pendingCollectionRef.current =
          activeFilter === "all" ? sortedCollections[0] || null : null;

        setResults(nextResults);
        setShowDropdown(true);
        setIsSearching(false);
        setCompletedSearch({ query: trimmedQuery, filter: activeFilter });
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Error en la búsqueda global:", err);
        setIsSearching(false);
        setCompletedSearch({ query: trimmedQuery, filter: activeFilter });
        setShowDropdown(true);
      }
    }, 300);

    return () => {
      clearTimeout(searchTimer);
      controller.abort();
    };
  }, [query, activeFilter]);

  // Insertar colección precargada instantáneamente cuando se activa
  useEffect(() => {
    if (
      activeFilter !== "all" ||
      !showCollection ||
      !pendingCollectionRef.current
    ) {
      return;
    }

    setResults((prev) => {
      if (prev.some((r) => r.media_type === "collection" && r.id === pendingCollectionRef.current.id)) return prev;
      const TOP_MULTI = 3;
      return [
        ...prev.slice(0, TOP_MULTI),
        pendingCollectionRef.current,
        ...prev.slice(TOP_MULTI),
      ];
    });
  }, [showCollection, activeFilter]);

  const handleResultClick = (item) => {
    const selectedTitle =
      item.media_type === "user"
        ? item.displayName || item.username
        : getPrimarySearchTitle(item) || query;
    setSearchHistory(addSearchHistory(selectedTitle));
    setShowDropdown(false);
    setShowFilterMenu(false);
    setQuery("");
    setResults([]);
    inputRef.current?.blur();
    if (onResultClick) onResultClick();
  };

  const handleFilterToggle = () => {
    const nextOpen = !showFilterMenu;
    setShowFilterMenu(nextOpen);
    if (nextOpen) {
      setShowDropdown(false);
    } else if (query.trim()) {
      setShowDropdown(true);
    } else {
      openSearchHistory();
    }
  };

  const handleFilterSelect = (filterId) => {
    setShowFilterMenu(false);

    if (filterId === activeFilter) {
      if (query.trim()) setShowDropdown(true);
      else openSearchHistory();
      inputRef.current?.focus();
      return;
    }

    setActiveFilter(filterId);
    setResults([]);
    setCompletedSearch(null);
    pendingCollectionRef.current = null;

    if (query.trim()) {
      setIsSearching(true);
      setShowDropdown(false);
    } else {
      openSearchHistory();
    }
    inputRef.current?.focus();
  };

  const handleHistoryClick = (historyQuery) => {
    setQuery(historyQuery);
    setShowDropdown(true);
    inputRef.current?.focus();
  };

  const handleHistoryRemove = (event, historyQuery) => {
    event.stopPropagation();
    const nextHistory = removeSearchHistory(historyQuery);
    setSearchHistory(nextHistory);
    setShowDropdown(nextHistory.length > 0);
    inputRef.current?.focus();
  };

  const handleHistoryClear = () => {
    clearSearchHistory();
    setSearchHistory([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const getBadgeConfig = (mediaType) => {
    switch (mediaType) {
      case "movie":
        return {
          textClass: "text-sky-300",
          dotClass: "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]",
        };
      case "tv":
        return {
          textClass: "text-purple-300",
          dotClass: "bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)]",
        };
      case "person":
        return {
          textClass: "text-emerald-300",
          dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
        };
      case "collection":
        return {
          textClass: "text-amber-300",
          dotClass: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]",
        };
      case "user":
        return {
          textClass: "text-cyan-300",
          dotClass: "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]",
        };
      default:
        return {
          textClass: "text-zinc-300",
          dotClass: "bg-zinc-400 shadow-[0_0_6px_rgba(161,161,170,0.8)]",
        };
    }
  };

  const getMediaTypeLabel = (item) => {
    switch (item.media_type) {
      case "movie":
        return t("search_badge_movie", "Película");
      case "tv":
        return t("search_badge_tv", "Serie");
      case "person":
        return item.known_for_department === "Directing"
          ? t("search_badge_director", "Director/a")
          : t("search_badge_actor", "Actor/actriz");
      case "collection":
        return t("search_badge_collection", "Colección");
      case "user":
        return t("search_badge_user", "Usuario");
      default:
        return item.media_type;
    }
  };

  const currentSearchComplete =
    Boolean(query.trim()) &&
    completedSearch?.query === query.trim() &&
    completedSearch?.filter === activeFilter &&
    !isSearching;

  return (
    <div
      className={`relative min-w-0 w-full ${isMobile ? "max-w-full" : "max-w-lg"}`}
      ref={searchRef}
    >
      <form
        onSubmit={(e) => e.preventDefault()}
        className={`relative w-full ${formClassName}`}
      >
        <div
          onClick={(event) => {
            if (event.target.closest("button")) return;
            inputRef.current?.focus();
            if (!query.trim()) openSearchHistory();
          }}
          className={`
            relative flex items-center w-full transition-all duration-300 ease-out
            rounded-full group
            ${
              isMobile
                ? `${LIQUID_GLASS_PANEL} border border-white/[0.1] hover:bg-black/[0.34] focus-within:bg-black/[0.38] focus-within:ring-2 focus-within:ring-white/[0.12]`
                : "bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[0_15px_30px_-10px_rgba(0,0,0,0.5)] hover:bg-black/30 focus-within:bg-black/40 focus-within:ring-4 focus-within:ring-white/10"
            }
            ${isMobile ? "h-12 pl-4 pr-3" : "h-11 pl-4 pr-3"}
          `}
        >
          {/* Lupa siempre blanca y visible */}
          <SearchIcon
            className="w-5 h-5 text-white flex-shrink-0 opacity-100 group-focus-within:scale-110 transition-transform duration-300"
            strokeWidth={2.5}
          />

          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setShowFilterMenu(false);
              if (query.trim()) {
                setShowDropdown(true);
              } else {
                openSearchHistory();
              }
            }}
            onClick={() => {
              if (!query.trim()) openSearchHistory();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (showFilterMenu) {
                  setShowFilterMenu(false);
                  return;
                }
                setShowDropdown(false);
                inputRef.current?.blur();
                onEscape?.();
              }
            }}
            aria-label={t("search_input_label", "Buscar en The Show Verse")}
            aria-controls={showDropdown ? dropdownId : undefined}
            placeholder={
              isMobile
                ? t("search_mobile_placeholder", "Buscar...")
                : t(
                    "search_placeholder",
                    "Buscar películas, series, actores o colecciones...",
                  )
            }
            className={`
              flex-1 w-full bg-transparent border-none focus:ring-0 shadow-none outline-none
              text-white placeholder-neutral-400 text-sm font-medium ml-3 h-full
            `}
          />

          <div className="flex items-center gap-2">
            {isSearching && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}

            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  openSearchHistory();
                }}
                aria-label={t("search_clear_input", "Borrar búsqueda")}
                className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}

            <button
              ref={filterButtonRef}
              type="button"
              onClick={handleFilterToggle}
              aria-label={`${t("search_filter_button", "Filtrar búsqueda")}: ${t(
                activeFilterOption.labelKey,
                activeFilterOption.fallbackLabel,
              )}`}
              aria-controls={showFilterMenu ? filterMenuId : undefined}
              aria-expanded={showFilterMenu}
              aria-haspopup="menu"
              title={`${t("search_filter_button", "Filtrar búsqueda")}: ${t(
                activeFilterOption.labelKey,
                activeFilterOption.fallbackLabel,
              )}`}
              className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[color,background-color,box-shadow,transform] duration-200 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 ${
                showFilterMenu
                  ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                  : activeFilter === "all"
                    ? "text-white/55 hover:bg-white/[0.08] hover:text-white"
                    : "bg-emerald-400/[0.14] text-emerald-200 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.18),0_4px_12px_rgba(16,185,129,0.08)] hover:bg-emerald-400/[0.2]"
              }`}
            >
              <ActiveFilterIcon
                className="h-[18px] w-[18px]"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </form>

      {portalHostReady &&
        createPortal(
          <AnimatePresence>
            {showFilterMenu && filterMenuPosition && (
              <motion.div
                ref={filterMenuRef}
                id={filterMenuId}
                role="menu"
                aria-label={t("search_filter_menu", "Filtros de búsqueda")}
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={filterMenuPosition}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  setShowFilterMenu(false);
                  filterButtonRef.current?.focus();
                }}
                className={`fixed z-[100000] overflow-hidden rounded-2xl text-white ${LIQUID_GLASS_PANEL}`}
              >
                <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
                  <div className="p-2">
                    <div className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/45 select-none">
                      <SlidersHorizontal
                        className="h-3.5 w-3.5 text-emerald-400/80 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{t("search_filter_menu", "Filtrar por")}</span>
                    </div>
                    <div className="space-y-1" role="none">
                      {translatedFilterOptions.map(
                        ({ id, label, Icon: FilterIcon }) => {
                          const isActive = activeFilter === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isActive}
                              onClick={() => handleFilterSelect(id)}
                              className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/80 ${
                                isActive
                                  ? "bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/20 active:bg-emerald-400/25"
                                  : "text-white/80 hover:bg-white/10 hover:text-white active:bg-white/15"
                              }`}
                            >
                              <FilterIcon
                                className={`h-4 w-4 shrink-0 transition-colors ${
                                  isActive
                                    ? "text-emerald-300"
                                    : "text-white/45 group-hover:text-amber-300"
                                }`}
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {label}
                              </span>
                              {isActive && (
                                <Check
                                  className="h-4 w-4 shrink-0 text-emerald-300"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {portalHostReady &&
        createPortal(
          <AnimatePresence>
            {showDropdown &&
              dropdownPosition &&
              (results.length > 0 ||
                !query.trim() ||
                currentSearchComplete) && (
                <motion.div
                  ref={dropdownRef}
                  id={dropdownId}
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  style={dropdownPosition}
                  onClick={(event) => event.stopPropagation()}
                  className={`fixed z-[99999] overflow-hidden rounded-2xl text-white ${LIQUID_GLASS_PANEL}`}
                >
                  <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
                    {!query.trim() ? (
              <div className="p-2">
                <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1.5">
                  <div className="flex min-w-0 items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/45 select-none">
                    <History className="h-3.5 w-3.5 text-amber-400/80 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t("search_history_title", "Búsquedas recientes")}</span>
                  </div>
                  {searchHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={handleHistoryClear}
                      className="group inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white/50 backdrop-blur-md transition-all duration-200 hover:bg-rose-500/20 hover:text-rose-200 active:scale-95 focus-visible:outline-none"
                    >
                      <Trash2 className="h-3 w-3 shrink-0 text-white/40 transition-colors duration-200 group-hover:text-rose-300" aria-hidden="true" />
                      <span>{t("search_history_clear_all", "Borrar todo")}</span>
                    </button>
                  )}
                </div>
                {searchHistory.length > 0 ? (
                  <ul className="space-y-1" role="list">
                    {searchHistory.map((historyQuery) => (
                      <li
                        key={historyQuery}
                        className="group flex min-h-10 items-center rounded-xl transition-colors hover:bg-white/10 focus-within:bg-white/10"
                      >
                        <button
                          type="button"
                          onClick={() => handleHistoryClick(historyQuery)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm font-semibold text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/80"
                        >
                          <History
                            className="h-4 w-4 shrink-0 text-white/35 transition-colors group-hover:text-amber-300"
                            aria-hidden="true"
                          />
                          <span className="truncate">{historyQuery}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) =>
                            handleHistoryRemove(event, historyQuery)
                          }
                          aria-label={`${t(
                            "search_history_remove",
                            "Eliminar del historial",
                          )}: ${historyQuery}`}
                          className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/35 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/80"
                        >
                          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-4 text-sm text-white/45">
                    <SearchIcon
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {t(
                        "search_history_empty",
                        "Aún no hay búsquedas recientes.",
                      )}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {results.length === 0 && currentSearchComplete ? (
                  <div className="flex min-h-28 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                    <SearchIcon
                      className="h-5 w-5 text-white/30"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-white/65">
                      {t(
                        "search_filter_no_results",
                        "No hay resultados para este filtro.",
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="p-2">
                    {results.slice(0, 8).map((item) => {
                    const isCollection = item.media_type === "collection";
                    const isUser = item.media_type === "user";
                    const resultLabel =
                      item.displayName ||
                      item.title ||
                      item.name ||
                      item.username ||
                      "Resultado";
                    const href = isUser
                      ? `/u/${encodeURIComponent(item.username)}`
                      : isCollection
                        ? `/lists/collection/${item.id}`
                        : `/details/${item.media_type}/${item.id}`;
                    return (
                      <Link
                        key={`${item.media_type}-${item.id}`}
                        href={href}
                        onClick={() => handleResultClick(item)}
                      >
                        <div className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer group">
                          <div className="relative flex-shrink-0">
                            {isUser ? (
                              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-neutral-900 text-xs font-black text-white shadow-lg transition-colors group-hover:border-cyan-300/30">
                                {item.avatarUrl ? (
                                  <OptimizedImage
                                    src={item.avatarUrl}
                                    alt={resultLabel}
                                    width={48}
                                    height={48}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span>{getSearchInitials(resultLabel)}</span>
                                )}
                              </div>
                            ) : (
                              <OptimizedImage
                                src={
                                  item.poster_path || item.profile_path
                                    ? `https://image.tmdb.org/t/p/w92${item.poster_path || item.profile_path}`
                                    : "/default-poster.png"
                                }
                                alt={resultLabel}
                                width={48}
                                height={64}
                                className="w-12 h-16 rounded-lg shadow-lg object-cover border border-white/10 group-hover:border-white/20 transition-colors"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-base line-clamp-1 text-white group-hover:text-blue-300 transition-colors">
                              {resultLabel}
                            </p>
                            {isUser && (
                              <p className="mt-0.5 truncate text-xs font-medium text-white/40">
                                @{item.username}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${getBadgeConfig(item.media_type).textClass}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${getBadgeConfig(item.media_type).dotClass}`}
                                />
                                {getMediaTypeLabel(item)}
                              </span>
                              {isUser &&
                                typeof item.followerCount === "number" && (
                                  <>
                                    <span className="text-zinc-600 text-[10px]">
                                      ●
                                    </span>
                                    <span className="text-xs font-semibold text-zinc-400">
                                      {item.followerCount}{" "}
                                      {item.followerCount === 1
                                        ? t(
                                            "search_user_follower",
                                            "seguidor",
                                          )
                                        : t(
                                            "search_user_followers",
                                            "seguidores",
                                          )}
                                    </span>
                                  </>
                                )}
                              {item.release_date && (
                                <>
                                  <span className="text-zinc-600 text-[10px]">
                                    ●
                                  </span>
                                  <span className="text-xs font-semibold text-zinc-400">
                                    {new Date(
                                      item.release_date,
                                    ).getFullYear()}
                                  </span>
                                </>
                              )}
                              {item.first_air_date && (
                                <>
                                  <span className="text-zinc-600 text-[10px]">
                                    ●
                                  </span>
                                  <span className="text-xs font-semibold text-zinc-400">
                                    {new Date(
                                      item.first_air_date,
                                    ).getFullYear()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                    })}
                  </div>
                )}
                {results.length > 8 && (
                  <div className="px-4 py-2 text-center text-xs text-neutral-500 border-t border-white/10">
                    Mostrando 8 de {results.length} resultados
                  </div>
                )}
              </>
                    )}
                  </div>
                </motion.div>
              )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/* ====================================================================
 * Navbar principal
 * ==================================================================== */
// Capas de cristal de la barra SUPERIOR, con el mismo lenguaje que la inferior
// pero adaptadas a su forma: aquí la pieza es un rectángulo a todo lo ancho, así
// que la luz entra por el borde de ARRIBA y el canto que refracta es el de
// ABAJO, que es donde el cristal se encuentra con el contenido. En la píldora,
// en cambio, la máscara es elíptica porque el canto la rodea entera.
function TopBarGlassLayers({ className = "" }) {
  return (
    <>
      {/* Refracción del canto inferior: desenfoque distinto del centro, que es
          la única refracción que el navegador puede dar (los filtros SVG no se
          aplican al backdrop; ver la nota en liquidGlass.js). */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 backdrop-blur-[2px] backdrop-brightness-[1.16] backdrop-saturate-[240%] ${className}`}
        style={{
          WebkitMaskImage:
            "linear-gradient(to top, #000 0%, rgba(0,0,0,0.35) 45%, transparent 78%)",
          maskImage:
            "linear-gradient(to top, #000 0%, rgba(0,0,0,0.35) 45%, transparent 78%)",
        }}
      />
      {/* Especular: el reflejo que recorre el borde superior y se apaga hacia
          dentro, sin trazar ninguna línea. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.03)_16%,transparent_46%)] ${className}`}
      />
    </>
  );
}

export default function Navbar() {
  const { account, hydrated } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();

  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const isScrolledRef = useRef(false);
  // Barra inferior (móvil): se compacta según la DIRECCIÓN del scroll, no según
  // la posición. `isScrolled` no sirve aquí porque solo vuelve a false al llegar
  // arriba del todo, y además lo comparten la barra superior y el fondo del hero.
  const [bottomNavCompact, setBottomNavCompact] = useState(false);
  const bottomNavCompactRef = useRef(false);
  // Destino marcado de forma optimista al pulsar un enlace: el indicador del
  // navbar resalta de inmediato la sección a la que vas, sin esperar a que la
  // transición de ruta haga commit (lo que dejaba el indicador en la página de
  // origen mientras se montaban las páginas pesadas como Favoritos/Pendientes).
  const [pendingHref, setPendingHref] = useState(null);
  // La búsqueda deja de ocupar el centro cuando ya no tiene un carril útil entre
  // las secciones principales y los accesos de la derecha. Se mide el espacio
  // real —incluidos traducciones, avatar y zoom— en vez de depender de un único
  // breakpoint de viewport.
  // No asumimos el modo compacto antes de medir el header. De ese modo, al
  // recargar no se llega a pintar el botón «Buscar» en pantallas que sí tienen
  // espacio para la barra completa; ResizeObserver lo activa solo cuando toca.
  const [desktopSearchCompact, setDesktopSearchCompact] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const desktopHeaderRef = useRef(null);
  const desktopLeftRef = useRef(null);
  const desktopRightRef = useRef(null);

  useLayoutEffect(() => {
    const header = desktopHeaderRef.current;
    const left = desktopLeftRef.current;
    const right = desktopRightRef.current;
    if (!header || !left || !right) return undefined;

    let frameId = 0;
    const updateSearchLayout = () => {
      frameId = 0;
      const availableWidth =
        header.clientWidth - left.offsetWidth - right.offsetWidth - 32;

      setDesktopSearchCompact((isCompact) => {
        // Histéresis: evitamos que la pestaña «Buscar» oscile al aparecer,
        // pues forma parte de la propia columna izquierda que se está midiendo.
        const minimumWidth = isCompact ? 520 : 460;
        return availableWidth < minimumWidth;
      });
    };

    const scheduleUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateSearchLayout);
    };

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(header);
    observer.observe(left);
    observer.observe(right);
    updateSearchLayout();

    return () => {
      observer.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;

    const updateScrolledState = () => {
      frameId = 0;
      const scrollY = window.scrollY;
      // Histéresis: al compactarse, la barra no vuelve a expandirse hasta que
      // se llega claramente más arriba. Evita invertir la animación en cada
      // pequeño rebote o variación de scroll junto al umbral.
      const nextIsScrolled = isScrolledRef.current
        ? scrollY > 24
        : scrollY > 40;

      if (nextIsScrolled === isScrolledRef.current) return;

      isScrolledRef.current = nextIsScrolled;
      setIsScrolled(nextIsScrolled);
    };

    const handleScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateScrolledState);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateScrolledState();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  // Barra inferior: compacta al bajar, completa al subir (en cualquier punto de
  // la página) y siempre completa junto al inicio.
  useEffect(() => {
    // Desplazamiento mínimo acumulado antes de reaccionar: evita que la inercia
    // o un rebote de 1-2px hagan oscilar la barra.
    const DELTA = 8;
    const TOP_ZONE = 48;

    let frameId = 0;
    let lastY = window.scrollY;
    let lastHeight = document.documentElement.scrollHeight;

    const updateBottomNav = () => {
      frameId = 0;
      const y = Math.max(0, window.scrollY);
      const height = document.documentElement.scrollHeight;
      const delta = y - lastY;
      const heightDelta = height - lastHeight;
      lastHeight = height;

      // Al asentarse la página (imágenes que cargan, contenido que se recoloca)
      // el documento encoge y el navegador arrastra `scrollY` con él. Eso NO es
      // un gesto del usuario, y se reconoce porque el desplazamiento coincide
      // con lo que ha encogido el documento: se resincroniza la referencia sin
      // tocar el estado. Sin esto, ese arrastre se acumulaba y expandía la barra
      // sola a mitad de la animación de compactar.
      // Solo cubre ese caso concreto: si el usuario desplaza de verdad mientras
      // el documento crece (scroll infinito), el gesto se procesa con normalidad.
      if (heightDelta < 0 && delta < 0 && Math.abs(delta - heightDelta) <= 2) {
        lastY = y;
        return;
      }

      // Sin actualizar `lastY`, los desplazamientos lentos se van acumulando
      // hasta superar el umbral en vez de ignorarse frame a frame.
      if (Math.abs(delta) < DELTA) return;
      lastY = y;

      const next = y > TOP_ZONE && delta > 0;
      if (next === bottomNavCompactRef.current) return;

      bottomNavCompactRef.current = next;
      setBottomNavCompact(next);
    };

    const handleScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateBottomNav);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  // Una vez la URL refleja el destino (o cambia por cualquier motivo), se limpia
  // el destino optimista para volver a basarse en el pathname real.
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const featuredHeroRoutes = ["/", "/movies", "/series"];
  const isFeaturedHeroRoute = featuredHeroRoutes.includes(pathname || "/");

  // En las páginas con FeaturedHero y al estar arriba del todo, la navbar va
  // sobre el hero sin fondo glass (solo un velo oscuro mínimo para legibilidad).
  // El fondo difuminado aparece al hacer scroll.
  const heroNavMode = isFeaturedHeroRoute && !isScrolled;

  // Fichas base (/details/movie/<id> y /details/tv/<id>): en MÓVIL el póster es
  // full-bleed y arranca justo bajo la navbar, borde con borde. Con el fondo
  // glass, su velo cortaba en seco en ese borde y dejaba un escalón de brillo
  // contra la fila superior del póster. Arriba del todo usamos el mismo velo
  // degradado que el hero, que muere en transparente: así el borde no existe.
  // SeasonDetails/EpisodeDetails son subrutas con layout propio y deben conservar
  // la navbar glass visible desde el primer render.
  const isDetailsRoute =
    /^\/details\/movie\/[^/]+\/?$/.test(pathname || "") ||
    /^\/details\/tv\/[^/]+\/?$/.test(pathname || "");
  // La baraja de recomendaciones comparte la composición móvil de la ficha: la
  // portada ocupa desde el borde superior y el navbar va TRANSPARENTE encima.
  // Se distingue de la ficha porque allí hay además un velo oscuro de
  // legibilidad; aquí la barra va limpia, sin ningún fondo.
  const isRecommendationsRoute = /^\/recommendations\/?$/.test(pathname || "");
  const isImmersiveRoute = isDetailsRoute || isRecommendationsRoute;
  // En escritorio, las fichas comparten la entrada transparente de los
  // dashboards: el glass se reserva para cuando el usuario ya ha empezado a
  // desplazarse. En móvil se mantiene la composición específica de la ficha.
  const desktopDetailsNavMode = isImmersiveRoute && !isScrolled;

  const activePath = pendingHref || pathname;
  const isActive = (href) =>
    activePath === href || (href !== "/" && activePath?.startsWith(href));

  const desktopNavTabsRef = useRef(null);
  const [activeDesktopRect, setActiveDesktopRect] = useState(null);
  const [desktopNavMounted, setDesktopNavMounted] = useState(false);

  useLayoutEffect(() => {
    const container = desktopNavTabsRef.current;
    if (!container) return;

    const measure = () => {
      const activeEl =
        container.querySelector(`[data-desktop-nav-href="${activePath}"]`) ||
        (activePath === "/" ? container.querySelector(`[data-desktop-nav-href="/"]`) : null);

      if (activeEl) {
        const left = activeEl.offsetLeft;
        const width = activeEl.offsetWidth;
        setActiveDesktopRect((prev) => {
          if (prev && prev.left === left && prev.width === width && prev.href === activePath) {
            return prev;
          }
          return { left, width, href: activePath };
        });
      } else {
        setActiveDesktopRect(null);
      }
    };

    measure();
    if (!desktopNavMounted) {
      setDesktopNavMounted(true);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activePath, desktopNavMounted]);

  const prefetchNavRoute = useCallback(
    (href) => {
      if (!href || pathname === href) return;
      router.prefetch(href);
    },
    [pathname, router],
  );

  // Prefetch por intención del puntero/foco: cuando el usuario apunta o enfoca
  // un enlace de sección, su chunk ya empieza a descargarse, de modo que al
  // pulsar la navegación es instantánea (sin esperar a descargar la página).
  const navPrefetchHandlers = useCallback(
    (href) => ({
      onMouseEnter: () => prefetchNavRoute(href),
      onFocus: () => prefetchNavRoute(href),
      onTouchStart: () => prefetchNavRoute(href),
      onClick: () => setPendingHref(href),
    }),
    [prefetchNavRoute],
  );

  useEffect(() => {
    const schedule =
      window.requestIdleCallback ||
      ((callback) => window.setTimeout(callback, 1200));
    const cancel =
      window.cancelIdleCallback ||
      ((handle) => window.clearTimeout(handle));

    const handle = schedule(
      () => {
        // Secciones siempre visibles en la navbar/barra inferior. Se precargan
        // en tiempo de inactividad para que el clic sea instantáneo también en
        // móvil, donde no hay hover previo.
        prefetchNavRoute("/movies");
        prefetchNavRoute("/series");
        prefetchNavRoute("/recommendations");
        prefetchNavRoute("/in-progress");
        prefetchNavRoute("/favorites");
        prefetchNavRoute("/watchlist");
      },
      { timeout: 1800 },
    );

    return () => cancel(handle);
  }, [pathname, prefetchNavRoute]);

  const navLinkClass = (href) => {
    const active = isActive(href);
    const activeTextClass =
      href === "/movies"
        ? "text-sky-300 font-bold"
        : href === "/series"
          ? "text-fuchsia-300 font-bold"
          : href === "/discover"
            ? "text-indigo-300 font-bold"
            : href === "/biblioteca"
              ? "text-amber-300 font-bold"
              : "text-white font-bold";

    return `relative px-3.5 py-2 rounded-xl text-sm transition-all duration-300 ease-out ${
      active
        ? activeTextClass
        : isScrolled
          ? "text-zinc-200 font-bold hover:text-white hover:bg-white/10 hover:backdrop-blur-md"
          : "text-neutral-300 font-bold hover:text-white hover:bg-white/10 hover:backdrop-blur-md"
    } ${isScrolled ? "[text-shadow:0_2px_10px_rgba(0,0,0,1),0_1px_4px_rgba(0,0,0,0.8)]" : ""}`;
  };

  const getActiveTabStyle = (href) => {
    switch (href) {
      case "/movies":
        return "bg-gradient-to-b from-sky-500/25 via-sky-500/15 to-sky-400/20 backdrop-blur-md shadow-[0_4px_20px_-2px_rgba(56,189,248,0.28)]";
      case "/series":
        return "bg-gradient-to-b from-fuchsia-500/25 via-fuchsia-500/15 to-fuchsia-400/20 backdrop-blur-md shadow-[0_4px_20px_-2px_rgba(217,70,239,0.28)]";
      case "/discover":
        return "bg-gradient-to-b from-indigo-500/25 via-indigo-500/15 to-indigo-400/20 backdrop-blur-md shadow-[0_4px_20px_-2px_rgba(99,102,241,0.28)]";
      case "/biblioteca":
        return "bg-gradient-to-b from-amber-500/25 via-amber-500/15 to-amber-400/20 backdrop-blur-md shadow-[0_4px_20px_-2px_rgba(245,158,11,0.28)]";
      default:
        return "bg-gradient-to-b from-white/20 via-white/14 to-white/16 backdrop-blur-md shadow-[0_4px_20px_-2px_rgba(255,255,255,0.15)]";
    }
  };

  const iconLinkClass = (href, tone = "neutral") => {
    const active = isActive(href);

    const base =
      "relative group p-2 rounded-full transition-all duration-300 ease-out " +
      "hover:-translate-y-0.5 hover:scale-[1.05] active:scale-95 " +
      "focus:outline-none";

    const tones = {
      red: {
        hover:
          "hover:text-red-300 hover:bg-red-500/15 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(239,68,68,0.15)]",
        active: "text-red-200",
      },
      blue: {
        hover:
          "hover:text-sky-300 hover:bg-sky-500/15 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(14,165,233,0.15)]",
        active: "text-sky-200",
      },
      purple: {
        hover:
          "hover:text-fuchsia-300 hover:bg-fuchsia-500/15 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(217,70,239,0.15)]",
        active: "text-fuchsia-200",
      },
      green: {
        hover:
          "hover:text-emerald-300 hover:bg-emerald-500/15 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(16,185,129,0.15)]",
        active: "text-emerald-200",
      },
      amber: {
        hover:
          "hover:text-amber-300 hover:bg-amber-500/15 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(245,158,11,0.15)]",
        active: "text-amber-200",
      },
      indigo: {
        hover:
          "hover:text-indigo-300 hover:bg-indigo-500/15 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(99,102,241,0.15)]",
        active: "text-indigo-200",
      },
    };

    const t = tones[tone] || tones.amber;
    // En la fase inicial del hero (navbar transparente) los iconos pueden
    // perderse sobre backdrops claros: los aclaramos y les damos una sombra
    // oscura para garantizar contraste sobre cualquier fondo.
    const inactiveColor = heroNavMode ? "text-neutral-100" : "text-neutral-400";
    const heroShadow = heroNavMode
      ? " drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
      : "";
    return `${base} ${active ? t.active : t.hover} ${active ? "" : inactiveColor}${heroShadow}`;
  };

  // La sección ACTIVA conserva el color propio de su sección; las inactivas van
  // en blanco atenuado. Así la barra se lee limpia (un solo color a la vez) pero
  // la sección en la que estás mantiene su identidad. El halo del mismo tono es
  // suave a propósito: con uno fuerte, sobre un cristal tan difuminado, el color
  // se derramaba y ensuciaba la pieza.
  const MOBILE_BOTTOM_TONES = {
    red: "text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.35)]",
    blue: "text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.35)]",
    purple: "text-fuchsia-400 drop-shadow-[0_0_10px_rgba(232,121,249,0.35)]",
    green: "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.35)]",
  };

  const navLinkClassMobileBottom = (href, tone = "blue") => {
    const active = isActive(href);

    return (
      "relative group flex h-[calc(100%_-_0.25rem)] min-w-0 flex-1 items-center justify-center rounded-full " +
      "transition-[color,transform] duration-300 ease-out " +
      "active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 " +
      (active
        ? MOBILE_BOTTOM_TONES[tone] || MOBILE_BOTTOM_TONES.blue
        : "text-white/60 hover:text-white/85")
    );
  };

  // Sin rótulos: el icono va centrado en su celda. La compactación la aplica la
  // barra entera con un `scale`, así que el icono no lleva animación propia (una
  // sola transformación compuesta = animación fluida, sin recalcular layout).
  const mobileBottomIconSlotClass =
    "relative z-10 flex items-center justify-center";

  // Trazo MÁS GRUESO que el de por defecto de lucide (2): a 24px y sobre un
  // cristal muy difuminado, una línea fina se diluye y los iconos pierden
  // presencia. Las puntas redondeadas evitan que ese grosor se vea duro.
  const mobileBottomIconClass = "h-6 w-6 shrink-0";
  const MOBILE_BOTTOM_ICON_STROKE = 2.4;

  // Lente de la sección activa: un CÍRCULO de luz difusa, no una cápsula del
  // ancho de la celda. En la barra de Instagram el realce es redondo y algo
  // menor que la celda, y su suavidad viene de la propia luz, sin ningún canto:
  // por eso aquí no hay reflejo interior de 1px (dibujaba un borde marcado justo
  // en lo que debía ser un degradado).
  //
  // El `layoutId` va en una capa que ocupa la celda ENTERA y el círculo es un
  // hijo centrado: así Framer anima la posición de la celda (el deslizamiento
  // entre secciones) sin pelearse con la transformación que centraría el
  // círculo, que es lo que pasa al poner `layoutId` sobre un elemento
  // desplazado con `-translate-x-1/2`.
  const mobileBottomActiveLens = (
    <motion.span
      aria-hidden="true"
      layoutId="mobile-bottom-nav-active"
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
    >
      <span className="block aspect-square h-[88%] rounded-full bg-white/[0.17] bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.16),transparent_70%)] shadow-[0_2px_14px_-2px_rgba(0,0,0,0.4)]" />
    </motion.span>
  );

  // Las fichas conservan siempre la presencia compacta de su entrada. Así el
  // progreso del hero no vuelve a agrandar los controles antes de que el resto
  // de rutas active la compactación por scroll.
  const mobileTopIsCompact = isScrolled || isImmersiveRoute;
  const mobileTopControlScaleClass = isImmersiveRoute
    ? "scale-[0.8]"
    : isScrolled
      ? "scale-[0.82]"
      : "scale-100";

  // Menú inferior fijo: las secciones siempre son accesibles; cada página muestra
  // su conexión necesaria si la cuenta correspondiente no está enlazada.
  const favHref = "/favorites";
  const watchHref = "/watchlist";
  const loginHref = `/login?next=${encodeURIComponent(
    pathname || "/",
  )}`;
  const profileAuthLoading = !hydrated;

  // Bloquear scroll cuando overlays están abiertos
  useEffect(() => {
    const locked = showMobileSearch || mobileMenuOpen;
    document.body.style.overflow = locked ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showMobileSearch, mobileMenuOpen]);

  return (
    <>
      {/* ===================== TOP BAR ===================== */}
      {/* En páginas con FeaturedHero (arriba del todo) la navbar es transparente
          sobre el hero, con un velo oscuro mínimo para que los botones se vean;
          al hacer scroll aparece el fondo glass difuminado. */}
      <nav
        className={`sticky top-0 z-40 w-full transition-[background-color,backdrop-filter,box-shadow] duration-300 ${
          heroNavMode
            ? "bg-gradient-to-b from-black/60 via-black/25 to-transparent"
            : desktopDetailsNavMode
              ? "lg:bg-gradient-to-b lg:from-black/60 lg:via-black/25 lg:to-transparent"
            : isImmersiveRoute
              ? // FICHA / RECOMENDACIONES: escritorio glass tras scroll (lg:);
                // MÓVIL transparente, compacto y visible/interactivo desde la
                // entrada. En la ficha el fondo glass y el crecimiento de altura
                // los aportan la capa interna y la fila móvil, GRADUALMENTE con
                // el scroll (--sv-hero-scroll); en recomendaciones no hay scroll,
                // así que la barra se queda transparente.
                "lg:bg-black/15 lg:bg-gradient-to-b lg:from-white/[0.14] lg:via-white/[0.03] lg:to-black/15 lg:backdrop-blur-[7px] lg:backdrop-saturate-[190%] lg:backdrop-brightness-[1.06] lg:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.75)]"
              : `${LIQUID_GLASS_BAR}`
        }`}
      >
        {/* Capas de cristal, solo donde la barra TIENE fondo: en los estados
            transparentes (sobre el hero o en la entrada de una ficha) añadirían
            un velo que no debe estar. En rutas inmersivas el cristal es solo de
            escritorio, así que las capas se limitan a `lg:`. */}
        {!heroNavMode && !desktopDetailsNavMode && (
          <TopBarGlassLayers
            className={isImmersiveRoute ? "hidden lg:block" : ""}
          />
        )}

        {isDetailsRoute && (
          <>
            {/* MÓVIL ficha: velo sutil SIEMPRE presente para que los iconos se
                lean sobre el póster con el navbar transparente en la entrada; en
                el scroll queda bajo el glass. */}
            <div
              aria-hidden
              className="lg:hidden pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-transparent"
            />
            {/* Fondo GLASS que aparece GRADUALMENTE con el scroll
                (--sv-hero-scroll: 0→1) sin afectar a los iconos. */}
            <div
              aria-hidden
              className={`lg:hidden pointer-events-none absolute inset-0 ${LIQUID_GLASS_BAR} transition-opacity duration-300 motion-reduce:transition-none ${
                isScrolled ? "opacity-100" : "[opacity:var(--sv-hero-scroll,0)]"
              }`}
            >
              {/* Dentro de esta capa para que aparezcan y desaparezcan con ella
                  según el progreso del scroll, no por separado. */}
              <TopBarGlassLayers />
            </div>
          </>
        )}
        {/* ---------------- Desktop ---------------- */}
        <div
          ref={desktopHeaderRef}
          className="hidden h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 lg:grid"
        >
          {/* Izquierda */}
          <div
            ref={desktopLeftRef}
            className="flex min-w-0 items-center gap-8 pl-6 -ml-10"
          >
            <Link href="/" className="block h-12 overflow-hidden flex-shrink-0">
              <div className="h-full w-[120px] flex items-center justify-center overflow-hidden">
                <OptimizedImage
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  width={48}
                  height={48}
                  className="h-full w-[48px] object-contain scale-[2.5] origin-left"
                />
              </div>
            </Link>

            <div
              ref={desktopNavTabsRef}
              className="relative flex items-center gap-4"
            >
              {activeDesktopRect && (
                <div
                  className={`absolute top-0 bottom-0 rounded-xl pointer-events-none transform-gpu ${getActiveTabStyle(activeDesktopRect.href)} ${
                    desktopNavMounted
                      ? "transition-[transform,width,opacity,background-color,box-shadow] duration-220 ease-[cubic-bezier(0.2,0,0.1,1)]"
                      : "transition-none"
                  }`}
                  style={{
                    transform: `translate3d(${activeDesktopRect.left}px, 0, 0)`,
                    width: `${activeDesktopRect.width}px`,
                  }}
                />
              )}

              <Link
                href="/"
                data-desktop-nav-href="/"
                onClick={() => setPendingHref("/")}
                className={navLinkClass("/")}
              >
                <span className="relative z-10">{t("nav_home", "Inicio")}</span>
              </Link>
              <Link
                href="/movies"
                data-desktop-nav-href="/movies"
                prefetch
                onMouseEnter={() => prefetchNavRoute("/movies")}
                onFocus={() => prefetchNavRoute("/movies")}
                onClick={() => setPendingHref("/movies")}
                className={navLinkClass("/movies")}
              >
                <span className="relative z-10">{t("nav_movies", "Películas")}</span>
              </Link>
              <Link
                href="/series"
                data-desktop-nav-href="/series"
                prefetch
                onMouseEnter={() => prefetchNavRoute("/series")}
                onFocus={() => prefetchNavRoute("/series")}
                onClick={() => setPendingHref("/series")}
                className={navLinkClass("/series")}
              >
                <span className="relative z-10">{t("nav_series", "Series")}</span>
              </Link>
              <Link
                href="/discover"
                data-desktop-nav-href="/discover"
                prefetch
                {...navPrefetchHandlers("/discover")}
                className={navLinkClass("/discover")}
              >
                <span className="relative z-10">{t("nav_discover", "Descubrir")}</span>
              </Link>
              <Link
                href="/biblioteca"
                data-desktop-nav-href="/biblioteca"
                prefetch
                {...navPrefetchHandlers("/biblioteca")}
                className={navLinkClass("/biblioteca")}
              >
                <span className="relative z-10">{t("nav_library", "Biblioteca")}</span>
              </Link>

              {desktopSearchCompact && (
                <button
                  type="button"
                  data-desktop-nav-href="/__search"
                  onClick={() => setDesktopSearchOpen(true)}
                  aria-label={t("search_input_label", "Buscar en The Show Verse")}
                  aria-expanded={desktopSearchOpen}
                  className={`${navLinkClass("/__search")} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80`}
                >
                  <span className="relative z-10">{t("nav_search", "Buscar")}</span>
                </button>
              )}
            </div>
          </div>

          {/* Centro: en modo compacto la búsqueda se abre únicamente en el
              carril libre entre ambos grupos; en modo normal permanece visible. */}
          <div className="flex min-w-0 items-center justify-center">
            {(!desktopSearchCompact || desktopSearchOpen) && (
              <SearchBar
                autoFocus={desktopSearchCompact && desktopSearchOpen}
                onEscape={
                  desktopSearchCompact
                    ? () => setDesktopSearchOpen(false)
                    : undefined
                }
                onResultClick={
                  desktopSearchCompact
                    ? () => setDesktopSearchOpen(false)
                    : undefined
                }
              />
            )}
          </div>

          {/* Derecha */}
          <div
            ref={desktopRightRef}
            className="flex shrink-0 items-center gap-2 pr-12"
          >
            <div className="flex items-center gap-2">
              <WatchNextAssistant heroNavMode={heroNavMode} />

              <Link
                href="/recommendations"
                prefetch
                {...navPrefetchHandlers("/recommendations")}
                className={iconLinkClass("/recommendations", "green")}
                aria-label={t("nav_recommendations", "Recomendaciones")}
              >
                {isActive("/recommendations") && (
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border border-emerald-500/10 bg-emerald-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(16,185,129,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <ThumbsUp className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
                </span>
              </Link>

              <Link
                href="/lists"
                prefetch
                {...navPrefetchHandlers("/lists")}
                className={iconLinkClass("/lists", "purple")}
                aria-label="Listas"
              >
                {isActive("/lists") && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(217,70,239,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <ListVideo className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                </span>
              </Link>

              <Link
                href="/calendar"
                prefetch
                {...navPrefetchHandlers("/calendar")}
                className={iconLinkClass("/calendar", "amber")}
                aria-label="Calendario"
              >
                {isActive("/calendar") && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-amber-500/20 border border-amber-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(245,158,11,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <CalendarDaysIcon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                </span>
              </Link>

              <Link
                href="/in-progress"
                prefetch
                {...navPrefetchHandlers("/in-progress")}
                className={iconLinkClass("/in-progress", "green")}
                aria-label="En Progreso"
              >
                {isActive("/in-progress") && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-emerald-500/20 border border-emerald-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(16,185,129,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <Play
                    className="w-5 h-5 transition-transform duration-200 group-hover:scale-110"
                    fill="currentColor"
                  />
                </span>
              </Link>

              <Link
                href="/history"
                prefetch
                {...navPrefetchHandlers("/history")}
                className={iconLinkClass("/history", "green")}
                aria-label="Historial"
              >
                {isActive("/history") && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-emerald-500/20 border border-emerald-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(16,185,129,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <Eye className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                </span>
              </Link>

              <Link
                href="/favorites"
                prefetch
                {...navPrefetchHandlers("/favorites")}
                className={iconLinkClass("/favorites", "red")}
                aria-label="Favoritas"
              >
                {isActive("/favorites") && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-red-500/20 border border-red-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(239,68,68,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <Heart className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                </span>
              </Link>

              <Link
                href="/watchlist"
                prefetch
                {...navPrefetchHandlers("/watchlist")}
                className={iconLinkClass("/watchlist", "blue")}
                aria-label="Pendientes"
              >
                {isActive("/watchlist") && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-sky-500/20 border border-sky-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(56,189,248,0.08)]"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center">
                  <Bookmark className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                </span>
              </Link>
            </div>

            {profileAuthLoading ? (
              // Durante la hidratación conservamos la huella circular del avatar.
              // Así una sesión ya iniciada nunca parece convertirse por un instante
              // en el botón ancho de acceso antes de recuperar la cuenta cacheada.
              <div
                aria-hidden="true"
                className="ml-2 h-9 w-9 rounded-full bg-neutral-800/80 animate-pulse"
              />
            ) : !account ? (
              <a
                href={loginHref}
                className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
              >
                {t("nav_login", "Iniciar sesión")}
              </a>
            ) : (
              <UserAvatar
                account={account}
                className={
                  heroNavMode ? "drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]" : ""
                }
              />
            )}
          </div>

        </div>

        {/* ---------------- Mobile ---------------- */}
        <div
          className={`lg:hidden relative flex items-center justify-between px-2 transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            mobileTopIsCompact ? "h-12" : "h-16"
          }`}
        >
          {/* Izquierda: en el estado compacto se replica la escala inicial de
              DetailsClient para que menú y asistente reduzcan presencia sin
              perder su área táctil ni su posición. */}
          <div
            className={`flex flex-shrink-0 origin-left items-center gap-1 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${mobileTopControlScaleClass}`}
          >
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Abrir menú"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
            <WatchNextAssistant isMobile heroNavMode={heroNavMode} />
          </div>

          {/* Centro: el logo acompaña la reducción de los controles. */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Link
              href="/"
              className={`block h-10 overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${mobileTopControlScaleClass}`}
            >
              <div className="h-full w-[140px] flex items-center justify-center overflow-hidden">
                <OptimizedImage
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  width={40}
                  height={40}
                  className="h-full w-[40px] object-contain scale-[2.8] origin-center"
                />
              </div>
            </Link>
          </div>

          {/* Derecha: búsqueda y perfil mantienen la misma escala que el resto. */}
          <div
            className={`flex flex-shrink-0 origin-right items-center gap-2 pr-1 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${mobileTopControlScaleClass}`}
          >
            <button
              onClick={() => setShowMobileSearch(true)}
              className="p-2 rounded-full transition-colors text-white hover:bg-white/10"
              aria-label="Buscar"
            >
              <SearchIcon className="w-6 h-6 text-white" />
            </button>

            {profileAuthLoading ? (
              <div className="w-9 h-9 rounded-full bg-neutral-800/80 animate-pulse" />
            ) : !account ? (
              <a
                href={loginHref}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              >
                Acceder
              </a>
            ) : (
              <UserAvatar account={account} />
            )}
          </div>
        </div>
      </nav>

      {/* ===================== BOTTOM BAR (MÓVIL) ===================== */}
      {/* LayoutGroup acota el `layoutId` de la cápsula activa a esta barra. */}
      <LayoutGroup id="mobile-bottom-nav">
      <nav
        aria-label={t("mobile_bottom_nav_label", "Navegación principal")}
        // Píldora flotante con margen amplio a los lados. Solo se anima
        // `transform` (scale desde el borde inferior): al no tocar width/height
        // no hay recálculo de layout, así la compactación es fluida en todo
        // momento y en ambos sentidos del scroll.
        className={`lg:hidden fixed left-1/2 z-30 flex h-14 w-[min(calc(100%_-_3rem),21.5rem)] origin-bottom -translate-x-1/2 items-center rounded-full px-3.5 ${LIQUID_GLASS_BAR} bottom-[calc(0.75rem+env(safe-area-inset-bottom))] transform-gpu transition-transform duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          bottomNavCompact ? "scale-[0.86]" : "scale-100"
        }`}
      >
        {/* CAPA 1 — REFRACCIÓN DEL CANTO.
            Es lo que separa un cristal de un simple esmerilado: en una pieza con
            cuerpo, la luz se DESVÍA y se concentra al llegar al borde curvo, así
            que el canto distorsiona y aclara más que el centro. Aquí se consigue
            con un segundo desenfoque, más corto y más luminoso, aplicado SOLO
            hacia el perímetro mediante una máscara elíptica.
            La máscara va degradada (no un anillo de grosor fijo) para que la
            transición sea continua y no dibuje ningún borde marcado. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] backdrop-blur-[2px] backdrop-brightness-[1.16] backdrop-saturate-[240%]"
          style={{
            WebkitMaskImage:
              "radial-gradient(112% 128% at 50% 50%, transparent 34%, #000 92%)",
            maskImage:
              "radial-gradient(115% 135% at 50% 50%, transparent 40%, #000 95%)",
          }}
        />

        {/* CAPA 2 — ESPECULAR.
            Da el grosor: la luz entra por arriba a la izquierda y vuelve a
            asomar, más tenue, por el canto inferior derecho (el reflejo que
            rodea una pieza de vidrio). Sin esto el cristal se ve plano. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(125deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.03)_16%,transparent_40%,transparent_60%,rgba(255,255,255,0.03)_86%,rgba(255,255,255,0.07)_100%)]"
        />

        {/* CAPA 3 — luz difusa superior, que asienta el volumen del conjunto. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(130%_100%_at_50%_0%,rgba(255,255,255,0.08)_0%,transparent_75%)]"
        />

        <Link
          href="/movies"
          prefetch
          onTouchStart={() => prefetchNavRoute("/movies")}
          onFocus={() => prefetchNavRoute("/movies")}
          onClick={() => setPendingHref("/movies")}
          className={navLinkClassMobileBottom("/movies", "blue")}
          aria-current={isActive("/movies") ? "page" : undefined}
          aria-label={t("nav_movies", "Películas")}
          title={t("nav_movies", "Películas")}
        >
          {isActive("/movies") && mobileBottomActiveLens}
          <span className={mobileBottomIconSlotClass}>
            <FilmIcon className={mobileBottomIconClass} strokeWidth={MOBILE_BOTTOM_ICON_STROKE} />
          </span>
        </Link>

        <Link
          href="/series"
          prefetch
          onTouchStart={() => prefetchNavRoute("/series")}
          onFocus={() => prefetchNavRoute("/series")}
          onClick={() => setPendingHref("/series")}
          className={navLinkClassMobileBottom("/series", "purple")}
          aria-current={isActive("/series") ? "page" : undefined}
          aria-label={t("nav_series", "Series")}
          title={t("nav_series", "Series")}
        >
          {isActive("/series") && mobileBottomActiveLens}
          <span className={mobileBottomIconSlotClass}>
            <TvIcon className={mobileBottomIconClass} strokeWidth={MOBILE_BOTTOM_ICON_STROKE} />
          </span>
        </Link>

        <Link
          href="/in-progress"
          prefetch
          {...navPrefetchHandlers("/in-progress")}
          className={navLinkClassMobileBottom("/in-progress", "green")}
          aria-current={isActive("/in-progress") ? "page" : undefined}
          aria-label={t("nav_in_progress_short", "En curso")}
          title={t("nav_in_progress_short", "En curso")}
        >
          {isActive("/in-progress") && mobileBottomActiveLens}
          <span className={mobileBottomIconSlotClass}>
            <Play className={mobileBottomIconClass} strokeWidth={MOBILE_BOTTOM_ICON_STROKE} />
          </span>
        </Link>

        <Link
          href="/history"
          prefetch
          {...navPrefetchHandlers("/history")}
          className={navLinkClassMobileBottom("/history", "green")}
          aria-current={isActive("/history") ? "page" : undefined}
          aria-label={t("nav_history", "Historial")}
          title={t("nav_history", "Historial")}
        >
          {isActive("/history") && mobileBottomActiveLens}
          <span className={mobileBottomIconSlotClass}>
            <Eye className={mobileBottomIconClass} strokeWidth={MOBILE_BOTTOM_ICON_STROKE} />
          </span>
        </Link>

        <Link
          href={favHref}
          prefetch
          {...navPrefetchHandlers(favHref)}
          className={navLinkClassMobileBottom("/favorites", "red")}
          aria-current={isActive(favHref) ? "page" : undefined}
          aria-label={t("nav_favorites", "Favoritas")}
          title={t("nav_favorites", "Favoritas")}
        >
          {isActive(favHref) && mobileBottomActiveLens}
          <span className={mobileBottomIconSlotClass}>
            <Heart className={mobileBottomIconClass} strokeWidth={MOBILE_BOTTOM_ICON_STROKE} />
          </span>
        </Link>

        <Link
          href={watchHref}
          prefetch
          {...navPrefetchHandlers(watchHref)}
          className={navLinkClassMobileBottom("/watchlist", "blue")}
          aria-current={isActive(watchHref) ? "page" : undefined}
          aria-label={t("nav_watchlist", "Pendientes")}
          title={t("nav_watchlist", "Pendientes")}
        >
          {isActive(watchHref) && mobileBottomActiveLens}
          <span className={mobileBottomIconSlotClass}>
            <Bookmark className={mobileBottomIconClass} strokeWidth={MOBILE_BOTTOM_ICON_STROKE} />
          </span>
        </Link>
      </nav>
      </LayoutGroup>

      {/* ===================== DRAWER MENÚ (MÓVIL) ===================== */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className={`h-full w-[280px] sm:w-[300px] max-w-[85vw] ${LIQUID_GLASS_PANEL} px-4 pt-3 pb-6 flex flex-col select-none transform-gpu overflow-y-auto scrollbar-none`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 mb-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 min-w-0 h-24"
                >
                  <OptimizedImage
                    src="/logo-final-titulo-sinFondo.png"
                    alt="The Show Verse"
                    width={248}
                    height={112}
                    className="h-full w-full object-contain object-left"
                  />
                </Link>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className={`p-2 rounded-full text-neutral-200 transition-colors hover:bg-white/10 hover:text-white flex-shrink-0 ${LIQUID_GLASS_PANEL}`}
                  aria-label="Cerrar menú"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Menu items */}
              <div className="space-y-1 pt-1">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/")
                      ? "bg-white/15 text-white font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <HomeIcon className={`w-5 h-5 ${isActive("/") ? "text-white" : "text-neutral-400"}`} />
                  <span>{t("nav_home", "Inicio")}</span>
                </Link>

                <Link
                  href="/movies"
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={() => prefetchNavRoute("/movies")}
                  onFocus={() => prefetchNavRoute("/movies")}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/movies")
                      ? "bg-sky-500/20 text-sky-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <FilmIcon className={`w-5 h-5 ${isActive("/movies") ? "text-sky-400" : "text-neutral-400"}`} />
                  <span>{t("nav_movies", "Películas")}</span>
                </Link>

                <Link
                  href="/series"
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={() => prefetchNavRoute("/series")}
                  onFocus={() => prefetchNavRoute("/series")}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/series")
                      ? "bg-fuchsia-500/20 text-fuchsia-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <TvIcon className={`w-5 h-5 ${isActive("/series") ? "text-fuchsia-400" : "text-neutral-400"}`} />
                  <span>{t("nav_series", "Series")}</span>
                </Link>

                <Link
                  href="/discover"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/discover")
                      ? "bg-indigo-500/20 text-indigo-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Compass className={`w-5 h-5 ${isActive("/discover") ? "text-indigo-400" : "text-neutral-400"}`} />
                  <span>{t("nav_discover", "Descubrir")}</span>
                </Link>

                <Link
                  href="/recommendations"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/recommendations")
                      ? "bg-emerald-500/20 text-emerald-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <ThumbsUp className={`w-5 h-5 ${isActive("/recommendations") ? "text-emerald-400" : "text-neutral-400"}`} />
                  <span>{t("nav_recommendations", "Recomendaciones")}</span>
                </Link>

                <Link
                  href="/biblioteca"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/biblioteca")
                      ? "bg-amber-500/20 text-amber-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <FolderKanban className={`w-5 h-5 ${isActive("/biblioteca") ? "text-amber-400" : "text-neutral-400"}`} />
                  <span>{t("nav_library", "Biblioteca")}</span>
                </Link>

                <div className="my-2.5 h-px bg-white/5" />

                <Link
                  href="/in-progress"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/in-progress")
                      ? "bg-emerald-500/20 text-emerald-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Play className={`w-5 h-5 ${isActive("/in-progress") ? "text-emerald-400" : "text-neutral-400"}`} fill="currentColor" />
                  <span>{t("nav_in_progress", "En Progreso")}</span>
                </Link>

                <Link
                  href="/history"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/history")
                      ? "bg-emerald-500/20 text-emerald-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Eye className={`w-5 h-5 ${isActive("/history") ? "text-emerald-400" : "text-neutral-400"}`} />
                  <span>{t("nav_history", "Historial")}</span>
                </Link>

                <div className="my-2.5 h-px bg-white/5" />

                <Link
                  href={favHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/favorites")
                      ? "bg-red-500/20 text-red-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isActive("/favorites") ? "text-red-400" : "text-neutral-400"}`} />
                  <span>{t("nav_favorites", "Favoritas")}</span>
                </Link>

                <Link
                  href={watchHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/watchlist")
                      ? "bg-sky-500/20 text-sky-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Bookmark className={`w-5 h-5 ${isActive("/watchlist") ? "text-sky-400" : "text-neutral-400"}`} />
                  <span>{t("nav_watchlist", "Pendientes")}</span>
                </Link>

                <div className="my-2.5 h-px bg-white/5" />

                <Link
                  href="/lists"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/lists")
                      ? "bg-purple-500/20 text-purple-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <ListVideo className={`w-5 h-5 ${isActive("/lists") ? "text-purple-400" : "text-neutral-400"}`} />
                  <span>{t("nav_lists", "Listas")}</span>
                </Link>

                <Link
                  href="/calendar"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    isActive("/calendar")
                      ? "bg-amber-500/20 text-amber-300 font-bold"
                      : "text-neutral-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <CalendarDaysIcon className={`w-5 h-5 ${isActive("/calendar") ? "text-amber-400" : "text-neutral-400"}`} />
                  <span>{t("nav_calendar", "Calendario")}</span>
                </Link>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== OVERLAY BÚSQUEDA (MÓVIL) ===================== */}
      <AnimatePresence>
        {showMobileSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[50px] flex flex-col p-4 pt-4"
            onClick={() => setShowMobileSearch(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-4 w-full">
                <SearchBar
                  isMobile={true}
                  formClassName="pr-[3.75rem]"
                  onResultClick={() => setShowMobileSearch(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowMobileSearch(false)}
                  className={`absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.1] text-white transition-all active:scale-95 hover:bg-black/[0.34] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 ${LIQUID_GLASS_PANEL}`}
                  aria-label="Cerrar búsqueda"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <NetflixSyncListener />
    </>
  );
}
