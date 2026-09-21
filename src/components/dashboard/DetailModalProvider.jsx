"use client";

// /src/components/dashboard/DetailModalProvider.jsx
// Contexto + provider de la "ficha rápida estilo Netflix".
// Expone `useDetailModal()` -> { openDetailModal, closeDetailModal, activeItem }.
//
// Sincroniza la URL con la History API (SIN navegación de Next.js, para no
// re-renderizar la página): al abrir se hace `pushState` con `?preview=<token>`,
// de modo que el enlace es compartible / deep-linkable.
//
// NAVEGACIÓN EN PILA (stack): permite profundizar de una ficha a otra (p. ej. de
// una serie a un episodio suyo) apilando niveles. Cada `pushState` es un nivel:
//   - Abrir desde cerrado / desde una página  -> primer nivel (pushState).
//   - `openDetailModal(item, { drill:true })`  -> APILA un nivel encima (pushState);
//     Atrás del navegador vuelve al nivel anterior (p. ej. a la serie).
//   - `openDetailModal(item)` con ficha abierta -> REEMPLAZA el nivel actual
//     (replaceState); es el "cambio de título" al mismo nivel (fundido cruzado).
//   - Atrás (popstate) hace POP de un nivel; al vaciarse, se cierra.
//   - Cerrar por UI (X/Esc) deshace de golpe las entradas que empujamos
//     (`history.go(-owned)`), ignorando el popstate resultante con un guard.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from "framer-motion";

import { useRouter } from "@/lib/offline/useOfflineRouter";
import { isServerReachable } from "@/lib/offline/client";

import { getMediaTypeForItem } from "@/lib/dashboard/media";
import { dashboardDetailHref } from "@/lib/dashboard/detailHref";
import DetailModal from "@/components/dashboard/DetailModal";
import useModalGuard from "@/hooks/useModalGuard";
import { useIsMobile, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const DetailModalContext = createContext({
  openDetailModal: null,
  closeDetailModal: () => {},
  activeItem: null,
});

export function useDetailModal() {
  return useContext(DetailModalContext);
}

// ANCHO QUE EL DRAWER DERECHO OCUPA EN PANTALLA, publicado como variable CSS
// en <html>.
//
// Es la única forma de que lo sepa el NAVBAR. La barra vive en el layout raíz,
// por ENCIMA de este provider —que monta cada página por su cuenta—, así que no
// hay contexto que pueda llegar hasta ella. Y aunque lo hubiera, no interesa:
// durante el arrastre del tirador esto cambia en cada fotograma, y una variable
// en <html> se escribe en el mismo frame que el panel, sin re-renderizar la
// barra ni una sola vez.
//
// Ausente (no 0) cuando no hay drawer: así cada consumidor decide su propio
// valor por defecto con `var(--x, 0px)` y nadie tiene que limpiar nada.
const DRAWER_INSET_VAR = "--sv-detail-drawer-inset";

// Último valor publicado. Durante el arrastre esto se llama en CADA fotograma y
// el tirador devuelve fracciones de píxel: sin este filtro se reescribía una
// propiedad personalizada de <html> sesenta veces por segundo para, la mitad de
// las veces, dejar el mismo píxel. Cada escritura invalida el estilo de todo lo
// que dependa de la variable.
let publishedDrawerInset = null;

function publishDrawerInset(width) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (width == null) {
    if (publishedDrawerInset === null) return;
    publishedDrawerInset = null;
    root.style.removeProperty(DRAWER_INSET_VAR);
    return;
  }
  const next = Math.max(0, Math.round(width));
  if (next === publishedDrawerInset) return;
  publishedDrawerInset = next;
  root.style.setProperty(DRAWER_INSET_VAR, `${next}px`);
}

const DRAWER_VIEW_STORAGE_KEY = "showverse:detailModalView";
const CONTENT_VIEW_STORAGE_KEY = "showverse:detailModalContentView";
const PREVIEW_PARAM = "preview";
const PREVIEW_RE = /^(movie|tv)-(\d+)$/;
const EPISODE_RE = /^ep-(\d+)-(\d+)-(\d+)$/;

// Identidad de un item para la URL `?preview=` y para el `key` del modal (cada
// nivel debe tener su propio key para que AnimatePresence anime el cambio).
function previewToken(item) {
  if (!item) return "";
  if (item.media_type === "episode") {
    const showId = item.showId ?? item.id;
    return `ep-${showId}-${item.seasonNumber}-${item.episodeNumber}`;
  }
  return `${getMediaTypeForItem(item)}-${item.id}`;
}

/* ------------------------- helpers de URL (window) ------------------------- */
function buildPreviewUrl(item) {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  params.set(PREVIEW_PARAM, previewToken(item));
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash || ""}`;
}

function stripPreviewParam() {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  if (!params.has(PREVIEW_PARAM)) return;
  params.delete(PREVIEW_PARAM);
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    `${pathname}${qs ? `?${qs}` : ""}${hash || ""}`,
  );
}

function readPreviewFromLocation() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);
  if (!value) return null;

  const ep = EPISODE_RE.exec(value);
  if (ep) {
    const showId = Number(ep[1]);
    const seasonNumber = Number(ep[2]);
    const episodeNumber = Number(ep[3]);
    if (![showId, seasonNumber, episodeNumber].every(Number.isFinite)) {
      return null;
    }
    return {
      media_type: "episode",
      id: showId,
      showId,
      seasonNumber,
      episodeNumber,
    };
  }

  const match = PREVIEW_RE.exec(value);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isFinite(id)) return null;
  return { id, media_type: match[1] };
}

export default function DetailModalProvider({ children, placement = "center" }) {
  const router = useRouter();
  // En MÓVIL, por defecto NO se abre el modal de preview: se navega a la ficha
  // completa (DetailsClient / EpisodeDetails). La preview lateral es solo de
  // escritorio, también para las páginas de usuario y Configuración.
  const isMobile = useIsMobile();
  // En móvil el drawer derecho no aplica: si se abre el modal, es centrado.
  const effectivePlacement = placement === "right" && !isMobile ? "right" : "center";

  const [drawerView, setDrawerView] = useState("overlay");
  const [contentView, setContentView] = useState(null);
  const isTablet = useMediaQuery(
    "(min-width: 768px) and (max-width: 1023px), (min-width: 768px) and (hover: none), (min-width: 768px) and (pointer: coarse)",
  );
  const effectiveContentView = contentView ?? (isTablet ? "mobile" : "modal");
  const contentRef = useRef(null);
  const drawerWidthRef = useRef(null);

  useEffect(() => {
    try {
      const storedContentView = window.localStorage.getItem(CONTENT_VIEW_STORAGE_KEY);
      if (storedContentView === "mobile" || storedContentView === "modal") {
        setContentView(storedContentView);
      }
      if (window.localStorage.getItem(DRAWER_VIEW_STORAGE_KEY) === "docked") {
        setDrawerView("docked");
      }
    } catch {
      // La vista sigue funcionando cuando el almacenamiento no está disponible.
    }
  }, []);

  const changeDrawerView = useCallback((view) => {
    if (view !== "overlay" && view !== "docked") return;
    setDrawerView(view);
    try {
      window.localStorage.setItem(DRAWER_VIEW_STORAGE_KEY, view);
    } catch {
      // Conserva la elección durante esta sesión.
    }
  }, []);

  const changeContentView = useCallback((view) => {
    if (view !== "mobile" && view !== "modal") return;
    setContentView(view);
    try {
      window.localStorage.setItem(CONTENT_VIEW_STORAGE_KEY, view);
    } catch {
      // Conserva la elección en memoria si el almacenamiento no está disponible.
    }
  }, []);

  // Pila de niveles abiertos. El item activo es el de arriba.
  const [stack, setStack] = useState([]);
  const activeItem = stack.length > 0 ? stack[stack.length - 1] : null;
  const docked =
    activeItem != null && effectivePlacement === "right" && drawerView === "docked";

  // Una propiedad NO heredada evita recalcular el estilo de todas las tarjetas
  // en cada movimiento. El panel y este margen se escriben en el mismo frame.
  const updateDrawerWidth = useCallback((width) => {
    drawerWidthRef.current = width;
    // El margen del contenido solo aplica ACOPLADO; la variable se publica
    // siempre, porque el navbar tiene que apartarse en los dos modos: el panel
    // tapa el borde derecho igual esté acoplado o superpuesto.
    publishDrawerInset(width);
    if (!docked || !contentRef.current) return;

    // ACOPLADO Y ARRASTRANDO: el margen NO sigue al tirador fotograma a
    // fotograma.
    //
    // Este margen encoge la PÁGINA ENTERA que hay detrás. Actualizarlo sesenta
    // veces por segundo obliga a recomponer todas sus filas, sus imágenes y los
    // carruseles que tenga montados, y ese trabajo no cabe en un fotograma: es
    // lo que convertía el arrastre en saltos. Durante el gesto el panel se
    // mueve solo —se comporta como el modo superpuesto, que es lo que ya hace
    // el 50% de las veces— y la página se recoloca UNA vez al soltar.
    //
    // La marca la pone `beginResize` en DetailModal; se consulta en el DOM en
    // vez de pasarla por contexto para no re-renderizar el árbol al empezar y
    // al terminar el gesto.
    if (document.documentElement.hasAttribute("data-sv-drawer-resizing")) return;
    contentRef.current.style.marginRight = `${width}px`;
  }, [docked]);

  // Sin drawer no hay variable. `DetailModal` la escribe mientras está montado
  // (vía `updateDrawerWidth`), así que aquí solo hay que retirarla al cerrar
  // —y al desmontar el provider, por si se navega con la ficha abierta—.
  useLayoutEffect(() => {
    if (activeItem != null && effectivePlacement === "right") return;
    publishDrawerInset(null);
  });

  useEffect(() => () => publishDrawerInset(null), []);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.marginRight = docked
      ? (drawerWidthRef.current == null ? "50vw" : `${drawerWidthRef.current}px`)
      : "";
  }, [docked]);

  // ¿La entrada actual es un CAMBIO (mismo nivel o profundizar) con la ficha ya
  // abierta? Dispara fundido cruzado (en vez de deslizar). Se pasa como `custom`
  // a <AnimatePresence> para que lo lean la tarjeta entrante y la saliente.
  const [switching, setSwitching] = useState(false);

  // Refs para que los listeners globales lean el estado más reciente.
  const stackRef = useRef([]);
  // Nº de entradas de historial que hemos EMPUJADO (pushState) y que aún poseemos.
  const ownedRef = useRef(0);
  // Guard: ignora el popstate que provoca nuestro propio history.go al cerrar.
  const closingRef = useRef(false);

  const commit = useCallback((nextStack) => {
    stackRef.current = nextStack;
    setStack(nextStack);
  }, []);

  // Abre/profundiza una ficha.
  //   opts.drill = true  -> apila un nivel nuevo (Atrás vuelve al anterior).
  //   sin drill, con ficha abierta -> reemplaza el nivel actual (cambio de título).
  //   sin ficha abierta -> primer nivel.
  //   opts.push = false  -> deep-link: no tocamos el historial (la URL ya existe).
  const openDetailModal = useCallback(
    (item, opts = {}) => {
      if (!item || item.id == null || typeof window === "undefined") return;

      // MÓVIL: se navega siempre a la ficha completa; la preview es de escritorio.
      if (isMobile || !isServerReachable()) {
        let href;
        if (
          item.media_type === "episode" &&
          item.seasonNumber != null &&
          item.episodeNumber != null
        ) {
          const showId = item.showId ?? item.id;
          href = `/details/tv/${showId}/season/${item.seasonNumber}/episode/${item.episodeNumber}`;
        } else {
          href = dashboardDetailHref(item);
        }
        if (href) router.push(href);
        return;
      }

      const cur = stackRef.current;

      // Pulsar el MISMO título que ya está abierto no debe hacer nada.
      // Sin esto se entraba por la rama de "cambio de título": `replaceState` +
      // sustituir el nivel por un objeto `item` NUEVO. El `key` no cambia (mismo
      // token, así que el modal no remonta), pero la identidad del objeto sí, y
      // eso re-renderiza el modal, vuelve a disparar sus cargas y activa
      // `switching`. Resultado: un parpadeo para acabar mostrando exactamente lo
      // mismo que ya había.
      //
      // Se compara por `previewToken`, que es la identidad real de un nivel
      // (contempla los episodios: serie+temporada+episodio), no solo `id`.
      // El drill queda fuera a propósito: apilar es una acción explícita con su
      // propia semántica de historial (Atrás vuelve al nivel anterior).
      const active = cur.length > 0 ? cur[cur.length - 1] : null;
      if (active && !opts.drill && previewToken(item) === previewToken(active)) {
        return;
      }

      const url = buildPreviewUrl(item);

      if (opts.push === false) {
        // Deep-link inicial: no empujamos entrada (no la creamos nosotros).
        ownedRef.current = 0;
        setSwitching(false);
        commit([item]);
        return;
      }

      if (opts.drill && cur.length > 0) {
        setSwitching(true);
        window.history.pushState({ detailPreview: true }, "", url);
        ownedRef.current += 1;
        commit([...cur, item]);
      } else if (cur.length > 0) {
        setSwitching(true);
        window.history.replaceState({ detailPreview: true }, "", url);
        commit([...cur.slice(0, -1), item]);
      } else {
        setSwitching(false);
        window.history.pushState({ detailPreview: true }, "", url);
        ownedRef.current = 1;
        commit([item]);
      }
    },
    [commit, isMobile, router],
  );

  const closeDetailModal = useCallback(() => {
    if (stackRef.current.length === 0) return;
    const owned = ownedRef.current;
    ownedRef.current = 0;
    setSwitching(false);
    commit([]);
    if (typeof window === "undefined") return;
    if (owned > 0) {
      // Deshacemos de golpe nuestras entradas; el popstate resultante se ignora.
      closingRef.current = true;
      window.history.go(-owned);
    } else {
      stripPreviewParam();
    }
  }, [commit]);

  // Deep-link: al montar, si la URL ya trae ?preview=..., abrimos la ficha con un
  // item mínimo (el hook de datos completará el resto).
  useEffect(() => {
    const item = readPreviewFromLocation();
    if (item) openDetailModal(item, { push: false });
  }, [openDetailModal]);

  // popstate (Atrás/Adelante): hace POP de un nivel. Al vaciarse, cierra.
  useEffect(() => {
    const onPopState = () => {
      if (closingRef.current) {
        // Es el popstate de nuestro propio history.go al cerrar: ignorar.
        closingRef.current = false;
        return;
      }
      const cur = stackRef.current;
      if (cur.length === 0) return;
      const next = cur.slice(0, -1);
      ownedRef.current = Math.max(0, ownedRef.current - 1);
      setSwitching(next.length > 0);
      commit(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [commit]);

  // Comportamiento común del modal: cierre con Esc y bloqueo de scroll de fondo.
  // El drawer derecho NO bloquea el scroll: se puede seguir navegando por debajo.
  useModalGuard({
    open: activeItem != null,
    onClose: closeDetailModal,
    lockScroll: effectivePlacement !== "right",
  });

  const value = useMemo(
    () => ({ openDetailModal, closeDetailModal, activeItem }),
    [openDetailModal, closeDetailModal, activeItem],
  );

  return (
    <DetailModalContext.Provider value={value}>
      <div
        ref={contentRef}
        className="min-w-0 @container/detail-page"
      >
        {children}
      </div>

      <AnimatePresence custom={switching}>
        {activeItem && (
          <DetailModal
            key={previewToken(activeItem)}
            item={activeItem}
            onClose={closeDetailModal}
            placement={effectivePlacement}
            drawerView={drawerView}
            contentView={effectiveContentView}
            tabletViewport={isTablet}
            onContentViewChange={changeContentView}
            onDrawerViewChange={changeDrawerView}
            onDrawerWidthChange={updateDrawerWidth}
            // `custom` de AnimatePresence solo llega al panel que SALE. El que
            // ENTRA usa el `custom` de su propio motion.div, así que hay que
            // pasarle `switching` explícitamente; sin esto, al cambiar de título
            // el panel entrante caía en la rama `else` (deslizar) en vez de hacer
            // el fundido cruzado que corresponde a un cambio con el drawer abierto.
            switching={switching}
          />
        )}
      </AnimatePresence>
    </DetailModalContext.Provider>
  );
}
