"use client";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, Calendar, Pencil, Trash2, AlertTriangle } from "lucide-react";
import useModalGuard from "@/hooks/useModalGuard";

export default function TraktCommentModal({
  open,
  onClose,
  onSubmit,
  onUpdate,
  onDelete,
  title,
  myComments = [],
}) {
  const [commentText, setCommentText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // States for Editing and Deleting comments
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState(new Set());

  const textareaRef = useRef(null);

  // Bloquea scroll de fondo + cierra con Escape mientras el modal está abierto.
  useModalGuard({ open, onClose });

  // Reset fields on modal open
  useEffect(() => {
    if (!open) return;

    setCommentText("");
    setIsSpoiler(false);
    setError("");
    setEditingCommentId(null);
    setDeletingCommentId(null);
    setConfirmDeleteId(null);
    setRevealedSpoilers(new Set());
  }, [open]);

  // Focus textarea on desktop when modal opens
  useEffect(() => {
    if (open && typeof window !== "undefined" && window.innerWidth >= 640 && !editingCommentId) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, editingCommentId]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanComment = commentText.trim();
    // Única condición: que haya algo escrito. Ya no hay mínimo de palabras.
    if (!cleanComment) return;

    setSubmitting(true);
    setError("");

    try {
      if (editingCommentId) {
        if (onUpdate) {
          await onUpdate({ commentId: editingCommentId, comment: cleanComment, spoiler: isSpoiler });
        }
        setEditingCommentId(null);
      } else {
        if (onSubmit) {
          await onSubmit({ comment: cleanComment, spoiler: isSpoiler });
        }
      }
      setCommentText("");
      setIsSpoiler(false);
    } catch (err) {
      setError(err?.message || "Error al enviar el comentario");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (commentItem) => {
    setEditingCommentId(commentItem.id);
    setCommentText(commentItem.comment || "");
    setIsSpoiler(commentItem.spoiler || false);
    setError("");
    // Focus the textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setCommentText("");
    setIsSpoiler(false);
    setError("");
  };

  const handleConfirmDelete = async (commentId) => {
    setDeletingCommentId(commentId);
    setError("");
    try {
      if (onDelete) {
        await onDelete({ commentId });
      }
      if (confirmDeleteId === commentId) {
        setConfirmDeleteId(null);
      }
    } catch (err) {
      setError(err?.message || "Error al eliminar el comentario");
    } finally {
      setDeletingCommentId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 h-[100dvh] z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className={`relative w-full max-w-xl flex flex-col max-h-[90dvh] sm:max-h-[90vh] overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL} animate-in zoom-in-95 duration-300 ease-out`}>
        {/* Header */}
        <div className="flex w-full items-center justify-between px-5 py-4 sm:px-6 sm:py-6 bg-white/[0.025] shrink-0">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
              {editingCommentId ? "Editar reseña" : "Escribir reseña"}
            </h3>
            <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1 font-medium tracking-wide uppercase">
              {title || "Trakt.tv"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Scrollable Content (Form + Previous Comments) */}
        <div className="flex-1 overflow-y-auto sv-scroll">
          <div className="px-5 py-5 sm:px-6 sm:py-6 space-y-5 sm:space-y-6">
            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
              {/* Sin el aviso del mínimo, esta fila solo tiene algo que decir
                  mientras se edita. Va CONDICIONAL y no como fila vacía: el
                  `space-y-4` del formulario le reservaría su hueco igualmente y
                  el campo aparecería hundido sin motivo. */}
              {editingCommentId && (
                <div className="text-xs font-bold text-zinc-400">
                  Modificando tu comentario
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Escribe tu reseña o comentario aquí..."
                className="w-full min-h-[160px] sm:min-h-[240px] rounded-2xl bg-black/30 p-3.5 sm:p-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none transition"
                disabled={submitting}
              />

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Custom Spoiler Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsSpoiler(!isSpoiler)}
                  disabled={submitting}
                  className={`flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 select-none cursor-pointer ${
                    isSpoiler
                      ? "bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 ${
                      isSpoiler ? "bg-rose-500 scale-125" : "bg-zinc-500"
                    }`}
                  />
                  <span>Contiene spoilers</span>
                </button>

                {/* Submit / Cancel buttons */}
                <div className="flex items-center justify-end flex-1 sm:flex-none gap-2 sm:gap-3">
                  {editingCommentId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={submitting}
                      className="rounded-xl bg-white/5 hover:bg-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 text-[11px] sm:text-xs font-bold text-zinc-300 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}

                  <button
                    type="submit"
                    // Se sigue impidiendo publicar en vacío, que es lo que
                    // rechaza `handleSubmit`; el mínimo de palabras ya no.
                    disabled={submitting || !commentText.trim()}
                    className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500 px-4 py-2 sm:px-6 sm:py-2.5 text-[11px] sm:text-xs font-bold text-white transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(249,115,22,0.3)]"
                  >
                    {submitting && <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin text-white" />}
                    <span>{editingCommentId ? "Guardar" : "Publicar"}</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Previous Comments Section */}
            {myComments && myComments.length > 0 && (
              <div className="border-t border-white/10 pt-6 space-y-4">
                <h4 className="text-xs font-black text-zinc-400 tracking-wider uppercase">
                  Mis opiniones anteriores ({myComments.length})
                </h4>
                <div className="space-y-4">
                  {myComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="relative group overflow-hidden rounded-2xl bg-white/5 p-4 transition-all duration-300 hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-xs text-zinc-400 font-medium">
                            {new Date(comment.created_at).toLocaleDateString("es-ES", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          {comment.spoiler && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 border border-rose-500/30 text-rose-400 uppercase tracking-wider">
                              Spoiler
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {confirmDeleteId === comment.id ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-1 duration-200 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl">
                              <span className="text-[11px] font-bold text-rose-300 mr-1">¿Eliminar?</span>
                              <button
                                type="button"
                                onClick={() => handleConfirmDelete(comment.id)}
                                disabled={deletingCommentId === comment.id}
                                className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:bg-zinc-800 text-[10px] font-black text-white transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                              >
                                {deletingCommentId === comment.id ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : null}
                                <span>Sí</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={deletingCommentId === comment.id}
                                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-zinc-300 transition-all cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            // MISMOS BOTONES QUE EL HISTORIAL DE VISIONADO: solo
                            // icono, redondos y en gris tenue, con el color
                            // apareciendo al pasar por encima. Antes eran
                            // píldoras con rótulo ("Editar" / "Eliminar"), que
                            // pesaban mucho más en una fila que ya lleva fecha
                            // y etiqueta de spoiler.
                            //
                            // El rótulo desaparece, así que el nombre accesible
                            // pasa a `aria-label`: `title` solo produce el
                            // globo del ratón y no siempre lo anuncian los
                            // lectores de pantalla.
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(comment)}
                                className="rounded-full p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                                aria-label="Editar"
                                title="Editar reseña"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(comment.id)}
                                className="rounded-full p-2 text-white/45 transition hover:bg-red-500/15 hover:text-red-300"
                                aria-label="Eliminar"
                                title="Eliminar reseña"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Comment text */}
                      <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {comment.spoiler && !revealedSpoilers.has(comment.id) ? (
                          <div className="relative overflow-hidden rounded-xl bg-black/40 p-4 text-center mt-2">
                            <p className="text-xs text-rose-400 font-bold mb-2 flex items-center justify-center gap-1.5">
                              <AlertTriangle className="w-4 h-4" />
                              Esta reseña contiene spoilers
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setRevealedSpoilers((prev) => {
                                  const next = new Set(prev);
                                  next.add(comment.id);
                                  return next;
                                });
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition cursor-pointer"
                            >
                              Mostrar reseña
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1">
                            {comment.comment}
                            {comment.spoiler && revealedSpoilers.has(comment.id) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRevealedSpoilers((prev) => {
                                    const next = new Set(prev);
                                    next.delete(comment.id);
                                    return next;
                                  });
                                }}
                                className="block text-[11px] text-zinc-500 hover:text-zinc-400 mt-2 font-medium underline cursor-pointer"
                              >
                                Ocultar spoilers
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
