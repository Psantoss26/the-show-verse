"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Star, Loader2 } from "lucide-react";
import { useTraktAuth } from "@/lib/trakt/useTraktAuth";

export default function TraktActions({ mediaType, tmdbId }) {
  const { ready, isConnected, getValidAccessToken } = useTraktAuth();

  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState(false);
  const [plays, setPlays] = useState(0);
  const [progress, setProgress] = useState(null);
  const [rating, setRating] = useState(null); // 1..10 | null
  const [error, setError] = useState("");

  const disabled = !ready || !isConnected || loading;

  const label = useMemo(() => {
    if (!ready) return "…";
    if (!isConnected) return "Trakt (no conectado)";
    return "Trakt";
  }, [ready, isConnected]);

  useEffect(() => {
    if (!ready || !isConnected || !mediaType || !tmdbId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await getValidAccessToken();
        if (!token) throw new Error("No token válido.");

        const r = await fetch(
          `/api/trakt/item/status?mediaType=${mediaType}&tmdbId=${tmdbId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || `Error Trakt (${r.status})`);

        if (!cancelled) {
          setWatched(!!data?.watched);
          setPlays(data?.plays || 0);
          setProgress(data?.progress ?? null);
          setRating(data?.rating ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Error cargando Trakt.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, isConnected, mediaType, tmdbId, getValidAccessToken]);

  async function toggleWatched() {
    if (disabled) return;
    setError("");
    const next = !watched;
    setWatched(next); // optimistic

    try {
      setLoading(true);
      const token = await getValidAccessToken();
      const r = await fetch("/api/trakt/item/watched", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaType, tmdbId, watched: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(
          data?.error_description || data?.error || `Error Trakt (${r.status})`,
        );
    } catch (e) {
      setWatched((v) => !v); // rollback
      setError(e?.message || "No se pudo actualizar visto.");
    } finally {
      setLoading(false);
    }
  }

  async function setMyRating(nextRating) {
    if (disabled) return;
    setError("");
    const prev = rating;
    setRating(nextRating); // optimistic

    try {
      setLoading(true);
      const token = await getValidAccessToken();
      const r = await fetch("/api/trakt/item/rating", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaType, tmdbId, rating: nextRating }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(
          data?.error_description || data?.error || `Error Trakt (${r.status})`,
        );
    } catch (e) {
      setRating(prev); // rollback
      setError(e?.message || "No se pudo guardar tu nota.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-white/60">{label}</div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleWatched}
          disabled={!ready || !isConnected || loading}
          className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-300 ${
            watched
              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
              : "border-white/20 bg-black/40 text-white/90 hover:bg-white/10 hover:border-white/30"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          title={watched ? "Marcar como no visto" : "Marcar como visto"}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          ) : watched ? (
            <Check className="w-4 h-4 shrink-0 drop-shadow-md" />
          ) : (
            <div className="w-4 h-4 shrink-0 rounded-full border-[1.5px] border-white/40" />
          )}

          <span className="whitespace-nowrap">
            {!watched
              ? "Marcar visto"
              : mediaType === "show" && progress !== null
                ? `Visto ${progress}%`
                : mediaType === "movie" && plays > 0
                  ? `Visto ${plays > 1 ? `${plays} veces` : "1 vez"}`
                  : "Visto"}
          </span>
        </button>

        {/* Rating simple: 1..10 */}
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-white/60" />
          <select
            value={rating ?? ""}
            onChange={(e) =>
              setMyRating(e.target.value ? Number(e.target.value) : null)
            }
            disabled={disabled}
            className="text-xs bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-white/80"
            title="Tu nota en Trakt"
          >
            <option value="">Sin nota</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}/10
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="text-[11px] text-red-300">{error}</div>}
    </div>
  );
}
