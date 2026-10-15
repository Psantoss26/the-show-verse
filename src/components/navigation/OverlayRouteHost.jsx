"use client";

import { Activity, Fragment, createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import {
  NavigationPromisesContext,
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { MotionGlobalConfig } from "framer-motion";
import { isHistoryNavigation } from "@/lib/navigation/historyNavigation";

// PÁGINA DE ORIGEN VIVA MIENTRAS SE VE UNA FICHA.
//
// El layout raíz pinta aquí la página (`children`) y el slot `@overlay`, donde
// Next pone las fichas abiertas con navegación interna (ver
// src/app/@overlay/(.)details/layout.jsx). Mientras hay ficha, la página queda
// en <Activity mode="hidden">: fuera de la vista (`display: none`) y sin
// efectos, pero con su DOM y su estado. Al volver, reaparece en el mismo commit
// en que se quita la ficha, antes de pintar: es el mismo mecanismo con el que
// Next conserva las rutas con Cache Components.
const OverlayRouteContext = createContext(null);

// <Activity> oculta el DOM pero no detiene lo que suena: un tráiler o un vídeo
// de la página seguiría reproduciéndose debajo de la ficha. Al ocultarla se
// pausan sus <video>/<audio> y los iframes de YouTube/Vimeo (por su API de
// mensajes; los tráileres se insertan con `enablejsapi=1`).
function pauseHiddenPageMedia() {
  const root = document.querySelector("[data-scroll-restoration-root]");
  for (const page of root?.children || []) {
    if (getComputedStyle(page).display !== "none") continue;
    for (const media of page.querySelectorAll("video, audio")) media.pause?.();
    for (const frame of page.querySelectorAll("iframe")) {
      const src = frame.getAttribute("src") || "";
      const message = /youtube/.test(src)
        ? JSON.stringify({ event: "command", func: "pauseVideo", args: [] })
        : /vimeo/.test(src)
          ? JSON.stringify({ method: "pause" })
          : null;
      if (message) frame.contentWindow?.postMessage(message, "*");
    }
  }
}

export default function OverlayRouteHost({ children, overlay }) {
  // Nº de marcadores montados (al pasar de una ficha a otra conviven un instante).
  const [overlays, setOverlays] = useState(0);
  // Montaje de la página. Solo VOLVER ATRÁS la recupera tal cual: si la ficha
  // se cierra con una navegación nueva a la MISMA página (Favoritos → ficha →
  // enlace a Favoritos), Next reutilizaría la oculta y entraría sin su
  // animación de entrada y con el estado viejo. Ahí se vuelve a montar.
  const [generation, setGeneration] = useState(0);
  const previousOverlays = useRef(overlays);
  useLayoutEffect(() => {
    const had = previousOverlays.current > 0;
    if (!had && overlays > 0) pauseHiddenPageMedia();
    previousOverlays.current = overlays;
    if (had && overlays === 0) {
      // Efecto de layout: el `pushState` de la navegación ya ha ocurrido y el
      // remontaje entra antes de pintar.
      if (!isHistoryNavigation()) setGeneration((value) => value + 1);
      // La página ya es visible en este commit: sus animaciones reiniciadas
      // se terminan antes de que se pinte nada.
      else finishRevealAnimations({ last: false });
    }
  }, [overlays]);
  // Lo que hay en el slot, en el MISMO render en que Next cambia la URL (el
  // marcador cuenta un commit después): la página no llega a ver la de la
  // ficha, y una página nueva que entra al cerrarla ya ve la suya.
  const overlaySegments = useSelectedLayoutSegments("overlay");
  const overlayActive = Boolean(overlaySegments?.includes("(.)details"));
  return (
    <OverlayRouteContext.Provider value={setOverlays}>
      <Activity mode={overlays > 0 ? "hidden" : "visible"}>
        <PageNavigation frozen={overlayActive}>
          <Fragment key={generation}>{children}</Fragment>
        </PageNavigation>
      </Activity>
      {overlay}
    </OverlayRouteContext.Provider>
  );
}

// LA PÁGINA OCULTA NO VE LA URL DE LA FICHA.
// `usePathname`/`useSearchParams`/`useParams` son contextos de Next: al abrir la
// ficha y al volver cambian, y se vuelven a renderizar TODOS sus consumidores de
// la página (cada tarjeta lee la ruta en `useIsHistoryNavigation`). Oculta,
// React deja ese render pendiente y lo hacía al volver, en el mismo commit que
// la muestra: ~0,5 s de CPU (con CPU ×4) y el hover a tirones. Mientras hay
// ficha, la página sigue viendo SU navegación; al volver, si es la misma (por
// contenido), se le dan los mismos objetos y no se renderiza nada.
function sameNavigation(a, b) {
  return (
    a.pathname === b.pathname &&
    String(a.searchParams ?? "") === String(b.searchParams ?? "") &&
    JSON.stringify(a.params ?? null) === JSON.stringify(b.params ?? null)
  );
}

function PageNavigation({ frozen, children }) {
  const live = {
    pathname: useContext(PathnameContext),
    searchParams: useContext(SearchParamsContext),
    params: useContext(PathParamsContext),
    // Solo en desarrollo: `usePathname` y compañía leen de aquí.
    promises: useContext(NavigationPromisesContext),
  };
  const [saved, setSaved] = useState(live);
  const page = frozen || sameNavigation(saved, live) ? saved : live;
  if (page !== saved) setSaved(page);
  return (
    <NavigationPromisesContext.Provider value={page.promises}>
      <PathParamsContext.Provider value={page.params}>
        <PathnameContext.Provider value={page.pathname}>
          <SearchParamsContext.Provider value={page.searchParams}>
            {children}
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </PathParamsContext.Provider>
    </NavigationPromisesContext.Provider>
  );
}

// ¿Hay ahora una ficha encima de la página? Lo consulta ScrollRestoration en el
// `popstate`, antes de que React procese la vuelta.
let mountedOverlays = 0;
export function isOverlayOpen() {
  return mountedOverlays > 0;
}

// VOLVER ATRÁS: LA PÁGINA APARECE QUIETA, SIN ANIMACIONES DE ENTRADA.
// <Activity> deshace los efectos al ocultar y los rehace al mostrar: framer
// vuelve a lanzar sus entradas (cabecera, cifras, barra) y el navegador
// reinicia las animaciones CSS al dejar de estar en `display: none`.
//   - framer salta al estado final mientras dura la vuelta
//     (`MotionGlobalConfig.skipAnimations`);
//   - en el commit que muestra la página, ANTES de pintar,
//     `document.getAnimations()` aplica el estilo pendiente (crea las
//     animaciones CSS reiniciadas) y se terminan al instante; igual con las
//     finitas que arranquen en los fotogramas siguientes (WAAPI propias).
//   - también las TRANSICIONES de esos fotogramas: `@starting-style` vuelve a
//     dispararse al salir de `display: none` (el icono de reserva de cada
//     póster: cientos de fundidos) y framer, al reponer su `initial`, hacía
//     fundirse a 0 la barra de filtros (`transition-all`). En tres fotogramas
//     aún no hay transiciones del usuario (hover) que respetar. Las que se
//     ALEJAN del reposo (desvanecer, desplazar) no se terminan (pintaría un
//     fotograma el `initial` de framer antes de que lo deshaga): se congelan en
//     su inicio y, si siguen ahí al acabar, se reanudan (ver `leavesRest`).
// Sin marcas en <html>: con selectores universales, ponerlas y quitarlas
// recalculaba el estilo de TODO el documento (100-260 ms cada vez con CPU ×4)
// y el hover iba a tirones un par de segundos tras volver.
// Las ligadas al scroll no se tocan.
//   getAnimations() fuerza el estilo y recorre TODAS las animaciones: se hace
//   solo unos fotogramas, no durante el hover que el usuario ya está haciendo.
const REVEAL_FRAMES = 3;
const REVEAL_MS = 700;
let revealFrame = 0;
let revealTimer = 0;

const heldFadeOuts = new Set();

// ¿Transformación en reposo? (`none`, la identidad o sus equivalentes.)
const REST_TRANSFORMS = new Set([
  "none",
  "matrix(1, 0, 0, 1, 0, 0)",
  "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
  "0px", "0px 0px", "0px 0px 0px", "1", "1 1",
]);
function atRest(value) {
  return value == null || REST_TRANSFORMS.has(String(value).trim());
}

// ¿La transición SE ALEJA del reposo? Desvanecer, o desplazar/escalar desde la
// posición normal. Al reaparecer la página es framer reponiendo su `initial`
// (`opacity: 0`, `y: 10`…) sobre lo que ya se veía, y en el fotograma
// siguiente lo deshace: terminarla dejaba pintado ese estado de partida (la
// barra de filtros del Historial, 10px más abajo durante un fotograma). Las que
// VUELVEN al reposo (`@starting-style`: el icono de reserva de cada póster)
// sí se terminan.
function leavesRest(animation) {
  if (typeof CSSTransition === "undefined" || !(animation instanceof CSSTransition)) return false;
  const keyframes = animation.effect?.getKeyframes?.() || [];
  const first = keyframes[0] || {};
  const last = keyframes.at(-1) || {};
  const from = Number.parseFloat(first.opacity);
  const to = Number.parseFloat(last.opacity);
  if (to < from) return true;
  return ["transform", "translate", "scale", "rotate"].some(
    (property) => property in first && atRest(first[property]) && !atRest(last[property]),
  );
}

function finishRevealAnimations({ last = true } = {}) {
  const root = document.querySelector("[data-scroll-restoration-root]");
  if (!root) return;
  for (const animation of document.getAnimations()) {
    if (animation.timeline !== document.timeline) continue;
    const target = animation.effect?.target;
    if (!target || !root.contains(target)) continue;
    if (!Number.isFinite(animation.effect.getComputedTiming?.().endTime)) continue;
    if (heldFadeOuts.has(animation)) continue;
    if (leavesRest(animation)) {
      if (animation.playState === "running") {
        animation.pause();
        animation.currentTime = 0;
        heldFadeOuts.add(animation);
      }
      continue;
    }
    if (animation.playState === "running" || animation.playState === "paused") animation.finish();
  }
  if (!last) return;
  for (const animation of heldFadeOuts) {
    if (animation.playState === "paused") animation.play();
  }
  heldFadeOuts.clear();
}

function beginQuietReveal() {
  MotionGlobalConfig.skipAnimations = true;
  window.cancelAnimationFrame(revealFrame);
  window.clearTimeout(revealTimer);
  let frames = REVEAL_FRAMES;
  const step = () => {
    frames -= 1;
    finishRevealAnimations({ last: frames === 0 });
    revealFrame = frames > 0 ? window.requestAnimationFrame(step) : 0;
  };
  revealFrame = window.requestAnimationFrame(step);
  revealTimer = window.setTimeout(() => {
    MotionGlobalConfig.skipAnimations = false;
  }, REVEAL_MS);
}

// Lo monta el layout del slot: con él (también mientras carga la ficha) la
// página de origen se oculta. Efecto de LAYOUT: ocultar y mostrar ocurre antes
// de pintar, sin un fotograma con las dos a la vez.
export function OverlayRouteMarker({ children }) {
  const setOverlays = useContext(OverlayRouteContext);
  useLayoutEffect(() => {
    if (!setOverlays) return undefined;
    mountedOverlays += 1;
    setOverlays((count) => count + 1);
    return () => {
      mountedOverlays = Math.max(0, mountedOverlays - 1);
      // Se cierra la ficha VOLVIENDO ATRÁS: la página reaparece tal cual estaba.
      // Antes del commit que la muestra, para que framer ya no anime nada.
      if (isHistoryNavigation()) beginQuietReveal();
      setOverlays((count) => Math.max(0, count - 1));
    };
  }, [setOverlays]);
  return children;
}
