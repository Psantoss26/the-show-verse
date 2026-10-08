"use client";

// Cambio de modo de la PORTADA (póster 2:3 ↔ backdrop 16:9) por FUNDIDO
// CRUZADO entre dos capas que permanecen montadas. Lo comparten las páginas de
// listas/colecciones (UnifiedListDetailsLayout) y DetailsClient.
//
// Por qué así: si una única imagen cambia de `src`, la nueva tiene que cargar,
// entra con su propio fundido y la anterior sale con otro, a destiempo del
// morph de la caja (500 ms). Con las dos capas ya montadas (y cargadas), el
// cambio es solo opacidad, con la MISMA duración y curva que el morph.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import useImageLoadReady from "@/lib/hooks/useImageLoadReady";

// Duración y curva del morph de `.poster-aspect-box` (globals.css).
const EASE = "ease-[cubic-bezier(0.25,1,0.5,1)]";
const FADE = `transition-opacity duration-500 ${EASE} motion-reduce:transition-none`;
const FADE_MS = 500;

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Capa de un modo: las dos conviven dentro de la caja y se funden. */
export function CoverLayer({ active, className = "", children }) {
  return (
    <div
      aria-hidden={active ? undefined : true}
      className={`absolute inset-0 ${FADE} ${active ? "opacity-100" : "pointer-events-none opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

// Una imagen en dos pasos: `lowSrc` (ligera, llega antes) y `src` encima con
// fundido cuando está decodificada. Aparece con fundido al cargar, o de golpe
// si ya estaba en caché (useImageLoadReady).
function ImagePair({ lowSrc, src, alt, imgStyle, onReady }) {
  const firstSrc = lowSrc || src;
  const { imgRef, onLoad, ready, instant } = useImageLoadReady(firstSrc);
  const highRef = useRef(null);
  const [highSrc, setHighSrc] = useState(null);
  const hasHigh = Boolean(src && src !== firstSrc);
  const highReady = hasHigh && highSrc === src;

  useClientLayoutEffect(() => {
    const img = highRef.current;
    if (img?.complete && img.naturalWidth > 0) setHighSrc(src);
  }, [src]);

  useEffect(() => {
    if (ready) onReady?.();
    // `onReady` se lee al cambiar `ready`; no debe relanzarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const markHigh = (event) => {
    const img = event.currentTarget;
    const done = () => setHighSrc(img.getAttribute("src"));
    if (typeof img.decode === "function") img.decode().then(done, done);
    else done();
  };

  return (
    <div className={`absolute inset-0 ${instant ? "" : FADE} ${ready ? "opacity-100" : "opacity-0"}`}>
      {/* <img> directo: hace falta controlar `load`/`decode` de cada capa. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={firstSrc}
        alt={alt}
        onLoad={onLoad}
        decoding="async"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={imgStyle}
      />
      {hasHigh ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={highRef}
          src={src}
          alt=""
          aria-hidden="true"
          onLoad={markHigh}
          decoding="async"
          draggable={false}
          className={`absolute inset-0 h-full w-full object-cover ${FADE} ${highReady ? "opacity-100" : "opacity-0"}`}
          style={imgStyle}
        />
      ) : null}
    </div>
  );
}

/**
 * Imagen de una capa de portada. Si cambia (p. ej. se elige otro póster en la
 * galería), la anterior se queda debajo hasta que la nueva ha aparecido: el
 * cambio también es un fundido, nunca un hueco.
 */
export function ProgressiveCover({ lowSrc, src, alt = "", imgStyle }) {
  const key = lowSrc || src || "";
  // Patrón de React para reaccionar a un cambio de prop durante el render
  // (sin efecto, así la anterior no desaparece ni un frame): la imagen que se
  // veía (`shown`) pasa a la capa de debajo (`under`).
  const [current, setCurrent] = useState(key);
  const [shown, setShown] = useState(null);
  const [under, setUnder] = useState(null);
  if (current !== key) {
    setCurrent(key);
    if (shown && shown.key !== key) setUnder(shown);
  }

  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!key) return null;

  const handleReady = () => {
    setShown({ key, lowSrc, src });
    // La de debajo se retira cuando la nueva ya ha terminado de aparecer.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setUnder(null), FADE_MS);
  };

  return (
    <>
      {under ? (
        <ImagePair key={`under-${under.key}`} lowSrc={under.lowSrc} src={under.src} alt="" imgStyle={imgStyle} />
      ) : null}
      <ImagePair key={key} lowSrc={lowSrc} src={src} alt={alt} imgStyle={imgStyle} onReady={handleReady} />
    </>
  );
}
