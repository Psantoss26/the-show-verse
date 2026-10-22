"use client";

// /src/components/details/CreditFilterControls.jsx
// Desplegables de filtros con la receta de las páginas de usuario (Favoritos):
// los de los créditos de una persona (ActorDetails: secciones Películas y
// Series y sus vistas laterales, acento verde) y los del panel «Portadas y
// fondos» de las fichas de títulos (acento amarillo).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";

// Acento: verde en la ficha de un actor; amarillo en las de títulos
// (p. ej. el panel «Portadas y fondos» de DetailsClient). Las opciones lo
// leen del menú que las contiene.
const ACCENTS = {
  emerald: { icon: "text-emerald-400", focus: "focus-visible:outline-emerald-400" },
  yellow: { icon: "text-yellow-400", focus: "focus-visible:outline-yellow-400" },
};
const AccentContext = createContext(ACCENTS.emerald);

export function InlineDropdown({
  label,
  valueLabel,
  // Valor en móvil, donde no se ve la etiqueta (p. ej. «Desde 2010»).
  mobileValueLabel,
  icon: Icon,
  children,
  className = "",
  // Capa del menú: por encima del panel lateral (z-[10000]) cuando va dentro.
  menuZIndex = 1000,
  // Botón a todo el ancho también en escritorio (en el panel lateral).
  fullWidth = false,
  // FILA COMPACTA (panel lateral de Películas/Series: Ordenar · Desde ·
  // Hasta en una sola fila). Solo icono y valor, sin la etiqueta, en cualquier
  // ancho, y el botón parte del ancho de su contenido (`flex: 1 1 auto`):
  // reparte el sobrante o encoge con los demás. La fila debe ser `@container`
  // flex; `compactIcon: "wide"` muestra el icono solo si la fila mide ≥ 28rem
  // y, por debajo de 24rem (panel en un teléfono), la flecha se oculta: así
  // los tres valores caben enteros («Valoración · Desde 2010 · Hasta 2017»).
  compact = false,
  compactIcon = "always",
  accent = "emerald",
}) {
  const tone = ACCENTS[accent] || ACCENTS.emerald;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  // Misma colocación que los desplegables de las páginas de usuario
  // (Favoritos): el menú mide lo que su contenido, nunca menos que su botón ni
  // más que la ventana, y su alto se limita al sitio que queda debajo.
  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuMaxWidth = window.innerWidth - 24;
    const measured = menuRef.current?.offsetWidth || rect.width;
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, window.innerWidth - Math.min(measured, menuMaxWidth) - 12),
    );
    const availableBelow = window.innerHeight - rect.bottom - 12;

    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: "max-content",
      minWidth: rect.width,
      maxWidth: menuMaxWidth,
      maxHeight: Math.max(64, Math.min(448, availableBelow)),
      zIndex: menuZIndex,
    });
  }, [menuZIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const target = e.target;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    // Segunda pasada con el menú ya pintado (su ancho real).
    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <div
      ref={ref}
      className={`relative ${
        compact ? "min-w-0 flex-[1_1_auto]" : "w-full lg:w-auto lg:shrink-0"
      } ${className}`}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-11 min-w-0 w-full inline-flex items-center justify-between rounded-2xl transition text-sm ${
          compact
            ? "gap-1.5 px-3"
            : `gap-3 px-4 lg:min-w-[140px] ${fullWidth ? "" : "lg:w-auto"}`
        } bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg text-zinc-200 hover:from-white/15 hover:to-white/10 focus-visible:outline focus-visible:outline-2 ${tone.focus}`}
      >
        <div className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
          {Icon && (
            <Icon
              className={`h-4 w-4 shrink-0 ${tone.icon} ${
                compact && compactIcon === "wide" ? "hidden @min-[28rem]:block" : ""
              }`}
            />
          )}
          {/* En móvil solo icono y valor (como los desplegables compactos de
              Favoritos): con la etiqueta, en media fila el valor se cortaba. */}
          {compact ? (
            <span className="min-w-0 truncate font-semibold text-white">
              {mobileValueLabel || valueLabel}
            </span>
          ) : (
            <>
              <span className="hidden shrink-0 text-xs font-bold uppercase tracking-wider text-zinc-500 sm:inline">
                {label}:
              </span>
              <span className="hidden min-w-0 truncate font-semibold text-white sm:inline">
                {valueLabel}
              </span>
              <span className="min-w-0 truncate font-semibold text-white sm:hidden">
                {mobileValueLabel || valueLabel}
              </span>
            </>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""} ${
            compact ? "hidden @min-[24rem]:block" : ""
          }`}
        />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && menuStyle && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                style={menuStyle}
                className="flex flex-col overflow-hidden rounded-2xl bg-black/40 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-2xl p-2 shadow-2xl"
              >
                <div
                  className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-color:#3f3f46_transparent]"
                  style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}
                >
                  <AccentContext.Provider value={tone}>
                    {children({ close: () => setOpen(false) })}
                  </AccentContext.Provider>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export function DropdownItem({ active, onClick, children }) {
  const tone = useContext(AccentContext);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-xl text-left text-sm transition flex items-center justify-between gap-6 ${
        active
          ? "bg-white/10 text-white font-bold"
          : "text-zinc-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="font-medium whitespace-nowrap">{children}</span>
      {/* Hueco de la marca siempre reservado (como en Favoritos): el ancho
          del menú no cambia según la opción elegida. */}
      {active ? (
        <CheckCircle2 className={`w-4 h-4 shrink-0 ${tone.icon}`} />
      ) : (
        <span aria-hidden="true" className="w-4 h-4 shrink-0" />
      )}
    </button>
  );
}

export function YearFilterDropdown({
  label,
  value,
  setValue,
  options,
  className = "",
  menuZIndex,
  fullWidth,
  compact,
  compactIcon,
}) {
  return (
    <InlineDropdown
      menuZIndex={menuZIndex}
      fullWidth={fullWidth}
      compact={compact}
      compactIcon={compactIcon}
      label={label}
      valueLabel={value || "Todos"}
      mobileValueLabel={value ? `${label} ${value}` : label}
      icon={Calendar}
      className={className}
    >
      {({ close }) => (
        <>
          <DropdownItem
            active={!value}
            onClick={() => {
              setValue("");
              close();
            }}
          >
            Todos
          </DropdownItem>
          {options.map((option) => (
            <DropdownItem
              key={`${label}-${option.value}`}
              active={value === option.value}
              onClick={() => {
                setValue(option.value);
                close();
              }}
            >
              {option.label}
            </DropdownItem>
          ))}
        </>
      )}
    </InlineDropdown>
  );
}

export function CreditsFilterDropdowns({
  creditFilter,
  setCreditFilter,
  sort,
  setSort,
  // Sin el de rol: el panel lateral ya lo filtra con sus pestañas.
  showRole = true,
  menuZIndex,
  fullWidth,
  compact,
}) {
  const creditLabel =
    creditFilter === "all"
      ? "Todos"
      : creditFilter === "crew"
        ? "Equipo"
        : "Actuación";
  const sortLabel =
    sort === "date_asc"
      ? "Antiguos"
      : sort === "pop_desc"
        ? "Popularidad"
        : sort === "rating_desc"
          ? "Mejor valorados"
          : sort === "alpha"
            ? "A-Z"
            : "Recientes";
  // Fila compacta del panel lateral: el valor corto, para que quepa entero.
  const sortShortLabel = sort === "rating_desc" ? "Valoración" : sortLabel;

  return (
    <>
      {showRole ? (
      <InlineDropdown label="Rol" valueLabel={creditLabel} icon={Briefcase} menuZIndex={menuZIndex} fullWidth={fullWidth}>
        {({ close }) => (
          <>
            <DropdownItem
              active={creditFilter === "acting"}
              onClick={() => {
                setCreditFilter("acting");
                close();
              }}
            >
              Actuación
            </DropdownItem>
            <DropdownItem
              active={creditFilter === "crew"}
              onClick={() => {
                setCreditFilter("crew");
                close();
              }}
            >
              Equipo técnico
            </DropdownItem>
            <DropdownItem
              active={creditFilter === "all"}
              onClick={() => {
                setCreditFilter("all");
                close();
              }}
            >
              Todos
            </DropdownItem>
          </>
        )}
      </InlineDropdown>

      ) : null}

      <InlineDropdown
        label="Ordenar"
        valueLabel={sortLabel}
        mobileValueLabel={compact ? sortShortLabel : undefined}
        icon={ArrowUpDown}
        menuZIndex={menuZIndex}
        fullWidth={fullWidth}
        compact={compact}
      >
        {({ close }) => (
          <>
            <DropdownItem
              active={sort === "date_desc"}
              onClick={() => {
                setSort("date_desc");
                close();
              }}
            >
              Más recientes
            </DropdownItem>
            <DropdownItem
              active={sort === "date_asc"}
              onClick={() => {
                setSort("date_asc");
                close();
              }}
            >
              Más antiguos
            </DropdownItem>
            <DropdownItem
              active={sort === "pop_desc"}
              onClick={() => {
                setSort("pop_desc");
                close();
              }}
            >
              Popularidad
            </DropdownItem>
            <DropdownItem
              active={sort === "rating_desc"}
              onClick={() => {
                setSort("rating_desc");
                close();
              }}
            >
              Mejor valorados
            </DropdownItem>
            <DropdownItem
              active={sort === "alpha"}
              onClick={() => {
                setSort("alpha");
                close();
              }}
            >
              Título A-Z
            </DropdownItem>
          </>
        )}
      </InlineDropdown>
    </>
  );
}
