"use client";

import { useEffect } from "react";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";

// Comportamiento COMÚN de todos los diálogos modales de la app, en un solo sitio:
//   1. Bloqueo del scroll de la página de fondo mientras el modal está abierto
//      (vía useBodyScrollLock: contador global para modales apilados + compensa
//      el ancho de la scrollbar, así el layout no "salta" al abrir/cerrar).
//   2. Cierre con la tecla Escape.
//
// El backdrop (bloquear la interacción con el fondo y CERRAR al pulsar fuera) lo
// aporta cada modal con su overlay `fixed inset-0 onClick={onClose}`; este hook
// cubre lo que se implementaba a mano y de forma dispar en cada uno.
//
// Uso:  useModalGuard({ open, onClose })   // open: ¿está abierto? onClose: cerrar.
export default function useModalGuard({
  open = true,
  onClose,
  closeOnEsc = true,
} = {}) {
  // Debe llamarse SIEMPRE (regla de hooks); internamente solo bloquea si `open`.
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !closeOnEsc || typeof onClose !== "function") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeOnEsc, onClose]);
}
