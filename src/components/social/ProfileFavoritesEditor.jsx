"use client";

import { useEffect, useRef, useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { Search, X, Plus, Loader2, ImageOff, Check } from "lucide-react";

const MAX_PER_TYPE = 5;
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const EMPTY_FAVORITES = { movie: [], tv: [] };

function keyOf(item) {
  return `${item.mediaType}:${item.tmdbId}`;
}

function normalizeGroups(payload) {
  const legacyItems = Array.isArray(payload?.favorites) ? payload.favorites : [];
  const movies = Array.isArray(payload?.movies)
    ? payload.movies
    : legacyItems.filter((item) => item?.mediaType === "movie");
  const series = Array.isArray(payload?.series)
    ? payload.series
    : legacyItems.filter((item) => item?.mediaType === "tv");
  return {
    movie: movies.slice(0, MAX_PER_TYPE),
    tv: series.slice(0, MAX_PER_TYPE),
  };
}

function payloadItem(item) {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
  };
}

function FavoriteRow({ type, items, loaded, onRemove }) {
  const label = type === "movie" ? "Películas favoritas" : "Series favoritas";

  return (
    <section aria-labelledby={`profile-favorites-${type}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3
          id={`profile-favorites-${type}`}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400"
        >
          {label}
        </h3>
        <span className="text-xs tabular-nums text-zinc-500">{items.length}/{MAX_PER_TYPE}</span>
      </div>
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: MAX_PER_TYPE }).map((_, index) => {
          const item = items[index];
          if (!loaded) {
            return <div key={index} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" />;
          }
          if (item) {
            return (
              <div
                key={keyOf(item)}
                className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10"
              >
                {item.posterPath ? (
                  <OptimizedImage
                    src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                    alt={item.title || ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-700">
                    <ImageOff className="h-6 w-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  aria-label={`Quitar ${item.title || label}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          }
          return (
            <div
              key={`empty-${type}-${index}`}
              className="flex aspect-[2/3] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] text-zinc-700"
              aria-hidden="true"
            >
              <Plus className="h-5 w-5" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Editor de favoritos destacados: cinco películas y cinco series, guardadas
// por separado para que una categoría nunca desplace a la otra.
export default function ProfileFavoritesEditor() {
  const [itemsByType, setItemsByType] = useState(EMPTY_FAVORITES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const savedTickTimer = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => () => {
    if (savedTickTimer.current) clearTimeout(savedTickTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/users/me/profile-favorites", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setItemsByType(normalizeGroups(data));
      } catch {
        // Se mantiene el estado vacío si la conexión falla.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || !TMDB_KEY) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const requestId = ++reqIdRef.current;
    const timeout = setTimeout(async () => {
      try {
        const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=es-ES&include_adult=false&page=1&query=${encodeURIComponent(normalizedQuery)}`;
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));
        if (requestId !== reqIdRef.current) return;
        setResults((data.results || [])
          .filter((result) => (result.media_type === "movie" || result.media_type === "tv") && result.poster_path)
          .slice(0, 8)
          .map((result) => ({
            tmdbId: result.id,
            mediaType: result.media_type,
            title: result.title || result.name || "",
            posterPath: result.poster_path,
            year: (result.release_date || result.first_air_date || "").slice(0, 4),
          })));
      } catch {
        if (requestId === reqIdRef.current) setResults([]);
      } finally {
        if (requestId === reqIdRef.current) setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timeout);
  }, [query]);

  const persist = async (next) => {
    setSaving(true);
    setSavedTick(false);
    try {
      const response = await fetch("/api/users/me/profile-favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movies: next.movie.map(payloadItem),
          series: next.tv.map(payloadItem),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setItemsByType(normalizeGroups(data));
      if (response.ok) {
        setSavedTick(true);
        if (savedTickTimer.current) clearTimeout(savedTickTimer.current);
        savedTickTimer.current = setTimeout(() => setSavedTick(false), 1500);
      }
    } catch {
      // Conservamos la elección local para no borrar una interacción del usuario.
    } finally {
      setSaving(false);
    }
  };

  const add = (candidate) => {
    const type = candidate?.mediaType;
    if (type !== "movie" && type !== "tv") return;
    const currentItems = itemsByType[type];
    if (currentItems.length >= MAX_PER_TYPE || currentItems.some((item) => keyOf(item) === keyOf(candidate))) return;
    const next = {
      ...itemsByType,
      [type]: [...currentItems, payloadItem(candidate)],
    };
    setItemsByType(next);
    setQuery("");
    setResults([]);
    persist(next);
  };

  const remove = (item) => {
    const type = item?.mediaType;
    if (type !== "movie" && type !== "tv") return;
    const next = {
      ...itemsByType,
      [type]: itemsByType[type].filter((current) => keyOf(current) !== keyOf(item)),
    };
    setItemsByType(next);
    persist(next);
  };

  const completelyFull = itemsByType.movie.length >= MAX_PER_TYPE && itemsByType.tv.length >= MAX_PER_TYPE;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400/80">Favoritos del perfil</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500" aria-live="polite">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Guardando" /> : null}
          {!saving && savedTick ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="Guardado" /> : null}
          {itemsByType.movie.length + itemsByType.tv.length}/{MAX_PER_TYPE * 2}
        </span>
      </div>
      <p className="mb-5 text-xs text-zinc-500">
        Elige hasta {MAX_PER_TYPE} películas y {MAX_PER_TYPE} series que aparecerán en tu perfil.
      </p>

      <div className="space-y-5">
        <FavoriteRow type="movie" items={itemsByType.movie} loaded={loaded} onRemove={remove} />
        <FavoriteRow type="tv" items={itemsByType.tv} loaded={loaded} onRemove={remove} />
      </div>

      {!completelyFull && (
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar película o serie para añadir…"
            className="h-10 w-full rounded-full border border-white/10 bg-white/5 pl-10 pr-9 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-400" />}

          {results.length > 0 && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl">
              {results.map((result) => {
                const typeItems = itemsByType[result.mediaType] || [];
                const alreadyAdded = typeItems.some((item) => keyOf(item) === keyOf(result));
                const typeFull = typeItems.length >= MAX_PER_TYPE;
                const disabled = alreadyAdded || typeFull;
                return (
                  <button
                    key={keyOf(result)}
                    type="button"
                    onClick={() => add(result)}
                    disabled={disabled}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                      <OptimizedImage
                        src={`https://image.tmdb.org/t/p/w92${result.posterPath}`}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{result.title}</p>
                      <p className="text-xs text-zinc-500">
                        {result.mediaType === "tv" ? "Serie" : "Película"}
                        {result.year ? ` · ${result.year}` : ""}
                        {typeFull && !alreadyAdded ? " · fila completa" : ""}
                      </p>
                    </div>
                    {alreadyAdded ? <Check className="h-4 w-4 text-emerald-400" /> : <Plus className="h-4 w-4 text-zinc-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
