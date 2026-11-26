"use client";

// /src/components/settings/SettingsGlassModal.jsx
// Armazón de los editores de Preferencias («Puntuaciones en el móvil», «Barra
// inferior móvil» y «Al abrir un título»). Es el mismo diseño que los modales de
// los botones de acción de las fichas (ExternalLinksModal, ListToggleConfirmModal…):
// velo oscurecido y desenfocado, panel de cristal líquido `rounded-[2rem]`,
// cabecera de cristal con icono, título degradado y subtítulo, y la entrada y
// salida de useActionModalMotion (el panel nace del botón «Personalizar» y
// vuelve a él).
//
// El padre lo deja MONTADO y cambia `open`: así se ve la salida. El contenido
// se pinta mientras `present` (también durante la salida).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ModalTitleIcon from "@/components/details/ModalTitleIcon";
import useActionModalMotion from "@/hooks/useActionModalMotion";
import useModalGuard from "@/hooks/useModalGuard";
import { LIQUID_GLASS_MODAL_HEADER, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

// Escape con un <select> desplegado cierra solo su lista, no el modal. En
// keydown la lista sigue abierta (`:open`); los navegadores sin `:open` lanzan
// y se toma como cerrada.
function isOpenPicker(target) {
  const select = target?.closest?.("select");
  if (!select) return false;
  try {
    return select.matches(":open");
  } catch {
    return false;
  }
}

export const SETTINGS_MODAL_ICON_BUTTON =
  "flex h-11 w-11 max-md:h-9 max-md:w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 disabled:cursor-not-allowed disabled:opacity-40";

export default function SettingsGlassModal({
  open,
  onClose,
  // Escape: por defecto cierra; un editor puede cerrar antes un selector propio.
  onEscape,
  titleId,
  title,
  subtitle,
  icon,
  tone = "neutral",
  closeLabel = "Cerrar",
  // Botones extra de la cabecera, antes del de cerrar (p. ej. Restablecer).
  headerActions = null,
  panelClassName = "max-w-lg",
  headerClassName = "p-6 sm:px-8 sm:pt-8",
  bodyClassName = "sv-modal-scroll-fade flex-1 overflow-y-auto p-6",
  children,
}) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  // Escape va aparte (abajo) para respetar los <select> desplegados.
  useModalGuard({ open, onClose, closeOnBack: true, closeOnEsc: false });

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || isOpenPicker(event.target)) return;
      (onEscape || onClose)?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onEscape, onClose]);

  const actionMotion = useActionModalMotion(open);
  if (!actionMotion.present || !portalReady) return null;

  return createPortal(
    // `data-detail-modal-layer`: capa de modal (no se apaga con la hoja inferior
    // abierta, ver globals.css). El clic no sube por el árbol de React.
    <div
      data-detail-modal-layer=""
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4${actionMotion.closing ? " pointer-events-none" : ""}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={actionMotion.backdropRef}
        className="absolute inset-0 bg-black/60 backdrop-blur-lg"
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={actionMotion.panelRef}
        className={`relative flex sv-modal-max-h w-full flex-col overflow-hidden rounded-[2rem] text-white ${LIQUID_GLASS_PANEL} ${panelClassName}`}
      >
        <div className={`flex w-full shrink-0 items-center justify-between gap-3 ${LIQUID_GLASS_MODAL_HEADER} ${headerClassName}`}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {icon ? <ModalTitleIcon icon={icon} tone={tone} className="max-md:h-9 max-md:w-9" /> : null}
            {/* El título va en UNA línea: el tamaño se ajusta al hueco que deja
                la cabecera (`cqi` del propio bloque), con techo en text-xl.
                10,8 ≈ ancho de «Puntuaciones en el móvil» (el más largo) por
                píxel de fuente en PT Sans negrita; si otro no cabe, recorta. */}
            <div className="@container min-w-0 flex-1">
              <h2
                id={titleId}
                className="truncate bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-[min(1.25rem,calc(100cqi/10.8))] font-black leading-tight text-transparent"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1 truncate text-xs font-medium uppercase tracking-wide text-zinc-500">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button type="button" onClick={onClose} className={SETTINGS_MODAL_ICON_BUTTON} aria-label={closeLabel}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={bodyClassName}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}
