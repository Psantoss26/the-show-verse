"use client";

// Portada VERTICAL de un episodio en el teléfono: sus imágenes horizontales
// (stills 16:9) apiladas una debajo de otra hasta llenar el alto de la portada
// de la cabecera móvil (`--mobile-cover-h`, la misma de las temporadas). Va en
// el hueco `collage` de MobileHeroCover, que la coloca pegada arriba y a los
// lados y la funde con el fondo por abajo.
//
// - Cada banda ocupa la misma fracción del alto y encaja su imagen con
//   `object-cover`: son dos (EPISODE_HERO_MAX_BANDS), así que cada escena se
//   recorta un poco por los lados (nunca quedan huecos en los bordes).
// - UNIONES DIFUMINADAS: a partir de la segunda, cada banda empieza
//   `EPISODE_STILL_SEAM_PX` antes y se desvanece en ese tramo sobre la
//   anterior (máscara), así que no hay ninguna línea recta entre imágenes.
// - SE REVELAN TODAS A LA VEZ (`useEpisodeStillStackLoad`): la portada está
//   lista cuando TODAS las bandas han llegado y están decodificadas. Antes
//   bastaba la primera y las otras entraban después, cada una con su fundido:
//   mientras tanto se veían las bandas vacías y los bordes de cada imagen.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

export const EPISODE_STILL_SEAM_PX = 56;

// Si una banda se atasca, la portada no espera indefinidamente: pasado este
// margen desde la PRIMERA lista, se revela con lo que haya y la rezagada entra
// con fundido.
const STACK_REVEAL_CAP_MS = 2500;

const SEAM_MASK = `linear-gradient(to bottom, transparent 0px, #000 ${EPISODE_STILL_SEAM_PX}px)`;

export function episodeStillSrc(path) {
  return path ? `https://image.tmdb.org/t/p/w780${path}` : null;
}

// Estado de carga conjunto de las bandas. `ready` = todas descargadas y
// decodificadas (o fallidas), o el tope tras la primera.
export function useEpisodeStillStackLoad(paths = []) {
  // Por contenido, no por referencia: el padre rehace el array en cada render.
  const sourcesKey = paths.map(episodeStillSrc).filter(Boolean).join("|");
  const sources = useMemo(
    () => (sourcesKey ? sourcesKey.split("|") : []),
    [sourcesKey],
  );
  // src → "ok" | "error"
  const [settled, setSettled] = useState(() => new Map());
  // Guardan para qué portada (`sourcesKey`) valen: si el componente se
  // reutiliza con otras imágenes, vuelven a empezar.
  const [cappedKey, setCappedKey] = useState(null);
  const capped = cappedKey === sourcesKey;
  const imgsRef = useRef(new Map());

  const settle = useCallback((src, state) => {
    setSettled((prev) => {
      if (prev.get(src) === state) return prev;
      const next = new Map(prev);
      next.set(src, state);
      return next;
    });
  }, []);

  const handleLoaded = useCallback(
    (img) => {
      const src = img.getAttribute("src");
      const done = () => settle(src, "ok");
      // Decodificar ANTES de revelar: si no, cada banda se rasteriza en un
      // fotograma distinto y se ven aparecer por separado.
      if (typeof img.decode === "function") img.decode().then(done, done);
      else done();
    },
    [settle],
  );

  // Una imagen que termina ANTES de hidratar (caché, o HTML del servidor que
  // llegó antes que el JS) no dispara `onLoad` en React: se mira `complete`.
  useLayoutEffect(() => {
    imgsRef.current.forEach((img, src) => {
      if (!img?.complete) return;
      if (img.naturalWidth > 0) handleLoaded(img);
      else settle(src, "error");
    });
  }, [sources, handleLoaded, settle]);

  const anySettled = sources.some((src) => settled.has(src));
  const allSettled = sources.every((src) => settled.has(src));
  useLayoutEffect(() => {
    if (!anySettled || allSettled) return;
    const timer = window.setTimeout(
      () => setCappedKey(sourcesKey),
      STACK_REVEAL_CAP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [anySettled, allSettled, sourcesKey]);

  const bandProps = useCallback(
    (src) => ({
      ref: (node) => {
        if (node) imgsRef.current.set(src, node);
        else imgsRef.current.delete(src);
      },
      onLoad: (event) => handleLoaded(event.currentTarget),
      onError: () => settle(src, "error"),
    }),
    [handleLoaded, settle],
  );

  const ready = sources.length === 0 || allSettled || (capped && anySettled);
  // Bandas que ya estaban al revelar: entran con la portada, sin fundido
  // propio. Se fija en el mismo render en que `ready` pasa a true (estado
  // derivado), para que ninguna empiece un fundido en ese primer fotograma.
  const [revealed, setRevealed] = useState(null);
  const revealedWith = revealed?.key === sourcesKey ? revealed.srcs : null;
  if (ready && !revealedWith) {
    setRevealed({ key: sourcesKey, srcs: new Set(settled.keys()) });
  }

  return {
    sources,
    settled,
    ready,
    // Solo una banda que llegue DESPUÉS de revelar (tras el tope) entra con
    // fundido.
    isLate: (src) => ready && !(revealedWith ?? settled).has(src),
    bandProps,
  };
}

function StillBand({ src, index, count, loaded, late, imgProps }) {
  const first = index === 0;
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
        {...imgProps}
        src={src}
        alt=""
        decoding="async"
        // Todas visibles desde el primer momento: todas con prioridad alta,
        // para que lleguen juntas.
        fetchPriority="high"
        // Sin transición salvo para una rezagada: las demás se ponen a
        // opacidad 1 de golpe (con la portada aún oculta) y aparecen juntas.
        className={`absolute inset-0 h-full w-full object-cover object-center ${
          late ? "transition-opacity duration-500 motion-reduce:transition-none" : ""
        } ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

export default function EpisodeStillStack({ load }) {
  const { sources, settled, isLate, bandProps } = load;
  if (!sources.length) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950" aria-hidden="true">
      {sources.map((src, index) => (
        <StillBand
          key={src}
          src={src}
          index={index}
          count={sources.length}
          loaded={settled.get(src) === "ok"}
          late={isLate(src)}
          imgProps={bandProps(src)}
        />
      ))}
    </div>
  );
}
