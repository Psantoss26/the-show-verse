// src/components/details/modals/VideoModal.jsx
"use client";
import {
  LIQUID_GLASS_PANEL,
  LIQUID_GLASS_MODAL_HEADER,
  LIQUID_GLASS_MODAL_FOOTER,
  LIQUID_GLASS_SURFACE,
} from "@/lib/ui/liquidGlass";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { X, PlayCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { videoEmbedUrl, videoExternalUrl } from "@/lib/details/videos";
import useModalGuard from "@/hooks/useModalGuard";

let youtubeIframeApiPromise = null;

function loadYouTubeIframeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

function getVideoIdentity(video) {
  return video?.site && video?.key ? `${video.site}:${video.key}` : "";
}

function getPlayerEmbedUrl(video) {
  const url = videoEmbedUrl(video, true);
  if (!url || video?.site !== "YouTube") return url;

  const separator = url.includes("?") ? "&" : "?";
  const origin =
    typeof window !== "undefined"
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : "";

  return `${url}${separator}enablejsapi=1${origin}`;
}

export default function VideoModal({
  open,
  onClose,
  video,
  videos = [],
  onVideoChange,
}) {
  const iframeRef = useRef(null);
  const skippedVideoKeysRef = useRef(new Set());
  const videoKey = getVideoIdentity(video);

  // LISTA ESTABLE de los vídeos reproducibles del título, en el orden que trae
  // quien abre el modal (ya ordenados por relevancia). El vídeo actual NO se
  // mueve al principio: con él delante, cada paso reordenaría la lista y
  // Anterior/Siguiente no volverían al mismo sitio. Solo se antepone si no
  // está en ella (p. ej. un tráiler elegido aparte).
  const orderedVideos = useMemo(() => {
    const seen = new Set();
    const ordered = [];

    for (const candidate of Array.isArray(videos) ? videos : []) {
      const key = getVideoIdentity(candidate);
      if (!key || seen.has(key) || !videoEmbedUrl(candidate, false)) continue;
      seen.add(key);
      ordered.push(candidate);
    }

    if (videoKey && !seen.has(videoKey) && videoEmbedUrl(video, false)) {
      ordered.unshift(video);
    }

    return ordered;
  }, [video, videoKey, videos]);

  const currentIndex = Math.max(
    0,
    orderedVideos.findIndex((candidate) => getVideoIdentity(candidate) === videoKey),
  );
  const total = orderedVideos.length;
  const prevVideo = currentIndex > 0 ? orderedVideos[currentIndex - 1] : null;
  const nextVideo = currentIndex < total - 1 ? orderedVideos[currentIndex + 1] : null;

  // Sentido del último paso: si un vídeo no se puede reproducir, se salta en
  // ese mismo sentido (retroceder a uno roto no debe mandarte hacia delante).
  const directionRef = useRef(1);

  const goToVideo = useCallback(
    (candidate, direction) => {
      if (!candidate) return;
      directionRef.current = direction;
      onVideoChange?.(candidate);
    },
    [onVideoChange],
  );
  const showPrevVideo = useCallback(
    () => goToVideo(prevVideo, -1),
    [goToVideo, prevVideo],
  );
  const showNextVideo = useCallback(
    () => goToVideo(nextVideo, 1),
    [goToVideo, nextVideo],
  );

  // Vídeo que YouTube no deja reproducir (retirado, privado o sin permiso de
  // inserción): el siguiente reproducible en el sentido en que se iba.
  const skipBrokenVideo = useCallback(() => {
    if (!videoKey || total <= 1) return false;

    skippedVideoKeysRef.current.add(videoKey);
    const direction = directionRef.current;

    for (
      let index = currentIndex + direction;
      index >= 0 && index < total;
      index += direction
    ) {
      const candidate = orderedVideos[index];
      const candidateKey = getVideoIdentity(candidate);
      if (!candidateKey || skippedVideoKeysRef.current.has(candidateKey))
        continue;

      onVideoChange?.(candidate);
      return true;
    }

    return false;
  }, [currentIndex, onVideoChange, orderedVideos, total, videoKey]);

  // Flechas del teclado: anterior / siguiente. No cuando se escribe en un
  // campo, ni con el foco dentro del reproductor (el iframe recibe sus teclas,
  // que YouTube usa para avanzar dentro del propio vídeo).
  useEffect(() => {
    if (!open || total <= 1) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      if (event.key === "ArrowLeft" && prevVideo) {
        event.preventDefault();
        showPrevVideo();
      } else if (event.key === "ArrowRight" && nextVideo) {
        event.preventDefault();
        showNextVideo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, total, prevVideo, nextVideo, showPrevVideo, showNextVideo]);

  // Estado local para controlar la animación de montaje si es necesario,
  // pero aquí usaremos clases de Tailwind 'animate-in' para simplicidad.

  useEffect(() => {
    if (!open) {
      skippedVideoKeysRef.current.clear();
      directionRef.current = 1;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !video || video.site !== "YouTube" || !iframeRef.current)
      return;

    let cancelled = false;

    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT?.Player || !iframeRef.current) return;

      new YT.Player(iframeRef.current, {
        events: {
          onError: () => {
            if (!cancelled) skipBrokenVideo();
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [open, skipBrokenVideo, video, videoKey]);

  useModalGuard({ open, onClose });

  if (!open || !video) return null;

  const embed = getPlayerEmbedUrl(video);
  const ext = videoExternalUrl(video);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-1 sm:p-6">
      {/* BACKDROP: Estilo cristal con desenfoque + Animación de fade */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ENVOLTURA del modal: en ordenador lleva Anterior / Siguiente FUERA
          del panel, a los lados y centrados en su altura. El panel cede a cada
          lado el hueco de los botones (`lg:max-w`) para que no se salgan de la
          pantalla en ventanas estrechas. */}
      <div
        className={`relative w-full max-w-7xl ${
          total > 1 ? "lg:max-w-[min(80rem,calc(100vw-13rem))]" : ""
        }`}
      >
      {total > 1 && (
        <>
          <VideoSideButton
            direction="prev"
            target={prevVideo}
            onClick={showPrevVideo}
          />
          <VideoSideButton
            direction="next"
            target={nextVideo}
            onClick={showNextVideo}
          />
        </>
      )}

      {/* MODAL CONTAINER: Liquid Glass */}
      <div
        className={`relative w-full max-h-[calc(100dvh-0.5rem)] flex flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
        role="dialog"
        aria-modal="true"
      >
        {/* HEADER: Glass Header */}
        <div className={`flex w-full items-center justify-between p-6 sm:px-8 sm:pt-8 sm:pb-6 ${LIQUID_GLASS_MODAL_HEADER}`}>
          <div className="flex flex-col gap-0.5 min-w-0 pr-4">
            <h3 className="text-xl sm:text-2xl font-black text-white drop-shadow-md truncate">
              {video.name || "Tráiler Oficial"}
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider mt-1">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.65)]">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]" />
                {video.type || "Video"}
              </span>
              <span>•</span>
              <span className="text-white/70">{video.site || "YouTube"}</span>
              {total > 1 && (
                <>
                  <span>•</span>
                  <span className="tabular-nums text-white/70" aria-live="polite">
                    {currentIndex + 1} de {total}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* VIDEO AREA: Aspect Ratio cinematográfico */}
        <div className="relative w-full aspect-square max-h-[calc(100dvh-11.5rem)] sm:aspect-video sm:max-h-none bg-black/40 group">
          {embed ? (
            <iframe
              ref={iframeRef}
              key={videoKey}
              src={embed}
              title={video.name || "Video"}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
              <PlayCircle className="w-12 h-12 opacity-30 text-white" />
              <p className="text-sm">
                No se puede reproducir el vídeo insertado.
              </p>
            </div>
          )}
        </div>

        {/* FOOTER: fecha · Anterior / Siguiente · YouTube. En móvil la
            navegación ocupa su propia fila, centrada, para no estrechar los
            botones; en ordenador (lg) sale del panel, a los lados. */}
        <div className={`grid grid-cols-[1fr_auto] items-center gap-3 p-3 sm:grid-cols-[1fr_auto_1fr] sm:p-6 sm:px-8 lg:grid-cols-[1fr_auto] ${LIQUID_GLASS_MODAL_FOOTER}`}>
          <div className="min-w-0 text-xs font-semibold text-white/50">
            {video.published_at && (
              <span>
                Publicado el{" "}
                <span className="text-white/80">
                  {new Date(video.published_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </span>
            )}
          </div>

          {total > 1 && (
            <nav
              aria-label="Vídeos del título"
              className="order-last col-span-2 flex items-center justify-center gap-2 sm:order-none sm:col-span-1 lg:hidden"
            >
              <VideoStepButton
                direction="prev"
                target={prevVideo}
                onClick={showPrevVideo}
              />
              <span className="min-w-[4.5rem] text-center text-xs font-bold tabular-nums text-white/70">
                {currentIndex + 1} / {total}
              </span>
              <VideoStepButton
                direction="next"
                target={nextVideo}
                onClick={showNextVideo}
              />
            </nav>
          )}

          <div className="flex justify-end">
          {ext && (
            <a
              href={ext}
              target="_blank"
              rel="noreferrer"
              aria-label={`Ver en ${video.site || "YouTube"}`}
              title={`Ver en ${video.site || "YouTube"}`}
              className="inline-flex h-11 min-w-11 items-center justify-center p-0 transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
            >
              <Image
                src="/youtube.webp"
                alt=""
                width={40}
                height={30}
                aria-hidden="true"
                className="h-8 w-auto"
              />
            </a>
          )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// Anterior / Siguiente del ORDENADOR: redondos, de cristal y fuera del panel.
// Entran con el modal deslizándose desde su lado; al pasar el ratón crecen y
// el icono empuja hacia su sentido; al pulsar, se hunden. Sin vídeo al que ir
// (primero / último) se apagan encogiendo, sin dejar de ocupar su sitio.
function VideoSideButton({ direction, target, onClick }) {
  const isPrev = direction === "prev";
  const Icon = isPrev ? ChevronLeft : ChevronRight;
  const label = isPrev ? "Vídeo anterior" : "Vídeo siguiente";
  const hint = target?.name ? `${label}: ${target.name}` : label;
  return (
    <div
      className={`absolute top-1/2 z-10 hidden -translate-y-1/2 lg:block ${
        isPrev
          ? "right-full mr-5 animate-in fade-in slide-in-from-right-6"
          : "left-full ml-5 animate-in fade-in slide-in-from-left-6"
      } duration-500 ease-out`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!target}
        aria-label={hint}
        title={target ? `${hint} (${isPrev ? "←" : "→"})` : label}
        className={`group/step flex h-14 w-14 items-center justify-center rounded-full text-white ${LIQUID_GLASS_SURFACE} transition-[scale,opacity,background-color] duration-300 ease-out hover:scale-110 hover:bg-white/10 active:scale-95 active:duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 disabled:pointer-events-none disabled:scale-75 disabled:opacity-0 motion-reduce:transition-none`}
      >
        <LiquidGlassOpticalLayers />
        <Icon
          className={`relative z-10 h-7 w-7 transition-transform duration-300 ease-out motion-reduce:transition-none ${
            isPrev
              ? "-translate-x-px group-hover/step:-translate-x-1"
              : "translate-x-px group-hover/step:translate-x-1"
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

// Anterior / Siguiente. El título del vídeo al que lleva va en el `title`
// (y en la etiqueta accesible), para saber qué viene sin tener que pulsar.
function VideoStepButton({ direction, target, onClick }) {
  const isPrev = direction === "prev";
  const Icon = isPrev ? ChevronLeft : ChevronRight;
  const label = isPrev ? "Vídeo anterior" : "Vídeo siguiente";
  const hint = target?.name ? `${label}: ${target.name}` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!target}
      aria-label={hint}
      title={target ? `${hint} (${isPrev ? "←" : "→"})` : label}
      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/5 px-3.5 text-sm font-bold text-white/80 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:pointer-events-none disabled:opacity-30"
    >
      {isPrev && <Icon className="h-5 w-5" aria-hidden="true" />}
      <span>{isPrev ? "Anterior" : "Siguiente"}</span>
      {!isPrev && <Icon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
