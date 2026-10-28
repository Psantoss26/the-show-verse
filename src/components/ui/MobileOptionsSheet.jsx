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
  // Capa de la hoja: por encima de un modal con z mayor (p. ej. el de
  // episodios vistos) hay que subirla.
  layerClassName = "z-[10000]",
  // `data-sv-sheet-open` apaga el cristal de los hijos de <body> que no son
  // capas de modal: debajo de un modal pintado dentro de la página (no en un
  // portal) le quitaría el suyo, así que ahí se desactiva.
  pausePageBelow = true,
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
    if (!open || !pausePageBelow) return undefined;
    const root = document.documentElement;
    if (root.hasAttribute("data-sv-sheet-open")) return undefined;
    root.setAttribute("data-sv-sheet-open", "");
    return () => root.removeAttribute("data-sv-sheet-open");
  }, [open, pausePageBelow]);

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
      className={`fixed inset-0 ${layerClassName} flex flex-col justify-end`}
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,calc(var(--sv-safe-bottom,0px)+1rem))] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <OptionsSheetContext.Provider value={accent}>
            <div className="space-y-5">{children}</div>
          </OptionsSheetContext.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Fila deslizable de las listas largas (p. ej. años), de borde a borde de la
// hoja en vez de decenas de filas. En el móvil se desliza con el dedo; con
// ratón no había forma (sin barra y la rueda solo va en vertical), así que:
//   - la rueda vertical la mueve en horizontal mientras le quede recorrido en
//     ese sentido; al llegar al final, la rueda vuelve a mover la hoja;
//   - se puede arrastrar con el ratón, y el clic que cierra un arrastre no
//     elige la píldora en la que se suelta.
const DRAG_SCROLL_THRESHOLD = 5;

function SheetScrollRow({ children }) {
  const rowRef = useRef(null);
  const dragRef = useRef(null);

  // `wheel` con `passive: false` (el de React es pasivo y no deja anularlo).
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const onWheel = (event) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const canMove = delta > 0 ? row.scrollLeft < max - 1 : row.scrollLeft > 0;
      if (!canMove) return;
      event.preventDefault();
      row.scrollLeft += delta;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = { x: event.clientX, left: rowRef.current.scrollLeft, moved: false, id: event.pointerId };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_SCROLL_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      rowRef.current.setPointerCapture?.(event.pointerId);
    }
    rowRef.current.scrollLeft = drag.left - dx;
  };
  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    // El clic llega justo después del pointerup: se marca para descartarlo.
    // Si se suelta fuera no hay clic, y la marca caduca para no comerse el
    // siguiente.
    if (drag.moved) {
      const marker = { suppressClick: true };
      dragRef.current = marker;
      window.setTimeout(() => {
        if (dragRef.current === marker) dragRef.current = null;
      }, 0);
    } else {
      dragRef.current = null;
    }
  };
  const onClickCapture = (event) => {
    if (dragRef.current?.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragRef.current = null;
  };

  return (
    <div
      ref={rowRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      className="-mx-5 flex select-none gap-2 overflow-x-auto overscroll-x-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0"
    >
      {children}
    </div>
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
      {layout === "scroll" ? (
        <SheetScrollRow>{content}</SheetScrollRow>
      ) : (
        <div
          className={
            layout === "stack"
              ? "flex flex-col gap-2"
              : layout === "grid"
                ? "grid grid-cols-2 gap-2"
                : "flex flex-wrap gap-2"
          }
        >
          {content}
        </div>
      )}
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
