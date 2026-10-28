"use client";

// /src/components/ui/MobileOptionsSheet.jsx
// Hoja inferior con los filtros, el orden, la agrupación, los modos de vista y
// las acciones de una página en MÓVIL. Sustituye al desplegable en el sitio
// (MobileFiltersPanel) en las páginas: el botón de la barra abre esta hoja.
//
// POR QUÉ ASÍ:
//   - Mismo acabado que los demás modales (LIQUID_GLASS_PANEL sobre un velo
//     desenfocado) y entrada desde abajo SOLO con `transform`: un fundido de
//     opacidad sobre el panel lo convertiría en raíz de backdrop y aplanaría su
//     cristal mientras dura (ver liquidGlass).
//   - Dentro no hay desplegables: cada grupo enseña todas sus opciones como
//     píldoras. Las páginas siguen escribiendo sus menús con su `InlineDropdown`
//     / `DropdownItem` de siempre; dentro de la hoja (`useInOptionsSheet`) esos
//     componentes se pintan como `SheetOptionGroup` / `SheetOption`.
//   - Se cierra con la X, tocando el velo, con Escape o arrastrando la cabecera
//     hacia abajo. Al elegir una opción NO se cierra: se ve el resultado detrás
//     y se pueden combinar varios filtros.
//   - Mientras está abierta, la página de debajo deja de componer su cristal
//     (`data-sv-sheet-open`, globals.css): el velo ya la desenfoca y así cada
//     toque dentro de la hoja no reorganiza las capas de toda la página.

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, SlidersHorizontal, X } from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

export const MOBILE_OPTIONS_SHEET_EXIT_MS = 220;
// Arrastre que cierra la hoja (px hacia abajo), o un gesto rápido.
const DRAG_CLOSE_DISTANCE = 96;
const DRAG_CLOSE_VELOCITY = 0.6;

// Acento de la página: color del icono de cada grupo y de la marca ✓.
const ACCENTS = {
  red: "text-red-400",
  blue: "text-blue-400",
  sky: "text-sky-400",
  emerald: "text-emerald-400",
  yellow: "text-yellow-400",
  amber: "text-amber-400",
  orange: "text-orange-400",
  purple: "text-purple-400",
  indigo: "text-indigo-400",
  pink: "text-pink-400",
  cyan: "text-cyan-400",
  zinc: "text-zinc-300",
};

const OptionsSheetContext = createContext(null);

// ¿Se está pintando dentro de la hoja? Los desplegables de las páginas lo
// consultan para pintarse como grupo de píldoras en vez de como desplegable.
export function useInOptionsSheet() {
  return useContext(OptionsSheetContext) !== null;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export default function MobileOptionsSheet({
  open,
  onClose,
  title = "Filtros y vista",
  subtitle = null,
  icon: Icon = SlidersHorizontal,
  accent = "zinc",
  id,
  // "screen": a todo el ancho (páginas, en móvil). "sectionSheet": encima de
  // una vista lateral (SectionSheet), que desde 640px es un panel a la
  // derecha: la hoja sube dentro de su ancho en vez de cruzar la pantalla.
  placement = "screen",
  children,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [portalReady, setPortalReady] = useState(false);
  const [present, setPresent] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setPortalReady(true), []);

  // Montada mientras está abierta o saliendo.
  useEffect(() => {
    if (open) {
      setPresent(true);
      setClosing(false);
      setDragOffset(0);
      return undefined;
    }
    if (!present) return undefined;
    setClosing(true);
    const timer = window.setTimeout(
      () => {
        setPresent(false);
        setClosing(false);
        setDragOffset(0);
      },
      prefersReducedMotion() ? 0 : MOBILE_OPTIONS_SHEET_EXIT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, present]);

  useModalGuard({ open, onClose });

  // Si ya lo puso la vista lateral de debajo, es suyo: al cerrar la hoja no se
  // quita.
  useEffect(() => {
    if (!open) return undefined;
    const root = document.documentElement;
    if (root.hasAttribute("data-sv-sheet-open")) return undefined;
    root.setAttribute("data-sv-sheet-open", "");
    return () => root.removeAttribute("data-sv-sheet-open");
  }, [open]);

  // Foco al panel al abrir (lectores de pantalla y Escape).
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open, present]);

  if (!present || !portalReady) return null;

  const onDragStart = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { y: event.clientY, t: performance.now(), id: event.pointerId };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onDragMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    setDragOffset(Math.max(0, event.clientY - drag.y));
  };
  const onDragEnd = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const distance = Math.max(0, event.clientY - drag.y);
    const velocity = distance / Math.max(1, performance.now() - drag.t);
    if (distance > DRAG_CLOSE_DISTANCE || (distance > 24 && velocity > DRAG_CLOSE_VELOCITY)) {
      onClose?.();
    } else {
      setDragOffset(0);
    }
  };

  return createPortal(
    <div
      data-detail-modal-layer=""
      // Para los cierres «al pulsar fuera» de la página: la hoja va en un
      // portal, fuera de su contenedor, y no cuenta como fuera.
      data-mobile-options-sheet=""
      className="fixed inset-0 z-[10000] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      id={id}
      inert={closing || undefined}
    >
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-sm ${closing ? "sv-fade-out" : "sv-fade-in"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex max-h-[min(85dvh,44rem)] w-full flex-col overflow-hidden rounded-t-[2rem] outline-none ${
          placement === "sectionSheet" ? "sm:ml-auto sm:w-[30rem] sm:rounded-bl-[2rem] lg:w-[34rem]" : ""
        } ${LIQUID_GLASS_PANEL} ${
          closing ? "sv-options-sheet-out" : "sv-options-sheet-in"
        }`}
        style={
          dragOffset
            ? {
                transform: `translate3d(0, ${dragOffset}px, 0)`,
                transition: dragging ? "none" : "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)",
              }
            : undefined
        }
      >
        {/* Cabecera: asa + título + cerrar. Se arrastra hacia abajo para
            cerrar (solo aquí, para no pelear con el scroll del contenido). */}
        <header
          className={`shrink-0 touch-none select-none px-5 pb-3 pt-2.5 ${LIQUID_GLASS_MODAL_HEADER}`}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-center gap-3">
            {Icon ? (
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] ${ACCENTS[accent] || ACCENTS.zinc}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-lg font-black leading-tight text-white">
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs font-bold text-zinc-400">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <OptionsSheetContext.Provider value={accent}>
            <div className="space-y-5">{children}</div>
          </OptionsSheetContext.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Grupo con título (icono + etiqueta) y sus opciones como píldoras: en filas
// (`wrap`), una debajo de otra (`stack`), a mitades (`grid`) o en una sola fila
// deslizable (`scroll`). `children`
// puede ser la función de render de un desplegable (`({ close }) => …`): dentro
// de la hoja elegir una opción no la cierra, así que `close` no hace nada.
const noop = () => {};

export function SheetOptionGroup({ label, icon: Icon, children, layout = "wrap", className = "" }) {
  const accent = useContext(OptionsSheetContext);
  const content = typeof children === "function" ? children({ close: noop }) : children;
  return (
    <section className={className}>
      {label ? (
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          {Icon ? <Icon className={`h-3.5 w-3.5 ${ACCENTS[accent] || ACCENTS.zinc}`} aria-hidden="true" /> : null}
          {label}
        </h3>
      ) : null}
      <div
        className={
          layout === "stack"
            ? "flex flex-col gap-2"
            : layout === "grid"
              ? "grid grid-cols-2 gap-2"
              : layout === "scroll"
                ? // Listas largas (p. ej. años): una fila que se desliza de
                  // borde a borde de la hoja en vez de decenas de filas.
                  "-mx-5 flex gap-2 overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
                : "flex flex-wrap gap-2"
        }
      >
        {content}
      </div>
    </section>
  );
}

// Una opción: píldora de cristal; la elegida, en blanco con su marca.
export function SheetOption({ active, onClick, children, icon: Icon, disabled = false, className = "" }) {
  const accent = useContext(OptionsSheetContext);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active ? "true" : "false"}
      className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 ${
        active
          ? "bg-white text-zinc-950 shadow-lg"
          : "bg-gradient-to-br from-white/10 to-white/5 text-zinc-200 shadow-lg hover:from-white/15 hover:to-white/10"
      } ${className}`}
    >
      {Icon ? (
        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-zinc-950" : ACCENTS[accent] || ACCENTS.zinc}`} aria-hidden="true" />
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
      {active && !Icon ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}

// Subtítulo dentro de un grupo (p. ej. «Subagrupación» bajo «Agrupar»): ocupa
// la fila entera, así que las píldoras siguientes empiezan debajo.
export function SheetOptionBreak({ label }) {
  return (
    <div className="w-full pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
      {label}
    </div>
  );
}

// Acción de la página (p. ej. «Volver a hoy», «Exportar»): botón de cristal a
// todo el ancho, en el grupo «Acciones» al final de la hoja (layout="stack").
export function SheetAction({ icon: Icon, children, onClick, disabled = false, tone = "default", className = "" }) {
  const accent = useContext(OptionsSheetContext);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-left text-sm font-bold shadow-lg transition hover:from-white/15 hover:to-white/10 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 ${
        tone === "danger" ? "text-red-300" : "text-zinc-100"
      } ${className}`}
    >
      {Icon ? (
        <Icon className={`h-4 w-4 shrink-0 ${tone === "danger" ? "text-red-400" : ACCENTS[accent] || ACCENTS.zinc}`} aria-hidden="true" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}
