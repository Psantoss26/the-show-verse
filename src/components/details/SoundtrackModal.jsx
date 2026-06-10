"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  Loader2,
  Music2,
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ExternalLink,
} from "lucide-react";

function SpotifyIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M7.4 9.3c3.3-1 6.9-.7 9.7.9M8.1 12.2c2.5-.7 5.2-.5 7.4.8M8.8 14.9c1.9-.5 3.8-.3 5.5.5"
        fill="none"
        stroke="#000"
        strokeLinecap="round"
        strokeWidth="1.45"
      />
    </svg>
  );
}

function SourceLinkIcon({ source, className = "" }) {
  if (source === "Spotify") return <SpotifyIcon className={className} />;
  return <ExternalLink className={className} />;
}

export default function SoundtrackModal({
  open,
  onClose,
  title,
  tracks = [],
  loading = false,
  error = "",
  initialTrackId = null,
  searchUrl = "",
}) {
  const audioRef = useRef(null);

  const trackQueue = useMemo(
    () => tracks.filter((track) => track?.trackName),
    [tracks],
  );
  const playableTracks = useMemo(
    () => trackQueue.filter((track) => track?.previewUrl),
    [trackQueue],
  );

  const [selectedId, setSelectedId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialTrack =
      trackQueue.find((track) => track.id === initialTrackId) || trackQueue[0];
    setSelectedId(initialTrack?.id || null);
    setIsPlaying(Boolean(initialTrack?.previewUrl));
    setProgress(0);
  }, [initialTrackId, open, trackQueue]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prev;
      document.body.style.paddingRight = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  // Controles del reproductor de audio
  const togglePlay = () => {
    if (!selectedTrack?.previewUrl) return;
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    if (hasNext) {
      goNext();
    } else {
      setIsPlaying(false);
      setProgress(0);
    }
  };

  const handleSeek = (e) => {
    const val = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setProgress(val);
    }
  };

  const handleVolumeChange = (e) => {
    const val = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setVolume(val);
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const nextMuted = !isMuted;
      audioRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
  };

  if (!open) return null;

  const selectedTrack =
    trackQueue.find((track) => track.id === selectedId) ||
    trackQueue[0] ||
    null;

  const currentIndex = selectedTrack
    ? trackQueue.findIndex((track) => track.id === selectedTrack.id)
    : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < trackQueue.length - 1;
  const selectedExternalUrl = selectedTrack?.externalUrl || searchUrl;
  const selectedHasPreview = Boolean(selectedTrack?.previewUrl);

  const goPrev = () => {
    if (!hasPrev) return;
    const prevTrack = trackQueue[currentIndex - 1];
    setSelectedId(prevTrack?.id);
    setIsPlaying(Boolean(prevTrack?.previewUrl));
    setProgress(0);
  };

  const goNext = () => {
    if (!hasNext) return;
    const nextTrack = trackQueue[currentIndex + 1];
    setSelectedId(nextTrack?.id);
    setIsPlaying(Boolean(nextTrack?.previewUrl));
    setProgress(0);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative flex w-full max-w-[460px] flex-col overflow-hidden rounded-[3rem] border border-white/10 bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label={`Soundtrack de ${title || "este título"}`}
      >
        {loading ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 className="h-10 w-10 animate-spin text-yellow-300" />
            <p className="text-base font-medium">Buscando música...</p>
          </div>
        ) : selectedTrack ? (
          <div className="flex flex-col p-8 items-center w-full">
            {/* --- CABECERA --- */}
            <div className="flex w-full justify-between items-center mb-8">
              {selectedExternalUrl ? (
                <a
                  href={selectedExternalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition ${
                    selectedTrack?.source === "Spotify"
                      ? "border-[#1DB954]/30 bg-[#1DB954]/15 text-[#1DB954] hover:bg-[#1DB954]/25 hover:text-[#1ED760]"
                      : "border-white/20 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                  }`}
                  title={`Escuchar en ${selectedTrack?.source || "la web"}`}
                  aria-label={`Escuchar ${selectedTrack?.trackName || title || "soundtrack"} en ${selectedTrack?.source || "la web"}`}
                >
                  <SourceLinkIcon
                    source={selectedTrack?.source}
                    className="h-5 w-5"
                  />
                </a>
              ) : (
                <div className="w-11 h-11" />
              )}

              <div className="flex flex-col items-center">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 truncate max-w-[200px] text-center drop-shadow-sm">
                  {title || "Soundtrack"}
                </div>
                <div className="text-[10px] font-semibold text-white/40 mt-1">
                  {currentIndex + 1} DE {trackQueue.length}
                </div>
                {playableTracks.length > 0 &&
                  playableTracks.length < trackQueue.length && (
                    <div className="text-[10px] font-semibold text-white/30 mt-0.5">
                      {playableTracks.length} con preview
                    </div>
                  )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm"
                title="Cerrar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* --- PORTADA --- */}
            <div className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 mb-8 transition-transform duration-500 hover:scale-[1.02]">
              {selectedTrack.artworkUrl ? (
                <img
                  src={selectedTrack.artworkUrl}
                  alt={selectedTrack.trackName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5">
                  <Music2 className="h-20 w-20 text-yellow-300/50" />
                </div>
              )}
            </div>

            {/* --- INFO PISTA --- */}
            <div className="w-full text-center mb-8 space-y-1">
              <h4 className="text-2xl sm:text-3xl font-black text-white line-clamp-1 drop-shadow-md">
                {selectedTrack.trackName}
              </h4>
              <p className="text-base sm:text-lg font-medium text-white/70 line-clamp-1 drop-shadow-sm">
                {selectedTrack.artistName}
              </p>
            </div>

            {selectedHasPreview ? (
              <>
                {/* Reproductor de Audio Oculto */}
                <audio
                  ref={audioRef}
                  src={selectedTrack.previewUrl}
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                {/* --- BARRA DE PROGRESO --- */}
                <div className="w-full flex items-center gap-4 mb-8">
                  <span className="text-xs font-semibold text-white/50 w-10 text-right tabular-nums">
                    {formatTime(progress)}
                  </span>
                  <div className="relative flex-1 flex items-center group h-5">
                    <div className="absolute inset-x-0 h-1.5 bg-black/40 backdrop-blur-md rounded-full overflow-hidden border border-white/10 pointer-events-none">
                      <div
                        className="h-full bg-gradient-to-r from-white/60 to-white rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                        style={{
                          width: `${(progress / (duration || 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={progress}
                      onChange={handleSeek}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Progreso de la preview"
                    />
                  </div>
                  <span className="text-xs font-semibold text-white/50 w-10 text-left tabular-nums">
                    {formatTime(duration)}
                  </span>
                </div>
              </>
            ) : (
              <div className="mb-8 flex w-full flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-center">
                <p className="text-sm font-medium text-white/60">
                  Esta pista no tiene preview disponible.
                </p>
                {selectedExternalUrl && (
                  <a
                    href={selectedExternalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${
                      selectedTrack?.source === "Spotify"
                        ? "border-[#1DB954]/30 bg-[#1DB954]/15 text-[#1ED760] hover:bg-[#1DB954]/25"
                        : "border-white/20 bg-white/10 text-zinc-200 hover:bg-white/20"
                    }`}
                  >
                    <SourceLinkIcon
                      source={selectedTrack?.source}
                      className="h-4 w-4"
                    />
                    Escuchar en {selectedTrack?.source || "la web"}
                  </a>
                )}
              </div>
            )}

            {/* --- CONTROLES DE REPRODUCCIÓN --- */}
            <div className="w-full flex items-center justify-center gap-8 mb-8">
              <button
                type="button"
                onClick={goPrev}
                disabled={!hasPrev}
                className="text-white/70 hover:text-white transition disabled:opacity-30 disabled:hover:text-white/70"
              >
                <SkipBack className="w-8 h-8 sm:w-9 sm:h-9 fill-current" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                disabled={!selectedHasPreview}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white flex items-center justify-center hover:bg-white/20 hover:scale-105 active:scale-95 transition shadow-[0_10px_40px_-10px_rgba(255,255,255,0.2)]"
                aria-label={
                  selectedHasPreview
                    ? "Reproducir o pausar preview"
                    : "Preview no disponible"
                }
              >
                {isPlaying && selectedHasPreview ? (
                  <Pause className="w-10 h-10 sm:w-12 sm:h-12 fill-current" />
                ) : (
                  <Play className="w-10 h-10 sm:w-12 sm:h-12 fill-current ml-1 sm:ml-1.5" />
                )}
              </button>

              <button
                type="button"
                onClick={goNext}
                disabled={!hasNext}
                className="text-white/70 hover:text-white transition disabled:opacity-30 disabled:hover:text-white/70"
              >
                <SkipForward className="w-8 h-8 sm:w-9 sm:h-9 fill-current" />
              </button>
            </div>

            {/* --- VOLUMEN --- */}
            {selectedHasPreview && (
              <div className="w-full flex items-center justify-center gap-4 px-8">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="text-white/60 hover:text-white transition"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <div className="relative flex items-center w-28 h-5 group">
                  <div className="absolute inset-x-0 h-1.5 bg-black/40 backdrop-blur-md rounded-full overflow-hidden border border-white/10 pointer-events-none">
                    <div
                      className="h-full bg-white/70 group-hover:bg-white rounded-full transition-all duration-75"
                      style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[340px] flex-col items-center justify-center gap-3 text-center text-zinc-400 p-6">
            <Music2 className="h-12 w-12 opacity-25" />
            <p className="text-sm">
              {error || "No se encontraron canciones para este título."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
