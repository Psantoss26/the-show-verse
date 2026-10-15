"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useIsPresent, useMotionValue, useReducedMotion } from "framer-motion";
import { ArrowUpRight, PanelRight, Pin, Smartphone, X } from "lucide-react";
import PanelCenter from "@/components/ui/icons/PanelCenter";
import { DETAIL_MODAL_GLASS_CONTROL, LIQUID_GLASS_DETAIL_SURFACE } from "@/lib/ui/liquidGlass";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { isServerReachable } from "@/lib/offline/client";
import { openSavedRoute } from "@/lib/offline/navigation";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import { emitDrawerResize, isDrawerResizeActive } from "@/lib/ui/drawerResizeEvents";
import { useDrawerWidthVar } from "@/lib/ui/drawerWidthVar";
import { buildEmbeddedDetailsHref, canonicalDetailsHref, EMBEDDED_DETAILS_MESSAGE } from "@/lib/navigation/embeddedDetails";
import { detailPreviewFromHref, subrouteDetailsHref } from "@/lib/navigation/detailPreview";
import { clampDrawerWidth, clampMobileDetailsWidth, phoneContentScale, MOBILE_DETAILS_ASPECT_RATIO } from "@/lib/ui/detailModalSizing";
import {
  backdropVariants,
  createPanelVariantsRight,
  DETAILS_ROUTE_REVEAL_MIN_MS,
  nextAnimationFrame,
  panelVariants,
  startFullDetailsTransition,
  wait,
  waitForDetailsRoot,
} from "@/components/dashboard/detailPanelMotion";

// PANEL DE TEMPORADA Y EPISODIO.
//
// La ficha es la página real (Season/EpisodeDetailsClient) en un iframe con su
// propio viewport: en vista teléfono se ve exactamente como en un móvil. Lo que
// la rodea es el MISMO panel que la ficha de título (DetailModal): cristal,
// entrada y salida, controles, tirador, cierre al pulsar fuera, hueco del
// navbar y transición a la ficha completa. Solo cambia la información.

const OPENING_CLICK_GRACE_MS = 350;
const CONTROL_CLASS = `group flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${DETAIL_MODAL_GLASS_CONTROL}`;
const CONTROL_ICON_CLASS = "h-5 w-5 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none";

function preferredWidth(phone) {
  let width = phone ? window.innerHeight * MOBILE_DETAILS_ASPECT_RATIO : Math.min(Math.round(window.innerWidth * 0.95), 1080);
  try {
    const stored = Number(window.localStorage.getItem(phone ? "showverse:mobileDetailsWidth" : "showverse:detailModalWidth"));
    if (stored > 0) width = stored;
  } catch {
    // El panel funciona también sin almacenamiento.
  }
  return width;
}

// El iframe no se puede clonar para la transición a la ficha completa (y
// `startFullDetailsTransition` lo retira del clon): se reponen en su sitio las
// imágenes que se ven de él —portada, fotogramas—, que es lo que se reconoce
// mientras el clon se amplía y se difumina.
function paintFrameSnapshot(frame, host) {
  const doc = frame?.contentDocument;
  const view = frame?.contentWindow;
  if (!doc || !view || !host) return;
  const layer = document.createElement("div");
  layer.style.cssText = `position:absolute;inset:0;overflow:hidden;border-radius:inherit;background:${view.getComputedStyle(doc.body).backgroundColor}`;
  for (const img of doc.images) {
    if (!img.currentSrc || !img.complete || !img.naturalWidth) continue;
    const rect = img.getBoundingClientRect();
    if (rect.width < 2 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= view.innerHeight || rect.left >= view.innerWidth) continue;
    // Bandas difuminadas que la página recorta con máscaras de sus ancestros
    // (decenas de miles de px de alto): copiadas tal cual taparían todo.
    if (rect.height > view.innerHeight * 2 || rect.width > view.innerWidth * 2) continue;
    let opacity = 1;
    for (let node = img; node && node !== doc.documentElement; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") opacity = 0;
      opacity *= Number(style.opacity);
    }
    if (opacity < 0.05) continue;
    const style = view.getComputedStyle(img);
    const copy = document.createElement("img");
    copy.alt = "";
    copy.src = img.currentSrc;
    Object.assign(copy.style, {
      position: "absolute",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      opacity: String(opacity),
      filter: style.filter === "none" ? "" : style.filter,
      borderRadius: style.borderRadius,
      maskImage: style.maskImage,
      webkitMaskImage: style.webkitMaskImage,
      maskSize: style.maskSize,
      maskPosition: style.maskPosition,
      clipPath: style.clipPath,
      maxWidth: "none",
      maxHeight: "none",
    });
    layer.append(copy);
  }
  host.append(layer);
}

export default function SubrouteDetailsPanel({ item, placement, contentView, drawerView, tabletViewport,
  onClose, onOpenDetail, onPlacementChange, onContentViewChange, onDrawerViewChange, onDrawerWidthChange, switching }) {
  const router = useRouter();
  const frame = useRef(null);
  const panelRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const restoredFromHistory = useIsHistoryNavigation();
  const right = placement === "right";
  const phone = right && contentView === "mobile";
  const docked = right && drawerView === "docked";
  const href = subrouteDetailsHref(item);
  const label = item.media_type === "season" ? `Temporada ${item.seasonNumber}` : `Episodio ${item.seasonNumber}×${item.episodeNumber}`;
  const panelVariantsRight = useMemo(() => createPanelVariantsRight(reducedMotion), [reducedMotion]);
  const [panelSettled, setPanelSettled] = useState(restoredFromHistory);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const resizingRef = useRef(false);
  const resizeCleanupRef = useRef(null);
  const backdropPressRef = useRef(false);

  const clamp = useCallback((value, viewportWidth = window.innerWidth) => phone
    ? clampMobileDetailsWidth(value, viewportWidth, window.innerHeight)
    : clampDrawerWidth(value, viewportWidth, { tablet: tabletViewport }), [phone, tabletViewport]);

  // Ancho DEFINITIVO desde el primer render, como DetailModal: sin un ancho
  // provisional que luego se corrige y reorganiza la página dos veces.
  const [panelWidth, setPanelWidth] = useState(() =>
    typeof window === "undefined" ? 440 : clamp(preferredWidth(phone)));
  const panelWidthRef = useRef(panelWidth);
  // Lo que pinta el panel es un MotionValue: un render a mitad del arrastre no
  // puede devolverlo a un ancho viejo (ver la misma nota en DetailModal).
  const panelWidthMotion = useMotionValue(panelWidth);
  useLayoutEffect(() => {
    if (resizingRef.current) return;
    panelWidthMotion.set(panelWidth);
  }, [panelWidth, panelWidthMotion]);

  useLayoutEffect(() => {
    if (!right) return undefined;
    const onResize = () => {
      if (resizingRef.current) return;
      setPanelWidth((width) => {
        const next = clamp(width);
        panelWidthRef.current = next;
        return next;
      });
    };
    const next = clamp(preferredWidth(phone));
    panelWidthRef.current = next;
    setPanelWidth(next);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [right, phone, clamp]);

  useLayoutEffect(() => {
    if (right) onDrawerWidthChange?.(panelWidth);
  }, [right, panelWidth, onDrawerWidthChange]);
  useDrawerWidthVar(right, panelWidth);

  // Escala del contenido de teléfono (ver `phoneContentScale`): la lee la
  // página del iframe en sus bloques `[data-phone-scaled]`.
  const contentScale = phone && !tabletViewport ? phoneContentScale(panelWidth) : 1;
  const writeContentScale = useCallback((scale) => {
    const root = frame.current?.contentDocument?.documentElement;
    if (root && root.style.getPropertyValue("--sv-phone-scale") !== String(scale)) {
      root.style.setProperty("--sv-phone-scale", String(scale));
    }
  }, []);
  const syncContentScale = useCallback(() => writeContentScale(contentScale), [contentScale, writeContentScale]);
  useLayoutEffect(syncContentScale, [syncContentScale]);

  useEffect(() => {
    try {
      if (href) router.prefetch(href);
    } catch {
      // prefetch best-effort
    }
  }, [href, router]);

  // La ficha completa se abre encima de la página, que queda viva y oculta: al
  // volver, el panel vuelve a verse (no en su variante `navigate`).
  useLayoutEffect(() => () => setNavigating(false), []);
  useEffect(() => () => resizeCleanupRef.current?.(), [right, docked, phone]);

  useEffect(() => {
    const receive = (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== EMBEDDED_DETAILS_MESSAGE) return;
      const { action, href: destination, detail } = event.data;
      if (action === "content-ready" || action === "hero-ready") syncContentScale();
      if (action === "hero-ready" || (action === "content-ready" && !phone)) setLoading(false);
      if (action === "close") onClose();
      if (action === "list-changed") window.dispatchEvent(new CustomEvent("showverse:list-changed", { detail }));
      if (action !== "navigate" || typeof destination !== "string") return;
      let url;
      try { url = canonicalDetailsHref(destination, window.location.origin); } catch { return; }
      if (url.origin !== window.location.origin) return;
      const next = detailPreviewFromHref(url.href, window.location.origin);
      if (next) onOpenDetail(next, { drill: true });
      else router.push(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onClose, onOpenDetail, router, phone, syncContentScale]);

  // Cierre al pulsar FUERA del panel lateral superpuesto, como DetailModal. Los
  // clics dentro del iframe no llegan a este documento.
  useEffect(() => {
    if (!right || docked) return undefined;
    const onDocumentClick = (event) => {
      if (Date.now() - openedAt < OPENING_CLICK_GRACE_MS) return;
      // Otra tarjeta (preview, temporada o episodio): cambia de ficha.
      if (event.defaultPrevented) return;
      if (resizingRef.current) return;
      if (panelRef.current?.contains(event.target)) return;
      if (event.target?.closest?.("[data-detail-modal-layer]")) return;
      onClose?.();
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [right, docked, onClose, openedAt]);

  // La ficha del iframe tiene su propio documento: sus carruseles (Swiper se
  // recalcula entero en cada cambio de tamaño) esperan al final del gesto con
  // la misma marca y el mismo aviso que los de la página.
  const setFrameResizing = (active) => {
    const view = frame.current?.contentWindow;
    const root = frame.current?.contentDocument?.documentElement;
    if (!view || !root) return;
    if (active) root.setAttribute("data-sv-drawer-resizing", "");
    else root.removeAttribute("data-sv-drawer-resizing");
    emitDrawerResize(active, view);
  };

  // Arrastre del borde izquierdo, como DetailModal: con ratón el ancho sigue al
  // puntero (una escritura por fotograma, sin renders); en táctil se mueve una
  // guía y el panel cambia una vez al soltar.
  const beginResize = (event) => {
    if (!right || event.button !== 0) return;
    resizeCleanupRef.current?.();
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = true;
    const vw = window.innerWidth;
    const startX = event.clientX;
    const startWidth = panelWidth;
    panelWidthRef.current = panelWidth;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    // El iframe se quedaría con los eventos del puntero al pasar por encima.
    if (frame.current) frame.current.style.pointerEvents = "none";

    const ghostResize = event.pointerType !== "mouse";
    let ghost = null;
    let ghostStartLeft = 0;
    if (ghostResize && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      ghostStartLeft = rect.left;
      ghost = document.createElement("div");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "fixed",
        left: "0px",
        top: `${rect.top}px`,
        height: `${rect.height}px`,
        width: `${vw}px`,
        transform: `translate3d(${rect.left}px, 0, 0)`,
        zIndex: "10000",
        pointerEvents: "none",
        borderLeft: "2px solid rgba(255, 255, 255, 0.75)",
        borderTopLeftRadius: "1rem",
        borderBottomLeftRadius: "1rem",
        background: "rgba(255, 255, 255, 0.06)",
        boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.45)",
        willChange: "transform",
      });
      document.body.appendChild(ghost);
    } else {
      document.documentElement.dataset.svDrawerResizing = "";
      emitDrawerResize(true);
      setFrameResizing(true);
    }

    let frameId = 0;
    let appliedWidth = panelWidth;
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    handle.setPointerCapture?.(pointerId);

    const writeWidth = (width) => {
      panelWidthMotion.set(width);
      if (panelRef.current) panelRef.current.style.width = `${width}px`;
      if (phone && !tabletViewport) {
        const exact = phoneContentScale(width);
        writeContentScale(isDrawerResizeActive() ? Math.round(exact * 100) / 100 : exact);
      }
      onDrawerWidthChange?.(width);
    };
    const applyWidth = () => {
      frameId = 0;
      const next = panelWidthRef.current;
      if (next === appliedWidth) return;
      appliedWidth = next;
      writeWidth(next);
    };
    const moveGhost = () => {
      frameId = 0;
      if (ghost) ghost.style.transform = `translate3d(${ghostStartLeft + (startWidth - panelWidthRef.current)}px, 0, 0)`;
    };
    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      panelWidthRef.current = clamp(startWidth + startX - moveEvent.clientX, vw);
      if (!frameId) frameId = window.requestAnimationFrame(ghostResize ? moveGhost : applyWidth);
    };
    const cleanup = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      if (frame.current) frame.current.style.pointerEvents = "";
      ghost?.remove();
      ghost = null;
      const wasLiveResize = isDrawerResizeActive();
      delete document.documentElement.dataset.svDrawerResizing;
      if (wasLiveResize) {
        emitDrawerResize(false);
        setFrameResizing(false);
      }
      resizeCleanupRef.current = null;
      // El click posterior al pointerup no debe cerrar el modo superpuesto.
      window.setTimeout(() => {
        resizingRef.current = false;
      }, 0);
    };
    const finish = () => {
      cleanup();
      if (!ghostResize) applyWidth();
      writeWidth(panelWidthRef.current);
      setPanelWidth(panelWidthRef.current);
      try {
        window.localStorage.setItem(phone ? "showverse:mobileDetailsWidth" : "showverse:detailModalWidth", String(panelWidthRef.current));
      } catch {
        // localStorage no disponible
      }
    };
    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      panelWidthRef.current = clamp(startWidth + startX - upEvent.clientX, vw);
      finish();
    };
    const onCancel = (cancelEvent) => {
      if (cancelEvent.type === "pointercancel" && cancelEvent.pointerId !== pointerId) return;
      finish();
    };
    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
  };

  // Teclado en el tirador (DetailModal solo lo arrastra): mismas cotas.
  const resizeWithKeyboard = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home" ? 0 : event.key === "End" ? Infinity : panelWidth + (event.key === "ArrowLeft" ? 20 : -20);
    const next = clamp(target);
    panelWidthRef.current = next;
    setPanelWidth(next);
    try {
      window.localStorage.setItem(phone ? "showverse:mobileDetailsWidth" : "showverse:detailModalWidth", String(next));
    } catch {
      // localStorage no disponible
    }
  };

  // A la ficha completa con la misma transición que DetailModal.
  const goToFullDetails = async () => {
    if (navigating || !href) return;
    if (!isServerReachable()) {
      await openSavedRoute(href);
      return;
    }
    if (reducedMotion) {
      router.push(href);
      return;
    }
    const routeTransition = startFullDetailsTransition(panelRef.current, right ? "right" : "center", {
      decorateClone: (clone) => paintFrameSnapshot(frame.current, clone.querySelector("[data-subroute-frame]")),
    });
    setNavigating(true);
    if (routeTransition) await nextAnimationFrame();
    router.push(href);
    if (routeTransition) {
      Promise.all([waitForDetailsRoot(), wait(DETAILS_ROUTE_REVEAL_MIN_MS)])
        .catch(() => {})
        .finally(routeTransition.reveal);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-y-0 z-[9999] flex ${right ? "left-0 w-screen justify-end pointer-events-none" : "inset-x-0 justify-center"}`}
      role="dialog"
      aria-modal={right ? undefined : "true"}
      aria-label={label}
    >
      {!right && (
        <motion.div
          variants={backdropVariants}
          initial="hidden"
          animate={navigating ? "navigate" : "visible"}
          exit="exit"
          className="fixed inset-0 backdrop-blur-xl"
          onPointerDown={(event) => { backdropPressRef.current = event.button === 0 && event.isPrimary; }}
          onPointerCancel={() => { backdropPressRef.current = false; }}
          onClick={() => {
            const startedOnBackdrop = backdropPressRef.current;
            backdropPressRef.current = false;
            if (startedOnBackdrop && !navigating) onClose?.();
          }}
        />
      )}

      <motion.div
        ref={panelRef}
        data-drawer-moving={right && (!panelSettled || !isPresent) ? "" : undefined}
        custom={switching}
        variants={right ? panelVariantsRight : panelVariants}
        initial={restoredFromHistory ? false : "hidden"}
        animate={navigating ? "navigate" : "visible"}
        exit="exit"
        onAnimationComplete={(definition) => {
          if (definition === "visible") setPanelSettled(true);
        }}
        onClick={(event) => event.stopPropagation()}
        style={{
          willChange: panelSettled ? "auto" : "transform",
          ...(right ? { width: panelWidthMotion } : null),
          ...(phone ? { aspectRatio: MOBILE_DETAILS_ASPECT_RATIO } : null),
        }}
        className={`sv-drawer-panel relative z-10 flex flex-col overflow-hidden ${LIQUID_GLASS_DETAIL_SURFACE} ${
          right
            ? phone
              ? "h-auto max-h-full min-h-0 self-center rounded-l-2xl pointer-events-auto"
              : "h-full rounded-l-2xl pointer-events-auto"
            : "mt-[4vh] h-[96vh] w-[95vw] max-w-[1080px] rounded-t-2xl"
        }`}
      >
        {right && <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 backdrop-blur-md" />}

        {right && (
          <div
            onPointerDown={beginResize}
            onKeyDown={resizeWithKeyboard}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Redimensionar panel"
            aria-valuenow={panelWidth}
            title="Arrastra para redimensionar"
            className={`group absolute inset-y-0 left-0 z-40 flex cursor-col-resize touch-none items-center justify-center outline-none ${tabletViewport ? "w-6" : "w-3"}`}
          >
            <div className={`h-16 w-1 rounded-full transition-colors duration-200 group-hover:bg-white/45 group-focus-visible:bg-white/60 ${tabletViewport ? "bg-white/35" : "bg-white/15"}`} />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={onClose}
            disabled={navigating}
            className={`absolute left-4 top-4 z-30 flex h-10 w-10 select-none items-center justify-center rounded-full transition-all duration-300 group ${DETAIL_MODAL_GLASS_CONTROL}`}
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
          </button>

          <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
            {onPlacementChange && (
              <button
                type="button"
                onClick={() => onPlacementChange(right ? "center" : "right")}
                disabled={navigating}
                aria-label={right ? "Mostrar como modal centrado" : "Mostrar como panel lateral"}
                title={right ? "Mostrar como modal centrado" : "Mostrar como panel lateral"}
                aria-pressed={right}
                className={CONTROL_CLASS}
              >
                {right
                  ? <PanelCenter aria-hidden="true" className={`${CONTROL_ICON_CLASS} text-white`} />
                  : <PanelRight aria-hidden="true" className={CONTROL_ICON_CLASS} />}
              </button>
            )}
            {right && onDrawerViewChange && (
              <button
                type="button"
                onClick={() => onDrawerViewChange(docked ? "overlay" : "docked")}
                disabled={navigating}
                aria-label="Acoplar panel lateral"
                aria-pressed={docked}
                className={CONTROL_CLASS}
              >
                <Pin aria-hidden="true" fill={docked ? "currentColor" : "none"} className={`${CONTROL_ICON_CLASS} ${docked ? "text-white" : ""}`} />
              </button>
            )}
            {right && onContentViewChange && (
              <button
                type="button"
                onClick={() => onContentViewChange(phone ? "modal" : "mobile")}
                disabled={navigating}
                aria-label="Mostrar ficha móvil"
                aria-pressed={phone}
                className={CONTROL_CLASS}
              >
                <Smartphone aria-hidden="true" fill={phone ? "currentColor" : "none"} className={`${CONTROL_ICON_CLASS} ${phone ? "text-white" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={goToFullDetails}
              disabled={navigating}
              className={`group flex h-10 w-10 select-none items-center justify-center gap-0 overflow-hidden rounded-full px-0 transition-all duration-300 ease-out ${phone ? "" : "hover:w-[166px] hover:gap-1.5 hover:px-3"} ${DETAIL_MODAL_GLASS_CONTROL}`}
              aria-label="Ver ficha completa"
              aria-busy={navigating ? "true" : undefined}
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-300 group-hover:rotate-45">
                <ArrowUpRight className="h-5 w-5 shrink-0" />
              </div>
              <span className={`max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold leading-normal tracking-wide opacity-0 transition-[max-width,opacity] duration-200 ${phone ? "hidden" : "group-hover:max-w-[120px] group-hover:opacity-100"} translate-y-[1px]`}>
                Ver ficha completa
              </span>
            </button>
          </div>

          <div data-subroute-frame="" className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[inherit]" aria-busy={loading}>
            {loading && (
              <div role="status" className="pointer-events-none absolute inset-0">
                <span className="sr-only">Cargando ficha…</span>
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 motion-safe:animate-pulse" style={{ maskImage: "linear-gradient(black 65%, transparent 100%)" }} />
              </div>
            )}
            <iframe
              ref={frame}
              src={buildEmbeddedDetailsHref(href)}
              title={label}
              onLoad={() => {
                syncContentScale();
                // Error/not-found documents cannot emit hero-ready. Reveal their retry UI.
                const doc = frame.current?.contentDocument;
                if (doc && (!doc.querySelector("[data-embedded-details]") || doc.querySelector("[data-details-error]"))) setLoading(false);
              }}
              className={`relative h-full w-full border-0 transition-opacity duration-500 motion-reduce:transition-none ${loading ? "opacity-0" : "opacity-100"}`}
            />
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
