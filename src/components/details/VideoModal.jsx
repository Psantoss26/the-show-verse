// src/components/details/modals/VideoModal.jsx
"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X, PlayCircle } from "lucide-react";
import { videoEmbedUrl, videoExternalUrl } from "@/lib/details/videos";

export default function VideoModal({ open, onClose, video }) {
  // Estado local para controlar la animación de montaje si es necesario,
  // pero aquí usaremos clases de Tailwind 'animate-in' para simplicidad.

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

  const embed = videoEmbedUrl(video, true);
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
        className="relative w-full max-w-5xl flex flex-col overflow-hidden rounded-[3rem] border border-white/20 bg-black/20 bg-gradient-to-br from-white/10 via-white/5 to-black/40 backdrop-blur-[50px] shadow-[0_30px_80px_-15px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-300 ease-out"
        role="dialog"
        aria-modal="true"
      >
        {/* HEADER: Glass Header */}
        <div className="flex w-full items-center justify-between p-6 sm:px-8 sm:pt-8 sm:pb-6 border-b border-white/10">
          <div className="flex flex-col gap-0.5 min-w-0 pr-4">
            <h3 className="text-xl sm:text-2xl font-black text-white drop-shadow-md truncate">
              {video.name || "Tráiler Oficial"}
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-white/50 uppercase tracking-wider mt-1">
              <span className="bg-white/10 border border-white/5 px-1.5 py-0.5 rounded text-white/80 shadow-sm">
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
              key={video.key}
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
        <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:px-8 border-t border-white/10">
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
              className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 
                                       px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white/90 
                                       transition-all hover:bg-white/20 hover:scale-105 active:scale-95 shadow-[0_10px_20px_-10px_rgba(255,255,255,0.1)]"
            >
              <span>Ver en {video.site}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
