"use client";

// Vista lateral de una sección de la ficha con TODO su contenido en una lista
// de arriba abajo, como los paneles laterales de trakt.tv (personas, reseñas…).
// Se abre al pulsar el título de la sección (SectionTitle `onOpen`).
//
// Panel a la derecha (pantalla completa en el teléfono) con cabecera fija:
// título, pestañas opcionales, buscador opcional y cerrar. Entra deslizándose
// solo con `transform`: un fundido de opacidad sobre el panel lo convertiría en
// raíz de backdrop y aplanaría el cristal mientras dura (ver liquidGlass).

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

export default function SectionSheet({
  open,
  onClose,
  title,
  subtitle = null,
  icon: Icon = null,
  // [{ id, label, count? }]
  tabs = null,
  activeTab = null,
  onTabChange,
  // { value, onChange, placeholder }
  search = null,
  // Acción extra en la cabecera (p. ej. «Ver colección»).
  headerAction = null,
  // Control junto a las pestañas, en su misma fila (p. ej. «Más likes»).
  tabsAccessory = null,
  // Pie fijo bajo la lista (p. ej. «Cancelar / Guardar» de un editor).
  footer = null,
  // El panel puede ser un <form> (`as="form"` + `panelProps.onSubmit`).
  as: Panel = "div",
  panelProps = null,
  panelRef = null,
  // Mientras se guarda: ni la X ni el velo cierran.
  closeDisabled = false,
  children,
}) {
  const titleId = useId();
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  const close = () => {
    if (!closeDisabled) onClose?.();
  };
  // Bloquea el scroll de la ficha y cierra con Escape.
  useModalGuard({ open, onClose: close });

  if (!open || !portalReady) return null;

  return createPortal(
    <div
      data-detail-modal-layer=""
      className="fixed inset-0 z-[10000] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm sv-fade-in"
        onClick={close}
        aria-hidden="true"
      />

      <Panel
        {...panelProps}
        ref={panelRef}
        className={`relative flex h-full w-full flex-col overflow-hidden outline-none sm:w-[30rem] sm:rounded-l-[2rem] lg:w-[34rem] ${LIQUID_GLASS_PANEL} sv-sheet-in`}
      >
        <header className={`shrink-0 ${LIQUID_GLASS_MODAL_HEADER} px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6`}>
          <div className="flex items-start gap-3">
            {Icon ? (
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10 text-yellow-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-xl font-black leading-tight text-white">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs font-bold text-zinc-400">{subtitle}</p>
              ) : null}
            </div>
            {headerAction}
            <button
              type="button"
              onClick={close}
              disabled={closeDisabled}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {Array.isArray(tabs) && tabs.length > 1 ? (
            <div className="mt-4 flex items-stretch gap-2">
            <div
              role="tablist"
              aria-label={title}
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-black/20 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {tabs.map((tab) => {
                const active = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange?.(tab.id)}
                    className={`flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition ${
                      active ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {tab.label}
                    {typeof tab.count === "number" ? (
                      <span className={active ? "text-yellow-400" : "text-zinc-500"}>{tab.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {tabsAccessory}
            </div>
          ) : null}

          {search ? (
            <label className="mt-3 flex min-h-11 items-center gap-2.5 rounded-xl bg-black/25 px-3.5 text-zinc-400 focus-within:ring-2 focus-within:ring-yellow-400/50">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder || "Buscar…"}
                aria-label={search.placeholder || "Buscar"}
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
            </label>
          ) : null}
        </header>

        <div className="details-sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-white/5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </Panel>
    </div>,
    document.body,
  );
}

/** Mensaje de lista vacía o sin resultados. */
export function SectionSheetEmpty({ children }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm font-bold text-zinc-500">
      {children}
    </p>
  );
}

/** Cabecera de grupo dentro de la lista (p. ej. un departamento del equipo). */
export function SectionSheetGroupTitle({ title, count = null }) {
  return (
    <div className="mb-3 flex items-center gap-3 px-1 py-2">
      <h3 className="min-w-0 text-xs font-bold tracking-wide text-zinc-200">{title}</h3>
      {count != null ? (
        <span className="inline-flex min-h-5 min-w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[11px] font-semibold tabular-nums leading-none text-zinc-300 ring-1 ring-inset ring-white/[0.08]">
          {count}
        </span>
      ) : null}
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-white/[0.08]" />
    </div>
  );
}
