"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  Loader2,
  Music2,
  Pause,
  Play,
  X,
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import { getSpotlightBadge } from "@/lib/dashboard/media";
import DetailActionsRow from "@/components/details/DetailActionsRow";
import DetailsMetaGenresRow from "@/components/details/DetailsMetaGenresRow";
import { DetailsRatingsBadges } from "@/components/details/DetailsScoreboardPanel";
import { formatCountShort } from "@/lib/details/formatters";

export default function DashboardSpotlightPreview({
  item,
  mediaType,
  title,
  logoSrc,
  backdropSrc,
  year,
  runtime,
  genres,
  genreObjects = [],
  status,
  tmdbRating,
  tmdbVotes,
  imdbRating,
  awards,
  trailerVisible,
  trailerLoading,
  onToggleTrailer,
  onCloseTrailer,
  favorite,
  watchlist,
  actionLoading,
  onToggleFavorite,
  onToggleWatchlist,
  error,
}) {
  const [soundtrackTrack, setSoundtrackTrack] = useState(null);
  const [soundtrackLoading, setSoundtrackLoading] = useState(false);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const [soundtrackOpen, setSoundtrackOpen] = useState(false);
  const [soundtrackError, setSoundtrackError] = useState("");
  const audioRef = useRef(null);
  const soundtrackAbortRef = useRef(null);

  const closeSoundtrack = useCallback((event) => {
    event?.stopPropagation();
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
  }, []);

  useEffect(() => {
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = null;
    audioRef.current?.pause();
    setSoundtrackTrack(null);
    setSoundtrackLoading(false);
    setSoundtrackPlaying(false);
    setSoundtrackOpen(false);
    setSoundtrackError("");
  }, [item?.id]);

  useEffect(() => {
    if (!soundtrackOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeSoundtrack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSoundtrack, soundtrackOpen]);

  useEffect(() => {
    if (trailerVisible) closeSoundtrack();
  }, [closeSoundtrack, trailerVisible]);

  useEffect(
    () => () => {
      soundtrackAbortRef.current?.abort();
      audioRef.current?.pause();
    },
    [],
  );

  const handleToggleSoundtrack = async (event) => {
    event.stopPropagation();
    if (soundtrackLoading) return;
    if (soundtrackOpen) {
      closeSoundtrack();
      return;
    }

    onCloseTrailer?.();
    setSoundtrackOpen(true);
    setSoundtrackError("");
    if (soundtrackTrack?.previewUrl) return;

    const controller = new AbortController();
    soundtrackAbortRef.current?.abort();
    soundtrackAbortRef.current = controller;
    setSoundtrackLoading(true);

    try {
      const params = new URLSearchParams({
        title,
        type: mediaType,
        country: "ES",
        tmdbId: String(item.id),
      });
      const originalTitle = item.original_title || item.original_name;
      if (originalTitle && originalTitle !== title) {
        params.set("originalTitle", originalTitle);
      }
      if (year) params.set("year", String(year));

      const response = await fetch(`/api/soundtrack?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Soundtrack HTTP ${response.status}`);

      const data = await response.json();
      const track = Array.isArray(data?.tracks)
        ? data.tracks.find((candidate) => candidate?.previewUrl)
        : null;
      if (!track?.previewUrl) {
        setSoundtrackError(
          "No se encontró una canción con preview para este título.",
        );
        return;
      }

      setSoundtrackTrack({
        id: track.id || track.previewUrl,
        previewUrl: track.previewUrl,
        trackName: track.trackName || track.name || "Soundtrack",
        artistName: track.artistName || "",
        artworkUrl: track.artworkUrl || "",
      });
    } catch (requestError) {
      if (requestError?.name !== "AbortError") {
        setSoundtrackError("No se pudo cargar el soundtrack.");
      }
    } finally {
      if (soundtrackAbortRef.current === controller) {
        soundtrackAbortRef.current = null;
        setSoundtrackLoading(false);
      }
    }
  };

  const handleTogglePlayback = async (event) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !soundtrackTrack?.previewUrl) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    audio.volume = 0.3;
    try {
      await audio.play();
    } catch {
      setSoundtrackPlaying(false);
    }
  };

  const hasTmdbRating = Boolean(tmdbRating && tmdbRating !== "–");
  const badge = getSpotlightBadge(item);
  const normalizedGenres =
    Array.isArray(genreObjects) && genreObjects.length
      ? genreObjects
      : typeof genres === "string" && genres.trim()
        ? genres
            .split("•")
            .map((name) => name.trim())
            .filter(Boolean)
            .map((name) => ({ id: name, name }))
        : [];

  return (
    <>
      <div className="absolute inset-0 z-10 flex h-full items-end p-5 md:p-6 xl:p-8">
        <div className="min-w-0 max-w-[88%] sm:max-w-[82%] md:max-w-[72%] xl:max-w-[68%]">
          {logoSrc ? (
            <div className="mb-5 h-16 w-full max-w-[17rem] md:mb-6 md:h-20 md:max-w-[19rem] xl:h-24 xl:max-w-[21rem]">
              <OptimizedImage
                src={logoSrc}
                alt={title}
                decoding="async"
                fetchPriority="high"
                className="h-full w-full object-contain object-left drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]"
              />
            </div>
          ) : (
            <h3 className="mb-5 text-balance text-2xl font-black leading-none tracking-[-0.03em] text-white drop-shadow-lg sm:text-3xl md:mb-6">
              {title}
            </h3>
          )}

          <motion.div
            className="mb-3 w-full sm:w-auto"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            onClick={(event) => event.stopPropagation()}
          >
            <DetailActionsRow
              size="lg"
              className="labeled-row"
              showSeparator={false}
              onTrailer={onToggleTrailer}
              trailerAvailable
              trailerLoading={trailerLoading}
              trailerLabel="Ver trailer"
              trailerPlaying={trailerVisible}
              onSoundtrack={handleToggleSoundtrack}
              soundtrackAvailable
              favorite={favorite}
              favoriteLoading={actionLoading}
              onToggleFavorite={onToggleFavorite}
              watchlist={watchlist}
              watchlistLoading={actionLoading}
              onToggleWatchlist={onToggleWatchlist}
            />
          </motion.div>

          <div className="mb-2 flex w-full max-w-full flex-wrap items-center justify-start gap-x-2 gap-y-1.5">
            {badge && (
              <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wide text-black sm:text-[0.68rem]">
                {badge}
              </span>
            )}
            <DetailsMetaGenresRow
              yearIso={year}
              displayRuntimeValue={runtime}
              status={status}
              genres={normalizedGenres}
            />
          </div>

          {awards && (
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-emerald-300 drop-shadow-md sm:text-sm">
              <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="line-clamp-1">{awards}</span>
            </div>
          )}

          <DetailsRatingsBadges
            tmdb={
              hasTmdbRating
                ? {
                    value: tmdbRating,
                    sub:
                      typeof tmdbVotes === "number"
                        ? formatCountShort(tmdbVotes)
                        : null,
                  }
                : null
            }
            imdb={
              typeof imdbRating === "number"
                ? { value: imdbRating.toFixed(1), sub: null }
                : null
            }
          />

          {error && (
            <p className="mt-2 line-clamp-1 text-xs text-red-300">{error}</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {soundtrackOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-[inherit] p-4"
            role="dialog"
            aria-label={`Soundtrack de ${title}`}
            onClick={(event) => event.stopPropagation()}
          >
            {backdropSrc && (
              <OptimizedImage
                src={backdropSrc}
                alt=""
                aria-hidden="true"
                decoding="async"
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl"
              />
            )}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />

            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex min-h-32 w-full max-w-[32rem] items-center gap-4 overflow-hidden rounded-[1.75rem] bg-black/45 bg-gradient-to-br from-white/15 via-white/[0.06] to-black/35 p-4 pr-12 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.16),0_24px_50px_-18px_rgba(0,0,0,0.95)] backdrop-blur-3xl sm:gap-5 sm:p-5 sm:pr-14"
            >
              <button
                type="button"
                onClick={closeSoundtrack}
                autoFocus
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:h-10 sm:w-10"
                aria-label="Cerrar soundtrack"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {soundtrackLoading ? (
                <div
                  className="flex min-h-24 w-full items-center justify-center gap-3 text-zinc-300"
                  aria-live="polite"
                >
                  <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
                  <span className="text-sm font-semibold">
                    Buscando música...
                  </span>
                </div>
              ) : soundtrackTrack ? (
                <>
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_18px_35px_-14px_rgba(0,0,0,0.95)] sm:h-32 sm:w-32">
                    {soundtrackTrack.artworkUrl ? (
                      <OptimizedImage
                        src={soundtrackTrack.artworkUrl}
                        alt={`Portada de ${soundtrackTrack.trackName}`}
                        decoding="async"
                        fetchPriority="high"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Music2
                          className="h-10 w-10 text-amber-300/60"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="mb-1 truncate text-[0.62rem] font-bold uppercase tracking-[0.18em] text-white/45 sm:text-[0.68rem]">
                      {title}
                    </p>
                    <h4 className="line-clamp-2 text-base font-black leading-tight text-white drop-shadow-md sm:text-xl">
                      {soundtrackTrack.trackName}
                    </h4>
                    {soundtrackTrack.artistName && (
                      <p className="mt-1 line-clamp-1 text-xs font-medium text-white/65 sm:text-sm">
                        {soundtrackTrack.artistName}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleTogglePlayback}
                      className="mt-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-[0_10px_30px_-12px_rgba(255,255,255,0.35)] backdrop-blur-xl transition hover:scale-105 hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                      aria-label={
                        soundtrackPlaying
                          ? "Pausar canción"
                          : "Reproducir canción"
                      }
                    >
                      {soundtrackPlaying ? (
                        <Pause className="h-5 w-5 fill-current" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      )}
                    </button>
                    <audio
                      ref={audioRef}
                      src={soundtrackTrack.previewUrl}
                      autoPlay
                      loop
                      preload="metadata"
                      className="hidden"
                      onLoadedMetadata={(event) => {
                        event.currentTarget.volume = 0.3;
                      }}
                      onPlay={() => setSoundtrackPlaying(true)}
                      onPause={() => setSoundtrackPlaying(false)}
                    />
                  </div>
                </>
              ) : (
                <div
                  className="flex min-h-24 w-full flex-col items-center justify-center gap-2 text-center text-zinc-300"
                  aria-live="polite"
                >
                  <Music2 className="h-8 w-8 text-amber-300/50" />
                  <p className="max-w-72 text-sm font-medium">
                    {soundtrackError ||
                      "No se encontró música para este título."}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
