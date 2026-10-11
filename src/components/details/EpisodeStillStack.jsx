"use client";

// Portada VERTICAL de un episodio en el teléfono: sus imágenes horizontales
// (stills 16:9) apiladas una debajo de otra hasta llenar el alto de la portada
// de la cabecera móvil (`--mobile-cover-h`, la misma de las temporadas). Va en
// el hueco `collage` de MobileHeroCover, que la coloca pegada arriba y a los
// lados y la funde con el fondo por abajo.
//
// - Cada banda ocupa la misma fracción del alto y encaja su imagen con
//   `object-cover`: con tres bandas apenas se recorta; con dos, un poco por
//   los lados (nunca quedan huecos en los bordes).
// - UNIONES DIFUMINADAS: a partir de la segunda, cada banda empieza
//   `EPISODE_STILL_SEAM_PX` antes y se desvanece en ese tramo sobre la
//   anterior (máscara), así que no hay ninguna línea recta entre imágenes.
// - La primera es la que marca cuándo está lista la portada (`imgRef`/
//   `onLoad` de quien la usa); las demás cargan después, con fundido.

import { useLayoutEffect, useRef, useState } from "react";

export const EPISODE_STILL_SEAM_PX = 56;

const SEAM_MASK = `linear-gradient(to bottom, transparent 0px, #000 ${EPISODE_STILL_SEAM_PX}px)`;

function StillBand({ src, index, count, imgRef, onLoad, onError, priority }) {
  const [loaded, setLoaded] = useState(false);
  const first = index === 0;
  const ownRef = useRef(null);
  // Una imagen que termina de cargar ANTES de hidratar no dispara `onLoad` en
  // React: sin esto, esas bandas se quedaban a opacidad 0 para siempre. La
  // primera lo resuelve el `useImageLoadReady` de quien la usa (su `imgRef`).
  useLayoutEffect(() => {
    if (first) return;
    const img = ownRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [first, src]);
  const seam = first ? 0 : EPISODE_STILL_SEAM_PX;

  return (
    <div
      className="absolute inset-x-0 overflow-hidden"
      style={{
        top: `calc(${index} * 100% / ${count} - ${seam}px)`,
        height: `calc(100% / ${count} + ${seam}px)`,
        ...(first ? {} : { WebkitMaskImage: SEAM_MASK, maskImage: SEAM_MASK }),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={first ? imgRef : ownRef}
        src={src}
        alt=""
        decoding="async"
        fetchPriority={priority ? "high" : "low"}
        onLoad={(event) => {
          setLoaded(true);
          if (first) onLoad?.(event);
        }}
        onError={first ? onError : undefined}
        className={`absolute inset-0 h-full w-full object-cover object-center ${
          first ? "" : `transition-opacity duration-500 motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`
        }`}
      />
    </div>
  );
}

export default function EpisodeStillStack({ paths = [], imgRef, onLoad, onError }) {
  const sources = paths
    .filter(Boolean)
    .map((path) => `https://image.tmdb.org/t/p/w780${path}`);
  if (!sources.length) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950" aria-hidden="true">
      {sources.map((src, index) => (
        <StillBand
          key={src}
          src={src}
          index={index}
          count={sources.length}
          imgRef={imgRef}
          onLoad={onLoad}
          onError={onError}
          priority={index === 0}
        />
      ))}
    </div>
  );
}
