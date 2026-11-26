"use client";
import { LIQUID_GLASS_PANEL, LIQUID_GLASS_MODAL_HEADER } from "@/lib/ui/liquidGlass";

import { useEffect, useState } from "react";
import useActionModalMotion from "@/hooks/useActionModalMotion";
import { createPortal } from "react-dom";
import {
  Loader2,
  RotateCw,
  X,
  BarChart3,
} from "lucide-react";
import ModalTitleIcon from "@/components/details/ModalTitleIcon";

import EpisodeRatingsGrid from "@/components/EpisodeRatingsGrid";
import { getDetails } from "@/lib/api/tmdb";
import useModalGuard from "@/hooks/useModalGuard";

const EMPTY_ARRAY = [];

function stopModalEvent(event) {
  event.stopPropagation();
  event.nativeEvent?.stopImmediatePropagation?.();
}

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
  const [mounted, setMounted] = useState(false);
  const [ratings, setRatings] = useState(null);
  const [tmdbSeasons, setTmdbSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  const titleId = `featured-episode-ratings-title-${showId}`;
  const descriptionId = `featured-episode-ratings-description-${showId}`;

  useEffect(() => setMounted(true), []);

  useModalGuard({ open, onClose, closeOnBack: true });

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

  const actionMotion = useActionModalMotion(open);
  if (!mounted || !actionMotion.present) return null;

  const closeFromEvent = (event) => {
    stopModalEvent(event);
    onClose?.();
  };

  return createPortal(
    <div
      data-detail-modal-layer=""
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6${actionMotion.closing ? " pointer-events-none" : ""}`}
      onPointerDown={stopModalEvent}
      onMouseDown={stopModalEvent}
      onClick={stopModalEvent}
    >
      {/* BACKDROP: Estilo cristal con desenfoque + Animación de fade */}
      <div
        ref={actionMotion.backdropRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
        onClick={closeFromEvent}
        aria-hidden="true"
      />

      {/* MODAL CONTAINER: Liquid Glass */}
      <div
        ref={actionMotion.panelRef}
        className={`relative flex h-fit sv-modal-max-h w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[2rem] sm:w-fit sm:min-w-[min(20rem,calc(100%_-_2rem))] sm:max-w-[min(78rem,calc(100%_-_2rem))] ${LIQUID_GLASS_PANEL}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[radial-gradient(circle_at_12%_0%,rgba(245,158,11,0.13),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_42%)]"
          aria-hidden="true"
        />

        <header className={`flex shrink-0 items-center justify-between gap-4 ${LIQUID_GLASS_MODAL_HEADER} px-6 pt-5 pb-3 sm:px-8 sm:pt-7 sm:pb-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <ModalTitleIcon icon={BarChart3} tone="neutral" />
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
            onClick={closeFromEvent}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar valoraciones de episodios"
            title="Cerrar (Esc)"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div
          className="sv-modal-scroll-fade sv-modal-flat-glass min-h-0 flex-1 sv-no-scrollbar-deep overflow-y-auto overscroll-contain px-6 pt-2 pb-5 sm:px-8 sm:pt-2 sm:pb-6"
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
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
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
                // El tooltip se porta a body: debe superar la capa 10000 del modal.
                tooltipZIndex={10001}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
