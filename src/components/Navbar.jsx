"use client";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";


import OptimizedImage from "@/components/OptimizedImage";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import "@/app/globals.css";
import { useAuth } from "@/context/AuthContext";
import UserAvatar from "@/components/auth/UserAvatar";
import { useTranslation } from "@/lib/i18n";
import { AnimatePresence, motion } from "framer-motion";
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
  History,
  Trash2,
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

function normalizeSearchText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTitle(item) {
  return (
    item?.title ||
    item?.name ||
    item?.original_title ||
    item?.original_name ||
    ""
  );
}

function scoreSearchResult(item, normalizedQuery) {
  const title = normalizeSearchText(getSearchTitle(item));
  if (!title || !normalizedQuery) return 0;

  let score = 0;
  if (title === normalizedQuery) score += 10000;
  else if (title.startsWith(normalizedQuery)) score += 7000;
  else if (title.includes(normalizedQuery)) score += 5000;
  else if (normalizedQuery.length >= FUZZY_MIN_QUERY_LEN) {
    // Sin coincidencia por substring: puntuación TOLERANTE A ERRATAS para que un
    // título con 1-2 letras de diferencia siga apareciendo arriba (por debajo de
    // un acierto por substring, por encima del ruido de "populares no afines").
    const sim = fuzzySimilarity(normalizedQuery, title);
    if (sim >= FUZZY_MIN_SIMILARITY) score += sim * 5000;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const titleTokens = title.split(" ").filter(Boolean);
  // Tokens largos casan de forma fuzzy (cubre erratas en consultas multi-palabra);
  // los muy cortos siguen exigiendo substring exacto para no meter ruido.
  const matchedTokens = queryTokens.filter((token) =>
    token.length >= FUZZY_MIN_QUERY_LEN
      ? tokenFuzzyMatches(token, titleTokens)
      : title.includes(token),
  );
  if (queryTokens.length) {
    score += (matchedTokens.length / queryTokens.length) * 3000;
  }

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

function dedupeSearchResults(results) {
  const seen = new Set();
  const out = [];
  for (const item of results) {
    const normalized = normalizeSearchResult(item);
    if (!normalized) continue;
    const key = `${normalized.media_type}:${normalized.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/* ====================================================================
 * Componente de Búsqueda Reutilizable (Lógica y UI)
 * ==================================================================== */
function SearchBar({ onResultClick, isMobile = false }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownId = useId();
  const [showCollection, setShowCollection] = useState(false);
  const pendingCollectionRef = useRef(null); // colección precargada lista para mostrar

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
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openSearchHistory = () => {
    const history = readSearchHistory();
    setSearchHistory(history);
    setShowDropdown(true);
  };

  // Búsqueda multi y colección en paralelo
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
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
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeSearchText(trimmedQuery);
    const controller = new AbortController();

    const searchTimer = setTimeout(async () => {
      try {
        // Motor de fetch+ensamblado, reutilizable para la consulta original y para
        // el prefijo del fallback. El scoring es SIEMPRE contra la consulta original
        // normalizada, así el fuzzy elige el título correcto aunque hayamos buscado
        // por prefijo.
        const fetchAndAssemble = async (searchQuery) => {
          const buildSearchUrl = (path, page = 1) => {
            const params = new URLSearchParams({
              api_key: apiKey || "",
              language: "es-ES",
              query: searchQuery,
              page: String(page),
              include_adult: "false",
            });
            return `https://api.themoviedb.org/3${path}?${params.toString()}`;
          };

          const fetchJson = async (path, page = 1) => {
            const res = await fetch(buildSearchUrl(path, page), {
              signal: controller.signal,
            });
            if (!res.ok) return { results: [] };
            return res.json();
          };

          const [
            multiData,
            moviePage1,
            moviePage2,
            tvPage1,
            tvPage2,
            personPage1,
            personPage2,
            collData,
          ] = await Promise.all([
            fetchJson("/search/multi"),
            fetchJson("/search/movie"),
            fetchJson("/search/movie", 2),
            fetchJson("/search/tv"),
            fetchJson("/search/tv", 2),
            fetchJson("/search/person"),
            fetchJson("/search/person", 2),
            fetchJson("/search/collection"),
          ]);

          const multiResults = (multiData.results || [])
            .map((item) => normalizeSearchResult(item))
            .filter(Boolean);
          const movieResults = [
            ...(moviePage1.results || []),
            ...(moviePage2.results || []),
          ]
            .map((item) => normalizeSearchResult(item, "movie"))
            .filter(Boolean);
          const tvResults = [
            ...(tvPage1.results || []),
            ...(tvPage2.results || []),
          ]
            .map((item) => normalizeSearchResult(item, "tv"))
            .filter(Boolean);
          const personResults = [
            ...(personPage1.results || []),
            ...(personPage2.results || []),
          ]
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

          const collResults = (collData.results || []).map((c) => ({
            ...c,
            media_type: "collection",
            title: c.name,
          }));

          return { items, collResults };
        };

        let { items, collResults } = await fetchAndAssemble(trimmedQuery);

        // Sin resultados y consulta con cuerpo: TMDB no tolera erratas pero SÍ busca
        // por prefijo. Reintentamos con un prefijo recortado (la errata suele ir al
        // final) y conservamos solo candidatos con relevancia fuzzy real respecto a
        // la consulta ORIGINAL (para no colar el ruido de un prefijo corto).
        if (
          items.length === 0 &&
          normalizedQuery.length >= SEARCH_FALLBACK_MIN_LEN
        ) {
          const prefix = trimmedQuery
            .slice(0, Math.max(4, trimmedQuery.length - 2))
            .trim();
          if (prefix.length >= 4 && prefix !== trimmedQuery) {
            const alt = await fetchAndAssemble(prefix);
            const isRelevant = (it) => {
              const t = normalizeSearchText(getSearchTitle(it));
              if (!t) return false;
              if (t.includes(normalizedQuery) || t.startsWith(normalizedQuery)) {
                return true;
              }
              if (
                fuzzySimilarity(normalizedQuery, t) >=
                FALLBACK_TITLE_MIN_SIMILARITY
              ) {
                return true;
              }
              const titleTokens = t.split(" ").filter(Boolean);
              return normalizedQuery
                .split(" ")
                .filter((tok) => tok.length >= FUZZY_MIN_QUERY_LEN)
                .some((tok) => tokenFuzzyMatches(tok, titleTokens));
            };
            const filtered = alt.items.filter(isRelevant);
            if (filtered.length) {
              items = filtered;
              collResults = alt.collResults;
            }
          }
        }

        // Precargar la MEJOR colección (fuzzy-aware) para mostrarla tras la pausa.
        const bestColl = collResults
          .slice()
          .sort(
            (a, b) =>
              scoreSearchResult(b, normalizedQuery) -
              scoreSearchResult(a, normalizedQuery),
          )[0];
        pendingCollectionRef.current = bestColl || null;

        setResults(items);
        setShowDropdown(true);
        setIsSearching(false);
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Error buscando en TMDb:", err);
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(searchTimer);
      controller.abort();
    };
  }, [query]);

  // Insertar colección precargada instantáneamente cuando se activa
  useEffect(() => {
    if (!showCollection || !pendingCollectionRef.current) return;

    setResults((prev) => {
      if (prev.some((r) => r.media_type === "collection" && r.id === pendingCollectionRef.current.id)) return prev;
      const TOP_MULTI = 3;
      return [
        ...prev.slice(0, TOP_MULTI),
        pendingCollectionRef.current,
        ...prev.slice(TOP_MULTI),
      ];
    });
  }, [showCollection]);

  const handleResultClick = (item) => {
    const selectedTitle = getSearchTitle(item) || query;
    setSearchHistory(addSearchHistory(selectedTitle));
    setShowDropdown(false);
    setQuery("");
    setResults([]);
    inputRef.current?.blur();
    if (onResultClick) onResultClick();
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
      default:
        return {
          textClass: "text-zinc-300",
          dotClass: "bg-zinc-400 shadow-[0_0_6px_rgba(161,161,170,0.8)]",
        };
    }
  };

  const getMediaTypeLabel = (mediaType) => {
    switch (mediaType) {
      case "movie":
        return t("search_badge_movie", "Película");
      case "tv":
        return t("search_badge_tv", "Serie");
      case "person":
        return t("search_badge_person", "Persona");
      case "collection":
        return t("search_badge_collection", "Colección");
      default:
        return mediaType;
    }
  };

  return (
    <div
      className={`relative min-w-0 w-full ${isMobile ? "max-w-full" : "max-w-lg"}`}
      ref={searchRef}
    >
      <form onSubmit={(e) => e.preventDefault()} className="relative w-full">
        <div
          onClick={(event) => {
            if (event.target.closest("button")) return;
            inputRef.current?.focus();
            if (!query.trim()) openSearchHistory();
          }}
          className={`
            relative flex items-center w-full transition-all duration-300 ease-out
            rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[0_15px_30px_-10px_rgba(0,0,0,0.5)] group
            hover:bg-black/30
            focus-within:bg-black/40 focus-within:ring-4 focus-within:ring-white/10
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
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
                setShowDropdown(false);
                inputRef.current?.blur();
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
          </div>
        </div>
      </form>

      <AnimatePresence>
        {showDropdown &&
          (results.length > 0 || !query.trim()) && (
          <motion.div
            id={dropdownId}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`absolute top-full left-0 w-full text-white ${isMobile ? "mt-3" : "mt-2"} z-[99999] max-h-[70vh] overflow-y-auto no-scrollbar
              rounded-2xl bg-black/85 bg-gradient-to-br from-white/[0.12] via-transparent to-white/[0.04] backdrop-blur-2xl shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)]`}
          >
            {!query.trim() ? (
              <div className="p-2">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/55">
                    <History className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                    <span>{t("search_history_title", "Búsquedas recientes")}</span>
                  </div>
                  {searchHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={handleHistoryClear}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("search_history_clear_all", "Borrar todo")}
                    </button>
                  )}
                </div>
                {searchHistory.length > 0 ? (
                  <ul className="space-y-1" role="list">
                    {searchHistory.map((historyQuery) => (
                      <li
                        key={historyQuery}
                        className="group flex min-h-11 items-center rounded-xl transition-colors hover:bg-white/10 focus-within:bg-white/10"
                      >
                        <button
                          type="button"
                          onClick={() => handleHistoryClick(historyQuery)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/80"
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
                          className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/80"
                        >
                          <XIcon className="h-4 w-4" aria-hidden="true" />
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
                <div className="p-2">
                  {results.slice(0, 8).map((item) => {
                    const isCollection = item.media_type === "collection";
                    const href = isCollection
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
                            <OptimizedImage
                              src={
                                item.poster_path || item.profile_path
                                  ? `https://image.tmdb.org/t/p/w92${item.poster_path || item.profile_path}`
                                  : "/default-poster.png"
                              }
                              alt={item.title || item.name || "Resultado"}
                              width={48}
                              height={64}
                              className="w-12 h-16 rounded-lg shadow-lg object-cover border border-white/10 group-hover:border-white/20 transition-colors"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-base line-clamp-1 text-white group-hover:text-blue-300 transition-colors">
                              {item.title || item.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${getBadgeConfig(item.media_type).textClass}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${getBadgeConfig(item.media_type).dotClass}`}
                                />
                                {getMediaTypeLabel(item.media_type)}
                              </span>
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
                {results.length > 8 && (
                  <div className="px-4 py-2 text-center text-xs text-neutral-500 border-t border-white/10">
                    Mostrando 8 de {results.length} resultados
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ====================================================================
 * Navbar principal
 * ==================================================================== */
export default function Navbar() {
  const { account, hydrated } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();

  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  // Destino marcado de forma optimista al pulsar un enlace: el indicador del
  // navbar resalta de inmediato la sección a la que vas, sin esperar a que la
  // transición de ruta haga commit (lo que dejaba el indicador en la página de
  // origen mientras se montaban las páginas pesadas como Favoritos/Pendientes).
  const [pendingHref, setPendingHref] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
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

  // Fichas (/movie/… y /tv/…): en MÓVIL el póster es full-bleed y arranca justo
  // bajo la navbar, borde con borde. Con el fondo glass, su velo cortaba en seco
  // en ese borde y dejaba un escalón de brillo (línea horizontal) contra la fila
  // superior del póster. Arriba del todo usamos el mismo velo degradado que el
  // hero, que MUERE en transparente: así el borde no existe. Solo móvil
  // (`max-lg:`): en escritorio la navbar de fichas sigue siendo glass, intacta.
  // Las fichas viven en /details/movie/<id> y /details/tv/<id>. Se excluye
  // /details/person/<id>: no tiene póster full-bleed y debe conservar el glass.
  const isDetailsRoute = /^\/details\/(movie|tv)\//.test(pathname || "");
  const detailsHeroNavMobile = isDetailsRoute && !isScrolled;

  const activePath = pendingHref || pathname;
  const isActive = (href) =>
    activePath === href || (href !== "/" && activePath?.startsWith(href));

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
        prefetchNavRoute("/in-progress");
        prefetchNavRoute("/favorites");
        prefetchNavRoute("/watchlist");
      },
      { timeout: 1800 },
    );

    return () => cancel(handle);
  }, [pathname, prefetchNavRoute]);

  const navLinkClass = (href) =>
    `relative px-3 py-2 rounded-xl text-sm font-bold transition-all duration-300 ease-out ${
      isActive(href)
        ? "text-white"
        : isScrolled
          ? "text-zinc-100 hover:text-white hover:bg-white/10 hover:backdrop-blur-md hover:shadow-sm"
          : "text-neutral-300 hover:text-white hover:bg-white/10 hover:backdrop-blur-md hover:shadow-sm"
    } ${isScrolled ? "[text-shadow:0_2px_10px_rgba(0,0,0,1),0_1px_4px_rgba(0,0,0,0.8)]" : ""}`;

  const getActiveTabStyle = () => {
    return "bg-white/[0.09] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.22),0_8px_20px_-6px_rgba(0,0,0,0.4)]";
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

  const navLinkClassMobileBottom = (href, tone = "blue") => {
    const active = isActive(href);

    const tones = {
      red: {
        active: "text-red-400",
        inactive: "text-zinc-300 hover:text-red-400",
      },
      blue: {
        active: "text-sky-400",
        inactive: "text-zinc-300 hover:text-sky-400",
      },
      purple: {
        active: "text-fuchsia-400",
        inactive: "text-zinc-300 hover:text-fuchsia-400",
      },
      green: {
        active: "text-emerald-400",
        inactive: "text-zinc-300 hover:text-emerald-400",
      },
    };

    const t = tones[tone] || tones.blue;
    const toneClass = active ? t.active : t.inactive;

    return (
      "relative group flex h-[calc(100%_-_0.25rem)] min-w-0 flex-1 items-center justify-center rounded-full " +
      "transition-[color,transform] duration-300 ease-out " +
      "active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 " +
      `${toneClass}`
    );
  };

  const mobileBottomIconSlotClass =
    "absolute left-1/2 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center transition-all duration-300 ease-out " +
    (isScrolled ? "-translate-y-1/2" : "-translate-y-[85%]");

  const mobileBottomIconClass =
    "shrink-0 transition-[width,height] duration-300 ease-out " +
    (isScrolled ? "h-[1.125rem] w-[1.125rem]" : "h-5 w-5");

  const mobileBottomLabelClass =
    "pointer-events-none absolute inset-x-0 bottom-1.5 z-10 block truncate px-0.5 text-center text-[9px] font-semibold leading-[11px] tracking-tight " +
    "transition-[opacity,transform] duration-200 ease-out " +
    (isScrolled
      ? "translate-y-1 opacity-0"
      : "translate-y-0 opacity-100");

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
            : detailsHeroNavMobile
              ? // Móvil: velo con caída suavizada que muere en alfa 0 en el
                // borde inferior (clase `.details-nav-veil-mobile` en
                // globals.css), para fundir con la fila superior del póster sin
                // línea. Escritorio (lg:): glass idéntico al de siempre.
                "details-nav-veil-mobile lg:bg-black/20 lg:bg-gradient-to-br lg:from-white/10 lg:via-transparent lg:to-black/40 lg:backdrop-blur-[50px] lg:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]"
              : "bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]"
        }`}
      >
        {/* ---------------- Desktop ---------------- */}
        <div className="hidden lg:flex items-center justify-between h-16 py-3">
          {/* Izquierda */}
          <div className="flex items-center gap-8 flex-shrink-0 pl-6 -ml-10">
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

            <div className="flex items-center gap-4">
              <Link href="/" className={navLinkClass("/")}>
                {isActive("/") && (
                  <motion.div
                    layoutId="activeTabDesktopText"
                    className={`absolute inset-0 rounded-xl ${getActiveTabStyle()}`}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{t("nav_home", "Inicio")}</span>
              </Link>
              <Link
                href="/movies"
                prefetch
                onMouseEnter={() => prefetchNavRoute("/movies")}
                onFocus={() => prefetchNavRoute("/movies")}
                className={navLinkClass("/movies")}
              >
                {isActive("/movies") && (
                  <motion.div
                    layoutId="activeTabDesktopText"
                    className={`absolute inset-0 rounded-xl ${getActiveTabStyle()}`}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{t("nav_movies", "Películas")}</span>
              </Link>
              <Link
                href="/series"
                prefetch
                onMouseEnter={() => prefetchNavRoute("/series")}
                onFocus={() => prefetchNavRoute("/series")}
                className={navLinkClass("/series")}
              >
                {isActive("/series") && (
                  <motion.div
                    layoutId="activeTabDesktopText"
                    className={`absolute inset-0 rounded-xl ${getActiveTabStyle()}`}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{t("nav_series", "Series")}</span>
              </Link>
              <Link
                href="/discover"
                prefetch
                {...navPrefetchHandlers("/discover")}
                className={navLinkClass("/discover")}
              >
                {isActive("/discover") && (
                  <motion.div
                    layoutId="activeTabDesktopText"
                    className={`absolute inset-0 rounded-xl ${getActiveTabStyle()}`}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{t("nav_discover", "Descubrir")}</span>
              </Link>
              <Link
                href="/biblioteca"
                prefetch
                {...navPrefetchHandlers("/biblioteca")}
                className={navLinkClass("/biblioteca")}
              >
                {isActive("/biblioteca") && (
                  <motion.div
                    layoutId="activeTabDesktopText"
                    className={`absolute inset-0 rounded-xl ${getActiveTabStyle()}`}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{t("nav_library", "Biblioteca")}</span>
              </Link>
            </div>
          </div>

          {/* Derecha */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-12">
            <div className="flex items-center gap-2">
              <Link
                href="/lists"
                prefetch
                {...navPrefetchHandlers("/lists")}
                className={iconLinkClass("/lists", "purple")}
                aria-label="Listas"
              >
                {isActive("/lists") && (
                  <motion.div
                    layoutId="activeTabDesktopIcon"
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
                    layoutId="activeTabDesktopIcon"
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
                    layoutId="activeTabDesktopIcon"
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
                    layoutId="activeTabDesktopIcon"
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
                    layoutId="activeTabDesktopIcon"
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
                    layoutId="activeTabDesktopIcon"
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
              <div className="ml-2 w-28 h-9 rounded-full bg-neutral-800/80 animate-pulse" />
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

          {/* Centro */}
          <div className="absolute left-1/2 top-1/2 flex w-full max-w-[620px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 px-4">
            <SearchBar />
            <WatchNextAssistant heroNavMode={heroNavMode} />
          </div>
        </div>

        {/* ---------------- Mobile ---------------- */}
        <div className="lg:hidden relative flex items-center justify-between h-16 px-2">
          {/* Izquierda: menú + IA */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Abrir menú"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
            <WatchNextAssistant isMobile heroNavMode={heroNavMode} />
          </div>

          {/* Centro: logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Link href="/" className="block h-10 overflow-hidden">
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

          {/* Derecha: búsqueda + perfil */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-1">
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
      <nav
        aria-label={t("mobile_bottom_nav_label", "Navegación principal")}
        className={`lg:hidden fixed z-30 mx-auto rounded-full ${LIQUID_GLASS_PANEL} flex items-center px-2 overflow-visible transition-all duration-300 ease-out ${
          isScrolled
            ? "left-12 right-12 max-w-md bottom-[calc(0.75rem+env(safe-area-inset-bottom))] h-12"
            : "left-4 right-4 max-w-lg bottom-[calc(0.5rem+env(safe-area-inset-bottom))] h-14"
        }`}
      >
        {/* iOS 26 Liquid Glass Curve Highlight Overlay */}
        <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
        {/* iOS 26 Liquid Glass Sheen Light Overlay */}
        <div
          className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/[0.08] via-transparent to-white/[0.02] pointer-events-none overflow-hidden"
          style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
        />

        <Link
          href="/movies"
          prefetch
          onTouchStart={() => prefetchNavRoute("/movies")}
          onFocus={() => prefetchNavRoute("/movies")}
          className={navLinkClassMobileBottom("/movies", "blue")}
          aria-current={isActive("/movies") ? "page" : undefined}
        >
          {isActive("/movies") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-sky-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.05),0_4px_12px_rgba(56,189,248,0.12)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className={mobileBottomIconSlotClass}>
            <FilmIcon className={mobileBottomIconClass} />
          </span>
          <span className={mobileBottomLabelClass}>
            {t("nav_movies", "Películas")}
          </span>
        </Link>

        <Link
          href="/series"
          prefetch
          onTouchStart={() => prefetchNavRoute("/series")}
          onFocus={() => prefetchNavRoute("/series")}
          className={navLinkClassMobileBottom("/series", "purple")}
          aria-current={isActive("/series") ? "page" : undefined}
        >
          {isActive("/series") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-fuchsia-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.05),0_4px_12px_rgba(217,70,239,0.12)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className={mobileBottomIconSlotClass}>
            <TvIcon className={mobileBottomIconClass} />
          </span>
          <span className={mobileBottomLabelClass}>
            {t("nav_series", "Series")}
          </span>
        </Link>

        <Link
          href="/in-progress"
          prefetch
          {...navPrefetchHandlers("/in-progress")}
          className={navLinkClassMobileBottom("/in-progress", "green")}
          aria-current={isActive("/in-progress") ? "page" : undefined}
        >
          {isActive("/in-progress") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-emerald-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.05),0_4px_12px_rgba(16,185,129,0.12)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className={mobileBottomIconSlotClass}>
            <Play className={mobileBottomIconClass} fill="currentColor" />
          </span>
          <span className={mobileBottomLabelClass}>
            {t("nav_in_progress_short", "En curso")}
          </span>
        </Link>

        <Link
          href="/history"
          prefetch
          {...navPrefetchHandlers("/history")}
          className={navLinkClassMobileBottom("/history", "green")}
          aria-current={isActive("/history") ? "page" : undefined}
        >
          {isActive("/history") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-emerald-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.05),0_4px_12px_rgba(16,185,129,0.12)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className={mobileBottomIconSlotClass}>
            <Eye className={mobileBottomIconClass} />
          </span>
          <span className={mobileBottomLabelClass}>
            {t("nav_history", "Historial")}
          </span>
        </Link>

        <Link
          href={favHref}
          prefetch
          {...navPrefetchHandlers(favHref)}
          className={navLinkClassMobileBottom("/favorites", "red")}
          aria-current={isActive(favHref) ? "page" : undefined}
        >
          {isActive(favHref) && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-red-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.05),0_4px_12px_rgba(239,68,68,0.12)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className={mobileBottomIconSlotClass}>
            <Heart className={mobileBottomIconClass} />
          </span>
          <span className={mobileBottomLabelClass}>
            {t("nav_favorites", "Favoritas")}
          </span>
        </Link>

        <Link
          href={watchHref}
          prefetch
          {...navPrefetchHandlers(watchHref)}
          className={navLinkClassMobileBottom("/watchlist", "blue")}
          aria-current={isActive(watchHref) ? "page" : undefined}
        >
          {isActive(watchHref) && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-sky-500/20 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.05),0_4px_12px_rgba(56,189,248,0.12)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className={mobileBottomIconSlotClass}>
            <Bookmark className={mobileBottomIconClass} />
          </span>
          <span className={mobileBottomLabelClass}>
            {t("nav_watchlist", "Pendientes")}
          </span>
        </Link>
      </nav>

      {/* ===================== DRAWER MENÚ (MÓVIL) ===================== */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "tween", duration: 0.22 }}
              className="h-full w-[280px] bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[30px_0_80px_-15px_rgba(0,0,0,0.9)] px-4 pt-2 pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 min-w-0 h-28"
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
                  className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
                  aria-label="Cerrar menú"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="mt-0 space-y-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <HomeIcon className="w-5 h-5" />
                  <span>{t("nav_home", "Inicio")}</span>
                </Link>

                <Link
                  href="/movies"
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={() => prefetchNavRoute("/movies")}
                  onFocus={() => prefetchNavRoute("/movies")}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/movies")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <FilmIcon className="w-5 h-5" />
                  <span>{t("nav_movies", "Películas")}</span>
                </Link>

                <Link
                  href="/series"
                  onClick={() => setMobileMenuOpen(false)}
                  onMouseEnter={() => prefetchNavRoute("/series")}
                  onFocus={() => prefetchNavRoute("/series")}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/series")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <TvIcon className="w-5 h-5" />
                  <span>{t("nav_series", "Series")}</span>
                </Link>

                <Link
                  href="/discover"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/discover")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <Compass className="w-5 h-5" />
                  <span>{t("nav_discover", "Descubrir")}</span>
                </Link>

                <Link
                  href="/biblioteca"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/biblioteca")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <FolderKanban className="w-5 h-5" />
                  <span>{t("nav_library", "Biblioteca")}</span>
                </Link>

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href="/in-progress"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/in-progress")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                  <span>{t("nav_in_progress", "En Progreso")}</span>
                </Link>

                <Link
                  href="/history"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/history")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <Eye className="w-5 h-5" />
                  <span>{t("nav_history", "Historial")}</span>
                </Link>

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href={favHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/favorites")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <Heart className="w-5 h-5" />
                  <span>{t("nav_favorites", "Favoritas")}</span>
                </Link>

                <Link
                  href={watchHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/watchlist")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <Bookmark className="w-5 h-5" />
                  <span>{t("nav_watchlist", "Pendientes")}</span>
                </Link>

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href="/lists"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/lists")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <ListVideo className="w-5 h-5" />
                  <span>{t("nav_lists", "Listas")}</span>
                </Link>

                <Link
                  href="/calendar"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                    isActive("/calendar")
                      ? "bg-white/10 text-white"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  <CalendarDaysIcon className="w-5 h-5" />
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
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1">
                  <SearchBar
                    isMobile={true}
                    onResultClick={() => setShowMobileSearch(false)}
                  />
                </div>
                <button
                  onClick={() => setShowMobileSearch(false)}
                  className="flex-shrink-0 p-3 rounded-full bg-black/20 bg-gradient-to-br from-white/10 via-transparent to-black/40 backdrop-blur-[50px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] hover:bg-black/30 text-white transition-all active:scale-95"
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
