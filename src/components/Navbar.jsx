"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/app/globals.css";
import { useAuth } from "@/context/AuthContext";
import UserAvatar from "@/components/auth/UserAvatar";
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
  Activity,
  BarChart3,
  Play,
} from "lucide-react";
import TraktHistoryNavButton from "@/components/trakt/TraktHistoryNavButton";

/* ====================================================================
 * Componente de Búsqueda Reutilizable (Lógica y UI)
 * ==================================================================== */
function SearchBar({ onResultClick, isMobile = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const searchTimer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
            query,
          )}`,
        );
        const data = await res.json();
        const filteredResults = (data.results || []).filter(
          (item) =>
            item.media_type !== "person" ||
            item.known_for_department === "Acting",
        );
        setResults(filteredResults);
        setShowDropdown(true);
        setIsSearching(false);
      } catch (err) {
        console.error("Error buscando en TMDb:", err);
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimer);
  }, [query]);

  const handleResultClick = () => {
    setShowDropdown(false);
    setQuery("");
    setResults([]);
    if (onResultClick) onResultClick();
  };

  const getBadgeStyles = (mediaType) => {
    switch (mediaType) {
      case "movie":
        return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
      case "tv":
        return "bg-purple-500/15 text-purple-300 border border-purple-500/30";
      case "person":
        return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
      default:
        return "bg-neutral-500/15 text-neutral-300 border border-neutral-500/30";
    }
  };

  const getMediaTypeLabel = (mediaType) => {
    switch (mediaType) {
      case "movie":
        return "Película";
      case "tv":
        return "Serie";
      case "person":
        return "Persona";
      default:
        return mediaType;
    }
  };

  return (
    <div
      className={`relative w-full ${isMobile ? "max-w-full" : "max-w-lg"}`}
      ref={searchRef}
    >
      <form onSubmit={(e) => e.preventDefault()} className="relative w-full">
        <div
          className={`
            relative flex items-center w-full transition-all duration-300 ease-out
            bg-[#1A1A1A] border border-white/10 rounded-full group
            hover:bg-[#202020] hover:border-white/20
            focus-within:bg-[#202020] focus-within:border-white/30 focus-within:ring-4 focus-within:ring-white/5
            ${isMobile ? "h-12 pl-4 pr-3 shadow-2xl" : "h-11 pl-4 pr-3 shadow-lg"}
          `}
        >
          {/* Lupa siempre blanca y visible */}
          <SearchIcon
            className="w-5 h-5 text-white flex-shrink-0 opacity-100 group-focus-within:scale-110 transition-transform duration-300"
            strokeWidth={2.5}
          />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setShowDropdown(true)}
            placeholder={
              isMobile ? "Buscar..." : "Buscar películas, series o actores..."
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
            className={`absolute top-full left-0 w-full bg-[#121212]/95 text-white ${isMobile ? "mt-3" : "mt-2"} rounded-2xl 
              shadow-2xl shadow-black/50 max-h-[70vh] overflow-y-auto z-50 
              border border-white/10 backdrop-blur-2xl no-scrollbar`}
          >
            <div className="p-2">
              {results.slice(0, 8).map((item, index) => (
                <Link
                  key={`${item.media_type}-${item.id}`}
                  href={`/details/${item.media_type}/${item.id}`}
                  onClick={handleResultClick}
                >
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all cursor-pointer group"
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        src={
                          item.poster_path || item.profile_path
                            ? `https://image.tmdb.org/t/p/w92${item.poster_path || item.profile_path}`
                            : "/default-poster.png"
                        }
                        alt={item.title || item.name || "Resultado"}
                        className="w-12 h-16 rounded-lg shadow-lg object-cover border border-white/10 group-hover:border-white/20 transition-colors"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base line-clamp-1 text-white group-hover:text-blue-300 transition-colors">
                        {item.title || item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${getBadgeStyles(item.media_type)}`}
                        >
                          {getMediaTypeLabel(item.media_type)}
                        </span>
                        {item.release_date && (
                          <span className="text-xs text-neutral-500">
                            {new Date(item.release_date).getFullYear()}
                          </span>
                        )}
                        {item.first_air_date && (
                          <span className="text-xs text-neutral-500">
                            {new Date(item.first_air_date).getFullYear()}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </Link>
              ))}
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
  const pathname = usePathname();

  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  const navLinkClass = (href) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive(href)
      ? "bg-white/10 text-white"
      : "text-neutral-400 hover:text-white hover:bg-white/5"
    }`;

  const iconLinkClass = (href, tone = "neutral") => {
    const active = isActive(href);

    const base =
      "group p-2 rounded-full transition-all duration-200 " +
      "text-neutral-400 " +
      "hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95 " +
      "focus:outline-none";

    const ringBase = "ring-1 ring-transparent";

    const tones = {
      red: {
        hover:
          "hover:text-red-300 hover:bg-red-500/10 hover:ring-red-500/30 hover:shadow-[0_0_18px_rgba(239,68,68,0.16)]",
        active:
          "text-red-200 bg-red-500/15 ring-red-500/35 shadow-[0_0_18px_rgba(239,68,68,0.20)]",
        focus: "focus-visible:ring-2 focus-visible:ring-red-500/30",
      },
      blue: {
        hover:
          "hover:text-sky-300 hover:bg-sky-500/10 hover:ring-sky-500/30 hover:shadow-[0_0_18px_rgba(14,165,233,0.16)]",
        active:
          "text-sky-200 bg-sky-500/15 ring-sky-500/35 shadow-[0_0_18px_rgba(14,165,233,0.20)]",
        focus: "focus-visible:ring-2 focus-visible:ring-sky-500/30",
      },
      purple: {
        hover:
          "hover:text-fuchsia-300 hover:bg-fuchsia-500/10 hover:ring-fuchsia-500/30 hover:shadow-[0_0_18px_rgba(217,70,239,0.16)]",
        active:
          "text-fuchsia-200 bg-fuchsia-500/15 ring-fuchsia-500/35 shadow-[0_0_18px_rgba(217,70,239,0.20)]",
        focus: "focus-visible:ring-2 focus-visible:ring-fuchsia-500/30",
      },
      green: {
        hover:
          "hover:text-emerald-300 hover:bg-emerald-500/10 hover:ring-emerald-500/30 hover:shadow-[0_0_18px_rgba(16,185,129,0.16)]",
        active:
          "text-emerald-200 bg-emerald-500/15 ring-emerald-500/35 shadow-[0_0_18px_rgba(16,185,129,0.20)]",
        focus: "focus-visible:ring-2 focus-visible:ring-emerald-500/30",
      },
      amber: {
        hover:
          "hover:text-amber-300 hover:bg-amber-500/10 hover:ring-amber-500/30 hover:shadow-[0_0_18px_rgba(245,158,11,0.16)]",
        active:
          "text-amber-200 bg-amber-500/15 ring-amber-500/35 shadow-[0_0_18px_rgba(245,158,11,0.20)]",
        focus: "focus-visible:ring-2 focus-visible:ring-amber-500/30",
      },
      indigo: {
        hover:
          "hover:text-indigo-300 hover:bg-indigo-500/10 hover:ring-indigo-500/30 hover:shadow-[0_0_18px_rgba(99,102,241,0.16)]",
        active:
          "text-indigo-200 bg-indigo-500/15 ring-indigo-500/35 shadow-[0_0_18px_rgba(99,102,241,0.20)]",
        focus: "focus-visible:ring-2 focus-visible:ring-indigo-500/30",
      },
    };

    const t = tones[tone] || tones.amber;
    const toneClass = active ? t.active : t.hover;

    return `${base} ${ringBase} ${toneClass} ${t.focus}`;
  };

  const navLinkClassMobileBottom = (href) =>
    `flex flex-col items-center justify-center gap-0.5 px-2 transition-colors w-full ${isActive(href) ? "text-blue-400" : "text-neutral-400 hover:text-white"
    }`;

  // Menú inferior fijo: 4 secciones. Si no hay sesión, fav/watchlist llevan a login.
  const favHref = hydrated && account ? "/favorites" : "/login";
  const watchHref = hydrated && account ? "/watchlist" : "/login";

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
      <nav className="sticky top-0 z-40 w-full bg-black/80 backdrop-blur-md border-b border-neutral-800">
        {/* ---------------- Desktop ---------------- */}
        <div className="hidden lg:flex items-center justify-between h-16 py-3">
          {/* Izquierda */}
          <div className="flex items-center gap-8 flex-shrink-0 pl-6 -ml-10">
            <Link href="/" className="block h-12 overflow-hidden flex-shrink-0">
              <div className="h-full w-[120px] flex items-center justify-center overflow-hidden">
                <img
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[2.5] origin-left"
                />
              </div>
            </Link>

            <div className="flex items-center gap-4">
              <Link href="/" className={navLinkClass("/")}>
                Inicio
              </Link>
              <Link href="/movies" className={navLinkClass("/movies")}>
                Películas
              </Link>
              <Link href="/series" className={navLinkClass("/series")}>
                Series
              </Link>
              <Link href="/discover" className={navLinkClass("/discover")}>
                Descubrir
              </Link>
            </div>
          </div>

          {/* Derecha */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-12">
            <div className="flex items-center gap-2">
              <Link
                href="/stats"
                className={iconLinkClass("/stats", "indigo")}
                title="Estadísticas"
              >
                <BarChart3 className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
              </Link>

              <Link
                href="/lists"
                className={iconLinkClass("/lists", "purple")}
                title="Listas"
              >
                <ListVideo className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
              </Link>

              <Link
                href="/calendar"
                className={iconLinkClass("/calendar", "amber")}
                title="Calendario"
              >
                <CalendarDaysIcon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
              </Link>

              <Link
                href="/in-progress"
                className={iconLinkClass("/in-progress", "green")}
                title="En Progreso"
              >
                <Play className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" fill="currentColor" />
              </Link>

              <TraktHistoryNavButton />

              {hydrated && account && (
                <>
                  <Link
                    href="/favorites"
                    className={iconLinkClass("/favorites", "red")}
                    title="Favoritas"
                  >
                    <Heart className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                  </Link>

                  <Link
                    href="/watchlist"
                    className={iconLinkClass("/watchlist", "blue")}
                    title="Pendientes"
                  >
                    <Bookmark className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                  </Link>
                </>
              )}
            </div>

            {!hydrated ? (
              <div className="ml-2 w-28 h-9 rounded-full bg-neutral-800/80 animate-pulse" />
            ) : !account ? (
              <Link
                href="/login"
                className="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
              >
                Iniciar sesión
              </Link>
            ) : (
              <UserAvatar account={account} />
            )}
          </div>

          {/* Centro */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4 flex justify-center">
            <SearchBar />
          </div>
        </div>

        {/* ---------------- Mobile ---------------- */}
        <div className="lg:hidden relative flex items-center justify-between h-16 px-2">
          {/* Izquierda: menú */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
              title="Menú"
              aria-label="Abrir menú"
            >
              <MenuIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Centro: logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Link href="/" className="block h-10 overflow-hidden">
              <div className="h-full w-[140px] flex items-center justify-center overflow-hidden">
                <img
                  src="/logo-TSV-sinFondo.png"
                  alt="The Show Verse"
                  className="h-full w-auto object-contain scale-[2.8] origin-center"
                />
              </div>
            </Link>
          </div>

          {/* Derecha: búsqueda + perfil */}
          <div className="flex items-center gap-2 flex-shrink-0 pr-1">
            <button
              onClick={() => setShowMobileSearch(true)}
              className="p-2 rounded-full transition-colors text-white hover:bg-white/10"
              title="Buscar"
              aria-label="Buscar"
            >
              <SearchIcon className="w-6 h-6 text-white" />
            </button>

            {!hydrated ? (
              <div className="w-9 h-9 rounded-full bg-neutral-800/80 animate-pulse" />
            ) : !account ? (
              <Link
                href="/login"
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              >
                Acceder
              </Link>
            ) : (
              <UserAvatar account={account} />
            )}
          </div>
        </div>
      </nav>

      {/* ===================== BOTTOM BAR (MÓVIL) ===================== */}
      <div className="lg:hidden fixed bottom-0 left-0 z-30 w-full h-16 bg-black/95 backdrop-blur-md border-t border-neutral-800 flex items-center justify-around">
        <Link href="/movies" className={navLinkClassMobileBottom("/movies")}>
          <FilmIcon className="w-6 h-6" />
          <span className="text-xs">Películas</span>
        </Link>

        <Link href="/series" className={navLinkClassMobileBottom("/series")}>
          <TvIcon className="w-6 h-6" />
          <span className="text-xs">Series</span>
        </Link>

        <Link href={favHref} className={navLinkClassMobileBottom("/favorites")}>
          <Heart className="w-6 h-6" />
          <span className="text-xs">Favoritas</span>
        </Link>

        <Link
          href={watchHref}
          className={navLinkClassMobileBottom("/watchlist")}
        >
          <Bookmark className="w-6 h-6" />
          <span className="text-xs">Pendientes</span>
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
              className="h-full w-[280px] bg-[#0b0b0b] border-r border-neutral-800 px-4 pt-2 pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 min-w-0 h-28"
                >
                  <img
                    src="/logo-final-titulo-sinFondo.png"
                    alt="The Show Verse"
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
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <HomeIcon className="w-5 h-5" />
                  <span>Inicio</span>
                </Link>

                <Link
                  href="/movies"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/movies")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <FilmIcon className="w-5 h-5" />
                  <span>Películas</span>
                </Link>

                <Link
                  href="/series"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/series")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <TvIcon className="w-5 h-5" />
                  <span>Series</span>
                </Link>

                <Link
                  href="/discover"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/discover")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <Compass className="w-5 h-5" />
                  <span>Descubrir</span>
                </Link>

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href="/stats"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/stats")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <BarChart3 className="w-5 h-5" />
                  <span>Estadísticas</span>
                </Link>

                <Link
                  href="/in-progress"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/in-progress")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                  <span>En Progreso</span>
                </Link>

                <TraktHistoryNavButton
                  variant="drawer"
                  onClick={() => setMobileMenuOpen(false)}
                />

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href={favHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/favorites")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <Heart className="w-5 h-5" />
                  <span>Favoritas</span>
                </Link>

                <Link
                  href={watchHref}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/watchlist")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <Bookmark className="w-5 h-5" />
                  <span>Pendientes</span>
                </Link>

                <div className="my-3 h-px bg-neutral-800" />

                <Link
                  href="/lists"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/lists")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <ListVideo className="w-5 h-5" />
                  <span>Listas</span>
                </Link>

                <Link
                  href="/calendar"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive("/calendar")
                    ? "bg-white/10 text-white"
                    : "text-neutral-300 hover:bg-white/5"
                    }`}
                >
                  <CalendarDaysIcon className="w-5 h-5" />
                  <span>Calendario</span>
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
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col p-4 pt-4"
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
                  className="flex-shrink-0 p-3 rounded-full bg-neutral-800/80 hover:bg-neutral-700/80 text-white transition-all active:scale-95 shadow-lg"
                  aria-label="Cerrar búsqueda"
                >
                  <XIcon className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
