"use client";

// Selector de fecha (y opcionalmente hora) con el acabado liquid glass de la
// app. Nació en TraktWatchedModal ("Añadir visionado" de películas) y es el que
// usan todos los modales de visionados en lugar del `datetime-local` nativo,
// cuyo desplegable del navegador no encaja con el resto de la interfaz.
//
// Dos modos:
//   - Solo fecha (por defecto): `value` y `onSelect` en "YYYY-MM-DD"; elegir un
//     día lo confirma y cierra.
//   - `withTime`: `value` y `onSelect` en "YYYY-MM-DDTHH:mm" (el formato de un
//     `datetime-local`); el día y la hora se eligen y se confirman con Aplicar.
//
// Se pinta en un portal sobre <body>: los paneles de cristal llevan
// `backdrop-filter`, que convierte a sus hijos `fixed` en relativos al panel.
// Los eventos de React sí suben por el árbol del portal, así que los clics se
// paran aquí para no cerrar el modal o el submodal que lo abrió.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import useModalGuard from "@/hooks/useModalGuard";

const pad2 = (n) => String(n).padStart(2, "0");

function dateToYmdLocal(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const todayYmd = () => dateToYmdLocal(new Date());

function ymdToDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm" → { ymd, hour, minute }.
function parseValue(value) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ""));
  if (!match || !ymdToDate(match[1])) return null;
  return {
    ymd: match[1],
    hour: match[2] != null ? Number(match[2]) : null,
    minute: match[3] != null ? Number(match[3]) : null,
  };
}

function nowParts() {
  const d = new Date();
  return { ymd: dateToYmdLocal(d), hour: d.getHours(), minute: d.getMinutes() };
}

function buildMonthGrid(year, month, weekStartsOn = 1) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

function formatHuman(ymd, hour, minute, withTime) {
  const d = ymdToDate(ymd);
  if (!d) return "Sin fecha";
  const date = d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return withTime && hour != null ? `${date} · ${pad2(hour)}:${pad2(minute ?? 0)}` : date;
}

// Etiqueta corta para el botón que abre el selector.
export function formatPickerValue(value, { withTime = false } = {}) {
  const parsed = parseValue(value);
  if (!parsed) return "";
  const d = ymdToDate(parsed.ymd);
  const date = d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return withTime && parsed.hour != null
    ? `${date} · ${pad2(parsed.hour)}:${pad2(parsed.minute ?? 0)}`
    : date;
}

const ROUND_BUTTON =
  "flex items-center justify-center rounded-full bg-white/[0.055] text-white/70 shadow-sm backdrop-blur-md transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300";

// Hora o minutos: flechas arriba/abajo (con vuelta) y el número editable.
function TimeUnit({ label, value, max, onChange }) {
  const [draft, setDraft] = useState(null);
  const step = (delta) => onChange((value + delta + max + 1) % (max + 1));
  const commit = () => {
    if (draft == null) return;
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(0, n)));
    setDraft(null);
  };
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => step(1)} className={`${ROUND_BUTTON} h-8 w-8`} aria-label={`Subir ${label}`}>
        <ChevronUp className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label={label}
        value={draft ?? pad2(value)}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            step(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            step(-1);
          } else if (event.key === "Enter") {
            commit();
          }
        }}
        className="h-12 w-16 rounded-2xl bg-white/[0.06] text-center font-mono text-xl font-bold tabular-nums text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] outline-none transition focus:bg-white/[0.10] focus:ring-2 focus:ring-emerald-300/50"
      />
      <button type="button" onClick={() => step(-1)} className={`${ROUND_BUTTON} h-8 w-8`} aria-label={`Bajar ${label}`}>
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function CalendarPickerModal({
  open,
  value,
  onSelect,
  onClose,
  title = "Selecciona fecha",
  withTime = false,
}) {
  const [monthDate, setMonthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [draft, setDraft] = useState(() => parseValue(value) || nowParts());

  // Bloqueo de scroll de fondo + cierre con Escape (solo este, si está apilado).
  useModalGuard({ open, onClose });

  useEffect(() => {
    if (!open) return;
    const parsed = parseValue(value);
    const now = nowParts();
    const next = parsed
      ? { ...parsed, hour: parsed.hour ?? now.hour, minute: parsed.minute ?? now.minute }
      : now;
    setDraft(next);
    const base = ymdToDate(next.ymd) || new Date();
    setMonthDate(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [open, value]);

  if (!open || typeof document === "undefined") return null;

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const days = buildMonthGrid(year, month, 1);
  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(monthDate);
  const selected = withTime ? draft.ymd : parseValue(value)?.ymd || null;
  const today = todayYmd();
  const dow = ["L", "M", "X", "J", "V", "S", "D"];

  const emit = (parts) => {
    onSelect?.(withTime ? `${parts.ymd}T${pad2(parts.hour)}:${pad2(parts.minute)}` : parts.ymd);
  };
  const pickDay = (ymd) => {
    if (!ymd) return;
    if (withTime) setDraft((current) => ({ ...current, ymd }));
    else emit({ ymd });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100050] flex items-center justify-center p-4"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      data-mobile-page-swipe-ignore=""
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative isolate w-full max-w-sm overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.15),0_30px_80px_-15px_rgba(0,0,0,0.95)] animate-in zoom-in-95 duration-300 ease-out`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <LiquidGlassOpticalLayers />

        {/* Cabecera */}
        <div className="relative z-10 flex items-center justify-between bg-white/[0.035] px-6 py-5 backdrop-blur-xl">
          <div>
            <div className="text-sm font-black uppercase tracking-wide text-white drop-shadow-md">{title}</div>
            <div className="mt-1 font-mono text-xs font-semibold text-emerald-200">
              {selected ? formatHuman(selected, draft.hour, draft.minute, withTime) : "Sin fecha"}
            </div>
          </div>
          <button type="button" onClick={onClose} className={`${ROUND_BUTTON} h-11 w-11 bg-white/5`} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navegación de mes */}
        <div className="relative z-10 flex items-center justify-between px-5 pb-4 pt-5 sm:px-6">
          <button
            type="button"
            onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className={`${ROUND_BUTTON} h-10 w-10`}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="rounded-2xl bg-white/[0.04] px-4 py-2 text-sm font-bold capitalize text-white shadow-sm backdrop-blur-md">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className={`${ROUND_BUTTON} h-10 w-10`}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Rejilla */}
        <div className="relative z-10 mx-5 mb-5 rounded-3xl bg-black/[0.12] bg-gradient-to-b from-white/[0.07] via-white/[0.025] to-black/[0.10] p-3.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_12px_30px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:mx-6 sm:p-4">
          <div className="mb-3 grid grid-cols-7">
            {dow.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const inMonth = d.getMonth() === month;
              const key = dateToYmdLocal(d);
              const isSel = key === selected;
              const isToday = key === today;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickDay(key)}
                  aria-pressed={isSel}
                  aria-label={d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                  className={`
                    relative z-0 flex aspect-square items-center justify-center rounded-xl text-sm font-medium transition-all duration-200
                    ${!inMonth ? "text-white/20 opacity-50" : "text-white/70 hover:bg-white/[0.10] hover:text-white"}
                    ${isSel ? "z-10 !bg-emerald-400 !text-black font-extrabold shadow-[0_0_18px_rgba(52,211,153,0.38)] scale-105" : ""}
                    ${isToday && !isSel ? "bg-white/[0.08] text-white shadow-sm" : ""}
                    focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300
                  `}
                >
                  {d.getDate()}
                  {isToday && !isSel && <div className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-400" />}
                </button>
              );
            })}
          </div>

          {withTime && (
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Hora</div>
              <div className="flex items-center gap-2">
                <TimeUnit
                  label="Hora"
                  value={draft.hour}
                  max={23}
                  onChange={(hour) => setDraft((current) => ({ ...current, hour }))}
                />
                <span className="pb-0.5 font-mono text-xl font-bold text-white/50">:</span>
                <TimeUnit
                  label="Minutos"
                  value={draft.minute}
                  max={59}
                  onChange={(minute) => setDraft((current) => ({ ...current, minute }))}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => (withTime ? setDraft(nowParts()) : emit({ ymd: todayYmd() }))}
              className="flex-1 rounded-2xl bg-white/[0.08] bg-gradient-to-b from-white/[0.16] to-white/[0.04] py-3 text-xs font-bold uppercase tracking-wide text-white/90 shadow-sm backdrop-blur-xl transition hover:bg-white/[0.14] hover:text-white active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              {withTime ? "Ahora" : "Seleccionar Hoy"}
            </button>
            {withTime && (
              <button
                type="button"
                onClick={() => emit(draft)}
                className="flex-1 rounded-2xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-wide text-black shadow-[0_0_18px_rgba(52,211,153,0.28)] transition hover:bg-emerald-400 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                Aplicar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
