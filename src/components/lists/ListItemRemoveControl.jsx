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

  const trigger = (className) => (
    <button
      type="button"
      data-online-only="true"
      onClick={ask}
      title="Quitar de la lista"
      aria-label="Quitar de la lista"
      className={`flex items-center justify-center rounded-full border border-white/10 bg-black/50 text-red-400 shadow-lg backdrop-blur-md transition-colors hover:bg-red-500/30 hover:text-red-200 ${className}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );

  const confirmButtons = (
    <>
      <span className="text-[10px] font-bold tracking-wide text-red-200 sm:text-xs">
        ¿Quitar?
      </span>
      <button
        type="button"
        onClick={cancel}
        className="flex items-center justify-center rounded-lg bg-zinc-800 p-2 text-zinc-300 transition-colors hover:bg-zinc-700"
        aria-label="Cancelar"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        data-online-only="true"
        onClick={confirm}
        disabled={busy}
        className="flex items-center justify-center rounded-lg bg-red-600 p-2 text-white transition-colors hover:bg-red-500 disabled:cursor-wait"
        aria-label="Quitar de la lista"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </>
  );

  if (variant === "row") {
    return confirming || busy ? (
      <div
        className="flex items-center gap-2 rounded-xl bg-black/90 py-1 pl-3 pr-1 shadow-lg"
        onClick={stop}
      >
        {confirmButtons}
      </div>
    ) : (
      trigger("h-9 w-9")
    );
  }

  return (
    <>
      {!confirming && !busy ? trigger("absolute right-2 top-2 z-30 h-9 w-9") : null}
      <FadePresence
        show={confirming || busy}
        className={`absolute inset-0 z-40 flex items-center justify-center gap-2 bg-black/95 px-3 ${rounded}`}
        onClick={stop}
      >
        {confirmButtons}
      </FadePresence>
    </>
  );
}
