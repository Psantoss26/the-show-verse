"use client";

import { useHydrationReady } from "@/lib/hooks/useHydrationReady";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import { isImageRetained } from "@/lib/images/retainPageImages";

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  sizes,
  unoptimized,
  fill,
  style,
  priority,
  fetchPriority,
  ...props
}) {
  // AL VOLVER (atrás/adelante) la página se pinta estática y sus imágenes ya
  // están en la caché del navegador. Con `loading="lazy"` y decodificación
  // asíncrona, cada <img> nueva salía VACÍA uno o dos fotogramas antes de
  // pintarse (medido al volver de una ficha al Perfil: 10 de 11 sin pintar en
  // el primer fotograma): se veía parpadear el contenido. En esa vuelta se
  // piden ya y se decodifican en el mismo pintado. Solo tras hidratar: durante
  // la hidratación se pinta lo mismo que el servidor.
  //
  // Solo las RETENIDAS (las que estaban cerca del viewport al salir, ya en la
  // caché de memoria: ver retainPageImages). Antes se aplicaba a todas: con
  // 200 favoritos, las 200 portadas se pedían y decodificaban de golpe al
  // volver y la página iba a tirones (hover lento) un par de segundos.
  const hydrated = useHydrationReady();
  const historyNavigation = useIsHistoryNavigation();
  const restoring = hydrated && historyNavigation && isImageRetained(src);

  if (!src) return null;

  const finalStyle = fill
    ? {
        position: "absolute",
        height: "100%",
        width: "100%",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        objectFit: "cover",
        ...style,
      }
    : style;

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt || ""}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      // Sin `sizes` el navegador supone 100vw y con `srcSet` baja la imagen
      // más grande de la lista para cualquier miniatura.
      sizes={sizes}
      style={finalStyle}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={fetchPriority}
      {...props}
      {...(restoring ? { loading: "eager", decoding: "sync" } : null)}
    />
  );
}
