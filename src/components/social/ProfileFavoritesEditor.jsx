"use client";

import { useEffect, useRef, useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { Search, X, Plus, Loader2, ImageOff, Check } from "lucide-react";

const MAX = 5;
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

function keyOf(item) {
  return `${item.mediaType}:${item.tmdbId}`;
}

// Editor de los ≤5 "Favoritos del perfil" (selección curada, estilo Letterboxd).
// Auto-guarda en cada cambio via PUT /api/users/me/profile-favorites.
export default function ProfileFavoritesEditor() {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const reqIdRef = useRef(0);

  // Carga inicial de la selección guardada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me/profile-favorites", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setItems(Array.isArray(data.favorites) ? data.favorites : []);
      } catch {
        // se queda vacío
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Búsqueda TMDb (cliente, clave pública) mientras se escribe.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || !TMDB_KEY) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const reqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=es-ES&include_adult=false&page=1&query=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (reqId !== reqIdRef.current) return;
        const mapped = (data.results || [])
          .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path)
          .slice(0, 8)
          .map((r) => ({
            tmdbId: r.id,
            mediaType: r.media_type,
            title: r.title || r.name || "",
            posterPath: r.poster_path,
            year: (r.release_date || r.first_air_date || "").slice(0, 4),
          }));
        setResults(mapped);
      } catch {
        if (reqId === reqIdRef.current) setResults([]);
      } finally {
        if (reqId === reqIdRef.current) setSearching(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [query]);

  const persist = async (next) => {
    setSaving(true);
    setSavedTick(false);
    try {
      const res = await fetch("/api/users/me/profile-favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: next.map((i) => ({
            tmdbId: i.tmdbId,
            mediaType: i.mediaType,
            title: i.title,
            posterPath: i.posterPath,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.favorites)) {
        setItems(data.favorites);
      }
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    } catch {
      // se mantiene el estado local
    } finally {
      setSaving(false);
    }
  };

  const add = (candidate) => {
    if (items.length >= MAX) return;
    if (items.some((i) => keyOf(i) === keyOf(candidate))) return;
    const next = [...items, {
      tmdbId: candidate.tmdbId,
      mediaType: candidate.mediaType,
      title: candidate.title,
      posterPath: candidate.posterPath,
    }];
    setItems(next);
    setQuery("");
    setResults([]);
    persist(next);
  };

  const remove = (item) => {
    const next = items.filter((i) => keyOf(i) !== keyOf(item));
    setItems(next);
    persist(next);
  };

  const full = items.length >= MAX;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest text-emerald-400/80">
          Favoritos del perfil
        </span>
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : savedTick ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : null}
          {items.length}/{MAX}
        </span>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Elige hasta {MAX} títulos destacados que aparecerán en tu perfil.
      </p>

      {/* Rejilla de slots */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: MAX }).map((_, idx) => {
          const item = items[idx];
          if (!loaded) {
            return (
              <div key={idx} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" />
            );
          }
          if (item) {
            return (
              <div key={keyOf(item)} className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10">
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
                  onClick={() => remove(item)}
                  aria-label={`Quitar ${item.title}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          }
          return (
            <div
              key={`empty-${idx}`}
              className="flex aspect-[2/3] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] text-zinc-700"
            >
              <Plus className="h-5 w-5" />
            </div>
          );
        })}
      </div>

      {/* Buscador para añadir */}
      {!full && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar película o serie para añadir…"
            className="h-10 w-full rounded-full border border-white/10 bg-white/5 pl-10 pr-9 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-emerald-400/50"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-400" />
          )}

          {results.length > 0 && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#141414] shadow-2xl">
              {results.map((r) => {
                const already = items.some((i) => keyOf(i) === keyOf(r));
                return (
                  <button
                    key={keyOf(r)}
                    type="button"
                    onClick={() => add(r)}
                    disabled={already}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                  >
                    <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-zinc-800">
                      <OptimizedImage
                        src={`https://image.tmdb.org/t/p/w92${r.posterPath}`}
                        alt={r.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{r.title}</p>
                      <p className="text-xs text-zinc-500">
                        {r.mediaType === "tv" ? "Serie" : "Película"}
                        {r.year ? ` · ${r.year}` : ""}
                      </p>
                    </div>
                    {already ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Plus className="h-4 w-4 text-zinc-400" />
                    )}
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
