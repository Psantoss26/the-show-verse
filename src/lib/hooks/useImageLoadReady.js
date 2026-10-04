"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Una carga que termina antes de este margen desde el montaje viene de caché
// (memoria o disco): se muestra de golpe en vez de con fundido.
const FAST_LOAD_MS = 200;

// Estado de carga real de un <img>: `ready` solo es true cuando los bytes de
// `src` han llegado Y están decodificados, nunca antes. Las tarjetas de las
// páginas de usuario marcaban la portada como lista en cuanto conocían la URL
// (caché de elección en localStorage), así que al volver a la página se
// mostraba un <img> a opacidad completa mientras aún se descargaba y se veía
// pintarse a trozos, sobre todo con datos móviles.
//
// - Si la imagen ya está en la caché de memoria del navegador al montar, se
//   detecta en un layout effect, antes del primer pintado, y `instant` es true:
//   se muestra tal cual, sin fundido.
// - En móvil esa caché de memoria se vacía antes y al volver la portada sale de
//   la caché de disco: llega en unos milisegundos pero ya no es síncrona. Si
//   llega dentro de `FAST_LOAD_MS` también es `instant`. Sin esto cada tarjeta
//   enseñaba un frame de placeholder y un fundido propio, a destiempo de las
//   demás: el parpadeo escalonado al volver a Favoritos.
// - Si no, se espera a `load` + `decode()` y se hace el fundido normal desde
//   el placeholder.
// - Si falla la carga se queda el placeholder en vez del icono de imagen rota.
export default function useImageLoadReady(src) {
  const imgRef = useRef(null);
  const initialSrcRef = useRef(src);
  const mountedAtRef = useRef(0);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [instantSrc, setInstantSrc] = useState(null);

  useLayoutEffect(() => {
    mountedAtRef.current = performance.now();
  }, []);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!src || !img) return;
    // Solo cuenta como "instantánea" la URL con la que montó la tarjeta: las
    // que llegan después (selector asíncrono + preload) mantienen su fundido.
    if (src !== initialSrcRef.current) return;
    if (img.complete && img.naturalWidth > 0) {
      setInstantSrc(src);
      setLoadedSrc(src);
    }
  }, [src]);

  const onLoad = useCallback((event) => {
    const img = event.currentTarget;
    const loaded = img.getAttribute("src");
    const fast =
      loaded === initialSrcRef.current &&
      performance.now() - mountedAtRef.current < FAST_LOAD_MS;
    const markReady = () => {
      if (fast) setInstantSrc(loaded);
      setLoadedSrc(loaded);
    };
    if (typeof img.decode === "function") {
      img.decode().then(markReady, markReady);
    } else {
      markReady();
    }
  }, []);

  return {
    imgRef,
    onLoad,
    ready: Boolean(src) && loadedSrc === src,
    instant: Boolean(src) && instantSrc === src,
  };
}
