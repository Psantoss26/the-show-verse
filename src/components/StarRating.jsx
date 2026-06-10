"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Star, X, Minus, Plus, Loader2, Trash2 } from "lucide-react";
import LiquidButton from "./LiquidButton";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const fmt = (v) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return v.toFixed(1).replace(/\.0$/, "");
};

export default function StarRating({
  rating,
  max = 10,
  min = 1,
  step = 0.5,

  // Soporte props (Legacy/New)
  onRate,
  onRating,
  onClear,
  onClearRating,

  // estado/conexión
  loading = false,
  connected = true,
  onConnect,

  disabled = false,
}) {
  const effectiveDisabled = disabled || loading;

  const rateFn = onRate || onRating;
  const clearFn = onClear || onClearRating;

  const hasRating = typeof rating === "number" && Number.isFinite(rating);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  // valor actual del slider
  const [value, setValue] = useState(hasRating ? rating : clamp(8, min, max));
  const rangeRef = useRef(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (hasRating) setValue(rating);
  }, [hasRating, rating]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // normaliza a step + clamp
  const normalize = (v) => {
    const num = typeof v === "string" ? parseFloat(v) : Number(v);
    if (!Number.isFinite(num)) return null;
    const snapped = Math.round(num / step) * step;
    // evita cosas tipo 7.0000000004
    const fixed = Number(snapped.toFixed(3));
    return clamp(fixed, min, max);
  };

  const updateValue = (val) => {
    const next = normalize(val);
    if (next == null) return;
    setValue(next);
  };

  const adjust = (delta) => updateValue(value + delta);

  const handleOpen = () => {
    if (effectiveDisabled) return;
    if (!connected) {
      onConnect?.();
      return;
    }
    if (!open && !hasRating) setValue(clamp(8, min, max));
    setOpen(true);
  };

  const handleSave = async () => {
    if (effectiveDisabled) return;
    if (!connected) {
      onConnect?.();
      return;
    }

    const v = normalize(value);
    if (v == null) return;

    try {
      if (typeof rateFn === "function") {
        // si rateFn devuelve false o lanza, NO cerramos
        const ok = await rateFn(v);
        if (ok === false) return;
      }
    } catch {
      return;
    }
    setOpen(false);
  };

  const handleClear = async () => {
    if (effectiveDisabled) return;
    if (!connected) {
      onConnect?.();
      return;
    }

    let ok = true;
    try {
      if (typeof clearFn === "function") {
        ok = await clearFn();
      } else if (typeof rateFn === "function") {
        ok = await rateFn(null);
      }
    } catch {
      return;
    }
    if (ok === false) return;
    setOpen(false);
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <>
      {/* --- BOTÓN TRIGGER --- */}
      <LiquidButton
        disabled={effectiveDisabled}
        onClick={handleOpen}
        active={hasRating}
        activeColor="yellow"
        groupId="details-actions"
        title={hasRating ? `Tu puntuación: ${fmt(rating)}` : "Puntuar"}
        loading={loading}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : hasRating ? (
          <span
            className={`font-black leading-none translate-y-[1px] ${
              fmt(rating).length === 1
                ? "text-xl"
                : fmt(rating) === "10"
                  ? "text-xl tracking-tighter -translate-x-[1px]"
                  : "text-lg tracking-tighter"
            }`}
          >
            {fmt(rating)}
          </span>
        ) : (
          <Star className="w-5 h-5" />
        )}
      </LiquidButton>

      {/* --- MODAL --- */}
      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />

            <div
              className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-300 ease-out"
              role="dialog"
              aria-modal="true"
              aria-label="Puntuación del usuario"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
                <span className="text-xs font-bold uppercase tracking-widest text-white/55">
                  Tu reseña
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white"
                  title="Cerrar (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 pt-8 pb-8 space-y-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="relative flex items-center justify-center">
                    <Star
                      className="absolute h-28 w-28 fill-yellow-300/15 text-yellow-300/15 drop-shadow-[0_0_30px_rgba(234,179,8,0.25)]"
                      strokeWidth={1}
                    />
                    <span className="relative z-10 font-sans text-6xl font-black tracking-tighter text-white drop-shadow-md">
                      {fmt(value)}
                    </span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="relative h-12 flex items-center justify-center group touch-none">
                    <div className="absolute h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/40 backdrop-blur-md">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-yellow-200/80 via-yellow-100 to-white shadow-[0_0_14px_rgba(250,204,21,0.45)] transition-all duration-75 ease-out"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    <input
                      ref={rangeRef}
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={value}
                      onChange={(e) => updateValue(e.target.value)}
                      className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
                      aria-label="Seleccionar puntuación"
                    />

                    <div
                      className="pointer-events-none absolute z-10 flex h-7 w-7 items-center justify-center rounded-full border-4 border-black/60 bg-white shadow-[0_0_24px_rgba(255,255,255,0.45)] transition-all duration-75 ease-out"
                      style={{ left: `calc(${percentage}% - 14px)` }}
                    >
                      <div className="w-1.5 h-1.5 bg-black rounded-full" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-white/50">
                    <button
                      type="button"
                      onClick={() => adjust(-step)}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-xl transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-50"
                      disabled={effectiveDisabled}
                      title="Bajar puntuación"
                    >
                      <Minus className="w-5 h-5" />
                    </button>

                    <span className="select-none text-[10px] font-bold tracking-widest text-white/35">
                      DESLIZA PARA PUNTUAR
                    </span>

                    <button
                      type="button"
                      onClick={() => adjust(step)}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-xl transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-50"
                      disabled={effectiveDisabled}
                      title="Subir puntuación"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  {hasRating && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/45 backdrop-blur-xl transition hover:border-red-300/30 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                      title="Eliminar nota"
                      disabled={effectiveDisabled}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={effectiveDisabled}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/90 text-sm font-extrabold uppercase tracking-wide text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] transition-all hover:bg-white active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Confirmar"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
