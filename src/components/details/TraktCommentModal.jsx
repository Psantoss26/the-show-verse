"use client";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, Calendar, Pencil, Trash2, AlertTriangle } from "lucide-react";

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

  // Lock body scroll when open and reset state
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Reset fields on modal open
    setCommentText("");
    setIsSpoiler(false);
    setError("");
    setEditingCommentId(null);
    setDeletingCommentId(null);
    setConfirmDeleteId(null);
    setRevealedSpoilers(new Set());

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const wordCount = commentText.trim().split(/\s+/).filter(Boolean).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanComment = commentText.trim();
    if (!cleanComment) return;
    if (wordCount < 5) {
      setError("El comentario debe tener al menos 5 palabras.");
      return;
    }

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden rounded-[3rem] border border-white/10 bg-black/40 bg-gradient-to-br from-white/10 to-white/5 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-300 ease-out">
        {/* Header */}
        <div className="flex w-full items-center justify-between px-6 py-6 sm:pt-8 sm:pb-6 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
              {editingCommentId ? "Editar reseña" : "Escribir reseña"}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 font-medium tracking-wide uppercase">
              {title || "Trakt.tv"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content (Form + Previous Comments) */}
        <div className="flex-1 overflow-y-auto sv-scroll">
          <div className="px-6 py-6 space-y-6">
            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-400">
                <span>{editingCommentId ? "Modificando tu comentario" : "Tu opinión en Trakt"}</span>
                <span className="text-zinc-500">Mínimo 5 palabras</span>
              </div>

              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Escribe tu reseña o comentario aquí..."
                className="w-full min-h-[120px] rounded-2xl bg-black/30 border border-white/10 p-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 resize-none transition"
                disabled={submitting}
                autoFocus
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
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all duration-300 select-none cursor-pointer ${
                    isSpoiler
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                      : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      isSpoiler ? "bg-rose-500 scale-125" : "bg-zinc-500"
                    }`}
                  />
                  <span>Contiene spoilers</span>
                </button>

                {/* Word count & Submit / Cancel buttons */}
                <div className="flex items-center gap-3">
                  {commentText.trim() && (
                    <span className={`text-[11px] font-bold ${
                      wordCount < 5 ? "text-rose-400" : "text-emerald-400"
                    }`}>
                      {wordCount} / 5 palabras
                    </span>
                  )}

                  {editingCommentId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      disabled={submitting}
                      className="rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2.5 text-xs font-bold text-zinc-300 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || wordCount < 5}
                    className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-500 px-6 py-2.5 text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(249,115,22,0.3)]"
                  >
                    {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />}
                    <span>{editingCommentId ? "Guardar cambios" : "Publicar"}</span>
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
                      className="relative group overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-4 transition-all duration-300 hover:border-white/20 hover:bg-white/10"
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
                            <div className="flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(comment)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-300 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-300 transition-all cursor-pointer"
                                title="Editar reseña"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(comment.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-300 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-300 transition-all cursor-pointer"
                                title="Eliminar reseña"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Eliminar</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Comment text */}
                      <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {comment.spoiler && !revealedSpoilers.has(comment.id) ? (
                          <div className="relative overflow-hidden rounded-xl bg-black/40 border border-white/5 p-4 text-center mt-2">
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
