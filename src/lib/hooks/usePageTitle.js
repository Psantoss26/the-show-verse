"use client";

import { useEffect } from "react";
import { pageTitleRegistry } from "@/lib/navigation/documentTitle";
import { formatPageTitle } from "@/lib/pageTitle";

// Título de la pestaña mientras el componente esté montado y visible. Usar
// SIEMPRE esto en vez de `document.title = …`: ver lib/navigation/documentTitle.js.
// `title` sin el sufijo del sitio (se añade aquí, igual que la plantilla de la
// metadata del layout raíz). Vacío = no registra nada (manda el de Next).

let headObserver = null;

function watchHead() {
  if (headObserver || typeof MutationObserver === "undefined" || !document.head) return;
  // Next/React pueden insertar un <title> nuevo delante del nuestro (metadata
  // que llega en streaming): se recupera el primer puesto. apply() no hace
  // nada si ya lo tiene, así que su propia inserción no entra en bucle.
  headObserver = new MutationObserver(() => pageTitleRegistry.apply());
  headObserver.observe(document.head, { childList: true });
}

export function usePageTitle(title) {
  const clean = String(title ?? "").trim();
  const fullTitle = clean ? formatPageTitle(clean) : "";

  useEffect(() => {
    if (!fullTitle) return undefined;
    watchHead();
    return pageTitleRegistry.register(fullTitle);
  }, [fullTitle]);
}
