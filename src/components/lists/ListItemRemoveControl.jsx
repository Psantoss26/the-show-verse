"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import FadePresence from "@/components/ui/FadePresence";

// Quitar un título de una lista personal, con el gesto de Continuar viendo:
// la papelera roja solo aparece con el MODO BORRAR activo (botón de la barra de
// la lista) y pulsarla pide confirmación («¿Quitar?» · ✕ · papelera) antes de
// borrar. Antes la papelera salía al pasar el cursor por cada tarjeta y borraba
// al instante.
//
// `variant`:
//   - "card": va DENTRO de la tarjeta (contenedor `relative`): la papelera en la
//     esquina y la confirmación cubriendo la tarjeta;
//   - "row": en el hueco de acción de la fila (vista lista): la confirmación
//     sustituye a la papelera, en línea.
export default function ListItemRemoveControl({
  editMode = false,
  busy = false,
  onRemove,
  variant = "card",
  rounded = "rounded-xl",
}) {
  const [confirming, setConfirming] = useState(false);
  // Al salir del modo borrar se cierra cualquier confirmación abierta.
  useEffect(() => {
    if (!editMode) setConfirming(false);
  }, [editMode]);

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const ask = (event) => {
    stop(event);
    setConfirming(true);
  };
  const cancel = (event) => {
    stop(event);
    setConfirming(false);
  };
  const confirm = (event) => {
    stop(event);
    if (!busy) onRemove?.();
  };

  if (!editMode && !busy) return null;

  // En la tarjeta todo se escala con su ancho (container queries): en la vista
  // compacta del móvil las tarjetas miden ~80 px y la confirmación en una fila
  // («¿Quitar?» ✕ 🗑) no cabía, se pegaba a los bordes o sobresalía.
  const isCard = variant !== "row";
  const iconClass = isCard ? "h-3.5 w-3.5 @min-[7.5rem]:h-4 @min-[7.5rem]:w-4" : "h-4 w-4";

  const trigger = (className) => (
    <button
      type="button"
      data-online-only="true"
      onClick={ask}
      title="Quitar de la lista"
      aria-label="Quitar de la lista"
      className={`flex items-center justify-center rounded-full border border-white/10 bg-black/50 text-red-400 shadow-lg backdrop-blur-md transition-colors hover:bg-red-500/30 hover:text-red-200 ${className}`}
    >
      <Trash2 className={iconClass} />
    </button>
  );

  const buttonPad = isCard ? "p-1.5 @min-[7.5rem]:p-2" : "p-2";
  const confirmButtons = (
    <>
      <button
        type="button"
        onClick={cancel}
        className={`flex items-center justify-center rounded-lg bg-zinc-800 ${buttonPad} text-zinc-300 transition-colors hover:bg-zinc-700`}
        aria-label="Cancelar"
      >
        <X className={iconClass} />
      </button>
      <button
        type="button"
        data-online-only="true"
        onClick={confirm}
        disabled={busy}
        className={`flex items-center justify-center rounded-lg bg-red-600 ${buttonPad} text-white transition-colors hover:bg-red-500 disabled:cursor-wait`}
        aria-label="Quitar de la lista"
      >
        {busy ? <Loader2 className={`${iconClass} animate-spin`} /> : <Trash2 className={iconClass} />}
      </button>
    </>
  );

  if (!isCard) {
    return confirming || busy ? (
      <div
        className="flex items-center gap-2 rounded-xl bg-black/90 py-1 pl-3 pr-1 shadow-lg"
        onClick={stop}
      >
        <span className="text-xs font-bold tracking-wide text-red-200">¿Quitar?</span>
        {confirmButtons}
      </div>
    ) : (
      trigger("h-9 w-9")
    );
  }

  // Capa del tamaño de la tarjeta que hace de contenedor de las container
  // queries; sin confirmación abierta deja pasar los clics a la tarjeta.
  return (
    <div
      className={`@container absolute inset-0 z-30 ${confirming || busy ? "" : "pointer-events-none"}`}
    >
      {!confirming && !busy
        ? trigger(
            "pointer-events-auto absolute right-1.5 top-1.5 h-7 w-7 @min-[7.5rem]:right-2 @min-[7.5rem]:top-2 @min-[7.5rem]:h-9 @min-[7.5rem]:w-9",
          )
        : null}
      <FadePresence
        show={confirming || busy}
        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/95 p-2 ${rounded}`}
        onClick={stop}
      >
        <span className="text-center text-[10px] font-bold tracking-wide text-red-200 @min-[7.5rem]:text-xs">
          ¿Quitar?
        </span>
        <div className="flex items-center gap-1.5 @min-[7.5rem]:gap-2">{confirmButtons}</div>
      </FadePresence>
    </div>
  );
}
