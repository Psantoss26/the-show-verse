// src/components/details/modals/VideoModal.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { X, PlayCircle } from "lucide-react";
import { videoEmbedUrl, videoExternalUrl } from "@/lib/details/videos";

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

  const orderedVideos = useMemo(() => {
    const seen = new Set();
    const ordered = [];

    for (const candidate of [video, ...(Array.isArray(videos) ? videos : [])]) {
      const key = getVideoIdentity(candidate);
      if (!key || seen.has(key) || !videoEmbedUrl(candidate, false)) continue;
      seen.add(key);
      ordered.push(candidate);
    }

    return ordered;
  }, [video, videos]);

  const showNextVideo = useCallback(() => {
    if (!videoKey || orderedVideos.length <= 1) return false;

    skippedVideoKeysRef.current.add(videoKey);

    const currentIndex = Math.max(
      0,
      orderedVideos.findIndex(
        (candidate) => getVideoIdentity(candidate) === videoKey,
      ),
    );

    for (let offset = 1; offset < orderedVideos.length; offset += 1) {
      const candidate =
        orderedVideos[(currentIndex + offset) % orderedVideos.length];
      const candidateKey = getVideoIdentity(candidate);
      if (!candidateKey || skippedVideoKeysRef.current.has(candidateKey))
        continue;

      onVideoChange?.(candidate);
      return true;
    }

    return false;
  }, [onVideoChange, orderedVideos, videoKey]);

  // Estado local para controlar la animación de montaje si es necesario,
  // pero aquí usaremos clases de Tailwind 'animate-in' para simplicidad.

  useEffect(() => {
    if (!open) skippedVideoKeysRef.current.clear();
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
            if (!cancelled) showNextVideo();
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [open, showNextVideo, video, videoKey]);

  // Bloqueo de scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const scrollBarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    // Evita el salto visual de la barra de scroll
    if (scrollBarWidth > 0)
      document.body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      document.body.style.overflow = prev;
      document.body.style.paddingRight = "";
    };
  }, [open]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !video) return null;

  const embed = getPlayerEmbedUrl(video);
  const ext = videoExternalUrl(video);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
      {/* BACKDROP: Estilo cristal con desenfoque + Animación de fade */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* MODAL CONTAINER: Liquid Glass */}
      <div
        className="relative w-full max-w-5xl flex flex-col overflow-hidden rounded-[2rem] bg-black/45 bg-gradient-to-br from-white/10 to-white/5 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-3xl animate-in zoom-in-95 duration-300 ease-out"
        role="dialog"
        aria-modal="true"
      >
        {/* HEADER: Glass Header */}
        <div className="flex w-full items-center justify-between p-6 sm:px-8 sm:pt-8 sm:pb-6 bg-white/[0.025]">
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
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm"
            title="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* VIDEO AREA: Aspect Ratio cinematográfico */}
        <div className="relative w-full aspect-video bg-black/40 group">
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

        {/* FOOTER: Información y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:px-8 bg-white/[0.025]">
          <div className="text-xs font-semibold text-white/50">
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
  );
}
