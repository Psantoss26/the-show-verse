"use client";

// /src/components/dashboard/DetailModalProvider.jsx
// Contexto + provider de la "ficha rápida estilo Netflix" del dashboard de Inicio.
// Expone `useDetailModal()` -> { openDetailModal, closeDetailModal, activeItem }.
//
// Sincroniza la URL con la History API (SIN navegación de Next.js, para no
// re-renderizar el dashboard): al abrir se hace `pushState` con
// `?preview=<tipo>-<id>`, de modo que el botón Atrás cierra la ficha y el enlace
// es compartible / deep-linkable. Al cerrar por UI (Esc / backdrop / botón X) se
// vuelve atrás para dejar la URL limpia; al cerrar por `popstate` (Atrás del
// navegador) solo se limpia el estado, sin tocar de nuevo el historial (evita
// bucles).

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

// En móvil (<640px) NUNCA se abre la ficha rápida: siempre se navega a la ficha
// completa (DetailsClient), que ya trae su propio hero de portada + logo. Se
// consulta en el momento del click (no en render) para no arriesgar hydration.
const MOBILE_MQ = "(max-width: 639px)";
function isMobileViewport() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

/* ------------------------- helpers de URL (window) ------------------------- */
function buildPreviewUrl(item) {
  const type = getMediaTypeForItem(item);
  const id = item?.id;
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  params.set(PREVIEW_PARAM, `${type}-${id}`);
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
  const match = PREVIEW_RE.exec(value);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isFinite(id)) return null;
  return { id, media_type: match[1] };
}

export default function DetailModalProvider({ children }) {
  const router = useRouter();
  const [activeItem, setActiveItem] = useState(null);

  // Refs para que los listeners globales (popstate/keydown) lean siempre el
  // estado más reciente sin re-registrarse ni arrastrar cierres obsoletos.
  const activeItemRef = useRef(null);
  // ¿Somos responsables de una entrada de historial que hay que "descartar" al
  // cerrar? true cuando abrimos con pushState; false en deep-link (la URL ya
  // traía el parámetro, no empujamos entrada).
  const pushedRef = useRef(false);

  const clearActive = useCallback(() => {
    activeItemRef.current = null;
    setActiveItem(null);
  }, []);

  // Abre la ficha. `push` controla si tocamos el historial: true en aperturas
  // desde la UI; false al hidratar un deep-link (la URL ya tiene el parámetro).
  const applyOpen = useCallback((item, { push }) => {
    if (!item || item.id == null) return;
    if (push && typeof window !== "undefined") {
      const url = buildPreviewUrl(item);
      if (activeItemRef.current && pushedRef.current) {
        // Ya hay ficha abierta con nuestra entrada (p. ej. saltar a una
        // recomendación): reemplazamos el parámetro en lugar de apilar otra
        // entrada, así el botón Atrás cierra en un solo paso.
        window.history.replaceState({ detailPreview: true }, "", url);
      } else {
        window.history.pushState({ detailPreview: true }, "", url);
        pushedRef.current = true;
      }
    }
    activeItemRef.current = item;
    setActiveItem(item);
  }, []);

  const openDetailModal = useCallback(
    (item) => {
      if (!item) return;
      // Móvil: sin ficha rápida. Navegamos directamente a la ficha completa.
      if (isMobileViewport()) {
        router.push(dashboardDetailHref(item, getMediaTypeForItem(item)));
        return;
      }
      applyOpen(item, { push: true });
    },
    [applyOpen, router],
  );

  const closeDetailModal = useCallback(() => {
    if (!activeItemRef.current) return;
    if (pushedRef.current && typeof window !== "undefined") {
      // Cierre por UI: volvemos atrás para descartar nuestra entrada y dejar la
      // URL limpia. `history.back()` dispara popstate, pero como ya limpiamos el
      // estado aquí, el listener será un no-op (sin bucle).
      pushedRef.current = false;
      clearActive();
      window.history.back();
    } else {
      // Sin entrada propia (deep-link): solo quitamos el parámetro.
      if (typeof window !== "undefined") stripPreviewParam();
      clearActive();
    }
  }, [clearActive]);

  // Deep-link: al montar, si la URL ya trae ?preview=<tipo>-<id>, abrimos la
  // ficha con un item mínimo (el hook de datos completará el resto). En móvil
  // no se abre: se redirige a la ficha completa y se limpia el parámetro.
  useEffect(() => {
    const item = readPreviewFromLocation();
    if (!item) return;
    if (isMobileViewport()) {
      router.replace(dashboardDetailHref(item, getMediaTypeForItem(item)));
      return;
    }
    applyOpen(item, { push: false });
  }, [applyOpen, router]);

  // popstate (Atrás/Adelante del navegador): si la ficha está abierta, la
  // entrada que empujamos ya se descartó, así que solo limpiamos el estado SIN
  // tocar el historial de nuevo.
  useEffect(() => {
    const onPopState = () => {
      if (activeItemRef.current) {
        pushedRef.current = false;
        clearActive();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearActive]);

  // Cerrar con Escape.
  useEffect(() => {
    if (!activeItem) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeDetailModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItem, closeDetailModal]);

  // Bloquear el scroll del body mientras la ficha está abierta (igual que
  // AddToListModal).
  useEffect(() => {
    if (!activeItem) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeItem]);

  const value = useMemo(
    () => ({ openDetailModal, closeDetailModal, activeItem }),
    [openDetailModal, closeDetailModal, activeItem],
  );

  return (
    <DetailModalContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {activeItem && (
          <DetailModal
            key={`${getMediaTypeForItem(activeItem)}-${activeItem.id}`}
            item={activeItem}
            onClose={closeDetailModal}
          />
        )}
      </AnimatePresence>
    </DetailModalContext.Provider>
  );
}
