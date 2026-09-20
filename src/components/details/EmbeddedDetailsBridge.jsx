"use client";

import { useEffect } from "react";
import { sendEmbeddedDetailsAction } from "@/lib/navigation/embeddedDetails";

// La ficha mantiene su propio scroll y sus media queries. Las navegaciones
// salen al documento principal para no añadir entradas al historial del iframe.
export default function EmbeddedDetailsBridge() {
  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
    document.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("showverse:list-changed", onListChanged);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("showverse:list-changed", onListChanged);
    };
  }, []);

  return null;
}
