"use client";

import { Activity, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  NavigationPromisesContext,
  PathParamsContext,
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { MotionGlobalConfig } from "framer-motion";
import { isHistoryNavigation } from "@/lib/navigation/historyNavigation";
import { createScreenStack, navigateScreens } from "@/lib/navigation/screenStack";
import {
  beginScreenReveal,
  currentScreenReveal,
  endScreenReveal,
} from "@/lib/navigation/screenReveal";

// LAS PANTALLAS ANTERIORES SIGUEN VIVAS: VOLVER NO MONTA NADA.
//
// El layout raíz pinta aquí la página (`children`) y el slot `@overlay`, donde
// Next pone las fichas abiertas con navegación interna (ver
// src/app/@overlay/(.)details/layout.jsx). Cada URL visitada es una PANTALLA:
// la página de `children` o la ficha del slot. Al navegar, la pantalla que se
// deja queda en <Activity mode="hidden"> —fuera de la vista (`display: none`) y
// sin efectos, pero con su DOM, su estado, sus imágenes y su scroll— y al volver
// reaparece en el mismo commit, antes de pintar.
//
// Antes solo sobrevivía la página de DEBAJO de la ficha. Una ficha abierta
// desde un dashboard vive en el slot, y al ir desde ella a una temporada, un
// actor o un episodio el slot pasaba a pintar esa otra ficha: DetailsClient se
// desmontaba y al volver se montaba de cero (carga, portada y secciones que
// entran de nuevo: el parpadeo). Igual al ir a una lista u otra página. Ahora
// cada pantalla pinta su slot con una COPIA CONGELADA del contexto del router
// de Next (`LayoutRouterContext`: árbol y caché de esa URL) y de la URL
// (`PageNavigation`), así que sigue mostrando lo suyo aunque la URL viva sea
// otra. Es lo que hace Next con Cache Components (layout-router guarda rutas
// en Activity), pero ordenado por el historial y sin migrar todas las rutas.
// La pila (qué pantallas viven y cuál se ve) está en lib/navigation/screenStack.

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
  const pathname = useContext(PathnameContext) || "/";
  // Lo que hay en el slot, en el MISMO render en que Next cambia la URL: la
  // pantalla que se deja no llega a ver la nueva.
  const overlaySegments = useSelectedLayoutSegments("overlay");
  const kind = overlaySegments?.includes("(.)details") ? "overlay" : "page";

  const [stack, setStack] = useState(() => createScreenStack(pathname, kind));
  let state = stack;
  const current = state.screens[state.active];
  if (current.key !== pathname || current.kind !== kind) {
    const history = isHistoryNavigation(pathname);
    state = navigateScreens(state, pathname, kind, history);
    // VOLVER ATRÁS: framer debe saltar ya sus entradas, antes del commit que
    // muestra la pantalla (sus efectos corren antes que los de este componente).
    if (state.revealed) {
      beginQuietReveal();
      // Sus efectos de carga no deben repetirse (ver lib/navigation/screenReveal).
      beginScreenReveal();
    }
    setStack(state);
  }

  const activeId = state.screens[state.active].id;
  const revealed = state.revealed;
  // Fin del revelado cuando ya han corrido los efectos de la pantalla revelada:
  // en la tarea siguiente, no en este efecto. Los de los hijos van antes que
  // los de este componente, pero en desarrollo StrictMode los vuelve a ejecutar
  // al reaparecer el <Activity>, después de este efecto.
  useEffect(() => {
    if (!revealed) return undefined;
    const reveal = currentScreenReveal();
    const timer = window.setTimeout(() => endScreenReveal(reveal), 0);
    return () => {
      window.clearTimeout(timer);
      endScreenReveal(reveal);
    };
  }, [activeId, revealed]);
  useLayoutEffect(() => {
    // La pantalla que se deja puede tener un tráiler sonando.
    pauseHiddenPageMedia();
    // La pantalla recuperada ya es visible en este commit: sus animaciones
    // reiniciadas se terminan antes de que se pinte nada.
    if (revealed) finishRevealAnimations({ last: false });
  }, [activeId, revealed]);

  return state.screens.map((screen, index) => {
    const active = index === state.active;
    return (
      <Activity key={screen.id} mode={active ? "visible" : "hidden"}>
        <ScreenRouter frozen={!active}>
          <PageNavigation frozen={!active}>
            {screen.kind === "overlay" ? overlay : children}
          </PageNavigation>
        </ScreenRouter>
      </Activity>
    );
  });
}

// CADA PANTALLA PINTA SU URL, NO LA VIVA.
// Los slots (`children`, `overlay`) son layout-routers de Next: leen el árbol y
// la caché de `LayoutRouterContext`. Mientras la pantalla está oculta se le da
// el último valor con el que se pintó, así que sigue mostrando su página (y no
// se vuelve a renderizar) aunque el router ya esté en otra URL.
// Al volver a ser la activa conserva ese valor hasta que el router cambie de
// nuevo: tras el `popstate`, Next entrega el árbol de esa misma URL pero con
// objetos nuevos, y pasárselo en el commit que la revela obligaba a reconciliar
// toda la página (el payload RSC entero) justo cuando tiene que aparecer quieta.
// Con el primer cambio real del router (otra búsqueda, un `refresh`) recibe el
// vivo, y desde ahí lo sigue.
function ScreenRouter({ frozen, children }) {
  const live = useContext(LayoutRouterContext);
  const [state, setState] = useState(() => ({ value: live, frozen, liveAtReveal: null }));
  let next = state;
  if (frozen) {
    if (!state.frozen) next = { ...state, frozen: true };
  } else if (state.frozen) {
    // Se revela: sigue con lo que pintaba mientras el router siga en el valor
    // con el que ha vuelto (ver abajo).
    next = { value: state.value, frozen: false, liveAtReveal: live };
  } else if (state.liveAtReveal !== null && live !== state.liveAtReveal) {
    next = { value: live, frozen: false, liveAtReveal: null };
  } else if (state.liveAtReveal === null && live !== state.value) {
    next = { ...state, value: live };
  }
  if (next !== state) setState(next);
  return <LayoutRouterContext.Provider value={next.value}>{children}</LayoutRouterContext.Provider>;
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

// Lo monta el layout del slot: cuenta las fichas VISIBLES (una ficha oculta en
// la pila deshace sus efectos de layout) para `isOverlayOpen`.
export function OverlayRouteMarker({ children }) {
  useLayoutEffect(() => {
    mountedOverlays += 1;
    return () => {
      mountedOverlays = Math.max(0, mountedOverlays - 1);
      // Se deja la ficha VOLVIENDO ATRÁS a una página que se monta de nuevo
      // (ya no estaba en la pila): que entre quieta, como al volver.
      if (isHistoryNavigation()) beginQuietReveal();
    };
  }, []);
  return children;
}
