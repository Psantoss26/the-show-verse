"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Loader2, RotateCw, X } from "lucide-react";

import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import { getDetails } from "@/lib/api/tmdb";

const EMPTY_ARRAY = [];

function hasEpisodeRatings(ratings) {
  return (
    Array.isArray(ratings?.seasons) &&
    ratings.seasons.some(
      (season) =>
        Array.isArray(season?.episodes) && season.episodes.length > 0,
    )
  );
}

export default function EpisodeRatingsModal({
  open,
  onClose,
  showId,
  title,
  initialRatings = null,
  initialTmdbSeasons = EMPTY_ARRAY,
}) {
  const dialogRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [ratings, setRatings] = useState(null);
  const [tmdbSeasons, setTmdbSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  const titleId = `featured-episode-ratings-title-${showId}`;
  const descriptionId = `featured-episode-ratings-description-${showId}`;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) dialog.close();
  }, [mounted, open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !showId) return undefined;

    if (hasEpisodeRatings(initialRatings)) {
      setRatings(initialRatings);
      setTmdbSeasons(
        Array.isArray(initialTmdbSeasons) ? initialTmdbSeasons : [],
      );
      setLoading(false);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadRatings() {
      setLoading(true);
      setError("");

      try {
        const [ratingsResponse, details] = await Promise.all([
          fetch(
            `/api/seriesgraph/episode-ratings?tmdbId=${encodeURIComponent(showId)}`,
            {
              cache: "no-store",
              signal: controller.signal,
            },
          ),
          getDetails("tv", showId).catch(() => null),
        ]);

        const ratingsPayload = await ratingsResponse.json().catch(() => null);
        if (!ratingsResponse.ok) {
          throw new Error(
            ratingsPayload?.error ||
              "No se pudieron cargar las valoraciones de episodios.",
          );
        }

        if (cancelled) return;
        setRatings(ratingsPayload);
        setTmdbSeasons(
          Array.isArray(details?.seasons) ? details.seasons : [],
        );
      } catch (loadError) {
        if (cancelled || loadError?.name === "AbortError") return;
        setRatings(null);
        setTmdbSeasons([]);
        setError(
          loadError?.message ||
            "No se pudieron cargar las valoraciones de episodios.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRatings();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    initialRatings,
    initialTmdbSeasons,
    open,
    requestKey,
    showId,
  ]);

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      closedby="any"
      className="episode-ratings-dialog m-auto w-full max-h-none max-w-none overflow-visible bg-transparent p-0 text-white backdrop:bg-black/60 backdrop:backdrop-blur-lg"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) onClose?.();
      }}
      onClose={() => {
        if (open) onClose?.();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="episode-ratings-panel relative isolate mx-auto flex h-fit max-h-[calc(100dvh-2rem)] w-fit min-w-[min(20rem,calc(100%_-_2rem))] max-w-[min(78rem,calc(100%_-_2rem))] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black/45 bg-gradient-to-br from-white/10 via-white/[0.035] to-white/5 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[radial-gradient(circle_at_12%_0%,rgba(245,158,11,0.13),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_42%)]"
          aria-hidden="true"
        />

        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-white/[0.025] px-4 py-4 backdrop-blur-xl sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200 shadow-[0_0_24px_-10px_rgba(251,191,36,0.8)] sm:h-12 sm:w-12 sm:rounded-2xl">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="mb-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">
                Serie
              </p>
              <h2
                id={titleId}
                className="truncate text-lg font-black tracking-tight text-white sm:text-2xl"
              >
                Valoración de episodios
              </h2>
              <p
                id={descriptionId}
                className="truncate text-xs font-medium text-zinc-400 sm:text-sm"
              >
                {title || "Serie"} · puntuaciones por temporada
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:scale-105 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:h-11 sm:w-11"
            aria-label="Cerrar valoraciones de episodios"
            title="Cerrar (Esc)"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] sm:px-7 sm:py-6"
          aria-busy={loading}
        >
          {loading && (
            <div className="grid min-h-72 place-items-center">
              <div className="flex flex-col items-center gap-3 text-zinc-400">
                <Loader2
                  className="h-8 w-8 animate-spin text-amber-300 motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <p className="text-sm font-semibold">
                  Cargando valoraciones…
                </p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="grid min-h-72 place-items-center text-center">
              <div className="max-w-md">
                <p className="text-sm font-semibold text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => setRequestKey((current) => current + 1)}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                >
                  <RotateCw className="h-4 w-4" aria-hidden="true" />
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {!loading && !error && ratings && !hasEpisodeRatings(ratings) && (
            <div className="grid min-h-72 place-items-center">
              <p className="text-sm font-medium text-zinc-400">
                Todavía no hay valoraciones disponibles para esta serie.
              </p>
            </div>
          )}

          {!loading && !error && hasEpisodeRatings(ratings) && (
            <div className="w-fit max-w-full">
              <EpisodeRatingsGrid
                ratings={ratings}
                showId={Number(showId)}
                tmdbSeasons={tmdbSeasons}
                density="compact"
              />
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .episode-ratings-panel {
          animation: featuredRatingsModalIn 360ms
            cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .episode-ratings-dialog::backdrop {
          animation: featuredRatingsBackdropIn 240ms ease-out both;
        }

        @keyframes featuredRatingsModalIn {
          from {
            opacity: 0;
            transform: translate3d(0, 22px, 0) scale(0.965);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes featuredRatingsBackdropIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .episode-ratings-panel,
          .episode-ratings-dialog::backdrop {
            animation-duration: 100ms;
            transform: none;
          }
        }
      `}</style>
    </dialog>,
    document.body,
  );
}
