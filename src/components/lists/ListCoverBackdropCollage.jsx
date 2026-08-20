"use client";

// Portada de una lista: el colage de hasta CUATRO backdrops que usan las
// tarjetas de la vista de cuadrícula. Vivía dentro de /lists; se saca aquí
// porque la sección Listas del perfil pinta exactamente la misma tarjeta y
// duplicar el colage garantizaba que las dos versiones se separasen con el
// tiempo.
//
// `TmdbImg` viaja con él: es su ayudante de imagen (acepta tanto un path de TMDb
// como una URL absoluta ya construida) y lo comparte con la tira de pósters que
// se quedó en /lists.

import { useEffect, useState } from "react";
import { ListVideo } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";

export function TmdbImg({ filePath, size = "w780", alt, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [filePath]);

  if (!filePath || failed) {
    return (
      <div
        className={`bg-zinc-900 flex items-center justify-center ${className}`}
      >
        <ListVideo className="w-8 h-8 text-zinc-800" />
      </div>
    );
  }

  // Algunas fuentes pueden devolver una URL absoluta ya construida; el resto
  // pasa un path fragment ("/xxxx.jpg") que hay que prefijar.
  const src = /^https?:\/\//i.test(filePath)
    ? filePath
    : `https://image.tmdb.org/t/p/${size}${filePath}`;

  return (
    <OptimizedImage
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onError={() => setFailed(true)}
    />
  );
}

export default function ListCoverBackdropCollage({ items = [], alt = "" }) {
  const backdrops = [];
  const seen = new Set();
  for (const item of items) {
    const p = item?._listPreviewBackdrop || item?.backdrop_path;
    if (!p || seen.has(p)) continue;
    seen.add(p);
    backdrops.push(p);
    if (backdrops.length >= 4) break;
  }

  if (!backdrops.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/50 text-zinc-600 gap-2">
        <ListVideo className="w-10 h-10 opacity-50" />
      </div>
    );
  }

  if (backdrops.length === 1) {
    return (
      <TmdbImg
        filePath={backdrops[0]}
        size="w780"
        alt={alt}
        className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
      />
    );
  }

  if (backdrops.length === 2) {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-0.5">
        <div className="overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[0]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[1]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      </div>
    );
  }

  if (backdrops.length === 3) {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
        <div className="row-span-2 overflow-hidden h-full">
          <TmdbImg
            filePath={backdrops[0]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden w-full h-full">
          <TmdbImg
            filePath={backdrops[1]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
        <div className="overflow-hidden w-full h-full">
          <TmdbImg
            filePath={backdrops[2]}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
      {backdrops.slice(0, 4).map((p, i) => (
        <div
          key={`${p}-${i}`}
          className="overflow-hidden w-full h-full relative"
        >
          <TmdbImg
            filePath={p}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      ))}
    </div>
  );
}
