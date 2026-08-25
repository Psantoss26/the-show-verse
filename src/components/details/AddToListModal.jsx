"use client";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

import { useMemo } from "react";
import Link from "next/link";
import {
  X,
  Plus,
  Minus,
  Check,
  ArrowUpRight,
  Loader2,
  Search,
  ListPlus,
  FileText,
} from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";

export default function AddToListModal(props) {
  const {
    open = false,
    onClose = () => {},

    lists = [],
    loading = false,
    error = "",

    query = "",
    setQuery = () => {},

    membershipMap = {},
    busyListId = null,
    onAddToList = () => {},
    onRemoveFromList = null,

    creating = false,
    createOpen = false,
    setCreateOpen = () => {},

    newName = "",
    setNewName = () => {},
    newDesc = "",
    setNewDesc = () => {},

    onCreateList = () => {},
  } = props || {};

  // Normaliza ID de lista (importante para que membershipMap encaje siempre)
  const getListId = (l) => {
    const id = l?.id ?? l?._id ?? l?.ids?.trakt ?? l?.slug ?? l?.name;
    return id != null ? String(id) : null;
  };

  // Bloquea scroll de fondo + cierra con Escape mientras el modal está abierto.
  useModalGuard({ open, onClose });

  // Manejo de errores seguro
  const safeError = useMemo(() => {
    const msg =
      typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "";
    if (msg.includes("NEXT_PUBLIC_TMDB_API_KEY")) return "";
    return msg;
  }, [error]);

  // Filtrado local
  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    const arr = Array.isArray(lists) ? lists : [];
    if (!q) return arr;
    return arr.filter((l) => (l?.name || "").toLowerCase().includes(q));
  }, [lists, query]);

  // Listas donde YA está añadida (para mostrar arriba del modal)
  const addedLists = useMemo(() => {
    const arr = Array.isArray(lists) ? lists : [];
    if (!arr.length) return [];
    const map = membershipMap || {};
    return arr.filter((l) => {
      const id = getListId(l);
      return id && !!map[id];
    });
  }, [lists, membershipMap]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}>
        {/* Header */}
        <div className="flex w-full items-center justify-between p-6 sm:px-8 sm:pt-8 sm:pb-6 bg-white/[0.025] shrink-0">
          <div>
            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
              Añadir a una lista
            </h3>
            <p className="text-xs text-zinc-500 mt-1 font-medium tracking-wide uppercase">
              Gestiona tu colección
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:px-8 pb-8 space-y-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* Resumen: ya está en... */}
          {addedLists.length > 0 && (
            <div className="rounded-2xl bg-emerald-500/[0.04] p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                Ya está añadida en {addedLists.length}{" "}
                {addedLists.length === 1 ? "lista" : "listas"}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {addedLists.slice(0, 6).map((l) => {
                  const id = getListId(l);
                  return (
                    <span
                      key={id || l?.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-black/20 px-2.5 py-1 text-[11px] font-bold text-emerald-100"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span className="max-w-[220px] truncate">
                        {l?.name || "Lista"}
                      </span>
                    </span>
                  );
                })}
                {addedLists.length > 6 && (
                  <span className="text-[11px] font-bold text-emerald-200/80 px-2 py-1">
                    +{addedLists.length - 6}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Crear lista */}
          <div className="space-y-3">
            {!createOpen ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.02]
                           text-zinc-400 text-sm font-bold hover:bg-white/[0.05] hover:text-white transition-all group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400/70"
              >
                <div className="p-1 rounded-md bg-white/5 group-hover:bg-yellow-500 group-hover:text-black transition-colors">
                  <Plus className="w-4 h-4" />
                </div>
                Crear nueva lista
              </button>
            ) : (
              <div className="rounded-2xl bg-white/[0.03] p-4 space-y-4 animate-in slide-in-from-top-2 fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Nueva Lista
                  </span>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="text-xs text-zinc-500 hover:text-white transition"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="space-y-3">
                  <input
                    value={newName ?? ""}
                    onChange={(e) => setNewName?.(e.target.value)}
                    placeholder="Nombre de la lista"
                    maxLength={60}
                    className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:ring-2 focus:ring-yellow-500/50 focus:bg-black/60 transition"
                    autoFocus
                  />

                  <input
                    value={newDesc ?? ""}
                    onChange={(e) => setNewDesc?.(e.target.value)}
                    placeholder="Descripción (opcional)"
                    maxLength={120}
                    className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:focus:bg-black/60 transition"
                  />

                  <button
                    type="button"
                    onClick={onCreateList}
                    disabled={creating || !String(newName || "").trim()}
                    className={[
                      "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
                      creating || !String(newName || "").trim()
                        ? "bg-white/5 text-zinc-500 cursor-not-allowed"
                        : "bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)] active:scale-95",
                    ].join(" ")}
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ListPlus className="w-4 h-4" />
                    )}
                    Crear lista
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Buscador + listado */}
          <div className="space-y-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-white transition-colors" />
              <input
                value={query ?? ""}
                onChange={(e) => setQuery?.(e.target.value)}
                placeholder="Buscar en tus listas..."
                className="w-full rounded-xl bg-black/40 pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:focus:bg-black/60 transition"
              />
            </div>

            {!!safeError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
                {safeError}
              </div>
            )}

            {loading && (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                <span className="text-xs font-medium">Cargando listas...</span>
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="py-10 flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.01]">
                <FileText className="w-8 h-8 text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-400 font-medium">
                  No se encontraron listas
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  Intenta con otro nombre o crea una nueva.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {filtered.map((l) => {
                const id = getListId(l);
                if (!id) return null;

                const present = !!membershipMap?.[id];
                const busy = String(busyListId ?? "") === id;
                const canRemove = typeof onRemoveFromList === "function";
                const actionLabel = present
                  ? `Quitar de ${l?.name || "la lista"}`
                  : `Añadir a ${l?.name || "la lista"}`;

                return (
                  <div
                    key={id}
                    className={[
                      "w-full relative overflow-hidden rounded-2xl transition-all duration-300",
                      "flex items-center justify-between gap-4 text-left",
                      present
                        ? "bg-emerald-500/[0.03] hover:bg-emerald-500/[0.05]"
                        : "bg-white/[0.02] hover:bg-white/[0.06] ",
                    ].join(" ")}
                  >
                    <Link
                      href={`/lists/${encodeURIComponent(id)}`}
                      onClick={onClose}
                      aria-label={`Abrir lista ${l?.name || "Sin nombre"}`}
                      className="group/list min-w-0 flex-1 p-4 pr-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white/70"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div
                          className={[
                            "truncate font-bold transition-colors",
                            present
                              ? "text-emerald-100 group-hover/list:text-white"
                              : "text-zinc-200 group-hover/list:text-white",
                          ].join(" ")}
                        >
                          {l?.name || "Sin nombre"}
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-[color,transform] group-hover/list:-translate-y-0.5 group-hover/list:translate-x-0.5 group-hover/list:text-white" />
                      </div>

                      <div className="text-xs text-zinc-500 mt-1 truncate pr-4">
                        {l?.description || "Sin descripción"}
                      </div>

                      <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-zinc-400 ">
                        {typeof l?.item_count === "number"
                          ? `${l.item_count} ITEMS`
                          : "—"}
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        if (busy) return;
                        if (present) {
                          if (canRemove) onRemoveFromList(id);
                          return;
                        }
                        onAddToList(id);
                      }}
                      disabled={busy || (present && !canRemove)}
                      aria-pressed={present}
                      aria-label={actionLabel}
                      className="group/action mr-4 shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 disabled:pointer-events-none"
                    >
                      <div
                        className={[
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                          busy
                            ? "bg-white/5 "
                            : present
                              ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)] group-hover/action:bg-red-500 group-hover/action:text-white group-hover/action:shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                              : "bg-transparent text-zinc-500 group-hover/action:text-yellow-500 group-hover/action:bg-yellow-500/10",
                        ].join(" ")}
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                        ) : present ? (
                          <span className="relative flex h-5 w-5 items-center justify-center">
                            <Check className="absolute h-5 w-5 transition-opacity group-hover/action:opacity-0" />
                            <Minus className="absolute h-5 w-5 opacity-0 transition-opacity group-hover/action:opacity-100" />
                          </span>
                        ) : (
                          <Plus className="w-5 h-5" />
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
