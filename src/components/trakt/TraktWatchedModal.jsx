"use client";
import { useServerOnline } from "@/context/ServerStatusContext";
import { LIQUID_GLASS_PANEL, LIQUID_GLASS_MODAL_HEADER } from "@/lib/ui/liquidGlass";

import { useEffect, useMemo, useState } from "react";
import useModalGuard from "@/hooks/useModalGuard";
import CalendarPickerModal from "@/components/trakt/CalendarPickerModal";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  CalendarDays,
  Check,
  Clock,
  History,
  Eye,
} from "lucide-react";

// --- Helpers de Fecha (Mismos que tenías) ---
const todayYmd = () => new Date().toISOString().slice(0, 10);

const isoToYmd = (iso) => {
  if (!iso) return "";
  return String(iso).slice(0, 10);
};

const ymdToDate = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = String(ymd)
    .split("-")
    .map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const formatYmdHuman = (ymd) => {
  const d = ymdToDate(ymd);
  if (!d) return "—";
  try {
    return d.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
};

const formatFullWatched = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  const date = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);

  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { date, time, full: `${date} · ${time}` };
};

const pickHistoryId = (h) => h?.id ?? h?.historyId ?? h?.history_id ?? null;
const pickWatchedAt = (h) =>
  h?.watched_at ?? h?.watchedAt ?? h?.watchedAtIso ?? null;

// ----------------------------
// Componente Principal
// ----------------------------
export default function TraktWatchedModal({
  open,
  onClose,
  traktUrl,
  plays,
  history,
  onAddPlay,
  onUpdatePlay,
  onRemovePlay,
  busy,
  busyKey,
}) {
  const serverOnline = useServerOnline();
  const isBusy = !!(busy || busyKey);

  // Hooks y lógica (igual que antes)
  const items = useMemo(() => {
    const arr = Array.isArray(history) ? history : [];
    return arr
      .map((h) => {
        const id = pickHistoryId(h);
        const watchedAt = pickWatchedAt(h);
        if (!id || !watchedAt) return null;
        return { id, watchedAt };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt));
  }, [history]);

  const [newDate, setNewDate] = useState(todayYmd());
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState(todayYmd());
  const [calOpen, setCalOpen] = useState(false);
  const [calTarget, setCalTarget] = useState("new"); // 'new' | 'edit'

  // Bloqueo de scroll de fondo + cierre con Escape
  useModalGuard({ open, onClose });

  useEffect(() => {
    if (!open) return;
    setNewDate(todayYmd());
    setEditingId(null);
    setEditDate(todayYmd());
    setCalOpen(false);
    setCalTarget("new");
  }, [open]);

  if (!open) return null;

  // Handlers
  const startEdit = (id, watchedAtIso) => {
    setEditingId(id);
    setEditDate(isoToYmd(watchedAtIso) || todayYmd());
  };
  const stopEdit = () => {
    setEditingId(null);
    setEditDate(todayYmd());
  };
  const openCalendarForNew = () => {
    setCalTarget("new");
    setCalOpen(true);
  };
  const openCalendarForEdit = () => {
    setCalTarget("edit");
    setCalOpen(true);
  };
  const onPickCalendar = (ymd) => {
    if (!ymd) return;
    if (calTarget === "edit") setEditDate(ymd);
    else setNewDate(ymd);
    setCalOpen(false);
  };
  const doAdd = async () => {
    if (!newDate || isBusy || !serverOnline) return;
    await onAddPlay?.(newDate);
    setNewDate(todayYmd());
  };
  const doSaveEdit = async () => {
    if (!editingId || !editDate || isBusy || !serverOnline) return;
    await onUpdatePlay?.(editingId, editDate);
    stopEdit();
  };
  const doRemove = async (id) => {
    if (!id || isBusy || !serverOnline) return;
    await onRemovePlay?.(id);
    if (editingId === id) stopEdit();
  };

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop con Blur y Fade */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg animate-in fade-in duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        className={`relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}
        role="dialog"
        aria-modal="true"
        aria-label="Historial de visionados"
      >
        {/* Header Premium */}
        <div className={`flex items-start justify-between px-6 py-5 sm:px-7 ${LIQUID_GLASS_MODAL_HEADER}`}>
          <div>
            <h3 className="text-xl font-black text-white drop-shadow-md">
              Historial de Visionado
            </h3>
            <div className="flex items-center gap-2 mt-1">
              {/* Indicador de nº de vistas: sin aro. El tinte, el color del
                  texto y el check ya lo identifican; el contorno solo repetía
                  esa información dibujando un canto. */}
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200 backdrop-blur-md">
                <Check className="w-3 h-3" />
                {plays ? `${plays} Vistas` : "Sin ver"}
              </span>
              {traktUrl && (
                <a
                  href={traktUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] font-bold text-white/50 transition hover:text-white"
                >
                  Trakt <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          {/* SECCIÓN 1: AÑADIR NUEVO (Hero Section) */}
          <div className="relative group">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-b from-emerald-400/15 to-transparent opacity-0 blur-lg transition duration-500 group-hover:opacity-100" />
            <div className="relative flex flex-col gap-3 rounded-3xl bg-white/5 p-4 shadow-lg backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Registrar nueva vista
                </span>
                {isBusy && (
                  <Loader2 className="w-4 h-4 text-emerald-300 animate-spin" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openCalendarForNew}
                  disabled={isBusy || !serverOnline}
                  className="flex flex-1 items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 text-left backdrop-blur-md shadow-sm transition hover:bg-white/10 disabled:opacity-50"
                >
                  <CalendarDays className="w-5 h-5 text-emerald-200/80" />
                  <div>
                    <div className="text-xs font-medium text-white/45">
                      Fecha
                    </div>
                    <div className="text-sm font-bold text-white">
                      {formatYmdHuman(newDate)}
                    </div>
                  </div>
                </button>

                <button data-online-only="true"
                  type="button"
                  onClick={doAdd}
                  disabled={isBusy || !serverOnline}
                  className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border border-emerald-200/30 bg-emerald-400/90 font-extrabold text-black shadow-[0_10px_30px_-10px_rgba(52,211,153,0.65)] transition-all hover:bg-emerald-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Añadir visionado"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: HISTORIAL (Timeline) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-white/40" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/45">
                Actividad Reciente
              </h4>
            </div>

            {!items.length ? (
              <div className="flex flex-col items-center justify-center rounded-3xl bg-white/5 py-8 text-center backdrop-blur-xl">
                <Clock className="mb-2 w-8 h-8 text-white/25" />
                <p className="text-sm text-white/45">
                  No hay registros en el historial.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.slice(0, 20).map((it) => {
                  const isEditing = editingId === it.id;
                  const { date } = formatFullWatched(it.watchedAt);

                  return (
                    <div
                      key={it.id}
                      className={`
                                                relative rounded-3xl p-4 backdrop-blur-xl transition-all duration-300 shadow-md
                                                ${
                                                  isEditing
                                                    ? "bg-yellow-500/10 shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)]"
                                                    : "bg-white/5 hover:bg-white/10"
                                                }
                                            `}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`
                                                        w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-md
                                                        ${isEditing ? "bg-yellow-400/15 border border-yellow-300/25 text-yellow-200" : "bg-white/5 text-white/45"}
                                                    `}
                          >
                            {isEditing ? (
                              <Pencil className="w-5 h-5" />
                            ) : (
                              <Eye className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div
                              className={`text-base sm:text-lg font-extrabold tracking-tight leading-tight ${isEditing ? "text-yellow-100" : "text-white"}`}
                            >
                              {isEditing ? "Editando fecha..." : date}
                            </div>
                          </div>
                        </div>

                        {/* Acciones Rápidas (Solo visibles si NO se edita, o si es la fila activa) */}
                        {!isEditing && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(it.id, it.watchedAt)}
                              disabled={isBusy || !serverOnline}
                              className="rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                              aria-label="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button data-online-only="true"
                              type="button"
                              onClick={() => doRemove(it.id)}
                              disabled={isBusy || !serverOnline}
                              className="rounded-full p-2 text-white/45 transition hover:bg-red-500/15 hover:text-red-300"
                              aria-label="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Editor Inline Expansible */}
                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-white/10 animate-in slide-in-from-top-2 fade-in">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={openCalendarForEdit}
                              disabled={isBusy || !serverOnline}
                              className="flex flex-1 items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5 text-sm text-white/85 shadow-sm transition hover:bg-white/10 "
                            >
                              <span className="font-mono">
                                {formatYmdHuman(editDate)}
                              </span>
                              <CalendarDays className="w-4 h-4 text-yellow-200" />
                            </button>
                            <button data-online-only="true"
                              type="button"
                              onClick={doSaveEdit}
                              disabled={isBusy || !serverOnline}
                              className="rounded-full border border-yellow-200/30 bg-yellow-300/90 px-4 py-2 text-sm font-bold text-black transition hover:bg-yellow-200 active:scale-95"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={stopEdit}
                              disabled={isBusy || !serverOnline}
                              className="rounded-full bg-white/5 px-3 py-2 text-sm font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
                              aria-label="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendario Modal (Portaled o Overlay) */}
      <CalendarPickerModal
        open={calOpen}
        value={calTarget === "edit" ? editDate : newDate}
        onSelect={onPickCalendar}
        onClose={() => setCalOpen(false)}
        title={calTarget === "edit" ? "Cambiar fecha" : "Fecha de visionado"}
      />
    </div>
  );
}
