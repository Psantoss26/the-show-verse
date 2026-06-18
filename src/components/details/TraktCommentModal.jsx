"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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

  // Visual viewport tracking for mobile keyboard avoidance
  const [vpTop, setVpTop] = useState(0);
  const [vpHeight, setVpHeight] = useState("100dvh");

  const textareaRef = useRef(null);

  // --- visualViewport API: reposiciona el modal cuando sube el teclado ---
  const syncViewport = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    setVpTop(Math.round(vv.offsetTop));
    setVpHeight(Math.round(vv.height));
  }, []);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    syncViewport();
    vv.addEventListener("resize", syncViewport);
    vv.addEventListener("scroll", syncViewport);
    return () => {
      vv.removeEventListener("resize", syncViewport);
      vv.removeEventListener("scroll", syncViewport);
    };
  }, [open, syncViewport]);

  // Lock body scroll when open and reset state
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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
      className="fixed inset-0 z-[9999] overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop — cubre todo el viewport de layout */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-lg transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      {/*
        Contenedor posicionado según visualViewport para móvil.
        Cuando el teclado sube, vpTop y vpHeight se actualizan y el modal
        sube automáticamente quedando siempre visible.
        En sm+ (≥640 px) se ignoran los estilos inline y usa el layout centrado de Tailwind.
      */}
      <div
        className="absolute left-0 right-0 flex flex-col items-stretch justify-end sm:inset-0 sm:items-center sm:justify-center sm:p-4"
        style={{ top: vpTop, height: vpHeight }}
      >
        {/* Modal Card */}
        <div
          className="
            relative w-full flex flex-col
            max-h-[90%] overflow-hidden
            rounded-t-[2rem] rounded-b-none
            sm:max-w-xl sm:max-h-[85vh]
            sm:rounded-[3rem]
            border border-white/10
            bg-black/40 bg-gradient-to-br from-white/10 to-white/5
            shadow-2xl backdrop-blur-2xl
            animate-in slide-in-from-bottom-4 sm:zoom-in-95
            duration-300 ease-out
          "
        >
          {/* Handle bar — solo móvil */}
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="flex w-full items-center justify-between px-5 py-3 sm:px-6 sm:py-6 border-b border-white/10 shrink-0">
            <div>
              <h3 className="text-base sm:text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400">
                {editingCommentId ? "Editar reseña" : "Escribir reseña"}
              </h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 font-medium tracking-wide uppercase">
                {title || "Trakt.tv"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition shadow-sm cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto sv-scroll overscroll-contain">
            <div className="px-5 py-4 sm:px-6 sm:py-6 space-y-4 sm:space-y-6">
              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col space-y-3 sm:space-y-4">
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
                  /* min-h reducido en móvil para que quepan los botones con el teclado abierto */
                  className="w-full min-h-[72px] sm:min-h-[120px] rounded-2xl bg-black/30 border border-white/10 p-3 sm:p-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 resize-none transition"
                  disabled={submitting}
                />

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium text-center">
                    {error}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                  {/* Spoiler Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsSpoiler(!isSpoiler)}
                    disabled={submitting}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold transition-all duration-300 select-none cursor-pointer ${
                      isSpoiler
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                        : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all duration-300 ${
                        isSpoiler ? "bg-rose-500 scale-125" : "bg-zinc-500"
                      }`}
                    />
                    <span>Contiene spoilers</span>
                  </button>

                  {/* Word count & Submit / Cancel */}
                  <div className="flex items-center justify-end flex-1 sm:flex-none gap-2 sm:gap-3">
                    {commentText.trim() && (
                      <span className={`text-[10px] sm:text-[11px] font-bold ${
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
                        className="rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 text-[11px] sm:text-xs font-bold text-zinc-300 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={submitting || wordCount < 5}
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
                <div className="border-t border-white/10 pt-5 sm:pt-6 space-y-4">
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
    </div>
  );
}
