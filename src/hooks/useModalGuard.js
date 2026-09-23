"use client";

import { useEffect, useRef } from "react";

// Pila de modales abiertos (los que escuchan Escape). Con modales apilados
// —p. ej. el selector de puntuación sobre el modal de episodios— Escape debe
// cerrar SOLO el de encima, no todos a la vez.
const escapeStack = [];
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
  // Si es false NO se bloquea el scroll de fondo (p. ej. el drawer derecho de las
  // páginas de usuario, que permite seguir navegando por debajo). Esc sigue activo.
  lockScroll = true,
} = {}) {
  // Debe llamarse SIEMPRE (regla de hooks); internamente solo bloquea si `open`.
  useBodyScrollLock(open && lockScroll);

  // Último onClose en un ref: la posición en la pila depende solo de CUÁNDO se
  // abrió el modal, no de que el padre se re-renderice con otro onClose.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const hasOnClose = typeof onClose === "function";

  useEffect(() => {
    if (!open || !closeOnEsc || !hasOnClose) return undefined;
    const token = {};
    escapeStack.push(token);
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (escapeStack[escapeStack.length - 1] !== token) return;
      onCloseRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const index = escapeStack.indexOf(token);
      if (index !== -1) escapeStack.splice(index, 1);
    };
  }, [open, closeOnEsc, hasOnClose]);
}
