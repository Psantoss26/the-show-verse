"use client";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";


import OptimizedImage from "@/components/OptimizedImage";
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
  CirclePlay,
  ThumbsUp,
  ThumbsDown,
  EyeOff,
  RotateCcw,
  Undo2,
} from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";
import { useServerOnline } from "@/context/ServerStatusContext";

function sourceIconPath(source) {
  const key = String(source || "").toLowerCase();
  if (key === "spotify") return "/spotify.png";
  if (key === "itunes") return "/itunes.png";
  if (key === "deezer") return "/deezer.png";
  return "";
}

function SourceLinkIcon({ source, className = "" }) {
  const iconPath = sourceIconPath(source);
  if (iconPath) {
    return (
      <OptimizedImage
        src={iconPath}
        alt=""
        aria-hidden="true"
        decoding="async"
        className={`${className} object-contain`}
      />
    );
  }
  return <ExternalLink className={className} />;
}

// Botón de icono de la fila de controles (sin texto: el nombre va en
// `aria-label` para lectores de pantalla).
function ControlIconButton({ icon: Icon, label, onClick, pressed, disabled = false, busy = false, activeClassName = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed && activeClassName
          ? activeClassName
          : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
      }`}
    >
      {busy ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

// Interruptor de reproducción automática: el de Ajustes (ToggleRow) en pequeño,
// con un icono en lugar de texto.
function AutoplaySwitch({ checked, disabled, onChange }) {
  return (
    <div className="flex items-center gap-2.5">
      <CirclePlay className="h-5 w-5 text-white/60" aria-hidden="true" />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Reproducción automática al abrir la ficha"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked
            ? "bg-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            : "bg-white/10"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
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
  // Modo soundtrack de la ficha (useAmbientSoundtrack): si la banda sonora
  // suena sola al abrir una ficha. Con `onAutoplayChange` aparece un
  // interruptor bajo el volumen (es la misma preferencia que Ajustes); sin él
  // (p. ej. desde DetailModal) no se pinta. El altavoz NO la toca: solo
  // silencia este reproductor.
  autoplay = true,
  onAutoplayChange = null,
  // Valoración del soundtrack de este título (src/lib/soundtrack/
  // soundtrackFeedback.js). Con `onFeedback` aparecen 👍 / 👎 / revertir /
  // ocultar:
  //   "confirm"  lo da por bueno (otra vez: lo deja sin valorar);
  //   "dislike"  descarta este resultado y busca otra alternativa;
  //   "undo"     revertir el último 👎: vuelve al soundtrack anterior (solo
  //              con `rejectionCount` > 0);
  //   "hide"     no mostrar el soundtrack de este título;
  //   "reset"    olvidar todos los descartes (cuando ya no quedan alternativas).
  // `pendingAction`: la de esas acciones cuya búsqueda está en curso.
  feedbackStatus = null,
  rejectionCount = 0,
  onFeedback = null,
  pendingAction = null,
}) {
  const online = useServerOnline();
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
  const [volume, setVolume] = useState(0.3);
  const [isMuted, setIsMuted] = useState(false);
  const showAutoplaySwitch = typeof onAutoplayChange === "function";
  const showFeedback = typeof onFeedback === "function";
  const canUndo = showFeedback && rejectionCount > 0;
  const busy = Boolean(pendingAction);

  useEffect(() => {
    if (!open) return;
    const initialTrack =
      trackQueue.find((track) => track.id === initialTrackId) || trackQueue[0];
    setSelectedId(initialTrack?.id || null);
    setIsPlaying(Boolean(initialTrack?.previewUrl));
    setProgress(0);
    // Silenciar vale solo para esa vez: al volver a abrir, suena.
    setIsMuted(false);
  }, [initialTrackId, open, trackQueue]);

  useModalGuard({ open, onClose });

  // Sincronizar volumen e inicializar el reproductor con el volumen correcto
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
    }
  }, [selectedId, open, volume, isMuted]);

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
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;
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
        // En pantallas bajas el reproductor (con el interruptor de reproducción
        // automática) no cabe: se desplaza por dentro en vez de salirse.
        className={`relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[460px] flex-col overflow-y-auto overscroll-contain rounded-[2rem] [scrollbar-width:none] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
        role="dialog"
        aria-modal="true"
        aria-label={`Soundtrack de ${title || "este título"}`}
      >
        {loading ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 className="h-10 w-10 animate-spin text-yellow-300" />
            <p className="text-base font-medium">
              {pendingAction === "dislike"
                ? "Buscando otra alternativa..."
                : pendingAction === "undo"
                  ? "Recuperando el soundtrack anterior..."
                  : "Buscando música..."}
            </p>
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
                  className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-110 text-white/70 hover:text-white"
                  aria-label={`Escuchar ${selectedTrack?.trackName || title || "soundtrack"} en ${selectedTrack?.source || "la web"}`}
                >
                  <SourceLinkIcon
                    source={selectedTrack?.source}
                    className="h-7 w-7 sm:h-8 sm:w-8 drop-shadow-md"
                  />
                </a>
              ) : (
                <div className="w-11 h-11" />
              )}

              {/* El título de la película o serie se muestra ENTERO: envuelve
                  en varias líneas en vez de recortarse. La columna ocupa el
                  hueco que dejan los dos botones (`flex-1` + `min-w-0`), y el
                  texto parte por palabras; solo un título de una sola palabra
                  larguísima partiría por letras. */}
              <div className="flex min-w-0 flex-1 flex-col items-center px-2">
                <div className="w-full text-[11px] font-bold uppercase tracking-[0.2em] text-white/80 text-center text-balance [overflow-wrap:anywhere] drop-shadow-sm">
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
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm"
                aria-label="Cerrar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* --- PORTADA --- */}
            <div className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-[2.5rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] mb-8 transition-transform duration-500 hover:scale-[1.02]">
              {selectedTrack.artworkUrl ? (
                <OptimizedImage
                  src={selectedTrack.artworkUrl}
                  alt={selectedTrack.trackName}
                  decoding="async"
                  fetchPriority="high"
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
              <h4 className="text-2xl sm:text-3xl font-black text-white drop-shadow-md text-balance">
                {selectedTrack.trackName}
              </h4>
              {/* Hasta DOS líneas de intérpretes: con una sola se cortaban
                  nombres que caben de sobra, y algunas pistas acreditan a diez
                  o más y empujaban los controles fuera del modal. Pasadas las
                  dos líneas se recorta con puntos suspensivos. */}
              <p className="text-base sm:text-lg font-medium text-white/70 line-clamp-2 [overflow-wrap:anywhere] drop-shadow-sm">
                {selectedTrack.artistName}
              </p>
            </div>

            {selectedHasPreview ? (
              <>
                <audio
                  ref={audioRef}
                  src={selectedTrack.previewUrl}
                  autoPlay
                  preload="metadata"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                <div className="w-full flex items-center gap-4 mb-8">
                  <span className="text-xs font-semibold text-white/50 w-10 text-right tabular-nums">
                    {formatTime(progress)}
                  </span>
                  <div className="relative flex-1 flex items-center group h-5">
                    <div className="absolute inset-x-0 h-1.5 bg-black/40 backdrop-blur-md rounded-full overflow-hidden pointer-events-none">
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
              <div className="mb-8 flex w-full flex-col items-center gap-3 rounded-3xl bg-white/5 px-5 py-4 text-center">
                <p className="text-sm font-medium text-white/60">
                  Esta pista no tiene preview disponible.
                </p>
                {selectedExternalUrl && (
                  <a
                    href={selectedExternalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                      selectedTrack?.source === "Spotify"
                        ? "border-[#1DB954]/30 bg-[#1DB954]/15 text-[#1ED760] hover:bg-[#1DB954]/25"
                        : "bg-white/10 text-zinc-200 hover:bg-white/20"
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

              {selectedHasPreview && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 backdrop-blur-xl text-white flex items-center justify-center hover:bg-white/20 hover:scale-105 active:scale-95 transition shadow-[0_10px_40px_-10px_rgba(255,255,255,0.2)]"
                  aria-label="Reproducir o pausar preview"
                >
                  {isPlaying ? (
                    <Pause className="w-10 h-10 sm:w-12 sm:h-12 fill-current" />
                  ) : (
                    <Play className="w-10 h-10 sm:w-12 sm:h-12 fill-current ml-1 sm:ml-1.5" />
                  )}
                </button>
              )}

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
                  aria-pressed={isMuted}
                  aria-label={isMuted ? "Activar el sonido" : "Silenciar"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <div className="relative flex items-center w-28 h-5 group">
                  <div className="absolute inset-x-0 h-1.5 bg-black/40 backdrop-blur-md rounded-full overflow-hidden pointer-events-none">
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

            {/* --- REPRODUCCIÓN AUTOMÁTICA Y VALORACIÓN ---
                Solo iconos. Reproducción automática: misma preferencia que
                Ajustes > Reproducción automática del soundtrack. Valoración:
                👍 es correcto · 👎 no lo es, buscar otro · ocultar en esta
                ficha. Fuera del bloque de volumen: se pueden usar aunque la
                pista elegida no tenga preview. Sin servidor no se pueden
                guardar, así que se desactivan (como en Ajustes). */}
            {(showAutoplaySwitch || showFeedback) && (
              <div className={`${selectedHasPreview ? "mt-6" : ""} flex w-full items-center justify-center gap-4`}>
                {showAutoplaySwitch && (
                  <AutoplaySwitch
                    checked={autoplay}
                    disabled={!online}
                    onChange={onAutoplayChange}
                  />
                )}
                {showAutoplaySwitch && showFeedback && (
                  <span aria-hidden="true" className="h-6 w-px bg-white/10" />
                )}
                {showFeedback && (
                  <div className="flex items-center gap-2">
                    <ControlIconButton
                      icon={ThumbsUp}
                      label="El soundtrack es correcto"
                      pressed={feedbackStatus === "confirmed"}
                      activeClassName="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                      disabled={!online}
                      onClick={() => onFeedback("confirm")}
                    />
                    <ControlIconButton
                      icon={ThumbsDown}
                      label="No es el soundtrack correcto: buscar otro"
                      disabled={!online || busy}
                      busy={pendingAction === "dislike"}
                      onClick={() => onFeedback("dislike")}
                    />
                    {/* Solo tras un 👎: volver al soundtrack anterior si era
                        mejor que el nuevo (o si la búsqueda falló). */}
                    {canUndo && (
                      <ControlIconButton
                        icon={Undo2}
                        label="Volver al soundtrack anterior"
                        disabled={!online || busy}
                        busy={pendingAction === "undo"}
                        onClick={() => onFeedback("undo")}
                      />
                    )}
                    <ControlIconButton
                      icon={EyeOff}
                      label="No mostrar el soundtrack de este título"
                      disabled={!online}
                      onClick={() => onFeedback("hide")}
                    />
                  </div>
                )}
              </div>
            )}

          </div>
        ) : (
          <div className="flex h-[340px] flex-col items-center justify-center gap-3 text-center text-zinc-400 p-6">
            <Music2 className="h-12 w-12 opacity-25" />
            <p className="text-sm">
              {error || "No se encontraron canciones para este título."}
            </p>
            {/* Tras un 👎 puede no quedar ninguna alternativa (o fallar la
                búsqueda): volver al soundtrack anterior, empezar de cero
                (olvida todos los descartes) u ocultarlo. */}
            {canUndo && (
              <div className="mt-2 flex items-center gap-2">
                <ControlIconButton
                  icon={Undo2}
                  label="Volver al soundtrack anterior"
                  disabled={!online || busy}
                  onClick={() => onFeedback("undo")}
                />
                <ControlIconButton
                  icon={RotateCcw}
                  label="Volver a buscar desde el principio (olvida los descartados)"
                  disabled={!online || busy}
                  onClick={() => onFeedback("reset")}
                />
                <ControlIconButton
                  icon={EyeOff}
                  label="No mostrar el soundtrack de este título"
                  disabled={!online}
                  onClick={() => onFeedback("hide")}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
