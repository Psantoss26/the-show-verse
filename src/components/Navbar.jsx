"use client";


import OptimizedImage from "@/components/OptimizedImage";
import { useCallback, useEffect, useRef, useState } from "react";
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
  FolderKanban,
} from "lucide-react";
import TraktHistoryNavButton from "@/components/trakt/TraktHistoryNavButton";
import WatchNextAssistant from "@/components/WatchNextAssistant";
import NetflixSyncListener from "@/components/NetflixSyncListener";

/* ====================================================================
 * Componente de Búsqueda Reutilizable (Lógica y UI)
 * ==================================================================== */
function SearchBar({ onResultClick, isMobile = false }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);
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

  // Búsqueda multi y colección en paralelo
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      pendingCollectionRef.current = null;
      return;
    }

    pendingCollectionRef.current = null;

    setIsSearching(true);
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    const searchTimer = setTimeout(async () => {
      try {
        const [multiRes, collRes] = await Promise.all([
          fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(query)}`,
          ),
          fetch(
            `https://api.themoviedb.org/3/search/collection?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(query)}`,
          ),
        ]);

        const multiData = await multiRes.json();
        const collData = await collRes.json();

        const multiResults = (multiData.results || [])
          .filter(
            (item) =>
              item.media_type !== "person" ||
              item.known_for_department === "Acting",
          )
          .sort((a, b) => {
            const aVotes = a.vote_count || 0;
            const bVotes = b.vote_count || 0;
            if (aVotes !== bVotes) return bVotes - aVotes;
            return (b.popularity || 0) - (a.popularity || 0);
          });

        // Precargar colección en ref para mostrarla instantáneamente tras la pausa
        const topColl = (collData.results || []).slice(0, 1).map((c) => ({
          ...c,
          media_type: "collection",
          title: c.name,
        }));
        pendingCollectionRef.current = topColl.length > 0 ? topColl[0] : null;

        setResults(multiResults);
        setShowDropdown(true);
        setIsSearching(false);
      } catch (err) {
        console.error("Error buscando en TMDb:", err);
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(searchTimer);
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

  const handleResultClick = () => {
    setShowDropdown(false);
    setQuery("");
    setResults([]);
    if (onResultClick) onResultClick();
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setShowDropdown(true)}
              placeholder={
                  isMobile ? t("search_mobile_placeholder", "Buscar...") : t("search_placeholder", "Buscar películas, series, actores o colecciones...")
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
                  setShowDropdown(false);
                }}
                className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      <AnimatePresence>
        {showDropdown && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`absolute top-full left-0 w-full text-white ${isMobile ? "mt-3" : "mt-2"} z-[99999] max-h-[70vh] overflow-y-auto no-scrollbar
              rounded-2xl bg-black/95 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-[100px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)]`}
          >
            <div className="p-2">
              {results.slice(0, 8).map((item, index) => {
                const isCollection = item.media_type === "collection";
                const href = isCollection
                  ? `/lists/collection/${item.id}`
                  : `/details/${item.media_type}/${item.id}`;
                return (
                <Link
                  key={`${item.media_type}-${item.id}`}
                  href={href}
                  onClick={handleResultClick}
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
                            <span className="text-zinc-600 text-[10px]">●</span>
                            <span className="text-xs font-semibold text-zinc-400">
                              {new Date(item.release_date).getFullYear()}
                            </span>
                          </>
                        )}
                        {item.first_air_date && (
                          <>
                            <span className="text-zinc-600 text-[10px]">●</span>
                            <span className="text-xs font-semibold text-zinc-400">
                              {new Date(item.first_air_date).getFullYear()}
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
    return "bg-white/10 border border-white/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.1),0_4px_10px_rgba(255,255,255,0.02)]";
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
    return `${base} ${active ? t.active : t.hover} ${active ? "" : "text-neutral-400"}`;
  };

  const navLinkClassMobileBottom = (href, tone = "blue") => {
    const active = isActive(href);

    const tones = {
      red: {
        active: "text-red-400",
        inactive: "text-neutral-400 hover:text-red-400",
      },
      blue: {
        active: "text-sky-400",
        inactive: "text-neutral-400 hover:text-sky-400",
      },
      purple: {
        active: "text-fuchsia-400",
        inactive: "text-neutral-400 hover:text-fuchsia-400",
      },
      green: {
        active: "text-emerald-400",
        inactive: "text-neutral-400 hover:text-emerald-400",
      },
    };

    const t = tones[tone] || tones.blue;
    const toneClass = active ? t.active : t.inactive;

    return (
      "relative group mx-1 my-2 flex h-12 flex-1 items-center justify-center rounded-full " +
      "transition-all duration-300 ease-out " +
      "hover:-translate-y-0.5 active:scale-95 focus:outline-none " +
      `${toneClass}`
    );
  };

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
      {/* En Inicio, la barra es transparente sobre el hero a pantalla completa y
          vuelve a su fondo glass al hacer scroll (estilo Netflix/Prime). */}
      <nav
        className={`sticky top-0 z-40 w-full transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
          pathname === "/" && !isScrolled
            ? "bg-transparent shadow-none"
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

              <TraktHistoryNavButton />

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
              <UserAvatar account={account} />
            )}
          </div>

          {/* Centro */}
          <div className="absolute left-1/2 top-1/2 flex w-full max-w-[620px] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-2 px-4">
            <SearchBar />
            <WatchNextAssistant />
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
            <WatchNextAssistant isMobile />
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
      <div className="lg:hidden fixed bottom-[calc(0.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-30 mx-auto max-w-lg h-16 rounded-full bg-black/30 bg-gradient-to-b from-white/10 to-transparent backdrop-blur-[30px] saturate-[140%] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_36px_-6px_rgba(0,0,0,0.6)] border border-white/12 flex items-center px-4 overflow-visible">
        {/* iOS 26 Liquid Glass Curve Highlight Overlay */}
        <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />

        <Link
          href="/movies"
          prefetch
          onTouchStart={() => prefetchNavRoute("/movies")}
          onFocus={() => prefetchNavRoute("/movies")}
          className={navLinkClassMobileBottom("/movies", "blue")}
        >
          {isActive("/movies") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-sky-500/20 border border-sky-500/30 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(56,189,248,0.15)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-10 flex items-center justify-center">
            <FilmIcon className="w-6 h-6" />
          </span>
        </Link>

        <Link
          href="/series"
          prefetch
          onTouchStart={() => prefetchNavRoute("/series")}
          onFocus={() => prefetchNavRoute("/series")}
          className={navLinkClassMobileBottom("/series", "purple")}
        >
          {isActive("/series") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/30 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(217,70,239,0.15)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-10 flex items-center justify-center">
            <TvIcon className="w-6 h-6" />
          </span>
        </Link>

        <Link
          href="/in-progress"
          prefetch
          {...navPrefetchHandlers("/in-progress")}
          className={navLinkClassMobileBottom("/in-progress", "green")}
        >
          {isActive("/in-progress") && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-emerald-500/20 border border-emerald-500/30 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(16,185,129,0.15)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-10 flex items-center justify-center">
            <Play className="w-6 h-6" fill="currentColor" />
          </span>
        </Link>

        <TraktHistoryNavButton
          variant="mobile-bottom"
          iconSize={24}
        />

        <Link
          href={favHref}
          prefetch
          {...navPrefetchHandlers(favHref)}
          className={navLinkClassMobileBottom("/favorites", "red")}
        >
          {isActive(favHref) && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-red-500/20 border border-red-500/30 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(239,68,68,0.15)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-10 flex items-center justify-center">
            <Heart className="w-6 h-6" />
          </span>
        </Link>

        <Link
          href={watchHref}
          prefetch
          {...navPrefetchHandlers(watchHref)}
          className={navLinkClassMobileBottom("/watchlist", "blue")}
        >
          {isActive(watchHref) && (
            <motion.div
              layoutId="activeTabMobileBottom"
              className="absolute inset-0 rounded-full bg-sky-500/20 border border-sky-500/30 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(56,189,248,0.15)]"
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
          <span className="relative z-10 flex items-center justify-center">
            <Bookmark className="w-6 h-6" />
          </span>
        </Link>
      </div>

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

                <TraktHistoryNavButton
                  variant="drawer"
                  onClick={() => setMobileMenuOpen(false)}
                />

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
