"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookmarkMinus, BookmarkPlus, Heart, HeartOff, X } from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_PANEL, LIQUID_GLASS_MODAL_HEADER } from "@/lib/ui/liquidGlass";

// Textos y colores por tipo. El color es el del botón de la fila de acciones:
// rojo para favoritos y azul para pendientes (`activeColor` de LiquidButton).
const KINDS = {
  favorite: {
    addTitle: "Añadir a favoritos",
    removeTitle: "Quitar de favoritos",
    addText: (subject) => `¿Quieres añadir ${subject} a tus favoritos?`,
    removeText: (subject) => `¿Quieres quitar ${subject} de tus favoritos?`,
    AddIcon: Heart,
    RemoveIcon: HeartOff,
    iconClass: "bg-red-500/15 text-red-300",
    confirmClass:
      "bg-red-500/85 bg-gradient-to-b from-red-400/90 to-red-600/90 shadow-[0_0_18px_rgba(239,68,68,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)] hover:from-red-400 hover:to-red-500 focus-visible:outline-red-300",
  },
  watchlist: {
    addTitle: "Añadir a pendientes",
    removeTitle: "Quitar de pendientes",
    addText: (subject) => `¿Quieres añadir ${subject} a tu lista de pendientes?`,
    removeText: (subject) => `¿Quieres quitar ${subject} de tu lista de pendientes?`,
    AddIcon: BookmarkPlus,
    RemoveIcon: BookmarkMinus,
    iconClass: "bg-blue-500/15 text-blue-300",
    confirmClass:
      "bg-blue-500/85 bg-gradient-to-b from-blue-400/90 to-blue-600/90 shadow-[0_0_18px_rgba(59,130,246,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)] hover:from-blue-400 hover:to-blue-500 focus-visible:outline-blue-300",
  },
};

/**
 * Confirmación de los botones de FAVORITO y PENDIENTE de las fichas (fila de
 * acciones de DetailsClient y DetailModal, y el favorito de listas, colecciones
 * y actores). Mismo diseño que los modales de acción de la ficha
 * (ExternalLinksModal, AddToListModal…): velo oscurecido y desenfocado, panel de
 * cristal líquido `rounded-[2rem]` y cabecera de cristal.
 *
 * `kind`: "favorite" | "watchlist". `active`: el título YA está en la lista, así
 * que confirmar lo quita. `itemTitle` (opcional) va bajo el encabezado y
 * `subject` nombra lo que se marca en el texto («este título», «esta lista»…).
 */
export default function ListToggleConfirmModal({
  open,
  kind = "favorite",
  active = false,
  itemTitle = "",
  subject = "este título",
  onConfirm,
  onClose,
}) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  useModalGuard({ open, onClose });

  if (!open || !portalReady) return null;

  const config = KINDS[kind] || KINDS.favorite;
  const Icon = active ? config.RemoveIcon : config.AddIcon;
  const title = active ? config.removeTitle : config.addTitle;
  const text = (active ? config.removeText : config.addText)(subject);
  const titleId = `list-toggle-confirm-title-${kind}`;
  const textId = `list-toggle-confirm-text-${kind}`;

  return createPortal(
    // `data-detail-modal-layer`: el cierre por clic fuera de DetailModal y del
    // panel lateral ignora esta capa. El clic tampoco sube por el árbol de React
    // hasta la tarjeta o la ficha que contiene el botón.
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className={`relative flex w-full max-w-sm flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
      >
        <div className={`flex w-full shrink-0 items-center justify-between gap-3 ${LIQUID_GLASS_MODAL_HEADER} p-6`}>
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] ${config.iconClass}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-xl font-black text-transparent"
              >
                {title}
              </h2>
              {itemTitle ? (
                <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {itemTitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          <p id={textId} className="text-sm leading-relaxed text-zinc-300">
            {text}
          </p>

          <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-white/[0.08] bg-gradient-to-b from-white/[0.16] to-white/[0.04] py-3 text-xs font-bold uppercase tracking-wide text-white/90 shadow-sm backdrop-blur-xl transition hover:bg-white/[0.14] hover:text-white active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-online-only="true"
              onClick={onConfirm}
              autoFocus
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold uppercase tracking-wide text-white transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${config.confirmClass}`}
            >
              {active ? "Quitar" : "Añadir"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
