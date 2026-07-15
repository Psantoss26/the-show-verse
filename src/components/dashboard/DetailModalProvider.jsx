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
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from "framer-motion";

import { useRouter } from "next/navigation";

import { getMediaTypeForItem } from "@/lib/dashboard/media";
import { dashboardDetailHref } from "@/lib/dashboard/detailHref";
import DetailModal from "@/components/dashboard/DetailModal";
import useModalGuard from "@/hooks/useModalGuard";
import { useIsMobile } from "@/lib/hooks/useMediaQuery";

const DetailModalContext = createContext({
  openDetailModal: null,
  closeDetailModal: () => {},
  activeItem: null,
});

export function useDetailModal() {
  return useContext(DetailModalContext);
}

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
  // En MÓVIL NO se abre el modal de preview en ningún caso: se navega a la ficha
  // completa (DetailsClient / EpisodeDetails). El modal es solo escritorio.
  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const effectivePlacement = placement === "right" && !isMobile ? "right" : "center";

  // Pila de niveles abiertos. El item activo es el de arriba.
  const [stack, setStack] = useState([]);
  const activeItem = stack.length > 0 ? stack[stack.length - 1] : null;

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

      // MÓVIL: no se abre el modal; se navega a la ficha completa.
      if (isMobileRef.current) {
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
    [commit, router],
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
      {children}

      <AnimatePresence custom={switching}>
        {activeItem && (
          <DetailModal
            key={previewToken(activeItem)}
            item={activeItem}
            onClose={closeDetailModal}
            placement={effectivePlacement}
          />
        )}
      </AnimatePresence>
    </DetailModalContext.Provider>
  );
}
