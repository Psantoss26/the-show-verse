"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import PanelCenter from "@/components/ui/icons/PanelCenter";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, PanelRight, Pin, Smartphone, X } from "lucide-react";
import { DETAIL_MODAL_GLASS_CONTROL } from "@/lib/ui/liquidGlass";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { buildEmbeddedDetailsHref, canonicalDetailsHref, EMBEDDED_DETAILS_MESSAGE } from "@/lib/navigation/embeddedDetails";
import { detailPreviewFromHref, subrouteDetailsHref } from "@/lib/navigation/detailPreview";
import { clampDrawerWidth, clampMobileDetailsWidth, phoneContentScale, MOBILE_DETAILS_ASPECT_RATIO } from "@/lib/ui/detailModalSizing";

// Reuse the actual Season/Episode pages in their own responsive viewport.
export default function SubrouteDetailsPanel({ item, placement, contentView, drawerView, tabletViewport,
  onClose, onOpenDetail, onPlacementChange, onContentViewChange, onDrawerViewChange, onDrawerWidthChange, switching }) {
  const router = useRouter();
  const frame = useRef(null);
  const closeButton = useRef(null);
  const reducedMotion = useReducedMotion();
  const right = placement === "right";
  const phone = right && contentView === "mobile";
  const storageKey = phone ? "showverse:mobileDetailsWidth" : "showverse:detailModalWidth";
  const [width, setWidth] = useState(440);
  const contentScale = phone && !tabletViewport ? phoneContentScale(width) : 1;
  const syncContentScale = useCallback(() => {
    frame.current?.contentDocument?.documentElement.style.setProperty("--sv-phone-scale", String(contentScale));
  }, [contentScale]);
  useLayoutEffect(syncContentScale, [syncContentScale]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const href = subrouteDetailsHref(item);
  const label = item.media_type === "season" ? `Temporada ${item.seasonNumber}` : `Episodio ${item.seasonNumber}×${item.episodeNumber}`;

  const clamp = (value) => phone
    ? clampMobileDetailsWidth(value, window.innerWidth, window.innerHeight)
    : clampDrawerWidth(value, window.innerWidth, { tablet: tabletViewport });

  useLayoutEffect(() => {
    const resize = () => {
      let preferred = phone ? window.innerHeight * MOBILE_DETAILS_ASPECT_RATIO : window.innerWidth * 0.5;
      try { preferred = Number(localStorage.getItem(storageKey)) || preferred; } catch {}
      setWidth(phone ? clampMobileDetailsWidth(preferred, window.innerWidth, window.innerHeight)
        : clampDrawerWidth(preferred, window.innerWidth, { tablet: tabletViewport }));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phone, storageKey, tabletViewport]);

  useLayoutEffect(() => {
    if (right) onDrawerWidthChange?.(width);
  }, [right, width, onDrawerWidthChange]);

  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, []);

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

  const saveWidth = (value) => {
    const next = clamp(value);
    setWidth(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  };
  const buttonClass = `pointer-events-auto flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full transition-all duration-300 motion-reduce:transition-none ${DETAIL_MODAL_GLASS_CONTROL}`;

  return createPortal(
    <div className={`fixed inset-y-0 left-0 z-[9999] flex w-screen ${right ? "pointer-events-none justify-end" : "items-center justify-center"}`}>
      {!right && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />}
      <motion.section role="dialog" aria-modal={right ? undefined : true} aria-label={label}
        initial={{ opacity: 0, x: right && !reducedMotion && !switching ? 40 : 0 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
        className={`sv-drawer-panel pointer-events-auto relative flex flex-col bg-[#101010] shadow-2xl ${right ? "rounded-l-2xl" : "h-[92dvh] rounded-2xl"}`}
        style={{ width: right ? width : "min(1080px, 94vw)", ...(right ? { height: phone ? Math.min(window.innerHeight, width / MOBILE_DETAILS_ASPECT_RATIO) : "100%", alignSelf: "center" } : {}) }}>
        {right && <div role="separator" aria-label="Ancho de la ficha" aria-orientation="vertical" tabIndex={0}
          aria-valuenow={width} aria-valuemin={clamp(0)} aria-valuemax={clamp(Infinity)}
          className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none hover:bg-emerald-300/30 focus-visible:bg-emerald-300/30"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }}
          onPointerMove={(event) => { if (dragging) saveWidth(window.innerWidth - event.clientX); }}
          onPointerUp={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            saveWidth(event.key === "Home" ? 0 : event.key === "End" ? Infinity : width + (event.key === "ArrowLeft" ? 20 : -20));
          }} />}
        <div className="pointer-events-none absolute inset-x-4 top-4 z-30 flex items-center justify-between gap-2">
          <button ref={closeButton} type="button" className={buttonClass} onClick={onClose} aria-label="Cerrar ficha"><X size={20} /></button>
          <div className="flex items-center gap-2">
            <button type="button" className={buttonClass} onClick={() => onPlacementChange?.(right ? "center" : "right")} aria-label={right ? "Centrar ficha" : "Abrir ficha lateral"}>{right ? <PanelCenter size={20} /> : <PanelRight size={20} />}</button>
            {right && <>
              <button type="button" className={buttonClass} onClick={() => onDrawerViewChange(drawerView === "docked" ? "overlay" : "docked")} aria-label={drawerView === "docked" ? "Superponer panel" : "Acoplar panel"} aria-pressed={drawerView === "docked"}><Pin size={20} fill={drawerView === "docked" ? "currentColor" : "none"} /></button>
              <button type="button" className={buttonClass} onClick={() => onContentViewChange(phone ? "modal" : "mobile")} aria-label={phone ? "Vista amplia" : "Vista teléfono"} aria-pressed={phone}><Smartphone size={20} fill={phone ? "currentColor" : "none"} /></button>
            </>}
            <Link href={href} className={buttonClass} aria-label="Abrir página completa"><ArrowUpRight size={20} /></Link>
          </div>
        </div>
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[inherit]" aria-busy={loading}>
          {loading && <div role="status" className="pointer-events-none absolute inset-0 bg-[#101010]">
            <span className="sr-only">Cargando ficha…</span>
            <div className="absolute inset-0 motion-safe:animate-pulse bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900" style={{ maskImage: "linear-gradient(black 65%, transparent 100%)" }} />
          </div>}
          <iframe ref={frame} src={buildEmbeddedDetailsHref(href)} title={label}
            onLoad={() => {
              syncContentScale();
              // Error/not-found documents cannot emit hero-ready. Reveal their retry UI.
              const doc = frame.current?.contentDocument;
              if (doc && (!doc.querySelector('[data-embedded-details]') || doc.querySelector('[data-details-error]'))) setLoading(false);
            }}
            className={`relative h-full w-full border-0 transition-opacity duration-500 motion-reduce:transition-none ${loading ? "opacity-0" : "opacity-100"} ${dragging ? "pointer-events-none" : ""}`} />
        </div>
      </motion.section>
    </div>, document.body,
  );
}
