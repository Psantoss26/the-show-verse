"use client";

// Vista lateral de una sección de la ficha con TODO su contenido en una lista
// de arriba abajo, como los paneles laterales de trakt.tv (personas, reseñas…).
// Se abre al pulsar el título de la sección (SectionTitle `onOpen`).
//
// Panel a la derecha (pantalla completa en el teléfono) con cabecera fija:
// título, pestañas opcionales, buscador opcional y cerrar. Entra deslizándose
// solo con `transform`: un fundido de opacidad sobre el panel lo convertiría en
// raíz de backdrop y aplanaría el cristal mientras dura (ver liquidGlass).

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import { placeTabPill } from "@/lib/details/artworkRowTransition";

// Superficie de los controles del panel (barra de pestañas, buscador, botones
// de filtros): la misma de cristal que los desplegables de filtros
// (CreditFilterControls, receta de las páginas de usuario), para que todos
// los controles de la cabecera se vean iguales. 44px de alto todos.
export const SHEET_CONTROL =
  "rounded-2xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg";

// Acento del panel: amarillo en las fichas de títulos, verde en la de un actor
// y rosa en Social (el panel de una persona en Hoy).
const SHEET_ACCENTS = {
  yellow: {
    iconBox: "bg-yellow-500/10 text-yellow-400",
    count: "text-yellow-400",
    focus: "focus-visible:outline-yellow-400",
    searchRing: "focus-within:ring-yellow-400/50",
  },
  emerald: {
    iconBox: "bg-emerald-500/10 text-emerald-400",
    count: "text-emerald-400",
    focus: "focus-visible:outline-emerald-400",
    searchRing: "focus-within:ring-emerald-400/50",
  },
  pink: {
    iconBox: "bg-pink-500/10 text-pink-400",
    count: "text-pink-400",
    focus: "focus-visible:outline-pink-400",
    searchRing: "focus-within:ring-pink-400/50",
  },
};

export default function SectionSheet({
  open,
  onClose,
  title,
  subtitle = null,
  icon: Icon = null,
  // En lugar del icono, un elemento propio a la izquierda del título (p. ej.
  // la foto de perfil de una persona).
  leading = null,
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
  // Pestañas que no caben en la fila: en vez de desplazarse de lado, las del
  // final se juntan en una pestaña `{ id, label }` (p. ej. «Otros» en los
  // tipos de vídeo). `onTabsOverflowChange(ids)` recibe las que quedan dentro.
  tabsOverflow = null,
  onTabsOverflowChange,
  // Pie fijo bajo la lista (p. ej. «Cancelar / Guardar» de un editor).
  footer = null,
  // Control a la derecha del buscador, en su misma fila (p. ej. el botón que
  // despliega los filtros).
  searchAccessory = null,
  // Fila de controles bajo el buscador, en la cabecera fija (p. ej. los
  // filtros de orden y años de los créditos de un actor). Si es un
  // desplegable, lo anima quien lo pasa (MobileFiltersPanel).
  toolbar = null,
  // El panel puede ser un <form> (`as="form"` + `panelProps.onSubmit`).
  as: Panel = "div",
  panelProps = null,
  panelRef = null,
  // Mientras se guarda: ni la X ni el velo cierran.
  closeDisabled = false,
  accent = "yellow",
  children,
}) {
  const tone = SHEET_ACCENTS[accent] || SHEET_ACCENTS.yellow;
  const titleId = useId();
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  const { tabsEl, tabsRef, measureRef, shownTabs, isTabActive } = useOverflowTabs({
    tabs,
    activeTab,
    overflow: tabsOverflow,
    onOverflowChange: onTabsOverflowChange,
  });
  const pillRef = useTabPill(
    tabsEl,
    `${activeTab ?? ""}\u0000${shownTabs.map((tab) => tab.id).join("\u0000")}`,
  );
  const close = () => {
    if (!closeDisabled) onClose?.();
  };
  // Bloquea el scroll de la ficha y cierra con Escape.
  useModalGuard({ open, onClose: close });
  // Marca la vista lateral abierta: en móvil, mientras tapa toda la pantalla,
  // la ficha de debajo deja de componer su cristal (`data-sv-sheet-open` en
  // globals.css). Sin esto, cada toque dentro del panel reorganizaba ~300
  // capas de la página tapada y en el móvil parpadeaba la pantalla entera.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute("data-sv-sheet-open", "");
    return () => root.removeAttribute("data-sv-sheet-open");
  }, [open]);

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
            {leading ? (
              <span className="mt-0.5 shrink-0">{leading}</span>
            ) : Icon ? (
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.iconBox}`}>
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
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.focus} disabled:opacity-50`}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {Array.isArray(tabs) && tabs.length > 1 ? (
            <div className="mt-4 flex items-stretch gap-2">
            {measureRef ? (
              // Copia invisible de TODAS las pestañas (y la de agrupar) a su
              // ancho natural, para saber cuántas caben.
              <div aria-hidden="true" className="pointer-events-none invisible absolute h-0 w-0 overflow-hidden">
                <div ref={measureRef} className="flex w-max gap-1">
                  {[...tabs, { id: tabsOverflow.id, label: tabsOverflow.label, count: overflowCountHint(tabs) }].map((tab) => (
                    <span key={tab.id} className="flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-xs font-bold">
                      {tab.label}
                      {typeof tab.count === "number" ? <span>{tab.count}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              ref={tabsRef}
              role="tablist"
              aria-label={title}
              className={`relative flex min-w-0 flex-1 gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${SHEET_CONTROL}`}
            >
              {/* Pastilla de la pestaña activa: se desliza entre pestañas
                  (solo transform y ancho; ver `useTabPill`). */}
              <span
                ref={pillRef}
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-1 bottom-1 rounded-xl bg-white/15 opacity-0 transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              />
              {shownTabs.map((tab) => {
                const active = isTabActive(tab);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTabChange?.(tab.id)}
                    className={`relative flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-bold transition-colors duration-300 ${
                      active ? "text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {tab.label}
                    {typeof tab.count === "number" ? (
                      <span className={active ? tone.count : "text-zinc-500"}>{tab.count}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {tabsAccessory}
            </div>
          ) : null}

          {search ? (
            <div className="mt-3 flex items-stretch gap-2">
            <label className={`flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-3.5 text-zinc-400 focus-within:ring-2 ${SHEET_CONTROL} ${tone.searchRing}`}>
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
            {searchAccessory}
            </div>
          ) : searchAccessory ? (
            <div className="mt-3 flex justify-end">{searchAccessory}</div>
          ) : null}

          {toolbar}
        </header>

        {/* `will-change-transform`: al desplegar la fila de filtros de la
            cabecera (MobileFiltersPanel anima su altura) esta zona baja en cada
            fotograma. Sin capa propia se volvía a pintar entera en cada uno
            (~2.200 imágenes pintadas por despliegue en «Portadas y fondos») y
            en el móvil las tarjetas parpadeaban; con ella solo se desplaza.
            No aplana el cristal: eso lo hace `opacity`, no `transform`. */}
        <div className="details-sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,var(--sv-safe-bottom,0px))] pt-1 will-change-transform sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-white/5 px-4 pb-[max(1rem,var(--sv-safe-bottom,0px))] pt-4 sm:px-6">
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

const TABS_GAP = 4; // gap-1
const TABS_PADDING = 8; // p-1 a cada lado

// Número más largo que puede llevar la pestaña de agrupar: la suma de todas
// menos la primera (que nunca se agrupa).
function overflowCountHint(tabs) {
  if (!tabs.slice(1).every((tab) => typeof tab.count === "number")) return undefined;
  return tabs.slice(1).reduce((sum, tab) => sum + tab.count, 0);
}

// Cuántas pestañas caben en la fila: mide la copia invisible y, si no caben
// todas, deja las primeras que quepan junto a la pestaña de agrupar (que suma
// sus números y sale activa si la elegida está dentro).
function useOverflowTabs({ tabs, activeTab, overflow, onOverflowChange }) {
  // Refs de callback: el panel se monta en un portal después del primer
  // render, y la medición tiene que empezar cuando existan los nodos.
  const [tabsEl, tabsRef] = useState(null);
  const [measureEl, measureRef] = useState(null);
  const enabled = Boolean(overflow && Array.isArray(tabs) && tabs.length > 2);
  const [visibleCount, setVisibleCount] = useState(null);
  const tabCount = Array.isArray(tabs) ? tabs.length : 0;

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const container = tabsEl;
    const row = measureEl;
    if (!container || !row) return undefined;
    const fit = () => {
      const widths = [...row.children].map((child) => child.getBoundingClientRect().width);
      const overflowWidth = widths.pop();
      const available = container.clientWidth - TABS_PADDING;
      const span = (count) =>
        widths.slice(0, count).reduce((sum, width) => sum + width, 0) + TABS_GAP * (count - 1);
      let count = widths.length;
      if (span(count) > available) {
        count = widths.length - 1;
        while (count > 1 && span(count) + TABS_GAP + overflowWidth > available) count -= 1;
      }
      setVisibleCount(count >= widths.length ? null : count);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    observer.observe(row);
    return () => observer.disconnect();
  }, [enabled, tabCount, tabsEl, measureEl]);

  const folded = enabled && visibleCount != null ? tabs.slice(visibleCount) : [];
  const foldedKey = folded.map((tab) => tab.id).join("\u0000");
  useEffect(() => {
    if (enabled) onOverflowChange?.(foldedKey ? foldedKey.split("\u0000") : []);
    // `foldedKey` resume `folded`: las pestañas llegan nuevas en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, foldedKey]);

  if (!enabled) {
    return {
      tabsEl,
      tabsRef,
      measureRef: null,
      shownTabs: Array.isArray(tabs) ? tabs : [],
      isTabActive: (tab) => tab.id === activeTab,
    };
  }

  const foldedIds = new Set(folded.map((tab) => tab.id));
  const foldedCounts = folded.map((tab) => tab.count);
  const shownTabs = folded.length
    ? [
        ...tabs.slice(0, visibleCount),
        {
          id: overflow.id,
          label: overflow.label,
          count: foldedCounts.every((count) => typeof count === "number")
            ? foldedCounts.reduce((sum, count) => sum + count, 0)
            : undefined,
        },
      ]
    : tabs;
  const isTabActive = (tab) =>
    tab.id === activeTab || (tab.id === overflow.id && foldedIds.has(activeTab));
  return { tabsEl, tabsRef, measureRef, shownTabs, isTabActive };
}

// Coloca la pastilla de la pestaña activa bajo su botón: se desliza al cambiar
// de pestaña y, si la nueva queda fuera de la barra (se desplaza de lado),
// la trae a la vista. Al abrir y al cambiar de tamaño, sin animar.
function useTabPill(tabsEl, activeKey) {
  const [pillEl, pillRef] = useState(null);
  const placedRef = useRef(false);
  useLayoutEffect(() => {
    if (!tabsEl || !pillEl) return;
    const button = tabsEl.querySelector('[role="tab"][aria-selected="true"]');
    const animate = placedRef.current;
    placeTabPill(pillEl, button, { animate });
    if (!button?.offsetWidth) return;
    if (animate) button.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
    placedRef.current = true;
  }, [tabsEl, pillEl, activeKey]);
  useEffect(() => {
    if (!tabsEl || !pillEl || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      placeTabPill(pillEl, tabsEl.querySelector('[role="tab"][aria-selected="true"]'), { animate: false });
    });
    observer.observe(tabsEl);
    return () => observer.disconnect();
  }, [tabsEl, pillEl]);
  return pillRef;
}
