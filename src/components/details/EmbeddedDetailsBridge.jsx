"use client";

import { useEffect } from "react";
import { sendEmbeddedDetailsAction } from "@/lib/navigation/embeddedDetails";
import { createSubrouteLinkIntent } from "@/lib/navigation/subroutePrefetch";

// Desplazamiento (px) a partir del cual pulsar y mover es ARRASTRAR, no pulsar.
const DRAG_THRESHOLD_PX = 6;

// Fila con scroll horizontal nativo que contiene el elemento (no Swiper: ese
// arrastra solo).
function horizontalScroller(target) {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.classList?.contains("swiper")) return null;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const { overflowX } = getComputedStyle(el);
    if (overflowX === "auto" || overflowX === "scroll") return el;
  }
  return null;
}

// Desplazamiento (px) a partir del cual soltar una fila nativa pasa a la
// tarjeta siguiente/anterior en vez de volver a la actual.
const SWIPE_THRESHOLD_PX = 40;

// Al soltar, la fila va a la tarjeta en la dirección del gesto (como al
// deslizar un carrusel): con el imán obligatorio, devolverle el imán a mitad
// de una tarjeta la llevaba a la MÁS CERCANA, casi siempre la de partida.
function settleScroller(scroller, startScroll, dx, snap) {
  const rect = scroller.getBoundingClientRect();
  const stops = [...scroller.children]
    .map((child) => scroller.scrollLeft + child.getBoundingClientRect().left - rect.left)
    .filter((left, index, all) => index === 0 || left !== all[index - 1]);
  const restore = () => {
    scroller.style.scrollSnapType = snap;
  };
  if (stops.length === 0) {
    restore();
    return;
  }
  let current = 0;
  stops.forEach((left, index) => {
    if (Math.abs(left - startScroll) < Math.abs(stops[current] - startScroll)) current = index;
  });
  const step = dx <= -SWIPE_THRESHOLD_PX ? 1 : dx >= SWIPE_THRESHOLD_PX ? -1 : 0;
  const target = stops[Math.max(0, Math.min(stops.length - 1, current + step))];
  const max = scroller.scrollWidth - scroller.clientWidth;
  scroller.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: "smooth" });
  // El imán vuelve cuando la fila ya está en su sitio (si no, corta el
  // desplazamiento suave a medio camino).
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    scroller.removeEventListener("scrollend", finish);
    restore();
  };
  scroller.addEventListener("scrollend", finish, { once: true });
  window.setTimeout(finish, 600);
}

// La ficha mantiene su propio scroll y sus media queries. Las navegaciones
// salen al documento principal para no añadir entradas al historial del iframe.
//
// FILAS CON EL RATÓN. En el panel se usa con ratón, no con el dedo:
//   - Pulsar y mover es ARRASTRAR la fila, nunca pulsar la tarjeta. Este
//     puente escucha los clics en la fase de CAPTURA (antes que Next y que
//     Swiper) para sacar la navegación al documento principal; sin esto, un
//     arrastre que empezaba y acababa en la misma tarjeta llegaba como clic y
//     abría su ficha completa antes de que Swiper pudiera cancelarlo.
//   - Las filas con scroll nativo (los episodios de la ficha de episodio) no
//     se podían arrastrar: el ratón cogía el enlace o la imagen y la fila no se
//     movía. Aquí se desplazan arrastrando, como las de Swiper.
export default function EmbeddedDetailsBridge() {
  useEffect(() => {
    sendEmbeddedDetailsAction("content-ready");

    let press = null;
    let suppressClick = false;

    const onPointerDown = (event) => {
      suppressClick = false;
      if (event.pointerType !== "mouse" || event.button !== 0) {
        press = null;
        return;
      }
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        scroller: horizontalScroller(event.target),
        startScroll: 0,
        snap: "",
      };
      if (press.scroller) press.startScroll = press.scroller.scrollLeft;
    };

    const onPointerMove = (event) => {
      if (!press || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!press.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        press.dragging = true;
        // Fila nativa: solo si el gesto es horizontal; en vertical el ratón
        // sigue seleccionando/desplazando como siempre.
        if (press.scroller && Math.abs(dx) > Math.abs(dy)) {
          const scroller = press.scroller;
          // Sin imán mientras se arrastra (si no, cada píxel salta a la
          // tarjeta más cercana); al soltar vuelve y la fila se asienta.
          press.snap = scroller.style.scrollSnapType;
          scroller.style.scrollSnapType = "none";
          scroller.style.cursor = "grabbing";
          scroller.setPointerCapture?.(event.pointerId);
        } else {
          press.scroller = null;
        }
      }
      if (press.scroller) {
        press.scroller.scrollLeft = press.startScroll - dx;
        event.preventDefault();
      }
    };

    const endPress = (event) => {
      if (!press || (event && event.pointerId !== press.id)) return;
      if (press.dragging) suppressClick = true;
      const scroller = press.dragging ? press.scroller : null;
      if (scroller) {
        if (scroller.hasPointerCapture?.(press.id)) scroller.releasePointerCapture(press.id);
        scroller.style.cursor = "";
        const dx = event ? event.clientX - press.x : 0;
        settleScroller(scroller, press.startScroll, dx, press.snap);
      }
      press = null;
    };

    // Ni enlaces ni imágenes se arrastran como objetos dentro de una fila: el
    // gesto es para desplazarla.
    const onDragStart = (event) => {
      if (horizontalScroller(event.target) || event.target.closest?.(".swiper")) event.preventDefault();
    };

    const onClick = (event) => {
      // El clic que cierra un arrastre no pulsa nada.
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // La PORTADA abre la ficha completa, como el arte del panel de títulos
      // (DetailModal): el panel lo hace con su transición. Lo interactivo que
      // haya encima (enlaces, botones) sigue a lo suyo.
      if (
        event.target.closest?.("[data-mobile-cover-spacer]") &&
        !event.target.closest?.('a, button, input, select, textarea, label, [role="button"]')
      ) {
        event.preventDefault();
        event.stopPropagation();
        sendEmbeddedDetailsAction("open-full");
        return;
      }
      const link = event.target.closest?.("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin || url.hash && url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      sendEmbeddedDetailsAction("navigate", url.href);
    };
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Los diálogos de la ficha tienen prioridad sobre el cierre del panel.
      if (document.querySelector('[role="dialog"], dialog[open]') || document.body.style.overflow === "hidden") return;
      sendEmbeddedDetailsAction("close");
    };
    const onListChanged = (event) => sendEmbeddedDetailsAction("list-changed", undefined, event.detail);
    // Apuntar a otra temporada/episodio precarga el panel al que llevará (la
    // caché del navegador es la misma para el iframe nuevo).
    const intent = createSubrouteLinkIntent();
    document.addEventListener("pointerover", intent.onPointerOver, true);
    document.addEventListener("pointerout", intent.onPointerOut, true);
    document.addEventListener("focusin", intent.onFocusIn, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", endPress, true);
    document.addEventListener("pointercancel", endPress, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("showverse:list-changed", onListChanged);
    return () => {
      intent.dispose();
      document.removeEventListener("pointerover", intent.onPointerOver, true);
      document.removeEventListener("pointerout", intent.onPointerOut, true);
      document.removeEventListener("focusin", intent.onFocusIn, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", endPress, true);
      document.removeEventListener("pointercancel", endPress, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("showverse:list-changed", onListChanged);
    };
  }, []);

  return null;
}
